import React, { useState } from 'react';

function NavItem({ icon: Icon, label, active, onClick, collapsed, hint, tour }) {
  const [flyout, setFlyout] = useState(null);
  const show = (e) => {
    if (!collapsed) return;
    const r = e.currentTarget.getBoundingClientRect();
    setFlyout({ top: r.top + r.height / 2, left: r.right + 10 });
  };
  const hide = () => setFlyout(null);
  return (
    <a
      className={`portal-menu-item${active ? ' active' : ''}${hint && !collapsed ? ' gh-nav' : ''}`}
      data-tour={tour}
      role="button"
      tabIndex={0}
      aria-label={collapsed ? label : undefined}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      <Icon size={16} />
      <span className="portal-menu-label">{label}</span>
      {/* Notched into the item's own top border, so it scrolls with the item
          and can never reach past the sidebar. */}
      {hint && !collapsed && <span className="gh-nav-label" role="note">{hint}</span>}
      {collapsed && flyout && (
        <span className="portal-flyout" role="tooltip" style={{ top: flyout.top, left: flyout.left }}>{label}</span>
      )}
    </a>
  );
}

export function PortalMenu({ sections, activeTab, onPick, collapsed = false, hints = {} }) {
  return sections.map((section) => (
    <React.Fragment key={section.key}>
      {section.divider && <div className="portal-menu-divider" />}
      {section.label && <div className="portal-menu-group">{section.label}</div>}
      {/* `match`: an item that stands for several tabs (Reports) is lit on any of them. */}
      {section.items.map(({ tab, icon, label, match }) => (
        <NavItem key={match ? match.join('+') : tab} icon={icon} label={label}
                 active={match ? match.includes(activeTab) : activeTab === tab}
                 collapsed={collapsed} onClick={() => onPick(tab)} hint={hints[tab]}
                 tour={match ? 'reports' : tab} />
      ))}
    </React.Fragment>
  ));
}
