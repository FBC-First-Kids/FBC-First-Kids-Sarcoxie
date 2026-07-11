import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { classGroupForGrade, GRADE_OPTIONS } from '@/lib/class-groups';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { formatPhoneInput, normalizePhone } from '@/lib/phone';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/hooks/use-theme';

type Child = {
  id: string;
  full_name: string;
  guardianId: string;
  classGroup: string | null;
};

type ChildEntry = {
  firstName: string;
  lastName: string;
  relationship: string;
  otherRelationship: string;
  grade: string;
};

type GuardianEntry = {
  fullName: string;
  phone: string;
  relationship: string;
  otherRelationship: string;
};

type NotificationItem = {
  id: string;
  title: string;
  message: string;
  is_reminder: boolean;
  class_groups: string[] | null;
};

type CheckinAction = 'checked_in' | 'checked_out';

const RELATIONSHIP_OPTIONS = ['Mother', 'Father', 'Grandparent', 'Other'] as const;

function generateSecurityCode() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

function joinNames(names: string[]) {
  if (names.length <= 1) return names.join('');
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

function relationshipRow(
  entry: { relationship: string },
  onSelect: (option: string) => void,
  theme: ReturnType<typeof useTheme>,
) {
  return (
    <ThemedView style={styles.relationshipRow}>
      {RELATIONSHIP_OPTIONS.map((option) => {
        const selected = entry.relationship === option;
        return (
          <Pressable
            key={option}
            onPress={() => onSelect(option)}
            style={[
              styles.relationshipChip,
              { backgroundColor: selected ? theme.text : theme.backgroundElement },
            ]}>
            <ThemedText type="small" style={{ color: selected ? theme.background : theme.text }}>
              {option}
            </ThemedText>
          </Pressable>
        );
      })}
    </ThemedView>
  );
}

function gradeRow(
  grade: string,
  onSelect: (option: string) => void,
  theme: ReturnType<typeof useTheme>,
) {
  return (
    <ThemedView style={styles.relationshipRow}>
      {GRADE_OPTIONS.map((option) => {
        const selected = grade === option.value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onSelect(option.value)}
            style={[
              styles.relationshipChip,
              { backgroundColor: selected ? theme.text : theme.backgroundElement },
            ]}>
            <ThemedText type="small" style={{ color: selected ? theme.background : theme.text }}>
              {option.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </ThemedView>
  );
}

export default function ParentSignInScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { session } = useAuth();

  const [mode, setMode] = useState<'lookup' | 'create'>('lookup');

  const [phone, setPhone] = useState('');
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [children, setChildren] = useState<Child[] | null>(null);
  const [openCheckinByChild, setOpenCheckinByChild] = useState<Map<string, string>>(new Map());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState<'checked_in' | 'checked_out' | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const [guardianFullName, setGuardianFullName] = useState('');
  const [childEntries, setChildEntries] = useState<ChildEntry[]>([
    { firstName: '', lastName: '', relationship: '', otherRelationship: '', grade: '' },
  ]);
  const [guardianEntries, setGuardianEntries] = useState<GuardianEntry[]>([]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [pendingNotifications, setPendingNotifications] = useState<NotificationItem[]>([]);
  const [notificationGuardianIds, setNotificationGuardianIds] = useState<string[]>([]);
  const [pendingAction, setPendingAction] = useState<CheckinAction | null>(null);

  function reset() {
    setMode('lookup');
    setPhone('');
    setLookupError(null);
    setChildren(null);
    setOpenCheckinByChild(new Map());
    setSelectedIds(new Set());
    setSubmitting(null);
    setConfirmation(null);
    setGuardianFullName('');
    setChildEntries([{ firstName: '', lastName: '', relationship: '', otherRelationship: '', grade: '' }]);
    setGuardianEntries([]);
    setCreating(false);
    setCreateError(null);
    setPendingNotifications([]);
    setNotificationGuardianIds([]);
    setPendingAction(null);
  }

  async function fetchNotificationsForAction(
    guardianIds: string[],
    action: CheckinAction,
    classGroups: string[],
  ): Promise<NotificationItem[]> {
    const showOnValue = action === 'checked_in' ? 'sign_in' : 'sign_out';
    const todayStr = new Date().toISOString().slice(0, 10);

    const { data: activeNotifications, error } = await supabase
      .from('notifications')
      .select('id, title, message, is_reminder, show_on, class_groups')
      .lte('start_date', todayStr)
      .or(`end_date.is.null,end_date.gte.${todayStr}`)
      .or(`show_on.eq.both,show_on.eq.${showOnValue}`);

    if (error || !activeNotifications) {
      if (error) console.error('notifications lookup failed', error);
      return [];
    }

    const classScoped = activeNotifications.filter(
      (n) =>
        !n.class_groups ||
        n.class_groups.length === 0 ||
        n.class_groups.some((cg: string) => classGroups.includes(cg)),
    );

    if (classScoped.length === 0) {
      return [];
    }

    const { data: reads, error: readsError } = await supabase
      .from('notification_reads')
      .select('notification_id')
      .in('guardian_id', guardianIds)
      .in(
        'notification_id',
        classScoped.map((n) => n.id),
      );

    if (readsError) {
      console.error('notification reads lookup failed', readsError);
    }

    const readIds = new Set((reads ?? []).map((r) => r.notification_id));
    return classScoped.filter((n) => n.is_reminder || !readIds.has(n.id));
  }

  async function handleMarkNotificationRead() {
    const current = pendingNotifications[0];
    if (!current) return;

    const { error } = await supabase.from('notification_reads').upsert(
      notificationGuardianIds.map((guardianId) => ({
        notification_id: current.id,
        guardian_id: guardianId,
        read_at: new Date().toISOString(),
      })),
      { onConflict: 'notification_id,guardian_id' },
    );
    if (error) {
      console.error('notification read upsert failed', error);
    }

    const remaining = pendingNotifications.slice(1);
    setPendingNotifications(remaining);

    if (remaining.length === 0 && pendingAction) {
      const action = pendingAction;
      setPendingAction(null);
      await performCheckinAction(action);
    }
  }

  async function handleLookup() {
    const digits = normalizePhone(phone);
    if (!digits) return;

    setLookingUp(true);
    setLookupError(null);

    const { data: guardians, error: guardiansError } = await supabase
      .from('guardians')
      .select('id, phone');

    if (guardiansError) {
      console.error('guardians lookup failed', guardiansError);
      setLookupError('Something went wrong. Please ask a staff member for help.');
      setLookingUp(false);
      return;
    }

    const matchedGuardianIds = (guardians ?? [])
      .filter((g) => normalizePhone(g.phone ?? '') === digits)
      .map((g) => g.id);

    if (matchedGuardianIds.length === 0) {
      setLookupError('No family found with that phone number. Please see a staff member.');
      setLookingUp(false);
      return;
    }

    const { data: links, error: linksError } = await supabase
      .from('child_guardians')
      .select('child_id, guardian_id')
      .in('guardian_id', matchedGuardianIds);

    if (linksError || !links || links.length === 0) {
      console.error('child_guardians lookup failed', linksError);
      setLookupError('No children found for that family. Please see a staff member.');
      setLookingUp(false);
      return;
    }

    const childIds = [...new Set(links.map((l) => l.child_id))];
    const { data: childRows, error: childrenError } = await supabase
      .from('children')
      .select('id, full_name, class_group')
      .in('id', childIds);

    if (childrenError || !childRows) {
      console.error('children lookup failed', childrenError);
      setLookupError('Something went wrong. Please ask a staff member for help.');
      setLookingUp(false);
      return;
    }

    const { data: openCheckins, error: openError } = await supabase
      .from('checkins')
      .select('id, child_id')
      .in('child_id', childIds)
      .is('checked_out_at', null);

    if (openError) {
      console.error('open checkins lookup failed', openError);
      setLookupError('Something went wrong. Please ask a staff member for help.');
      setLookingUp(false);
      return;
    }

    const guardianByChild = new Map(links.map((l) => [l.child_id, l.guardian_id]));
    const resolvedChildren: Child[] = childRows.map((c) => ({
      id: c.id,
      full_name: c.full_name,
      guardianId: guardianByChild.get(c.id) ?? matchedGuardianIds[0],
      classGroup: c.class_group,
    }));

    setChildren(resolvedChildren);
    setOpenCheckinByChild(new Map((openCheckins ?? []).map((r) => [r.child_id, r.id])));
    setSelectedIds(new Set(resolvedChildren.map((c) => c.id)));
    setNotificationGuardianIds(matchedGuardianIds);
    setLookingUp(false);
  }

  function updateChildEntry(index: number, field: keyof ChildEntry, value: string) {
    setChildEntries((prev) => prev.map((c, i) => (i === index ? { ...c, [field]: value } : c)));
  }

  function addChildEntry() {
    setChildEntries((prev) => [
      ...prev,
      { firstName: '', lastName: '', relationship: '', otherRelationship: '', grade: '' },
    ]);
  }

  function removeChildEntry(index: number) {
    setChildEntries((prev) => prev.filter((_, i) => i !== index));
  }

  function updateGuardianEntry(index: number, field: keyof GuardianEntry, value: string) {
    setGuardianEntries((prev) => prev.map((g, i) => (i === index ? { ...g, [field]: value } : g)));
  }

  function addGuardianEntry() {
    setGuardianEntries((prev) => [
      ...prev,
      { fullName: '', phone: '', relationship: '', otherRelationship: '' },
    ]);
  }

  function removeGuardianEntry(index: number) {
    setGuardianEntries((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleCreateAccount() {
    setCreateError(null);

    const trimmedEntries = childEntries.map((c) => ({
      firstName: c.firstName.trim(),
      lastName: c.lastName.trim(),
      relationship: c.relationship,
      otherRelationship: c.otherRelationship.trim(),
      grade: c.grade,
    }));

    if (!guardianFullName.trim() || normalizePhone(phone).length === 0) {
      setCreateError('Please fill in your name and phone number.');
      return;
    }
    const hasAnyContent = (c: (typeof trimmedEntries)[number]) =>
      c.firstName || c.lastName || c.relationship || c.grade;
    const startedEntries = trimmedEntries.filter(hasAnyContent);

    const missingName = startedEntries.some((c) => !(c.firstName && c.lastName));
    if (missingName) {
      setCreateError('Please enter both a first and last name for each child.');
      return;
    }
    const missingRelationship = startedEntries.some((c) => !c.relationship);
    if (missingRelationship) {
      setCreateError('Please select a relationship for each child.');
      return;
    }
    const missingOtherDescription = startedEntries.some(
      (c) => c.relationship === 'Other' && !c.otherRelationship,
    );
    if (missingOtherDescription) {
      setCreateError('Please describe your relationship for each child marked "Other".');
      return;
    }
    const missingGrade = startedEntries.some((c) => !c.grade);
    if (missingGrade) {
      setCreateError('Please select a grade for each child.');
      return;
    }
    const completeEntries = trimmedEntries.filter(
      (c) =>
        c.firstName &&
        c.lastName &&
        c.relationship &&
        c.grade &&
        (c.relationship !== 'Other' || c.otherRelationship),
    );
    if (completeEntries.length === 0) {
      setCreateError("Please add at least one child's information.");
      return;
    }

    const trimmedGuardianEntries = guardianEntries.map((g) => ({
      fullName: g.fullName.trim(),
      phone: g.phone.trim(),
      relationship: g.relationship,
      otherRelationship: g.otherRelationship.trim(),
    }));
    const startedGuardianEntries = trimmedGuardianEntries.filter(
      (g) => g.fullName || g.phone || g.relationship,
    );
    const guardianMissingInfo = startedGuardianEntries.some(
      (g) => !(g.fullName && normalizePhone(g.phone) && g.relationship),
    );
    if (guardianMissingInfo) {
      setCreateError('Please enter a name, phone number, and relationship for each additional guardian.');
      return;
    }
    const guardianMissingOtherDescription = startedGuardianEntries.some(
      (g) => g.relationship === 'Other' && !g.otherRelationship,
    );
    if (guardianMissingOtherDescription) {
      setCreateError('Please describe the relationship for each guardian marked "Other".');
      return;
    }

    setCreating(true);

    const { data: guardian, error: guardianError } = await supabase
      .from('guardians')
      .insert({ full_name: guardianFullName.trim(), phone: phone.trim() })
      .select('id')
      .single();

    if (guardianError || !guardian) {
      console.error('guardian insert failed', guardianError);
      setCreateError('Something went wrong creating your account. Please ask a staff member.');
      setCreating(false);
      return;
    }

    const { data: newChildren, error: childrenError } = await supabase
      .from('children')
      .insert(
        completeEntries.map((c) => ({
          full_name: `${c.firstName} ${c.lastName}`,
          grade: c.grade,
          class_group: classGroupForGrade(c.grade),
        })),
      )
      .select('id, full_name, class_group');

    if (childrenError || !newChildren) {
      console.error('children insert failed', childrenError);
      setCreateError('Something went wrong adding your children. Please ask a staff member.');
      setCreating(false);
      return;
    }

    const { error: linkError } = await supabase.from('child_guardians').insert(
      newChildren.map((c, i) => ({
        child_id: c.id,
        guardian_id: guardian.id,
        is_primary: true,
        relationship:
          completeEntries[i].relationship === 'Other'
            ? completeEntries[i].otherRelationship
            : completeEntries[i].relationship,
      })),
    );

    if (linkError) {
      console.error('child_guardians insert failed', linkError);
      setCreateError('Something went wrong linking your children. Please ask a staff member.');
      setCreating(false);
      return;
    }

    if (startedGuardianEntries.length > 0) {
      const { data: existingGuardians, error: existingError } = await supabase
        .from('guardians')
        .select('id, phone');

      if (existingError) {
        console.error('guardians lookup failed', existingError);
        setCreateError('Something went wrong adding the other guardians. Please ask a staff member.');
        setCreating(false);
        return;
      }

      const phoneToId = new Map(
        (existingGuardians ?? []).map((g) => [normalizePhone(g.phone ?? ''), g.id]),
      );
      const additionalGuardians: { id: string; relationship: string }[] = [];

      for (const g of startedGuardianEntries) {
        const digits = normalizePhone(g.phone);
        const relationship = g.relationship === 'Other' ? g.otherRelationship : g.relationship;
        const existingId = phoneToId.get(digits);

        if (existingId) {
          additionalGuardians.push({ id: existingId, relationship });
          continue;
        }

        const { data: newGuardian, error: newGuardianError } = await supabase
          .from('guardians')
          .insert({ full_name: g.fullName, phone: g.phone })
          .select('id')
          .single();

        if (newGuardianError || !newGuardian) {
          console.error('additional guardian insert failed', newGuardianError);
          setCreateError('Something went wrong adding the other guardians. Please ask a staff member.');
          setCreating(false);
          return;
        }

        phoneToId.set(digits, newGuardian.id);
        additionalGuardians.push({ id: newGuardian.id, relationship });
      }

      const { error: additionalLinkError } = await supabase.from('child_guardians').insert(
        additionalGuardians.flatMap((g) =>
          newChildren.map((c) => ({
            child_id: c.id,
            guardian_id: g.id,
            is_primary: false,
            relationship: g.relationship,
          })),
        ),
      );

      if (additionalLinkError) {
        console.error('additional child_guardians insert failed', additionalLinkError);
        setCreateError('Something went wrong linking the other guardians. Please ask a staff member.');
        setCreating(false);
        return;
      }
    }

    const resolvedChildren: Child[] = newChildren.map((c) => ({
      id: c.id,
      full_name: c.full_name,
      guardianId: guardian.id,
      classGroup: c.class_group,
    }));

    setChildren(resolvedChildren);
    setOpenCheckinByChild(new Map());
    setSelectedIds(new Set(resolvedChildren.map((c) => c.id)));
    setNotificationGuardianIds([guardian.id]);
    setCreating(false);
    setMode('lookup');
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

  async function handleSubmit(action: CheckinAction) {
    if (!children || selectedIds.size === 0) return;

    setSubmitting(action);
    const selectedClassGroups = [
      ...new Set(
        children
          .filter((c) => selectedIds.has(c.id))
          .map((c) => c.classGroup)
          .filter((cg): cg is string => !!cg),
      ),
    ];
    const notifs = await fetchNotificationsForAction(
      notificationGuardianIds,
      action,
      selectedClassGroups,
    );

    if (notifs.length > 0) {
      setPendingNotifications(notifs);
      setPendingAction(action);
      setSubmitting(null);
      return;
    }

    await performCheckinAction(action);
  }

  async function performCheckinAction(action: CheckinAction) {
    if (!children || selectedIds.size === 0) return;

    setSubmitting(action);

    const selectedChildren = children.filter((c) => selectedIds.has(c.id));
    const now = new Date().toISOString();
    let processed = 0;
    let skipped = 0;

    if (action === 'checked_in') {
      const toInsert = selectedChildren.filter((c) => !openCheckinByChild.has(c.id));
      skipped = selectedChildren.length - toInsert.length;

      if (toInsert.length > 0) {
        const rows = toInsert.map((c) => ({
          child_id: c.id,
          guardian_id: c.guardianId,
          checked_in_at: now,
          checked_in_by: session?.user.id,
          security_code: generateSecurityCode(),
        }));
        const { error } = await supabase.from('checkins').insert(rows);
        if (error) {
          console.error('checkins insert failed', error);
          setLookupError('Something went wrong submitting that. Please ask a staff member.');
          setSubmitting(null);
          return;
        }
        processed = toInsert.length;
      }
    } else {
      const toUpdate = selectedChildren.filter((c) => openCheckinByChild.has(c.id));
      skipped = selectedChildren.length - toUpdate.length;

      const results = await Promise.all(
        toUpdate.map((c) =>
          supabase
            .from('checkins')
            .update({
              checked_out_at: now,
              checked_out_by: session?.user.id,
              picked_up_by: c.guardianId,
            })
            .eq('id', openCheckinByChild.get(c.id)!),
        ),
      );
      const updateError = results.find((r) => r.error)?.error;
      if (updateError) {
        console.error('checkins update failed', updateError);
        setLookupError('Something went wrong submitting that. Please ask a staff member.');
        setSubmitting(null);
        return;
      }
      processed = toUpdate.length;
    }

    const parts: string[] = [];
    if (processed > 0) {
      parts.push(
        `${processed} ${processed === 1 ? 'child' : 'children'} ${
          action === 'checked_in' ? 'signed in' : 'signed out'
        }.`,
      );
    }
    if (skipped > 0) {
      parts.push(
        `${skipped} ${skipped === 1 ? 'was' : 'were'} already ${
          action === 'checked_in' ? 'checked in' : 'checked out'
        }.`,
      );
    }
    setConfirmation(parts.join(' ') || 'Nothing to update.');
    setSubmitting(null);

    setTimeout(() => {
      reset();
      router.replace('/');
    }, 2500);
  }

  const currentNotification = pendingNotifications[0];
  const currentNotificationChildNames =
    currentNotification && children
      ? children
          .filter((c) => selectedIds.has(c.id))
          .filter(
            (c) =>
              !currentNotification.class_groups ||
              currentNotification.class_groups.length === 0 ||
              (c.classGroup && currentNotification.class_groups.includes(c.classGroup)),
          )
          .map((c) => c.full_name)
      : [];

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <Pressable onPress={() => router.replace('/')} style={styles.cancel}>
          <ThemedText type="link" themeColor="textSecondary">
            Cancel
          </ThemedText>
        </Pressable>

        <Image
          source={require('@/assets/images/first-kids-logo.png')}
          style={styles.logo}
          contentFit="contain"
        />
        <ThemedText type="title" style={styles.title}>
          FBC Sarcoxie{'\n'}First Kids
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.subtitle}>
          Parents please sign your child(ren) in/out here
        </ThemedText>

        {confirmation ? (
          <ThemedView style={styles.centerFill}>
            <ThemedText type="subtitle" style={styles.centerText}>
              {confirmation}
            </ThemedText>
          </ThemedView>
        ) : mode === 'create' ? (
          <ScrollView contentContainerStyle={styles.form}>
            <TextInput
              value={guardianFullName}
              onChangeText={setGuardianFullName}
              placeholder="Your Full Name"
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

            <ThemedText type="smallBold" style={styles.sectionLabel}>
              Children
            </ThemedText>

            {childEntries.map((entry, index) => (
              <ThemedView key={index} style={styles.childEntryRow}>
                <TextInput
                  value={entry.firstName}
                  onChangeText={(value) => updateChildEntry(index, 'firstName', value)}
                  placeholder="Child's First Name"
                  placeholderTextColor={theme.textSecondary}
                  style={[
                    styles.input,
                    styles.childEntryInput,
                    { color: theme.text, backgroundColor: theme.backgroundElement },
                  ]}
                />
                <TextInput
                  value={entry.lastName}
                  onChangeText={(value) => updateChildEntry(index, 'lastName', value)}
                  placeholder="Child's Last Name"
                  placeholderTextColor={theme.textSecondary}
                  style={[
                    styles.input,
                    styles.childEntryInput,
                    { color: theme.text, backgroundColor: theme.backgroundElement },
                  ]}
                />

                <ThemedText type="small" themeColor="textSecondary">
                  Your relationship to this child
                </ThemedText>
                {relationshipRow(
                  entry,
                  (option) => updateChildEntry(index, 'relationship', option),
                  theme,
                )}
                {entry.relationship === 'Other' && (
                  <TextInput
                    value={entry.otherRelationship}
                    onChangeText={(value) => updateChildEntry(index, 'otherRelationship', value)}
                    placeholder="Please describe your relationship"
                    placeholderTextColor={theme.textSecondary}
                    style={[
                      styles.input,
                      styles.childEntryInput,
                      { color: theme.text, backgroundColor: theme.backgroundElement },
                    ]}
                  />
                )}

                <ThemedText type="small" themeColor="textSecondary">
                  Grade
                </ThemedText>
                {gradeRow(entry.grade, (option) => updateChildEntry(index, 'grade', option), theme)}

                {childEntries.length > 1 && (
                  <Pressable onPress={() => removeChildEntry(index)} style={styles.removeChild}>
                    <ThemedText themeColor="textSecondary">Remove</ThemedText>
                  </Pressable>
                )}
              </ThemedView>
            ))}

            <Pressable onPress={addChildEntry} style={styles.addChildLink}>
              <ThemedText type="link">+ Add Another Child</ThemedText>
            </Pressable>

            <ThemedText type="smallBold" style={styles.sectionLabel}>
              Other People Authorized to Pick Up/Drop Off (optional)
            </ThemedText>

            {guardianEntries.map((entry, index) => (
              <ThemedView key={index} style={styles.childEntryRow}>
                <TextInput
                  value={entry.fullName}
                  onChangeText={(value) => updateGuardianEntry(index, 'fullName', value)}
                  placeholder="Full Name"
                  placeholderTextColor={theme.textSecondary}
                  style={[
                    styles.input,
                    styles.childEntryInput,
                    { color: theme.text, backgroundColor: theme.backgroundElement },
                  ]}
                />
                <TextInput
                  value={entry.phone}
                  onChangeText={(value) => updateGuardianEntry(index, 'phone', formatPhoneInput(value))}
                  placeholder="Phone Number"
                  placeholderTextColor={theme.textSecondary}
                  keyboardType="phone-pad"
                  style={[
                    styles.input,
                    styles.childEntryInput,
                    { color: theme.text, backgroundColor: theme.backgroundElement },
                  ]}
                />

                <ThemedText type="small" themeColor="textSecondary">
                  Their relationship to the child(ren)
                </ThemedText>
                {relationshipRow(
                  entry,
                  (option) => updateGuardianEntry(index, 'relationship', option),
                  theme,
                )}
                {entry.relationship === 'Other' && (
                  <TextInput
                    value={entry.otherRelationship}
                    onChangeText={(value) => updateGuardianEntry(index, 'otherRelationship', value)}
                    placeholder="Please describe the relationship"
                    placeholderTextColor={theme.textSecondary}
                    style={[
                      styles.input,
                      styles.childEntryInput,
                      { color: theme.text, backgroundColor: theme.backgroundElement },
                    ]}
                  />
                )}

                <Pressable onPress={() => removeGuardianEntry(index)} style={styles.removeChild}>
                  <ThemedText themeColor="textSecondary">Remove</ThemedText>
                </Pressable>
              </ThemedView>
            ))}

            <Pressable onPress={addGuardianEntry} style={styles.addChildLink}>
              <ThemedText type="link">+ Add Another Guardian</ThemedText>
            </Pressable>

            {createError && <ThemedText style={styles.error}>{createError}</ThemedText>}

            <Pressable
              onPress={handleCreateAccount}
              disabled={creating}
              style={({ pressed }) => [
                styles.button,
                { backgroundColor: theme.text, opacity: pressed || creating ? 0.6 : 1 },
              ]}>
              {creating ? (
                <ActivityIndicator color={theme.background} />
              ) : (
                <ThemedText style={[styles.buttonText, { color: theme.background }]}>
                  Create Account & Continue
                </ThemedText>
              )}
            </Pressable>

            <Pressable onPress={() => setMode('lookup')} style={styles.addChildLink}>
              <ThemedText type="link" themeColor="textSecondary">
                Back to Sign In
              </ThemedText>
            </Pressable>
          </ScrollView>
        ) : pendingNotifications.length > 0 ? (
          <ThemedView style={styles.form}>
            <ThemedView type="backgroundElement" style={styles.notificationCard}>
              <ThemedText type="subtitle">{pendingNotifications[0].title}</ThemedText>
              {currentNotificationChildNames.length > 0 && (
                <ThemedText themeColor="textSecondary" type="small">
                  For: {joinNames(currentNotificationChildNames)}
                </ThemedText>
              )}
              <ThemedText style={styles.notificationMessage}>
                {pendingNotifications[0].message}
              </ThemedText>
            </ThemedView>

            <Pressable
              onPress={handleMarkNotificationRead}
              style={({ pressed }) => [
                styles.button,
                { backgroundColor: theme.text, opacity: pressed ? 0.7 : 1 },
              ]}>
              <ThemedText style={[styles.buttonText, { color: theme.background }]}>
                {pendingNotifications[0].is_reminder ? 'Continue' : "I've Read This"}
              </ThemedText>
            </Pressable>

            {pendingNotifications.length > 1 && (
              <ThemedText themeColor="textSecondary" type="small" style={styles.centerText}>
                {pendingNotifications.length - 1} more update
                {pendingNotifications.length - 1 === 1 ? '' : 's'} after this
              </ThemedText>
            )}
          </ThemedView>
        ) : !children ? (
          <ThemedView style={styles.form}>
            <TextInput
              value={phone}
              onChangeText={(value) => setPhone(formatPhoneInput(value))}
              placeholder="Phone number"
              placeholderTextColor={theme.textSecondary}
              keyboardType="phone-pad"
              style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
            />
            {lookupError && <ThemedText style={styles.error}>{lookupError}</ThemedText>}
            <Pressable
              onPress={handleLookup}
              disabled={lookingUp || normalizePhone(phone).length === 0}
              style={({ pressed }) => [
                styles.button,
                {
                  backgroundColor: theme.text,
                  opacity: pressed || lookingUp || normalizePhone(phone).length === 0 ? 0.6 : 1,
                },
              ]}>
              {lookingUp ? (
                <ActivityIndicator color={theme.background} />
              ) : (
                <ThemedText style={[styles.buttonText, { color: theme.background }]}>
                  Find My Family
                </ThemedText>
              )}
            </Pressable>

            <Pressable onPress={() => setMode('create')} style={styles.addChildLink}>
              <ThemedText type="link">New Family? Create an Account</ThemedText>
            </Pressable>
          </ThemedView>
        ) : (
          <ThemedView style={styles.form}>
            {children.map((child) => {
              const selected = selectedIds.has(child.id);
              const isCheckedIn = openCheckinByChild.has(child.id);
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
                  <View style={styles.childInfo}>
                    <ThemedText style={styles.childName}>{child.full_name}</ThemedText>
                    <ThemedText themeColor="textSecondary" type="small">
                      {isCheckedIn ? 'Currently checked in' : 'Not checked in'}
                    </ThemedText>
                  </View>
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
            })}

            {lookupError && <ThemedText style={styles.error}>{lookupError}</ThemedText>}

            <ThemedView style={styles.actionsRow}>
              <Pressable
                onPress={() => handleSubmit('checked_in')}
                disabled={submitting !== null || selectedIds.size === 0}
                style={({ pressed }) => [
                  styles.button,
                  styles.actionButton,
                  {
                    backgroundColor: theme.text,
                    opacity: pressed || submitting !== null || selectedIds.size === 0 ? 0.6 : 1,
                  },
                ]}>
                {submitting === 'checked_in' ? (
                  <ActivityIndicator color={theme.background} />
                ) : (
                  <ThemedText style={[styles.buttonText, { color: theme.background }]}>
                    Sign In
                  </ThemedText>
                )}
              </Pressable>
              <Pressable
                onPress={() => handleSubmit('checked_out')}
                disabled={submitting !== null || selectedIds.size === 0}
                style={({ pressed }) => [
                  styles.button,
                  styles.actionButton,
                  {
                    backgroundColor: theme.text,
                    opacity: pressed || submitting !== null || selectedIds.size === 0 ? 0.6 : 1,
                  },
                ]}>
                {submitting === 'checked_out' ? (
                  <ActivityIndicator color={theme.background} />
                ) : (
                  <ThemedText style={[styles.buttonText, { color: theme.background }]}>
                    Sign Out
                  </ThemedText>
                )}
              </Pressable>
            </ThemedView>
          </ThemedView>
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
  cancel: {
    alignSelf: 'flex-end',
  },
  logo: {
    width: 100,
    height: 100,
    alignSelf: 'center',
  },
  title: {
    textAlign: 'center',
    fontSize: 32,
    lineHeight: 36,
  },
  subtitle: {
    textAlign: 'center',
    fontSize: 16,
    marginBottom: Spacing.three,
  },
  form: {
    gap: Spacing.three,
  },
  input: {
    height: 48,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
  error: {
    color: '#D0342C',
    textAlign: 'center',
  },
  button: {
    height: 48,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontWeight: '600',
  },
  childRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 56,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
  },
  childInfo: {
    gap: Spacing.half,
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
  childName: {
    fontSize: 17,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: Spacing.three,
    marginTop: Spacing.two,
  },
  actionButton: {
    flex: 1,
  },
  centerFill: {
    flex: 1,
    justifyContent: 'center',
  },
  centerText: {
    textAlign: 'center',
  },
  notificationCard: {
    gap: Spacing.two,
    padding: Spacing.four,
    borderRadius: Spacing.three,
  },
  notificationMessage: {
    fontSize: 16,
  },
  sectionLabel: {
    marginTop: Spacing.two,
  },
  childEntryRow: {
    gap: Spacing.two,
    paddingBottom: Spacing.two,
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
  childEntryInput: {
    marginBottom: 0,
  },
  removeChild: {
    alignSelf: 'flex-end',
  },
  addChildLink: {
    alignItems: 'center',
    marginTop: Spacing.one,
  },
});
