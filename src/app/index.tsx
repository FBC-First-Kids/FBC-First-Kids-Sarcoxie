import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/hooks/use-theme';

export default function KioskHomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { session, staffName, lock } = useAuth();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.header}>
          <ThemedText themeColor="textSecondary" style={styles.signedInAs}>
            Signed in as {staffName ?? session?.user.email}
          </ThemedText>
          <ThemedView style={styles.headerLinks}>
            <Pressable onPress={() => router.push('/setup-pin')}>
              <ThemedText type="link" themeColor="textSecondary">
                Set Up Quick PIN
              </ThemedText>
            </Pressable>
            <Pressable onPress={lock}>
              <ThemedText type="link" themeColor="textSecondary">
                Sign Out
              </ThemedText>
            </Pressable>
          </ThemedView>
        </ThemedView>

        <ThemedView style={styles.heroSection}>
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

          <Pressable
            onPress={() => router.push('/parent-signin')}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: theme.text, opacity: pressed ? 0.7 : 1 },
            ]}>
            <ThemedText style={[styles.buttonText, { color: theme.background }]}>
              Parent Sign In
            </ThemedText>
          </Pressable>

          <Pressable
            onPress={() => router.push('/admin')}
            style={({ pressed }) => [styles.adminButton, { opacity: pressed ? 0.6 : 1 }]}>
            <ThemedText type="link" themeColor="textSecondary">
              Admin User
            </ThemedText>
          </Pressable>
        </ThemedView>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Spacing.three,
  },
  signedInAs: {
    fontSize: 13,
  },
  headerLinks: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  heroSection: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.four,
  },
  logo: {
    width: 120,
    height: 120,
  },
  title: {
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
    fontSize: 18,
  },
  button: {
    height: 56,
    paddingHorizontal: Spacing.five,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.three,
  },
  buttonText: {
    fontWeight: '600',
    fontSize: 18,
  },
  adminButton: {
    marginTop: Spacing.two,
  },
});
