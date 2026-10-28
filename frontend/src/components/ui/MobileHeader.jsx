import { useEffect, useRef, useState } from 'react';
import { Menu, Bell } from 'lucide-react';

/**
 * The phone header.
 *
 * It carries the hamburger itself rather than leaving it to the separate
 * .mobile-portal-header bar. Below 768px only one of the two headers is shown,
 * so whichever one is visible has to be the one that can reach the drawer --
 * otherwise the sidebar, and with it most of the app's navigation, becomes
 * unreachable on a phone.
 *
 * The avatar opens an account menu (accountItems: { key, label, icon, onClick,
 * danger }) -- a tap on your own picture is where a phone user looks for their
 * profile and for signing out.
 */

export function MobileHeader({ title, currentUser, notificationsCount, onOpenNotifications, onOpenMenu, accountItems = [], showBell = true }) {
  const [accountOpen, setAccountOpen] = useState(false);
  const wrapRef = useRef(null);
  const avatarRef = useRef(null);
  const menuRef = useRef(null);

  const closeAccount = (refocus) => {
    setAccountOpen(false);
    if (refocus) avatarRef.current?.focus({ preventScroll: true });
  };

  useEffect(() => {
    if (!accountOpen) return undefined;
    menuRef.current?.querySelector('[role="menuitem"]')?.focus({ preventScroll: true });
    const onDown = (e) => { if (!wrapRef.current?.contains(e.target)) setAccountOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') closeAccount(true); };
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [accountOpen]);

  const onMenuKey = (e) => {
    if (e.key === 'Tab') { closeAccount(true); return; }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = [...e.currentTarget.querySelectorAll('[role="menuitem"]')];
    const at = items.indexOf(document.activeElement);
    const step = e.key === 'ArrowDown' ? 1 : -1;
    items[(at + step + items.length) % items.length]?.focus({ preventScroll: true });
  };

  const name = [currentUser?.first_name, currentUser?.last_name].filter(Boolean).join(' ') || currentUser?.username || 'Your account';
  const role = currentUser?.role || 'Owner';

  return (
    <header className="mobile-app-header">
      <div className="mobile-header-bar">
          <div className="mobile-header-brand-group">
            {onOpenMenu && (
              <button type="button" className="icon-btn-touch mobile-header-menu-btn"
                      onClick={onOpenMenu} aria-label="Open navigation menu">
                <Menu size={22} />
              </button>
            )}
            <h2 className="mobile-header-title">{title || 'Scaleezy'}</h2>
          </div>

          <div className="mobile-header-actions" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* `showBell`: the page decides (the owner's Dashboard only). */}
            {showBell && (
            <button type="button" className="icon-btn-touch relative-btn" onClick={onOpenNotifications} aria-label="Notifications">
              <Bell size={20} />
              {notificationsCount > 0 && (
                <span className="mobile-header-badge">{notificationsCount}</span>
              )}
            </button>
            )}

            <div className="mobile-account" ref={wrapRef}>
              <button type="button" ref={avatarRef} className="mobile-header-avatar mobile-account-btn"
                      onClick={() => setAccountOpen((open) => !open)} disabled={!accountItems.length}
                      aria-haspopup="menu" aria-expanded={accountOpen} aria-label={`Account menu for ${name}`}>
                <img
                  src={`https://api.dicebear.com/7.x/initials/svg?backgroundColor=e6f1c8&textColor=1f2a06&seed=${encodeURIComponent(currentUser?.first_name || 'User')}`}
                  alt=""
                />
              </button>
              {accountOpen && (
                <div className="mobile-account-menu" role="menu" aria-label="Account" ref={menuRef} onKeyDown={onMenuKey}>
                  <div className="mobile-account-who">
                    <div className="mobile-account-name">{name}</div>
                    <div className="mobile-account-role">{role}</div>
                  </div>
                  {accountItems.map(({ key, label, icon: Icon, onClick, danger }) => (
                    <button key={key} type="button" role="menuitem"
                            className={`mobile-account-item${danger ? ' mobile-account-item--danger' : ''}`}
                            onClick={() => { closeAccount(false); onClick(); }}>
                      {Icon && <Icon size={16} />} {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
      </div>
    </header>
  );
}
