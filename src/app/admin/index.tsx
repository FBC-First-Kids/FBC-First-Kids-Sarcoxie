import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AdminChrome } from '@/components/admin-chrome';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/hooks/use-theme';

type CheckinRow = {
  id: string;
  child_id: string;
  guardian_id: string | null;
  picked_up_by: string | null;
  checked_in_at: string | null;
  checked_in_by: string | null;
  checked_out_at: string | null;
  checked_out_by: string | null;
};

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export default function AdminHistoryScreen() {
  const theme = useTheme();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [checkins, setCheckins] = useState<CheckinRow[]>([]);
  const [childNames, setChildNames] = useState<Map<string, string>>(new Map());
  const [guardianNames, setGuardianNames] = useState<Map<string, string>>(new Map());
  const [staffNames, setStaffNames] = useState<Map<string, string>>(new Map());
  const [notificationReadsByGuardian, setNotificationReadsByGuardian] = useState<
    Map<string, string[]>
  >(new Map());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    loadCheckins();
  }, []);

  async function loadCheckins() {
    setLoading(true);
    setLoadError(null);

    const { data: checkinRows, error: checkinsError } = await supabase
      .from('checkins')
      .select(
        'id, child_id, guardian_id, picked_up_by, checked_in_at, checked_in_by, checked_out_at, checked_out_by',
      )
      .order('checked_in_at', { ascending: false });

    if (checkinsError || !checkinRows) {
      console.error('checkins load failed', checkinsError);
      setLoadError('Could not load check-in history.');
      setLoading(false);
      return;
    }

    const childIds = [...new Set(checkinRows.map((r) => r.child_id))];
    const guardianIds = [
      ...new Set(
        checkinRows
          .flatMap((r) => [r.guardian_id, r.picked_up_by])
          .filter((id): id is string => !!id),
      ),
    ];
    const staffIds = [
      ...new Set(
        checkinRows.flatMap((r) => [r.checked_in_by, r.checked_out_by]).filter((id): id is string => !!id),
      ),
    ];

    const [
      { data: childRows, error: childrenError },
      { data: guardianRows, error: guardiansError },
      { data: staffRows, error: staffError },
    ] = await Promise.all([
      supabase.from('children').select('id, full_name').in('id', childIds),
      supabase.from('guardians').select('id, full_name').in('id', guardianIds),
      supabase.from('staff').select('id, full_name').in('id', staffIds),
    ]);

    if (childrenError || guardiansError || staffError) {
      console.error('names load failed', childrenError, guardiansError, staffError);
      setLoadError('Could not load check-in history.');
      setLoading(false);
      return;
    }

    setChildNames(new Map((childRows ?? []).map((c) => [c.id, c.full_name])));
    setGuardianNames(new Map((guardianRows ?? []).map((g) => [g.id, g.full_name])));
    setStaffNames(new Map((staffRows ?? []).map((s) => [s.id, s.full_name])));

    if (guardianIds.length > 0) {
      const { data: readsRows, error: readsError } = await supabase
        .from('notification_reads')
        .select('guardian_id, notification_id')
        .in('guardian_id', guardianIds);

      if (readsError) {
        console.error('notification reads load failed', readsError);
      } else {
        const notificationIds = [...new Set((readsRows ?? []).map((r) => r.notification_id))];
        const { data: notifRows, error: notifError } = await supabase
          .from('notifications')
          .select('id, title')
          .in('id', notificationIds);

        if (notifError) {
          console.error('notifications load failed', notifError);
        } else {
          const titleById = new Map((notifRows ?? []).map((n) => [n.id, n.title]));
          const byGuardian = new Map<string, string[]>();
          for (const r of readsRows ?? []) {
            const title = titleById.get(r.notification_id);
            if (!title) continue;
            const list = byGuardian.get(r.guardian_id) ?? [];
            list.push(title);
            byGuardian.set(r.guardian_id, list);
          }
          setNotificationReadsByGuardian(byGuardian);
        }
      }
    }

    setCheckins(checkinRows);
    setLoading(false);
  }

  async function exportToExcel(dateLabel: string, rows: CheckinRow[]) {
    setExportError(null);
    setExporting(true);

    try {
      const XLSX = await import('xlsx');

      const data = rows.map((row) => ({
        Child: childNames.get(row.child_id) ?? 'Unknown',
        'Checked In By (Guardian)': row.guardian_id
          ? guardianNames.get(row.guardian_id) ?? 'Unknown'
          : '',
        'Checked In At': row.checked_in_at ? formatTime(row.checked_in_at) : '',
        'Checked In By (Staff)': row.checked_in_by ? staffNames.get(row.checked_in_by) ?? 'Unknown' : '',
        'Checked Out By (Guardian)': row.picked_up_by
          ? guardianNames.get(row.picked_up_by) ?? 'Unknown'
          : '',
        'Checked Out At': row.checked_out_at ? formatTime(row.checked_out_at) : '',
        'Checked Out By (Staff)': row.checked_out_by
          ? staffNames.get(row.checked_out_by) ?? 'Unknown'
          : '',
        'Notifications Read (Check-In Guardian)':
          (row.guardian_id ? notificationReadsByGuardian.get(row.guardian_id) : undefined)?.join(
            ', ',
          ) || 'None',
        'Notifications Read (Check-Out Guardian)':
          (row.picked_up_by ? notificationReadsByGuardian.get(row.picked_up_by) : undefined)?.join(
            ', ',
          ) || 'None',
      }));

      const worksheet = XLSX.utils.json_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Check-Ins');

      const filename = `checkins-${dateLabel.replace(/\//g, '-')}.xlsx`;

      if (Platform.OS === 'web') {
        XLSX.writeFile(workbook, filename);
        return;
      }

      const base64 = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });
      const file = new File(Paths.cache, filename);
      if (file.exists) file.delete();
      file.create();
      file.write(base64, { encoding: 'base64' });

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(file.uri, {
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          dialogTitle: `Check-Ins - ${dateLabel}`,
        });
      } else {
        setExportError(`Saved to ${file.uri}`);
      }
    } catch (err) {
      console.error('export failed', err);
      setExportError('Something went wrong exporting that.');
    } finally {
      setExporting(false);
    }
  }

  const dateGroups = new Map<string, CheckinRow[]>();
  for (const row of checkins) {
    const reference = row.checked_in_at ?? row.checked_out_at;
    if (!reference) continue;
    const dateKey = new Date(reference).toLocaleDateString();
    const existing = dateGroups.get(dateKey) ?? [];
    existing.push(row);
    dateGroups.set(dateKey, existing);
  }
  const dates = [...dateGroups.keys()];

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <AdminChrome />

        <ThemedText type="title" style={styles.title}>
          Check-In History
        </ThemedText>

        {loading ? (
          <ActivityIndicator style={styles.centerFill} color={theme.text} />
        ) : loadError ? (
          <ThemedText style={styles.error}>{loadError}</ThemedText>
        ) : selectedDate ? (
          <ScrollView contentContainerStyle={styles.list}>
            <Pressable onPress={() => setSelectedDate(null)} style={styles.backLink}>
              <ThemedText type="link">{'< All Dates'}</ThemedText>
            </Pressable>
            <ThemedView style={styles.dateHeadingRow}>
              <ThemedText type="subtitle">{selectedDate}</ThemedText>
              <Pressable
                onPress={() => exportToExcel(selectedDate, dateGroups.get(selectedDate) ?? [])}
                disabled={exporting}
                style={({ pressed }) => [styles.exportButton, { opacity: pressed || exporting ? 0.6 : 1 }]}>
                {exporting ? (
                  <ActivityIndicator color={theme.text} />
                ) : (
                  <ThemedText type="link">Export to Excel</ThemedText>
                )}
              </Pressable>
            </ThemedView>
            {exportError && <ThemedText style={styles.error}>{exportError}</ThemedText>}
            {(dateGroups.get(selectedDate) ?? []).map((row) => (
              <ThemedView key={row.id} type="backgroundElement" style={styles.entryRow}>
                <ThemedText style={styles.entryChild}>
                  {childNames.get(row.child_id) ?? 'Unknown child'}
                </ThemedText>
                <ThemedText themeColor="textSecondary">
                  Guardian that checked in:{' '}
                  {row.guardian_id ? guardianNames.get(row.guardian_id) ?? 'Unknown' : '—'}
                </ThemedText>
                <ThemedText themeColor="textSecondary">
                  Checked in by staff{' '}
                  {row.checked_in_by ? staffNames.get(row.checked_in_by) ?? 'Unknown' : '—'}
                  {row.checked_in_at ? ` at ${formatTime(row.checked_in_at)}` : ''}
                </ThemedText>
                <ThemedText themeColor="textSecondary" type="small">
                  Notifications read by{' '}
                  {row.guardian_id ? guardianNames.get(row.guardian_id) ?? 'this guardian' : 'this guardian'}:{' '}
                  {(row.guardian_id ? notificationReadsByGuardian.get(row.guardian_id) : undefined)?.join(
                    ', ',
                  ) || 'None'}
                </ThemedText>
                {row.checked_out_at ? (
                  <>
                    <ThemedText themeColor="textSecondary">
                      Guardian that checked out:{' '}
                      {row.picked_up_by ? guardianNames.get(row.picked_up_by) ?? 'Unknown' : 'Unknown'}
                    </ThemedText>
                    <ThemedText themeColor="textSecondary">
                      Checked out by staff{' '}
                      {row.checked_out_by ? staffNames.get(row.checked_out_by) ?? 'Unknown' : 'Unknown'}
                      {' at '}
                      {formatTime(row.checked_out_at)}
                    </ThemedText>
                    <ThemedText themeColor="textSecondary" type="small">
                      Notifications read by{' '}
                      {row.picked_up_by
                        ? guardianNames.get(row.picked_up_by) ?? 'this guardian'
                        : 'this guardian'}
                      :{' '}
                      {(row.picked_up_by
                        ? notificationReadsByGuardian.get(row.picked_up_by)
                        : undefined
                      )?.join(', ') || 'None'}
                    </ThemedText>
                  </>
                ) : (
                  <ThemedText themeColor="textSecondary">Still checked in</ThemedText>
                )}
              </ThemedView>
            ))}
          </ScrollView>
        ) : (
          <ScrollView contentContainerStyle={styles.list}>
            {dates.length === 0 ? (
              <ThemedText themeColor="textSecondary" style={styles.centerText}>
                No check-ins recorded yet.
              </ThemedText>
            ) : (
              dates.map((date) => (
                <Pressable
                  key={date}
                  onPress={() => setSelectedDate(date)}
                  style={({ pressed }) => [
                    styles.dateRow,
                    { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.7 : 1 },
                  ]}>
                  <ThemedText style={styles.dateRowText}>{date}</ThemedText>
                  <ThemedText themeColor="textSecondary">
                    {dateGroups.get(date)?.length} check-ins
                  </ThemedText>
                </Pressable>
              ))
            )}
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
  centerFill: {
    flex: 1,
  },
  centerText: {
    textAlign: 'center',
    marginTop: Spacing.five,
  },
  error: {
    color: '#D0342C',
    textAlign: 'center',
    marginTop: Spacing.five,
  },
  list: {
    gap: Spacing.two,
    paddingBottom: Spacing.five,
  },
  dateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: 56,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
  },
  dateRowText: {
    fontSize: 17,
    fontWeight: '600',
  },
  backLink: {
    marginBottom: Spacing.two,
  },
  dateHeadingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.two,
  },
  exportButton: {
    paddingHorizontal: Spacing.two,
  },
  entryRow: {
    gap: Spacing.half,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
  },
  entryChild: {
    fontSize: 17,
    fontWeight: '600',
  },
});
