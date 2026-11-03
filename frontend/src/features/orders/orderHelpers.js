export const orderStatusTone = (st) =>
  st === 'Delivered' ? 'success'
    : st === 'Cancelled' ? 'neutral'
    : (st === 'Shipped' || st === 'Ready for Dispatch') ? 'info'
    : 'warning';

export const humaniseSpecKey = (key) => {
  const words = String(key).replace(/_/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

export const hasMaterials = (order) =>
  (order.garment_jobs || []).some((job) => (job.materials || []).length > 0);
