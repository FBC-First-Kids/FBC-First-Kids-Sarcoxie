import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

// PIN storage/verification lives entirely server-side now (hashed, with attempt
// lockout — see the set_staff_pin / verify_staff_pin / verify_own_pin RPCs and
// the pin-signin Edge Function) so a PIN works from any device, not just the
// one it was set up on.

const LEGACY_STORAGE_KEY = 'kids_checkin_pin_profiles';

// The old device-local PIN system stored a plaintext PIN and a live Supabase
// refresh token under this key. Delete it so nothing sensitive is left behind
// on devices that used Quick PIN before this server-verified rewrite — there's
// no more code path that reads or clears it otherwise.
export async function clearLegacyPinData() {
  try {
    if (Platform.OS === 'web') {
      window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    } else {
      await SecureStore.deleteItemAsync(LEGACY_STORAGE_KEY);
    }
  } catch (err) {
    console.error('failed to clear legacy pin data', err);
  }
}

export async function setStaffPin(pin: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('set_staff_pin', { p_pin: pin });
  if (error) {
    console.error('set_staff_pin failed', error);
    return { error: error.message };
  }
  return { error: null };
}

// Verifies the currently signed-in user's own PIN — used for the admin access
// gate, where a session already exists and this is just a re-confirmation.
export async function verifyOwnPin(pin: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('verify_own_pin', { p_pin: pin });
  if (error) {
    console.error('verify_own_pin failed', error);
    return false;
  }
  return data === true;
}

export type PinStaffOption = {
  id: string;
  full_name: string;
};

// Names of staff who have a PIN set up — lets Quick Sign In show a tap-to-pick
// list instead of asking for an email, on any device.
export async function listPinStaff(): Promise<PinStaffOption[]> {
  const { data, error } = await supabase.rpc('list_pin_staff');
  if (error) {
    console.error('list_pin_staff failed', error);
    return [];
  }
  return data ?? [];
}

// Signs in on any device using just a staff id (picked from listPinStaff) +
// PIN, via the pin-signin Edge Function, which verifies server-side and mints
// a real session. The account's email never reaches the client.
export async function signInWithPin(
  staffId: string,
  pin: string,
): Promise<{ error: string | null }> {
  const { data, error } = await supabase.functions.invoke<{
    access_token?: string;
    refresh_token?: string;
  }>('pin-signin', { body: { staffId, pin } });

  if (error || !data?.access_token || !data.refresh_token) {
    console.error('pin sign-in failed', error);
    // FunctionsFetchError/FunctionsRelayError mean the request never reached
    // (or came back from) the function at all — a network problem, not a wrong
    // PIN. Only a FunctionsHttpError means the server actually rejected it.
    if (error && error.name !== 'FunctionsHttpError') {
      return { error: 'Could not reach the server. Check your connection and try again.' };
    }
    return { error: 'Incorrect PIN. Please try again.' };
  }

  const { error: setSessionError } = await supabase.auth.setSession({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
  });
  if (setSessionError) {
    console.error('setSession failed', setSessionError);
    return { error: 'Something went wrong signing in.' };
  }

  return { error: null };
}
