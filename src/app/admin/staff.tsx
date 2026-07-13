import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AdminChrome } from '@/components/admin-chrome';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { STAFF_POSITION_OPTIONS, staffPositionLabel } from '@/lib/class-groups';
import { confirmAction } from '@/lib/confirm';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/hooks/use-theme';

type StaffRow = {
  id: string;
  full_name: string;
  position: string | null;
};

type InviteRow = {
  id: string;
  code: string;
  created_at: string;
  used_at: string | null;
  position: string | null;
};

export default function AdminStaffScreen() {
  const theme = useTheme();
  const { session, isMainAdmin } = useAuth();

  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [invitePosition, setInvitePosition] = useState<string | null>(null);
  const [codeInput, setCodeInput] = useState('');

  useEffect(() => {
    if (isMainAdmin) {
      loadData();
    } else {
      setLoading(false);
    }
  }, [isMainAdmin]);

  async function loadData() {
    setLoading(true);
    setLoadError(null);

    const [{ data: staffRows, error: staffError }, { data: inviteRows, error: inviteError }] =
      await Promise.all([
        // Main admins are managed exclusively from Manage Admins (demote there
        // first) — keeps a main admin from being deleted outright by mistake,
        // and keeps each person's "where do I manage this person" story in one
        // place instead of two.
        supabase.from('staff').select('id, full_name, position').eq('role', 'staff').order('full_name'),
        // Position codes only — admin codes are created and managed from Manage
        // Admins instead. Both pending AND used codes — a used code's Revoke
        // button previously had nothing to act on, since this query used to
        // filter used ones out entirely.
        supabase
          .from('staff_invites')
          .select('id, code, created_at, used_at, position')
          .eq('role', 'staff')
          .order('created_at', { ascending: false }),
      ]);

    if (staffError || inviteError) {
      console.error('staff management load failed', staffError, inviteError);
      setLoadError('Could not load staff data.');
      setLoading(false);
      return;
    }

    setStaff(staffRows ?? []);
    setInvites(inviteRows ?? []);
    setLoading(false);
  }

  function confirmRemoveStaff(row: StaffRow) {
    confirmAction(
      'Remove Staff',
      `Remove ${row.full_name}? They will no longer be able to sign in to this app.`,
      'Remove',
      () => handleRemoveStaff(row.id),
    );
  }

  async function handleRemoveStaff(staffId: string) {
    setActionError(null);
    setBusyId(staffId);

    const { error } = await supabase.from('staff').delete().eq('id', staffId);
    if (error) {
      console.error('remove staff failed', error);
      setActionError('Something went wrong removing that staff member.');
      setBusyId(null);
      return;
    }

    setStaff((prev) => prev.filter((s) => s.id !== staffId));
    setBusyId(null);
  }

  async function handleCreateCode() {
    const code = codeInput.trim().toUpperCase();
    if (!session || !invitePosition || !code) return;
    setActionError(null);
    setCreating(true);

    const { data, error } = await supabase
      .from('staff_invites')
      .insert({ code, created_by: session.user.id, position: invitePosition })
      .select('id, code, created_at, used_at, position')
      .single();

    if (error || !data) {
      console.error('invite create failed', error);
      setActionError(
        error?.code === '23505'
          ? 'That code is already in use — pick a different one.'
          : 'Something went wrong creating that code.',
      );
      setCreating(false);
      return;
    }

    setInvites((prev) => [data, ...prev]);
    setInvitePosition(null);
    setCodeInput('');
    setCreating(false);
  }

  function confirmRevokeInvite(invite: InviteRow) {
    confirmAction(
      'Revoke Code',
      `Revoke code ${invite.code}? No one will be able to sign up with it anymore.`,
      'Revoke',
      () => handleRevokeInvite(invite.id),
    );
  }

  async function handleRevokeInvite(inviteId: string) {
    setActionError(null);
    setBusyId(inviteId);

    const { error } = await supabase.from('staff_invites').delete().eq('id', inviteId);
    if (error) {
      console.error('revoke invite failed', error);
      setActionError('Something went wrong removing that code.');
      setBusyId(null);
      return;
    }

    setInvites((prev) => prev.filter((i) => i.id !== inviteId));
    setBusyId(null);
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <AdminChrome />

        <ScrollView contentContainerStyle={styles.scrollContent}>
          <ThemedText type="title" style={styles.title}>
            Staff Management
          </ThemedText>

          {actionError && <ThemedText style={styles.error}>{actionError}</ThemedText>}

          {!isMainAdmin ? (
            <ThemedText themeColor="textSecondary" style={styles.centerText}>
              Only main admins can access this page.
            </ThemedText>
          ) : loading ? (
            <ActivityIndicator color={theme.text} style={styles.centerFill} />
          ) : loadError ? (
            <ThemedText style={styles.error}>{loadError}</ThemedText>
          ) : (
            <>
              <ThemedText type="smallBold" style={styles.sectionLabel}>
                Staff
              </ThemedText>
              <ThemedText themeColor="textSecondary" type="small">
                Main admins are managed from the Manage Admins tab instead — demote someone there
                first if you need to remove them entirely.
              </ThemedText>
              <ThemedView style={styles.list}>
                {staff.length === 0 ? (
                  <ThemedText themeColor="textSecondary" type="small" style={styles.centerText}>
                    No staff yet.
                  </ThemedText>
                ) : (
                  staff.map((row) => (
                  <ThemedView key={row.id} type="backgroundElement" style={styles.row}>
                    <View style={styles.rowInfo}>
                      <ThemedText style={styles.rowName}>
                        {row.full_name}
                        {row.id === session?.user.id ? ' (You)' : ''}
                      </ThemedText>
                      <ThemedText themeColor="textSecondary" type="small">
                        {row.position ? staffPositionLabel(row.position) : 'No position set'}
                      </ThemedText>
                    </View>
                    {row.id === session?.user.id ? null : busyId === row.id ? (
                      <ActivityIndicator color={theme.text} />
                    ) : (
                      <Pressable onPress={() => confirmRemoveStaff(row)}>
                        <ThemedText style={styles.deleteText}>Remove</ThemedText>
                      </Pressable>
                    )}
                  </ThemedView>
                  ))
                )}
              </ThemedView>

              <ThemedText type="smallBold" style={styles.sectionLabel}>
                Sign-Up Codes
              </ThemedText>
              <ThemedText themeColor="textSecondary" type="small">
                Set a code for a position and share it with anyone who needs it — the same code can
                be used by multiple people until you revoke it.
              </ThemedText>

              <View style={styles.chipRow}>
                {STAFF_POSITION_OPTIONS.map((option) => {
                  const selected = invitePosition === option.value;
                  return (
                    <Pressable
                      key={option.value}
                      onPress={() => setInvitePosition(option.value)}
                      style={[
                        styles.chip,
                        { backgroundColor: selected ? theme.text : theme.backgroundElement },
                      ]}>
                      <ThemedText type="small" style={{ color: selected ? theme.background : theme.text }}>
                        {option.label}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>

              <TextInput
                value={codeInput}
                onChangeText={(value) => setCodeInput(value.toUpperCase())}
                placeholder="Code (e.g. FBCPREK)"
                placeholderTextColor={theme.textSecondary}
                autoCapitalize="characters"
                autoCorrect={false}
                style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
              />

              <Pressable
                onPress={handleCreateCode}
                disabled={creating || !invitePosition || !codeInput.trim()}
                style={({ pressed }) => [
                  styles.button,
                  {
                    backgroundColor: theme.text,
                    opacity: pressed || creating || !invitePosition || !codeInput.trim() ? 0.6 : 1,
                  },
                ]}>
                {creating ? (
                  <ActivityIndicator color={theme.background} />
                ) : (
                  <ThemedText style={[styles.buttonText, { color: theme.background }]}>
                    Create Code
                  </ThemedText>
                )}
              </Pressable>

              <ThemedView style={styles.list}>
                {invites.length === 0 ? (
                  <ThemedText themeColor="textSecondary" type="small" style={styles.centerText}>
                    No codes yet.
                  </ThemedText>
                ) : (
                  invites.map((invite) => (
                    <ThemedView key={invite.id} type="backgroundElement" style={styles.row}>
                      <View style={styles.rowInfo}>
                        <ThemedText style={styles.codeText}>{invite.code}</ThemedText>
                        <ThemedText themeColor="textSecondary" type="small">
                          {staffPositionLabel(invite.position)} ·{' '}
                          {invite.used_at
                            ? `Last used ${new Date(invite.used_at).toLocaleDateString()}`
                            : 'Not used yet'}
                        </ThemedText>
                      </View>
                      {busyId === invite.id ? (
                        <ActivityIndicator color={theme.text} />
                      ) : (
                        <Pressable onPress={() => confirmRevokeInvite(invite)}>
                          <ThemedText style={styles.deleteText}>Revoke</ThemedText>
                        </Pressable>
                      )}
                    </ThemedView>
                  ))
                )}
              </ThemedView>
            </>
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
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  scrollContent: {
    gap: Spacing.three,
    paddingBottom: Spacing.five,
  },
  title: {
    textAlign: 'center',
    fontSize: 32,
  },
  sectionLabel: {
    marginTop: Spacing.two,
  },
  centerFill: {
    marginTop: Spacing.five,
  },
  centerText: {
    textAlign: 'center',
    paddingVertical: Spacing.two,
  },
  error: {
    color: '#D0342C',
    textAlign: 'center',
  },
  input: {
    height: 48,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
    letterSpacing: 1,
  },
  list: {
    gap: Spacing.two,
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
  deleteText: {
    color: '#D0342C',
  },
  codeText: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 2,
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
});
