import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AdminChrome } from '@/components/admin-chrome';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { staffPositionLabel } from '@/lib/class-groups';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/hooks/use-theme';

const MAX_MAIN_ADMINS = 3;

type StaffRow = {
  id: string;
  full_name: string;
  role: 'staff' | 'main_admin';
  position: string | null;
};

export default function AdminAdminsScreen() {
  const theme = useTheme();
  const { isMainAdmin } = useAuth();

  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

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

    const { data, error } = await supabase
      .from('staff')
      .select('id, full_name, role, position')
      .order('full_name');

    if (error) {
      console.error('admins load failed', error);
      setLoadError('Could not load staff data.');
      setLoading(false);
      return;
    }

    setStaff(data ?? []);
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
                      <ThemedText style={styles.rowName}>{row.full_name}</ThemedText>
                      <ThemedText themeColor="textSecondary" type="small">
                        {row.role === 'main_admin' ? 'Main Admin' : 'Staff'}
                        {row.position ? ` · ${staffPositionLabel(row.position)}` : ''}
                      </ThemedText>
                    </View>
                    <View style={styles.rowActions}>
                      {busyId === row.id ? (
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
                        <Pressable onPress={() => handleDemote(row)}>
                          <ThemedText type="link">Remove Main Admin</ThemedText>
                        </Pressable>
                      )}
                    </View>
                  </ThemedView>
                ))}
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
});
