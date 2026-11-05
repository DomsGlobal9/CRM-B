import { CircleHelp, Flag, Settings } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';
import './appHeader.css';

/**
 * The right side of the header on every workspace page (PageTopBar draws the
 * title on its left): the guide, the bell, the theme, Settings, the Getting
 * started count and the account menu. Each is optional, so a role only sees what
 * it can use. Below 1100px the name folds into the avatar. A phone has its own
 * dark header bar instead, with these in its account menu.
 */
export function AppHeader({ help, bell, settings, setup, account }) {
  return (
    <div className="portal-account-bar app-header">
      <div className="app-header-icons">
        {help && (
          <button type="button" className="app-header-icon" onClick={help.onClick}
                  title={help.label} aria-label={help.label}>
            <CircleHelp size={19} />
          </button>
        )}
        {bell}
        <ThemeToggle className="app-header-icon portal-account-theme-btn" size={19} />
        {settings && (
          <button type="button" className="app-header-icon" onClick={settings.onClick}
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
