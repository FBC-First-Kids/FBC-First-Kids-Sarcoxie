import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { signInWithPin } from '@/lib/pin-auth';
import { useTheme } from '@/hooks/use-theme';

export default function PinSignInScreen() {
  const theme = useTheme();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignIn() {
    setError(null);
    setSigningIn(true);

    const { error: signInError } = await signInWithPin(email.trim(), pin);
    setSigningIn(false);

    if (signInError) {
      setError(signInError);
      setPin('');
      return;
    }

    // AuthGate will redirect to the kiosk home once the session updates.
  }

  const canSubmit = email.trim().length > 0 && pin.length === 4 && !signingIn;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title" style={styles.title}>
          Quick Sign In
        </ThemedText>

        <ThemedView style={styles.form}>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="Email"
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            editable={!signingIn}
            style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
          />
          <TextInput
            value={pin}
            onChangeText={(value) => setPin(value.replace(/\D/g, '').slice(0, 4))}
            placeholder="PIN"
            placeholderTextColor={theme.textSecondary}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={4}
            editable={!signingIn}
            style={[
              styles.input,
              styles.pinInput,
              { color: theme.text, backgroundColor: theme.backgroundElement },
            ]}
          />

          {error && <ThemedText style={styles.error}>{error}</ThemedText>}

          <Pressable
            onPress={handleSignIn}
            disabled={!canSubmit}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: theme.text, opacity: !canSubmit || pressed ? 0.6 : 1 },
            ]}>
            {signingIn ? (
              <ActivityIndicator color={theme.background} />
            ) : (
              <ThemedText style={[styles.buttonText, { color: theme.background }]}>
                Sign In
              </ThemedText>
            )}
          </Pressable>
        </ThemedView>

        <Pressable onPress={() => router.replace('/login')} style={styles.emailLink}>
          <ThemedText type="link" themeColor="textSecondary">
            Use email and password instead
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
  pinInput: {
    fontSize: 24,
    textAlign: 'center',
    letterSpacing: 12,
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
  emailLink: {
    alignItems: 'center',
    marginTop: Spacing.three,
  },
});
