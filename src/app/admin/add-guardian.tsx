import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AdminChrome } from '@/components/admin-chrome';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { formatPhoneInput, normalizePhone } from '@/lib/phone';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/hooks/use-theme';

type ChildOption = {
  id: string;
  full_name: string;
};

const RELATIONSHIP_OPTIONS = ['Mother', 'Father', 'Grandparent', 'Other'] as const;

export default function AdminAddGuardianScreen() {
  const theme = useTheme();

  const [allChildren, setAllChildren] = useState<ChildOption[]>([]);
  const [loadingChildren, setLoadingChildren] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [step, setStep] = useState<'select' | 'form'>('select');

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [relationship, setRelationship] = useState('');
  const [otherRelationship, setOtherRelationship] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  useEffect(() => {
    loadChildren();
  }, []);

  async function loadChildren() {
    setLoadingChildren(true);
    setLoadError(null);

    const { data, error } = await supabase
      .from('children')
      .select('id, full_name')
      .order('full_name');

    if (error || !data) {
      console.error('children load failed', error);
      setLoadError('Could not load children.');
      setLoadingChildren(false);
      return;
    }

    setAllChildren(data);
    setLoadingChildren(false);
  }

  function toggleChild(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function resetGuardianForm() {
    setFullName('');
    setPhone('');
    setRelationship('');
    setOtherRelationship('');
    setSaveError(null);
  }

  function goToChildSelection() {
    setStep('select');
    setSelectedIds(new Set());
    setSaveSuccess(null);
    resetGuardianForm();
  }

  const selectedChildren = allChildren.filter((c) => selectedIds.has(c.id));

  async function handleAddGuardian() {
    if (selectedChildren.length === 0) return;
    setSaveError(null);
    setSaveSuccess(null);

    if (!fullName.trim() || normalizePhone(phone).length === 0 || !relationship) {
      setSaveError('Please enter a name, phone number, and relationship.');
      return;
    }
    if (relationship === 'Other' && !otherRelationship.trim()) {
      setSaveError('Please describe the relationship.');
      return;
    }

    setSaving(true);

    const digits = normalizePhone(phone);
    const finalRelationship = relationship === 'Other' ? otherRelationship.trim() : relationship;

    const { data: existingGuardians, error: existingError } = await supabase
      .from('guardians')
      .select('id, phone');

    if (existingError) {
      console.error('guardians lookup failed', existingError);
      setSaveError('Something went wrong. Please try again.');
      setSaving(false);
      return;
    }

    const match = (existingGuardians ?? []).find((g) => normalizePhone(g.phone ?? '') === digits);
    let guardianId = match?.id;

    if (!guardianId) {
      const { data: newGuardian, error: newGuardianError } = await supabase
        .from('guardians')
        .insert({ full_name: fullName.trim(), phone: phone.trim() })
        .select('id')
        .single();

      if (newGuardianError || !newGuardian) {
        console.error('guardian insert failed', newGuardianError);
        setSaveError('Something went wrong creating that guardian.');
        setSaving(false);
        return;
      }
      guardianId = newGuardian.id;
    }

    const { error: linkError } = await supabase.from('child_guardians').insert(
      selectedChildren.map((child) => ({
        child_id: child.id,
        guardian_id: guardianId,
        is_primary: false,
        relationship: finalRelationship,
      })),
    );

    if (linkError) {
      console.error('child_guardians insert failed', linkError);
      setSaveError('Something went wrong linking that guardian.');
      setSaving(false);
      return;
    }

    setSaveSuccess(
      `${fullName.trim()} was added as a guardian for ${selectedChildren.length} ${
        selectedChildren.length === 1 ? 'child' : 'children'
      }: ${selectedChildren.map((c) => c.full_name).join(', ')}.`,
    );
    resetGuardianForm();
    setSaving(false);
  }

  const filteredChildren = allChildren.filter((c) =>
    c.full_name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <AdminChrome />

        <ThemedText type="title" style={styles.title}>
          Add Guardian to Child
        </ThemedText>

        {step === 'select' ? (
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
              filteredChildren.map((child) => {
                const selected = selectedIds.has(child.id);
                return (
                  <Pressable
                    key={child.id}
                    onPress={() => toggleChild(child.id)}
                    style={[
                      styles.childRow,
                      {
                        backgroundColor: selected ? theme.backgroundSelected : theme.backgroundElement,
                      },
                    ]}>
                    <ThemedText style={styles.childName}>{child.full_name}</ThemedText>
                    <View
                      style={[
                        styles.checkbox,
                        {
                          backgroundColor: selected ? theme.text : 'transparent',
                          borderColor: theme.textSecondary,
                        },
                      ]}>
                      {selected && (
                        <ThemedText style={[styles.checkmark, { color: theme.background }]}>
                          ✓
                        </ThemedText>
                      )}
                    </View>
                  </Pressable>
                );
              })
            )}

            <Pressable
              onPress={() => setStep('form')}
              disabled={selectedIds.size === 0}
              style={({ pressed }) => [
                styles.button,
                {
                  backgroundColor: theme.text,
                  opacity: pressed || selectedIds.size === 0 ? 0.6 : 1,
                },
              ]}>
              <ThemedText style={[styles.buttonText, { color: theme.background }]}>
                Continue{selectedIds.size > 0 ? ` (${selectedIds.size} selected)` : ''}
              </ThemedText>
            </Pressable>
          </ScrollView>
        ) : (
          <ScrollView contentContainerStyle={styles.list}>
            <Pressable onPress={goToChildSelection} style={styles.backLink}>
              <ThemedText type="link">{'< Choose different children'}</ThemedText>
            </Pressable>

            <ThemedText type="smallBold">
              Adding a guardian for: {selectedChildren.map((c) => c.full_name).join(', ')}
            </ThemedText>

            {saveSuccess && <ThemedText style={styles.success}>{saveSuccess}</ThemedText>}

            <TextInput
              value={fullName}
              onChangeText={setFullName}
              placeholder="Full Name"
              placeholderTextColor={theme.textSecondary}
              style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
            />
            <TextInput
              value={phone}
              onChangeText={(value) => setPhone(formatPhoneInput(value))}
              placeholder="Phone Number"
              placeholderTextColor={theme.textSecondary}
              keyboardType="phone-pad"
              style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
            />

            <ThemedText type="small" themeColor="textSecondary">
              Relationship to these children
            </ThemedText>
            <ThemedView style={styles.relationshipRow}>
              {RELATIONSHIP_OPTIONS.map((option) => {
                const selected = relationship === option;
                return (
                  <Pressable
                    key={option}
                    onPress={() => setRelationship(option)}
                    style={[
                      styles.relationshipChip,
                      { backgroundColor: selected ? theme.text : theme.backgroundElement },
                    ]}>
                    <ThemedText
                      type="small"
                      style={{ color: selected ? theme.background : theme.text }}>
                      {option}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </ThemedView>
            {relationship === 'Other' && (
              <TextInput
                value={otherRelationship}
                onChangeText={setOtherRelationship}
                placeholder="Please describe the relationship"
                placeholderTextColor={theme.textSecondary}
                style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
              />
            )}

            {saveError && <ThemedText style={styles.error}>{saveError}</ThemedText>}

            <Pressable
              onPress={handleAddGuardian}
              disabled={saving}
              style={({ pressed }) => [
                styles.button,
                { backgroundColor: theme.text, opacity: pressed || saving ? 0.6 : 1 },
              ]}>
              {saving ? (
                <ActivityIndicator color={theme.background} />
              ) : (
                <ThemedText style={[styles.buttonText, { color: theme.background }]}>
                  Add Guardian to {selectedChildren.length}{' '}
                  {selectedChildren.length === 1 ? 'Child' : 'Children'}
                </ThemedText>
              )}
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: 56,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
  },
  childName: {
    fontSize: 17,
  },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmark: {
    fontSize: 15,
    fontWeight: '700',
  },
  backLink: {
    marginBottom: Spacing.one,
  },
  relationshipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  relationshipChip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
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
