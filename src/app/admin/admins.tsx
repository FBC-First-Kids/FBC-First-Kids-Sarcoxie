import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AdminChrome } from '@/components/admin-chrome';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { staffPositionLabel } from '@/lib/class-groups';
import { confirmAction } from '@/lib/confirm';
import { useAuth } from '@/lib/auth-context';
import { hasAmbiguousChars } from '@/lib/staff-invites';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/hooks/use-theme';

const MAX_MAIN_ADMINS = 3;

type StaffRow = {
  id: string;
  full_name: string;
  role: 'staff' | 'main_admin';
  position: string | null;
};

type InviteRow = {
  id: string;
  code: string;
  created_at: string;
  used_at: string | null;
};

export default function AdminAdminsScreen() {
  const theme = useTheme();
  const { session, isMainAdmin } = useAuth();

  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [codeInput, setCodeInput] = useState('');

  const mainAdminCount = staff.filter((s) => s.role === 'main_admin').length;

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
        supabase.from('staff').select('id, full_name, role, position').order('full_name'),
        supabase
          .from('staff_invites')
          .select('id, code, created_at, used_at')
          .eq('role', 'main_admin')
          .order('created_at', { ascending: false }),
      ]);

    if (staffError || inviteError) {
      console.error('admins load failed', staffError, inviteError);
      setLoadError('Could not load staff data.');
      setLoading(false);
      return;
    }

    setStaff(staffRows ?? []);
    setInvites(inviteRows ?? []);
    setLoading(false);
  }

  async function handleCreateCode() {
    const code = codeInput.trim().toUpperCase();
    if (!session || !code) return;
    setActionError(null);
    setCreating(true);

    const { data, error } = await supabase
      .from('staff_invites')
      .insert({ code, created_by: session.user.id, role: 'main_admin' })
      .select('id, code, created_at, used_at')
      .single();

    if (error || !data) {
      console.error('admin invite create failed', error);
      setActionError(
        error?.code === '23505'
          ? 'That code is already in use — pick a different one.'
          : 'Something went wrong creating that code.',
      );
      setCreating(false);
      return;
    }

    setInvites((prev) => [data, ...prev]);
    setCodeInput('');
    setCreating(false);
  }

  function confirmRevokeInvite(invite: InviteRow) {
    confirmAction(
      'Revoke Code',
      `Revoke code ${invite.code}? No one will be able to sign up as a main admin with it anymore.`,
      'Revoke',
      () => handleRevokeInvite(invite.id),
    );
  }

  async function handleRevokeInvite(inviteId: string) {
    setActionError(null);
    setBusyId(inviteId);

    const { error } = await supabase.from('staff_invites').delete().eq('id', inviteId);
    if (error) {
      console.error('revoke admin invite failed', error);
      setActionError('Something went wrong removing that code.');
      setBusyId(null);
      return;
    }

    setInvites((prev) => prev.filter((i) => i.id !== inviteId));
    setBusyId(null);
  }

  async function handlePromote(row: StaffRow) {
    setActionError(null);
    setBusyId(row.id);

    const { error } = await supabase.from('staff').update({ role: 'main_admin' }).eq('id', row.id);
    if (error) {
      console.error('promote failed', error);
      setActionError(
        error.message.includes('Maximum')
          ? error.message
          : 'Something went wrong making that person a main admin.',
      );
      setBusyId(null);
      return;
    }

    setStaff((prev) => prev.map((s) => (s.id === row.id ? { ...s, role: 'main_admin' } : s)));
    setBusyId(null);
  }

  async function handleDemote(row: StaffRow) {
    setActionError(null);
    setBusyId(row.id);

    const { error } = await supabase.from('staff').update({ role: 'staff' }).eq('id', row.id);
    if (error) {
      console.error('demote failed', error);
      setActionError('Something went wrong removing main admin access.');
      setBusyId(null);
      return;
    }

    setStaff((prev) => prev.map((s) => (s.id === row.id ? { ...s, role: 'staff' } : s)));
    setBusyId(null);
  }

  function confirmDemote(row: StaffRow) {
    confirmAction(
      'Remove Main Admin',
      `Remove main admin access from ${row.full_name}?`,
      'Remove',
      () => handleDemote(row),
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <AdminChrome />

        <ScrollView contentContainerStyle={styles.scrollContent}>
          <ThemedText type="title" style={styles.title}>
            Manage Admins
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
              <ThemedText themeColor="textSecondary" type="small">
                {mainAdminCount} of {MAX_MAIN_ADMINS} main admins. Main admins can manage other
                admins, delete staff accounts, and generate sign-up codes.
              </ThemedText>
              <ThemedView style={styles.list}>
                {staff.map((row) => (
                  <ThemedView key={row.id} type="backgroundElement" style={styles.row}>
                    <View style={styles.rowInfo}>
                      <ThemedText style={styles.rowName}>
                        {row.full_name}
                        {row.id === session?.user.id ? ' (You)' : ''}
                      </ThemedText>
                      <ThemedText themeColor="textSecondary" type="small">
                        {row.role === 'main_admin' ? 'Main Admin' : 'Staff'}
                        {row.position ? ` · ${staffPositionLabel(row.position)}` : ''}
                      </ThemedText>
                    </View>
                    <View style={styles.rowActions}>
                      {row.id === session?.user.id ? (
                        <ThemedText themeColor="textSecondary" type="small">
                          Ask another main admin to change your access
                        </ThemedText>
                      ) : busyId === row.id ? (
                        <ActivityIndicator color={theme.text} />
                      ) : row.role === 'staff' ? (
                        <Pressable
                          onPress={() => handlePromote(row)}
                          disabled={mainAdminCount >= MAX_MAIN_ADMINS}>
                          <ThemedText
                            type="link"
                            themeColor={mainAdminCount >= MAX_MAIN_ADMINS ? 'textSecondary' : 'text'}>
                            Make Main Admin
                          </ThemedText>
                        </Pressable>
                      ) : (
                        <Pressable onPress={() => confirmDemote(row)}>
                          <ThemedText type="link">Remove Main Admin</ThemedText>
                        </Pressable>
                      )}
                    </View>
                  </ThemedView>
                ))}
              </ThemedView>

              <ThemedText type="smallBold" style={styles.sectionLabel}>
                Admin Sign-Up Codes
              </ThemedText>
              <ThemedText themeColor="textSecondary" type="small">
                Set a code so someone can sign up as a main admin directly, without needing to be
                promoted afterward. The same code can be used by multiple people until you revoke
                it, and the 3-admin limit above still applies.
              </ThemedText>

              <TextInput
                value={codeInput}
                onChangeText={(value) => setCodeInput(value.toUpperCase())}
                placeholder="Code (e.g. FBCADMIN)"
                placeholderTextColor={theme.textSecondary}
                autoCapitalize="characters"
                autoCorrect={false}
                style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
              />
              {hasAmbiguousChars(codeInput) && (
                <ThemedText themeColor="textSecondary" type="small">
                  Heads up: this code has letters/numbers that look alike (I, L, O, 0, 1) — easy to
                  mistype when someone enters it back. They'll still work, but a code without them
                  is easier to share correctly.
                </ThemedText>
              )}

              <Pressable
                onPress={handleCreateCode}
                disabled={creating || !codeInput.trim() || mainAdminCount >= MAX_MAIN_ADMINS}
                style={({ pressed }) => [
                  styles.button,
                  {
                    backgroundColor: theme.text,
                    opacity:
                      pressed || creating || !codeInput.trim() || mainAdminCount >= MAX_MAIN_ADMINS
                        ? 0.6
                        : 1,
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
                    No admin codes yet.
                  </ThemedText>
                ) : (
                  invites.map((invite) => (
                    <ThemedView key={invite.id} type="backgroundElement" style={styles.row}>
                      <View style={styles.rowInfo}>
                        <ThemedText style={styles.codeText}>{invite.code}</ThemedText>
                        <ThemedText themeColor="textSecondary" type="small">
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
  rowActions: {
    flexDirection: 'row',
    gap: Spacing.three,
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
