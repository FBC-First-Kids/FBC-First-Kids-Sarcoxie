import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { checkInviteCode, redeemInvite, setPendingInvite } from '@/lib/staff-invites';
import { supabase } from '@/lib/supabase';

export default function SignUpScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkEmailMessage, setCheckEmailMessage] = useState<string | null>(null);

  async function handleSignUp() {
    setError(null);

    if (!fullName.trim()) {
      setError('Please enter your name.');
      return;
    }
    const code = inviteCode.trim();
    if (!code) {
      setError('Please enter your invite code from an admin.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);

    const codeValid = await checkInviteCode(code);
    if (!codeValid) {
      setError('That invite code is invalid or has expired. Please ask an admin for a new one.');
      setLoading(false);
      return;
    }

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    if (data.session) {
      const redeemed = await redeemInvite(code, fullName.trim());
      if (!redeemed) {
        setError(
          'That invite code was just used by someone else. Please ask an admin for a new one, then sign in with the email and password you just set.',
        );
        setLoading(false);
        return;
      }

      setLoading(false);
      router.replace('/');
      return;
    }

    // Email confirmation is required — the code gets redeemed once they confirm
    // and sign in for the first time (handled in auth-context).
    await setPendingInvite({ code, fullName: fullName.trim() });

    setLoading(false);
    setCheckEmailMessage(
      `Account created! Check ${email.trim()} for a confirmation link, then come back and sign in.`,
    );
  }

  const canSubmit =
    fullName.trim().length > 0 &&
    inviteCode.trim().length > 0 &&
    email.trim().length > 0 &&
    password.length > 0 &&
    confirmPassword.length > 0 &&
    !loading;

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardAvoiding}>
        <SafeAreaView style={styles.safeArea}>
          <ThemedText type="title" style={styles.title}>
            Staff Sign Up
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.subtitle}>
            You'll need an invite code from an admin to create a staff account.
          </ThemedText>

          {checkEmailMessage ? (
            <ThemedText style={styles.centerText}>{checkEmailMessage}</ThemedText>
          ) : (
            <ThemedView style={styles.form}>
              <TextInput
                value={fullName}
                onChangeText={setFullName}
                placeholder="Your Full Name"
                placeholderTextColor={theme.textSecondary}
                autoComplete="name"
                textContentType="name"
                style={[
                  styles.input,
                  { color: theme.text, backgroundColor: theme.backgroundElement },
                ]}
              />
              <TextInput
                value={inviteCode}
                onChangeText={setInviteCode}
                placeholder="Invite Code"
                placeholderTextColor={theme.textSecondary}
                autoCapitalize="characters"
                style={[
                  styles.input,
                  { color: theme.text, backgroundColor: theme.backgroundElement },
                ]}
              />
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="Email"
                placeholderTextColor={theme.textSecondary}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                textContentType="emailAddress"
                style={[
                  styles.input,
                  { color: theme.text, backgroundColor: theme.backgroundElement },
                ]}
              />
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Password"
                placeholderTextColor={theme.textSecondary}
                autoCapitalize="none"
                autoComplete="new-password"
                textContentType="newPassword"
                secureTextEntry
                style={[
                  styles.input,
                  { color: theme.text, backgroundColor: theme.backgroundElement },
                ]}
              />
              <TextInput
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Confirm Password"
                placeholderTextColor={theme.textSecondary}
                autoCapitalize="none"
                autoComplete="new-password"
                textContentType="newPassword"
                secureTextEntry
                style={[
                  styles.input,
                  { color: theme.text, backgroundColor: theme.backgroundElement },
                ]}
              />

              {error && (
                <ThemedText themeColor="text" style={styles.error}>
                  {error}
                </ThemedText>
              )}

              <Pressable
                onPress={handleSignUp}
                disabled={!canSubmit}
                style={({ pressed }) => [
                  styles.button,
                  { backgroundColor: theme.text, opacity: !canSubmit || pressed ? 0.6 : 1 },
                ]}>
                {loading ? (
                  <ActivityIndicator color={theme.background} />
                ) : (
                  <ThemedText style={[styles.buttonText, { color: theme.background }]}>
                    Create Account
                  </ThemedText>
                )}
              </Pressable>

              <Pressable onPress={() => router.push('/login')} style={styles.loginLink}>
                <ThemedText type="link" themeColor="textSecondary">
                  Already have an account? Sign In
                </ThemedText>
              </Pressable>
            </ThemedView>
          )}
        </SafeAreaView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardAvoiding: {
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
  subtitle: {
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
  },
  buttonText: {
    fontWeight: '600',
  },
  loginLink: {
    alignItems: 'center',
    marginTop: Spacing.two,
  },
});
