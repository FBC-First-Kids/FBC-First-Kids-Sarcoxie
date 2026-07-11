import { classGroupForGrade, nextGrade } from '@/lib/class-groups';
import { deleteChildCascade } from '@/lib/child-actions';
import { supabase } from '@/lib/supabase';

const SETTINGS_KEY = 'last_grade_promotion_year';

export async function maybePromoteChildren() {
  const now = new Date();
  if (now.getMonth() < 5) return; // before June

  const currentYear = now.getFullYear();

  const { data: setting, error: settingError } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', SETTINGS_KEY)
    .maybeSingle();

  if (settingError) {
    console.error('grade promotion setting lookup failed', settingError);
    return;
  }

  const lastRunYear = setting?.value ? Number(setting.value) : 0;
  if (lastRunYear >= currentYear) return;

  const { data: children, error: childrenError } = await supabase
    .from('children')
    .select('id, grade')
    .not('grade', 'is', null);

  if (childrenError) {
    console.error('grade promotion children lookup failed', childrenError);
    return;
  }

  for (const child of children ?? []) {
    if (!child.grade) continue;

    const next = nextGrade(child.grade);

    if (next === null) {
      // Finished 5th grade — remove them from the system entirely.
      const { error } = await deleteChildCascade(child.id);
      if (error) {
        console.error('grade promotion delete failed', child.id, error);
        return;
      }
      continue;
    }

    const { error } = await supabase
      .from('children')
      .update({ grade: next, class_group: classGroupForGrade(next) })
      .eq('id', child.id);

    if (error) {
      console.error('grade promotion update failed', child.id, error);
      return;
    }
  }

  const { error: upsertError } = await supabase
    .from('app_settings')
    .upsert({ key: SETTINGS_KEY, value: String(currentYear) });

  if (upsertError) {
    console.error('grade promotion marker update failed', upsertError);
  }
}
