import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { listPinStaff, signInWithPin, type PinStaffOption } from '@/lib/pin-auth';
import { useTheme } from '@/hooks/use-theme';

export default function PinSignInScreen() {
  const theme = useTheme();
  const router = useRouter();

  const [staff, setStaff] = useState<PinStaffOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<PinStaffOption | null>(null);
  const [pin, setPin] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listPinStaff().then((options) => {
      setStaff(options);
      setLoading(false);
    });
  }, []);

  function selectStaff(option: PinStaffOption) {
    setSelected(option);
    setPin('');
    setError(null);
  }

  async function handlePinChange(value: string) {
    const digits = value.replace(/\D/g, '').slice(0, 4);
    setPin(digits);

    if (digits.length === 4 && selected) {
      setError(null);
      setSigningIn(true);

      const { error: signInError } = await signInWithPin(selected.id, digits);
      setSigningIn(false);

      if (signInError) {
        setError(signInError);
        setPin('');
        return;
      }

      // AuthGate will redirect to the kiosk home once the session updates.
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title" style={styles.title}>
          Quick Sign In
        </ThemedText>

        {loading ? (
          <ActivityIndicator color={theme.text} style={styles.centerFill} />
        ) : selected ? (
          <ThemedView style={styles.form}>
            <Pressable onPress={() => setSelected(null)} style={styles.backLink}>
              <ThemedText type="link">{'< Choose someone else'}</ThemedText>
            </Pressable>
            <ThemedText type="subtitle" style={styles.centerText}>
              {selected.full_name}
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
              editable={!signingIn}
              style={[
                styles.input,
                styles.pinInput,
                { color: theme.text, backgroundColor: theme.backgroundElement },
              ]}
            />
            {signingIn && <ActivityIndicator color={theme.text} />}
            {error && <ThemedText style={styles.error}>{error}</ThemedText>}
          </ThemedView>
        ) : staff.length === 0 ? (
          <ThemedView style={styles.centerFill}>
            <ThemedText themeColor="textSecondary" style={styles.centerText}>
              No one has set up a Quick PIN yet.
            </ThemedText>
          </ThemedView>
        ) : (
          <ThemedView style={styles.form}>
            {staff.map((option) => (
              <Pressable
                key={option.id}
                onPress={() => selectStaff(option)}
                style={[styles.staffButton, { backgroundColor: theme.backgroundElement }]}>
                <ThemedText style={styles.staffName}>{option.full_name}</ThemedText>
              </Pressable>
            ))}
          </ThemedView>
        )}

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
  backLink: {
    alignItems: 'center',
  },
  input: {
    height: 48,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
  pinInput: {
    height: 56,
    fontSize: 24,
    textAlign: 'center',
    letterSpacing: 12,
  },
  error: {
    color: '#D0342C',
    textAlign: 'center',
  },
  staffButton: {
    height: 56,
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
  },
  staffName: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  emailLink: {
    alignItems: 'center',
    marginTop: Spacing.three,
  },
});
