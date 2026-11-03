export const TIERS = ['Platinum', 'Gold', 'Silver'];

export const CUSTOMER_PAGE_SIZES = [20, 30, 40, 50];

export const customerTier = (record) => (TIERS.includes(record?.customer_type) ? record.customer_type : 'Silver');
export const NO_TIERS = { Platinum: 0, Gold: 0, Silver: 0 };
export const TIER_TONES = {
  Platinum: { background: 'var(--accent-color)', color: 'var(--brand-link)', border: '1px solid var(--primary-color)' },
  Gold: { background: 'var(--warning-bg)', color: 'var(--warning-color)', border: '1px solid color-mix(in srgb, var(--warning-color) 35%, transparent)' },
  Silver: { background: 'var(--surface-inset)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' },
};
export const TIER_COLORS = {
  Platinum: '#8b5cf6',
  Gold: '#f59e0b',
  Silver: '#94a3b8',
  platinum: '#8b5cf6',
  gold: '#f59e0b',
  silver: '#94a3b8',
};
