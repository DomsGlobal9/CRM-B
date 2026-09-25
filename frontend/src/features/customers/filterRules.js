/* The Customers page filters: by the mobile's country code, the first letter
   of the name, orders, measurements, when they joined, birthdays, source,
   gender and city -- and a sort. All of it runs on the customer list the page
   already holds; nothing is asked of the server. */
import { COUNTRY_CODES, countryOf, splitStoredMobile } from '../../services/phone';

export const EMPTY_CUSTOMER_FILTERS = {
  country: '', letter: '', orders: '', measurements: '', added: '', birthday: '',
  source: '', gender: '', city: '', sort: '',
};

export const LETTERS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', '#'];

export const ORDER_OPTIONS = [
  ['', 'All customers'], ['with', 'With orders'], ['repeat', 'Repeat (2+ orders)'], ['none', 'No orders yet'],
];
export const MEASUREMENT_OPTIONS = [['', 'Any'], ['recorded', 'Recorded'], ['missing', 'Not recorded']];
export const ADDED_OPTIONS = [
  ['', 'Any time'], ['month', 'This month'], ['30', 'Last 30 days'], ['90', 'Last 90 days'], ['year', 'This year'],
];
export const BIRTHDAY_OPTIONS = [
  ['', 'Any'], ['month', 'This month'], ['next30', 'In the next 30 days'], ['missing', 'Not added'],
];
export const SORT_OPTIONS = [
  ['', 'Default order'], ['newest', 'Newest first'], ['oldest', 'Oldest first'],
  ['name_asc', 'Name A–Z'], ['name_desc', 'Name Z–A'], ['orders', 'Most orders'], ['spend', 'Highest spend'],
];

const fullName = (c) => `${c.first_name || ''} ${c.last_name || ''}`.trim();
export const orderCount = (c) => c.order_count ?? c.orders?.length ?? 0;

/** "91", "1", "44"...: the country code of the customer's mobile. */
export const dialOf = (c) => countryOf(splitStoredMobile(c.mobile_number).iso).dial;

/** A–Z by the first letter of the name; anything else (a name in another
 *  script, a digit) is "#". */
export const letterOf = (c) => {
  const first = fullName(c).charAt(0).toUpperCase();
  return first >= 'A' && first <= 'Z' ? first : '#';
};

const cityOf = (c) => String(c.city_region || '').trim().replace(/\s+/g, ' ');
const cityKey = (c) => cityOf(c).toLowerCase();

/** Any body measurement actually taken -- the empty record a customer gets
 *  on creation does not count. */
export const hasMeasurements = (c) => {
  const m = c.measurements;
  if (!m) return false;
  const positive = (v) => typeof v !== 'object' && typeof v !== 'boolean' && Number(v) > 0;
  const own = Object.entries(m).some(([k, v]) => k !== 'id' && k !== 'customer' && positive(v));
  const extra = Object.entries(m.additional_measurements || {}).some(([, v]) => positive(v));
  return own || extra;
};

const DAY = 24 * 60 * 60 * 1000;
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

const addedMatches = (c, when) => {
  const d = new Date(c.created_at);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  if (when === 'month') return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  if (when === 'year') return d.getFullYear() === now.getFullYear();
  return now - d <= Number(when) * DAY;
};

const birthdayMatches = (c, when) => {
  const raw = c.date_of_birth;
  if (when === 'missing') return !raw;
  if (!raw) return false;
  const [, month, day] = String(raw).split('-').map(Number);
  if (!month || !day) return false;
  const today = startOfToday();
  if (when === 'month') return month - 1 === today.getMonth();
  // next30: this year's birthday, or next year's if it has passed.
  let next = new Date(today.getFullYear(), month - 1, day);
  if (next < today) next = new Date(today.getFullYear() + 1, month - 1, day);
  return next - today <= 30 * DAY;
};

/** The countries found among the customers' mobiles, most customers first. */
export function countryOptions(customers) {
  const counts = new Map();
  customers.forEach((c) => {
    const { iso } = splitStoredMobile(c.mobile_number);
    const { dial } = countryOf(iso);
    const entry = counts.get(dial) || { dial, iso, count: 0 };
    entry.count += 1;
    counts.set(dial, entry);
  });
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || Number(a.dial) - Number(b.dial))
    .map(({ dial, iso, count }) => {
      const shared = COUNTRY_CODES.filter((x) => x.dial === dial).length > 1;
      const name = dial === '1' ? 'USA / Canada' : `${countryOf(iso).name}${shared ? ' & others' : ''}`;
      return { key: dial, label: `+${dial} ${name}`, count };
    });
}

/** Distinct values of a field with their counts, most common first. */
function valueOptions(customers, pick, keyOf = pick) {
  const counts = new Map();
  customers.forEach((c) => {
    const label = pick(c);
    if (!label) return;
    const key = keyOf(c);
    const entry = counts.get(key) || { key, label, count: 0 };
    entry.count += 1;
    counts.set(key, entry);
  });
  return [...counts.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export const sourceOptions = (customers) => valueOptions(customers, (c) => String(c.source || '').trim());
export const genderOptions = (customers) => {
  const set = valueOptions(customers, (c) => String(c.gender || '').trim());
  const unset = customers.filter((c) => !String(c.gender || '').trim()).length;
  return unset ? [...set, { key: '__none', label: 'Not set', count: unset }] : set;
};
export const cityOptions = (customers) => valueOptions(customers, cityOf, cityKey);

export const letterCounts = (customers) => {
  const counts = Object.fromEntries(LETTERS.map((l) => [l, 0]));
  customers.forEach((c) => { counts[letterOf(c)] += 1; });
  return counts;
};

/** How many filters are set (the sort is not a filter). */
export const activeFilterCount = (f) =>
  Object.entries(f).filter(([k, v]) => k !== 'sort' && v !== '' && v !== undefined).length;

export function applyCustomerFilters(customers, f) {
  const out = customers.filter((c) => {
    if (f.country && dialOf(c) !== f.country) return false;
    if (f.letter && letterOf(c) !== f.letter) return false;
    const orders = orderCount(c);
    if (f.orders === 'with' && orders < 1) return false;
    if (f.orders === 'repeat' && orders < 2) return false;
    if (f.orders === 'none' && orders > 0) return false;
    if (f.measurements === 'recorded' && !hasMeasurements(c)) return false;
    if (f.measurements === 'missing' && hasMeasurements(c)) return false;
    if (f.added && !addedMatches(c, f.added)) return false;
    if (f.birthday && !birthdayMatches(c, f.birthday)) return false;
    if (f.source && String(c.source || '').trim() !== f.source) return false;
    if (f.gender === '__none' && String(c.gender || '').trim()) return false;
    if (f.gender && f.gender !== '__none' && String(c.gender || '').trim() !== f.gender) return false;
    if (f.city && cityKey(c) !== f.city) return false;
    return true;
  });
  const time = (c) => new Date(c.created_at).getTime() || 0;
  const byName = (a, b) => fullName(a).localeCompare(fullName(b), undefined, { sensitivity: 'base' });
  const sorters = {
    newest: (a, b) => time(b) - time(a),
    oldest: (a, b) => time(a) - time(b),
    name_asc: byName,
    name_desc: (a, b) => byName(b, a),
    orders: (a, b) => orderCount(b) - orderCount(a) || byName(a, b),
    spend: (a, b) => (Number(b.total_spend) || 0) - (Number(a.total_spend) || 0) || byName(a, b),
  };
  return sorters[f.sort] ? [...out].sort(sorters[f.sort]) : out;
}
