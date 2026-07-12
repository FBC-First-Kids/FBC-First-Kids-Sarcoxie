import { Redirect, Stack, useRootNavigationState } from 'expo-router';
import { useEffect } from 'react';

import { useAuth } from '@/lib/auth-context';

export default function AdminLayout() {
  const { adminUnlocked, relockAdmin, refreshStaffInfo } = useAuth();
  const rootNavigationState = useRootNavigationState();

  // Leaving the admin section entirely (unmounting this layout) re-locks it, so the
  // PIN is required again next time — switching between admin tabs doesn't unmount it.
  useEffect(() => {
    return () => relockAdmin();
  }, [relockAdmin]);

  // Re-fetch the staff row (role, name) every time admin is entered, so a role
  // change made elsewhere (or just after running SQL) shows up without requiring
  // a full sign-out/sign-in. Deliberately only depends on adminUnlocked —
  // refreshStaffInfo isn't memoized, and reacting to it too would refetch on
  // every unrelated AuthProvider re-render.
  useEffect(() => {
    if (adminUnlocked) {
      refreshStaffInfo();
    }
  }, [adminUnlocked]);

  // On a fresh/direct load straight into /admin, the root navigator isn't mounted yet —
  // redirecting before it's ready throws "navigate before mounting Root Layout". Wait
  // for it here rather than racing it.
  if (!rootNavigationState?.key) {
    return null;
  }

  if (!adminUnlocked) {
    return <Redirect href="/admin-pin" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
