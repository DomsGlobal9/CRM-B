/**
 * Which garments on an order were taken in as Express.
 *
 * `urgency` is a per-garment question on every template's basics section
 * (apps/catalog/definitions.py COMMON_BASIC), stored as a slug in the job's
 * `spec` -- 'normal' or 'express'. So an order is Express when any one of its
 * garments is, and the lists can say which one.
 */
export const isExpressJob = (job) => String(job?.spec?.urgency || '').toLowerCase() === 'express';

export const expressJobs = (order) => (order?.garment_jobs || []).filter(isExpressJob);

export const isExpressOrder = (order) => expressJobs(order).length > 0;

/** "Express: Blouse" / "Express: Blouse, Lehenga" -- the callout's words. */
export const expressLabel = (order) => {
  const names = expressJobs(order)
    .map((job) => job.template_name || job.template_key || 'Garment');
  if (!names.length) return '';
  return `Express: ${names.join(', ')}`;
};
