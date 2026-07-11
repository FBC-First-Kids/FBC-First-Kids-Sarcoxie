import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AdminChrome } from '@/components/admin-chrome';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { classGroupForGrade, GRADE_OPTIONS } from '@/lib/class-groups';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/hooks/use-theme';

type ChildOption = {
  id: string;
  full_name: string;
  grade: string | null;
};

type GuardianOption = {
  id: string;
  full_name: string;
  relationship: string | null;
};

function generateSecurityCode() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

export default function AdminCheckinScreen() {
  const theme = useTheme();
  const { session } = useAuth();

  const [allChildren, setAllChildren] = useState<ChildOption[]>([]);
  const [loadingChildren, setLoadingChildren] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const [selectedChild, setSelectedChild] = useState<ChildOption | null>(null);
  const [linkedGuardians, setLinkedGuardians] = useState<GuardianOption[]>([]);
  const [openCheckinId, setOpenCheckinId] = useState<string | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [selectedGuardianId, setSelectedGuardianId] = useState<string | null>(null);
  const [childGrade, setChildGrade] = useState<string | null>(null);
  const [savingGrade, setSavingGrade] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    loadChildren();
  }, []);

  async function loadChildren() {
    setLoadingChildren(true);
    setLoadError(null);

    const { data, error: childrenError } = await supabase
      .from('children')
      .select('id, full_name, grade')
      .order('full_name');

    if (childrenError || !data) {
      console.error('children load failed', childrenError);
      setLoadError('Could not load children.');
      setLoadingChildren(false);
      return;
    }

    setAllChildren(data);
    setLoadingChildren(false);
  }

  async function selectChild(child: ChildOption) {
    setSelectedChild(child);
    setSelectedGuardianId(null);
    setChildGrade(child.grade);
    setError(null);
    setSuccess(null);
    setLoadingDetails(true);

    const { data: links, error: linksError } = await supabase
      .from('child_guardians')
      .select('guardian_id, relationship')
      .eq('child_id', child.id);

    if (linksError || !links) {
      console.error('child_guardians load failed', linksError);
      setLinkedGuardians([]);
    } else {
      const guardianIds = links.map((l) => l.guardian_id);
      const { data: guardians, error: guardiansError } = await supabase
        .from('guardians')
        .select('id, full_name')
        .in('id', guardianIds);

      if (guardiansError || !guardians) {
        console.error('guardians load failed', guardiansError);
        setLinkedGuardians([]);
      } else {
        const relationshipByGuardian = new Map(links.map((l) => [l.guardian_id, l.relationship]));
        setLinkedGuardians(
          guardians.map((g) => ({
            id: g.id,
            full_name: g.full_name,
            relationship: relationshipByGuardian.get(g.id) ?? null,
          })),
        );
      }
    }

    const { data: openCheckin, error: openError } = await supabase
      .from('checkins')
      .select('id')
      .eq('child_id', child.id)
      .is('checked_out_at', null)
      .order('checked_in_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (openError) {
      console.error('open checkin lookup failed', openError);
    }
    setOpenCheckinId(openCheckin?.id ?? null);
    setLoadingDetails(false);
  }

  function goToChildSelection() {
    setSelectedChild(null);
    setLinkedGuardians([]);
    setOpenCheckinId(null);
    setSelectedGuardianId(null);
    setChildGrade(null);
    setError(null);
  }

  async function handleGradeChange(value: string) {
    if (!selectedChild) return;
    setChildGrade(value);
    setSavingGrade(true);

    const { error: updateError } = await supabase
      .from('children')
      .update({ grade: value, class_group: classGroupForGrade(value) })
      .eq('id', selectedChild.id);

    if (updateError) {
      console.error('grade update failed', updateError);
      setError('Something went wrong saving that grade.');
    } else {
      setAllChildren((prev) =>
        prev.map((c) => (c.id === selectedChild.id ? { ...c, grade: value } : c)),
      );
    }
    setSavingGrade(false);
  }

  async function handleCheckIn() {
    if (!selectedChild || !selectedGuardianId) return;
    setError(null);
    setSubmitting(true);

    const { error: insertError } = await supabase.from('checkins').insert({
      child_id: selectedChild.id,
      guardian_id: selectedGuardianId,
      checked_in_at: new Date().toISOString(),
      checked_in_by: session?.user.id,
      security_code: generateSecurityCode(),
    });

    if (insertError) {
      console.error('checkin insert failed', insertError);
      setError('Something went wrong checking this child in.');
      setSubmitting(false);
      return;
    }

    const guardianName = linkedGuardians.find((g) => g.id === selectedGuardianId)?.full_name ?? 'guardian';
    setSuccess(`${selectedChild.full_name} was checked in on behalf of ${guardianName}.`);
    setSubmitting(false);
    await selectChild(selectedChild);
  }

  async function handleCheckOut() {
    if (!selectedChild || !selectedGuardianId || !openCheckinId) return;
    setError(null);
    setSubmitting(true);

    const { error: updateError } = await supabase
      .from('checkins')
      .update({
        checked_out_at: new Date().toISOString(),
        checked_out_by: session?.user.id,
        picked_up_by: selectedGuardianId,
      })
      .eq('id', openCheckinId);

    if (updateError) {
      console.error('checkin update failed', updateError);
      setError('Something went wrong checking this child out.');
      setSubmitting(false);
      return;
    }

    const guardianName = linkedGuardians.find((g) => g.id === selectedGuardianId)?.full_name ?? 'guardian';
    setSuccess(`${selectedChild.full_name} was checked out on behalf of ${guardianName}.`);
    setSubmitting(false);
    await selectChild(selectedChild);
  }

  const filteredChildren = allChildren.filter((c) =>
    c.full_name.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const isCheckedIn = openCheckinId !== null;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <AdminChrome />

        <ThemedText type="title" style={styles.title}>
          Staff Check In / Out
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.subtitle}>
          Use this if a parent forgot to sign their child in or out at the kiosk.
        </ThemedText>

        {!selectedChild ? (
          <ScrollView contentContainerStyle={styles.list}>
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search children by name"
              placeholderTextColor={theme.textSecondary}
              style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
            />

            {loadingChildren ? (
              <ActivityIndicator color={theme.text} style={styles.centerFill} />
            ) : loadError ? (
              <ThemedText style={styles.error}>{loadError}</ThemedText>
            ) : (
              filteredChildren.map((child) => (
                <Pressable
                  key={child.id}
                  onPress={() => selectChild(child)}
                  style={({ pressed }) => [
                    styles.childRow,
                    { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.7 : 1 },
                  ]}>
                  <ThemedText style={styles.childName}>{child.full_name}</ThemedText>
                </Pressable>
              ))
            )}
          </ScrollView>
        ) : (
          <ScrollView contentContainerStyle={styles.list}>
            <Pressable onPress={goToChildSelection} style={styles.backLink}>
              <ThemedText type="link">{'< Choose a different child'}</ThemedText>
            </Pressable>

            <ThemedText type="subtitle">{selectedChild.full_name}</ThemedText>

            {loadingDetails ? (
              <ActivityIndicator color={theme.text} />
            ) : (
              <>
                <ThemedText themeColor="textSecondary">
                  {isCheckedIn ? 'Currently checked in' : 'Not checked in'}
                </ThemedText>

                <ThemedText type="smallBold" style={styles.sectionLabel}>
                  Grade
                </ThemedText>
                <ThemedView style={styles.guardianRow}>
                  {GRADE_OPTIONS.map((option) => {
                    const selected = childGrade === option.value;
                    return (
                      <Pressable
                        key={option.value}
                        onPress={() => handleGradeChange(option.value)}
                        disabled={savingGrade}
                        style={[
                          styles.guardianChip,
                          { backgroundColor: selected ? theme.text : theme.backgroundElement },
                        ]}>
                        <ThemedText
                          type="small"
                          style={{ color: selected ? theme.background : theme.text }}>
                          {option.label}
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                </ThemedView>

                {success && <ThemedText style={styles.success}>{success}</ThemedText>}

                <ThemedText type="smallBold" style={styles.sectionLabel}>
                  {isCheckedIn ? 'Who is picking up?' : 'Who is dropping off?'}
                </ThemedText>

                {linkedGuardians.length === 0 ? (
                  <ThemedText themeColor="textSecondary">
                    No guardians are linked to this child yet. Add one from the Guardians tab first.
                  </ThemedText>
                ) : (
                  <ThemedView style={styles.guardianRow}>
                    {linkedGuardians.map((g) => {
                      const selected = selectedGuardianId === g.id;
                      return (
                        <Pressable
                          key={g.id}
                          onPress={() => setSelectedGuardianId(g.id)}
                          style={[
                            styles.guardianChip,
                            { backgroundColor: selected ? theme.text : theme.backgroundElement },
                          ]}>
                          <ThemedText
                            type="small"
                            style={{ color: selected ? theme.background : theme.text }}>
                            {g.full_name}
                            {g.relationship ? ` (${g.relationship})` : ''}
                          </ThemedText>
                        </Pressable>
                      );
                    })}
                  </ThemedView>
                )}

                {error && <ThemedText style={styles.error}>{error}</ThemedText>}

                <Pressable
                  onPress={isCheckedIn ? handleCheckOut : handleCheckIn}
                  disabled={submitting || !selectedGuardianId}
                  style={({ pressed }) => [
                    styles.button,
                    {
                      backgroundColor: theme.text,
                      opacity: pressed || submitting || !selectedGuardianId ? 0.6 : 1,
                    },
                  ]}>
                  {submitting ? (
                    <ActivityIndicator color={theme.background} />
                  ) : (
                    <ThemedText style={[styles.buttonText, { color: theme.background }]}>
                      {isCheckedIn ? 'Check Out' : 'Check In'}
                    </ThemedText>
                  )}
                </Pressable>
              </>
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
  subtitle: {
    textAlign: 'center',
  },
  list: {
    gap: Spacing.two,
    paddingBottom: Spacing.five,
  },
  centerFill: {
    marginTop: Spacing.five,
  },
  error: {
    color: '#D0342C',
    textAlign: 'center',
  },
  success: {
    color: '#1F9254',
    textAlign: 'center',
  },
  input: {
    height: 48,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
  childRow: {
    height: 56,
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
  },
  childName: {
    fontSize: 17,
  },
  backLink: {
    marginBottom: Spacing.one,
  },
  sectionLabel: {
    marginTop: Spacing.two,
  },
  guardianRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  guardianChip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.five,
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
