const names = new Set(['studentName', 'guardianName', 'city', 'district', 'currentSchool']);
const places = new Set(['state']);
const readable = /^[\p{L}\p{M}\p{N} .,()'&/#:+-]+$/u;
export const fieldMaxLength = key => ({guardianPhone:10,pincode:6,email:150,address:300,purpose:500}[key] || 120);
export function cleanRegistrationInput(key, value) {
  if (key === 'guardianPhone' || key === 'pincode') return value.replace(/\D/g, '').slice(0, fieldMaxLength(key));
  if (names.has(key)) return value.replace(/[^\p{L}\p{M} ]/gu, '').toUpperCase();
  if (key === 'email') return value.replace(/\s/g, '');
  return value;
}
export function registrationFieldError(key, input) {
  const value = String(input).trim();
  if (!value) return ['email','purpose'].includes(key) ? '' : 'This field is required.';
  if (value.length > fieldMaxLength(key)) return `Use no more than ${fieldMaxLength(key)} characters.`;
  if (names.has(key) && (!/^[\p{L}\p{M} ]+$/u.test(value) || value.replace(/ /g,'').length < 2)) return 'Use at least two letters; only letters and spaces are allowed.';
  if (places.has(key) && (!/^[\p{L}\p{M} .'-]+$/u.test(value) || !/\p{L}/u.test(value))) return 'Enter a place name using letters, spaces, dots, apostrophes or hyphens.';
  if (['address','purpose'].includes(key) && (!readable.test(value) || !/\p{L}/u.test(value) || value.length < (key === 'address' ? 5 : key === 'currentSchool' ? 2 : 1))) return key === 'address' ? 'Enter a full address of at least 5 characters, including letters.' : 'Enter words, not just numbers or symbols.';
  if (key === 'guardianPhone' && !/^[6-9][0-9]{9}$/.test(value)) return 'Enter 10 digits, starting with 6, 7, 8 or 9.';
  if (key === 'pincode' && !/^[1-9][0-9]{5}$/.test(value)) return 'Enter 6 digits; the PIN code cannot start with 0.';
  if (key === 'email' && !/^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(value)) return 'Enter a valid email address, such as name@gmail.com.';
  if (key === 'dob') {
    const date = new Date(value + 'T00:00:00Z');
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== value || date > new Date() || date.getUTCFullYear() < 1995) return 'Enter a real date of birth between 1995 and today.';
  }
  return '';
}
