import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { supabase } from '@/lib/supabase';
import { updatePinProfileToken } from '@/lib/pin-auth';
import { clearPendingInvite, getPendingInvite, redeemInvite } from '@/lib/staff-invites';

type AuthContextValue = {
  session: Session | null;
  loading: boolean;
  staffName: string | null;
  isMainAdmin: boolean;
  staffRowMissing: boolean;
  locked: boolean;
  lock: () => void;
  unlock: () => void;
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
  locked: false,
  lock: () => {},
  unlock: () => {},
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
  // Local-only "signed out" view. Deliberately does NOT call supabase.auth.signOut(),
  // which revokes the session's refresh token server-side even with scope 'local' —
  // that would break Quick PIN sign-in, which depends on that token staying valid.
  const [locked, setLocked] = useState(false);
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

      // Supabase rotates the refresh token on every background refresh, which
      // invalidates whatever was stored at PIN setup time. Keep it in sync here
      // so Quick PIN sign-in always has a currently-valid token.
      if (newSession?.user.email && newSession.refresh_token) {
        updatePinProfileToken(newSession.user.email, newSession.refresh_token).catch((err) => {
          console.error('pin-auth: failed to sync refreshed token', err);
        });
      }
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
  }, [session]);

  const lock = () => {
    setLocked(true);
    setAdminUnlocked(false);
  };
  const unlock = () => setLocked(false);
  const unlockAdmin = () => setAdminUnlocked(true);
  const relockAdmin = () => setAdminUnlocked(false);

  return (
    <AuthContext.Provider
      value={{
        session,
        loading,
        staffName,
        isMainAdmin,
        staffRowMissing,
        locked,
        lock,
        unlock,
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
