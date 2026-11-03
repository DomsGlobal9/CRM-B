import { useCallback, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { hasModule } from '../navigation/nav';
import { setBoutiqueTimeZone } from '../services/format';
import { DATA_FOR_TAB, DATA_FOR_VIEW } from './pageData';

const isOwner = (user) => !user?.role || user.role === 'Owner';
/** Who may add customers (App's canAddCustomer): the owner, or an Admin handed customers.add. */
const mayAddCustomers = (user) => isOwner(user) || (user?.admin_tasks || []).includes('customers.add');

/**
 * The workspace's data, one request each: every page asks only for what it
 * shows (DATA_FOR_TAB / DATA_FOR_VIEW in context/pageData.js), what was fetched
 * once is kept, and a reload after a save fetches again only what has been
 * fetched. Also the bell's notifications and the WhatsApp connection status.
 */
export default function useWorkspaceData({ view, currentUser, dashboardTab, onboardingDismissed, setSelectedDashboardOrder, setDashboardData, setTailors, setDesignerStaff, setAppointments, showAppointmentModal, setFabrics, setCustomerStats, setOrdersList, setOrdersLoaded, setQueuedMessages, setDirectoryVersion, setLoading, setWhatsappStatus, setBoutiqueSettings, activeReviewStage, setLoadErrors, setNotifications }) {
  const fetchNotifications = async (user = currentUser) => {
    if (!user) return;
    const data = await api.getNotifications(user.role || 'Owner', user.email);
    setNotifications(data);
  };

  // The workspace's data, one request each. Every page asks only for what it
  // shows (DATA_FOR_TAB / DATA_FOR_VIEW below); what was fetched once is kept,
  // and a reload after a save fetches again only what has been fetched.
  const datasetLoaders = (user) => ({
    dashboard: () => api.getDashboard().then((data) => {
      setDashboardData(data);
      if (data.recent_orders?.length > 0) {
        setSelectedDashboardOrder((current) => {
          if (!current) return data.recent_orders[0];
          return data.recent_orders.find(o => o.id === current.id) || current;
        });
      }
    }),
    customerStats: () => api.getCustomerStats().then((data) => {
      setCustomerStats(data);
      // An open Customers page asks again too, so it shows what just changed.
      setDirectoryVersion((v) => v + 1);
    }),
    orders: () => api.getOrders().then((data) => { setOrdersList(data); setOrdersLoaded(true); }),
    tailors: hasModule(user, 'tailors') && (() => api.getTailors().then(setTailors)),
    // Silent on failure: the only cost is no designers in the Design stage's assign list.
    designerStaff: hasModule(user, 'tailors') && (() => api.getTailors({ forAttendance: true })
      .then((rows) => setDesignerStaff((rows || []).filter(t => t.role === 'Designer')))
      .catch(() => {})),
    appointments: hasModule(user, 'scheduling') && (() => api.getAppointments({ upcoming: 'true' }).then(setAppointments)),
    fabrics: hasModule(user, 'inventory') && (() => api.getInventoryItems({ picker: 'true' }).then(setFabrics)),
    settings: () => api.getBoutiqueSettings().then((data) => {
      setBoutiqueSettings(data);
      setBoutiqueTimeZone(data?.timezone);
    }),
    // Only the owner has the bell (useWorkspaceShell's showBell).
    notifications: hasModule(user, 'notifications') && isOwner(user) && (() => fetchNotifications(user)),
    queuedMessages: (!user?.role || ['Owner', 'Master'].includes(user.role) || (user.admin_tasks || []).includes('orders.notify'))
      && (() => api.getQueuedCustomerMessages().then(setQueuedMessages)),
  });

  // What every page needs: the boutique's settings, and -- for whoever may add
  // customers -- the customer count behind the sidebar's "Add new customers"
  // hint, which shows on every page. The bell's alerts are the Dashboard's
  // (DATA_FOR_TAB.overview).
  const alwaysLoaded = (user) => ['settings', ...(mayAddCustomers(user) ? ['customerStats'] : [])];

  const loadedData = useRef(new Set());

  const pendingLoads = useRef(0);

  /** Fetch these datasets now, side by side; `loading` holds while any are on their way. */
  const loadData = async (keys, user = currentUser) => {
    const loaders = datasetLoaders(user);
    keys.forEach((key) => loadedData.current.add(key));
    pendingLoads.current += 1;
    setLoading(true);
    try {
      await Promise.all(keys.map(async (key) => {
        if (!loaders[key]) return;
        try {
          await loaders[key]();
        } catch (err) {
          console.error(`Failed to load ${key}`, err);
          setLoadErrors((prev) => (prev.includes(key) ? prev : [...prev, key]));
        }
      }));
    } finally {
      pendingLoads.current -= 1;
      if (!pendingLoads.current) setLoading(false);
    }
  };

  /** After signing in, and after a save: the always-needed data, and again
   *  whatever the pages opened so far have fetched. */
  const fetchDashboardAndConfig = async (user = currentUser) => {
    setLoadErrors([]);
    await loadData([...new Set([...alwaysLoaded(user), ...loadedData.current])], user);
  };

  /** The bell was opened and the server marked every alert read: show them read. */
  const markNotificationsRead = () => setNotifications((list) => list.map((n) => (n.is_read ? n : { ...n, is_read: true })));

  // Each page's own data, fetched the first time the page -- or a popup that
  // needs it -- opens.
  useEffect(() => {
    if (!currentUser) { loadedData.current.clear(); return; }
    if (currentUser.must_change_password) return;
    const needed = [
      ...(view === 'dashboard' ? DATA_FOR_TAB[dashboardTab] || [] : DATA_FOR_VIEW[view] || []),
      // Assigning a stage, from whichever page opened it.
      ...(activeReviewStage ? ['tailors', 'designerStaff'] : []),
      // The appointment form's "With" list.
      ...(showAppointmentModal ? ['tailors'] : []),
      // The Dashboard's Getting started list ticks off staff and fabrics.
      ...(view === 'dashboard' && dashboardTab === 'overview' && !onboardingDismissed ? ['tailors', 'fabrics'] : []),
    ].filter((key) => !loadedData.current.has(key));
    if (needed.length) loadData([...new Set(needed)]);
    // loadData is a new function every render; these decide what is fetched.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, view, dashboardTab, activeReviewStage, showAppointmentModal, onboardingDismissed]);

  const fetchWhatsAppStatus = useCallback(async () => {
    try {
      const data = await api.getWhatsAppStatus();
      setWhatsappStatus({
        connected: !!data.connected,
        status: data.status || 'disconnected',
        qrCode: data.qrCode || null,
      });
    } catch {
      /* ignore silent background error */
    }
  // setWhatsappStatus is App's state setter, the same function on every render.
  }, [setWhatsappStatus]);

  useEffect(() => {
    if (view === 'dashboard' && dashboardTab === 'settings' && (!currentUser?.role || currentUser.role === 'Owner')) {
      fetchWhatsAppStatus();
    }
  }, [view, dashboardTab, currentUser, fetchWhatsAppStatus]);

  return {
    fetchNotifications,
    markNotificationsRead,
    datasetLoaders,
    loadedData,
    pendingLoads,
    loadData,
    fetchDashboardAndConfig,
    fetchWhatsAppStatus,
  };
}
