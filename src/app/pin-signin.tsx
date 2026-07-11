import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { getPinProfiles, removePinProfile, updatePinProfileToken, type PinProfile } from '@/lib/pin-auth';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/hooks/use-theme';

export default function PinSignInScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { unlock } = useAuth();

  const [profiles, setProfiles] = useState<PinProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<PinProfile | null>(null);
  const [pin, setPin] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadProfiles();
  }, []);

  async function loadProfiles() {
    setLoading(true);
    const stored = await getPinProfiles();
    setProfiles(stored);
    setLoading(false);
  }

  function selectProfile(profile: PinProfile) {
    setSelected(profile);
    setPin('');
    setError(null);
  }

  async function handlePinChange(value: string) {
    const digits = value.replace(/\D/g, '').slice(0, 4);
    setPin(digits);

    if (digits.length === 4 && selected) {
      if (digits !== selected.pin) {
        setError('Incorrect PIN.');
        setPin('');
        return;
      }

      setError(null);
      setSigningIn(true);

      // Re-read from storage rather than trusting the in-memory `selected` snapshot —
      // the background auto-refresh sync may have rotated the token since this
      // screen loaded, and using a stale copy here fails with "Refresh Token Not Found".
      const latestProfiles = await getPinProfiles();
      const latest = latestProfiles.find((p) => p.email === selected.email) ?? selected;

      const { data, error: refreshError } = await supabase.auth.refreshSession({
        refresh_token: latest.refreshToken,
      });

      if (refreshError || !data.session) {
        console.warn('pin sign-in refresh failed (expired token, handled)', refreshError);
        await removePinProfile(selected.email);
        setError('This quick sign-in has expired. Please sign in with email and password.');
        setSigningIn(false);
        setSelected(null);
        await loadProfiles();
        return;
      }

      await updatePinProfileToken(selected.email, data.session.refresh_token);
      setSigningIn(false);
      unlock();
      // AuthGate will redirect to the kiosk home once the session/locked state updates.
    }
  }

  async function handleForget(email: string) {
    await removePinProfile(email);
    await loadProfiles();
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
              {selected.staffName}
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
                { color: theme.text, backgroundColor: theme.backgroundElement },
              ]}
            />
            {signingIn && <ActivityIndicator color={theme.text} />}
            {error && <ThemedText style={styles.error}>{error}</ThemedText>}
          </ThemedView>
        ) : profiles.length === 0 ? (
          <ThemedView style={styles.centerFill}>
            <ThemedText themeColor="textSecondary" style={styles.centerText}>
              No quick sign-ins set up on this device yet.
            </ThemedText>
          </ThemedView>
        ) : (
          <ThemedView style={styles.form}>
            {profiles.map((profile) => (
              <ThemedView key={profile.email} style={styles.profileRow}>
                <Pressable
                  onPress={() => selectProfile(profile)}
                  style={[styles.profileButton, { backgroundColor: theme.backgroundElement }]}>
                  <ThemedText style={styles.profileName}>{profile.staffName}</ThemedText>
                </Pressable>
                <Pressable onPress={() => handleForget(profile.email)} style={styles.forgetLink}>
                  <ThemedText themeColor="textSecondary" type="small">
                    Forget
                  </ThemedText>
                </Pressable>
              </ThemedView>
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
  profileRow: {
    gap: Spacing.one,
  },
  profileButton: {
    height: 56,
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
  },
  profileName: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  forgetLink: {
    alignItems: 'center',
  },
  emailLink: {
    alignItems: 'center',
    marginTop: Spacing.three,
  },
});
