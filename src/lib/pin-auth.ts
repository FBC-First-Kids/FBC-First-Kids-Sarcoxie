import { supabase } from '@/lib/supabase';

// PIN storage/verification lives entirely server-side now (hashed, with attempt
// lockout — see the set_staff_pin / verify_staff_pin / verify_own_pin RPCs and
// the pin-signin Edge Function) so a PIN works from any device, not just the
// one it was set up on.

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

// Signs in on any device using just email + PIN, via the pin-signin Edge
// Function, which verifies server-side and mints a real session.
export async function signInWithPin(email: string, pin: string): Promise<{ error: string | null }> {
  const { data, error } = await supabase.functions.invoke<{
    access_token?: string;
    refresh_token?: string;
  }>('pin-signin', { body: { email, pin } });

  if (error || !data?.access_token || !data.refresh_token) {
    console.error('pin sign-in failed', error);
    return { error: 'Invalid email or PIN, or too many attempts. Please try again shortly.' };
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
