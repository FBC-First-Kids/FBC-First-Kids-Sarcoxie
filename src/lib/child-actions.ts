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
