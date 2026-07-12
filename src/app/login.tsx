import { Image } from 'expo-image';
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
import { supabase } from '@/lib/supabase';

export default function LoginScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignIn() {
    setError(null);
    setLoading(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);

    if (signInError) {
      setError(signInError.message);
      return;
    }
    router.replace('/');
  }

  const canSubmit = email.trim().length > 0 && password.length > 0 && !loading;

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardAvoiding}>
        <SafeAreaView style={styles.safeArea}>
          <Image
            source={require('@/assets/images/first-kids-logo.png')}
            style={styles.logo}
            contentFit="contain"
          />
          <ThemedText type="title" style={styles.title}>
            Staff Sign In
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.subtitle}>
            Sign in to check children in and out.
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
              style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
            />
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="Password"
              placeholderTextColor={theme.textSecondary}
              autoCapitalize="none"
              autoComplete="password"
              textContentType="password"
              secureTextEntry
              style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
            />

            {error && (
              <ThemedText themeColor="text" style={styles.error}>
                {error}
              </ThemedText>
            )}

            <Pressable
              onPress={handleSignIn}
              disabled={!canSubmit}
              style={({ pressed }) => [
                styles.button,
                { backgroundColor: theme.text, opacity: !canSubmit || pressed ? 0.6 : 1 },
              ]}>
              {loading ? (
                <ActivityIndicator color={theme.background} />
              ) : (
                <ThemedText style={[styles.buttonText, { color: theme.background }]}>
                  Sign In
                </ThemedText>
              )}
            </Pressable>

            <Pressable onPress={() => router.push('/signup')} style={styles.signupLink}>
              <ThemedText type="link" themeColor="textSecondary">
                Need an account? Sign Up Now
              </ThemedText>
            </Pressable>

            <Pressable onPress={() => router.push('/pin-signin')} style={styles.signupLink}>
              <ThemedText type="link">Use PIN Instead</ThemedText>
            </Pressable>
          </ThemedView>
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
  logo: {
    width: 120,
    height: 120,
    alignSelf: 'center',
    marginBottom: Spacing.two,
  },
  title: {
    textAlign: 'center',
  },
  subtitle: {
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
  signupLink: {
    alignItems: 'center',
    marginTop: Spacing.two,
  },
});
