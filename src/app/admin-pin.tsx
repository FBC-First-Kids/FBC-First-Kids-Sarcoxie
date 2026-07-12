import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { verifyOwnPin } from '@/lib/pin-auth';
import { useTheme } from '@/hooks/use-theme';

export default function AdminPinScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { unlockAdmin } = useAuth();

  const [pin, setPin] = useState('');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePinChange(value: string) {
    const digits = value.replace(/\D/g, '').slice(0, 4);
    setPin(digits);

    if (digits.length === 4) {
      setChecking(true);
      setError(null);

      const valid = await verifyOwnPin(digits);
      setChecking(false);

      if (valid) {
        unlockAdmin();
        router.replace('/admin');
      } else {
        setError('Incorrect PIN.');
        setPin('');
      }
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title" style={styles.title}>
          Admin Access
        </ThemedText>

        <ThemedView style={styles.form}>
          <ThemedText themeColor="textSecondary" style={styles.centerText}>
            Enter your PIN to continue.
          </ThemedText>
          <TextInput
            value={pin}
            onChangeText={handlePinChange}
            placeholder="Enter PIN"
            placeholderTextColor={theme.textSecondary}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={4}
            autoFocus
            editable={!checking}
            style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
          />
          {checking && <ActivityIndicator color={theme.text} />}
          {error && <ThemedText style={styles.error}>{error}</ThemedText>}

          <Pressable onPress={() => router.replace('/setup-pin')} style={styles.setupLink}>
            <ThemedText type="link" themeColor="textSecondary">
              Haven't set up a PIN yet? Set Up Quick PIN
            </ThemedText>
          </Pressable>
        </ThemedView>

        <Pressable onPress={() => router.replace('/')} style={styles.cancelLink}>
          <ThemedText type="link" themeColor="textSecondary">
            Back to Kiosk
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
  centerText: {
    textAlign: 'center',
  },
  form: {
    gap: Spacing.three,
  },
  input: {
    height: 56,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    fontSize: 24,
    textAlign: 'center',
    letterSpacing: 12,
  },
  error: {
    color: '#D0342C',
    textAlign: 'center',
  },
  setupLink: {
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  cancelLink: {
    alignItems: 'center',
    marginTop: Spacing.three,
  },
});
