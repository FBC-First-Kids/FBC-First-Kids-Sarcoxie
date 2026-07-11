import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AdminChrome } from '@/components/admin-chrome';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { CLASS_GROUP_OPTIONS } from '@/lib/class-groups';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/hooks/use-theme';

type NotificationRow = {
  id: string;
  title: string;
  message: string;
  start_date: string;
  end_date: string | null;
  is_reminder: boolean;
  show_on: string;
  class_groups: string[] | null;
};

const SHOW_ON_OPTIONS = [
  { value: 'sign_in', label: 'Sign In' },
  { value: 'sign_out', label: 'Sign Out' },
  { value: 'both', label: 'Both' },
] as const;

function today() {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${mm}/${dd}/${now.getFullYear()}`;
}

function formatDateInput(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  const month = digits.slice(0, 2);
  const day = digits.slice(2, 4);
  const year = digits.slice(4, 8);
  if (digits.length > 4) return `${month}/${day}/${year}`;
  if (digits.length > 2) return `${month}/${day}`;
  return month;
}

function isValidDate(value: string) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!match) return false;
  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function toIsoDate(value: string) {
  const [month, day, year] = value.split('/');
  return `${year}-${month}-${day}`;
}

function formatIsoForDisplay(iso: string) {
  const [year, month, day] = iso.split('-');
  return `${month}/${day}/${year}`;
}

export default function AdminNotificationsScreen() {
  const theme = useTheme();
  const { session } = useAuth();

  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [startDate, setStartDate] = useState(today());
  const [endDate, setEndDate] = useState('');
  const [isReminder, setIsReminder] = useState(false);
  const [showOn, setShowOn] = useState<string>('both');
  const [selectedClassGroups, setSelectedClassGroups] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  function toggleClassGroup(value: string) {
    setSelectedClassGroups((prev) => {
      const next = new Set(prev);
      if (next.has(value)) {
        next.delete(value);
      } else {
        next.add(value);
      }
      return next;
    });
  }

  useEffect(() => {
    loadNotifications();
  }, []);

  function resetForm() {
    setEditingId(null);
    setTitle('');
    setMessage('');
    setStartDate(today());
    setEndDate('');
    setIsReminder(false);
    setShowOn('both');
    setSelectedClassGroups(new Set());
    setSaveError(null);
  }

  function handleEdit(n: NotificationRow) {
    setEditingId(n.id);
    setTitle(n.title);
    setMessage(n.message);
    setStartDate(formatIsoForDisplay(n.start_date));
    setEndDate(n.end_date ? formatIsoForDisplay(n.end_date) : '');
    setIsReminder(n.is_reminder);
    setShowOn(n.show_on);
    setSelectedClassGroups(new Set(n.class_groups ?? []));
    setSaveError(null);
  }

  async function loadNotifications() {
    setLoading(true);
    setLoadError(null);

    const { data, error } = await supabase
      .from('notifications')
      .select('id, title, message, start_date, end_date, is_reminder, show_on, class_groups')
      .order('start_date', { ascending: false });

    if (error || !data) {
      console.error('notifications load failed', error);
      setLoadError('Could not load notifications.');
      setLoading(false);
      return;
    }

    setNotifications(data);
    setLoading(false);
  }

  async function handleSave() {
    setSaveError(null);

    if (!title.trim() || !message.trim()) {
      setSaveError('Please enter a title and message.');
      return;
    }
    if (!isValidDate(startDate)) {
      setSaveError('Please enter a valid start date (MM/DD/YYYY).');
      return;
    }
    if (endDate && !isValidDate(endDate)) {
      setSaveError('Please enter a valid end date (MM/DD/YYYY), or leave it blank.');
      return;
    }
    if (endDate && toIsoDate(endDate) < toIsoDate(startDate)) {
      setSaveError('End date must be on or after the start date.');
      return;
    }

    setSaving(true);

    const payload = {
      title: title.trim(),
      message: message.trim(),
      start_date: toIsoDate(startDate),
      end_date: endDate ? toIsoDate(endDate) : null,
      is_reminder: isReminder,
      show_on: showOn,
      class_groups: selectedClassGroups.size > 0 ? Array.from(selectedClassGroups) : null,
    };

    const { error } = editingId
      ? await supabase.from('notifications').update(payload).eq('id', editingId)
      : await supabase.from('notifications').insert({ ...payload, created_by: session?.user.id });

    if (error) {
      console.error('notification save failed', error);
      setSaveError(
        editingId
          ? 'Something went wrong saving those changes.'
          : 'Something went wrong creating that notification.',
      );
      setSaving(false);
      return;
    }

    resetForm();
    setSaving(false);
    await loadNotifications();
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from('notifications').delete().eq('id', id);
    if (error) {
      console.error('notification delete failed', error);
      return;
    }
    await loadNotifications();
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <AdminChrome />

        <ThemedText type="title" style={styles.title}>
          Manage Notifications
        </ThemedText>

        <ScrollView contentContainerStyle={styles.list}>
          <ThemedText type="smallBold">{editingId ? 'Edit Notification' : 'New Notification'}</ThemedText>

          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Title"
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
          />
          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder="Message"
            placeholderTextColor={theme.textSecondary}
            multiline
            style={[
              styles.input,
              styles.messageInput,
              { color: theme.text, backgroundColor: theme.backgroundElement },
            ]}
          />
          <ThemedView style={styles.dateRow}>
            <TextInput
              value={startDate}
              onChangeText={(value) => setStartDate(formatDateInput(value))}
              placeholder="Start Date (MM/DD/YYYY)"
              placeholderTextColor={theme.textSecondary}
              keyboardType="number-pad"
              maxLength={10}
              style={[
                styles.input,
                styles.dateInput,
                { color: theme.text, backgroundColor: theme.backgroundElement },
              ]}
            />
            <TextInput
              value={endDate}
              onChangeText={(value) => setEndDate(formatDateInput(value))}
              placeholder="End Date (optional)"
              placeholderTextColor={theme.textSecondary}
              keyboardType="number-pad"
              maxLength={10}
              style={[
                styles.input,
                styles.dateInput,
                { color: theme.text, backgroundColor: theme.backgroundElement },
              ]}
            />
          </ThemedView>

          <ThemedText type="small" themeColor="textSecondary">
            Show this notification during
          </ThemedText>
          <ThemedView style={styles.showOnRow}>
            {SHOW_ON_OPTIONS.map((option) => {
              const selected = showOn === option.value;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => setShowOn(option.value)}
                  style={[
                    styles.showOnChip,
                    { backgroundColor: selected ? theme.text : theme.backgroundElement },
                  ]}>
                  <ThemedText type="small" style={{ color: selected ? theme.background : theme.text }}>
                    {option.label}
                  </ThemedText>
                </Pressable>
              );
            })}
          </ThemedView>

          <ThemedText type="small" themeColor="textSecondary">
            Which class(es)? (leave blank for all classes)
          </ThemedText>
          <ThemedView style={styles.showOnRow}>
            {CLASS_GROUP_OPTIONS.map((option) => {
              const selected = selectedClassGroups.has(option.value);
              return (
                <Pressable
                  key={option.value}
                  onPress={() => toggleClassGroup(option.value)}
                  style={[
                    styles.showOnChip,
                    { backgroundColor: selected ? theme.text : theme.backgroundElement },
                  ]}>
                  <ThemedText type="small" style={{ color: selected ? theme.background : theme.text }}>
                    {option.label}
                  </ThemedText>
                </Pressable>
              );
            })}
          </ThemedView>

          <Pressable onPress={() => setIsReminder((prev) => !prev)} style={styles.reminderRow}>
            <ThemedView
              style={[
                styles.checkbox,
                {
                  backgroundColor: isReminder ? theme.text : 'transparent',
                  borderColor: theme.textSecondary,
                },
              ]}>
              {isReminder && (
                <ThemedText style={[styles.checkmark, { color: theme.background }]}>✓</ThemedText>
              )}
            </ThemedView>
            <ThemedText style={styles.reminderLabel}>
              Keep showing this every time they sign in/out (reminder), even after it's been read
            </ThemedText>
          </Pressable>

          {saveError && <ThemedText style={styles.error}>{saveError}</ThemedText>}

          <Pressable
            onPress={handleSave}
            disabled={saving}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: theme.text, opacity: pressed || saving ? 0.6 : 1 },
            ]}>
            {saving ? (
              <ActivityIndicator color={theme.background} />
            ) : (
              <ThemedText style={[styles.buttonText, { color: theme.background }]}>
                {editingId ? 'Save Changes' : 'Create Notification'}
              </ThemedText>
            )}
          </Pressable>

          {editingId && (
            <Pressable onPress={resetForm} style={styles.cancelEditLink}>
              <ThemedText type="link" themeColor="textSecondary">
                Cancel Edit
              </ThemedText>
            </Pressable>
          )}

          <ThemedText type="smallBold" style={styles.sectionLabel}>
            Existing Notifications
          </ThemedText>

          {loading ? (
            <ActivityIndicator color={theme.text} />
          ) : loadError ? (
            <ThemedText style={styles.error}>{loadError}</ThemedText>
          ) : notifications.length === 0 ? (
            <ThemedText themeColor="textSecondary">No notifications yet.</ThemedText>
          ) : (
            notifications.map((n) => (
              <ThemedView key={n.id} type="backgroundElement" style={styles.notificationRow}>
                <ThemedText style={styles.notificationTitle}>{n.title}</ThemedText>
                <ThemedText themeColor="textSecondary" type="small">
                  {n.message}
                </ThemedText>
                <ThemedText themeColor="textSecondary" type="small">
                  {formatIsoForDisplay(n.start_date)}{' '}
                  {n.end_date ? `– ${formatIsoForDisplay(n.end_date)}` : '(no end date)'} ·{' '}
                  {SHOW_ON_OPTIONS.find((o) => o.value === n.show_on)?.label ?? n.show_on}
                  {n.is_reminder ? ' · Reminder' : ''}
                </ThemedText>
                <ThemedText themeColor="textSecondary" type="small">
                  Classes:{' '}
                  {n.class_groups && n.class_groups.length > 0
                    ? n.class_groups
                        .map((cg) => CLASS_GROUP_OPTIONS.find((o) => o.value === cg)?.label ?? cg)
                        .join(', ')
                    : 'All Classes'}
                </ThemedText>
                <View style={styles.rowLinks}>
                  <Pressable onPress={() => handleEdit(n)}>
                    <ThemedText type="link">Edit</ThemedText>
                  </Pressable>
                  <Pressable onPress={() => handleDelete(n.id)}>
                    <ThemedText themeColor="textSecondary">Delete</ThemedText>
                  </Pressable>
                </View>
              </ThemedView>
            ))
          )}
        </ScrollView>
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
    gap: Spacing.three,
    paddingBottom: Spacing.five,
  },
  input: {
    height: 48,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
  messageInput: {
    height: 96,
    paddingTop: Spacing.two,
    textAlignVertical: 'top',
  },
  dateRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  dateInput: {
    flex: 1,
  },
  showOnRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  showOnChip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: Spacing.five,
  },
  reminderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmark: {
    fontSize: 13,
    fontWeight: '700',
  },
  reminderLabel: {
    flex: 1,
    fontSize: 14,
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
  sectionLabel: {
    marginTop: Spacing.three,
  },
  notificationRow: {
    gap: Spacing.half,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
  },
  notificationTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  rowLinks: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.three,
    marginTop: Spacing.one,
  },
  cancelEditLink: {
    alignItems: 'center',
    marginTop: Spacing.one,
  },
});
