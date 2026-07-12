import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AdminChrome } from '@/components/admin-chrome';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/hooks/use-theme';

const MAX_MAIN_ADMINS = 3;
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no O/0, I/1 — easier to read aloud

function generateInviteCode() {
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

type StaffRow = {
  id: string;
  full_name: string;
  role: 'staff' | 'main_admin';
};

type InviteRow = {
  id: string;
  code: string;
  created_at: string;
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
  const [generating, setGenerating] = useState(false);

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
        supabase.from('staff').select('id, full_name, role').order('full_name'),
        supabase
          .from('staff_invites')
          .select('id, code, created_at')
          .is('used_at', null)
          .order('created_at', { ascending: false }),
      ]);

    if (staffError || inviteError) {
      console.error('admins load failed', staffError, inviteError);
      setLoadError('Could not load admin data.');
      setLoading(false);
      return;
    }

    setStaff(staffRows ?? []);
    setInvites(inviteRows ?? []);
    setLoading(false);
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

  function confirmRemoveStaff(row: StaffRow) {
    Alert.alert(
      'Remove Admin',
      `Remove ${row.full_name}? They will no longer be able to sign in to this app.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => handleRemoveStaff(row.id) },
      ],
    );
  }

  async function handleRemoveStaff(staffId: string) {
    setActionError(null);
    setBusyId(staffId);

    const { error } = await supabase.from('staff').delete().eq('id', staffId);
    if (error) {
      console.error('remove staff failed', error);
      setActionError('Something went wrong removing that admin.');
      setBusyId(null);
      return;
    }

    setStaff((prev) => prev.filter((s) => s.id !== staffId));
    setBusyId(null);
  }

  async function handleGenerateInvite() {
    if (!session) return;
    setActionError(null);
    setGenerating(true);

    const code = generateInviteCode();
    const { data, error } = await supabase
      .from('staff_invites')
      .insert({ code, created_by: session.user.id })
      .select('id, code, created_at')
      .single();

    if (error || !data) {
      console.error('invite create failed', error);
      setActionError('Something went wrong creating an invite code.');
      setGenerating(false);
      return;
    }

    setInvites((prev) => [data, ...prev]);
    setGenerating(false);
  }

  function confirmRevokeInvite(invite: InviteRow) {
    Alert.alert('Revoke Invite Code', `Revoke code ${invite.code}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Revoke', style: 'destructive', onPress: () => handleRevokeInvite(invite.id) },
    ]);
  }

  async function handleRevokeInvite(inviteId: string) {
    setActionError(null);
    setBusyId(inviteId);

    const { error } = await supabase.from('staff_invites').delete().eq('id', inviteId);
    if (error) {
      console.error('revoke invite failed', error);
      setActionError('Something went wrong revoking that code.');
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
            Admins
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
                Staff ({mainAdminCount} of {MAX_MAIN_ADMINS} main admins)
              </ThemedText>
              <ThemedView style={styles.list}>
                {staff.map((row) => (
                  <ThemedView key={row.id} type="backgroundElement" style={styles.row}>
                    <View style={styles.rowInfo}>
                      <ThemedText style={styles.rowName}>{row.full_name}</ThemedText>
                      <ThemedText themeColor="textSecondary" type="small">
                        {row.role === 'main_admin' ? 'Main Admin' : 'Staff'}
                      </ThemedText>
                    </View>
                    <View style={styles.rowActions}>
                      {busyId === row.id ? (
                        <ActivityIndicator color={theme.text} />
                      ) : (
                        <>
                          {row.role === 'staff' ? (
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
                            <Pressable onPress={() => handleDemote(row)}>
                              <ThemedText type="link">Remove Main Admin</ThemedText>
                            </Pressable>
                          )}
                          <Pressable onPress={() => confirmRemoveStaff(row)}>
                            <ThemedText style={styles.deleteText}>Remove</ThemedText>
                          </Pressable>
                        </>
                      )}
                    </View>
                  </ThemedView>
                ))}
              </ThemedView>

              <ThemedText type="smallBold" style={styles.sectionLabel}>
                Invite Codes
              </ThemedText>
              <ThemedText themeColor="textSecondary" type="small">
                Share a code with a new staff member so they can create an account. Each code works
                once.
              </ThemedText>

              <Pressable
                onPress={handleGenerateInvite}
                disabled={generating}
                style={({ pressed }) => [
                  styles.button,
                  { backgroundColor: theme.text, opacity: pressed || generating ? 0.6 : 1 },
                ]}>
                {generating ? (
                  <ActivityIndicator color={theme.background} />
                ) : (
                  <ThemedText style={[styles.buttonText, { color: theme.background }]}>
                    Generate Invite Code
                  </ThemedText>
                )}
              </Pressable>

              <ThemedView style={styles.list}>
                {invites.length === 0 ? (
                  <ThemedText themeColor="textSecondary" type="small" style={styles.centerText}>
                    No pending invite codes.
                  </ThemedText>
                ) : (
                  invites.map((invite) => (
                    <ThemedView key={invite.id} type="backgroundElement" style={styles.row}>
                      <ThemedText style={styles.codeText}>{invite.code}</ThemedText>
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
