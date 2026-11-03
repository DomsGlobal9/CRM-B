import React, { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react';
import { Compass, Check, BarChart2, FolderOpen, Sparkles, X, ExternalLink, Bell, User, LogOut, Menu, Settings, Wallet, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { api } from './services/api';
import { maySignOff } from './services/signOff';
import { displayMobile, phoneError, cleanEmail, emailError, imageFilesError } from './services/validate';
import {
  formatTime as fmtTime, setBoutiqueTimeZone,
} from './services/format';

const ReviewLightbox = lazy(() => import('./features/designStudio/GarmentPartPicker').then(m => ({ default: m.Lightbox })));

const InventoryPanel = lazy(() => import('./features/inventory/InventoryPanel'));
const StaffPanel = lazy(() => import('./features/staff/StaffPanel'));
const FinancePanel = lazy(() => import('./features/finance/FinancePanel'));
const InsightsPanel = lazy(() => import('./features/analytics/InsightsPanel'));
const OrderDetailPanel = lazy(() => import('./features/orders/OrderDetailPanel'));
const OrdersPanel = lazy(() => import('./features/orders/OrdersPanel'));
const CustomersPanel = lazy(() => import('./features/customers/CustomersPanel'));
const CustomerDetailPanel = lazy(() => import('./features/customers/CustomerDetailPanel'));
const AccountPanel = lazy(() => import('./features/account/AccountPanel'));
const InvoicesPanel = lazy(() => import('./features/invoices/InvoicesPanel'));
const WorkPanel = lazy(() => import('./features/work/WorkPanel'));
const DailyUpdates = lazy(() => import('./features/todo/DailyUpdates'));
import { AddCustomerChooser, CustomerForm, DeleteAllCustomersDialog } from './features/customers/AddCustomer';
import { useCustomerLookup } from './features/customers/useCustomerLookup';
import { useFabricTaxonomy } from './features/fabrics/taxonomy';
import useAutosave from './hooks/useAutosave';
import { syncFollowers } from './services/garmentCopies';
import { applyTenantTheme } from './theme';
import { MobileHeader } from './components/ui/MobileHeader';
import { AccountMenu } from './components/ui/AccountMenu';
import { PageHeader, Segmented, FormModal } from './components/ui/Atelier';
import { useLanguage } from './i18n/LanguageContext.jsx';
import { AppContext } from './context/AppContext';
import useOrderDraft from './features/orderWizard/useOrderDraft';
import ReversalPrompt from './features/orders/ReversalPrompt';
import useCustomerBook from './features/customers/useCustomerBook';
import useOrdersPage from './features/orders/useOrdersPage';
import useStageReview from './features/orders/useStageReview';
import useAppointments from './features/appointments/useAppointments';
import useDesignManager from './features/designStudio/useDesignManager';
import useOrderWizard from './features/orderWizard/useOrderWizard';
import OrderTypeSelector from './features/orderWizard/OrderTypeSelector';
import WizardFooter from './features/orderWizard/WizardFooter';
import WhoStep from './features/orderWizard/WhoStep';
import GarmentsStep from './features/orderWizard/GarmentsStep';
import MeasurementsStep from './features/orderWizard/MeasurementsStep';
import ReviewStep from './features/orderWizard/ReviewStep';
import MoneyStep from './features/orderWizard/MoneyStep';
import AlterGarmentStep from './features/orderWizard/AlterGarmentStep';
import AlterIssueStep from './features/orderWizard/AlterIssueStep';
import OutsideGarmentStep from './features/orderWizard/OutsideGarmentStep';
import OutsideIssueStep from './features/orderWizard/OutsideIssueStep';
import FindBoutiqueScreen from './features/auth/FindBoutiqueScreen';
import BoutiqueNotFound from './features/auth/BoutiqueNotFound';
import LoginScreen from './features/auth/LoginScreen';
import ForgotPasswordScreen from './features/auth/ForgotPasswordScreen';
import ResetPasswordScreen from './features/auth/ResetPasswordScreen';
import ChangePasswordScreen from './features/auth/ChangePasswordScreen';
import SignupScreen from './features/auth/SignupScreen';
import useAuthForms from './features/auth/useAuthForms';
import DesignsPanel from './features/designStudio/DesignsPanel';
import AppointmentModal from './features/appointments/AppointmentModal';
import DesignFormModal from './features/designStudio/DesignFormModal';
import OrderConfirmedScreen from './features/orders/OrderConfirmedScreen';
import InvoiceModal from './features/invoices/InvoiceModal';
import StageReviewModal from './features/orders/StageReviewModal';
import OverviewPanel from './features/dashboard/OverviewPanel';
import NotificationsDrawer from './features/notifications/NotificationsDrawer';
import LanguageSelector from './components/LanguageSelector.jsx';
import SettingsPage from './components/SettingsPage.jsx';
import { BottomNavigation } from './components/ui/BottomNavigation';
import ProductTour from './components/ui/ProductTour';
import { markTourSeen, tourSeen } from './components/ui/tourState';
import { hasPageTour } from './components/ui/tourPages';
import { SetupPasswordStep } from './features/staff/StaffFirstSetup';

import { BottomSheet } from './components/ui/BottomSheet';
import { ResponsiveCard } from './components/ui/ResponsiveCard';
import { ProgressiveAccordion } from './components/ui/ProgressiveAccordion';
import GarmentPairingModal from './components/ui/GarmentPairingModal';
import Loader from './components/ui/Loader';
import { setTierNames } from './services/tierNames';
import { portalSlugFromPath } from './navigation/portalSlug';
import { visibleNav, canSeeTab, hasModule } from './navigation/nav';
import { UserAvatar } from './components/ui/UserAvatar';
import { DEFAULT_CUSTOMER_DATA, SELF_DESIGNER, EMPTY_ALTERATION, WIZARD_DRAFT_KEY, WIZARD_STEPS, EMPTY_OUTSIDE } from './features/orders/wizard';
import { plusDaysIso } from './services/dates';
import { NO_TIERS } from './features/customers/customerBook';
import { isProductionStaff, SUPERVISOR_ROLES } from './constants/roles';
import { PortalMenu } from './navigation/PortalMenu';
import { ScreenLoading } from './components/ui/ScreenLoading';
import { StyleProfileCard } from './features/customers/StyleProfileCard';
import { NetworkActivityBar } from './components/ui/NetworkActivityBar';

// What each page reads from the workspace's data (App's datasetLoaders).
// Settings, notifications and the customer counts are loaded for every page.
// (Assigning a stage needs the team too; App adds it while a stage is open.)
const ORDER_BOOK_DATA = ['orders', 'queuedMessages'];
const MY_WORK_DATA = ['orders', 'tailors', 'queuedMessages'];
const DATA_FOR_TAB = {
  overview: ['dashboard', 'orders', 'appointments'],
  orders: ORDER_BOOK_DATA,
  workshop: ORDER_BOOK_DATA,
  work: MY_WORK_DATA,
  check: MY_WORK_DATA,
  done: MY_WORK_DATA,
  invoices: ['orders'],
  analytics: ['orders', 'tailors'],
};
// The order screens: the fabric picker, and our delivered orders for an alteration.
const DATA_FOR_VIEW = {
  'order-selector': ['orders', 'fabrics'],
  wizard: ['orders', 'fabrics'],
};

function App() {
  
  const [view, setView] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('reset')) return 'reset';
    return !portalSlugFromPath() && params.has('register') ? 'signup' : 'login';
  });
  const [requestedTab, setDashboardTab] = useState('overview'); 
  const lastTabRef = useRef('overview');
  const [navCollapsed, setNavCollapsed] = useState(() => {
    try { return localStorage.getItem('nav_collapsed') === '1'; } catch { return false; }
  });
  const toggleNav = () => setNavCollapsed((c) => {
    try { localStorage.setItem('nav_collapsed', c ? '0' : '1'); } catch { /* per-device convenience only */ }
    return !c;
  });
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => { applyTenantTheme(currentUser); }, [currentUser]);

  const [portalSlug, setPortalSlug] = useState(portalSlugFromPath);
  const [portalBoutique, setPortalBoutique] = useState(null);
  const [portalLookupDone, setPortalLookupDone] = useState(() => !portalSlugFromPath());

  // Signing in moves the address bar to the boutique's own path (below). The
  // sign-in screen follows it, so signing out names this boutique -- not the
  // one the page was first opened on -- and signs in against it.
  const signedInSlug = currentUser?.shop_slug;
  if (signedInSlug && signedInSlug !== portalSlug) {
    setPortalSlug(signedInSlug);
    setPortalBoutique(null);
    setPortalLookupDone(false);
  }

  useEffect(() => {
    if (!portalSlug) return;
    let live = true;
    api.getBoutiqueBySlug(portalSlug).then((found) => {
      if (!live) return;
      setPortalBoutique(found);
      setPortalLookupDone(true);
    });
    return () => { live = false; };
  }, [portalSlug]);

  const boutiqueNotFound = !!portalSlug && portalLookupDone
                           && !portalBoutique && !currentUser;

  useEffect(() => {
    const slug = currentUser?.shop_slug;
    if (!slug || portalSlugFromPath() === slug) return;
    // ?register only chose the signup screen; a signed-in URL should not keep it.
    const params = new URLSearchParams(window.location.search);
    params.delete('register');
    const search = params.toString();
    window.history.replaceState(window.history.state, '',
                                `/${slug}${search ? `?${search}` : ''}`);
  }, [currentUser]);
  const { t, language } = useLanguage();
  const currentUserName = currentUser?.first_name || currentUser?.name || currentUser?.email?.split('@')[0] || 'User';

  
  const navSections = visibleNav(currentUser, t);

  const navTabs = navSections.flatMap((s) => s.items.map((i) => i.tab));
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
  if (canSeeTab(currentUser, 'alterations')) navTabs.push('alterations');
  const dashboardTab = (!navTabs.length || navTabs.includes(requestedTab)) ? requestedTab : navTabs[0];
  // The bell (inbox alerts) shows on the owner's Dashboard page only -- not
  // on any other page, and not for any other role. Read by the top bar, the
  // phone header and the tablet header alike.
  const showBell = (!currentUser?.role || currentUser.role === 'Owner') && view === 'dashboard' && dashboardTab === 'overview';

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

  // The sign-in screens' form state (features/auth/useAuthForms.js).
  const auth = useAuthForms();
  const { loginEmail, setLoginEmail, loginPassword, setLoginPassword, setLoginUnlocked, resetToken, setAuthError, authBusy, setAuthBusy, signupStep, changeCurrent, setChangeCurrent, changeNew, setChangeNew, changeConfirm, setChangeConfirm } = auth;

  const [onboardingDismissed, setOnboardingDismissed] = useState(() => {
    try {
      return localStorage.getItem(`onboarding_dismissed_${localStorage.getItem('tenant_id') || ''}`) === '1';
    } catch { return false; }
  });
  const [logoutBusy, setLogoutBusy] = useState(false);

  const [justRegistered, setJustRegistered] = useState(false);
  

  const [currentStep, setCurrentStep] = useState(1);
  
  const [maxStepReached, setMaxStepReached] = useState(1);
  const reachStep = useCallback((n) => {
    setCurrentStep(n);
    setMaxStepReached((m) => Math.max(m, n));
  }, []);
  
  const [activeGarmentKey, setActiveGarmentKey] = useState(null);
  const [garmentsDone, setGarmentsDone] = useState([]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [view, currentStep, signupStep]);

  const [customerId, setCustomerId] = useState(null);
  const [customerForm, setCustomerForm] = useState(DEFAULT_CUSTOMER_DATA);
  const [serviceType, setServiceType] = useState('stitch');
  const [customerName, setCustomerName] = useState('');
  const [readyBy, setReadyBy] = useState(() => plusDaysIso(15));
  const [designRequest, setDesignRequest] = useState({ designer: '', brief: '' });
  const [designers, setDesigners] = useState([]);
  // The designer list has answered at least once (it may be empty, or refused).
  const [designersLoaded, setDesignersLoaded] = useState(false);
  // Who will design it, as the order reads it: the pick, or -- with no
  // designer to pick (none on the team, or the module off) -- "Me", the
  // dropdown's only option, whether or not it was ever "chosen".
  const designerChoice = designRequest.designer
    || (designersLoaded && designers.length === 0 ? SELF_DESIGNER : '');
  const [alterationForm, setAlterationForm] = useState(EMPTY_ALTERATION);
  
  const [garmentTemplates, setGarmentTemplates] = useState([]);
  const [garmentJobs, setGarmentJobsState] = useState([]);

  const setGarmentJobs = useCallback((update) => setGarmentJobsState((prev) => {
    const next = typeof update === 'function' ? update(prev) : update;
    return syncFollowers(next) || next;
  }), []);
  const [draftId, setDraftId] = useState(null);
  const [draftVersion, setDraftVersion] = useState(null);
  // The order this tab had open before a reload (read once, at load).
  const [draftAfterReload] = useState(() => {
    try { return sessionStorage.getItem(WIZARD_DRAFT_KEY); } catch { return null; }
  });
  const [draftSaveState, setDraftSaveState] = useState('idle');
  const [resumableDrafts, setResumableDrafts] = useState([]);
  const [garmentErrors, setGarmentErrors] = useState({});
  const [garmentTemplatesError, setGarmentTemplatesError] = useState(null);
  const [designsView, setDesignsView] = useState('dashboard');
  // The Design library's Designers card opens Staff showing designers only.
  // Held as the section visit it was opened on: any other move through the
  // sidebar starts a new visit, and the team shows in full again.
  const [staffDesignersVisit, setStaffDesignersVisit] = useState(null);
  const openDesignRequests = () => { setDesignsView('requests'); setDashboardTab('designs'); };
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sectionVisit, setSectionVisit] = useState(0);

  // Wizard Details State
  const [designNotes, setDesignNotes] = useState('');
  const [designFiles, setDesignFiles] = useState([]);
  const [designBoard, setDesignBoard] = useState({ boardId: null, selected: null, approved: false });
  const [selectedDesignTemplates, setSelectedDesignTemplates] = useState([]);
  const [designSource, setDesignSource] = useState('BOUTIQUE_CATALOG');
  const [designLinks, setDesignLinks] = useState('');
  const [advancePaymentAmount, setAdvancePaymentAmount] = useState(0);
  const [specialInstructions, setSpecialInstructions] = useState('');
  // The wizard's voice notes for the tailor: up to ten, [{ url, by, at }].
  const [measureVoiceNotes, setMeasureVoiceNotes] = useState([]);

  // GST: none unless the counter adds it, as a % of the subtotal or an amount.
  const [quotePrices, setQuotePrices] = useState({ packaging: 500, discount: 0, gst_mode: 'percent', gst_value: 0 });
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  // The invoice's Send on WhatsApp: { orderId, state, error, url } for the
  // order it was pressed on (state: sending | sent | retrying | failed |
  // manual | pending | error).
  const [invoiceSend, setInvoiceSend] = useState(null);
  const sendInvoiceToWhatsApp = async (order) => {
    setInvoiceSend({ orderId: order.id, state: 'sending' });
    try {
      const { outcome, message } = await api.sendInvoice(order.id);
      // 'sending' from the server: still being tried when it stopped waiting.
      setInvoiceSend({ orderId: order.id, state: outcome === 'sending' ? 'pending' : outcome, error: message?.error || '', url: message?.whatsapp_url || '' });
    } catch (err) {
      setInvoiceSend({ orderId: order.id, state: 'error', error: err?.message || 'Could not send the invoice.' });
    }
  };

  const [wizardError, setWizardError] = useState(null);
  const [savingPaymentId, setSavingPaymentId] = useState(null);
  const [paymentError, setPaymentError] = useState(null);

  const loadGarmentTemplates = useCallback(async () => {
    if (!localStorage.getItem('token')) return;
    setGarmentTemplatesError(null);
    try {
      const data = await api.getGarmentTemplates();
      setGarmentTemplates(data.results || data);
    } catch (err) {
      console.error('Could not load garment templates', err);
      setGarmentTemplates([]);
      setGarmentTemplatesError(err.message || 'Could not load the garment list.');
    }
  }, []);

  // Only the order screens use the garment list: asked for when one opens (the
  // order type selector, so it is there by the wizard), and kept.
  const onOrderScreen = view === 'order-selector' || view === 'wizard';
  useEffect(() => {
    // Not while a temporary password is being replaced: the server refuses
    // everything but the change-password screen until then.
    if (!currentUser || currentUser.must_change_password || !onOrderScreen || garmentTemplates.length) return;
    loadGarmentTemplates();
  }, [currentUser, onOrderScreen, garmentTemplates.length, loadGarmentTemplates]);

  useEffect(() => {
    const first = garmentJobs[0]?.template?.name;
    if (first) {
      setCustomerForm(prev => (prev.garment_type === first ? prev : { ...prev, garment_type: first }));
    }
  }, [garmentJobs]);

  

  

  const [selectedDashboardOrder, setSelectedDashboardOrder] = useState(null);
  const [updatingOrderStatusId, setUpdatingOrderStatusId] = useState(null);
  const [selectedDirectoryCustomer, setSelectedDirectoryCustomer] = useState(null);
  const [viewAllCustomerMeasurements, setViewAllCustomerMeasurements] = useState(false);
  
  
  
  // Alteration on a garment stitched elsewhere: the wizard's own three steps.
  const [alterOutside, setAlterOutside] = useState(false);
  const [outsideForm, setOutsideForm] = useState(EMPTY_OUTSIDE);
  const [outsidePhoto, setOutsidePhoto] = useState(null); // { file, url }
  useEffect(() => () => { if (outsidePhoto?.url) URL.revokeObjectURL(outsidePhoto.url); }, [outsidePhoto]);
  
  const openAlteration = (id) => {
    setSelectedDirectoryCustomer(null);
    setDashboardTab('orders');
    setOpenOrdersRowId(id);
    fetchDashboardAndConfig();
  };
  const rememberAlteration = () => {};
  const [directoryDetailLoading, setDirectoryDetailLoading] = useState(false);
  const [openOrdersRowId, setOpenOrdersRowId] = useState(null);
  
  const [openGarmentJob, setOpenGarmentJob] = useState(null);

  const [dashboardData, setDashboardData] = useState(null);
  const [tailors, setTailors] = useState([]);
  
  const [designerStaff, setDesignerStaff] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [showAppointmentModal, setShowAppointmentModal] = useState(false);
  const [appointmentForm, setAppointmentForm] = useState({
    customer: '', appointment_type: 'TRIAL', scheduled_time: '', assigned_staff: '', notes: '',
  });
  const [editingAppointment, setEditingAppointment] = useState(null);
  const [fabrics, setFabrics] = useState([]);
  // The whole book's size and tiers (/customers/stats/). The book itself is no
  // longer downloaded: the Customers page asks for one page at a time, and the
  // pickers search as they are typed into.
  const [customerStats, setCustomerStats] = useState(null);
  
  const [ordersList, setOrdersList] = useState([]);
  // Whether ordersList has been asked for yet: until then its length says nothing.
  const [ordersLoaded, setOrdersLoaded] = useState(false);
  const [queuedMessages, setQueuedMessages] = useState([]);
  const [confirmedOrder, setConfirmedOrder] = useState(null);
  const [sendBusy, setSendBusy] = useState(false);

  const [directoryVersion, setDirectoryVersion] = useState(0);
  const [ordersTabPick, setOrdersFilterTab] = useState(null);
  const [ordersStageFilter, setOrdersStageFilter] = useState('All');
  const openOrder = openOrdersRowId ? ordersList.find((o) => o.id === openOrdersRowId) : null;
  useEffect(() => {
    if (!openOrdersRowId) return;
    window.scrollTo({ top: 0 });
    document.querySelector('.portal-main')?.scrollTo?.(0, 0);
  }, [openOrdersRowId]);

  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [invoiceFilter, setInvoiceFilter] = useState('All');
  const [loading, setLoading] = useState(true);
  // The guided tour: open on a person's first visit to the workspace, once the
  // page has loaded; "Guide for this page" in the account menu opens it again.
  const [tourOpen, setTourOpen] = useState(false);
  // A newly added staff member's first sign-in (StaffFirstSetup.jsx):
  // 'password', then 'profile', then the workspace. Remembered per user in
  // this browser so a refresh mid-way picks it up again.
  const [staffSetup, setStaffSetup] = useState(null);
  const [setupCurrent, setSetupCurrent] = useState('');
  const setupKey = (user) => {
    let tenant = '';
    try { tenant = localStorage.getItem('tenant_id') || ''; } catch { /* private mode */ }
    return `scaleezy_staff_setup:${tenant}:${user?.id || user?.email || 'user'}`;
  };
  const storeSetup = (user, step) => {
    try { if (step) localStorage.setItem(setupKey(user), step); else localStorage.removeItem(setupKey(user)); } catch { /* private mode */ }
  };
  const storedSetup = (user) => {
    try { return localStorage.getItem(setupKey(user)); } catch { return null; }
  };
  const toProfileStep = (user) => {
    storeSetup(user, 'profile');
    setSetupCurrent('');
    setStaffSetup('profile');
    setDashboardTab('account');
  };
  // Done or skipped: the person's own first page, as a sign-in opens it.
  const finishStaffSetup = () => {
    storeSetup(currentUser, null);
    setStaffSetup(null);
    if (currentUser?.role === 'Designer') openDesignRequests();
    else if (isProductionStaff(currentUser?.role)) setDashboardTab('work');
    else setDashboardTab('overview');
  };
  const [pageTour, setPageTour] = useState(null);
  // Pages whose guide found nothing to point at this session (not retried).
  const pageTourEmpty = useRef(new Set());
  // A Getting started item's hands-on guide ({ key, label }), while it runs.
  const [taskGuide, setTaskGuide] = useState(null);
  useEffect(() => {
    // The guide opens by itself once: after the person's first sign-in, on
    // whichever page they land. It is marked seen as it opens, so leaving it
    // half way or reloading does not bring it back. Each page's own guide
    // opens only from "Guide for this page" in the account menu.
    if (view !== 'dashboard' || !currentUser || loading || tourOpen || taskGuide || staffSetup || tourSeen(currentUser)) return undefined;
    const timer = setTimeout(() => { markTourSeen(currentUser); setTourOpen(true); }, 700);
    return () => clearTimeout(timer);
    // Only these: reopening it on every render after it is closed would be wrong.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, dashboardTab, currentUser?.id, currentUser?.email, loading, staffSetup]);
  // Step 2 is the My profile page: leaving it for another page ends the setup.
  useEffect(() => {
    if (staffSetup !== 'profile' || dashboardTab === 'account') return undefined;
    const timer = setTimeout(() => { storeSetup(currentUser, null); setStaffSetup(null); }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffSetup, dashboardTab]);
  const [whatsappStatus, setWhatsappStatus] = useState({ connected: false, status: 'disconnected', qrCode: null });
  const [boutiqueSettings, setBoutiqueSettings] = useState(null);
  // The boutique's own tier names, for every screen that shows a tier.
  setTierNames(boutiqueSettings?.tier_names);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [logoFile, setLogoFile] = useState(null);
  
  const [activeReviewStage, setActiveReviewStage] = useState(null);
  const [activeReviewOrder, setActiveReviewOrder] = useState(null);
  // Fabric kinds and slots: for the order wizard, the floor's own pages and a
  // stage being reviewed -- asked for when one of those first opens.
  const fabricTaxonomy = useFabricTaxonomy(view === 'wizard' || !!activeReviewStage
    || (view === 'dashboard' && ['work', 'check', 'done'].includes(dashboardTab)));
  const [stageReviewComments, setStageReviewComments] = useState('');
  
  
  const [stageReviewImages, setStageReviewImages] = useState([]);
  
  const [stageReviewRecording, setStageReviewRecording] = useState(false);
  const [selectedStageObj, setSelectedStageObj] = useState(null);
  const [globalError, setGlobalError] = useState(null);
  const [loadErrors, setLoadErrors] = useState([]);

  useEffect(() => {
    const handleErr = (event) => {
      setGlobalError(event.error ? event.error.stack || event.error.message : event.message);
    };
    const handleRejection = (event) => {
      const reason = event.reason;
      setGlobalError(reason ? reason.stack || reason.message || String(reason) : 'Unhandled promise rejection');
    };
    window.addEventListener('error', handleErr);
    window.addEventListener('unhandledrejection', handleRejection);
    return () => {
      window.removeEventListener('error', handleErr);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, []);

  const [notifications, setNotifications] = useState([]);
  const [showNotificationsDrawer, setShowNotificationsDrawer] = useState(false);
  const [markingNotificationsRead, setMarkingNotificationsRead] = useState(false);

  const fetchNotifications = async (user = currentUser) => {
    if (!user) return;
    const data = await api.getNotifications(user.role || 'Owner', user.email);
    setNotifications(data);
  };

  useEffect(() => {
    if (resetToken) {
      window.history.replaceState({}, '', window.location.pathname);
      setLoading(false);
      return;
    }
    checkAuthSession();
  }, []);

  /** Where a signed-in user goes: the change-password screen while the
   *  account still has the temporary password the platform team emailed,
   *  otherwise their workspace. False when there is nothing to load. */
  const enterWorkspace = (user) => {
    setCurrentUser(user);
    if (user.must_change_password) {
      setChangeNew('');
      setChangeConfirm('');
      setAuthError(null);
      setView('change-password');
      return false;
    }
    setView('dashboard');
    if (user.role === 'Designer') {
      openDesignRequests();
    } else if (isProductionStaff(user.role)) {
      setDashboardTab('work');
    } else {
      setDashboardTab('overview');
    }
    return true;
  };

  const handleChangePasswordSubmit = async (e) => {
    if (e) e.preventDefault();
    if (authBusy) return;
    if (changeNew.length < 8) { setAuthError('The new password needs at least 8 characters.'); return; }
    if (changeNew !== changeConfirm) { setAuthError('Those two passwords do not match.'); return; }
    if (changeNew === changeCurrent) { setAuthError('Choose a password different from the temporary one.'); return; }
    setAuthBusy(true);
    setAuthError(null);
    try {
      const res = await api.changeMyPassword(changeCurrent, changeNew);
      setChangeCurrent('');
      setChangeNew('');
      setChangeConfirm('');
      setJustRegistered(true);
      if (res.user && enterWorkspace(res.user)) fetchDashboardAndConfig(res.user);
    } catch (err) {
      setAuthError(err.message || 'Could not change your password.');
    } finally {
      setAuthBusy(false);
    }
  };

  // Above the order draft (useOrderDraft, just below), which reads both.
  const [customerLocked, setCustomerLocked] = useState(false);
  const wizardSteps = (serviceType === 'alter' && alterOutside ? WIZARD_STEPS.alterOutside : WIZARD_STEPS[serviceType])
    || WIZARD_STEPS.stitch;

  // The order being written, as a draft (features/orderWizard/useOrderDraft.jsx).
  const orderDraft = useOrderDraft({ setView, currentStep, setMaxStepReached, reachStep, setActiveGarmentKey, activeGarmentKey, setGarmentsDone, garmentsDone, setCustomerId, customerId, setCustomerForm, customerForm, setServiceType, serviceType, setCustomerName, setReadyBy, readyBy, setDesignRequest, designRequest, designerChoice, garmentJobs, setGarmentJobs, setDraftId, draftId, setDraftVersion, draftVersion, setDraftSaveState, setGarmentErrors, setDesignNotes, designNotes, setSelectedDesignTemplates, selectedDesignTemplates, setDesignSource, designSource, setDesignLinks, designLinks, setAdvancePaymentAmount, advancePaymentAmount, setSpecialInstructions, specialInstructions, setMeasureVoiceNotes, measureVoiceNotes, setQuotePrices, quotePrices, setWizardError, setAlterOutside, fabrics, setCustomerLocked, wizardSteps });
  const { defaultMaterialSource, garmentMaterialFields, serialiseWizard, hydrateWizard, persistDraft, jobExtras, jobMaterialCharges, getSubtotal, getTaxes, getTotalPrice } = orderDraft;
  /** The page was reloaded while an order was open: open the same order again,
   *  as last saved. One already placed or discarded is simply not reopened. */
  const resumeAfterReload = async (id) => {
    try {
      const draft = await api.getOrderDraft(id);
      if (draft) await hydrateWizard(draft);
    } catch {
      try { sessionStorage.removeItem(WIZARD_DRAFT_KEY); } catch { /* ignore */ }
    }
  };

  const checkAuthSession = async () => {
    try {
      const user = await api.getMe();
      if (user && enterWorkspace(user)) {
        const step = storedSetup(user);
        if (step === 'password' || step === 'profile') {
          setStaffSetup(step);
          if (step === 'profile') setDashboardTab('account');
        }
        await fetchDashboardAndConfig(user);
        if (draftAfterReload && step !== 'password' && step !== 'profile') await resumeAfterReload(draftAfterReload);
      }
    } catch (e) {
      console.log("No saved session");
    } finally {
      // The opening page's own data may still be on its way (loadData).
      if (!pendingLoads.current) setLoading(false);
    }
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
    notifications: hasModule(user, 'notifications') && (() => fetchNotifications(user)),
    queuedMessages: (!user?.role || ['Owner', 'Master'].includes(user.role) || (user.admin_tasks || []).includes('orders.notify'))
      && (() => api.getQueuedCustomerMessages().then(setQueuedMessages)),
  });
  // Every page needs these: the boutique's settings, and the counts the
  // header's bell and the sidebar's hints show on every page.
  const ALWAYS_LOADED = ['settings', 'notifications', 'customerStats'];
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
    await loadData([...new Set([...ALWAYS_LOADED, ...loadedData.current])], user);
  };

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
  }, []);

  useEffect(() => {
    if (view === 'dashboard' && dashboardTab === 'settings' && (!currentUser?.role || currentUser.role === 'Owner')) {
      fetchWhatsAppStatus();
    }
  }, [view, dashboardTab, currentUser, fetchWhatsAppStatus]);

  useEffect(() => {
    if (view === 'dashboard' && dashboardTab === 'overview' && dashboardData) {
      api.getDashboard().then(setDashboardData).catch(() => {});
    }
    
  }, [view, dashboardTab]);

  useEffect(() => {
    if (view === 'login' || view === 'signup' || view === 'forgot'
        || view === 'reset' || view === 'find' || view === 'change-password') return;
    const here = { atelier: true, view, tab: dashboardTab };
    const current = window.history.state;
    if (current?.atelier && current.view === view && current.tab === dashboardTab) return;
    if (current?.atelier) {
      window.history.pushState(here, '');
    } else {
      window.history.replaceState(here, '');
      window.history.pushState(here, '');
    }
  }, [view, dashboardTab]);
  useEffect(() => {
    const onPop = (event) => {
      const state = event.state;
      if (state?.atelier) {
        if (state.view === view && state.tab === dashboardTab) {
          window.history.pushState(state, '');
          return;
        }
        setView(state.view);
        setDashboardTab(state.tab);
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [view, dashboardTab]);

  const handleMarkMessageSent = async (orderId, messageId) => {
    await api.markMessageSent(orderId, messageId);
    setQueuedMessages((prev) => prev.filter((m) => m.id !== messageId));
  };

  // Sent this time: off the list. Failed again: stays, with the new error.
  const handleRetryMessage = async (orderId, messageId) => {
    const message = await api.retryCustomerMessage(orderId, messageId);
    setQueuedMessages((prev) => (message.status === 'SENT'
      ? prev.filter((m) => m.id !== messageId)
      : prev.map((m) => (m.id === messageId ? message : m))));
    if (message.status !== 'SENT') throw new Error(`Still not sent: ${message.error || 'WhatsApp did not accept it.'}`);
  };

  const blankAppointmentForm = {
    customer: '', appointment_type: 'TRIAL', custom_type: '', scheduled_time: '',
    assigned_staff: '', notes: '', status: 'SCHEDULED',
    isNewCustomer: false, new_first_name: '', new_last_name: '', new_mobile: '', new_gender: '',
  };

  /** Open one to look at it. A datetime-local input wants the boutique's own
   *  wall clock with no zone on the end, so the ISO string is trimmed to the
   *  minute after being read in local time. */
  const openAppointment = (appt) => {
    const when = new Date(appt.scheduled_time);
    const local = new Date(when.getTime() - when.getTimezoneOffset() * 60000)
      .toISOString().slice(0, 16);
    setEditingAppointment(appt);
    setAppointmentForm({
      ...blankAppointmentForm,
      customer: appt.customer,
      appointment_type: appt.appointment_type,
      custom_type: appt.custom_type || '',
      scheduled_time: local,
      assigned_staff: appt.assigned_staff || '',
      notes: appt.notes || '',
      status: appt.status,
    });
    setShowAppointmentModal(true);
  };

  /** Send to workshop: straight in, one tap. Nobody is named here -- anyone
   *  already on the order stays on it, and the Workshop hands out the rest as
   *  it always has. The first step is started, as before. */
  const openSendToWorkshop = async (order) => {
    if (sendBusy) return;
    setSendBusy(true);
    try {
      const updated = await api.sendToWorkshop(order.id);
      setConfirmedOrder((prev) => (prev && prev.id === updated.id ? { ...prev, ...updated } : prev));
      fetchDashboardAndConfig();
      const row = (updated.stages || []).find((st) => st.stage_key === updated.started_stage);
      const stage = row?.stage_name || '';
      const who = row?.assigned_to_name || updated.master_name || updated.tailor_name || '';
      alert(stage && who
        ? t('ordersPage.sentToWorkshop', 'Sent to the workshop — {tailor} starts with {stage}', { tailor: who, stage })
        : stage
          ? t('ordersPage.sentToWorkshopStage', 'Sent to the workshop — it starts with {stage}', { stage })
          : t('ordersPage.sentToWorkshopPlain', 'Sent to the workshop'));
    } catch (err) {
      alert(err.message);
    } finally {
      setSendBusy(false);
    }
  };

  

  
  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    if (authBusy) return;
    if (!loginEmail || !loginPassword) {
      alert("Please fill in all credentials.");
      return;
    }
    setAuthError(null);
    setAuthBusy(true);
    try {
      const res = await api.login(loginEmail, loginPassword, portalSlug);
      // The temporary password is the "current" one the change screen asks for.
      setChangeCurrent(res.user.must_change_password ? loginPassword : '');
      // A newly added staff member's first sign-in here: the skippable setup,
      // with the password they signed in with as the one being replaced.
      setStaffSetup(null);
      if (res.first_sign_in && res.user?.role && res.user.role !== 'Owner') {
        setSetupCurrent(loginPassword);
        storeSetup(res.user, 'password');
        setStaffSetup('password');
      }
      setLoginPassword('');  // signed in: the password is not kept in the form
      setJustRegistered(false);
      if (enterWorkspace(res.user)) fetchDashboardAndConfig(res.user);
    } catch (err) {
      setAuthError(err.message || 'Invalid credentials.');
    } finally {
      setAuthBusy(false);
    }
  };

  

  const handleLogout = async () => {
    if (logoutBusy) return;
    setLogoutBusy(true);
    try {
      await api.logout();
      setCurrentUser(null);
      setJustRegistered(false);
      // The login screen opens empty, not with the last person's details.
      setLoginEmail('');
      setLoginPassword('');
      setLoginUnlocked(false);
      setView('login');
    } finally {
      setLogoutBusy(false);
    }
  };

  
  const pickCustomer = (cust) => {
    setCustomerId(cust.id);
    setCustomerForm({
      ...DEFAULT_CUSTOMER_DATA,
      ...cust,
      mobile_number: displayMobile(cust.mobile_number),
      measurements: cust.measurements || DEFAULT_CUSTOMER_DATA.measurements,
    });
    setCustomerName(`${cust.first_name || ''} ${cust.last_name || ''}`.trim());
  };
  /** Begin an order for one service, from a clean slate. `cust` is a customer
   *  the caller already picked (the customer book's "Create New Order"). */
  const startService = (kind, cust = null, { locked = false, outside = false } = {}) => {
    setServiceType(kind);
    setAlterOutside(kind === 'alter' && outside);
    setOutsideForm(EMPTY_OUTSIDE);
    setOutsidePhoto(null);
    setCustomerLocked(Boolean(cust && locked));
    setNumberMatched(null);
    setCustomerId(null);
    setCustomerForm(DEFAULT_CUSTOMER_DATA);
    setCustomerName('');
    setDesignNotes('');
    setDesignFiles([]);
    setSelectedDesignTemplates([]);
    setGarmentJobs([]);
    setGarmentErrors({});
    setActiveGarmentKey(null);
    setGarmentsDone([]);
    setQuotePrices({ packaging: 500, discount: 0, gst_mode: 'percent', gst_value: 0 });
    setAdvancePaymentAmount(0);
    setSpecialInstructions('');
    setMeasureVoiceNotes([]);
    setReadyBy(plusDaysIso(15));
    setDesignRequest({ designer: '', brief: '' });
    setAlterationForm(EMPTY_ALTERATION);
    setWizardError(null);
    setDraftId(null);
    setDraftVersion(null);
    setDraftSaveState('idle');
    if (cust) pickCustomer(cust);
    setMaxStepReached(1);
    reachStep(1);
    setView('wizard');
  };

  const [customerAddMode, setCustomerAddMode] = useState(null);
  
  const [editingCustomer, setEditingCustomer] = useState(null);

  /** Customers matching what has been typed so far -- by number once three
   *  digits are in, else by name once three letters are (the counter may know
   *  either first): the five newest, as full rows, because picking one fills
   *  the order form. */
  const matchDigits = customerId ? '' : (customerForm.mobile_number || '').replace(/\D/g, '');
  const matchName = customerId ? '' : customerName.trim();
  const matchBy = matchDigits.length >= 3 ? 'mobile' : matchName.length >= 3 ? 'name' : null;
  const { results: customerMatches, loading: customerMatchesLoading } = useCustomerLookup({
    mobile: matchBy === 'mobile' ? matchDigits : '', q: matchBy === 'name' ? matchName : '', limit: 5, full: true,
  });
  // A complete mobile number already in the book is that customer -- a number
  // belongs to one customer only -- so they are picked at once, and their
  // saved name replaces whatever name was typed. A name is never picked this
  // way: two customers can share one. `numberMatched` keeps the typed name to
  // say why it changed.
  const [numberMatched, setNumberMatched] = useState(null); // { id, typedName }
  useEffect(() => {
    if (customerId || matchBy !== 'mobile' || customerMatchesLoading) return;
    const last10 = (value) => String(value || '').replace(/\D/g, '').slice(-10);
    const typed = last10(matchDigits);
    if (typed.length < 10) return;
    const found = customerMatches.find((cust) => last10(cust.mobile_number) === typed);
    if (!found) return;
    setNumberMatched({ id: found.id, typedName: customerName.trim() });
    // Reacting to the server's answer arriving, which is what an effect is for.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    pickCustomer(found);
  // pickCustomer and customerName are read at the moment of the match only.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, matchBy, matchDigits, customerMatches, customerMatchesLoading]);

  
  useEffect(() => {
    document.querySelector('.wizard-header-container [aria-current="step"]')
      ?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [currentStep]);
  const wizardStepKey = wizardSteps[currentStep - 1]?.key;
  /** The garment being filled in on the Garments step. */
  const openGarment = garmentJobs.find(job => job.key === activeGarmentKey) || garmentJobs[0] || null;
  // An order of many garments makes their stepper wider than the card, so it
  // scrolls sideways: keep the open garment's circle in view. Sideways only --
  // the page itself is not moved.
  useEffect(() => {
    const bar = document.querySelector('.wz-type-wrap .stepper-progress-bar');
    const step = bar?.querySelector('[aria-current="step"]');
    if (!bar || !step || bar.scrollWidth <= bar.clientWidth) return;
    const b = bar.getBoundingClientRect();
    const s = step.getBoundingClientRect();
    bar.scrollTo({ left: bar.scrollLeft + (s.left + s.width / 2) - (b.left + b.width / 2), behavior: 'instant' });
  }, [openGarment?.key, garmentJobs.length, wizardStepKey]);

  const [ctaBusy, setCtaBusy] = useState(false);

  
  useEffect(() => {
    if (view !== 'order-selector') return;
    let cancelled = false;
    api.listOrderDrafts()
      .then(list => { if (!cancelled) setResumableDrafts(list || []); })
      .catch(err => {
        console.error('Could not load saved orders', err);
        if (!cancelled) setResumableDrafts([]);
      });
    return () => { cancelled = true; };
  }, [view]);

  useEffect(() => {
    if (view !== 'wizard' || serviceType !== 'design') return;
    let cancelled = false;
    api.getDesigners({ active: 'true' })
      .then(rows => {
        if (cancelled) return;
        const list = Array.isArray(rows) ? rows : (rows?.results || []);
        setDesigners(list);
        setDesignersLoaded(true);
        // One designer on the team is not a choice to make; none, and the
        // person taking the order designs it.
        if (list.length <= 1) {
          const only = list[0]?.id || SELF_DESIGNER;
          setDesignRequest(prev => (prev.designer ? prev : { ...prev, designer: only }));
        }
      })
      // No designer list at all (the Designers module switched off for this
      // boutique): the person taking the order designs it.
      .catch(() => {
        if (cancelled) return;
        setDesigners([]);
        setDesignersLoaded(true);
        setDesignRequest(prev => (prev.designer ? prev : { ...prev, designer: SELF_DESIGNER }));
      });
    return () => { cancelled = true; };
  }, [view, serviceType]);

  // The order page's Designer in charge picker. Only the Owner may hand design
  // work to a Designer (core.roles), so nobody else needs the list.
  const openOrderId = openOrder?.id;
  useEffect(() => {
    const mayAssignDesign = currentUser?.role === 'Owner'
      || (currentUser?.admin_tasks || []).includes('design.assign');
    if (!openOrderId || !mayAssignDesign || designersLoaded) return;
    let cancelled = false;
    api.getDesigners({ active: 'true' })
      .then(rows => {
        if (cancelled) return;
        setDesigners(Array.isArray(rows) ? rows : (rows?.results || []));
        setDesignersLoaded(true);
      })
      .catch(() => { if (!cancelled) { setDesigners([]); setDesignersLoaded(true); } });
    return () => { cancelled = true; };
  }, [openOrderId, currentUser?.role, currentUser?.admin_tasks, designersLoaded]);

  // Saved within seconds, not once a minute: on a phone a pull-to-refresh comes
  // easily, and whatever was typed since the last save is lost with it.
  useAutosave({
    getSnapshot: () => JSON.stringify(serialiseWizard()),
    save: () => persistDraft(),
    enabled: view === 'wizard' && serviceType !== 'alter' && draftSaveState !== 'conflict',
    paused: ctaBusy,
    interval: 5000,
  });

  // While an order is open in the form, this tab remembers which one, so a
  // reload reopens it (resumeAfterReload). Leaving the form forgets it: that
  // order is then offered under "orders in progress", never opened by itself.
  useEffect(() => {
    try {
      if (view === 'wizard' && draftId && serviceType !== 'alter') sessionStorage.setItem(WIZARD_DRAFT_KEY, String(draftId));
      else if (currentUser && view !== 'wizard') sessionStorage.removeItem(WIZARD_DRAFT_KEY);
    } catch { /* private mode: a reload simply starts on the dashboard */ }
  }, [view, draftId, serviceType, currentUser]);

  const boutiqueFormRef = useRef(null);
  const boutiqueFormError = (form) =>
    phoneError(form.boutiquePhone.value) || emailError(form.boutiqueEmail.value, { required: true });
  const pickLogo = (file) => {
    const bad = file ? imageFilesError([file]) : '';
    if (bad) { alert(bad); return; }
    setLogoFile(file);
  };
  const saveBoutiqueForm = async (form) => {
    const formData = new FormData();
    formData.append('name', form.boutiqueName.value);
    formData.append('address', form.boutiqueAddress.value);
    formData.append('phone', form.boutiquePhone.value.trim());
    formData.append('email', cleanEmail(form.boutiqueEmail.value));
    if (logoFile) formData.append('logo', logoFile);
    formData.append('design_approval_required', form.designApprovalRequired.checked);
    formData.append('shop_radius_m', form.shopRadius.value);
    const updated = await api.updateBoutiqueSettings(formData);
    setBoutiqueSettings(updated);
    setLogoFile(null);
  };
  const boutiqueAutosave = useAutosave({
    getSnapshot: () => {
      const form = boutiqueFormRef.current;
      if (!form || !form.checkValidity() || boutiqueFormError(form)) return null;
      return JSON.stringify([[...new FormData(form).entries()].filter(([, v]) => typeof v === 'string'), logoFile?.name || null]);
    },
    save: () => saveBoutiqueForm(boutiqueFormRef.current),
    enabled: view === 'dashboard' && dashboardTab === 'account',
    paused: settingsSaving,
  });

  
  

  

      
  const [reviewView, setReviewView] = useState(null);       

  

  // Opens the stage review panel for a given order and stage.
  const openStageReview = (order, stage) => {
    setActiveReviewStage(stage.stage_name);
    setActiveReviewOrder(order);
    setSelectedStageObj(stage);
    setStageReviewComments('');  
    setStageReviewRecording(false);
    setStageReviewImages([]);
    // Only someone who may sign this submission off ticks it as seen: a
    // Master opening another Master's submission is not its verifier.
    const canVerify = maySignOff(currentUser?.role, stage);
    if (stage.status === 'PENDING_VERIFICATION' && !stage.verification_seen_at && canVerify) {
      api.markStageSeen(order.id, stage.stage_key, stage.garment_job || null)
        .then((seen) => setSelectedStageObj((prev) => (prev && prev.id === seen.id ? { ...prev, ...seen } : prev)))
        .catch(() => {});
    }
  };

  

  const openDirectoryCustomer = async (summaryRow) => {
    setViewAllCustomerMeasurements(false);
    setSelectedDirectoryCustomer(summaryRow);
    setDirectoryDetailLoading(true);
    try {
      const full = await api.getCustomer(summaryRow.id);
      setSelectedDirectoryCustomer((current) =>
        current && current.id === full.id ? full : current
      );
    } catch (err) {
      console.error('Failed to load customer detail', err);
    } finally {
      setDirectoryDetailLoading(false);
    }
  };

  
  /** After a customer is added elsewhere: the totals and the open page again. */
  const refreshCustomerBook = () => {
    api.getCustomerStats().then(setCustomerStats).catch(() => {});
    setDirectoryVersion((v) => v + 1);
  };
  const bookTotal = customerStats?.total ?? 0;
  const bookTiers = customerStats?.tiers || NO_TIERS;

  /** Whether the owner handed this user `task` as Admin (core/admin_access.py).
   *  Declared before the area hooks below: they are handed both. */
  const adminCan = (task) => (currentUser?.admin_tasks || []).includes(task);
  const isOwnerUser = !currentUser?.role || currentUser.role === 'Owner';

  // The order wizard's own state and logic (features/orderWizard/useOrderWizard.jsx).
  const wizard = useOrderWizard({ setView, currentUser, t, currentStep, maxStepReached, reachStep, setActiveGarmentKey, garmentsDone, setGarmentsDone, customerId, setCustomerId, customerForm, setCustomerForm, serviceType, setCustomerName, readyBy, designerChoice, alterationForm, garmentTemplates, garmentJobs, setGarmentJobs, draftId, setDraftId, setDraftVersion, setDraftSaveState, setGarmentErrors, advancePaymentAmount, setAdvancePaymentAmount, quotePrices, setQuotePrices, setWizardError, defaultMaterialSource, garmentMaterialFields, persistDraft, alterOutside, outsideForm, outsidePhoto, openAlteration, rememberAlteration, fabrics, ordersList, setConfirmedOrder, fetchDashboardAndConfig, pickCustomer, customerLocked, matchDigits, matchName, matchBy, customerMatches, setNumberMatched, wizardSteps, wizardStepKey, openGarment, setCtaBusy, getSubtotal, getTotalPrice, refreshCustomerBook });
  const { activePairingGarment, setActivePairingGarment, pairingQueue, setPairingQueue, handleAddPairedGarments, leaveWizard, canJumpAhead, jumpToStep, needsMeasurements, customerBlank } = wizard;
  // The Designs page's own state (features/designStudio/useDesignManager.jsx).
  const designManager = useDesignManager({ fetchDashboardAndConfig });
  const { designLibraryToken, setDesignLibraryToken, showDesignModal, setShowDesignModal, editingDesign, setEditingDesign, designSaving, designImageFile, setDesignImageFile, showDesignUpload, setShowDesignUpload, designForm, setDesignForm, handleSaveDesign, handleDeleteDesign } = designManager;
  // The appointment form's own state and actions (features/appointments/useAppointments.jsx).
  const appointmentBook = useAppointments({ setAppointments, setShowAppointmentModal, setAppointmentForm, appointmentForm, setEditingAppointment, editingAppointment, fetchDashboardAndConfig, blankAppointmentForm });
  const { savingAppointment, closeAppointmentModal, handleSaveAppointment, handleCancelAppointment, appointmentDateRef } = appointmentBook;
  // Assigning a stage and taking one back (features/orders/useStageReview.jsx).
  const stageReview = useStageReview({ tailors, designerStaff, boutiqueSettings, setSelectedStageObj, fetchDashboardAndConfig });
  const { assigningStageKey, stageTransitionBusy, setStageTransitionBusy, reversalPrompt, setReversalPrompt, reversalReason, setReversalReason, reversalBusy, setReversalBusy, eligibleStaffForStage, handleAssignStage } = stageReview;
  // The Orders and Workshop pages' own state (features/orders/useOrdersPage.jsx).
  const ordersPage = useOrdersPage({ setDashboardTab, lastTabRef, t, navSections, dashboardTab, ordersTabPick, setOrdersStageFilter, ordersStageFilter, fetchDashboardAndConfig });
  const { previousDashboardTab, getTabLabel, handleBackFromWorkshop, ordersAlterationOrder, setOrdersAlterationOrder, sendErrorsOrderId, setSendErrorsOrderId, completingAllOrderId, setCompletingAllOrderId, ordersSearch, setOrdersSearch, ordersFilterTab, ordersTierFilter, setOrdersTierFilter, ordersTypeFilter, setOrdersTypeFilter, ordersGarmentFilter, setOrdersGarmentFilter, ordersView, setOrdersView, orderMatchesFilters, savingVerificationOrderId, setSavingVerificationOrderId, assigningWorkflowOrderId, designerInCharge, assignOrderDesigner } = ordersPage;
  // The Customers and Leads pages' own state (features/customers/useCustomerBook.jsx).
  const customerBook = useCustomerBook({ currentUser, dashboardTab, setSelectedDirectoryCustomer, selectedDirectoryCustomer, directoryVersion, fetchDashboardAndConfig, startService, setCustomerAddMode, setEditingCustomer, adminCan, isOwnerUser });
  const { styleNotesFor, setStyleNotesFor, alterationOrder, setAlterationOrder, expandedCustomerOrderId, setExpandedCustomerOrderId, approvingDesignId, searchQuery, setSearchQuery, customerView, customerPageSize, setCustomerPageSize, customerFilters, setCustomerFilters, customerDirectory, handleStartNewCustomer, deletingAllCustomers, setDeletingAllCustomers, customerActionId, startEditCustomer, handleDeleteCustomer, handleMarkLeadContacted, orderTypeFor, setOrderTypeFor, handleSelectExistingCustomer, beginOrderForCustomer, customerPhotoBusy, uploadDirectoryCustomerPhoto, handleApproveDesign, isLead, directoryLoading, directoryData, bookSummary, directoryCount, pagedCustomers, customerPageNow, customerPageCount, customerPageFrom, goToCustomerPage, canEditCustomer, canDeleteCustomer, canImportCustomers } = customerBook;
  if (globalError) {
    return (
      <div style={{ padding: '24px', background: '#7f1d1d', color: '#fef2f2', height: '100vh', fontFamily: 'monospace', overflowY: 'auto' }}>
        <h2 style={{ margin: '0 0 16px 0', fontSize: '20px' }}>Atelier CRM Runtime Error</h2>
        <pre style={{ whiteSpace: 'pre-wrap', fontSize: '14px', background: 'rgba(0,0,0,0.2)', padding: '16px', borderRadius: '8px' }}>
          {globalError}
        </pre>
        <button onClick={() => { localStorage.clear(); window.location.reload(); }} className="btn-secondary" style={{ marginTop: '16px', background: 'var(--surface-color)', color: '#7f1d1d', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}>
          Clear Session & Reload
        </button>
      </div>
    );
  }

  
  if (((loading && !dashboardData) || (portalSlug && !portalLookupDone && !currentUser))
      && (view === 'login' || view === 'signup')) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: 'var(--selected-bg)', color: 'var(--selected-fg)', fontSize: '18px', fontFamily: 'var(--font-sans, sans-serif)' }}>
        <div style={{ width: 'min(480px, 100% - 32px)' }}>
          <Loader page label="Loading Atelier CRM…" />
        </div>
      </div>
    );
  }

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
  // What every page reads with useApp() (context/AppContext.js).
  const appContext = {
    currentUser, boutiqueSettings, dashboardTab, setDashboardTab,
    refresh: fetchDashboardAndConfig, adminCan, isOwner: isOwnerUser,
  };
  return (
    <AppContext.Provider value={appContext}>
    <div className="app-container">
      {view === 'dashboard' && currentUser && staffSetup === 'password' && (
        <SetupPasswordStep user={currentUser} knownCurrent={setupCurrent}
                           onDone={(user) => { if (user) setCurrentUser(user); toProfileStep(user || currentUser); }}
                           onSkip={() => toProfileStep(currentUser)} />
      )}
      {taskGuide && currentUser && (
        <ProductTour key={taskGuide.key} open task={taskGuide.key} taskLabel={taskGuide.label}
                     user={currentUser} menu={tourMenu} onMenu={setMobileNavOpen} onClose={() => setTaskGuide(null)} />
      )}
      {/* 2. SIGN IN SCREEN (Image 2) */}

      {view === 'find' && <FindBoutiqueScreen auth={auth} setView={setView} />}

      {boutiqueNotFound && view !== 'find' && <BoutiqueNotFound auth={auth} portalSlug={portalSlug} setView={setView} />}

      {view === 'login' && !boutiqueNotFound && <LoginScreen auth={auth} handleLoginSubmit={handleLoginSubmit} justRegistered={justRegistered} setView={setView} />}

      {/* 3. SIGN UP SCREEN (Image 3) */}
      {/* Ask for a reset link. Reached from the login screen; leaves back to
          it. Nothing here reveals whether the address is one we know. */}
      {view === 'forgot' && <ForgotPasswordScreen auth={auth} setView={setView} />}

      {/* Choose the new password. Only reachable by following the emailed
          link, which is what put resetToken in state. */}
      {view === 'reset' && <ResetPasswordScreen auth={auth} setView={setView} />}

      {/* First sign-in on a boutique the platform team created: the owner
          replaces the temporary password before anything else. The server
          refuses every other request from this account until they do. */}
      {view === 'change-password' && currentUser && <ChangePasswordScreen auth={auth} handleChangePasswordSubmit={handleChangePasswordSubmit} handleLogout={handleLogout} logoutBusy={logoutBusy} />}

      {view === 'signup' && <SignupScreen auth={auth} setView={setView} />}

      {/* 4. BOUTIQUE PORTAL MAIN WORKSPACE (Image 4) */}
      {view === 'dashboard' && currentUser && (
        <div className={`portal-layout${navCollapsed ? ' nav-collapsed' : ''}`}>
          <MobileHeader
            showBell={showBell}
            // The sidebar's own label first, so the two never disagree
            // ("To-do" in the menu, "Todo" in the header); the key lookup
            // covers tabs the sidebar does not list.
            title={navSections.flatMap((s) => s.items).find((i) => i.tab === dashboardTab)?.label || t(
              dashboardTab === 'overview' ? 'nav.dashboard' :
              dashboardTab === 'orders' ? 'nav.manageOrders' :
              dashboardTab === 'workshop' ? 'nav.workshop' :
              dashboardTab === 'tailors' ? 'nav.manageTailors' :
              dashboardTab === 'designs' ? 'nav.manageDesigns' :
              dashboardTab === 'staff' ? 'nav.staffManagement' :
              dashboardTab === 'work' ? 'nav.myWork' :
              dashboardTab === 'check' ? 'nav.toCheck' :
              dashboardTab === 'done' ? 'nav.doneWork' :
              `nav.${dashboardTab}`,
              dashboardTab === 'work' ? 'My work' : dashboardTab === 'check' ? 'To check' : dashboardTab === 'done' ? 'Done' :
              dashboardTab.charAt(0).toUpperCase() + dashboardTab.slice(1)
            )}
            currentUser={currentUser}
            notificationsCount={notifications.filter(n => !n.is_read).length}
            onOpenMenu={() => setMobileNavOpen(!mobileNavOpen)}
            accountItems={headerAccountItems((tab) => { setDashboardTab(tab); setSelectedDirectoryCustomer(null); setEditingCustomer(null); setOpenOrdersRowId(null); setSelectedDashboardOrder(null); setSectionVisit(n => n + 1); setMobileNavOpen(false); })}
            onOpenNotifications={() => {
              setShowNotificationsDrawer(true);
              if (markingNotificationsRead) return;
              setMarkingNotificationsRead(true);
              api.markNotificationsAsRead(currentUser.role || 'Owner', currentUser.email)
                .then(() => fetchNotifications())
                    
                    .catch(() => {})
                    .finally(() => setMarkingNotificationsRead(false));
            }}
          />

          {/* Mobile Top Header with Hamburger Toggle */}
          <div className="mobile-portal-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <button 
                type="button" 
                className="mobile-hamburger-btn"
                onClick={() => setMobileNavOpen(!mobileNavOpen)}
                aria-label="Toggle navigation menu"
              >
                {mobileNavOpen ? <X size={22} /> : <Menu size={22} />}
              </button>
              <img className="portal-wordmark portal-wordmark--sm" src="/scaleezy-wordmark.webp" alt="Scaleezy" />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {showBell && (
              <button
                disabled={markingNotificationsRead}
                onClick={() => {
                  setShowNotificationsDrawer(true);
                  if (markingNotificationsRead) return;
                  setMarkingNotificationsRead(true);
                  api.markNotificationsAsRead(currentUser.role || 'Owner', currentUser.email)
                    .then(() => fetchNotifications())
                    
                    .catch(() => {})
                    .finally(() => setMarkingNotificationsRead(false));
                }}
                className="btn-secondary"
                style={{ padding: '6px 10px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Bell size={14} />
                {notifications.filter(n => !n.is_read).length > 0 && (
                  <span style={{ backgroundColor: '#ff4d4d', color: '#fff', borderRadius: '10px', padding: '1px 6px', fontSize: '10px', fontWeight: 700 }}>
                    {notifications.filter(n => !n.is_read).length}
                  </span>
                )}
              </button>
              )}
            </div>
          </div>

          {/* Backdrop overlay when mobile nav is open */}
          {mobileNavOpen && (
            <div className="mobile-portal-overlay" onClick={() => setMobileNavOpen(false)} />
          )}

          {/* Sidebar */}
          <aside className={`portal-sidebar ${mobileNavOpen ? 'mobile-open' : ''}`}>
            <div className="portal-sidebar-header-desktop">
              <div className="portal-sidebar-brand">
                <img className="portal-wordmark" src="/scaleezy-wordmark.webp" alt="Scaleezy" />
                <div className="portal-sidebar-mark" aria-hidden="true">S</div>
                <button type="button" className="portal-nav-toggle" onClick={toggleNav}
                        aria-label={navCollapsed ? 'Expand navigation' : 'Collapse navigation'}
                        aria-expanded={!navCollapsed}
                        title={navCollapsed ? 'Expand navigation' : 'Collapse navigation'}>
                  {navCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
                </button>
              </div>
            </div>

            <nav className="portal-menu">
              <PortalMenu
                sections={sidebarSections}
                activeTab={dashboardTab}
                collapsed={navCollapsed && !mobileNavOpen}
                hints={sidebarHint}
                onPick={(tab) => {
                  setDashboardTab(tab);
                  setSelectedDirectoryCustomer(null);
                  setEditingCustomer(null);
                  setOpenOrdersRowId(null);
                  setSelectedDashboardOrder(null);
                  setSectionVisit(n => n + 1);
                  setMobileNavOpen(false);
                }}
              />
            </nav>

          </aside>

          {/* Main Content Area */}
          {/* Every role but the owner gets a tighter top (portal-main--staff). */}
          <main className={`portal-main${!currentUser?.role || currentUser.role === 'Owner' ? '' : ' portal-main--staff'}`}
                key={`${dashboardTab}:${sectionVisit}`}>
            {accountBar((tab) => { setDashboardTab(tab); setSelectedDirectoryCustomer(null); setEditingCustomer(null); setOpenOrdersRowId(null); setSelectedDashboardOrder(null); setSectionVisit(n => n + 1); setMobileNavOpen(false); })}
            {(dashboardTab === 'work' || dashboardTab === 'done' || dashboardTab === 'check') && (
              <>
                <PageHeader
                  title={dashboardTab === 'work' ? t('nav.myWork', 'My work') : dashboardTab === 'check' ? t('nav.toCheck', 'To check') : t('nav.doneWork', 'Done')}
                  subtitle={t('dashboard.hiUser', `Hi, ${currentUserName}`, { name: currentUserName })}
                />
                <Suspense fallback={<ScreenLoading />}>
                  <WorkPanel view={dashboardTab === 'work' ? 'open' : dashboardTab} orders={ordersList} currentUser={currentUser} workflowConfig={boutiqueSettings?.workflow_config || []} tailors={tailors} fabricTaxonomy={fabricTaxonomy} onChanged={fetchDashboardAndConfig}
                              customerMessages={queuedMessages} onMarkMessageSent={handleMarkMessageSent} onRetryMessage={handleRetryMessage} />
                </Suspense>
              </>
            )}

            {dashboardTab === 'todo' && (
              <>
                <PageHeader
                  title={t('nav.todo', 'To-do')}
                  subtitle={!currentUser?.role || currentUser.role === 'Owner' || SUPERVISOR_ROLES.includes(currentUser.role)
                    ? 'Daily updates from your team'
                    : 'Your daily updates for the month'}
                />
                <Suspense fallback={<ScreenLoading />}>
                  <DailyUpdates />
                </Suspense>
              </>
            )}

            {dashboardTab === 'overview' && <OverviewPanel appointments={appointments} blankAppointmentForm={blankAppointmentForm} bookTiers={bookTiers} currentUserName={currentUserName} dashboardData={dashboardData} guideOrders={guideOrders} justRegistered={justRegistered} loading={loading} onboardingSteps={onboardingSteps} openAppointment={openAppointment} ordersList={ordersList} setAppointmentForm={setAppointmentForm} setEditingAppointment={setEditingAppointment} setInvoiceFilter={setInvoiceFilter} setOnboardingDismissed={setOnboardingDismissed} setOrdersFilterTab={setOrdersFilterTab} setOrdersStageFilter={setOrdersStageFilter} setShowAppointmentModal={setShowAppointmentModal} setTaskGuide={setTaskGuide} setView={setView} showOnboarding={showOnboarding} />}

            {/* INVENTORY TAB */}
            {dashboardTab === 'inventory' && (
              <Suspense fallback={<ScreenLoading />}>
                <InventoryPanel currentUser={currentUser} />
              </Suspense>
            )}

            {dashboardTab === 'staff' && (
              <Suspense fallback={<ScreenLoading />}>
                <StaffPanel currentUser={currentUser}
                            onlyDesigners={staffDesignersVisit !== null && staffDesignersVisit === sectionVisit}
                            onShowAllStaff={() => setStaffDesignersVisit(null)} />
              </Suspense>
            )}

            {dashboardTab === 'finance' && (
              <>
                {reportsSwitch}
                <Suspense fallback={<ScreenLoading />}>
                  <FinancePanel />
                </Suspense>
              </>
            )}

            {/* 3. MANAGE TAILORS TAB */}

            {/* 4b. DESIGN WORK TAB -- assign, submit, review. One component for
                 both ends of the loop; see features/designStudio/DesignWork. */}
            {/* 4. MANAGE DESIGNS TAB */}
            {dashboardTab === 'designs' && <DesignsPanel designLibraryToken={designLibraryToken} designsView={designsView} handleDeleteDesign={handleDeleteDesign} navTabs={navTabs} sectionVisit={sectionVisit} setDesignForm={setDesignForm} setDesignImageFile={setDesignImageFile} setDesignLibraryToken={setDesignLibraryToken} setDesignsView={setDesignsView} setEditingDesign={setEditingDesign} setSectionVisit={setSectionVisit} setShowDesignModal={setShowDesignModal} setShowDesignUpload={setShowDesignUpload} setStaffDesignersVisit={setStaffDesignersVisit} showDesignUpload={showDesignUpload} />}

            {/* Manage Orders Tab */}
            {/* One order on its own page. Everything the row used to unfold
                inline, laid out so the eye lands on the order, then who is on
                it and when it is due, then where it stands, then the work. */}
            {['orders', 'workshop'].includes(dashboardTab) && openOrder && (
              <Suspense fallback={<ScreenLoading />}>
                <OrderDetailPanel assignOrderDesigner={assignOrderDesigner} assigningWorkflowOrderId={assigningWorkflowOrderId} completingAllOrderId={completingAllOrderId} designerInCharge={designerInCharge} designers={designers} handleMarkMessageSent={handleMarkMessageSent} handleRetryMessage={handleRetryMessage} openAlteration={openAlteration} openDirectoryCustomer={openDirectoryCustomer} openGarmentJob={openGarmentJob} openOrder={openOrder} openSendToWorkshop={openSendToWorkshop} openStageReview={openStageReview} queuedMessages={queuedMessages} savingVerificationOrderId={savingVerificationOrderId} sendBusy={sendBusy} sendErrorsOrderId={sendErrorsOrderId} setCompletingAllOrderId={setCompletingAllOrderId} setOpenGarmentJob={setOpenGarmentJob} setOpenOrdersRowId={setOpenOrdersRowId} setReviewView={setReviewView} setSavingVerificationOrderId={setSavingVerificationOrderId} setSendErrorsOrderId={setSendErrorsOrderId} />
              </Suspense>
            )}

            {['orders', 'workshop'].includes(dashboardTab) && !openOrder && (
              <Suspense fallback={<ScreenLoading />}>
                <OrdersPanel getTabLabel={getTabLabel} guideOrders={guideOrders} handleBackFromWorkshop={handleBackFromWorkshop} openAlteration={openAlteration} openSendToWorkshop={openSendToWorkshop} openStageReview={openStageReview} orderMatchesFilters={orderMatchesFilters} ordersAlterationOrder={ordersAlterationOrder} ordersFilterTab={ordersFilterTab} ordersGarmentFilter={ordersGarmentFilter} ordersList={ordersList} ordersSearch={ordersSearch} ordersStageFilter={ordersStageFilter} ordersTierFilter={ordersTierFilter} ordersTypeFilter={ordersTypeFilter} ordersView={ordersView} previousDashboardTab={previousDashboardTab} queuedMessages={queuedMessages} rememberAlteration={rememberAlteration} sendBusy={sendBusy} setOpenGarmentJob={setOpenGarmentJob} setOpenOrdersRowId={setOpenOrdersRowId} setOrdersAlterationOrder={setOrdersAlterationOrder} setOrdersFilterTab={setOrdersFilterTab} setOrdersGarmentFilter={setOrdersGarmentFilter} setOrdersSearch={setOrdersSearch} setOrdersStageFilter={setOrdersStageFilter} setOrdersTierFilter={setOrdersTierFilter} setOrdersTypeFilter={setOrdersTypeFilter} setOrdersView={setOrdersView} setView={setView} />
              </Suspense>
            )}

            {/* 5. CUSTOMERS TAB */}
            {(dashboardTab === 'customers' || dashboardTab === 'leads') && editingCustomer && (
              <CustomerForm key={editingCustomer.id} customer={editingCustomer}
                            onBack={() => setEditingCustomer(null)}
                            onSaved={async () => {
                              const id = editingCustomer.id;
                              setEditingCustomer(null);
                              await fetchDashboardAndConfig();
                              if (selectedDirectoryCustomer?.id === id) {
                                const full = await api.getCustomer(id).catch(() => null);
                                if (full) setSelectedDirectoryCustomer(full);
                              }
                            }} />
            )}
            {deletingAllCustomers && (
              <DeleteAllCustomersDialog total={bookTotal}
                                        onClose={() => setDeletingAllCustomers(false)}
                                        onDeleted={() => fetchDashboardAndConfig()} />
            )}
            {(dashboardTab === 'customers' || dashboardTab === 'leads') && !editingCustomer && !selectedDirectoryCustomer && customerAddMode === 'import' && (
              <AddCustomerChooser onBack={() => setCustomerAddMode(null)}
                                  onImported={() => fetchDashboardAndConfig()} />
            )}
            {(dashboardTab === 'customers' || dashboardTab === 'leads') && !editingCustomer && !selectedDirectoryCustomer && customerAddMode === 'manual' && (
              <CustomerForm onBack={() => setCustomerAddMode(null)}
                            onSaved={async () => { await fetchDashboardAndConfig(); setCustomerAddMode(null); }} />
            )}
            {(dashboardTab === 'customers' || dashboardTab === 'leads') && !editingCustomer && !selectedDirectoryCustomer && !customerAddMode && (
              <Suspense fallback={<ScreenLoading />}>
                <CustomersPanel bookSummary={bookSummary} bookTotal={bookTotal} canAddCustomer={canAddCustomer} canDeleteCustomer={canDeleteCustomer} canEditCustomer={canEditCustomer} canImportCustomers={canImportCustomers} customerActionId={customerActionId} customerDirectory={customerDirectory} customerFilters={customerFilters} customerPageCount={customerPageCount} customerPageFrom={customerPageFrom} customerPageNow={customerPageNow} customerPageSize={customerPageSize} customerView={customerView} directoryCount={directoryCount} directoryData={directoryData} directoryLoading={directoryLoading} goToCustomerPage={goToCustomerPage} guideCustomers={guideCustomers} handleDeleteCustomer={handleDeleteCustomer} handleMarkLeadContacted={handleMarkLeadContacted} handleStartNewCustomer={handleStartNewCustomer} openDirectoryCustomer={openDirectoryCustomer} pagedCustomers={pagedCustomers} searchQuery={searchQuery} setCustomerAddMode={setCustomerAddMode} setCustomerFilters={setCustomerFilters} setCustomerPageSize={setCustomerPageSize} setDeletingAllCustomers={setDeletingAllCustomers} setDirectoryVersion={setDirectoryVersion} setSearchQuery={setSearchQuery} startEditCustomer={startEditCustomer} />
              </Suspense>
            )}

            {styleNotesFor && (
              <FormModal icon={Sparkles} tone="amber" width="600px"
                         title={`${styleNotesFor.first_name || ''} ${styleNotesFor.last_name || ''}`.trim()}
                         subtitle={t('customersPage.bespokeProfile')}
                         onClose={() => setStyleNotesFor(null)}>
                <StyleProfileCard customer={styleNotesFor} />
              </FormModal>
            )}

            {/* 5b. CUSTOMER DETAIL VIEW (Image 5/6 extension) */}
            {(dashboardTab === 'customers' || dashboardTab === 'leads') && selectedDirectoryCustomer && (
              <Suspense fallback={<ScreenLoading />}>
                <CustomerDetailPanel alterationOrder={alterationOrder} approvingDesignId={approvingDesignId} beginOrderForCustomer={beginOrderForCustomer} customerActionId={customerActionId} customerPhotoBusy={customerPhotoBusy} directoryDetailLoading={directoryDetailLoading} expandedCustomerOrderId={expandedCustomerOrderId} handleApproveDesign={handleApproveDesign} handleDeleteCustomer={handleDeleteCustomer} handleSelectExistingCustomer={handleSelectExistingCustomer} isLead={isLead} openAlteration={openAlteration} openDirectoryCustomer={openDirectoryCustomer} openStageReview={openStageReview} orderTypeFor={orderTypeFor} refreshCustomerBook={refreshCustomerBook} rememberAlteration={rememberAlteration} selectedDirectoryCustomer={selectedDirectoryCustomer} setAlterationOrder={setAlterationOrder} setDesignNotes={setDesignNotes} setExpandedCustomerOrderId={setExpandedCustomerOrderId} setOrderTypeFor={setOrderTypeFor} setQuotePrices={setQuotePrices} setSelectedDirectoryCustomer={setSelectedDirectoryCustomer} setViewAllCustomerMeasurements={setViewAllCustomerMeasurements} startEditCustomer={startEditCustomer} uploadDirectoryCustomerPhoto={uploadDirectoryCustomerPhoto} viewAllCustomerMeasurements={viewAllCustomerMeasurements} />
              </Suspense>
            )}

            {/* 6. INVOICES TAB */}

            {dashboardTab === 'invoices' && (
              <Suspense fallback={<ScreenLoading />}>
                <InvoicesPanel invoiceFilter={invoiceFilter} invoiceSearch={invoiceSearch} ordersList={ordersList} paymentError={paymentError} savingPaymentId={savingPaymentId} setConfirmedOrder={setConfirmedOrder} setInvoiceFilter={setInvoiceFilter} setInvoiceSearch={setInvoiceSearch} setPaymentError={setPaymentError} setSavingPaymentId={setSavingPaymentId} setShowInvoiceModal={setShowInvoiceModal} />
              </Suspense>
            )}

            {/* 7. ANALYTICS TAB */}
            {dashboardTab === 'analytics' && (
              <>
                {reportsSwitch}
                <Suspense fallback={<ScreenLoading />}>
                  <InsightsPanel ordersList={ordersList} tailors={tailors} bookTotal={bookTotal}
                                 bookTiers={bookTiers} dashboardData={dashboardData} />
                </Suspense>
              </>
            )}

            {/* 8. MY ACCOUNT SETTINGS TAB */}
            {dashboardTab === 'account' && (
              <Suspense fallback={<ScreenLoading />}>
                <AccountPanel boutiqueAutosave={boutiqueAutosave} boutiqueFormError={boutiqueFormError} boutiqueFormRef={boutiqueFormRef} finishStaffSetup={finishStaffSetup} logoFile={logoFile} pickLogo={pickLogo} saveBoutiqueForm={saveBoutiqueForm} setBoutiqueSettings={setBoutiqueSettings} setCurrentUser={setCurrentUser} setLogoFile={setLogoFile} setSettingsSaving={setSettingsSaving} settingsSaving={settingsSaving} staffSetup={staffSetup} />
              </Suspense>
            )}

            {/* 9. SETTINGS TAB */}
            {dashboardTab === 'settings' && (
              <SettingsPage
                currentUser={currentUser}
                boutiqueSettings={boutiqueSettings}
                onTierNamesSaved={(names) => setBoutiqueSettings((prev) => ({ ...(prev || {}), tier_names: names }))}
                whatsappStatus={whatsappStatus}
                fetchWhatsAppStatus={fetchWhatsAppStatus}
              />
            )}
          </main>

          {/* Appointment booking. apps/scheduling has always accepted these and
              the customer's tracking page already renders a trial card from
              them; there was simply no way to create one from the product. */}
          {showAppointmentModal && <AppointmentModal appointmentDateRef={appointmentDateRef} appointmentForm={appointmentForm} closeAppointmentModal={closeAppointmentModal} editingAppointment={editingAppointment} handleCancelAppointment={handleCancelAppointment} handleSaveAppointment={handleSaveAppointment} savingAppointment={savingAppointment} setAppointmentForm={setAppointmentForm} tailors={tailors} />}

          {/* Designs CRUD Modal Overlay */}
          {showDesignModal && <DesignFormModal designForm={designForm} designImageFile={designImageFile} designSaving={designSaving} editingDesign={editingDesign} handleSaveDesign={handleSaveDesign} setDesignForm={setDesignForm} setDesignImageFile={setDesignImageFile} setShowDesignModal={setShowDesignModal} />}

          {/* Bottom navigation, phones only.
              It belongs to this view, not the order selector it was originally
              written into: its tabs drive dashboardTab, which only the dashboard
              renders, so from anywhere else every tab was inert.
              No "Menu" tab: MobileHeader's hamburger already opens the drawer. */}
          <BottomNavigation
            tabs={navSections.flatMap((s) => s.items).filter((i) => i.phone)
              .map((i) => ({ key: i.tab, label: i.phoneLabel || i.label, icon: i.icon }))}
            activeTab={dashboardTab}
            onChangeTab={(tab) => { setDashboardTab(tab); setSelectedDirectoryCustomer(null); setEditingCustomer(null); }}
          />
          {/* Mounted only while open, so it always starts at the welcome. */}
          {tourOpen && <ProductTour open user={currentUser} menu={tourMenu} onMenu={setMobileNavOpen}
                                    onClose={(how) => { if (how?.skipped) markTourSeen(currentUser, dashboardTab); setTourOpen(false); }} />}
          {pageTourOpen && <ProductTour key={pageTour} open page={pageTour} user={currentUser} menu={tourMenu}
                                        onClose={(how) => { if (how?.empty) pageTourEmpty.current.add(pageTour); setPageTour(null); }} />}
        </div>
      )}

      {/* 5. ORDER TYPE SELECTOR (Image 5) */}
      {view === 'order-selector' && <OrderTypeSelector wizard={wizard} accountBar={accountBar} fetchNotifications={fetchNotifications} headerAccountItems={headerAccountItems} hydrateWizard={hydrateWizard} markingNotificationsRead={markingNotificationsRead} mobileNavOpen={mobileNavOpen} navCollapsed={navCollapsed} notifications={notifications} resumableDrafts={resumableDrafts} setCustomerAddMode={setCustomerAddMode} setMarkingNotificationsRead={setMarkingNotificationsRead} setMobileNavOpen={setMobileNavOpen} setResumableDrafts={setResumableDrafts} setSelectedDirectoryCustomer={setSelectedDirectoryCustomer} setShowNotificationsDrawer={setShowNotificationsDrawer} setView={setView} showBell={showBell} sidebarSections={sidebarSections} startService={startService} toggleNav={toggleNav} />}

      {/* 6. THE ORDER WIZARD: who, what, (designer), measurements, money.
          Every screen is one question a counter can answer with the customer
          standing there; everything the workroom decides later stays out. */}
      {view === 'wizard' && (
        // flex, not 100vh: the Back/Next bar follows in the same column, so the
        // wizard takes what is left above it and a short step does not scroll.
        <div className="wizard-outer-wrapper" style={{ display: 'flex', flexDirection: 'column', width: '100%', flex: '1 0 auto', backgroundColor: 'var(--bg-color)' }}>
          {/* Brand header & stepper */}
          <div className="wizard-header-container" style={{ borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--surface-color)', padding: '16px 24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', maxWidth: '1280px', margin: '0 auto 16px' }}>
              <img className="portal-wordmark portal-wordmark--ink" src="/scaleezy-wordmark-dark.webp" alt="Scaleezy" style={{ height: 28 }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                {serviceType !== 'alter' && (
                  <span style={{ fontSize: '12.5px',
                                 color: draftSaveState === 'conflict' || draftSaveState === 'failed'
                                        ? 'var(--danger-color)' : 'var(--text-secondary)' }}>
                    {draftSaveState === 'idle' && t('wizard.autosaveOn', 'Autosaves every minute')}
                    {draftSaveState === 'saving' && t('wizard.saving')}
                    {draftSaveState === 'saved' && <>{t('wizard.saved')} · {t('wizard.autosaveOn', 'Autosaves every minute')}</>}
                    {draftSaveState === 'failed' && t('wizard.couldNotSave')}
                    {draftSaveState === 'conflict' && t('wizard.conflict')}
                  </span>
                )}
                <button type="button" className="btn-ghost" aria-label={t('common.close', 'Close')} onClick={leaveWizard}
                        style={{ color: 'var(--text-secondary)' }}>
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Stepper progress bar */}
            <div className="stepper-progress-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', maxWidth: '1000px', margin: '0 auto', padding: '0 20px' }}>
              {wizardSteps.map((step, index) => {
                const stepNum = index + 1;
                const skipped = step.key === 'measure' && garmentJobs.length > 0 && !needsMeasurements();
                const isCompleted = currentStep > stepNum;
                const isActive = currentStep === stepNum;
                const canJump = !skipped && stepNum !== currentStep && (stepNum <= maxStepReached || canJumpAhead);
                return (
                  <React.Fragment key={step.key}>
                    <div className={canJump ? 'stepper-step stepper-step--link' : 'stepper-step'}
                         role={canJump ? 'button' : undefined}
                         tabIndex={canJump ? 0 : undefined}
                         aria-current={isActive ? 'step' : undefined}
                         title={canJump ? `Go to ${t(`wizard.step.${step.key}`, step.label)}` : undefined}
                         onClick={canJump ? () => jumpToStep(stepNum) : undefined}
                         onKeyDown={canJump ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); jumpToStep(stepNum); } } : undefined}
                         style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', flex: 1, position: 'relative', zIndex: 2,
                                  cursor: canJump ? 'pointer' : 'default', opacity: skipped ? 0.55 : 1 }}>
                      <div style={{
                        width: '28px', height: '28px', borderRadius: '50%',
                        backgroundColor: isCompleted ? 'var(--primary-color)' : (isActive ? 'var(--selected-bg)' : 'var(--surface-inset)'),
                        color: isCompleted ? 'var(--primary-foreground)' : isActive ? 'var(--selected-fg)' : 'var(--text-secondary)',
                        border: isActive ? '2px solid var(--primary-color)' : 'none',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '12px', fontWeight: 600, marginBottom: '8px',
                      }}>
                        {isCompleted ? <Check size={14} /> : stepNum}
                      </div>
                      <span style={{ fontSize: '11px', fontWeight: isActive || isCompleted ? 600 : 500, color: isActive || isCompleted ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                        {t(`wizard.step.${step.key}`, step.label)}
                      </span>
                      <span style={{ fontSize: '9px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        {skipped ? t('wizard.notNeeded', 'Not needed')
                          : isCompleted && step.key === 'who' && serviceType !== 'alter' && customerBlank() ? t('wizard.customerLater', 'Fill before completing')
                          : isCompleted ? t('wizard.completed', 'Done') : t(`wizard.stepSub.${step.key}`, step.sub)}
                      </span>
                    </div>
                    {index < wizardSteps.length - 1 && (
                      <div style={{ height: '2px', flex: 1, backgroundColor: currentStep > stepNum ? 'var(--primary-color)' : 'var(--border-color)', margin: '0 -20px', transform: 'translateY(-20px)', zIndex: 1 }}></div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
            {/* Phones only (CSS): the strip scrolls, so say where in it we are. */}
            <div className="stepper-count">{t('entry.stepXofY', 'Step {step} of {total}', { step: currentStep, total: wizardSteps.length })}</div>
          </div>

          <div className="main-content full-width" style={{ padding: '40px 24px', maxWidth: '1280px', margin: '0 auto', width: '100%' }}>
            <div className="workspace-panel">

            {/* WHO: the mobile number finds a customer the boutique already
                knows; a new one needs a name. Everything else about them is
                optional and folded away. */}
            {wizardStepKey === 'who' && <WhoStep wizard={wizard} alterOutside={alterOutside} customerForm={customerForm} customerId={customerId} customerLocked={customerLocked} customerMatches={customerMatches} customerMatchesLoading={customerMatchesLoading} customerName={customerName} matchBy={matchBy} numberMatched={numberMatched} serviceType={serviceType} setAlterOutside={setAlterOutside} setCustomerForm={setCustomerForm} />}

            {/* TYPE: the garments, and for each one only what its cut needs. */}
            {wizardStepKey === 'type' && <GarmentsStep wizard={wizard} ctaBusy={ctaBusy} customerForm={customerForm} designRequest={designRequest} designerChoice={designerChoice} designers={designers} fabricTaxonomy={fabricTaxonomy} fabrics={fabrics} garmentErrors={garmentErrors} garmentJobs={garmentJobs} garmentTemplates={garmentTemplates} garmentTemplatesError={garmentTemplatesError} garmentsDone={garmentsDone} loadGarmentTemplates={loadGarmentTemplates} openGarment={openGarment} serviceType={serviceType} setDesignRequest={setDesignRequest} setGarmentJobs={setGarmentJobs} setServiceType={setServiceType} />}

            {/* MEASUREMENTS: only the fields each garment's cut asks for. */}
            {wizardStepKey === 'measure' && <MeasurementsStep wizard={wizard} customerForm={customerForm} garmentErrors={garmentErrors} garmentJobs={garmentJobs} measureVoiceNotes={measureVoiceNotes} setMeasureVoiceNotes={setMeasureVoiceNotes} setSpecialInstructions={setSpecialInstructions} specialInstructions={specialInstructions} />}

            {/* REVIEW: everything the order will say, on one page, before a
                price is put on it. Each card jumps back to the screen that
                owns it. */}
            {wizardStepKey === 'review' && <ReviewStep wizard={wizard} customerForm={customerForm} customerId={customerId} customerName={customerName} designRequest={designRequest} designerChoice={designerChoice} designers={designers} fabricTaxonomy={fabricTaxonomy} fabrics={fabrics} garmentJobs={garmentJobs} reviewView={reviewView} serviceType={serviceType} setActiveGarmentKey={setActiveGarmentKey} setCustomerForm={setCustomerForm} setGarmentJobs={setGarmentJobs} setReviewView={setReviewView} wizardSteps={wizardSteps} />}

            {/* MONEY: when it is promised for, what it costs, what was paid. */}
            {wizardStepKey === 'money' && <MoneyStep wizard={wizard} advancePaymentAmount={advancePaymentAmount} garmentErrors={garmentErrors} garmentJobs={garmentJobs} getTaxes={getTaxes} getTotalPrice={getTotalPrice} jobExtras={jobExtras} jobMaterialCharges={jobMaterialCharges} quotePrices={quotePrices} readyBy={readyBy} serviceType={serviceType} setAdvancePaymentAmount={setAdvancePaymentAmount} setQuotePrices={setQuotePrices} setReadyBy={setReadyBy} setWizardError={setWizardError} wizardError={wizardError} />}

            {/* ALTER, screen 2: which garment we made. */}
            {wizardStepKey === 'garment' && <AlterGarmentStep wizard={wizard} alterationForm={alterationForm} setAlterOutside={setAlterOutside} setAlterationForm={setAlterationForm} />}

            {/* ALTER, screen 3: what is wrong, free or paid, anything paid now. */}
            {wizardStepKey === 'issue' && <AlterIssueStep alterationForm={alterationForm} outsidePhoto={outsidePhoto} setAlterationForm={setAlterationForm} setOutsidePhoto={setOutsidePhoto} setWizardError={setWizardError} wizardError={wizardError} />}
            {/* OUTSIDE GARMENT, screen 2: what was brought in. No order of
                ours names it, so it is described, and photographed as it
                arrived -- the record of what was already wrong. */}
            {wizardStepKey === 'outGarment' && <OutsideGarmentStep garmentTemplates={garmentTemplates} outsideForm={outsideForm} outsidePhoto={outsidePhoto} setOutsideForm={setOutsideForm} setOutsidePhoto={setOutsidePhoto} />}

            {/* OUTSIDE GARMENT, screen 3: what needs changing, and the charge. */}
            {wizardStepKey === 'outIssue' && <OutsideIssueStep outsideForm={outsideForm} setOutsideForm={setOutsideForm} setWizardError={setWizardError} wizardError={wizardError} />}
            </div>

          </div>
        </div>
      )}

      {/* CONFIRMED VIEW */}
      {view === 'confirmed' && confirmedOrder && <OrderConfirmedScreen confirmedOrder={confirmedOrder} customerForm={customerForm} openSendToWorkshop={openSendToWorkshop} sendBusy={sendBusy} setShowInvoiceModal={setShowInvoiceModal} setView={setView} />}

      {/* Footer Navigation Bar (Only in Wizard View) */}
      {view === 'wizard' && <WizardFooter wizard={wizard} ctaBusy={ctaBusy} serviceType={serviceType} wizardStepKey={wizardStepKey} />}

      {/* INVOICE MODAL */}
      {showInvoiceModal && confirmedOrder && <InvoiceModal confirmedOrder={confirmedOrder} invoiceSend={invoiceSend} sendInvoiceToWhatsApp={sendInvoiceToWhatsApp} setShowInvoiceModal={setShowInvoiceModal} />}

      {/* Notifications Drawer */}
      {showNotificationsDrawer && <NotificationsDrawer notifications={notifications} setShowNotificationsDrawer={setShowNotificationsDrawer} />}

      {/* Stage Review Modal */}
      {activeReviewStage && activeReviewOrder && <StageReviewModal activeReviewOrder={activeReviewOrder} activeReviewStage={activeReviewStage} assigningStageKey={assigningStageKey} eligibleStaffForStage={eligibleStaffForStage} fabricTaxonomy={fabricTaxonomy} handleAssignStage={handleAssignStage} openGarmentJob={openGarmentJob} reversalBusy={reversalBusy} selectedStageObj={selectedStageObj} setActiveReviewOrder={setActiveReviewOrder} setActiveReviewStage={setActiveReviewStage} setReversalPrompt={setReversalPrompt} setReversalReason={setReversalReason} setReviewView={setReviewView} setSelectedStageObj={setSelectedStageObj} setStageReviewComments={setStageReviewComments} setStageReviewImages={setStageReviewImages} setStageReviewRecording={setStageReviewRecording} setStageTransitionBusy={setStageTransitionBusy} stageReviewComments={stageReviewComments} stageReviewImages={stageReviewImages} stageReviewRecording={stageReviewRecording} stageTransitionBusy={stageTransitionBusy} />}

      <NetworkActivityBar />
      {reviewView && view !== 'wizard' && (
        <Suspense fallback={null}>
          <ReviewLightbox items={reviewView.items} index={reviewView.index}
                          onIndexChange={(i) => setReviewView({ ...reviewView, index: i })}
                          onClose={() => setReviewView(null)} />
        </Suspense>
      )}
      {reversalPrompt && <ReversalPrompt activeReviewOrder={activeReviewOrder} reversalBusy={reversalBusy} reversalPrompt={reversalPrompt} reversalReason={reversalReason} selectedStageObj={selectedStageObj} setActiveReviewOrder={setActiveReviewOrder} setActiveReviewStage={setActiveReviewStage} setReversalBusy={setReversalBusy} setReversalPrompt={setReversalPrompt} setReversalReason={setReversalReason} setSelectedStageObj={setSelectedStageObj} />}
      <GarmentPairingModal
        isOpen={!!activePairingGarment}
        // The next garment picked together with this one, if any, has its suggestion next.
        onClose={() => { setActivePairingGarment(pairingQueue[0] || null); setPairingQueue(pairingQueue.slice(1)); }}
        primaryGarmentKey={activePairingGarment?.key}
        primaryGarmentName={activePairingGarment?.name}
        primaryJobKey={activePairingGarment?.jobKey}
        garmentTemplates={garmentTemplates}
        garmentJobs={garmentJobs}
        onAddPairedGarments={handleAddPairedGarments}
      />
    </div>
    </AppContext.Provider>
  );
}

export default App;
