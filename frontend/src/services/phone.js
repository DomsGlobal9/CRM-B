/* Mobile numbers with a country code, for CountryPhoneInput and the forms
   that use it. The country list is src/data/countryCodes.js, built from the
   country-codes CSV (scripts/build-country-codes.mjs).

   India stays exactly as before -- ten digits, stored by the server as 91 +
   the number. Any other country is sent as "+<code><number>", the spelling
   the server already keeps as an international number. */
import COUNTRY_CODES from '../data/countryCodes';
import { mobileError, tenDigits } from './validate';

export { COUNTRY_CODES };
export const DEFAULT_COUNTRY = 'IN';

export const BY_ISO = Object.fromEntries(COUNTRY_CODES.map((c) => [c.iso, c]));
// Offered first: the countries a boutique's customers most often dial from.
export const COMMON = ['IN', 'US', 'GB', 'AE', 'CA', 'AU', 'SG'].filter((iso) => BY_ISO[iso]);
// Several countries share a code (+1, +7, +44...): a pasted number picks this one.
const PREFERRED_FOR_DIAL = { 1: 'US', 7: 'RU', 44: 'GB', 39: 'IT', 61: 'AU', 47: 'NO', 358: 'FI', 590: 'GP', 262: 'RE', 599: 'CW', 212: 'MA' };

export const countryOf = (iso) => BY_ISO[iso] || BY_ISO[DEFAULT_COUNTRY];

/** "+1 (703) 598-1657" typed or pasted whole: its country and the rest. The
 *  longest matching code wins; the country already picked is kept when it
 *  shares that code (Canada stays Canada on a +1 number). */
export function splitInternational(raw, currentIso) {
  let digits = String(raw || '').replace(/\D/g, '');
  if (String(raw).trim().startsWith('00')) digits = digits.replace(/^00/, '');
  for (let len = 4; len >= 1; len -= 1) {
    const dial = digits.slice(0, len);
    const matches = COUNTRY_CODES.filter((c) => c.dial === dial);
    if (!matches.length) continue;
    const current = matches.find((c) => c.iso === currentIso);
    const preferred = matches.find((c) => c.iso === PREFERRED_FOR_DIAL[dial]);
    return { iso: (current || preferred || matches[0]).iso, national: digits.slice(len) };
  }
  return null;
}

/** The national part as typed: digits only, ten for India, and never longer
 *  than an international number (15 digits with its code) allows. */
export function cleanNational(iso, raw) {
  if (iso === 'IN') return tenDigits(raw);
  const { dial } = countryOf(iso);
  return String(raw || '').replace(/\D/g, '').slice(0, 15 - dial.length);
}

/** What the server is sent: ten digits for India, "+<code><number>" otherwise
 *  (a trunk 0 in front of the number, as in UK 07911..., is not dialled). */
export function composeMobile(iso, national) {
  if (iso === 'IN') return tenDigits(national);
  const digits = String(national || '').replace(/\D/g, '').replace(/^0+/, '');
  return digits ? `+${countryOf(iso).dial}${digits}` : '';
}

/** The same rules as the server: a valid Indian mobile, or 11-15 digits in
 *  all with the country code. */
export function phoneNumberError(iso, national, { required = true } = {}) {
  if (String(national || '').startsWith('+')) return 'Choose the country code from the list.';
  if (iso === 'IN') return mobileError(national, { required });
  const composed = composeMobile(iso, national);
  if (!composed) return required ? 'Enter the mobile number.' : '';
  const total = composed.length - 1;
  if (total < 11 || total > 15) {
    return `Enter the full ${countryOf(iso).name} mobile number, without the +${countryOf(iso).dial}.`;
  }
  return '';
}

/** A mobile as the server stores it ("919876543210", "17035981657") split
 *  back into its country and the number, for a form that edits it. */
export function splitStoredMobile(stored) {
  const digits = String(stored || '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return { iso: 'IN', national: digits.slice(2) };
  if (digits.length <= 10) return { iso: DEFAULT_COUNTRY, national: digits };
  return splitInternational(`+${digits}`, DEFAULT_COUNTRY) || { iso: DEFAULT_COUNTRY, national: digits };
}

/** A foreign number as the server stores it -- bare digits with the country
 *  code, "13175291732" -- written the way people read it: "+1 (317) 529-1732",
 *  "+44 7557359393". Anything that is not such a digit string (an Indian
 *  number, a landline typed with spaces) comes back unchanged. */
export function formatInternational(raw) {
  const text = String(raw || '').trim();
  if (!/^\+?\d{11,15}$/.test(text)) return raw || '';
  const found = splitInternational(`+${text.replace(/^\+/, '')}`, null);
  if (!found || !found.national) return `+${text.replace(/^\+/, '')}`;
  const { dial } = countryOf(found.iso);
  const n = found.national;
  if (dial === '1' && n.length === 10) return `+1 (${n.slice(0, 3)}) ${n.slice(3, 6)}-${n.slice(6)}`;
  return `+${dial} ${n}`;
}
