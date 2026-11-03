import { createContext, useContext, useEffect, useLayoutEffect, useRef } from 'react';

/* The breadcrumb trail's shared state (Breadcrumbs.jsx draws it).

   The workspace draws the first part itself -- the home page, then the page
   that is open. Anything deeper (a tab inside the page, an order, a customer,
   a staff member's payroll) adds its own crumbs from where it is drawn, at a
   level: 1 a tab of the page, 2 a tab inside that tab, 3 the thing opened
   from a list. The bar shows the levels in that order, however deep in the
   tree each was added from. */
export const CrumbsContext = createContext(null);

/** Adds `items` ([{ label, onClick? }]) to the trail at `level`, for as long
 *  as the component calling it is on screen. */
export function useCrumbs(level, items) {
  const trail = useContext(CrumbsContext);
  // The handlers are read when a crumb is clicked, so a new function on every
  // render does not have to re-add the crumbs.
  const handlers = useRef(items);
  useLayoutEffect(() => { handlers.current = items; });
  const labels = items.map((item) => item.label).join('\u0000');
  const links = items.map((item) => (item.onClick ? '1' : '0')).join('');
  useEffect(() => {
    if (!trail || !labels) return undefined;
    trail.add(level, labels.split('\u0000').map((label, i) => ({
      label,
      onClick: links[i] === '1' ? () => handlers.current[i]?.onClick?.() : null,
    })));
    return () => trail.remove(level);
  }, [trail, level, labels, links]);
}
