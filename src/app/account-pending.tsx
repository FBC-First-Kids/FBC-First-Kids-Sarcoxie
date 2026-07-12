import { useRouter } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/hooks/use-theme';

export default function AccountPendingScreen() {
  const theme = useTheme();
  const router = useRouter();

  // A real sign-out (not the local PIN-preserving lock) — this account has no staff
  // row, so there's nothing valid to keep a Quick PIN session alive for.
  async function handleSignOut() {
    await supabase.auth.signOut({ scope: 'local' });
    router.replace('/login');
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title" style={styles.title}>
          Account Not Set Up
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.centerText}>
          This sign-in isn't linked to a staff profile yet. If you just signed up, make sure you
          used a valid invite code from an admin. Otherwise, please ask a main admin for help.
        </ThemedText>
        <Pressable
          onPress={handleSignOut}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: theme.text, opacity: pressed ? 0.7 : 1 },
          ]}>
          <ThemedText style={[styles.buttonText, { color: theme.background }]}>
            Sign Out
          </ThemedText>
        </Pressable>
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
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  title: {
    textAlign: 'center',
  },
  centerText: {
    textAlign: 'center',
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
