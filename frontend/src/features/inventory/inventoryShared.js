/** Small things the inventory screens share: quantity text, and the panel and error looks. */

export const qty = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 });

export const panel = {
  background: 'var(--surface-color)',
  border: '1px solid var(--border-color)',
  borderRadius: 'var(--radius-lg)',
  boxShadow: 'var(--shadow-sm)',
};

export const errorBox = {
  fontSize: 'var(--text-sm)',
  color: 'var(--danger-color)',
  background: 'var(--danger-bg)',
  border: '1px solid var(--danger-color)',
  padding: '10px 12px',
  borderRadius: 'var(--radius-md)',
};
