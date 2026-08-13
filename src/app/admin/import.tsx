import * as DocumentPicker from 'expo-document-picker';
import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AdminChrome } from '@/components/admin-chrome';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { GRADE_OPTIONS, parseGradeText } from '@/lib/class-groups';
import { confirmAction } from '@/lib/confirm';
import { normalizePhone } from '@/lib/phone';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/hooks/use-theme';

const TEMPLATE_HEADERS = [
  'Child Full Name',
  'Child Grade',
  'Guardian Full Name',
  'Guardian Phone',
  'Relationship',
];

type ParsedChild = { key: string; fullName: string; gradeCode: string };
type ParsedGuardian = { key: string; fullName: string; phone: string; existingId: string | null };
type ParsedLink = { childKey: string; guardianKey: string; relationship: string };
type RowError = { rowNumber: number; reason: string };
type ImportSummary = {
  children_created: number;
  guardians_created: number;
  guardians_reused: number;
  links_created: number;
};

// Sheets get filled in by hand, so headers won't always match exactly —
// match case/whitespace-insensitively and accept a couple common aliases.
function getField(row: Record<string, unknown>, ...candidates: string[]): string {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(row)) {
    normalized[key.trim().toLowerCase()] = value == null ? '' : String(value).trim();
  }
  for (const candidate of candidates) {
    const value = normalized[candidate.toLowerCase()];
    if (value) return value;
  }
  return '';
}

// normalizePhone() alone doesn't bound length the way formatPhoneInput()
// does for hand-typed numbers in the app's own forms (which cap at 10
// digits) — a sheet entry like "1-555-123-4567" would otherwise normalize
// to 11 digits and never match an existing guardian stored as 10, creating
// a duplicate instead of reusing them. Keep only the last 10 digits, which
// drops a leading US country code (1) the same way a typed phone never has
// one to begin with.
function phoneDedupeKey(raw: string): string {
  const digits = normalizePhone(raw);
  return digits.length > 10 ? digits.slice(-10) : digits;
}

export default function AdminImportScreen() {
  const theme = useTheme();
  const { isMainAdmin } = useAuth();

  const [step, setStep] = useState<'upload' | 'preview' | 'importing' | 'done'>('upload');
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<RowError[]>([]);

  const [children, setChildren] = useState<ParsedChild[]>([]);
  const [guardians, setGuardians] = useState<ParsedGuardian[]>([]);
  const [links, setLinks] = useState<ParsedLink[]>([]);

  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  const [templateDownloading, setTemplateDownloading] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);

  function reset() {
    setStep('upload');
    setParseError(null);
    setRowErrors([]);
    setChildren([]);
    setGuardians([]);
    setLinks([]);
    setImportError(null);
    setSummary(null);
  }

  async function downloadTemplate() {
    setTemplateError(null);
    setTemplateDownloading(true);
    try {
      await downloadTemplateFile();
    } catch (err) {
      console.error('template download failed', err);
      setTemplateError(err instanceof Error ? err.message : 'Could not generate the template file.');
    } finally {
      setTemplateDownloading(false);
    }
  }

  async function downloadTemplateFile() {
    const XLSX = await import('xlsx');
    const data = [
      {
        'Child Full Name': 'Jamie Smith',
        'Child Grade': '2nd Grade',
        'Guardian Full Name': 'Alex Smith',
        'Guardian Phone': '555-123-4567',
        Relationship: 'Mother',
      },
    ];
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Import');

    if (Platform.OS === 'web') {
      XLSX.writeFile(workbook, 'family-import-template.xlsx');
      return;
    }

    const { File, Paths } = await import('expo-file-system');
    const base64 = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });
    const file = new File(Paths.cache, 'family-import-template.xlsx');
    if (file.exists) file.delete();
    file.create();
    file.write(base64, { encoding: 'base64' });

    const Sharing = await import('expo-sharing');
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(file.uri);
    }
  }

  async function handlePickFile() {
    setParseError(null);
    setRowErrors([]);
    setParsing(true);

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
          'text/csv',
        ],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) {
        setParsing(false);
        return;
      }

      const asset = result.assets[0];
      const base64 =
        asset.base64 ??
        (await (async () => {
          const { File } = await import('expo-file-system');
          return new File(asset.uri).base64();
        })());

      const XLSX = await import('xlsx');
      const workbook = XLSX.read(base64, { type: 'base64' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

      if (rows.length === 0) {
        setParseError('That file has no rows to import.');
        setParsing(false);
        return;
      }

      await processRows(rows);
    } catch (err) {
      console.error('import file parse failed', err);
      setParseError('Could not read that file. Make sure it is a .xlsx or .csv file.');
    } finally {
      setParsing(false);
    }
  }

  async function processRows(rows: Record<string, unknown>[]) {
    const errors: RowError[] = [];
    const childMap = new Map<string, ParsedChild>();
    const guardianMap = new Map<string, { fullName: string; phone: string }>();
    const linkList: ParsedLink[] = [];
    const seenLinkKeys = new Set<string>();

    rows.forEach((row, index) => {
      const rowNumber = index + 2; // header is row 1
      const childName = getField(row, 'Child Full Name', 'Child Name', 'Student Name');
      const gradeRaw = getField(row, 'Child Grade', 'Grade');
      const guardianName = getField(
        row,
        'Guardian Full Name',
        'Guardian Name',
        'Parent Full Name',
        'Parent Name',
      );
      const guardianPhone = getField(row, 'Guardian Phone', 'Phone', 'Parent Phone');
      const relationship = getField(row, 'Relationship') || 'Guardian';

      if (!childName) {
        errors.push({ rowNumber, reason: 'Missing child name.' });
        return;
      }
      const gradeCode = parseGradeText(gradeRaw);
      if (!gradeCode) {
        errors.push({
          rowNumber,
          reason: gradeRaw ? `Could not recognize grade "${gradeRaw}".` : 'Missing child grade.',
        });
        return;
      }
      if (!guardianName) {
        errors.push({ rowNumber, reason: 'Missing guardian name.' });
        return;
      }
      const phoneDigits = phoneDedupeKey(guardianPhone);
      if (!phoneDigits) {
        errors.push({ rowNumber, reason: 'Missing guardian phone.' });
        return;
      }

      const childKey = `${childName.trim().toLowerCase()}|${gradeCode}`;
      if (!childMap.has(childKey)) {
        childMap.set(childKey, { key: childKey, fullName: childName, gradeCode });
      }
      if (!guardianMap.has(phoneDigits)) {
        guardianMap.set(phoneDigits, { fullName: guardianName, phone: guardianPhone });
      }

      // Skip an exact duplicate link (same child + same guardian) — a common
      // copy-paste accident shouldn't create two identical
      // child_guardians rows for the same relationship.
      const linkKey = `${childKey}::${phoneDigits}`;
      if (!seenLinkKeys.has(linkKey)) {
        seenLinkKeys.add(linkKey);
        linkList.push({ childKey, guardianKey: phoneDigits, relationship });
      }
    });

    setRowErrors(errors);

    if (childMap.size === 0) {
      setParseError('No valid rows found — every row had a problem. Check the errors below.');
      return;
    }

    const { data: existingGuardians, error: existingError } = await supabase
      .from('guardians')
      .select('id, phone');

    if (existingError) {
      console.error('guardians lookup failed', existingError);
      setParseError('Could not check for existing guardians. Please try again.');
      return;
    }

    const existingByPhone = new Map(
      (existingGuardians ?? [])
        .filter((g) => g.phone)
        .map((g) => [phoneDedupeKey(g.phone as string), g.id as string]),
    );

    const guardianList: ParsedGuardian[] = [...guardianMap.entries()].map(([key, g]) => ({
      key,
      fullName: g.fullName,
      phone: g.phone,
      existingId: existingByPhone.get(key) ?? null,
    }));

    setChildren([...childMap.values()]);
    setGuardians(guardianList);
    setLinks(linkList);
    setStep('preview');
  }

  function confirmImport() {
    const newGuardianCount = guardians.filter((g) => !g.existingId).length;
    confirmAction(
      'Import Families',
      `This will create ${children.length} ${children.length === 1 ? 'child' : 'children'} and ${newGuardianCount} new guardian${newGuardianCount === 1 ? '' : 's'}, with ${links.length} guardian-child link${links.length === 1 ? '' : 's'}. Continue?`,
      'Import',
      handleImport,
    );
  }

  async function handleImport() {
    setImportError(null);
    setImporting(true);
    setStep('importing');

    const payload = {
      children: children.map((c) => ({ key: c.key, full_name: c.fullName, grade: c.gradeCode })),
      guardians: guardians.map((g) => ({ key: g.key, full_name: g.fullName, phone: g.phone })),
      links: links.map((l) => ({
        child_key: l.childKey,
        guardian_key: l.guardianKey,
        relationship: l.relationship,
      })),
    };

    const { data, error } = await supabase.rpc('bulk_import_families', { p_payload: payload });

    if (error || !data) {
      console.error('bulk import failed', error);
      setImportError('Something went wrong during the import. Nothing was saved — please try again.');
      setImporting(false);
      setStep('preview');
      return;
    }

    setSummary(data as ImportSummary);
    setImporting(false);
    setStep('done');
  }

  if (!isMainAdmin) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <AdminChrome />
          <ThemedText themeColor="textSecondary" style={styles.centerText}>
            Only main admins can access this page.
          </ThemedText>
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <AdminChrome />

        <ThemedText type="title" style={styles.title}>
          Import Families
        </ThemedText>

        {step === 'upload' && (
          <ScrollView contentContainerStyle={styles.list}>
            <ThemedText themeColor="textSecondary">
              Upload a spreadsheet to add many parents and children at once — useful for initial
              setup. One row per child-guardian pair; if a child has two guardians, or a guardian
              has multiple children, just repeat that name on another row. If two different
              children share the exact same name and grade, add a middle initial or nickname to
              one of them so they don't get merged into a single child (e.g. "Emma R. Johnson").
            </ThemedText>

            <ThemedView type="backgroundElement" style={styles.templateBox}>
              <ThemedText type="smallBold">Expected columns</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {TEMPLATE_HEADERS.join(' · ')}
              </ThemedText>
              <Pressable onPress={downloadTemplate} disabled={templateDownloading} style={styles.templateLink}>
                {templateDownloading ? (
                  <ActivityIndicator color={theme.text} />
                ) : (
                  <ThemedText type="link">Download a blank template</ThemedText>
                )}
              </Pressable>
              {templateError && <ThemedText style={styles.error}>{templateError}</ThemedText>}
            </ThemedView>

            {parseError && <ThemedText style={styles.error}>{parseError}</ThemedText>}

            <Pressable
              onPress={handlePickFile}
              disabled={parsing}
              style={({ pressed }) => [
                styles.button,
                { backgroundColor: theme.text, opacity: pressed || parsing ? 0.6 : 1 },
              ]}>
              {parsing ? (
                <ActivityIndicator color={theme.background} />
              ) : (
                <ThemedText style={[styles.buttonText, { color: theme.background }]}>
                  Choose File to Import
                </ThemedText>
              )}
            </Pressable>

            {rowErrors.length > 0 && (
              <ThemedView style={styles.list}>
                <ThemedText type="smallBold" style={styles.error}>
                  {rowErrors.length} row{rowErrors.length === 1 ? '' : 's'} skipped from the last
                  file:
                </ThemedText>
                {rowErrors.map((e) => (
                  <ThemedText key={e.rowNumber} type="small" themeColor="textSecondary">
                    Row {e.rowNumber}: {e.reason}
                  </ThemedText>
                ))}
              </ThemedView>
            )}
          </ScrollView>
        )}

        {step === 'preview' && (
          <ScrollView contentContainerStyle={styles.list}>
            <Pressable onPress={reset} style={styles.backLink}>
              <ThemedText type="link">{'< Choose a different file'}</ThemedText>
            </Pressable>

            <ThemedView type="backgroundElement" style={styles.summaryBox}>
              <ThemedText>
                {children.length} {children.length === 1 ? 'child' : 'children'}
              </ThemedText>
              <ThemedText>
                {guardians.length} {guardians.length === 1 ? 'guardian' : 'guardians'} (
                {guardians.filter((g) => !g.existingId).length} new,{' '}
                {guardians.filter((g) => g.existingId).length} already in the system)
              </ThemedText>
              <ThemedText>
                {links.length} guardian-child link{links.length === 1 ? '' : 's'}
              </ThemedText>
            </ThemedView>

            {rowErrors.length > 0 && (
              <ThemedView style={styles.list}>
                <ThemedText type="smallBold" style={styles.error}>
                  {rowErrors.length} row{rowErrors.length === 1 ? '' : 's'} will be skipped:
                </ThemedText>
                {rowErrors.map((e) => (
                  <ThemedText key={e.rowNumber} type="small" themeColor="textSecondary">
                    Row {e.rowNumber}: {e.reason}
                  </ThemedText>
                ))}
              </ThemedView>
            )}

            <ThemedText type="smallBold" style={styles.sectionLabel}>
              Children
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Double-check anyone linked to guardians who don't look related — that usually means
              two different children with the same name and grade got merged into one.
            </ThemedText>
            {children.map((c) => {
              const guardianNames = links
                .filter((l) => l.childKey === c.key)
                .map((l) => guardians.find((g) => g.key === l.guardianKey)?.fullName ?? 'Unknown')
                .join(', ');
              return (
                <ThemedText key={c.key} type="small" themeColor="textSecondary">
                  {c.fullName} — {GRADE_OPTIONS.find((g) => g.value === c.gradeCode)?.label ?? c.gradeCode}
                  {guardianNames ? ` — guardians: ${guardianNames}` : ''}
                </ThemedText>
              );
            })}

            <ThemedText type="smallBold" style={styles.sectionLabel}>
              Guardians
            </ThemedText>
            {guardians.map((g) => (
              <ThemedText key={g.key} type="small" themeColor="textSecondary">
                {g.fullName} — {g.phone} {g.existingId ? '(already in system)' : '(new)'}
              </ThemedText>
            ))}

            {importError && <ThemedText style={styles.error}>{importError}</ThemedText>}

            <Pressable
              onPress={confirmImport}
              style={({ pressed }) => [
                styles.button,
                { backgroundColor: theme.text, opacity: pressed ? 0.6 : 1 },
              ]}>
              <ThemedText style={[styles.buttonText, { color: theme.background }]}>
                Import {children.length} {children.length === 1 ? 'Child' : 'Children'}
              </ThemedText>
            </Pressable>
          </ScrollView>
        )}

        {step === 'importing' && (
          <ThemedView style={styles.centerFill}>
            <ActivityIndicator color={theme.text} />
            <ThemedText themeColor="textSecondary" style={styles.centerText}>
              Importing — this may take a moment for a large file.
            </ThemedText>
          </ThemedView>
        )}

        {step === 'done' && summary && (
          <ScrollView contentContainerStyle={styles.list}>
            <ThemedText type="subtitle" style={styles.centerText}>
              Import complete
            </ThemedText>
            <ThemedText style={styles.success}>
              Created {summary.children_created}{' '}
              {summary.children_created === 1 ? 'child' : 'children'}, {summary.guardians_created}{' '}
              new {summary.guardians_created === 1 ? 'guardian' : 'guardians'} (
              {summary.guardians_reused} already existed), and {summary.links_created}{' '}
              guardian-child link{summary.links_created === 1 ? '' : 's'}.
            </ThemedText>
            <Pressable
              onPress={reset}
              style={({ pressed }) => [
                styles.button,
                { backgroundColor: theme.text, opacity: pressed ? 0.6 : 1 },
              ]}>
              <ThemedText style={[styles.buttonText, { color: theme.background }]}>
                Import Another File
              </ThemedText>
            </Pressable>
          </ScrollView>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  title: {
    textAlign: 'center',
    fontSize: 32,
  },
  list: {
    gap: Spacing.two,
    paddingBottom: Spacing.five,
  },
  centerFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  centerText: {
    textAlign: 'center',
  },
  error: {
    color: '#D0342C',
  },
  success: {
    color: '#1F9254',
  },
  templateBox: {
    gap: Spacing.one,
    padding: Spacing.three,
    borderRadius: Spacing.two,
  },
  templateLink: {
    marginTop: Spacing.one,
  },
  summaryBox: {
    gap: Spacing.half,
    padding: Spacing.three,
    borderRadius: Spacing.two,
  },
  sectionLabel: {
    marginTop: Spacing.two,
  },
  backLink: {
    marginBottom: Spacing.one,
  },
  button: {
    height: 48,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.two,
  },
  buttonText: {
    fontWeight: '600',
  },
});
