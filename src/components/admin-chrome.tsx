import { usePathname, useRouter } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/hooks/use-theme';

const TABS = [
  { href: '/admin', label: 'History' },
  { href: '/admin/checkin', label: 'Check In/Out' },
  { href: '/admin/add-guardian', label: 'Guardians' },
  { href: '/admin/notifications', label: 'Notifications' },
  { href: '/admin/manage-profiles', label: 'Manage Profiles' },
] as const;

export function AdminChrome() {
  const theme = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const { session, staffName, lock } = useAuth();

  return (
    <ThemedView style={styles.wrapper}>
      <ThemedView style={styles.header}>
        <ThemedText themeColor="textSecondary" style={styles.signedInAs}>
          Signed in as {staffName ?? session?.user.email}
        </ThemedText>
        <ThemedView style={styles.headerLinks}>
          <Pressable onPress={() => router.replace('/')}>
            <ThemedText type="link" themeColor="textSecondary">
              Back to Kiosk
            </ThemedText>
          </Pressable>
          <Pressable onPress={lock}>
            <ThemedText type="link" themeColor="textSecondary">
              Sign Out
            </ThemedText>
          </Pressable>
        </ThemedView>
      </ThemedView>

      <ThemedView style={styles.tabRow}>
        {TABS.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Pressable
              key={tab.href}
              onPress={() => router.replace(tab.href)}
              style={[
                styles.tabButton,
                { backgroundColor: active ? theme.backgroundSelected : theme.backgroundElement },
              ]}>
              <ThemedText type="small" themeColor={active ? 'text' : 'textSecondary'}>
                {tab.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </ThemedView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: Spacing.two,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.two,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  signedInAs: {
    fontSize: 13,
  },
  headerLinks: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  tabRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  tabButton: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: Spacing.five,
  },
});
