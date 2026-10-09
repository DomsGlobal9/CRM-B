/* A table row's actions behind one ⋯ button -- the same pattern as the
   platform console's boutique list. The menu is drawn through a portal on
   <body> at the button's position, so a table that scrolls sideways (or a
   sticky cell) cannot clip it or paint over it. It drops below the button,
   and opens upwards when the window has no room under it (the last rows).
   Closes on a click elsewhere, Escape, scroll or resize.

   items: [{ label, icon, onClick, danger?, disabled? }] */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';

const GAP = 4;
const EDGE = 8;

export default function RowMenu({ items, label = 'Actions', disabled = false }) {
  const [anchor, setAnchor] = useState(null); // the button's rectangle while open
  const menuRef = useRef(null);
  const open = anchor !== null;

  useEffect(() => {
    if (!open) return undefined;
    const close = () => setAnchor(null);
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

 
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!anchor || !el) return;
    const height = el.offsetHeight;
    const limit = window.innerHeight - EDGE;
    let top = anchor.bottom + GAP;
    if (top + height > limit) {
      const above = anchor.top - GAP - height;
      top = above >= EDGE ? above : Math.max(EDGE, limit - height);
    }
    el.style.top = `${top}px`;
    el.style.visibility = 'visible';
  }, [anchor]);

  const toggle = (e) => {
    e.stopPropagation();
    if (open) { setAnchor(null); return; }
    const r = e.currentTarget.getBoundingClientRect();
    window.dispatchEvent(new Event('click'));
    setAnchor({ top: r.top, bottom: r.bottom, right: window.innerWidth - r.right });
  };

  return (
    <>
      <button type="button" className="row-menu-btn" onClick={toggle} disabled={disabled}
              aria-haspopup="menu" aria-expanded={open} aria-label={label} title={label}>
        <MoreHorizontal size={16} />
      </button>
      {open && createPortal(
        <div ref={menuRef} className="row-menu" role="menu"
             style={{ top: anchor.bottom + GAP, right: anchor.right, visibility: 'hidden' }}
             onClick={(e) => e.stopPropagation()}>
          {items.map((item) => (
            <button key={item.label} type="button" role="menuitem" disabled={item.disabled}
                    className={`row-menu-item${item.danger ? ' row-menu-item--danger' : ''}`}
                    onClick={() => { setAnchor(null); item.onClick(); }}>
              {item.icon} {item.label}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}
