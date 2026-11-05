/** Small things the payroll screens share: the panel look, and money, hour and date text. */

export const panel = {
  background: 'var(--surface-color)',
  boxShadow: 'var(--shadow-sm)',
  border: '1px solid var(--border-color)',
  borderRadius: 'var(--radius-lg)',
};

/** Rupees, grouped the Indian way, from a server-sent string. Never computed here. */
export const money = (value) =>
  value === null || value === undefined
    ? '—'
    : `₹${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export { clockText, dayText, hoursText } from '../attendance/attendanceHelpers';

export const mondayOf = (value) => {
  const d = new Date(value);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};

export const weekLabel = (start, end) => {
  if (!start) return '';
  const fmt = (s) => new Date(s).toLocaleDateString([], { day: 'numeric', month: 'short' });
  return `${fmt(start)} – ${fmt(end)}`;
};
