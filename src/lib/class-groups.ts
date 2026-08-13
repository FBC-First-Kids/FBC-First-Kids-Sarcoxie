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

// Maps common free-text spellings (from a spreadsheet someone typed by hand)
// to a grade code — a bulk import can't expect the exact GRADE_OPTIONS label.
const GRADE_TEXT_ALIASES: Record<string, string> = {
  prek: 'pre_k',
  pre: 'pre_k',
  k: 'k',
  kindergarten: 'k',
  kinder: 'k',
  '1st': '1st',
  '1stgrade': '1st',
  '1': '1st',
  first: '1st',
  firstgrade: '1st',
  '2nd': '2nd',
  '2ndgrade': '2nd',
  '2': '2nd',
  second: '2nd',
  secondgrade: '2nd',
  '3rd': '3rd',
  '3rdgrade': '3rd',
  '3': '3rd',
  third: '3rd',
  thirdgrade: '3rd',
  '4th': '4th',
  '4thgrade': '4th',
  '4': '4th',
  fourth: '4th',
  fourthgrade: '4th',
  '5th': '5th',
  '5thgrade': '5th',
  '5': '5th',
  fifth: '5th',
  fifthgrade: '5th',
};

export function parseGradeText(raw: string): string | null {
  const normalized = raw.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  return GRADE_TEXT_ALIASES[normalized] ?? null;
}

// What a staff member helps with — separate from `role` (which is the admin
// permission level, staff vs main_admin). An invite code carries one of these
// so a new staff member is tagged with it automatically at sign-up.
export const STAFF_POSITION_OPTIONS = [
  { value: 'pre_k', label: 'Pre-K Teacher' },
  { value: 'k_2', label: 'K - 2nd Teacher' },
  { value: '3_5', label: '3rd - 5th Teacher' },
  { value: 'volunteer', label: 'Volunteer' },
] as const;

export function staffPositionLabel(value: string | null) {
  if (!value) return 'No position set';
  return STAFF_POSITION_OPTIONS.find((o) => o.value === value)?.label ?? value;
}
