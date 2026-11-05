/** Small things the Staff screens share. */

export const panel = {
  background: 'var(--surface-color)',
  border: '1px solid var(--border-color)',
  borderRadius: 'var(--radius-lg)',
  boxShadow: 'var(--shadow-sm)',
};

export const errorBox = {
  background: 'var(--danger-bg)',
  border: '1px solid var(--danger-color)',
  color: 'var(--danger-color)',
  borderRadius: 'var(--radius-md)',
  padding: '10px 12px',
  fontSize: 'var(--text-sm)',
  marginBottom: 'var(--space-3)',
};

export { inrPaise as money } from '../../utils/format';

export const showsPay = (terms) => terms?.hourly_rate !== undefined;

export const EMPLOYMENT_TYPES = [
  ['FULL_TIME', 'Full time'],
  ['PART_TIME', 'Part time'],
  ['CONTRACT', 'Contract'],
  ['APPRENTICE', 'Apprentice'],
];

export const employmentLabel = (value) =>
  (EMPLOYMENT_TYPES.find(([key]) => key === value) || [null, '—'])[1];

/** Blank strings are not zero. Sending '' for a Decimal is a 400. */
export const cleaned = (form) => {
  const payload = {};
  Object.entries(form).forEach(([key, value]) => {
    if (value !== '' && value !== null && value !== undefined) payload[key] = value;
  });
  return payload;
};
