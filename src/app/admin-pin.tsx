import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { getPinProfiles, type PinProfile } from '@/lib/pin-auth';
import { useTheme } from '@/hooks/use-theme';

export default function AdminPinScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { session, unlockAdmin } = useAuth();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<PinProfile | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getPinProfiles().then((profiles) => {
      setProfile(profiles.find((p) => p.email === session?.user.email) ?? null);
      setLoading(false);
    });
  }, [session?.user.email]);

  function handlePinChange(value: string) {
    const digits = value.replace(/\D/g, '').slice(0, 4);
    setPin(digits);

    if (digits.length === 4) {
      if (profile && digits === profile.pin) {
        setError(null);
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

        {loading ? (
          <ActivityIndicator color={theme.text} style={styles.centerFill} />
        ) : profile ? (
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
              style={[
                styles.input,
                { color: theme.text, backgroundColor: theme.backgroundElement },
              ]}
            />
            {error && <ThemedText style={styles.error}>{error}</ThemedText>}
          </ThemedView>
        ) : (
          <ThemedView style={styles.form}>
            <ThemedText themeColor="textSecondary" style={styles.centerText}>
              You need a Quick PIN set up on this device before you can access Admin.
            </ThemedText>
            <Pressable
              onPress={() => router.replace('/setup-pin')}
              style={({ pressed }) => [
                styles.button,
                { backgroundColor: theme.text, opacity: pressed ? 0.7 : 1 },
              ]}>
              <ThemedText style={[styles.buttonText, { color: theme.background }]}>
                Set Up Quick PIN
              </ThemedText>
            </Pressable>
          </ThemedView>
        )}

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
  centerFill: {
    flex: 1,
    justifyContent: 'center',
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
  button: {
    height: 48,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontWeight: '600',
  },
  cancelLink: {
    alignItems: 'center',
    marginTop: Spacing.three,
  },
});
