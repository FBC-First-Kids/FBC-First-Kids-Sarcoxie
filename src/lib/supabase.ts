import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. Set them in your .env file.',
  );
}

// expo-router's static web export server-renders every route in Node, where
// there's no window/localStorage. Skip storage/session persistence there so
// module evaluation doesn't crash the export or dev server.
const isBrowser = Platform.OS !== 'web' || typeof window !== 'undefined';

// On web, keep the session only for as long as this tab/PWA instance is open —
// localStorage (what AsyncStorage uses under the hood on web) persists across
// closing and reopening the app entirely, which is the opposite of what a
// shared kiosk device wants. sessionStorage is cleared when the tab/app closes.
// Wrapped in try/catch, matching AsyncStorage's own web shim — some browser
// privacy modes (e.g. Safari Lockdown Mode, "Block All Cookies") throw
// synchronously on storage access instead of just failing quietly.
const webSessionStorage = {
  getItem: (key: string) => {
    try {
      return Promise.resolve(window.sessionStorage.getItem(key));
    } catch (err) {
      console.error('sessionStorage getItem failed', err);
      return Promise.resolve(null);
    }
  },
  setItem: (key: string, value: string) => {
    try {
      window.sessionStorage.setItem(key, value);
    } catch (err) {
      console.error('sessionStorage setItem failed', err);
    }
    return Promise.resolve();
  },
  removeItem: (key: string) => {
    try {
      window.sessionStorage.removeItem(key);
    } catch (err) {
      console.error('sessionStorage removeItem failed', err);
    }
    return Promise.resolve();
  },
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: !isBrowser ? undefined : Platform.OS === 'web' ? webSessionStorage : AsyncStorage,
    autoRefreshToken: isBrowser,
    persistSession: isBrowser,
    detectSessionInUrl: false,
  },
});

if (isBrowser) {
  // Supabase stops auto-refreshing the session when the app backgrounds; this
  // keeps refresh timers running while active and paused otherwise.
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}
