/**
 * The platform console shell: sign-in, navigation, global search, routing.
 *
 * Screens live in ./screens/ and are plain components. This file owns only the
 * things every screen shares -- who is signed in, which route is showing, the
 * toast host and the error boundary -- so that adding a screen is adding a file
 * and one line in nav.js rather than editing a growing conditional.
 *
 * Deliberately separate from src/App.jsx. That is a boutique's workspace, signed
 * in as a boutique and scoped to one tenant; this is signed in as the platform
 * and scoped to all of them. One bundle for both would mean a boutique-role bug
 * becomes a cross-tenant one. The two share the design system -- the same
 * dark sidebar, drawer, sign-in page and components -- and nothing else.
 */

import { Component, Fragment, useCallback, useEffect, useState } from 'react';
import {
  FileWarning, Lock, LogOut, Menu, PanelLeftClose, PanelLeftOpen, RotateCw, User, X,
} from 'lucide-react';

import { reportCrash } from '../services/reportCrash';
import { clearToken, consoleApi, getToken } from './api';
import { NAV, ROUTES } from './nav';
import { useRoute } from './router';
import {
  AvatarInitials, Empty, Failed, Field, Loader, Note, SearchBox, ToastHost, count,
} from './ui';
import './superadmin.css';

import Dashboard from './screens/Dashboard.jsx';
import Boutiques from './screens/Boutiques.jsx';
import BoutiqueDetail from './screens/BoutiqueDetail.jsx';
import UsersScreen from './screens/Users.jsx';
import Onboarding from './screens/Onboarding.jsx';
import Leads from './screens/Leads.jsx';
import Modules from './screens/Modules.jsx';
import Config from './screens/Config.jsx';
import OrdersMonitor from './screens/OrdersMonitor.jsx';
import Integrations from './screens/Integrations.jsx';
import Messaging from './screens/Messaging.jsx';
import Errors from './screens/Errors.jsx';
import ErrorHandling from './screens/ErrorHandling.jsx';
import Health from './screens/Health.jsx';
import Audit from './screens/Audit.jsx';
import Sessions from './screens/Sessions.jsx';
import Signins from './screens/Signins.jsx';
import Support from './screens/Support.jsx';
import NotMeasured from './screens/NotMeasured.jsx';

const SCREENS = {
  dashboard: Dashboard,
  health: Health,
  boutiques: Boutiques,
  users: UsersScreen,
  onboarding: Onboarding,
  leads: Leads,
  modules: Modules,
  // No `flags` entry, and that is deliberate -- see the note in nav.js. The
  // screen file is kept; nothing routes to it, so #/flags falls through to the
  // console's "no such screen" state rather than presenting switches that
  // control nothing.
  config: Config,
  orders: OrdersMonitor,
  integrations: Integrations,
  messaging: Messaging,
  errors: Errors,
  handling: ErrorHandling,
  jobs: NotMeasured,
  api: NotMeasured,
  audit: Audit,
  sessions: Sessions,
  signins: Signins,
  support: Support,
};

const WORDMARK = '/scaleezy-wordmark.webp';

/* ---------------------------------------------------------------- guard */

/**
 * One thrown render must not blank the whole console.
 *
 * Without this, a single bad field in one API response takes down the screen an
 * administrator opened *because* something is broken -- the worst possible time
 * for the tool to disappear. Class component because React has no hook form of
 * componentDidCatch.
 */
class Boundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Something does collect frontend errors now: /api/client-errors/ files
    // this as an ErrorEvent of kind='frontend'. The console reports its own
    // crashes through the same door as the boutique workspace -- an operator
    // whose Error Center screen just died should not have to notice and say so.
    reportCrash(error, info);
    console.error('Console screen crashed:', error, info);
  }

  componentDidUpdate(prev) {
    if (prev.routeKey !== this.props.routeKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <Failed
          error={{ message: `This screen failed to render: ${this.state.error.message}` }}
          onRetry={() => this.setState({ error: null })}
        />
      );
    }
    return this.props.children;
  }
}

/* -------------------------------------------------------------- sign in */

/** The workspace entry page: the wordmark on the shell colour, one card. */
function SignIn({ onSignedIn }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      onSignedIn(await consoleApi.login(username, password));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page sa-signin">
      <img className="portal-wordmark portal-wordmark--auth" src={WORDMARK} alt="Scaleezy" />

      <form className="auth-card" onSubmit={submit}>
        <div className="sa-signin-head">
          <h1 className="auth-title">Platform console</h1>
          <p className="auth-subtitle">Scaleezy administrators only.</p>
        </div>

        {error && <Note tone="error">{error}</Note>}

        <Field label="Administrator username" htmlFor="sa-username" icon={User}>
          <input id="sa-username" type="text" value={username} autoComplete="username"
            onChange={(e) => setUsername(e.target.value)} required />
        </Field>
        <Field label="Password" htmlFor="sa-password" icon={Lock}>
          <input id="sa-password" type="password" value={password}
            autoComplete="current-password" onChange={(e) => setPassword(e.target.value)} required />
        </Field>

        <button className="btn-primary" type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}

/* --------------------------------------------------------- global search */

function GlobalSearch({ onOpen }) {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (term.trim().length < 2) { setResults(null); return; }
    let live = true;
    setBusy(true);
    consoleApi.search(term)
      .then((data) => { if (live) setResults(data.results || []); })
      .catch(() => { if (live) setResults([]); })
      .finally(() => { if (live) setBusy(false); });
    return () => { live = false; };
  }, [term]);

  return (
    // The results hang off this box, so they sit under the input whatever
    // height the input is.
    <div className="sa-global-search">
      <SearchBox value={term} onChange={setTerm}
        placeholder="Search boutiques, users, customers, orders, errors…" />
      {results && (
        <div className="sa-results">
          {busy && <div className="sa-results-empty"><Loader inline label="Searching…" /></div>}
          {!busy && results.length === 0 && <div className="sa-results-empty">Nothing matches.</div>}
          {results.map((r, i) => (
            <button key={`${r.type}-${r.id}-${i}`} type="button" className="sa-result"
              onClick={() => { setTerm(''); setResults(null); onOpen(r); }}>
              <span className="sa-result-type">{r.type}</span>
              <span className="sa-result-label">
                {r.label}
                {r.sublabel && <span className="sa-muted"> — {r.sublabel}</span>}
              </span>
              {r.boutique_name && <span className="sa-result-sub">{r.boutique_name}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ----------------------------------------------------------- navigation */

/**
 * One sidebar entry: a link for a screen (so it can be opened in a new tab),
 * a button for Sign out. Collapsed, the label is a flyout on hover and focus,
 * as in the workspace.
 */
function NavItem({ icon: Icon, label, href, active, collapsed, badge, ariaLabel, onClick }) {
  const [flyout, setFlyout] = useState(null);
  const show = (e) => {
    if (!collapsed) return;
    const r = e.currentTarget.getBoundingClientRect();
    setFlyout({ top: r.top + r.height / 2, left: r.right + 10 });
  };
  const hide = () => setFlyout(null);
  const Tag = href ? 'a' : 'button';

  return (
    <Tag
      className={`portal-menu-item${active ? ' active' : ''}`}
      href={href}
      type={href ? undefined : 'button'}
      aria-current={active ? 'page' : undefined}
      aria-label={collapsed ? ariaLabel || label : undefined}
      onClick={onClick}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      <Icon size={16} aria-hidden="true" />
      <span className="portal-menu-label">{label}</span>
      {badge}
      {collapsed && flyout && (
        <span className="portal-flyout" role="tooltip" style={{ top: flyout.top, left: flyout.left }}>{label}</span>
      )}
    </Tag>
  );
}

/* ------------------------------------------------------------------ app */

// Its own key, not the workspace's 'nav_collapsed': the two apps share an
// origin, and folding the console's rail should not fold a boutique's.
const NAV_KEY = 'sa_nav_collapsed';

const readCollapsed = () => {
  try { return localStorage.getItem(NAV_KEY) === '1'; } catch { return false; }
};

export default function SuperAdmin() {
  const [user, setUser] = useState(null);
  // A token in storage is not proof of a live session -- it may have been
  // revoked, or belong to an account that is no longer a superuser -- so the
  // console asks the server before it draws anything. With no token there is
  // nothing to ask, and the sign-in page is drawn straight away.
  const [checking, setChecking] = useState(() => Boolean(getToken()));
  const [errorCount, setErrorCount] = useState(0);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [drawer, setDrawer] = useState(false);
  const route = useRoute();

  useEffect(() => {
    if (!getToken()) return;
    consoleApi.me()
      .then(setUser)
      .catch(() => clearToken())
      .finally(() => setChecking(false));
  }, []);

  // The unresolved-error count rides in the nav so a new incident is visible
  // from whichever screen someone happens to be on.
  const refreshBadges = useCallback(() => {
    if (!user) return;
    consoleApi.errorSummary()
      .then((d) => setErrorCount(d.unresolved || 0))
      .catch(() => setErrorCount(0));
  }, [user]);

  useEffect(() => { refreshBadges(); }, [refreshBadges, route.head]);

  // Escape closes the drawer, as tapping the shade behind it does.
  useEffect(() => {
    if (!drawer) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setDrawer(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawer]);

  // The drawer belongs to the tablet and phone layout. Widened past 1024px
  // (a tablet turned to landscape) the desktop rail takes over, and an open
  // drawer left behind would keep the collapsed rail from labelling its icons.
  useEffect(() => {
    const wide = window.matchMedia('(min-width: 1025px)');
    const onChange = (e) => { if (e.matches) setDrawer(false); };
    wide.addEventListener('change', onChange);
    return () => wide.removeEventListener('change', onChange);
  }, []);

  const toggleNav = () => {
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem(NAV_KEY, next ? '1' : '0'); } catch { /* per-device convenience only */ }
  };

  const signOut = async () => {
    setDrawer(false);
    await consoleApi.logout();
    setUser(null);
  };

  const openResult = (result) => {
    if (result.type === 'boutique') route.go(`boutiques/${result.boutique}`);
    else if (result.type === 'error') route.go('errors');
    else if (result.type === 'user') route.go('users');
    else if (result.boutique) route.go(`boutiques/${result.boutique}/data`);
  };

  // A plain click routes in place and closes the drawer; a modified click
  // (new tab, new window) is left to the browser, which the href makes work.
  const pick = (key) => (event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    route.go(key);
    setDrawer(false);
  };

  if (checking) {
    return (
      <div className="sa-boot">
        <Loader inline label="Checking your session…" />
      </div>
    );
  }
  if (!user) return <SignIn onSignedIn={setUser} />;

  // A boutique route carries its schema in the URL, so a detail page survives a
  // reload and can be linked to.
  const isDetail = route.head === 'boutiques' && route.parts.length > 1;
  const Screen = isDetail ? BoutiqueDetail : SCREENS[route.head];
  // Collapsing is a desktop affordance; the drawer always shows labels.
  const railCollapsed = collapsed && !drawer;

  return (
    <ToastHost>
      <div className={`portal-layout sa-shell${collapsed ? ' nav-collapsed' : ''}`}>
        {/* Tablet and phone: the shell-coloured bar that opens the drawer. */}
        <div className="mobile-portal-header">
          <div className="sa-mobile-brand">
            <button type="button" className="mobile-hamburger-btn" onClick={() => setDrawer((open) => !open)}
              aria-label="Toggle navigation menu" aria-expanded={drawer}>
              {drawer ? <X size={22} /> : <Menu size={22} />}
            </button>
            <img className="portal-wordmark portal-wordmark--sm" src={WORDMARK} alt="Scaleezy" />
            <span className="sa-mobile-label">Platform console</span>
          </div>
          {errorCount > 0 && (
            <button type="button" className="sa-mobile-errors"
              aria-label={`Crashes, ${count(errorCount)} unresolved`}
              onClick={() => { route.go('errors'); setDrawer(false); }}>
              <FileWarning size={16} aria-hidden="true" />
              <span className="sa-nav-count">{count(errorCount)}</span>
            </button>
          )}
        </div>

        {drawer && <div className="mobile-portal-overlay" onClick={() => setDrawer(false)} />}

        <aside className={`portal-sidebar${drawer ? ' mobile-open' : ''}`}>
          <div className="portal-sidebar-header-desktop">
            <div className="portal-sidebar-brand">
              <div className="sa-brand-lockup">
                <img className="portal-wordmark" src={WORDMARK} alt="Scaleezy" />
                <div className="portal-sidebar-logo-sub">Platform console</div>
              </div>
              <div className="portal-sidebar-mark" aria-hidden="true">S</div>
              <button type="button" className="portal-nav-toggle" onClick={toggleNav}
                aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
                aria-expanded={!collapsed}
                title={collapsed ? 'Expand navigation' : 'Collapse navigation'}>
                {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
              </button>
            </div>
          </div>

          <nav className="portal-menu" aria-label="Console">
            {NAV.map((group) => (
              <Fragment key={group.group}>
                <div className="portal-menu-group">{group.group}</div>
                {group.items.map((item) => {
                  const showCount = item.badge === 'errors' && errorCount > 0;
                  return (
                    <NavItem key={item.key}
                      icon={item.icon}
                      label={item.label}
                      href={`#/${item.key}`}
                      active={route.head === item.key}
                      collapsed={railCollapsed}
                      ariaLabel={showCount ? `${item.label}, ${count(errorCount)}` : item.label}
                      badge={showCount && <span className="sa-nav-count">{count(errorCount)}</span>}
                      onClick={pick(item.key)} />
                  );
                })}
              </Fragment>
            ))}
            <div className="portal-menu-divider" />
            <NavItem icon={LogOut} label="Sign out" collapsed={railCollapsed} onClick={signOut} />
          </nav>
        </aside>

        {/* Landmarks: the top row is the banner, the screen alone is main, so
            jumping to main lands on the content rather than the search box. */}
        <div className="portal-main">
          <header className="sa-topbar">
            <GlobalSearch onOpen={openResult} />
            <div className="sa-topbar-right">
              <div className="user-profile-widget sa-who">
                <AvatarInitials name={user.username} size={32} />
                <span className="sa-who-text">Signed in as <strong>{user.username}</strong></span>
              </div>
              <button type="button" className="btn-secondary at-btn-sm" onClick={() => window.location.reload()}>
                <RotateCw size={14} /> Refresh
              </button>
            </div>
          </header>

          <main className="sa-page">
            <Boundary routeKey={route.hash}>
              {Screen
                ? <Screen route={route} onBadges={refreshBadges} />
                : <Empty title="No such screen."
                    detail={`"${route.head}" is not part of the console.`}
                    action={(
                      <button type="button" className="btn-secondary" onClick={() => route.go('dashboard')}>
                        Go to the dashboard
                      </button>
                    )} />}
            </Boundary>
          </main>
        </div>
      </div>
    </ToastHost>
  );
}

export { ROUTES };
