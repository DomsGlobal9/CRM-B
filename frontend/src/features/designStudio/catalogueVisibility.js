/* Which design-catalogue categories the library's browser and the design
   upload forms offer. One list, read by both, so the two always match. The
   categories stay in the catalogue itself (apps/design_studio/
   design_catalogue.py): a design already filed under a hidden one keeps its
   place, and an edit of it still shows where it is. */

// Hidden for every garment: Blouse > Traditional Blouse Construction Cuts.
const HIDDEN_CATEGORIES = ['traditional_blouse_construction_cuts'];

// Hidden for one garment, by garment key. The saree's Blouse and Petticoat
// each have a library of their own; the blouse keeps Cutting Pattern,
// Bust-Fitting and Designer / Advanced.
const HIDDEN_BY_GARMENT = {
  saree: ['blouse', 'petticoat'],
  blouse: ['katori_variations', 'princess_cut_variations', 'blouse_back_construction_cuts',
           'sleeve_attachment_armhole_cuts', 'yoke_cuts', 'blouse_cut_master'],
};

/** The garment's categories to offer; `keep` stays even if hidden (the one
 *  a design being edited is already filed under). */
export const visibleCategories = (garmentKey, categories, keep) => {
  const hidden = [...HIDDEN_CATEGORIES, ...(HIDDEN_BY_GARMENT[garmentKey] || [])];
  return (categories || []).filter((c) => !hidden.includes(c.key) || (keep && c.key === keep));
};
