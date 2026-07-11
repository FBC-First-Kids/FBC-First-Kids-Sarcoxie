import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';
import { updatePinProfileToken } from '@/lib/pin-auth';

type AuthContextValue = {
  session: Session | null;
  loading: boolean;
  staffName: string | null;
  locked: boolean;
  lock: () => void;
  unlock: () => void;
};

const AuthContext = createContext<AuthContextValue>({
  session: null,
  loading: true,
  staffName: null,
  locked: false,
  lock: () => {},
  unlock: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [staffName, setStaffName] = useState<string | null>(null);
  // Local-only "signed out" view. Deliberately does NOT call supabase.auth.signOut(),
  // which revokes the session's refresh token server-side even with scope 'local' —
  // that would break Quick PIN sign-in, which depends on that token staying valid.
  const [locked, setLocked] = useState(false);

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
      if (Platform.OS !== 'web' && newSession?.user.email && newSession.refresh_token) {
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
      return;
    }

    supabase
      .from('staff')
      .select('full_name')
      .eq('id', session.user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          console.error('staff name lookup failed', error);
          return;
        }
        setStaffName(data?.full_name ?? null);
      });
  }, [session]);

  const lock = () => setLocked(true);
  const unlock = () => setLocked(false);

  return (
    <AuthContext.Provider value={{ session, loading, staffName, locked, lock, unlock }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
