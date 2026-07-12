import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { maybePromoteChildren } from '@/lib/grade-promotion';
import { clearLegacyPinData } from '@/lib/pin-auth';

SplashScreen.preventAutoHideAsync();

function AuthGate() {
  const { session, loading, staffRowMissing } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    clearLegacyPinData();
  }, []);

  useEffect(() => {
    if (loading) return;

    const onAuthScreen =
      segments[0] === 'login' || segments[0] === 'signup' || segments[0] === 'pin-signin';
    const onAccountPending = segments[0] === 'account-pending';
    const authed = session && !staffRowMissing;
    // A valid Supabase session but no matching staff row (e.g. an invite code was
    // never redeemed) — block them from the kiosk instead of treating them as staff.
    const blocked = session && staffRowMissing;

    if (blocked) {
      if (!onAccountPending) {
        if (router.canDismiss()) router.dismissAll();
        router.replace('/account-pending');
      }
      return;
    }

    if (onAccountPending) {
      if (router.canDismiss()) router.dismissAll();
      router.replace(authed ? '/' : '/login');
      return;
    }

    if (!authed && !onAuthScreen) {
      // Clear any stacked modals (parent-signin, admin, etc.) before redirecting so
      // we don't leave stale screens sitting underneath the login modal.
      if (router.canDismiss()) router.dismissAll();
      router.replace('/login');
    } else if (authed && onAuthScreen) {
      // Same here — clear the login/pin-signin modal stack so PIN sign-in lands
      // cleanly on the kiosk home instead of revealing a leftover screen underneath.
      if (router.canDismiss()) router.dismissAll();
      router.replace('/');
    }
  }, [session, staffRowMissing, loading, segments, router]);

  useEffect(() => {
    if (session) {
      maybePromoteChildren();
    }
  }, [session]);

  return null;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AuthProvider>
        <AnimatedSplashOverlay />
        <AuthGate />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="login" options={{ presentation: 'modal' }} />
          <Stack.Screen name="signup" options={{ presentation: 'modal' }} />
          <Stack.Screen name="pin-signin" options={{ presentation: 'modal' }} />
          <Stack.Screen name="setup-pin" options={{ presentation: 'modal' }} />
          <Stack.Screen name="admin-pin" options={{ presentation: 'modal' }} />
          <Stack.Screen name="account-pending" options={{ presentation: 'modal' }} />
          <Stack.Screen name="parent-signin" options={{ presentation: 'modal' }} />
          <Stack.Screen name="admin" options={{ presentation: 'modal' }} />
        </Stack>
      </AuthProvider>
    </ThemeProvider>
  );
}
