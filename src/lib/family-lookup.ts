import { normalizePhone } from '@/lib/phone';
import { supabase } from '@/lib/supabase';

export type FamilyGuardian = {
  id: string;
  full_name: string;
  phone: string | null;
};

export type FamilyChild = {
  id: string;
  full_name: string;
  grade: string | null;
  class_group: string | null;
};

export type FamilyLink = {
  child_id: string;
  guardian_id: string;
  relationship: string;
};

export type Family = {
  guardians: FamilyGuardian[];
  children: FamilyChild[];
  links: FamilyLink[];
};

// Shared by parent-signin.tsx (check-in lookup) and manage-family.tsx (self-
// service editing) so the two screens can't silently drift on how a family
// gets resolved from a phone number.
export async function lookupFamilyByPhone(rawPhone: string): Promise<Family | null> {
  const digits = normalizePhone(rawPhone);
  if (!digits) return null;

  const { data: allGuardians, error: guardiansError } = await supabase
    .from('guardians')
    .select('id, full_name, phone');

  if (guardiansError || !allGuardians) {
    console.error('guardians lookup failed', guardiansError);
    return null;
  }

  const matchedGuardians = allGuardians.filter((g) => normalizePhone(g.phone ?? '') === digits);
  if (matchedGuardians.length === 0) return null;

  const seedGuardianIds = matchedGuardians.map((g) => g.id);

  const { data: seedLinks, error: seedLinksError } = await supabase
    .from('child_guardians')
    .select('child_id, guardian_id, relationship')
    .in('guardian_id', seedGuardianIds);

  if (seedLinksError) {
    console.error('child_guardians lookup failed', seedLinksError);
    return null;
  }

  const childIds = [...new Set((seedLinks ?? []).map((l) => l.child_id))];

  if (childIds.length === 0) {
    return { guardians: matchedGuardians, children: [], links: [] };
  }

  // Pull every guardian linked to any of this family's children, not just the
  // ones matching the looked-up phone — otherwise a co-guardian who signed up
  // with a different phone would silently disappear from the family view.
  const { data: allLinks, error: allLinksError } = await supabase
    .from('child_guardians')
    .select('child_id, guardian_id, relationship')
    .in('child_id', childIds);

  if (allLinksError || !allLinks) {
    console.error('child_guardians lookup failed', allLinksError);
    return null;
  }

  const { data: children, error: childrenError } = await supabase
    .from('children')
    .select('id, full_name, grade, class_group')
    .in('id', childIds);

  if (childrenError || !children) {
    console.error('children lookup failed', childrenError);
    return null;
  }

  const allGuardianIds = [...new Set(allLinks.map((l) => l.guardian_id))];
  const guardianById = new Map(allGuardians.map((g) => [g.id, g]));
  const guardians = allGuardianIds
    .map((id) => guardianById.get(id))
    .filter((g): g is FamilyGuardian => !!g);

  return { guardians, children, links: allLinks };
}
