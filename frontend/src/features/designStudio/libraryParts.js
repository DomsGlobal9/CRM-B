/* Design parts a garment's design library leaves out, by garment key -- the
   library page's part tabs and the Upload a Design form read the same list,
   so the two always offer the same parts. The parts stay on the garment
   template itself (the order wizard still offers them). */
export const HIDDEN_LIBRARY_PARTS = { blouse: ['Overall Blouse Design', 'Neck Design', 'Hand Design'] };

/** The garment's design parts without the hidden ones. */
export const libraryDesignParts = (garmentKey, parts) => {
  const hidden = HIDDEN_LIBRARY_PARTS[garmentKey] || [];
  return (parts || []).filter((p) => !hidden.includes(p.label));
};
