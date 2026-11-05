import { useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { CrumbsContext, useCrumbs } from './crumbs';

/* Where you are, and the way back up: every page of the workspace opens with
   one, in place of the "Back" buttons pages used to carry. The last crumb is
   the page you are on; every one before it goes there. */
export function Breadcrumbs({ items }) {
  return (
    <nav className="at-crumbs" aria-label="Breadcrumb">
      <ol>
        {items.map((item, i) => {
          const current = i === items.length - 1;
          return (
            <li key={`${i}:${item.label}`}>
              {i > 0 && <ChevronRight size={14} className="at-crumb-sep" aria-hidden="true" />}
              {current || !item.onClick
                ? <span className="at-crumb-here" aria-current={current ? 'page' : undefined}>{item.label}</span>
                : <button type="button" className="at-crumb-link" onClick={item.onClick}>{item.label}</button>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** The header every page opens with: the page's name, with any trail back up,
 *  on the left; AppHeader (`account`) on the right. Its height follows its
 *  content, and it wraps if it runs short. */
export function PageTopBar({ crumbs, account }) {
  return (
    <div className={`at-topbar${crumbs.length > 1 ? '' : ' at-topbar--single'}`}>
      {crumbs.length > 0 && <Breadcrumbs items={crumbs} />}
      {account}
    </div>
  );
}

/** The workspace's trail: `base` (home, then the open page) followed by the
 *  crumbs the page below adds with <Crumbs>, in the page's top bar. */
export function CrumbsProvider({ base, account, children }) {
  const [levels, setLevels] = useState({});
  const trail = useMemo(() => ({
    add: (level, items) => setLevels((prev) => ({ ...prev, [level]: items })),
    remove: (level) => setLevels((prev) => {
      const next = { ...prev };
      delete next[level];
      return next;
    }),
  }), []);
  const deeper = Object.keys(levels).map(Number).sort((a, b) => a - b).flatMap((level) => levels[level]);
  return (
    <CrumbsContext.Provider value={trail}>
      <PageTopBar crumbs={[...base, ...deeper]} account={account} />
      {children}
    </CrumbsContext.Provider>
  );
}

/** Adds crumbs below the open page; see useCrumbs (crumbs.js) for `level`. */
export function Crumbs({ level, items }) {
  useCrumbs(level, items);
  return null;
}
