import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { redeemInvite } from '@/lib/staff-invites';
import { useTheme } from '@/hooks/use-theme';

export default function AccountPendingScreen() {
  const theme = useTheme();
  const { signOut, refreshStaffInfo } = useAuth();
  const [fullName, setFullName] = useState('');
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRetry() {
    if (!fullName.trim() || !code.trim()) {
      setError('Enter your name and invite code.');
      return;
    }
    setError(null);
    setSubmitting(true);

    const result = await redeemInvite(code.trim(), fullName.trim());
    setSubmitting(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }

    // Redemption created the staff row — ask auth-context to re-check, which
    // will flip staffRowMissing to false and let the app's root layout
    // automatically navigate away from this screen.
    refreshStaffInfo();
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title" style={styles.title}>
          Account Not Set Up
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.centerText}>
          This sign-in isn't linked to a staff profile yet. Enter your name and invite code below
          to finish setting up your account, or ask a main admin for help.
        </ThemedText>

        <TextInput
          value={fullName}
          onChangeText={setFullName}
          placeholder="Your Full Name"
          placeholderTextColor={theme.textSecondary}
          autoComplete="name"
          textContentType="name"
          style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
        />
        <TextInput
          value={code}
          onChangeText={setCode}
          placeholder="Invite Code"
          placeholderTextColor={theme.textSecondary}
          autoCapitalize="characters"
          style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
        />

        {error && <ThemedText style={styles.error}>{error}</ThemedText>}

        <Pressable
          onPress={handleRetry}
          disabled={submitting}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: theme.text, opacity: pressed || submitting ? 0.7 : 1 },
          ]}>
          {submitting ? (
            <ActivityIndicator color={theme.background} />
          ) : (
            <ThemedText style={[styles.buttonText, { color: theme.background }]}>
              Finish Setup
            </ThemedText>
          )}
        </Pressable>

        <Pressable
          onPress={signOut}
          style={({ pressed }) => [
            styles.signOutButton,
            { opacity: pressed ? 0.7 : 1 },
          ]}>
          <ThemedText themeColor="textSecondary">Sign Out</ThemedText>
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
    marginTop: Spacing.two,
  },
  buttonText: {
    fontWeight: '600',
  },
  signOutButton: {
    alignItems: 'center',
    marginTop: Spacing.two,
  },
});
