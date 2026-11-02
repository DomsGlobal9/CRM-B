/* Whether this person has seen a guided tour (ProductTour.jsx): the
   workspace tour, and each page's own tour, one flag per boutique, user
   and page, in this browser. */
// v2: every guide shows once more after the page-by-page change (v1 marks
// from earlier tours are ignored).
const KEY = 'scaleezy_tour_done_v2';

const tourKey = (user, page) => {
  let tenant = '';
  try { tenant = localStorage.getItem('tenant_id') || ''; } catch { /* private mode */ }
  return `${KEY}:${tenant}:${user?.id || user?.email || 'user'}${page ? `:${page}` : ''}`;
};

/** page: a tab key for that page's tour; left out, the workspace tour. */
export const tourSeen = (user, page) => {
  try { return localStorage.getItem(tourKey(user, page)) === '1'; } catch { return true; }
};

export const markTourSeen = (user, page) => {
  try { localStorage.setItem(tourKey(user, page), '1'); } catch { /* private mode: it may show again */ }
};
