import { useState } from 'react';
import { CircleHelp, Flag, Plus, Search, Settings } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';
import './appHeader.css';

/**
 * The right side of the header on every workspace page (PageTopBar draws the
 * title on its left): search, New order, the guide, the bell, the theme,
 * Settings, the Getting started count and the account menu. Each is optional, so
 * a role only sees what it can use. Below 1100px the name folds into the avatar,
 * below 960px the guide and Settings fold into the account menu that also lists
 * them. On a phone, whose dark header bar has the rest, only search and New
 * order stay.
 */
export function AppHeader({ search, newOrder, help, bell, settings, setup, account }) {
  const [query, setQuery] = useState('');
  return (
    <div className="portal-account-bar app-header">
      {search && (
        <form className="app-header-search" role="search" onSubmit={(e) => {
          e.preventDefault();
          if (query.trim()) search.onSubmit(query.trim());
        }}>
          <Search size={16} aria-hidden="true" />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)}
                 placeholder={search.placeholder} aria-label={search.placeholder} />
        </form>
      )}
      {newOrder && (
        <button type="button" className="app-header-plus" onClick={newOrder.onClick}
                title={newOrder.label} aria-label={newOrder.label}>
          <Plus size={20} />
        </button>
      )}
      <div className="app-header-icons">
        {help && (
          <button type="button" className="app-header-icon app-header-icon--foldable" onClick={help.onClick}
                  title={help.label} aria-label={help.label}>
            <CircleHelp size={19} />
          </button>
        )}
        {bell}
        <ThemeToggle className="app-header-icon portal-account-theme-btn" size={19} />
        {settings && (
          <button type="button" className="app-header-icon app-header-icon--foldable" onClick={settings.onClick}
                  title={settings.label} aria-label={settings.label}>
            <Settings size={19} />
          </button>
        )}
      </div>
      {setup && (
        <>
          <span className="app-header-rule" aria-hidden="true" />
          <button type="button" className="app-header-setup" onClick={setup.onClick}
                  title={setup.label} aria-label={setup.label}>
            <span className="app-header-setup-flag"><Flag size={13} /></span>
            {setup.done}/{setup.total}
          </button>
        </>
      )}
      <span className="app-header-rule" aria-hidden="true" />
      {account}
    </div>
  );
}
