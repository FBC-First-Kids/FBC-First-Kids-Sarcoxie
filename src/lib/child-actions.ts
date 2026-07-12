import { supabase } from '@/lib/supabase';

export async function deleteChildCascade(childId: string): Promise<{ error: string | null }> {
  const { error: checkinsError } = await supabase.from('checkins').delete().eq('child_id', childId);
  if (checkinsError) {
    console.error('checkins delete failed', checkinsError);
    return { error: 'checkins' };
  }

  const { error: linksError } = await supabase.from('child_guardians').delete().eq('child_id', childId);
  if (linksError) {
    console.error('child_guardians delete failed', linksError);
    return { error: 'child_guardians' };
  }

  const { error: childError } = await supabase.from('children').delete().eq('id', childId);
  if (childError) {
    console.error('child delete failed', childError);
    return { error: 'children' };
  }

  return { error: null };
}

export async function deleteGuardianCascade(guardianId: string): Promise<{ error: string | null }> {
  const { error: readsError } = await supabase
    .from('notification_reads')
    .delete()
    .eq('guardian_id', guardianId);
  if (readsError) {
    console.error('notification_reads delete failed', readsError);
    return { error: 'notification_reads' };
  }

  // checkins references guardians via both guardian_id (dropped off) and picked_up_by
  // (picked up) — either one blocks the guardians delete with a FK violation if left behind.
  const { error: checkinsError } = await supabase
    .from('checkins')
    .delete()
    .or(`guardian_id.eq.${guardianId},picked_up_by.eq.${guardianId}`);
  if (checkinsError) {
    console.error('checkins delete failed', checkinsError);
    return { error: 'checkins' };
  }

  const { error: linksError } = await supabase
    .from('child_guardians')
    .delete()
    .eq('guardian_id', guardianId);
  if (linksError) {
    console.error('child_guardians delete failed', linksError);
    return { error: 'child_guardians' };
  }

  const { error: guardianError } = await supabase.from('guardians').delete().eq('id', guardianId);
  if (guardianError) {
    console.error('guardian delete failed', guardianError);
    return { error: 'guardians' };
  }

  return { error: null };
}
