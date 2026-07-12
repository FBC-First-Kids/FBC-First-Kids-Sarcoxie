import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AdminChrome } from '@/components/admin-chrome';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { classGroupForGrade, GRADE_OPTIONS, gradeLabel } from '@/lib/class-groups';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { deleteChildCascade, deleteGuardianCascade } from '@/lib/child-actions';
import { formatPhoneInput } from '@/lib/phone';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/hooks/use-theme';

type ChildRow = {
  id: string;
  full_name: string;
  grade: string | null;
};

type GuardianRow = {
  id: string;
  full_name: string;
  phone: string | null;
};

export default function AdminManageProfilesScreen() {
  const theme = useTheme();

  const [tab, setTab] = useState<'children' | 'guardians'>('children');
  const [search, setSearch] = useState('');

  const [children, setChildren] = useState<ChildRow[]>([]);
  const [guardians, setGuardians] = useState<GuardianRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [editingChildId, setEditingChildId] = useState<string | null>(null);
  const [editChildName, setEditChildName] = useState('');
  const [editChildGrade, setEditChildGrade] = useState('');

  const [editingGuardianId, setEditingGuardianId] = useState<string | null>(null);
  const [editGuardianName, setEditGuardianName] = useState('');
  const [editGuardianPhone, setEditGuardianPhone] = useState('');

  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setLoadError(null);

    const [
      { data: childRows, error: childrenError },
      { data: guardianRows, error: guardiansError },
    ] = await Promise.all([
      supabase.from('children').select('id, full_name, grade').order('full_name'),
      supabase.from('guardians').select('id, full_name, phone').order('full_name'),
    ]);

    if (childrenError || guardiansError) {
      console.error('profiles load failed', childrenError, guardiansError);
      setLoadError('Could not load profiles.');
      setLoading(false);
      return;
    }

    setChildren(childRows ?? []);
    setGuardians(guardianRows ?? []);
    setLoading(false);
  }

  function startEditChild(child: ChildRow) {
    setEditingChildId(child.id);
    setEditChildName(child.full_name);
    setEditChildGrade(child.grade ?? '');
    setActionError(null);
  }

  function cancelEditChild() {
    setEditingChildId(null);
  }

  async function saveEditChild(childId: string) {
    if (!editChildName.trim()) {
      setActionError('Please enter a name.');
      return;
    }
    setActionError(null);
    setSavingEdit(true);

    const { error } = await supabase
      .from('children')
      .update({
        full_name: editChildName.trim(),
        grade: editChildGrade || null,
        class_group: editChildGrade ? classGroupForGrade(editChildGrade) : null,
      })
      .eq('id', childId);

    if (error) {
      console.error('child update failed', error);
      setActionError('Something went wrong saving that child.');
      setSavingEdit(false);
      return;
    }

    setChildren((prev) =>
      prev.map((c) =>
        c.id === childId ? { ...c, full_name: editChildName.trim(), grade: editChildGrade || null } : c,
      ),
    );
    setEditingChildId(null);
    setSavingEdit(false);
  }

  function startEditGuardian(guardian: GuardianRow) {
    setEditingGuardianId(guardian.id);
    setEditGuardianName(guardian.full_name);
    setEditGuardianPhone(guardian.phone ?? '');
    setActionError(null);
  }

  function cancelEditGuardian() {
    setEditingGuardianId(null);
  }

  async function saveEditGuardian(guardianId: string) {
    if (!editGuardianName.trim()) {
      setActionError('Please enter a name.');
      return;
    }
    setActionError(null);
    setSavingEdit(true);

    const { error } = await supabase
      .from('guardians')
      .update({
        full_name: editGuardianName.trim(),
        phone: editGuardianPhone.trim() || null,
      })
      .eq('id', guardianId);

    if (error) {
      console.error('guardian update failed', error);
      setActionError('Something went wrong saving that parent.');
      setSavingEdit(false);
      return;
    }

    setGuardians((prev) =>
      prev.map((g) =>
        g.id === guardianId
          ? { ...g, full_name: editGuardianName.trim(), phone: editGuardianPhone.trim() || null }
          : g,
      ),
    );
    setEditingGuardianId(null);
    setSavingEdit(false);
  }

  function confirmDeleteChild(child: ChildRow) {
    Alert.alert(
      'Delete Child Profile',
      `Delete ${child.full_name}? This also permanently deletes their check-in history. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteChild(child.id) },
      ],
    );
  }

  function confirmDeleteGuardian(guardian: GuardianRow) {
    Alert.alert(
      'Delete Parent Profile',
      `Delete ${guardian.full_name}? This removes them as a guardian from any children they're linked to. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteGuardian(guardian.id) },
      ],
    );
  }

  async function deleteChild(childId: string) {
    setActionError(null);
    setDeletingId(childId);

    const { error } = await deleteChildCascade(childId);
    if (error) {
      setActionError('Something went wrong deleting that child.');
      setDeletingId(null);
      return;
    }

    setChildren((prev) => prev.filter((c) => c.id !== childId));
    setDeletingId(null);
  }

  async function deleteGuardian(guardianId: string) {
    setActionError(null);
    setDeletingId(guardianId);

    const { error } = await deleteGuardianCascade(guardianId);
    if (error) {
      setActionError('Something went wrong deleting that parent.');
      setDeletingId(null);
      return;
    }

    setGuardians((prev) => prev.filter((g) => g.id !== guardianId));
    setDeletingId(null);
  }

  const filteredChildren = children.filter((c) =>
    c.full_name.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const filteredGuardians = guardians.filter((g) =>
    g.full_name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <AdminChrome />

        <ThemedText type="title" style={styles.title}>
          Manage Profiles
        </ThemedText>

        <ThemedView style={styles.toggleRow}>
          <Pressable
            onPress={() => setTab('children')}
            style={[
              styles.toggleChip,
              { backgroundColor: tab === 'children' ? theme.text : theme.backgroundElement },
            ]}>
            <ThemedText
              type="small"
              style={{ color: tab === 'children' ? theme.background : theme.text }}>
              Children
            </ThemedText>
          </Pressable>
          <Pressable
            onPress={() => setTab('guardians')}
            style={[
              styles.toggleChip,
              { backgroundColor: tab === 'guardians' ? theme.text : theme.backgroundElement },
            ]}>
            <ThemedText
              type="small"
              style={{ color: tab === 'guardians' ? theme.background : theme.text }}>
              Parents / Guardians
            </ThemedText>
          </Pressable>
        </ThemedView>

        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={tab === 'children' ? 'Search children by name' : 'Search parents by name'}
          placeholderTextColor={theme.textSecondary}
          style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
        />

        {actionError && <ThemedText style={styles.error}>{actionError}</ThemedText>}

        {loading ? (
          <ActivityIndicator color={theme.text} style={styles.centerFill} />
        ) : loadError ? (
          <ThemedText style={styles.error}>{loadError}</ThemedText>
        ) : (
          <ScrollView contentContainerStyle={styles.list}>
            {tab === 'children'
              ? filteredChildren.map((child) =>
                  editingChildId === child.id ? (
                    <ThemedView key={child.id} type="backgroundElement" style={styles.editCard}>
                      <TextInput
                        value={editChildName}
                        onChangeText={setEditChildName}
                        placeholder="Full Name"
                        placeholderTextColor={theme.textSecondary}
                        style={[
                          styles.input,
                          { color: theme.text, backgroundColor: theme.background },
                        ]}
                      />
                      <ThemedText type="small" themeColor="textSecondary">
                        Grade
                      </ThemedText>
                      <View style={styles.chipRow}>
                        {GRADE_OPTIONS.map((option) => {
                          const selected = editChildGrade === option.value;
                          return (
                            <Pressable
                              key={option.value}
                              onPress={() => setEditChildGrade(option.value)}
                              style={[
                                styles.chip,
                                { backgroundColor: selected ? theme.text : theme.background },
                              ]}>
                              <ThemedText
                                type="small"
                                style={{ color: selected ? theme.background : theme.text }}>
                                {option.label}
                              </ThemedText>
                            </Pressable>
                          );
                        })}
                      </View>
                      <View style={styles.editActions}>
                        <Pressable onPress={cancelEditChild}>
                          <ThemedText themeColor="textSecondary">Cancel</ThemedText>
                        </Pressable>
                        <Pressable onPress={() => saveEditChild(child.id)} disabled={savingEdit}>
                          {savingEdit ? (
                            <ActivityIndicator color={theme.text} />
                          ) : (
                            <ThemedText type="link">Save</ThemedText>
                          )}
                        </Pressable>
                      </View>
                    </ThemedView>
                  ) : (
                    <ThemedView key={child.id} type="backgroundElement" style={styles.row}>
                      <View style={styles.rowInfo}>
                        <ThemedText style={styles.rowName}>{child.full_name}</ThemedText>
                        <ThemedText themeColor="textSecondary" type="small">
                          {gradeLabel(child.grade)}
                        </ThemedText>
                      </View>
                      <View style={styles.rowActions}>
                        <Pressable onPress={() => startEditChild(child)}>
                          <ThemedText type="link">Edit</ThemedText>
                        </Pressable>
                        <Pressable
                          onPress={() => confirmDeleteChild(child)}
                          disabled={deletingId === child.id}>
                          {deletingId === child.id ? (
                            <ActivityIndicator color={theme.text} />
                          ) : (
                            <ThemedText style={styles.deleteText}>Delete</ThemedText>
                          )}
                        </Pressable>
                      </View>
                    </ThemedView>
                  ),
                )
              : filteredGuardians.map((guardian) =>
                  editingGuardianId === guardian.id ? (
                    <ThemedView key={guardian.id} type="backgroundElement" style={styles.editCard}>
                      <TextInput
                        value={editGuardianName}
                        onChangeText={setEditGuardianName}
                        placeholder="Full Name"
                        placeholderTextColor={theme.textSecondary}
                        style={[
                          styles.input,
                          { color: theme.text, backgroundColor: theme.background },
                        ]}
                      />
                      <TextInput
                        value={editGuardianPhone}
                        onChangeText={(value) => setEditGuardianPhone(formatPhoneInput(value))}
                        placeholder="Phone Number"
                        placeholderTextColor={theme.textSecondary}
                        keyboardType="phone-pad"
                        style={[
                          styles.input,
                          { color: theme.text, backgroundColor: theme.background },
                        ]}
                      />
                      <View style={styles.editActions}>
                        <Pressable onPress={cancelEditGuardian}>
                          <ThemedText themeColor="textSecondary">Cancel</ThemedText>
                        </Pressable>
                        <Pressable
                          onPress={() => saveEditGuardian(guardian.id)}
                          disabled={savingEdit}>
                          {savingEdit ? (
                            <ActivityIndicator color={theme.text} />
                          ) : (
                            <ThemedText type="link">Save</ThemedText>
                          )}
                        </Pressable>
                      </View>
                    </ThemedView>
                  ) : (
                    <ThemedView key={guardian.id} type="backgroundElement" style={styles.row}>
                      <View style={styles.rowInfo}>
                        <ThemedText style={styles.rowName}>{guardian.full_name}</ThemedText>
                        {guardian.phone && (
                          <ThemedText themeColor="textSecondary" type="small">
                            {guardian.phone}
                          </ThemedText>
                        )}
                      </View>
                      <View style={styles.rowActions}>
                        <Pressable onPress={() => startEditGuardian(guardian)}>
                          <ThemedText type="link">Edit</ThemedText>
                        </Pressable>
                        <Pressable
                          onPress={() => confirmDeleteGuardian(guardian)}
                          disabled={deletingId === guardian.id}>
                          {deletingId === guardian.id ? (
                            <ActivityIndicator color={theme.text} />
                          ) : (
                            <ThemedText style={styles.deleteText}>Delete</ThemedText>
                          )}
                        </Pressable>
                      </View>
                    </ThemedView>
                  ),
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
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  toggleChip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: Spacing.five,
  },
  input: {
    height: 48,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
  centerFill: {
    marginTop: Spacing.five,
  },
  error: {
    color: '#D0342C',
    textAlign: 'center',
  },
  list: {
    gap: Spacing.two,
    paddingBottom: Spacing.five,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 56,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
  },
  rowInfo: {
    gap: Spacing.half,
  },
  rowName: {
    fontSize: 17,
  },
  rowActions: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  deleteText: {
    color: '#D0342C',
  },
  editCard: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.two,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: Spacing.five,
  },
  editActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.three,
    marginTop: Spacing.one,
  },
});
