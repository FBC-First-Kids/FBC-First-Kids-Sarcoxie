import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { supabase } from '@/lib/supabase';
import { clearPendingInvite, getPendingInvite, redeemInvite } from '@/lib/staff-invites';

type AuthContextValue = {
  session: Session | null;
  loading: boolean;
  staffName: string | null;
  isMainAdmin: boolean;
  staffRowMissing: boolean;
  refreshStaffInfo: () => void;
  signOut: () => void;
  adminUnlocked: boolean;
  unlockAdmin: () => void;
  relockAdmin: () => void;
};

const AuthContext = createContext<AuthContextValue>({
  session: null,
  loading: true,
  staffName: null,
  isMainAdmin: false,
  staffRowMissing: false,
  refreshStaffInfo: () => {},
  signOut: () => {},
  adminUnlocked: false,
  unlockAdmin: () => {},
  relockAdmin: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [staffName, setStaffName] = useState<string | null>(null);
  const [isMainAdmin, setIsMainAdmin] = useState(false);
  const [staffRowMissing, setStaffRowMissing] = useState(false);
  // Bumping this forces the staff-row effect below to re-run without needing the
  // session itself to change — used to pick up role changes (e.g. just-run SQL
  // promotions) without requiring a full sign-out/sign-in.
  const [staffRefreshKey, setStaffRefreshKey] = useState(0);
  // Memoized with a stable identity — several effects elsewhere key off these
  // functions in their dependency arrays (e.g. admin/_layout.tsx's re-lock-on-
  // unmount effect). A fresh function reference on every AuthProvider render
  // would make React treat that as a dependency change and fire the effect's
  // cleanup immediately, even though nothing meaningful changed.
  const refreshStaffInfo = useCallback(() => setStaffRefreshKey((k) => k + 1), []);
  // Re-confirms it's really staff (not a parent/child at the kiosk) before showing
  // admin data. Resets whenever the admin section is left, so it's re-checked each visit.
  const [adminUnlocked, setAdminUnlocked] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setLoading(false);
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setStaffName(null);
      setIsMainAdmin(false);
      setStaffRowMissing(false);
      return;
    }

    let cancelled = false;

    async function loadStaffRow() {
      const { data, error } = await supabase
        .from('staff')
        .select('full_name, role')
        .eq('id', session!.user.id)
        .maybeSingle();

      if (error) {
        console.error('staff lookup failed', error);
        return;
      }
      if (cancelled) return;

      if (data) {
        setStaffName(data.full_name);
        setIsMainAdmin(data.role === 'main_admin');
        setStaffRowMissing(false);
        return;
      }

      // No staff row yet — if email confirmation delayed the invite redemption
      // until now (first real sign-in after confirming), finish it here.
      const pending = await getPendingInvite();
      if (pending) {
        const redeemed = await redeemInvite(pending.code, pending.fullName);
        await clearPendingInvite();
        if (redeemed && !cancelled) {
          await loadStaffRow();
          return;
        }
      }

      if (!cancelled) {
        setStaffName(null);
        setIsMainAdmin(false);
        setStaffRowMissing(true);
      }
    }

    loadStaffRow();

    return () => {
      cancelled = true;
    };
  }, [session, staffRefreshKey]);

  const signOut = useCallback(() => {
    setAdminUnlocked(false);
    supabase.auth.signOut({ scope: 'local' }).catch((err) => {
      console.error('sign out failed', err);
    });
  }, []);
  const unlockAdmin = useCallback(() => setAdminUnlocked(true), []);
  const relockAdmin = useCallback(() => setAdminUnlocked(false), []);

  return (
    <AuthContext.Provider
      value={{
        session,
        loading,
        staffName,
        isMainAdmin,
        staffRowMissing,
        refreshStaffInfo,
        signOut,
        adminUnlocked,
        unlockAdmin,
        relockAdmin,
      }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
