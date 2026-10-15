const names = new Set(['studentName', 'guardianName', 'city', 'district', 'currentSchool']);
const places = new Set(['state']);
const readable = /^[\p{L}\p{M}\p{N} .,()'&/#:+-]+$/u;
export const fieldMaxLength = key => ({guardianPhone:13,pincode:6,email:150,address:300,purpose:500}[key] || 120);
export function cleanRegistrationInput(key, value) {
  if (key === 'guardianPhone') return value.replace(/[^\d+]/g, '').slice(0, fieldMaxLength(key));
  if (key === 'pincode') return value.replace(/\D/g, '').slice(0, fieldMaxLength(key));
  if (names.has(key)) return value.replace(/[^\p{L}\p{M} ]/gu, '').toUpperCase();
  if (key === 'email') return value.replace(/\s/g, '');
  return value;
}
export function registrationFieldError(key, input, lang = 'en') {
  const value = String(input).trim();
  const isHi = lang === 'hi';
  if (!value) {
    if (['purpose'].includes(key)) return '';
    return isHi ? 'कृपया यह जानकारी अवश्य भरें।' : 'This field is required.';
  }
  if (value.length > fieldMaxLength(key)) {
    return isHi
      ? `अधिकतम ${fieldMaxLength(key)} अक्षर ही दर्ज करें।`
      : `Use no more than ${fieldMaxLength(key)} characters.`;
  }
  if (names.has(key) && (!/^[\p{L}\p{M} ]+$/u.test(value) || value.replace(/ /g,'').length < 2)) {
    return isHi
      ? 'केवल अक्षरों का उपयोग करें (कम से कम 2 अक्षर)।'
      : 'Use at least two letters; only letters and spaces are allowed.';
  }
  if (places.has(key) && (!/^[\p{L}\p{M} .'-]+$/u.test(value) || !/\p{L}/u.test(value))) {
    return isHi
      ? 'सही स्थान या राज्य का नाम दर्ज करें।'
      : 'Enter a place name using letters, spaces, dots, apostrophes or hyphens.';
  }
  if (['address','purpose'].includes(key) && (!readable.test(value) || !/\p{L}/u.test(value) || value.length < (key === 'address' ? 5 : key === 'currentSchool' ? 2 : 1))) {
    return key === 'address'
      ? (isHi ? 'कम से कम 5 अक्षरों का पूरा पता दर्ज करें।' : 'Enter a full address of at least 5 characters, including letters.')
      : (isHi ? 'केवल संख्याओं के बजाय शब्द लिखें।' : 'Enter words, not just numbers or symbols.');
  }
  if (key === 'guardianPhone' && !/^(?:\+?91)?[6-9][0-9]{9}$/.test(value)) {
    return isHi
      ? 'कृपया सही 10 अंकों का मोबाइल नंबर दर्ज करें (6, 7, 8 या 9 से शुरू)।'
      : 'Enter 10 digits starting with 6, 7, 8 or 9, optionally prefixed with +91.';
  }
  if (key === 'pincode' && !/^[1-9][0-9]{5}$/.test(value)) {
    return isHi
      ? 'कृपया 6 अंकों का सही पिन कोड दर्ज करें (0 से शुरू नहीं हो सकता)।'
      : 'Enter 6 digits; the PIN code cannot start with 0.';
  }
  if (key === 'email' && !/^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(value)) {
    return isHi
      ? 'कृपया सही ईमेल पता दर्ज करें (उदा. parent@gmail.com)।'
      : 'Enter a valid email address, such as name@gmail.com.';
  }
  if (key === 'dob') {
    const date = new Date(value + 'T00:00:00Z');
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== value || date > new Date() || date.getUTCFullYear() < 1995) {
      return isHi
        ? 'कृपया 1995 से आज तक की सही जन्म तिथि दर्ज करें।'
        : 'Enter a real date of birth between 1995 and today.';
    }
  }
  if (key === 'gender') {
    if (!['MALE', 'FEMALE', 'OTHER'].includes(value.toUpperCase())) {
      return isHi
        ? 'कृपया विद्यार्थी का लिंग चुनें (Male या Female)।'
        : 'Please select student gender (Male or Female).';
    }
  }
  if (key === 'course') {
    if (!['PCM', 'PCB', 'ARTS', 'COMMERCE'].includes(value.toUpperCase())) {
      return isHi
        ? 'कृपया कक्षा 11 के लिए संकाय (PCM, PCB, ARTS या COMMERCE) चुनें।'
        : 'Please select a stream/course (PCM, PCB, ARTS, or COMMERCE).';
    }
  }
  return '';
}

