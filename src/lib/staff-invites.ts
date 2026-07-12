import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from '@/lib/supabase';

const PENDING_INVITE_KEY = 'kids_checkin_pending_invite';

type PendingInvite = {
  code: string;
  fullName: string;
};

// If email confirmation is required, signUp() doesn't return a session, so the
// invite can't be redeemed (it needs auth.uid()) until the user confirms and signs
// in later. Remember it locally so redemption can be retried on that first sign-in.
export async function setPendingInvite(invite: PendingInvite) {
  await AsyncStorage.setItem(PENDING_INVITE_KEY, JSON.stringify(invite));
}

export async function getPendingInvite(): Promise<PendingInvite | null> {
  const raw = await AsyncStorage.getItem(PENDING_INVITE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PendingInvite;
  } catch {
    return null;
  }
}

export async function clearPendingInvite() {
  await AsyncStorage.removeItem(PENDING_INVITE_KEY);
}

export async function checkInviteCode(code: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('check_invite_code', { p_code: code });
  if (error) {
    console.error('check_invite_code failed', error);
    return false;
  }
  return data === true;
}

export async function redeemInvite(code: string, fullName: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('redeem_staff_invite', {
    p_code: code,
    p_full_name: fullName,
  });
  if (error) {
    console.error('redeem_staff_invite failed', error);
    return false;
  }
  return data === true;
}
