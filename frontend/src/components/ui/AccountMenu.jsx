import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * The account menu at the top of every page on a computer or tablet: the
 * "Hi, <name>" chip, which opens My Profile, Settings and Sign out (items:
 * { key, label, icon, onClick, danger } -- the same list the phone header's
 * avatar opens). It takes the place of the sidebar's Account group.
 *
 * The open menu reuses the phone header's menu look (.mobile-account-menu),
 * so the two read as one menu; Escape or a click outside closes it, and the
 * arrow keys move between its items.
 */
export function AccountMenu({ avatar, label, currentUser, items = [] }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);

  const close = (refocus) => {
    setOpen(false);
    if (refocus) buttonRef.current?.focus({ preventScroll: true });
  };

  useEffect(() => {
    if (!open) return undefined;
    menuRef.current?.querySelector('[role="menuitem"]')?.focus({ preventScroll: true });
    const onDown = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') close(true); };
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const onMenuKey = (e) => {
    if (e.key === 'Tab') { close(true); return; }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const list = [...e.currentTarget.querySelectorAll('[role="menuitem"]')];
    const at = list.indexOf(document.activeElement);
    const step = e.key === 'ArrowDown' ? 1 : -1;
    list[(at + step + list.length) % list.length]?.focus({ preventScroll: true });
  };

  const name = [currentUser?.first_name, currentUser?.last_name].filter(Boolean).join(' ') || currentUser?.username || 'Your account';
  const role = currentUser?.role || 'Owner';

  return (
    <div className="acct-menu" ref={wrapRef}>
      <button type="button" ref={buttonRef} className="user-profile-widget acct-menu-btn"
              onClick={() => setOpen((v) => !v)} disabled={!items.length}
              aria-haspopup="menu" aria-expanded={open} aria-label={`Account menu for ${name}`}>
        <span className="user-avatar-circle">{avatar}</span>
        <span>{label}</span>
        <ChevronDown size={16} className="acct-menu-chev" aria-hidden="true" />
      </button>
      {open && (
        <div className="mobile-account-menu acct-menu-list" role="menu" aria-label="Account" ref={menuRef} onKeyDown={onMenuKey}>
          <div className="mobile-account-who">
            <div className="mobile-account-name">{name}</div>
            <div className="mobile-account-role">{role}</div>
          </div>
          {items.map(({ key, label: text, icon: Icon, onClick, danger }) => (
            <button key={key} type="button" role="menuitem"
                    className={`mobile-account-item${danger ? ' mobile-account-item--danger' : ''}`}
                    onClick={() => { close(false); onClick(); }}>
              {Icon && <Icon size={16} />} {text}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
