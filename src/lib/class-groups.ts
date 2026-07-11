export const CLASS_GROUP_OPTIONS = [
  { value: 'pre_k', label: 'Pre-K' },
  { value: 'k_2', label: 'K - 2nd' },
  { value: '3_5', label: '3rd - 5th' },
] as const;

export function classGroupLabel(value: string | null) {
  if (!value) return 'No class set';
  return CLASS_GROUP_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

export const GRADE_OPTIONS = [
  { value: 'pre_k', label: 'Pre-K' },
  { value: 'k', label: 'Kindergarten' },
  { value: '1st', label: '1st Grade' },
  { value: '2nd', label: '2nd Grade' },
  { value: '3rd', label: '3rd Grade' },
  { value: '4th', label: '4th Grade' },
  { value: '5th', label: '5th Grade' },
] as const;

const GRADE_ORDER = GRADE_OPTIONS.map((g) => g.value);

export function gradeLabel(value: string | null) {
  if (!value) return 'No grade set';
  return GRADE_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

// Which room/class bucket a given grade belongs to, for notification targeting.
export function classGroupForGrade(grade: string): string {
  if (grade === 'pre_k') return 'pre_k';
  if (grade === 'k' || grade === '1st' || grade === '2nd') return 'k_2';
  return '3_5';
}

// The next grade up, or null if this was the last grade (5th) — meaning they graduate.
export function nextGrade(grade: string): string | null {
  const index = GRADE_ORDER.indexOf(grade as (typeof GRADE_ORDER)[number]);
  if (index === -1 || index === GRADE_ORDER.length - 1) return null;
  return GRADE_ORDER[index + 1];
}
