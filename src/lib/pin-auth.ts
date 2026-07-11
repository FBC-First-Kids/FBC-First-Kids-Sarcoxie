import * as SecureStore from 'expo-secure-store';

const STORAGE_KEY = 'kids_checkin_pin_profiles';

export type PinProfile = {
  email: string;
  staffName: string;
  pin: string;
  refreshToken: string;
};

export async function getPinProfiles(): Promise<PinProfile[]> {
  const raw = await SecureStore.getItemAsync(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as PinProfile[];
  } catch (err) {
    console.error('pin-auth: failed to parse stored profiles', err);
    return [];
  }
}

async function saveProfiles(profiles: PinProfile[]) {
  const json = JSON.stringify(profiles);
  console.log(`pin-auth: writing ${profiles.length} profile(s), ${json.length} bytes`);
  try {
    await SecureStore.setItemAsync(STORAGE_KEY, json);
  } catch (err) {
    console.error('pin-auth: SecureStore.setItemAsync threw', err);
    throw err;
  }
}

// Returns true only if the write is confirmed by reading it back.
export async function savePinProfile(profile: PinProfile): Promise<boolean> {
  const profiles = await getPinProfiles();
  const next = [...profiles.filter((p) => p.email !== profile.email), profile];
  await saveProfiles(next);

  const verify = await getPinProfiles();
  const saved = verify.some((p) => p.email === profile.email && p.pin === profile.pin);
  if (!saved) {
    console.error('pin-auth: verification read did not find the profile just saved', {
      wroteCount: next.length,
      readBackCount: verify.length,
    });
  }
  return saved;
}

export async function updatePinProfileToken(email: string, refreshToken: string) {
  const profiles = await getPinProfiles();
  // Skip the write entirely if this device has no PIN profile for this email —
  // avoids needless SecureStore churn on every background session refresh.
  if (!profiles.some((p) => p.email === email && p.refreshToken !== refreshToken)) return;
  const next = profiles.map((p) => (p.email === email ? { ...p, refreshToken } : p));
  await saveProfiles(next);
}

export async function removePinProfile(email: string) {
  const profiles = await getPinProfiles();
  await saveProfiles(profiles.filter((p) => p.email !== email));
}
