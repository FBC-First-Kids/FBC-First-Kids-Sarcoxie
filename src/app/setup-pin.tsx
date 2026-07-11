import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { savePinProfile } from '@/lib/pin-auth';
import { useTheme } from '@/hooks/use-theme';

export default function SetupPinScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { session, staffName } = useAuth();

  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSave() {
    setError(null);

    if (!/^\d{4}$/.test(pin)) {
      setError('PIN must be exactly 4 digits.');
      return;
    }
    if (pin !== confirmPin) {
      setError('PINs do not match.');
      return;
    }
    if (!session?.user.email || !session.refresh_token) {
      setError('Something went wrong. Please sign in again.');
      return;
    }

    setSaving(true);
    try {
      const saved = await savePinProfile({
        email: session.user.email,
        staffName: staffName ?? session.user.email,
        pin,
        refreshToken: session.refresh_token,
      });
      if (saved) {
        setSuccess(true);
      } else {
        setError('Your PIN did not save correctly. Please try again.');
      }
    } catch (err) {
      console.error('save pin profile failed', err);
      setError('Something went wrong saving your PIN.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <Pressable onPress={() => router.replace('/')} style={styles.cancel}>
          <ThemedText type="link" themeColor="textSecondary">
            Back to Kiosk
          </ThemedText>
        </Pressable>

        <ThemedText type="title" style={styles.title}>
          Quick PIN Sign-In
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.subtitle}>
          Set a 4-digit PIN to sign in faster on this iPad next time.
        </ThemedText>

        {success ? (
          <ThemedView style={styles.centerFill}>
            <ThemedText type="subtitle" style={styles.centerText}>
              PIN set up! You can use it next time you sign in on this device.
            </ThemedText>
          </ThemedView>
        ) : (
          <ThemedView style={styles.form}>
            <TextInput
              value={pin}
              onChangeText={(value) => setPin(value.replace(/\D/g, '').slice(0, 4))}
              placeholder="New PIN"
              placeholderTextColor={theme.textSecondary}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={4}
              style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
            />
            <TextInput
              value={confirmPin}
              onChangeText={(value) => setConfirmPin(value.replace(/\D/g, '').slice(0, 4))}
              placeholder="Confirm PIN"
              placeholderTextColor={theme.textSecondary}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={4}
              style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
            />

            {error && <ThemedText style={styles.error}>{error}</ThemedText>}

            <Pressable
              onPress={handleSave}
              disabled={saving}
              style={({ pressed }) => [
                styles.button,
                { backgroundColor: theme.text, opacity: pressed || saving ? 0.6 : 1 },
              ]}>
              {saving ? (
                <ActivityIndicator color={theme.background} />
              ) : (
                <ThemedText style={[styles.buttonText, { color: theme.background }]}>
                  Save PIN
                </ThemedText>
              )}
            </Pressable>
          </ThemedView>
        )}
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
  cancel: {
    position: 'absolute',
    top: Spacing.three,
    right: Spacing.four,
  },
  title: {
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: Spacing.three,
  },
  centerText: {
    textAlign: 'center',
  },
  centerFill: {
    flex: 1,
    justifyContent: 'center',
  },
  form: {
    gap: Spacing.three,
  },
  input: {
    height: 48,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
    textAlign: 'center',
    letterSpacing: 8,
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
});
