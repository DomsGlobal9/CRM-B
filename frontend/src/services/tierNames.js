/* The boutique's own names for the customer tiers (Settings > Customer tiers).
   Display only: a customer's stored tier stays Silver / Gold / Platinum, so
   filters, counts and reports key on those. Set once from the boutique
   settings (App) and read wherever a tier is shown. */
let names = {};

export const setTierNames = (map) => {
  names = map && typeof map === 'object' && !Array.isArray(map) ? map : {};
};

/** The boutique's name for a tier, else `fallback` (the translated default), else the tier. */
export const tierName = (tier, fallback) => names[tier] || fallback || tier;

/** True once the boutique has renamed at least one tier. */
export const hasTierNames = () => Object.keys(names).length > 0;
