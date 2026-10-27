
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';

const GAP = 4;
const EDGE = 8;

export default function RowMenu({ items, label = 'Actions', disabled = false, icon = null }) {
  const [anchor, setAnchor] = useState(null); 
  const menuRef = useRef(null);
  const btnRef = useRef(null);
  const open = anchor !== null;

  useEffect(() => {
    if (!open) return undefined;
    const close = () => setAnchor(null);
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      close();
      btnRef.current?.focus({ preventScroll: true });
    };
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
    // Horizontally the menu's right edge follows the button's. Where that
    // would cross either side of the viewport (a button near the left edge,
    // as in a stacked table), pin it inside with the EDGE margin instead.
    const box = el.getBoundingClientRect();
    const viewport = document.documentElement.clientWidth;
    if (box.left < EDGE || box.right > viewport - EDGE) {
      const start = box.left < EDGE ? anchor.left : box.left;
      const left = Math.max(EDGE, Math.min(start, viewport - EDGE - box.width));
      el.style.right = 'auto';
      el.style.left = `${left}px`;
    }
    el.style.visibility = 'visible';
    // The menu is portalled to the end of <body>, so Tab would never reach
    // it: take focus into it. After a mouse click this shows no focus ring.
    el.querySelector('[role="menuitem"]:not(:disabled)')?.focus({ preventScroll: true });
  }, [anchor]);

  const onMenuKey = (e) => {
    if (e.key === 'Tab') {
      setAnchor(null);
      btnRef.current?.focus({ preventScroll: true });
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = [...e.currentTarget.querySelectorAll('[role="menuitem"]:not(:disabled)')];
    if (!items.length) return;
    const at = items.indexOf(document.activeElement);
    const step = e.key === 'ArrowDown' ? 1 : -1;
    items[(at + step + items.length) % items.length].focus({ preventScroll: true });
  };

  const toggle = (e) => {
    e.stopPropagation();
    if (open) { setAnchor(null); return; }
    const r = e.currentTarget.getBoundingClientRect();
    window.dispatchEvent(new Event('click'));
    setAnchor({ top: r.top, bottom: r.bottom, right: window.innerWidth - r.right, left: r.left });
  };

  return (
    <>
      <button ref={btnRef} type="button" className="row-menu-btn" onClick={toggle} disabled={disabled}
              aria-haspopup="menu" aria-expanded={open} aria-label={label} title={label}>
        {icon || <MoreHorizontal size={16} />}
      </button>
      {open && createPortal(
        <div ref={menuRef} className="row-menu" role="menu"
             style={{ top: anchor.bottom + GAP, right: anchor.right, visibility: 'hidden' }}
             onClick={(e) => e.stopPropagation()} onKeyDown={onMenuKey}>
          {items.map((item) => (
            <button key={item.label} type="button" role="menuitem" disabled={item.disabled} title={item.title}
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
