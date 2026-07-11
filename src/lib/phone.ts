export function normalizePhone(value: string) {
  return value.replace(/\D/g, '');
}

export function formatPhoneInput(value: string) {
  const digits = normalizePhone(value).slice(0, 10);
  if (digits.length > 6) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length > 3) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return digits;
}
