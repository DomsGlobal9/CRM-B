/**
 * What the counter may type, checked before it leaves the screen.
 *
 * A courtesy copy of core/validators.py: the same rules, so the message the
 * typist sees is the one the server would have sent. The server's copy is the
 * one that counts; this one saves a round trip and a surprise.
 *
 * Every `is*` returns true/false for a value already normalised by its
 * matching `clean*` helper; every `*Error` returns a sentence or ''.
 */

export const LIMITS = {
  name: 100,
  email: 254,
  note: 2000,
  reason: 500,
  address: 500,
  reference: 100,
  amount: 10000000,
  quantity: 100000,
  imageBytes: 8 * 1024 * 1024,
  imagesPerUpload: 5,
};

/** Only the digits, at most ten, the country code stripped: what a mobile field holds. */
export const tenDigits = (raw) => {
  let digits = String(raw || '').replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length > 10 && digits.startsWith('91')) digits = digits.slice(2);
  digits = digits.replace(/^0+/, '');
  return digits.slice(0, 10);
};
/**
 * A customer's mobile: ten national digits, or a foreign number kept with its
 * '+' and country code (a '+91' is folded into the ten digits like the server does).
 */
export const cleanMobile = (raw) => {
  const s = String(raw || '').trim();
  if (s.startsWith('+') && !s.startsWith('+91')) return '+' + s.replace(/\D/g, '').slice(0, 15);
  return tenDigits(raw);
};
export const isMobile = (value) => {
  const v = cleanMobile(value);
  return /^[6-9]\d{9}$/.test(v) || /^\+\d{11,15}$/.test(v);
};
export const mobileError = (value, { required = true } = {}) => {
  const digits = cleanMobile(value);
  if (!digits) return required ? 'Enter the mobile number.' : '';
  return isMobile(digits) ? '' : 'Enter a valid 10-digit mobile number.';
};
/** What a stored mobile looks like in an edit box: '91' + 10 digits become the 10; a foreign number keeps its '+'. */
export const displayMobile = (stored) => {
  const digits = String(stored || '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length >= 11 && digits.length <= 15) return '+' + digits;
  return digits;
};
/** The store's phone on an invoice: often a landline with an STD code, so only the shape is checked. */
export const phoneError = (value) => {
  const v = String(value || '').trim();
  if (!v) return '';
  const digits = v.replace(/\D/g, '').length;
  const ok = v.length <= 50 && digits >= 6 && digits <= 30 && /^[0-9 +()/.,-]+$/.test(v);
  return ok ? '' : 'Enter a phone number (digits, spaces, +, brackets, / or -).';
};

// \p{M}: Indic vowel signs are combining marks, not letters; without it 'प्रिया' loses its vowels.
const NAME_RE = /^\p{L}[\p{L}\p{M} .'()&/-]*$/u;
export const cleanName = (raw) => String(raw || '').replace(/[^\p{L}\p{M} .'()&/-]/gu, '').replace(/\s{2,}/g, ' ').slice(0, LIMITS.name);
export const nameError = (value, { label = 'Name', required = true, min = 2 } = {}) => {
  const v = String(value || '').trim();
  if (!v) return required ? `${label} is required.` : '';
  if (v.length < min) return `${label} needs at least ${min} characters.`;
  if (v.length > LIMITS.name) return `${label} is limited to ${LIMITS.name} characters.`;
  return NAME_RE.test(v) ? '' : `${label} can only have letters, spaces, dots, apostrophes, hyphens, brackets, & and /.`;
};

// Close to Django's EmailValidator: no '..', no domain label starting or ending with '-'.
const EMAIL_RE = /^[^\s@]+@(?!-)[^\s@]+(?<!-)\.[a-z]{2,}$/i;
export const cleanEmail = (raw) => String(raw || '').trim().toLowerCase().slice(0, LIMITS.email);
export const isEmail = (value) => { const v = cleanEmail(value); return EMAIL_RE.test(v) && !v.includes('..'); };
export const emailError = (value, { required = false } = {}) => {
  const v = cleanEmail(value);
  if (!v) return required ? 'Enter the email address.' : '';
  return isEmail(v) ? '' : 'Enter a valid email address.';
};

export const cleanUpper = (raw) => String(raw || '').toUpperCase().replace(/[\s-]/g, '');
export const isPincode = (v) => /^[1-9]\d{5}$/.test(String(v || '').trim());
export const isPan = (v) => /^[A-Z]{5}\d{4}[A-Z]$/.test(cleanUpper(v));
export const isAadhaar = (v) => /^[2-9]\d{11}$/.test(String(v || '').replace(/\D/g, ''));
export const isIfsc = (v) => /^[A-Z]{4}0[A-Z0-9]{6}$/.test(cleanUpper(v));
export const isBankAccount = (v) => /^\d{9,18}$/.test(String(v || '').replace(/\D/g, ''));
export const isGstin = (v) => /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(cleanUpper(v));
export const isHsn = (v) => /^\d{4}(\d{2})?(\d{2})?$/.test(String(v || '').replace(/\D/g, ''));
export const isVoterId = (v) => /^[A-Z]{3}\d{7}$/.test(cleanUpper(v));
export const isDrivingLicence = (v) => /^[A-Z]{2}[ -]?\d{2}[ -]?\d{4}[ -]?\d{7}$/.test(cleanUpper(v));

/** The rule for a staff document's number, by kind; '' when it passes. */
export const documentNumberError = (kind, value) => {
  const v = String(value || '').trim();
  if (!v) return '';
  switch ((kind || '').toUpperCase()) {
    case 'AADHAAR': return isAadhaar(v) ? '' : 'Enter the 12-digit Aadhaar number.';
    case 'PAN': return isPan(v) ? '' : 'Enter a PAN like ABCDE1234F.';
    case 'VOTER_ID': return isVoterId(v) ? '' : 'Enter a Voter ID like ABC1234567.';
    case 'DRIVING_LICENCE': return isDrivingLicence(v) ? '' : 'Enter a driving licence like KA0120201234567.';
    default: return v.length > 64 ? 'Document number is limited to 64 characters.' : '';
  }
};
/** What a document-number box should do with a keystroke, by kind. */
export const cleanDocumentNumber = (kind, raw) => {
  switch ((kind || '').toUpperCase()) {
    case 'AADHAAR': return String(raw || '').replace(/\D/g, '').slice(0, 12);
    case 'PAN': return cleanUpper(raw).slice(0, 10);
    case 'VOTER_ID': return cleanUpper(raw).slice(0, 10);
    case 'DRIVING_LICENCE': return String(raw || '').toUpperCase().replace(/[^A-Z0-9 -]/g, '').slice(0, 20);
    default: return String(raw || '').slice(0, 64);
  }
};

/** A money or count box: digits and one dot, no minus, capped. */
export const cleanAmount = (raw, { max = LIMITS.amount, decimals = 2 } = {}) => {
  let s = String(raw ?? '').replace(/[^\d.]/g, '');
  const dot = s.indexOf('.');
  if (dot !== -1) s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, '').slice(0, decimals);
  if (s !== '' && Number(s) > max) s = String(max);
  return s;
};
export const amountError = (value, { label = 'Amount', max = LIMITS.amount, allowZero = true, required = false } = {}) => {
  if (value === '' || value === null || value === undefined) return required ? `${label} is required.` : '';
  const n = Number(value);
  if (!Number.isFinite(n)) return `${label} must be a number.`;
  if (n < 0) return `${label} cannot be negative.`;
  if (!allowZero && n === 0) return `${label} must be more than zero.`;
  if (n > max) return `${label} cannot be more than ${max.toLocaleString('en-IN')}.`;
  return '';
};

export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const isPastDate = (iso) => Boolean(iso) && iso < todayIso();

/** Keeps a picker honest: images only, each within the size a phone would send, at most a few. */
export const imageFilesError = (files, { max = LIMITS.imagesPerUpload } = {}) => {
  const list = Array.from(files || []);
  if (list.length > max) return `At most ${max} photos at a time.`;
  const bad = list.find((f) => !(f.type || '').startsWith('image/'));
  if (bad) return `${bad.name || 'That file'} is not an image (JPG, PNG or WebP).`;
  const big = list.find((f) => f.size > LIMITS.imageBytes);
  if (big) return `${big.name || 'That photo'} is larger than ${LIMITS.imageBytes / (1024 * 1024)} MB.`;
  return '';
};
