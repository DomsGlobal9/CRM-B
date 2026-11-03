import { BarChart2, Bell, Compass, LogOut, Settings, User, Wallet } from 'lucide-react';
import { useEffect } from 'react';
import { hasPageTour } from '../components/ui/tourPages';
import { api } from '../services/api';
import { AccountMenu } from '../components/ui/AccountMenu';
import { UserAvatar } from '../components/ui/UserAvatar';
import { Segmented } from '../components/ui/Atelier';
import { canSeeTab } from './nav';

/**
 * What the workspace's frame shows around the pages: the account menu and the
 * account bar with the bell, the sidebar's sections (Reports in place of Profit
 * & Costs and Insights) and its hints, the Reports switch, the Getting started
 * steps, and the menu the guided tour walks through.
 */
export default function useWorkspaceShell({ setView, setDashboardTab, currentUser, t, currentUserName, navSections, navTabs, dashboardTab, showBell, onboardingDismissed, setSelectedDirectoryCustomer, dashboardData, tailors, fabrics, ordersList, ordersLoaded, loading, setTourOpen, tourOpen, setPageTour, pageTour, notifications, setShowNotificationsDrawer, markingNotificationsRead, setMarkingNotificationsRead, fetchNotifications, handleLogout, setCustomerAddMode, setEditingCustomer, bookTotal, adminCan, isOwnerUser }) {
  // The phone header's avatar menu: the Account entries this user's sidebar
  // shows, then Sign out. `go` is how that screen switches tab.
  const headerAccountItems = (go) => [
    ...['account', 'settings'].filter((tab) => navTabs.includes(tab)).map((tab) => ({
      key: tab, label: tab === 'account' ? t('nav.account') : t('nav.settings'),
      icon: tab === 'account' ? User : Settings, onClick: () => go(tab),
    })),
    // One guide entry: this page's own guide, or on the Dashboard (which has
    // none of its own) the Dashboard tour.
    { key: 'page-tour', label: t('nav.pageGuide', 'Guide for this page'), icon: Compass,
      onClick: () => (hasPageTour(dashboardTab, currentUser?.role) ? setPageTour(dashboardTab) : setTourOpen(true)) },
    { key: 'logout', label: t('nav.logout'), icon: LogOut, danger: true, onClick: () => handleLogout() },
  ];

  // The same account entries on a computer or tablet: the "Hi, <name>" chip at
  // the top of every page opens them (the sidebar no longer lists them). A
  // phone has MobileHeader's avatar menu instead, so the bar is hidden there.
  const accountBar = (go) => (
    <div className="portal-account-bar">
      {showBell && (
      <button
        type="button"
        className="portal-account-bell-btn"
        disabled={markingNotificationsRead}
        title={t('common.inboxAlerts', 'Inbox Alerts')}
        aria-label={t('common.inboxAlerts', 'Inbox Alerts')}
        onClick={() => {
          setShowNotificationsDrawer(true);
          if (markingNotificationsRead) return;
          setMarkingNotificationsRead(true);
          api.markNotificationsAsRead(currentUser?.role || 'Owner', currentUser?.email)
            .then(() => fetchNotifications())
            .catch(() => {})
            .finally(() => setMarkingNotificationsRead(false));
        }}
      >
        <Bell size={18} />
        {notifications.filter(n => !n.is_read).length > 0 && (
          <span className="portal-account-bell-badge">
            {notifications.filter(n => !n.is_read).length}
          </span>
        )}
      </button>
      )}
      <AccountMenu avatar={<UserAvatar user={currentUser} />}
                   label={t('dashboard.hiUser', `Hi, ${currentUserName}`, { name: currentUserName })}
                   currentUser={currentUser} items={headerAccountItems(go)} />
    </div>
  );

  // Reports: Profit & Costs and Insights under one sidebar item. Each is still
  // its own tab and page; the switch at the top of both moves between them,
  // and the sidebar item opens the one used last on this device. A plan
  // without Profit & Costs gets Insights alone, with no switch.
  const REPORT_TABS = ['finance', 'analytics'];

  const reportTabs = REPORT_TABS.filter((tab) => navTabs.includes(tab));

  useEffect(() => {
    if (dashboardTab !== 'finance' && dashboardTab !== 'analytics') return;
    try { localStorage.setItem('reports_tab', dashboardTab); } catch { /* per-device convenience only */ }
  }, [dashboardTab]);

  const reportsTab = REPORT_TABS.includes(dashboardTab) ? dashboardTab : (() => {
    try { return localStorage.getItem('reports_tab') || 'finance'; } catch { return 'finance'; }
  })();

  // The sidebar: no Account group (it is the menu at the top of the page), and
  // Reports in the place of Profit & Costs and Insights.
  const sidebarSections = navSections
    .filter((section) => section.key !== 'session')
    .map((section) => {
      const at = section.items.findIndex((item) => REPORT_TABS.includes(item.tab));
      if (at === -1 || !reportTabs.length) return section;
      const items = section.items.filter((item) => !REPORT_TABS.includes(item.tab));
      items.splice(at, 0, {
        tab: reportTabs.includes(reportsTab) ? reportsTab : reportTabs[0],
        icon: BarChart2, label: t('nav.reports', 'Reports'), match: reportTabs,
      });
      return { ...section, items };
    });

  const reportsSwitch = reportTabs.length > 1 && (
    <div className="reports-switch">
      <span className="reports-switch-label">{t('nav.reports', 'Reports')}</span>
      <Segmented ariaLabel={t('nav.reports', 'Reports')} value={dashboardTab}
                 onChange={(tab) => { setDashboardTab(tab); window.scrollTo(0, 0); }}
                 options={reportTabs.map((tab) => (tab === 'finance'
                   ? { key: tab, label: t('nav.finance', 'Profit & Costs'), icon: Wallet }
                   : { key: tab, label: t('nav.analytics', 'Insights'), icon: BarChart2 }))} />
    </div>
  );

  const canAddCustomer = isOwnerUser || adminCan('customers.add');

  const guideCustomers = !loading && canAddCustomer && bookTotal < 10;

  // How many orders there are: the list once it is loaded, else the Dashboard's
  // count; neither yet (a page that loads no orders), and the hint waits.
  const orderCount = ordersLoaded ? ordersList.length : dashboardData?.stats?.total_orders ?? null;

  const guideOrders = !loading && orderCount !== null && orderCount < 10;

  const sidebarHint = {
    ...(guideCustomers && dashboardTab !== 'customers' ? { customers: t('onboard.sidebarCustomers', 'Add new customers') } : {}),
    ...(guideOrders && dashboardTab !== 'orders' ? { orders: orderCount ? t('onboard.sidebarOrders', 'Create orders here') : t('onboard.sidebarFirstOrder', 'Create your first order') } : {}),
  };

  const onboardingSteps = [
    { key: 'boutique', label: 'Create your boutique', done: true },
    // The same New customer form the Customers page's Add Customer leads to.
    { key: 'customer', label: 'Add your first customer', done: bookTotal > 0, go: () => {
      setSelectedDirectoryCustomer(null); setEditingCustomer(null);
      setDashboardTab('customers'); setCustomerAddMode('manual');
    } },
    { key: 'order', label: 'Take your first order', done: ordersList.length > 0, go: () => setView('order-selector') },
    { key: 'staff', label: 'Add your tailors, masters and designers', done: tailors.length > 0, tab: 'staff', go: () => setDashboardTab('staff') },
    { key: 'fabrics', label: 'Put your first fabric on the shelf', done: fabrics.length > 0, tab: 'inventory', go: () => setDashboardTab('inventory') },
    { key: 'production', label: 'Move an order through the workroom', done: ordersList.some(o => o.order_status && o.order_status !== 'Received'), tab: 'orders', go: () => setDashboardTab('orders') },

  ].filter((step) => !step.tab || canSeeTab(currentUser, step.tab));

  const showOnboarding = !loading && !onboardingDismissed && onboardingSteps.some(step => !step.done);

  // The guided tour (ProductTour.jsx): the menu this user really has.
  const tourMenu = sidebarSections.flatMap((section) => section.items)
    .map(({ tab, label, match }) => ({ tab, label, tour: match ? 'reports' : tab }));

  // A page's own tour is open only while that page is the one on screen.
  const pageTourOpen = !!pageTour && pageTour === dashboardTab && !tourOpen;

  return {
    headerAccountItems,
    accountBar,
    REPORT_TABS,
    reportTabs,
    reportsTab,
    sidebarSections,
    reportsSwitch,
    canAddCustomer,
    guideCustomers,
    orderCount,
    guideOrders,
    sidebarHint,
    onboardingSteps,
    showOnboarding,
    tourMenu,
    pageTourOpen,
  };
}
