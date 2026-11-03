import React, { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react';
import { Compass, Scissors, Upload, Check, ArrowRight, ArrowLeft, MessageSquare, Copy, ShieldCheck, BarChart2, FolderOpen, Sparkles, X, ExternalLink, Lock, Mail, FileText, Printer, Bell, User, Eye, EyeOff, Edit2, Plus, Trash2, LogOut, Package, Menu, PenTool, Settings, Wallet, AlertTriangle, Shirt, CheckCircle2, ClipboardList, Type, Tag, Layers, Palette, IndianRupee, Link as LinkIcon, Save, RefreshCw, Ruler, Camera, PanelLeftClose, PanelLeftOpen, ChevronDown, Factory, Send } from 'lucide-react';
import { api } from './services/api';
import { resolveMediaUrl } from './services/media';
import { maySignOff } from './services/signOff';
import { LIMITS, tenDigits, cleanMobile, displayMobile, mobileError, phoneError, cleanName, nameError, cleanEmail, emailError, cleanAmount, amountError, isPastDate, imageFilesError } from './services/validate';
import {
  formatMoney, formatDate as fmtDate, formatDateTime as fmtDateTime,
  formatTime as fmtTime, setBoutiqueTimeZone, orderRef,
} from './services/format';

const GarmentPartPicker = lazy(() => import('./features/designStudio/GarmentPartPicker'));
const GarmentPreviews = lazy(() => import('./features/designStudio/GarmentPreview'));
const ReviewLightbox = lazy(() => import('./features/designStudio/GarmentPartPicker').then(m => ({ default: m.Lightbox })));
import { ALL_ACCESSORY_OPTIONS } from './features/designStudio/accessories';
const GarmentFabricPicker = lazy(() => import('./features/fabrics/GarmentFabricPicker'));
const FabricColorFilter = lazy(() => import('./features/fabrics/FabricColorFilter'));
import { fabricMatchesColour } from './features/fabrics/colour';

const InventoryPanel = lazy(() => import('./features/inventory/InventoryPanel'));
const DesignLibrary = lazy(() => import('./features/designStudio/DesignLibrary'));
const DesignUpload = lazy(() => import('./features/designStudio/DesignUpload'));
const DesignDashboard = lazy(() => import('./features/designStudio/DesignDashboard'));
// The Design library's Overview tab is merged into "Boutique designs" (its
// counts sit with the library's own); hidden, not removed -- set to true to
// bring the tab back.
const SHOW_DESIGN_OVERVIEW_TAB = false;
const DesignWork = lazy(() => import('./features/designStudio/DesignWork'));
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
import TemplateForm from './features/catalog/TemplateForm';
import PetticoatStylePicker from './features/catalog/PetticoatStylePicker';
import GarmentPurchases from './features/catalog/GarmentPurchases';
import { purchaseError } from './features/catalog/materials';
import DesignCataloguePicker from './features/designStudio/DesignCataloguePicker';
import GarmentSummary from './features/catalog/GarmentSummary';
import { AddCustomerChooser, CustomerForm, DeleteAllCustomersDialog } from './features/customers/AddCustomer';
import BoutiqueProductionDialog from './features/production/BoutiqueProduction';
import { EMPTY_CUSTOMER_FILTERS } from './features/customers/filterRules';
import CustomerPicker from './features/customers/CustomerPicker';
import { useCustomerLookup, useDebouncedValue } from './features/customers/useCustomerLookup';
import { useFabricTaxonomy } from './features/fabrics/taxonomy';
import useAutosave from './hooks/useAutosave';
import { followerOf, syncFollowers } from './services/garmentCopies';
import { applyTenantTheme } from './theme';
import { MobileHeader } from './components/ui/MobileHeader';
import { AccountMenu } from './components/ui/AccountMenu';
import { PageHeader, AvatarInitials, Segmented, IconTile, FormModal, Field, Dropzone, InfoNote, CameraButton } from './components/ui/Atelier';
import { useLanguage } from './i18n/LanguageContext.jsx';
import { AppContext } from './context/AppContext';
import StageReviewModal from './features/orders/StageReviewModal';
import OverviewPanel from './features/dashboard/OverviewPanel';
import NotificationsDrawer from './features/notifications/NotificationsDrawer';
import LanguageSelector from './components/LanguageSelector.jsx';
import SettingsPage from './components/SettingsPage.jsx';
import { InvoiceRenderer, normalizeInvoiceData } from './components/invoice/InvoiceTemplates';
import { TERMS_AND_CONDITIONS, PRIVACY_POLICY } from './constants/legal';
import { BottomNavigation } from './components/ui/BottomNavigation';
import ProductTour from './components/ui/ProductTour';
import { markTourSeen, tourSeen } from './components/ui/tourState';
import { hasPageTour } from './components/ui/tourPages';
import { SetupPasswordStep } from './features/staff/StaffFirstSetup';
import { ASSIGN_ONLY_TO } from './constants/roles';
import ExtraMeasurements from './features/catalog/ExtraMeasurements';
import { EXTRA_MEASUREMENTS } from './services/templates';

import { BottomSheet } from './components/ui/BottomSheet';
import { ResponsiveCard } from './components/ui/ResponsiveCard';
import { ProgressiveAccordion } from './components/ui/ProgressiveAccordion';
import DressesDropdown from './components/ui/DressesDropdown';
import GarmentPairingModal, { getGarmentPairConfig, findMatchingTemplate } from './components/ui/GarmentPairingModal';
import VoiceTextarea, { VoiceNotePlayer, VoiceRecorder } from './components/ui/VoiceTextarea';
import { voiceNoteList } from './components/ui/voiceNotes';
import Loader from './components/ui/Loader';
import AuthShowcase from './components/auth/AuthShowcase';
import { setTierNames, tierName } from './services/tierNames';
import { isVisible, splitSpec, validateSpec, withDefaults } from './services/templates';
import { portalSlugFromPath } from './navigation/portalSlug';
import { visibleNav, canSeeTab, hasModule } from './navigation/nav';
import { UserAvatar } from './components/ui/UserAvatar';
import { DEFAULT_CUSTOMER_DATA, SELF_DESIGNER, EMPTY_ALTERATION, WIZARD_DRAFT_KEY, GARMENT_PRICES, WIZARD_STEPS, EMPTY_OUTSIDE, garmentsForGender, MAGGAM_NOTE_VOICE } from './features/orders/wizard';
import { plusDaysIso, todayIso } from './services/dates';
import { CUSTOMER_PAGE_SIZES, customerTier, NO_TIERS } from './features/customers/customerBook';
import { orderBucket, orderStageKey, stageWho, stageNow } from './features/orders/stages';
import { orderGarmentNames, formatMobile, inr } from './services/format';
import { isProductionStaff, SUPERVISOR_ROLES } from './constants/roles';
import { TierBadge } from './features/customers/TierBadge';
import { sheetGet, MEASURE_KEYS, sheetSet, getCustomerMeasurement } from './services/measurements';
import { legalLink } from './components/auth/legalLink';
import { PortalMenu } from './navigation/PortalMenu';
import { ScreenLoading } from './components/ui/ScreenLoading';
import { APPOINTMENT_TYPE_LABELS, APPOINTMENT_STATUS_LABELS } from './constants/appointments';
import { waLink } from './services/phone';
import { StyleProfileCard } from './features/customers/StyleProfileCard';
import { NetworkActivityBar } from './components/ui/NetworkActivityBar';

function App() {
  
  const [view, setView] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('reset')) return 'reset';
    return !portalSlugFromPath() && params.has('register') ? 'signup' : 'login';
  });
  const [requestedTab, setDashboardTab] = useState('overview'); 
  const [previousDashboardTab, setPreviousDashboardTab] = useState('overview');
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

  useEffect(() => {
    if (dashboardTab && dashboardTab !== lastTabRef.current) {
      setPreviousDashboardTab(lastTabRef.current);
      lastTabRef.current = dashboardTab;
    }
  }, [dashboardTab]);

  const getTabLabel = (tabKey) => {
    for (const section of navSections) {
      const found = section.items?.find((item) => item.tab === tabKey);
      if (found) return found.label;
    }
    if (tabKey === 'overview') return t('nav.overview', 'Overview');
    if (tabKey === 'workshop') return t('nav.workshop', 'Workshop');
    if (tabKey === 'orders') return t('nav.orders', 'Orders');
    return tabKey;
  };

  const handleBackFromWorkshop = () => {
    setOrdersStageFilter('All');
    if (previousDashboardTab && previousDashboardTab !== 'workshop') {
      setDashboardTab(previousDashboardTab);
    } else if (window.history.state?.tab && window.history.state.tab !== 'workshop') {
      window.history.back();
    } else {
      setDashboardTab('overview');
    }
  };

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

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  // The login boxes stay read-only until touched, so the browser does not
  // silently fill a saved login (an owner's, on a shared computer) on load;
  // touching one offers the saved logins to pick from instead.
  const [loginUnlocked, setLoginUnlocked] = useState(false);
  const unlockLogin = () => setLoginUnlocked(true);
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  const [resetEmail, setResetEmail] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const [resetToken, setResetToken] = useState(
    () => new URLSearchParams(window.location.search).get('reset'));
  const [resetPassword, setResetPassword] = useState('');
  const [resetConfirm, setResetConfirm] = useState('');
  const [resetDone, setResetDone] = useState(false);

  const [authError, setAuthError] = useState(null);
  const [authBusy, setAuthBusy] = useState(false);

  const [onboardingDismissed, setOnboardingDismissed] = useState(() => {
    try {
      return localStorage.getItem(`onboarding_dismissed_${localStorage.getItem('tenant_id') || ''}`) === '1';
    } catch { return false; }
  });
  const [logoutBusy, setLogoutBusy] = useState(false);

  const [findSlug, setFindSlug] = useState('');
  const [findError, setFindError] = useState(null);
  const [findBusy, setFindBusy] = useState(false);

  const [signupStep, setSignupStep] = useState(1);

  const [signupForm, setSignupForm] = useState({
    first_name: '',
    last_name: '',
    email_address: '',
    mobile_number: '',
    password: '',
    confirm_password: '',
    terms: false
  });
  // The sign-up form's terms popup: 'terms', 'privacy', or closed.
  const [legalDoc, setLegalDoc] = useState(null);
  const [signupBusy, setSignupBusy] = useState(false);

  const [signupError, setSignupError] = useState(null);
  const [justRegistered, setJustRegistered] = useState(false);
  const [boutiqueName, setBoutiqueName] = useState('');
  const [boutiqueAddress, setBoutiqueAddress] = useState('');
  
  // "Request access": nobody creates their own boutique. The request is
  // emailed a welcome ("under review"), the platform team is alerted, and the
  // team emails the login details once the boutique is set up.
  const signupReady = !!(boutiqueName.trim() && boutiqueAddress.trim()
    && signupForm.first_name.trim() && signupForm.last_name.trim()
    && signupForm.email_address.trim() && signupForm.mobile_number
    && signupForm.terms);

  // First sign-in with the temporary password the platform team sent.
  const [changeCurrent, setChangeCurrent] = useState('');
  const [changeNew, setChangeNew] = useState('');
  const [changeConfirm, setChangeConfirm] = useState('');

  const [currentStep, setCurrentStep] = useState(1);
  
  const [maxStepReached, setMaxStepReached] = useState(1);
  const reachStep = useCallback((n) => {
    setCurrentStep(n);
    setMaxStepReached((m) => Math.max(m, n));
  }, []);
  
  const [addingGarmentKey, setAddingGarmentKey] = useState(null);
  // "Add more garments to this order": folded shut again once the picked
  // garments are on the order, so the list does not stay open under them.
  const addMoreGarmentsRef = useRef(null);
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
  const selfDesignerLabel = currentUser?.role && currentUser.role !== 'Owner' ? 'Me' : 'Me (owner)';
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
  const [activePairingGarment, setActivePairingGarment] = useState(null);
  // Garments picked together whose pairing suggestion is still to come, one after another.
  const [pairingQueue, setPairingQueue] = useState([]);
  const [draftId, setDraftId] = useState(null);
  const [draftVersion, setDraftVersion] = useState(null);
  // The order this tab had open before a reload (read once, at load).
  const [draftAfterReload] = useState(() => {
    try { return sessionStorage.getItem(WIZARD_DRAFT_KEY); } catch { return null; }
  });
  const [draftSaveState, setDraftSaveState] = useState('idle');
  const [resumableDrafts, setResumableDrafts] = useState([]);
  const [discardingDraftId, setDiscardingDraftId] = useState(null);
  const [garmentErrors, setGarmentErrors] = useState({});
  const [garmentTemplatesError, setGarmentTemplatesError] = useState(null);
  const [designLibraryToken, setDesignLibraryToken] = useState(0);
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
  const [activeDesignTab, setActiveDesignTab] = useState({});

  const fabricTaxonomy = useFabricTaxonomy();

  const [wizardError, setWizardError] = useState(null);
  const [savingPaymentId, setSavingPaymentId] = useState(null);
  const [paymentError, setPaymentError] = useState(null);

  // Designs CRUD State
  const [showDesignModal, setShowDesignModal] = useState(false);
  const [editingDesign, setEditingDesign] = useState(null);
  const [designSaving, setDesignSaving] = useState(false);
  const [designImageFile, setDesignImageFile] = useState(null);
  const [showDesignUpload, setShowDesignUpload] = useState(false);
  const [designForm, setDesignForm] = useState({
    name: '',
    garment_type: 'Lehenga',
    neckline_style: '',
    sleeve_style: '',
    image_url: '',
    is_boutique: true,
    price: 0,
    description: ''
  });

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

  useEffect(() => {
    // Not while a temporary password is being replaced: the server refuses
    // everything but the change-password screen until then.
    if (currentUser?.must_change_password) return;
    loadGarmentTemplates();
  }, [currentUser, loadGarmentTemplates]);

  const addGarment = async (key, skipPairingPrompt = false, allowAnother = false, pairedWith = null) => {
    
    const taken = garmentJobs.some(job => job.key === key || job.template?.key === key);
    if (taken && !allowAnother) return;
    if (addingGarmentKey) return;
    setAddingGarmentKey(key);
    try {
      const template = await api.getGarmentTemplate(key);
  
      const jobKey = taken ? `${key}#${Date.now().toString(36)}` : key;
      setGarmentJobs(prev => [...prev, {
        key: jobKey, template, values: withDefaults(template), quantities: {}, sources: {}, brought: {}, pairedWith,
        pricing: { base: GARMENT_PRICES[template.name] || 15000, fabric: 0,
                   embroidery: 0, customization: 0, tailoring: 0 },
      }]);
      
      if (!skipPairingPrompt && getGarmentPairConfig(key, template.name)) {
        setActivePairingGarment({ key, name: template.name, jobKey });
      }
      return jobKey;
    } catch (err) {
      console.error(err);
      alert('Could not load that garment form.');
    } finally {
      setAddingGarmentKey(null);
    }
  };

  const handleAddPairedGarments = async (pairKeys) => {
    for (const pairKey of pairKeys) {
      await addGarment(pairKey, true, true, activePairingGarment?.jobKey || null);
    }
  };

  /** Several garments ticked at once. A garment picked together with one it
   *  pairs with (Saree and Blouse) is added as that garment's partner, as if
   *  chosen in its pairing suggestion; then each garment with partners still
   *  left to suggest gets its pairing suggestion, one after another. */
  const addGarments = async (keys) => {
    const nameOf = (key) => garmentTemplates.find(tpl => tpl.key === key)?.name || '';
    const configOf = (key) => getGarmentPairConfig(key, nameOf(key));
    const primaries = keys.filter(key => configOf(key));
    const partnerOf = {};
    primaries.forEach(primary => configOf(primary).pairKeys.forEach(pairKey => {
      const tpl = findMatchingTemplate(pairKey, garmentTemplates);
      if (tpl && keys.includes(tpl.key) && !primaries.includes(tpl.key) && !partnerOf[tpl.key]) partnerOf[tpl.key] = primary;
    }));
    // Each garment followed by the partners picked with it.
    const ordered = keys.filter(key => !partnerOf[key])
      .flatMap(key => [key, ...keys.filter(other => partnerOf[other] === key)]);
    const jobKeys = {};
    for (const key of ordered) {
      jobKeys[key] = await addGarment(key, true, false, partnerOf[key] ? jobKeys[partnerOf[key]] || null : null);
    }
    const suggest = primaries
      .filter(primary => jobKeys[primary] && configOf(primary).pairKeys.some(pairKey => {
        const tpl = findMatchingTemplate(pairKey, garmentTemplates);
        return tpl && partnerOf[tpl.key] !== primary;
      }))
      .map(primary => ({ key: primary, name: nameOf(primary), jobKey: jobKeys[primary] }));
    if (suggest.length) {
      setActivePairingGarment(suggest[0]);
      setPairingQueue(suggest.slice(1));
    }
  };

  useEffect(() => {
    const first = garmentJobs[0]?.template?.name;
    if (first) {
      setCustomerForm(prev => (prev.garment_type === first ? prev : { ...prev, garment_type: first }));
    }
  }, [garmentJobs]);

  const removeGarment = (key) => {
    const gone = new Set([key, ...garmentJobs.filter(job => job.pairedWith === key).map(job => job.key)]);
    setGarmentJobs(prev => prev.filter(job => !gone.has(job.key)));
    setGarmentErrors(prev => {
      const next = { ...prev };
      gone.forEach(k => { delete next[k]; });
      return next;
    });
  };

  /** The purchase row hung on one question of a garment: replaced, or
   *  removed when `row` is null (the answer changed to something in stock). */
  const updateGarmentPurchase = (key, fieldKey, row) => {
    setGarmentJobs(prev => prev.map(job => {
      if (job.key !== key) return job;
      const rest = (job.purchases || []).filter(r => r.field_key !== fieldKey);
      return { ...job, purchases: row ? [...rest, row] : rest };
    }));
  };

  const updateGarmentValues = (key, values) => {
    setGarmentJobs(prev => prev.map(job => (job.key === key ? { ...job, values } : job)));
  };

  
  const defaultMaterialSource = () => 'STORE';

  /** The material fields on a template, with the item chosen for each.
   *
   *  Read off the template rather than off a hardcoded list, so a garment that
   *  gains a material field gains a material line with it. */
  const garmentMaterialFields = (job) => {
    const fallback = defaultMaterialSource(job);
    return (job.template?.sections || [])
      .flatMap(section => section.fields || [])
      .filter(field => field.field_type === 'inventory_ref')
      .map(field => {
        const source = job.sources?.[field.key] || fallback;
        const brought = job.brought?.[field.key] || {};
        return {
          field,
          source,
          itemId: job.values?.[field.key],
          name: (brought.name || '').trim(),
          unit: brought.unit,
          estimated_cost: brought.estimated_cost,
          required_by: brought.required_by,
          notes: brought.notes,
        };
      })
      
      .filter(entry => (entry.source === 'STORE' ? entry.itemId : entry.name));
  };

  /** One material line, in the shape the API stores.
   *
   *  Customer material carries its own name and never an inventory item -- the
   *  serializer rejects the combination, because their cloth is not stock and
   *  must never be reserved or deducted from it.
   */
  const materialLine = (job) => ({ field, source, itemId, name, unit, estimated_cost, required_by, notes }) => (
    source === 'PURCHASE'
      ? {
        field_key: field.key,
        free_text: name,
        quantity: job.quantities?.[field.key],
        unit,
        source: 'PURCHASE',
        estimated_cost: estimated_cost || 0,
        required_by: required_by || null,
        notes: (notes || '').trim(),
      }
    : source === 'CUSTOMER'
      ? {
        field_key: field.key,
        free_text: name,
        quantity: job.quantities?.[field.key],
        unit,
        source: 'CUSTOMER',
      }
      : {
        field_key: field.key,
        inventory_item: itemId,
        quantity: job.quantities?.[field.key],
        source: 'STORE',
      }
  );

  /** Validate every dress on the order; returns true when all of them pass. */
  const validateGarments = ({ partial = false, sections = null, only = null } = {}) => {
    const errors = {};
    const quantityErrors = {};
    garmentJobs.filter(job => !only || job.key === only).forEach(job => {
      const jobErrors = validateSpec(job.template, job.values, { partial, sections });
      if (Object.keys(jobErrors).length) errors[job.key] = jobErrors;

     
      if (partial || sections) return;
      const jobQuantityErrors = {};
      garmentMaterialFields(job).forEach(({ field }) => {
        const raw = job.quantities?.[field.key];
        const quantity = Number(raw);
        if (raw === undefined || raw === '' || Number.isNaN(quantity) || quantity <= 0) {
          jobQuantityErrors[field.key] = 'Enter how much of this material this garment needs.';
        }
      });
      
      const fallbackSource = defaultMaterialSource(job);
      (job.template?.sections || [])
        .flatMap(section => section.fields || [])
        .filter(field => field.field_type === 'inventory_ref')
        .forEach(field => {
          const source = job.sources?.[field.key] || fallbackSource;
          const name = (job.brought?.[field.key]?.name || '').trim();
          const raw = job.quantities?.[field.key];
          if (source === 'CUSTOMER' && !name && raw !== undefined && raw !== '') {
            jobQuantityErrors[field.key] = 'Name what the customer brought for this.';
          }
          if (source === 'PURCHASE') {
            const cost = Number(job.brought?.[field.key]?.estimated_cost ?? 0);
            if (!name && raw !== undefined && raw !== '') jobQuantityErrors[field.key] = 'Say what needs to be bought.';
            else if (Number.isNaN(cost) || cost < 0) jobQuantityErrors[field.key] = 'The estimated cost cannot be negative.';
          }
        });
      (job.purchases || []).forEach((row, i) => {
        const problem = purchaseError(row);
        if (problem) jobQuantityErrors[`purchase:${i}`] = problem;
      });
      if (Object.keys(jobQuantityErrors).length) quantityErrors[job.key] = jobQuantityErrors;
    });
    setGarmentErrors(errors);
    const failed = Object.keys({ ...errors, ...quantityErrors })[0];
    if (failed) {
      setActiveGarmentKey(failed);

      const fieldKey = Object.keys(errors[failed] || quantityErrors[failed])[0];
      requestAnimationFrame(() => {
        const scope = document.getElementById(`wz-garment-${failed}`) || document;
        const control = scope.querySelector(`[id="tf-${fieldKey}"]`);
        
        let fold = control?.closest('details');
        while (fold) { fold.open = true; fold = fold.parentElement?.closest('details'); }
        control?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        control?.focus({ preventScroll: true });
      });
    }
    return Object.keys(errors).length === 0 && Object.keys(quantityErrors).length === 0;
  };

  
  const garmentMaterialLines = (job) => {
    const picked = Object.entries(job.fabrics || {}).flatMap(([slot, ids]) =>
      [...new Set((ids || []).map(String))].map(id => ({
        field_key: slot, inventory_item: id, source: 'STORE',
        quantity: job.fabric_qty?.[`${slot}:${id}`],
      })))
      .filter(line => Number(line.quantity) > 0);
    const pickedIds = new Set(picked.map(line => String(line.inventory_item)));
    const fromTemplate = garmentMaterialFields(job).map(materialLine(job))
      .filter(line => !(line.inventory_item && pickedIds.has(String(line.inventory_item))));
    return [...picked, ...fromTemplate];
  };

  const serialiseWizard = () => {
    const total = getTotalPrice();
    const advance = Number(advancePaymentAmount) || 0;
  
    const withDate = (values) => (readyBy ? { ...values, delivery_date: readyBy } : values);
    return {
      ...customerForm,
      measurements: customerForm.measurements || {},
      service: serviceType,
      ready_by: readyBy || null,
      design_request: { ...designRequest, designer: designerChoice },
      garments: garmentJobs.map(job => {
        const values = withDate(job.values || {});
        const design = { ...(job.design || {}) };
        delete design.request;
        const wantsDesigner = serviceType === 'design' && designerChoice
          && designerChoice !== SELF_DESIGNER;
        return {
          key: job.key,
          label: job.label || '',
          paired_with: job.pairedWith || null,
          template: job.template?.id,
          template_key: job.template?.key || job.key,
          spec: splitSpec(job.template, values).spec,
          measurements: splitSpec(job.template, values).measurements,
          values,
          quantities: job.quantities || {},
          pricing: { ...(job.pricing || {}), fabric: jobMaterialsTotal(job) },
          design: wantsDesigner
            ? { ...design, request: { designer: designerChoice, brief: designRequest.brief || '',
                                      voice_note: voiceNoteList(designRequest.voice_notes, designRequest.voice_note)[0]?.url || '',
                                      voice_notes: voiceNoteList(designRequest.voice_notes, designRequest.voice_note) } }
            : design,
          fabrics: job.fabrics || {},
          fabric_qty: job.fabric_qty || {},
          // The ticked accessories with their type, "Other" text and measurement.
          accessories: job.accessories || {},
          sources: job.sources || {},
          brought: job.brought || {},
          materials: garmentMaterialLines(job),
          purchases: (job.purchases || []).map(r => ({
            field_key: r.field_key || '',
            name: (r.name || '').trim(), quantity: r.quantity, unit: r.unit || 'METER',
            estimated_cost: r.estimated_cost || 0, required_by: r.required_by || null, notes: (r.notes || '').trim(),
          })),
        };
      }),
      design: {
        notes: designNotes, links: designLinks, source: designSource,
        templates: selectedDesignTemplates,
      },
      staff: { tailor_id: null, master_id: null },
      prices: quotePrices,
      delivery: { method: 'Direct Pickup' },
      payment: { option: !quotePrices.price_later && total > 0 && advance >= total ? 'full' : 'partial', advance },
      special_instructions: specialInstructions,
      instructions_voice_note: measureVoiceNotes[0]?.url || '',
      instructions_voice_note_by: measureVoiceNotes[0]?.by || '',
      instructions_voice_note_at: measureVoiceNotes[0]?.at || null,
      instructions_voice_notes: measureVoiceNotes,
    };
  };

  /** Put a saved draft back on screen, exactly where it was left. */
  const hydrateWizard = async (draft) => {
    const payload = draft.payload || {};
    setCustomerLocked(false);
    setDraftId(draft.id);
    setDraftVersion(draft.version);
    setCustomerId(draft.customer || null);

    const { garments = [], design = {}, prices, payment = {},
            service, ready_by, design_request, wizard_cursor, ...customer } = payload;
    
    ['fabric', 'staff', 'delivery'].forEach((key) => { delete customer[key]; });
    setCustomerForm(prev => ({ ...prev, ...customer }));
    setCustomerName(`${customer.first_name || ''} ${customer.last_name || ''}`.trim());
    const kind = service === 'design' ? 'design' : 'stitch';
    setServiceType(kind);
    setAlterOutside(false);

    setReadyBy(ready_by || garments.find(g => g.values?.delivery_date)?.values.delivery_date || plusDaysIso(15));
    setDesignRequest(design_request || { designer: '', brief: '' });

    const rebuilt = [];
    for (const garment of garments) {
      try {
        const template = await api.getGarmentTemplate(garment.template_key);
        rebuilt.push({
          key: garment.key || garment.template_key,
          label: garment.label || '',
          pairedWith: garment.paired_with || null,
          template,
          values: withDefaults(template, garment.values),
          quantities: garment.quantities || {},
          sources: garment.sources || {},
          brought: garment.brought || {},
          pricing: garment.pricing || {},
          design: garment.design || {},
          fabrics: garment.fabrics || {},
          fabric_qty: garment.fabric_qty || {},
          accessories: garment.accessories || {},
          purchases: garment.purchases || [],
        });
      } catch (err) {
        console.error('Could not reload the garment template', garment.template_key, err);
      }
    }
    
    const hasJobPricing = rebuilt.some(job =>
      Object.values(job.pricing || {}).some(v => parseFloat(v || 0)));
    if (!hasJobPricing && rebuilt.length && prices) {
      rebuilt[0] = { ...rebuilt[0], pricing: {
        base: prices.base || 0, fabric: prices.fabric || 0,
        embroidery: prices.embroidery || 0,
        customization: prices.customization || 0,
        tailoring: prices.tailoring || 0,
      } };
    }
    setGarmentJobs(rebuilt);

    setDesignNotes(design.notes || '');
    setDesignLinks(design.links || '');
    if (design.source) setDesignSource(design.source);
    setSelectedDesignTemplates(design.templates || []);
    if (prices) setQuotePrices({ packaging: prices.packaging ?? 500,
                                 discount: prices.discount ?? 0,
                                 gst_mode: prices.gst_mode || 'percent', gst_value: prices.gst_value ?? 0,
                                 price_later: Boolean(prices.price_later) });
    if (payment.advance !== undefined) setAdvancePaymentAmount(payment.advance);
    setSpecialInstructions(payload.special_instructions || '');
    // A draft saved before there could be several keeps its one note.
    setMeasureVoiceNotes(voiceNoteList(payload.instructions_voice_notes, payload.instructions_voice_note
      ? { url: payload.instructions_voice_note, by: payload.instructions_voice_note_by || '', at: payload.instructions_voice_note_at || null }
      : null));
    setWizardError(null);
    setDraftSaveState('idle');
    setGarmentErrors({});
    
    
    const steps = WIZARD_STEPS[kind];
    const named = steps.findIndex(st => st.key === wizard_cursor?.step_key) + 1;
    const old = draft.current_step || 1;
    const legacy = kind === 'alter' ? old
      : old <= 1 ? 1
        : old <= 4 ? steps.findIndex(st => st.key === 'type') + 1
          : old === 5 ? steps.findIndex(st => st.key === 'measure') + 1
            : steps.findIndex(st => st.key === 'review') + 1;
    let step = Math.min(named || legacy, steps.length);
    setActiveGarmentKey(wizard_cursor?.garment || null);
    setGarmentsDone(wizard_cursor?.done || []);
    
    if (kind !== 'alter' && !(draft.payload?.garments || []).length) step = 1;
    setMaxStepReached(step);
    reachStep(step);
    setView('wizard');
  };

  /** Write the wizard to its draft, creating one on first save.
   *
   *  Returns the draft id, so callers that are about to navigate away can be
   *  sure the work is on the server before they go.
   */
  const persistDraft = async ({ step, cursor = {} } = {}) => {
    const current_step = step || currentStep;
   
    const payload = {
      ...serialiseWizard(),
      wizard_cursor: {
        step_key: wizardSteps[current_step - 1]?.key || null,
        garment: activeGarmentKey, done: garmentsDone, ...cursor,
      },
    };
    setDraftSaveState('saving');
    try {
      if (!draftId) {
        const created = await api.createOrderDraft({
          payload, current_step, customer: customerId || null,
        });
        setDraftId(created.id);
        setDraftVersion(created.version);
        setDraftSaveState('saved');
        return created.id;
      }
      const saved = await api.updateOrderDraft(draftId, {
        payload, current_step, customer: customerId || null, version: draftVersion,
      });
      setDraftVersion(saved.version);
      setDraftSaveState('saved');
      return saved.id;
    } catch (err) {
      
      setDraftSaveState(err.isConflict ? 'conflict' : 'failed');
      if (!err.isConflict) console.error('Could not save the draft', err);
      throw err;
    }
  };

  const [selectedDashboardOrder, setSelectedDashboardOrder] = useState(null);
  const [updatingOrderStatusId, setUpdatingOrderStatusId] = useState(null);
  const [styleNotesFor, setStyleNotesFor] = useState(null);
  const [selectedDirectoryCustomer, setSelectedDirectoryCustomer] = useState(null);
  const [viewAllCustomerMeasurements, setViewAllCustomerMeasurements] = useState(false);
  
  const [alterationOrder, setAlterationOrder] = useState(null);
  
  const [ordersAlterationOrder, setOrdersAlterationOrder] = useState(null);
  
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
  const [expandedCustomerOrderId, setExpandedCustomerOrderId] = useState(null);
  const [openOrdersRowId, setOpenOrdersRowId] = useState(null);
  // The order page's "not sent on WhatsApp" panel, opened from its top button (an order id).
  const [sendErrorsOrderId, setSendErrorsOrderId] = useState(null);
  
  const [openGarmentJob, setOpenGarmentJob] = useState(null);
  const [approvingDesignId, setApprovingDesignId] = useState(null);
  const [assigningStageKey, setAssigningStageKey] = useState(null);

  const [dashboardData, setDashboardData] = useState(null);
  const [tailors, setTailors] = useState([]);
  
  const [designerStaff, setDesignerStaff] = useState([]);
  const [completingAllOrderId, setCompletingAllOrderId] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [showAppointmentModal, setShowAppointmentModal] = useState(false);
  const [appointmentForm, setAppointmentForm] = useState({
    customer: '', appointment_type: 'TRIAL', scheduled_time: '', assigned_staff: '', notes: '',
  });
  const [savingAppointment, setSavingAppointment] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState(null);
  const [showAllAppointments, setShowAllAppointments] = useState(false);
  const [fabrics, setFabrics] = useState([]);
  const [allDesigns, setAllDesigns] = useState([]);
  // The whole book's size and tiers (/customers/stats/). The book itself is no
  // longer downloaded: the Customers page asks for one page at a time, and the
  // pickers search as they are typed into.
  const [customerStats, setCustomerStats] = useState(null);
  
  const [startingBoutiqueRun, setStartingBoutiqueRun] = useState(false);
  const [ordersList, setOrdersList] = useState([]);
  const [queuedMessages, setQueuedMessages] = useState([]);
  const [confirmedOrder, setConfirmedOrder] = useState(null);
  const [sendBusy, setSendBusy] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  // Leads have their own sidebar item; it opens the customer book filtered to leads.
  const customerView = dashboardTab === 'leads' ? 'leads' : 'customers';
  const [customerPageAt, setCustomerPageAt] = useState({ key: '', page: 1 });
  const [customerPageSize, setCustomerPageSize] = useState(CUSTOMER_PAGE_SIZES[0]);
  const [customerFilters, setCustomerFilters] = useState(EMPTY_CUSTOMER_FILTERS);
  // The Customers page's current page, as the server answered it.
  const [customerDirectory, setCustomerDirectory] = useState({ key: '', forView: null, data: null, error: false });
  const [directoryVersion, setDirectoryVersion] = useState(0);
  const directorySearch = useDebouncedValue(searchQuery);
  const [ordersSearch, setOrdersSearch] = useState('');
  const [ordersTabPick, setOrdersFilterTab] = useState(null);
  const ordersFilterTab = dashboardTab === 'workshop' ? 'workshop' : (ordersTabPick || 'new');
  const [ordersTierFilter, setOrdersTierFilter] = useState('All');
  const [ordersTypeFilter, setOrdersTypeFilter] = useState('All');
  const [ordersGarmentFilter, setOrdersGarmentFilter] = useState('All');
  const [ordersStageFilter, setOrdersStageFilter] = useState('All');
  const [ordersView, setOrdersView] = useState('list');
  const openOrder = openOrdersRowId ? ordersList.find((o) => o.id === openOrdersRowId) : null;
  useEffect(() => {
    if (!openOrdersRowId) return;
    window.scrollTo({ top: 0 });
    document.querySelector('.portal-main')?.scrollTo?.(0, 0);
  }, [openOrdersRowId]);

  const orderMatchesFilters = (order) => {
    if (ordersTypeFilter === 'Alteration' && order.flow !== 'alteration') return false;
    if (ordersTypeFilter === 'Maggam' && order.flow !== 'maggam') return false;
    if (ordersTypeFilter === 'Stitching' && order.flow !== 'stitching' && order.flow !== 'legacy') return false;
    if (orderBucket(order) !== ordersFilterTab) return false;
    if (ordersTierFilter !== 'All' && customerTier(order) !== ordersTierFilter) return false;
    if (ordersGarmentFilter !== 'All' && !orderGarmentNames(order).includes(ordersGarmentFilter)) return false;
    if (ordersStageFilter !== 'All' && orderStageKey(order) !== ordersStageFilter) return false;

    if (ordersSearch.trim()) {
      const query = ordersSearch.toLowerCase().trim();
      const matchesId = (order.order_id || '').toLowerCase().includes(query)
        || orderRef(order).toLowerCase().includes(query);
      const matchesClient = (order.customer_name || '').toLowerCase().includes(query);
      const matchesPhone = (order.customer_phone || '').toLowerCase().includes(query);
      const matchesGarment = orderGarmentNames(order).some(g => (g || '').toLowerCase().includes(query))
        || (order.garment_jobs || []).some(j => (j.display_name || j.template_name || '').toLowerCase().includes(query));
      const matchesStage = (order.stages || []).some(st => (st.stage_name || st.stage_key || '').toLowerCase().includes(query))
        || (order.order_status || '').toLowerCase().includes(query)
        || ((order.order_status === 'Delivered' || orderBucket(order) === 'done') && 'delivered'.includes(query))
        || (order.order_status === 'Cancelled' && 'cancelled'.includes(query));
      const matchesWorker = (order.stages || []).some(st => stageWho(st).toLowerCase().includes(query))
        || (order.tailor_name || '').toLowerCase().includes(query)
        || (order.master_name || '').toLowerCase().includes(query)
        || (query === 'unassigned' && !(order.tailor_name || order.master_name || (order.stages || []).some(st => stageWho(st))));

      const matchesJobInfo = (order.garment_jobs || []).some(job => {
        const st = stageNow(order, job?.id);
        const w = st && stageWho(st.current) ? stageWho(st.current) : '';
        const sn = st?.current?.stage_name || st?.current?.stage_key || (job && !st ? 'delivered' : '');
        return w.toLowerCase().includes(query) || sn.toLowerCase().includes(query);
      });

      if (!(matchesId || matchesClient || matchesPhone || matchesGarment || matchesStage || matchesWorker || matchesJobInfo)) {
        return false;
      }
    }
    return true;
  };
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
  const [stageReviewComments, setStageReviewComments] = useState('');
  
  
  const [stageReviewImages, setStageReviewImages] = useState([]);
  
  const [stageReviewRecording, setStageReviewRecording] = useState(false);
  const [selectedStageObj, setSelectedStageObj] = useState(null);
  const [stageTransitionBusy, setStageTransitionBusy] = useState(false);
  const [reversalPrompt, setReversalPrompt] = useState(null);
  const [reversalReason, setReversalReason] = useState('');
  const [reversalBusy, setReversalBusy] = useState(false);
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
  const [savingVerificationOrderId, setSavingVerificationOrderId] = useState(null);
  const [assigningWorkflowOrderId, setAssigningWorkflowOrderId] = useState(null);
  const [deletingDraftId, setDeletingDraftId] = useState(null);

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

  const handleForgotSubmit = async (e) => {
    if (e) e.preventDefault();
    const email = resetEmail.trim();
    if (!email) {
      setAuthError('Enter the email address you sign in with.');
      return;
    }
    setAuthBusy(true);
    setAuthError(null);
    try {
      await api.requestPasswordReset(email);
      setResetSent(true);
    } catch (err) {
      setAuthError(err.message || 'Could not send the reset email.');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleResetSubmit = async (e) => {
    if (e) e.preventDefault();
    if (resetPassword.length < 8) {
      setAuthError('The password needs at least 8 characters.');
      return;
    }
    if (resetPassword !== resetConfirm) {
      setAuthError('Those two passwords do not match.');
      return;
    }
    setAuthBusy(true);
    setAuthError(null);
    try {
      await api.confirmPasswordReset(resetToken, resetPassword);
      localStorage.removeItem('token');
      localStorage.removeItem('tenant_id');
      setResetDone(true);
      setResetPassword('');
      setResetConfirm('');
    } catch (err) {
      setAuthError(err.message || 'Could not change your password.');
    } finally {
      setAuthBusy(false);
    }
  };

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
      setLoading(false);
    }
  };

  const fetchDashboardAndConfig = async (user = currentUser) => {
    setLoading(true);
    setLoadErrors([]);

    const load = async (label, request, apply) => {
      try {
        const data = await request();
        if (apply && data !== undefined) apply(data);
      } catch (err) {
        console.error(`Failed to load ${label}`, err);
        setLoadErrors((prev) => (prev.includes(label) ? prev : [...prev, label]));
      }
    };

    
    await Promise.all([
      load('dashboard', api.getDashboard, (data) => {
        setDashboardData(data);
        if (data.recent_orders?.length > 0) {
          setSelectedDashboardOrder((current) => {
            if (!current) return data.recent_orders[0];
            return data.recent_orders.find(o => o.id === current.id) || current;
          });
        }
      }),

      load('customers', api.getCustomerStats, (data) => {
        setCustomerStats(data);
        // An open Customers page asks again too, so it shows what just changed.
        setDirectoryVersion((v) => v + 1);
      }),

      load('orders', api.getOrders, setOrdersList),

      hasModule(user, 'tailors') && load('tailors', api.getTailors, setTailors),
      // Silent on failure: the only cost is no designers in the Design stage's assign list.
      hasModule(user, 'tailors') && api.getTailors({ forAttendance: true })
        .then((rows) => setDesignerStaff((rows || []).filter(t => t.role === 'Designer')))
        .catch(() => {}),
      hasModule(user, 'scheduling') && load('appointments', () => api.getAppointments({ upcoming: 'true' }), setAppointments),
      hasModule(user, 'inventory') && load('fabrics', () => api.getInventoryItems({ picker: 'true' }), setFabrics),
      hasModule(user, 'design_studio') && load('designs', api.getAllBoutiqueDesigns, setAllDesigns),

      load('settings', api.getBoutiqueSettings, (data) => {
        setBoutiqueSettings(data);
        setBoutiqueTimeZone(data?.timezone);
      }),

      hasModule(user, 'notifications') && load('notifications', () => fetchNotifications(user), () => {}),

      (!user?.role || ['Owner', 'Master'].includes(user.role) || (user.admin_tasks || []).includes('orders.notify'))
        && load('customer messages', api.getQueuedCustomerMessages, setQueuedMessages),
    ]);

    setLoading(false);
  };

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

  /** Reload the panel under whichever view it is showing. */
  const reloadAppointments = async () => {
    const fresh = await api.getAppointments(
      showAllAppointments ? {} : { upcoming: 'true' });
    setAppointments(fresh);
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

  const closeAppointmentModal = () => {
    setShowAppointmentModal(false);
    setEditingAppointment(null);
    setAppointmentForm(blankAppointmentForm);
  };

  const handleSaveAppointment = async (e) => {
    e.preventDefault();
    if (savingAppointment) return;
    if (!editingAppointment && isPastDate((appointmentForm.scheduled_time || '').slice(0, 10))) {
      alert('The appointment cannot be in the past.');
      return;
    }
    const bookingForNew = !editingAppointment && appointmentForm.isNewCustomer;
    if (bookingForNew) {
      const problem = nameError(appointmentForm.new_first_name, { label: 'First name' })
        || mobileError(appointmentForm.new_mobile);
      if (problem) { alert(problem); return; }
    }
    setSavingAppointment(true);
    try {
      const { isNewCustomer, new_first_name, new_last_name, new_mobile, new_gender, ...rest } = appointmentForm;
      const payload = {
        ...rest,
        assigned_staff: appointmentForm.assigned_staff || null,
        scheduled_time: new Date(appointmentForm.scheduled_time).toISOString(),
      };
      if (bookingForNew) {
        delete payload.customer;
        payload.new_customer = {
          first_name: cleanName(new_first_name).trim(),
          last_name: cleanName(new_last_name).trim(),
          mobile_number: cleanMobile(new_mobile),
          gender: new_gender,
        };
      }
      if (editingAppointment) {
        delete payload.customer;
        await api.updateAppointment(editingAppointment.id, payload);
      } else {
        await api.createAppointment(payload);
      }
      await reloadAppointments();
      fetchDashboardAndConfig();
      closeAppointmentModal();
    } catch (err) {
      alert((editingAppointment ? "Could not save the appointment: "
                                : "Could not book the appointment: ") + err.message);
    } finally {
      setSavingAppointment(false);
    }
  };

  /** Cancelling keeps the record and the reason it existed; it does not delete
   *  the customer's history. */
  const handleCancelAppointment = async () => {
    if (!editingAppointment) return;
    if (!window.confirm('Cancel this appointment? The customer keeps the record of it.')) return;
    setSavingAppointment(true);
    try {
      await api.updateAppointment(editingAppointment.id, { status: 'CANCELLED' });
      await reloadAppointments();
      fetchDashboardAndConfig();
      closeAppointmentModal();
    } catch (err) {
      alert("Could not cancel the appointment: " + err.message);
    } finally {
      setSavingAppointment(false);
    }
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

  

  // Designer in charge. The garment's DesignAssignment is the one record the
  // Design Work screen, the designer's desk and the Design Studio all read, so
  // writing it here is what makes the choice show up everywhere.
  const designerInCharge = (jobs) => {
    const held = jobs.map(j => j.design_assignment).filter(Boolean);
    if (!held.length) return { id: '', name: '' };
    const ids = [...new Set(held.map(a => a.designer))];
    if (ids.length > 1) return { id: '', name: '', mixed: true };
    return { id: held[0].designer, name: held[0].designer_name };
  };

  const assignOrderDesigner = async (order, jobs, designerId) => {
    if (!designerId || assigningWorkflowOrderId) return;
    const approved = jobs.filter(j => j.design_assignment?.status === 'APPROVED'
      && j.design_assignment.designer !== designerId);
    const todo = jobs.filter(j => !approved.includes(j) && j.design_assignment?.designer !== designerId);
    setAssigningWorkflowOrderId(order.id);
    try {
      for (const job of todo) await api.assignDesignWork({ garment_job: job.id, designer: designerId });
      if (approved.length) {
        alert(`${approved.length === 1 ? 'One garment keeps its designer' : `${approved.length} garments keep their designer`}: `
          + 'the design is already approved. Request changes on it in Design Work before reassigning.');
      }
    } catch (err) {
      alert('Failed to update the designer: ' + err.message);
    } finally {
      setAssigningWorkflowOrderId(null);
      fetchDashboardAndConfig();
    }
  };

  const handleSaveDesign = async (e) => {
    e.preventDefault();
    if (designSaving) return;
    const imageUrl = (designForm.image_url || '').trim();
    const bad = amountError(designForm.price, { label: 'Catalog price' })
      
      || (imageUrl && ((/^[a-z][a-z0-9+.-]*:/i.test(imageUrl) && !/^https?:/i.test(imageUrl)) || /\s/.test(imageUrl))
        ? 'The image URL must be a web address (http:// or https://) or a catalogue file name.' : '');
    if (bad) { alert(bad); return; }
    setDesignSaving(true);
    try {
      const payload = {
        ...designForm,
        image_url: imageUrl,
        price: parseFloat(designForm.price) || 0.00,
        is_boutique: designForm.is_boutique === true || designForm.is_boutique === 'true',
        
        catalogue: designForm.catalogue_path || undefined,
      };
      delete payload.catalogue_path;
      if (designImageFile) {
        
        payload.image_url = (await api.uploadBoutiqueDesignImage(designImageFile)).image_url;
      }
      if (!payload.image_url) {
        
        payload.image_url = 'https://images.unsplash.com/photo-1610030469668-93535c17b6b3?w=400';
      }
      if (editingDesign) {
        await api.updateBoutiqueDesign(editingDesign.id, payload);
      } else {
        await api.createBoutiqueDesign(payload);
      }
      setShowDesignModal(false);
      setEditingDesign(null);
      setDesignImageFile(null);
      setDesignForm({ name: '', garment_type: 'Lehenga', neckline_style: '', sleeve_style: '', image_url: '', is_boutique: true, price: 0, description: '' });
      setDesignLibraryToken(t => t + 1);
      fetchDashboardAndConfig();
    } catch (err) {
      alert("Failed to save design: " + err.message);
    } finally {
      setDesignSaving(false);
    }
  };

  const handleDeleteDesign = async (id) => {
    if (window.confirm("Are you sure you want to delete this design?")) {
      try {
        await api.deleteBoutiqueDesign(id);
        setDesignLibraryToken(t => t + 1);
        fetchDashboardAndConfig();
      } catch (err) {
        alert("Failed to delete design: " + err.message);
      }
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

  
  const slugFromTyped = (raw) => {
    const typed = (raw || '').trim().split(/[?#]/)[0];
    const tail = typed.split('/').filter(Boolean).pop() || '';
    return tail.toLowerCase().replace(/[^a-z0-9]/g, '');
  };

  const handleFindSubmit = async (e) => {
    if (e) e.preventDefault();
    if (findBusy) return;
    const slug = slugFromTyped(findSlug);
    if (!slug) {
      setFindError('Type your boutique name or the address you sign in at.');
      return;
    }
    setFindBusy(true);
    setFindError(null);
    const found = await api.getBoutiqueBySlug(slug);
    if (!found) {
      setFindError(`No active boutique signs in at /${slug}. Check the spelling with whoever set it up.`);
      setFindBusy(false);
      return;
    }
   
    window.location.href = `/${found.shop_slug}`;
  };

  const handleSignupSubmit = async (e) => {
    e.preventDefault();
    if (!signupReady) return;
    const bad = nameError(signupForm.first_name, { label: 'First name' })
      || nameError(signupForm.last_name, { label: 'Last name' })
      || emailError(signupForm.email_address, { required: true })
      || mobileError(signupForm.mobile_number);
    if (bad) { setSignupError(bad); return; }
    if (signupBusy) return;
    setSignupBusy(true);
    setSignupError(null);
    try {
      await api.requestAccess({
        name: `${signupForm.first_name.trim()} ${signupForm.last_name.trim()}`,
        email: signupForm.email_address.trim(),
        phone: signupForm.mobile_number,
        boutique: boutiqueName.trim(),
        address: boutiqueAddress.trim(),
        terms_accepted: signupForm.terms === true,
      });
      setSignupStep(2);
    } catch (err) {
      setSignupError(err.message || 'Your request could not be sent. Please try again.');
    } finally {
      setSignupBusy(false);
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
  /** The customer's ID for a picture drawn on them. A customer typed in on
   *  the Customer step has none until the order is placed, so they are saved
   *  now -- or matched by mobile to one the book already has -- and the order
   *  goes on with that same customer. The typed form is left as it is. */
  const ensureCustomerId = async () => {
    if (customerId) return customerId;
    const last10 = (value) => String(value || '').replace(/\D/g, '').slice(-10);
    const typed = last10(customerForm.mobile_number);
    const matches = typed ? await api.lookupCustomers({ mobile: typed, limit: 50 }) : [];
    const found = (matches || []).find(c => last10(c.mobile_number) === typed);
    const optional = Object.fromEntries(['email_address', 'gender', 'city_region', 'address']
      .filter(key => String(customerForm[key] || '').trim()).map(key => [key, customerForm[key]]));
    const cust = found || await api.createCustomer({
      first_name: customerForm.first_name.trim(), last_name: (customerForm.last_name || '').trim(),
      mobile_number: String(customerForm.mobile_number).trim(), ...optional,
    });
    setCustomerId(cust.id);
    if (!found) refreshCustomerBook();
    return cust.id;
  };
  const clearPickedCustomer = (mobile) => {
    setNumberMatched(null);
    setCustomerId(null);
    setCustomerForm({ ...DEFAULT_CUSTOMER_DATA, mobile_number: mobile || '' });
    setCustomerName('');
  };
  const setCustomerNameSplit = (raw) => {
    setCustomerName(raw);
    const trimmed = raw.trim();
    const cut = trimmed.indexOf(' ');
    setCustomerForm(prev => ({
      ...prev,
      first_name: cut === -1 ? trimmed : trimmed.slice(0, cut),
      last_name: cut === -1 ? '' : trimmed.slice(cut + 1).trim(),
    }));
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
  /** The Customers page's "Add Customer": the New customer form, on its own,
   *  with no order. A customer can still be added inside a new order too. */
  const handleStartNewCustomer = () => setCustomerAddMode('manual');

  const [customerAddMode, setCustomerAddMode] = useState(null);
  
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [deletingAllCustomers, setDeletingAllCustomers] = useState(false);
  const [customerActionId, setCustomerActionId] = useState(null);
  /** Open the edit form on the full record (a list row is a summary). */
  const startEditCustomer = async (row) => {
    if (customerActionId) return;
    setCustomerActionId(row.id);
    try {
      setEditingCustomer(await api.getCustomer(row.id));
    } catch (err) {
      alert(err.message);
    } finally {
      setCustomerActionId(null);
    }
  };
  const handleDeleteCustomer = async (row) => {
    if (customerActionId) return;
    const name = `${row.first_name || ''} ${row.last_name || ''}`.trim() || 'this customer';
    if (!window.confirm(`Delete ${name}?\n\nTheir measurements, appointments and saved designs are deleted too. This cannot be undone.`)) return;
    setCustomerActionId(row.id);
    try {
      await api.deleteCustomer(row.id);
      setSelectedDirectoryCustomer((current) => (current && current.id === row.id ? null : current));
      await fetchDashboardAndConfig();
    } catch (err) {
      alert(err.message);
    } finally {
      setCustomerActionId(null);
    }
  };
  const handleMarkLeadContacted = async (row) => {
    if (customerActionId) return;
    setCustomerActionId(row.id);
    try {
      await api.updateCustomer(row.id, { is_lead: false });
      await fetchDashboardAndConfig();
    } catch (err) {
      alert(err.message);
    } finally {
      setCustomerActionId(null);
    }
  };
  /** An order started from a customer's own page: ask what kind first, then
   *  open the wizard on that customer with their name and number fixed. `after`
   *  carries what the button adds on top (the last design, an old order's
   *  prices). */
  const [orderTypeFor, setOrderTypeFor] = useState(null); // { cust, after }
  const [customerLocked, setCustomerLocked] = useState(false);
  const handleSelectExistingCustomer = (cust, after = null) => setOrderTypeFor({ cust, after });
  const beginOrderForCustomer = (kind) => {
    const { cust, after } = orderTypeFor;
    setOrderTypeFor(null);
    startService(kind, cust, { locked: true });
    after?.();
  };

  /** Customers matching what has been typed so far -- by number once three
   *  digits are in, else by name once three letters are (the counter may know
   *  either first): the five newest, as full rows, because picking one fills
   *  the order form. */
  const matchDigits = customerId ? '' : (customerForm.mobile_number || '').replace(/\D/g, '');
  const matchName = customerId ? '' : customerName.trim();
  const matchBy = matchDigits.length >= 3 ? 'mobile' : matchName.length >= 3 ? 'name' : null;
  const customerLookupTyped = matchDigits.length >= 4 || matchName.length >= 3;
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
  /** The matches, shown under the box being searched by; one picks the customer. */
  const customerMatchList = customerMatches.length > 0 && (
    <div className="wz-matches" role="listbox"
         aria-label={matchBy === 'name' ? t('wizard.matchesByName', 'Customers matching this name') : t('wizard.matches', 'Customers matching this number')}>
      {customerMatches.map((cust) => (
        <button type="button" key={cust.id} className="wz-match" role="option" aria-selected="false" onClick={() => pickCustomer(cust)}>
          <AvatarInitials name={`${cust.first_name} ${cust.last_name}`} size={32} />
          <span style={{ minWidth: 0, flex: 1 }}>
            <span className="wz-match-name">{cust.first_name} {cust.last_name}</span>
            <span className="od-hint" style={{ display: 'block' }}>{formatMobile(cust.mobile_number)}{cust.city_region ? ` · ${cust.city_region}` : ''}</span>
          </span>
          <TierBadge tier={customerTier(cust)} />
        </button>
      ))}
    </div>
  );
  /** Garments we delivered to the chosen customer: the only ones an alteration can name. */
  const alterCandidates = React.useMemo(() => {
    if (!customerId) return [];
    return ordersList
      .filter(o => String(o.customer) === String(customerId) && o.order_status === 'Delivered')
      .flatMap(order => (order.garment_jobs || []).map(job => ({ order, job })));
  }, [ordersList, customerId]);
  /** The garment the alteration is for: the one picked, or the only one there is. */
  const alterPick = alterCandidates.find(c => c.job.id === alterationForm.garmentJobId)
    || (alterCandidates.length === 1 ? alterCandidates[0] : null);

  /** Closing the wizard keeps the order: a draft is saved first when there is one to save. */
  const leaveWizard = async () => {
    if (serviceType !== 'alter' && (garmentJobs.length || customerForm.mobile_number)) {
      try { await persistDraft(); } catch { /* the draft stays as it was */ }
    }
    setView('dashboard');
  };

  
  const canJumpAhead = serviceType !== 'alter';
  const jumpToStep = (n) => {
    if (n === currentStep || (n > maxStepReached && !canJumpAhead)) return;
    if (wizardStepKey === 'measure') rememberMeasurements();
    if (wizardSteps[n - 1]?.key === 'measure') prefillMeasurements();
    reachStep(n);
  };
  const wizardSteps = (serviceType === 'alter' && alterOutside ? WIZARD_STEPS.alterOutside : WIZARD_STEPS[serviceType])
    || WIZARD_STEPS.stitch;
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
  /** Open a garment's form from its top. */
  const openGarmentAt = (key) => {
    setActiveGarmentKey(key);
    window.scrollTo(0, 0);
  };
  /** "Saree 2" when the order has more than one saree; just "Saree" otherwise. */
  const garmentLabel = (job) => {
    if (job.label) return job.label;
    const name = job.template?.name || job.key;
    const same = garmentJobs.filter(j => j.template?.key === job.template?.key);
    return same.length > 1 ? `${name} ${same.findIndex(j => j.key === job.key) + 1}` : name;
  };
  // Renaming a garment on this order: { key, text } while its name box is open.
  const [renamingGarment, setRenamingGarment] = useState(null);
  const saveGarmentName = () => {
    if (!renamingGarment) return;
    const label = renamingGarment.text.trim().slice(0, 60);
    setGarmentJobs(prev => prev.map(j => (j.key === renamingGarment.key ? { ...j, label } : j)));
    setRenamingGarment(null);
  };
  /** One more of this garment, same design: a follower placed after the
   *  garment and its other followers. Whatever is filled on the garment is
   *  copied to it as the staff go (the effect below); changing the follower
   *  itself makes it its own design. Only this garment: the + on a saree adds
   *  a saree, never its paired blouse or petticoat -- each has its own +. */
  const copyGarment = (key) => {
    const source = garmentJobs.find(job => job.key === key);
    if (!source) return;
    const stamp = Date.now().toString(36);
    const copies = [followerOf(source, `${source.template?.key || source.key}#${stamp}0`, source.pairedWith || null)];
    setGarmentJobs(prev => {
      // After the garment, its followers, and anything paired to any of them.
      const group = new Set([key, ...prev.filter(job => job.sameAs === key).map(job => job.key)]);
      const last = Math.max(...prev.map((job, i) => (group.has(job.key) || group.has(job.pairedWith) ? i : -1)));
      return [...prev.slice(0, last + 1), ...copies, ...prev.slice(last + 1)];
    });
  };
  /** One fewer: the last same-design follower of this garment goes (with any
   *  blouse paired to it). A garment filled in its own way is never removed here. */
  const dropFollower = (key) => {
    const last = [...garmentJobs].reverse().find(job => job.sameAs === key);
    if (last) removeGarment(last.key);
  };
  /** "Another, different design": a fresh one of the same garment. */
  const addAnotherOf = (job) => addGarment(job.template.key, false, true);
  /** Moving off a garment's details checks that garment's required questions. */
  const garmentDetailsOk = () => {
    if (!openGarment || validateGarments({ sections: ['basic', 'style'], only: openGarment.key })) return true;
    alert('Say what this garment needs \u2014 see the highlighted fields.');
    return false;
  };
  /** Whether any garment on the order has a measurement to take right now. */
  const needsMeasurements = () => garmentJobs.some(job =>
    ((job.template?.sections || []).find(sec => sec.key === 'measurements')?.fields || [])
      .some(f => f.field_type !== 'file' && isVisible(f, job.values || {})));
  const handleBack = () => {
    if (wizardStepKey === 'type' && openGarment) {
      const at = garmentJobs.findIndex(job => job.key === openGarment.key);
      if (at > 0) { openGarmentAt(garmentJobs[at - 1].key); return; }
    }
    // Back out of the first step returns to where the order began: the
    // customer's own page (the only start that locks the customer), else
    // the New order chooser.
    if (currentStep <= 1) { setView(customerLocked ? 'dashboard' : 'order-selector'); return; }
    const previous = wizardSteps[currentStep - 2];
    const backTo = previous?.key === 'measure' && !needsMeasurements() && currentStep >= 3 ? wizardSteps[currentStep - 3] : previous;
    // Back into the garments lands on the last one, where Next left it.
    if (backTo?.key === 'type' && garmentJobs.length) {
      setActiveGarmentKey(garmentJobs[garmentJobs.length - 1].key);
    }
    // Measurements is skipped both ways when there is nothing to measure.
    if (previous?.key === 'measure' && !needsMeasurements() && currentStep >= 3) {
      reachStep(currentStep - 2);
    } else {
      reachStep(currentStep - 1);
    }
  };

  /** The saved measurements sheet fills any garment field it already answers. */
  const prefillMeasurements = () => {
    const sheet = customerForm.measurements || {};
    setGarmentJobs(prev => prev.map(job => {
      const own = new Set(((job.template?.sections || []).find(sec => sec.key === 'measurements')?.fields || []).map(f => f.key));
      const values = { ...(job.values || {}) };
      own.forEach((key) => {
        const kept = sheetGet(sheet, MEASURE_KEYS[key] || key);
        if ((values[key] === undefined || values[key] === '') && kept) values[key] = /^\d/.test(String(kept)) ? String(Number(kept)) : kept;
      });
      return { ...job, values };
    }));
  };
  /** Garment measurements go back onto the customer's sheet for next time. */
  const rememberMeasurements = () => {
    const body = { ...(customerForm.measurements || {}) };
    garmentJobs.forEach(job => {
      Object.entries(MEASURE_KEYS).forEach(([key, sheetKey]) => {
        if (job.values?.[key] !== undefined && job.values[key] !== '') sheetSet(body, sheetKey, job.values[key]);
      });
    });
    setCustomerForm(prev => ({ ...prev, measurements: body }));
  };
  /** After the customer: measurements when any is needed, else review. */
  /** After the garment screens: measurements when any is needed, else the extras. */
  const stepAfterGarments = () => {
    const measureIdx = wizardSteps.findIndex(step => step.key === 'measure');
    return measureIdx + (needsMeasurements() ? 1 : 2);
  };

  const submitOrderAndConfirm = async () => {
    setWizardError(null);
    let id = draftId;
    try {
      id = await persistDraft({ step: currentStep });
    } catch (err) {
      setWizardError(
        err.isConflict
          ? 'This order was changed in another tab. Reload it before placing it.'
          : 'Could not save the order before placing it. Nothing has been booked — please try again.');
      return;
    }

    try {
      const order = await api.confirmOrderDraft(id);
      setDraftId(null);
      setDraftVersion(null);
      setDraftSaveState('idle');
      setConfirmedOrder(order);
      setView('confirmed');
      fetchDashboardAndConfig();
    } catch (err) {
      if (err.alreadyPlaced) {
        setWizardError(
          'This order has already been placed. Check Manage Orders — do not place it again.');
        return;
      }
      console.error(err);
      setWizardError(
        (err.message || 'Could not place the order.')
        + ' Nothing was booked, and your order is still saved — you can try again.');
    }
  };
  const actionInFlight = useRef(false);
  const [ctaBusy, setCtaBusy] = useState(false);

  const runOnce = useCallback(async (action) => {
    if (actionInFlight.current) return;
    actionInFlight.current = true;
    setCtaBusy(true);
    try {
      await action();
    } finally {
      actionInFlight.current = false;
      setCtaBusy(false);
    }
  }, []);

  
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

  const createAlterationFromWizard = async () => {
    setWizardError(null);
    const candidate = alterPick;
    if (!candidate) { alert('Pick the garment first.'); return; }
    if (!alterationForm.issue.trim()) { alert('Say what needs changing.'); return; }
    // Every alteration is photographed as it came in (the record of what was
    // already wrong), ours as much as one stitched elsewhere.
    if (!outsidePhoto?.file) { alert('Take a photo of the garment as it came in.'); return; }
    const isPaid = alterationForm.type === 'PAID_CLIENT_REQUEST';
    if (isPaid) {
      const charge = parseFloat(alterationForm.charge || 0);
      const bad = amountError(alterationForm.charge, { label: 'Charge' })
        || amountError(alterationForm.paidNow, { label: 'Paid now', max: charge });
      if (bad) { alert(charge ? bad : 'Enter the charge before recording a payment.'); return; }
    }
    try {
      const created = await api.createAlterationOrder(candidate.order.id, {
        garment_job: candidate.job.id,
        issue: alterationForm.issue.trim(),
        charge: isPaid && alterationForm.charge ? alterationForm.charge : '0',
        paid_now: isPaid && alterationForm.paidNow ? alterationForm.paidNow : '0',
      });
      try { await api.uploadGarmentImage(created.id, 'FRONT', outsidePhoto.file); }
      catch (err) { alert(`Taken in, but the photo could not be saved: ${err.message}`); }
      setView('dashboard');
      openAlteration(created.id);
    } catch (err) {
      setWizardError(err.message || 'Could not create the alteration.');
    }
  };

  /** Take in a garment stitched elsewhere: a walk-in customer is added first,
   *  then the alteration order, then its photo as it arrived. */
  const createOutsideAlterationFromWizard = async () => {
    setWizardError(null);
    const f = outsideForm;
    const scale = { SMALL: 'Small job: a quick fix', BIG: 'Big job: more work, more time' }[f.scale];
    const template = garmentTemplates.find((tpl) => String(tpl.id) === String(f.templateId));
    // The order keeps one line for what is wrong; the rest of the form rides
    // along in it rather than being dropped (there is no field for the size).
    const issue = [
      f.request.trim(), f.adjustments.trim(),
      template && f.note.trim() ? `Garment: ${f.note.trim()}` : '',
      scale, f.notes.trim(),
    ].filter(Boolean).join('\n');
    if (!f.request.trim() && !f.adjustments.trim()) { alert('Say what needs changing.'); return; }
    if (!outsidePhoto?.file) { alert('Take a photo of the garment as it came in.'); return; }
    const charge = parseFloat(f.charge || 0);
    const bad = amountError(f.charge, { label: 'Charge' })
      || amountError(f.paidNow, { label: 'Paid now', max: charge });
    if (bad) { alert(charge ? bad : 'Enter the charge before recording a payment.'); return; }
    try {
      let customer = customerId;
      if (!customer) {
        const row = await api.createCustomer({
          first_name: customerForm.first_name.trim(), last_name: (customerForm.last_name || '').trim(),
          mobile_number: customerForm.mobile_number, source: 'Walk In',
        });
        customer = row.id;
        // A retry after a failure below must not add the customer twice.
        setCustomerId(row.id);
      }
      const created = await api.createOutsideAlterationOrder({
        customer,
        garment_name: (template?.name || f.note.trim()).slice(0, 100),
        issue,
        charge: f.charge || '0',
        paid_now: f.paidNow || '0',
      });
      if (outsidePhoto?.file) {
        try { await api.uploadGarmentImage(created.id, 'FRONT', outsidePhoto.file); }
        catch (err) { alert(`Taken in, but the photo could not be saved: ${err.message}`); }
      }
      setView('dashboard');
      rememberAlteration(created);
      openAlteration(created.id);
    } catch (err) {
      setWizardError(err.message || 'Could not take the garment in.');
    }
  };

  /** What is wrong with the customer details, or '' when they will do. */
  const customerProblem = () => {
    const mobileBad = mobileError(customerForm.mobile_number);
    if (mobileBad) return mobileBad;
    if (serviceType === 'alter' && !alterOutside) {
      if (!customerId) return 'Pick the customer from the list. For a garment stitched elsewhere, choose \u201cStitched elsewhere\u201d.';
    } else {
      
      const nameBad = customerId ? '' : nameError(customerForm.first_name, { label: 'Customer name' });
      if (nameBad || customerForm.first_name.trim().length < 2) {
        return nameBad || 'Enter the customer\u2019s name (at least 2 letters).';
      }
    }
    const emailBad = emailError(customerForm.email_address);
    return emailBad ? `${emailBad} Or leave it blank.` : '';
  };
  /** Nothing typed or picked yet: an order may go on and come back for the customer. */
  const customerBlank = () => !customerId && !customerForm.first_name?.trim()
    && !String(customerForm.mobile_number || '').trim();

  const performNext = async () => {
    try {
      if (wizardStepKey === 'who') {
        
        const skip = serviceType !== 'alter' && customerBlank();
        const problem = skip ? '' : customerProblem();
        if (problem) { alert(problem); return; }
        if (serviceType === 'alter') { reachStep(currentStep + 1); return; }
        await persistDraft({ step: currentStep + 1 });
        reachStep(currentStep + 1);
      } else if (wizardStepKey === 'type') {
        if (garmentJobs.length === 0 || !openGarment) { alert('Add at least one garment to this order.'); return; }
        const key = openGarment.key;
        if (!garmentDetailsOk()) return;
        // This garment done: on to the next one not yet moved past, if any.
        const done = [...new Set([...garmentsDone, key])];
        setGarmentsDone(done);
        const at = garmentJobs.findIndex(job => job.key === key);
        const next = [...garmentJobs.slice(at + 1), ...garmentJobs.slice(0, at)].find(job => !done.includes(job.key));
        if (next) {
          openGarmentAt(next.key);
          await persistDraft({ cursor: { garment: next.key, done } });
          return;
        }
        // Every garment once more, in case one was reached by its circle.
        if (!validateGarments({ sections: ['basic', 'style'] })) {
          alert('Say what each garment needs \u2014 see the highlighted fields.');
          return;
        }
        if (serviceType === 'design' && !designerChoice) {
          alert('Pick the designer.');
          document.getElementById('wz-designer')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return;
        }
        const target = stepAfterGarments();
        await persistDraft({ step: target });
        if (wizardSteps[target - 1]?.key === 'measure') prefillMeasurements();
        reachStep(target);
      } else if (wizardStepKey === 'measure') {
        if (!validateGarments({ sections: ['measurements'] })) {
          alert('Some measurements are missing or invalid \u2014 see the highlighted fields.');
          return;
        }
        rememberMeasurements();
        await persistDraft({ step: currentStep + 1 });
        reachStep(currentStep + 1);
      } else if (wizardStepKey === 'review') {
        await persistDraft({ step: currentStep + 1 });
        reachStep(currentStep + 1);
      } else if (wizardStepKey === 'money') {
        if (garmentJobs.length === 0) { alert('Add at least one garment to this order.'); reachStep(wizardSteps.findIndex(st => st.key === 'type') + 1); return; }
        const customerBad = customerProblem();
        if (customerBad) {
          alert(`Fill in the customer details before completing the order. ${customerBad}`);
          reachStep(wizardSteps.findIndex(st => st.key === 'who') + 1);
          return;
        }
        // The step bar can jump past Measurements, so they are checked here too.
        if (needsMeasurements() && !validateGarments({ sections: ['measurements'] })) {
          alert('Some measurements are missing or invalid — see the highlighted fields.');
          jumpToStep(wizardSteps.findIndex(st => st.key === 'measure') + 1);
          return;
        }
        if (!readyBy) { alert('Pick the ready-by date.'); return; }
        // "More details" sits on this screen: a typed value is still checked.
        if (!validateGarments({ sections: ['basic', 'style'] })) {
          alert('Something under More details is not valid — see the highlighted fields.');
          return;
        }
        if (isPastDate(readyBy)) { alert('The ready-by date cannot be in the past.'); return; }
        if (garmentJobs.some(j => j.values?.trial_date && j.values.trial_date > readyBy)) {
          alert('The trial date must be on or before the ready-by date.');
          return;
        }
        
        const goods = getSubtotal() + parseFloat(quotePrices.discount || 0);
        if (!quotePrices.price_later && parseFloat(quotePrices.discount || 0) > goods) {
          setQuotePrices({ ...quotePrices, discount: String(goods) });
          alert(`The discount cannot be more than the order subtotal, so it was set to ${inr(goods)}.`);
          return;
        }
        const total = getTotalPrice();
        if (!quotePrices.price_later && Number(advancePaymentAmount || 0) > total) {
          setAdvancePaymentAmount(String(total));
          alert(`The advance cannot be more than the order total, so it was set to ${inr(total)}.`);
          return;
        }
        await submitOrderAndConfirm();
      } else if (wizardStepKey === 'garment') {
        if (!alterPick) { alert('Pick the garment.'); return; }
        reachStep(currentStep + 1);
      } else if (wizardStepKey === 'issue') {
        await createAlterationFromWizard();
      } else if (wizardStepKey === 'outGarment') {
        if (!outsideForm.templateId && !outsideForm.note.trim()) {
          alert('Say what the garment is: pick a garment type or describe it.'); return;
        }
        if (!outsidePhoto?.file) { alert('Take a photo of the garment as it came in.'); return; }
        reachStep(currentStep + 1);
      } else if (wizardStepKey === 'outIssue') {
        await createOutsideAlterationFromWizard();
      }
    } catch (err) {
      console.error("Step execution failed", err);
      alert("Failed to proceed: " + err.message);
    }
  };

  /** Save for later: the draft as it stands, unvalidated, then the dashboard. */
  const performSaveDraft = async () => {
    try {
      await persistDraft();
      setView('dashboard');
      fetchDashboardAndConfig();
    } catch (err) {
      console.error(err);
      alert("Failed to save draft.");
    }
  };

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

  const handleNext = () => runOnce(performNext);
  const handleSaveDraft = () => runOnce(performSaveDraft);

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
  // The appointment dialog's date field, so Done can dismiss the calendar.
  const appointmentDateRef = useRef(null);
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

  const PRICING_FIELDS = [
    ['base', 'Base price'], ['fabric', 'Fabric'], ['embroidery', 'Embroidery & work'],
    ['customization', 'Customization'], ['tailoring', 'Tailoring'],
  ];
  
  const EXTRA_CHARGES = [
    ['backing', 'Backing', (v) => v.backing === 'with_backing'],
    ['border', 'Border', (v) => v.border === 'with_border'],
    ['fall', 'Fall', (v) => ['fall', 'fall_pico'].some(s => (v.services || []).includes(s))],
    ['pico', 'Pico', (v) => ['pico', 'fall_pico'].some(s => (v.services || []).includes(s))],
    ['hand_work', 'Maggam / hand work', (v) => Boolean(v.hand_work) && v.hand_work !== 'none'],
  ];
  // Any garment asking for hand work puts the order on the maggam path.
  const isMaggamOrder = () => garmentJobs.some(j => j.values?.hand_work && j.values.hand_work !== 'none');
  const jobExtras = (job) => EXTRA_CHARGES.filter(([, , applies]) => applies(job.values || {}));
  
  const jobMaterialCharges = (job) => {
    const picked = Object.entries(job.fabrics || {}).flatMap(([slot, ids]) =>
      [...new Set((ids || []).map(String))].map((id) => ({ slot, id, quantity: job.fabric_qty?.[`${slot}:${id}`], editable: true })));
    const pickedIds = new Set(picked.map((line) => line.id));
    const fromTemplate = garmentMaterialLines(job)
      .filter((line) => line.source === 'STORE' && line.inventory_item && Number(line.quantity) > 0
        && !pickedIds.has(String(line.inventory_item)))
      .map((line) => ({ slot: line.field_key, id: String(line.inventory_item), quantity: line.quantity, editable: false }));
    return [...picked, ...fromTemplate].map(({ slot, id, quantity, editable }) => {
      const item = fabrics.find((f) => String(f.id) === id);
      const amountOf = Number(quantity) || 0;
      const rate = Number(item?.selling_price || 0);
      return { key: `${slot}:${id}`, slot, id, item, quantity: quantity ?? '', editable, rate,
               amount: Math.round(rate * amountOf * 100) / 100 };
    });
  };
  const jobMaterialsTotal = (job) => jobMaterialCharges(job).reduce((sum, line) => sum + line.amount, 0);
  const jobSubtotal = (job) =>
    PRICING_FIELDS.reduce((sum, [key]) => sum + (key === 'fabric' ? jobMaterialsTotal(job) : parseFloat(job.pricing?.[key] || 0)), 0)
    + jobExtras(job).reduce((sum, [key]) => sum + parseFloat(job.pricing?.extras?.[key] || 0), 0);
  const setJobPrice = (jobKey, field, value) => {
    setGarmentJobs(prev => prev.map(job => job.key === jobKey
      ? { ...job, pricing: { ...(job.pricing || {}), [field]: value } }
      : job));
  };
  const setJobExtra = (jobKey, key, value) => {
    setGarmentJobs(prev => prev.map(job => job.key === jobKey
      ? { ...job, pricing: { ...(job.pricing || {}), extras: { ...(job.pricing?.extras || {}), [key]: value } } }
      : job));
  };

  const getSubtotal = () => {
    const garments = garmentJobs.reduce((sum, job) => sum + jobSubtotal(job), 0);
    const packaging = parseFloat(quotePrices.packaging || 0);
    const discount = parseFloat(quotePrices.discount || 0);
    return garments + packaging - discount;
  };

  // The same sum the server makes (domains/orders/pricing.py gst_amount).
  const getTaxes = () => {
    const value = parseFloat(quotePrices.gst_value || 0);
    if (!(value > 0)) return 0;
    return quotePrices.gst_mode === 'amount' ? value : (getSubtotal() * value) / 100;
  };

  const getTotalPrice = () => {
    return getSubtotal() + getTaxes();
  };

  
  const partSelection = React.useMemo(
    () => Object.fromEntries(garmentJobs.map(job => [job.key, job.design?.parts || {}])),
    [garmentJobs]);

  const handlePartSelection = (garmentKey, next) => {
    setGarmentJobs(prev => prev.map(job => job.key === garmentKey
      ? { ...job, design: { ...(job.design || {}), parts: next } }
      : job));
  };

  const [fabricColorQuery, setFabricColorQuery] = useState('');
  const fabricSelection = React.useMemo(
    () => Object.fromEntries(garmentJobs.map(job => [job.key, job.fabrics || {}])),
    [garmentJobs]);

  const handleFabricSelection = (garmentKey, next) => {
    setGarmentJobs(prev => prev.map(job => job.key === garmentKey
      ? { ...job, fabrics: next }
      : job));
  };

      
  const [reviewView, setReviewView] = useState(null);       

  const handleFabricQuantity = (garmentKey, slot, fabricId, quantity) => {
    setGarmentJobs(prev => prev.map(job => job.key === garmentKey
      ? { ...job, fabric_qty: { ...(job.fabric_qty || {}), [`${slot}:${fabricId}`]: quantity } }
      : job));
  };

  const colourFilteredFabrics = React.useMemo(() => {
    const q = fabricColorQuery.trim().toLowerCase();
    if (!q) return fabrics;
    return fabrics.filter(f => fabricMatchesColour(f, q));
  }, [fabrics, fabricColorQuery]);

  
  const partReferences = React.useMemo(
    () => Object.fromEntries(garmentJobs.map(job => [job.key, job.design?.part_refs || {}])),
    [garmentJobs]);

  const handlePartReferences = (garmentKey, next) => {
    setGarmentJobs(prev => prev.map(job => job.key === garmentKey
      ? { ...job, design: { ...(job.design || {}), part_refs: next } }
      : job));
  };

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

  
  // A photo added straight from the customer's profile header.
  const [customerPhotoBusy, setCustomerPhotoBusy] = useState(false);
  const uploadDirectoryCustomerPhoto = async (cust, file) => {
    if (!file || customerPhotoBusy) return;
    const bad = imageFilesError([file]);
    if (bad) { alert(bad); return; }
    setCustomerPhotoBusy(true);
    try {
      const row = await api.uploadCustomerPhoto(cust.id, file);
      setSelectedDirectoryCustomer((current) =>
        current && current.id === cust.id ? { ...current, profile_photo: row.profile_photo } : current);
      // The page already loaded shows it too, without a reload.
      setCustomerDirectory((d) => (d.data ? {
        ...d,
        data: {
          ...d.data,
          results: d.data.results.map((x) => (x.id === cust.id ? { ...x, profile_photo: row.profile_photo } : x)),
        },
      } : d));
    } catch (err) {
      alert(err.message);
    } finally {
      setCustomerPhotoBusy(false);
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

  const eligibleStaffForStage = (stageKey) => {
    // Hemming & finishing goes only to the Hemming & Pressing Staff.
    const only = ASSIGN_ONLY_TO[stageKey];
    if (only) return tailors.filter(t => only.includes(t.role));
    const stageConf = (boutiqueSettings?.workflow_config || []).find(s => s.key === stageKey);
    const allowed = stageConf?.roles || [];
    if (allowed.length === 0) return tailors;
    const pool = allowed.includes('Designer') ? [...tailors, ...designerStaff] : tailors;
    return pool.filter(t => allowed.includes(t.role));
  };

  const handleApproveDesign = async (prefId, fallbackImage) => {
    if (!selectedDirectoryCustomer) return;
    setApprovingDesignId(prefId);
    try {
      await api.approveDesign(selectedDirectoryCustomer.id, prefId, fallbackImage);
      const full = await api.getCustomer(selectedDirectoryCustomer.id);
      setSelectedDirectoryCustomer(current =>
        current && current.id === full.id ? full : current
      );
    } catch (err) {
      alert(err.message || 'Could not approve this design.');
    } finally {
      setApprovingDesignId(null);
    }
  };

  const handleAssignStage = async (orderId, stageKey, tailorId, garmentJob = null) => {
    setAssigningStageKey(stageKey);
    try {
      const updated = await api.assignStage(orderId, stageKey, tailorId || null, garmentJob);
      // The open stage sheet reads this, so the picker keeps the new name.
      setSelectedStageObj((cur) => (cur && cur.id === updated?.id ? updated : cur));
      await fetchDashboardAndConfig();
    } catch (err) {
      alert(err.message || 'Could not assign this stage.');
    } finally {
      setAssigningStageKey(null);
    }
  };

  
  // The Customers (or Leads) page: the server filters, sorts, counts and pages
  // the book (domains/customers/directory.py) and sends back one page with the
  // counts the stat cards, chips and filter menus show. Leads are portal
  // sign-ups nobody has contacted or taken an order for yet.
  const isLead = (c) => !!c.is_lead && !((c.order_count ?? c.orders?.length ?? 0) > 0);
  const customerPageKey = `${customerView}|${searchQuery}|${customerFilters.tier || ''}|${customerPageSize}|${JSON.stringify(customerFilters)}`;
  const customerPage = customerPageAt.key === customerPageKey ? customerPageAt.page : 1;
  const onCustomerBook = dashboardTab === 'customers' || dashboardTab === 'leads';
  const directoryParams = React.useMemo(() => ({
    view: customerView,
    search: directorySearch.trim(),
    tier: customerFilters.tier || '',
    ...customerFilters,
    page: customerPage,
    page_size: customerPageSize,
  }), [customerView, directorySearch, customerFilters, customerPage, customerPageSize]);
  // Which question the page on screen answers; a newer one makes it "loading".
  const directoryKey = `${JSON.stringify(directoryParams)}|${directoryVersion}`;
  useEffect(() => {
    if (!onCustomerBook || !currentUser) return undefined;
    let cancelled = false;
    api.getCustomerDirectory(directoryParams)
      .then((data) => {
        if (!cancelled) setCustomerDirectory({ key: directoryKey, forView: directoryParams.view, data, error: false });
      })
      .catch(() => { if (!cancelled) setCustomerDirectory((d) => ({ ...d, key: directoryKey, error: true })); });
    return () => { cancelled = true; };
  }, [onCustomerBook, currentUser, directoryParams, directoryKey]);
  const directoryLoading = onCustomerBook && customerDirectory.key !== directoryKey;
  /** After a customer is added elsewhere: the totals and the open page again. */
  const refreshCustomerBook = () => {
    api.getCustomerStats().then(setCustomerStats).catch(() => {});
    setDirectoryVersion((v) => v + 1);
  };
  // What another view (customers vs leads) answered is not shown for this one.
  const directoryData = customerDirectory.forView === customerView ? customerDirectory.data : null;
  const bookSummary = directoryData?.summary || { total: 0, with_orders: 0, new_this_month: 0, tiers: NO_TIERS };
  const directoryCount = directoryData?.count || 0;
  const pagedCustomers = directoryData?.results || [];
  const customerPageNow = directoryData?.page || 1;
  const customerPageCount = directoryData?.page_count || 1;
  const customerPageFrom = (customerPageNow - 1) * (directoryData?.page_size || customerPageSize);
  const bookTotal = customerStats?.total ?? 0;
  const bookTiers = customerStats?.tiers || NO_TIERS;
  const goToCustomerPage = (n) => {
    setCustomerPageAt({ key: customerPageKey, page: n });
    document.querySelector('.customers-list-container')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };

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

  /** Whether the owner handed this user `task` as Admin (core/admin_access.py). */
  const adminCan = (task) => (currentUser?.admin_tasks || []).includes(task);
  const isOwnerUser = !currentUser?.role || currentUser.role === 'Owner';
  const canAddCustomer = isOwnerUser || adminCan('customers.add');
  const canEditCustomer = isOwnerUser || adminCan('customers.edit');
  const canDeleteCustomer = isOwnerUser || adminCan('customers.delete');
  const canImportCustomers = isOwnerUser || adminCan('customers.import');
  const guideCustomers = !loading && canAddCustomer && bookTotal < 10;
  const guideOrders = !loading && ordersList.length < 10;
  
  const sidebarHint = {
    ...(guideCustomers && dashboardTab !== 'customers' ? { customers: t('onboard.sidebarCustomers', 'Add new customers') } : {}),
    ...(guideOrders && dashboardTab !== 'orders' ? { orders: ordersList.length ? t('onboard.sidebarOrders', 'Create orders here') : t('onboard.sidebarFirstOrder', 'Create your first order') } : {}),
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

      {view === 'find' && (
        <div className="auth-page auth-split" style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--shell-bg)', padding: '88px 16px 40px' }}>
          <AuthShowcase kind="find" />
          <button
            onClick={() => { setFindError(null); setView('signup'); }}
            style={{ position: 'absolute', top: '30px', left: '5%', display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--surface-color)', border: '1px solid var(--border-color)', padding: '10px 18px', borderRadius: '99px', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: '600', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}
          >
            <ArrowLeft size={16} />
            Back
          </button>

          <img className="portal-wordmark portal-wordmark--auth" src="/scaleezy-wordmark-dark.webp" alt="Scaleezy" />
          <div className="auth-logo-sub" style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '32px' }}>YOUR VISION. OUR CRAFT.</div>

          <div className="auth-card" style={{ maxWidth: '420px', width: '100%', background: 'var(--surface-color)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: 'clamp(20px, 6vw, 40px)', boxShadow: '0 8px 30px rgba(0,0,0,0.02)' }}>
            <h2 className="auth-title" style={{ fontSize: '24px', color: 'var(--text-primary)', fontWeight: 600, margin: '0 0 8px 0' }}>Find your boutique</h2>
            <p className="auth-subtitle" style={{ fontSize: '13.5px', color: 'var(--text-secondary)', margin: '0 0 28px 0' }}>Every boutique signs in at its own address. Type your boutique's name and we will take you there.</p>

            <form onSubmit={handleFindSubmit} className="auth-form" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label className="form-label" style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Boutique name or address</label>
                <div className="auth-slug-box" style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden' }}>
                  <span style={{ padding: '12px 0 12px 14px', fontSize: '14px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{window.location.host}/</span>
                  <input
                    type="text"
                    placeholder="saralaboutique"
                    value={findSlug}
                    onChange={(e) => { setFindSlug(e.target.value); setFindError(null); }}
                    onBlur={() => setFindSlug((raw) => slugFromTyped(raw) || raw)}
                    style={{ flex: 1, minWidth: 0, padding: '12px 14px 12px 2px', fontSize: '14px', border: 'none', outline: 'none', background: 'transparent', color: 'var(--text-primary)' }}
                    autoFocus
                    required
                  />
                </div>
                {findSlug.trim() && slugFromTyped(findSlug) && (
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    Goes to {window.location.host}/{slugFromTyped(findSlug)}
                  </span>
                )}
              </div>

              {findError && (
                <div role="alert" style={{ fontSize: '13px', color: '#b42318', background: 'rgba(180,35,24,0.07)', padding: '10px 12px', borderRadius: '8px' }}>
                  {findError}
                </div>
              )}

              <button type="submit" className="btn-primary" disabled={findBusy} style={{ width: '100%' }}>
                {findBusy ? 'Checking…' : 'Go to my boutique'}
              </button>
            </form>

            <div className="auth-card-footer" style={{ borderTop: '1px solid var(--border-color)', marginTop: '32px', paddingTop: '20px', textAlign: 'center', fontSize: '13.5px', color: 'var(--text-secondary)' }}>
              Don't have a boutique yet?{' '}
              <a href="#" style={{ color: 'var(--accent-text, #b07c40)', fontWeight: 600, textDecoration: 'none' }}
                 onClick={(e) => { e.preventDefault(); setFindError(null); setView('signup'); }}>
                Request access
              </a>
            </div>
          </div>
        </div>
      )}

      {boutiqueNotFound && view !== 'find' && (
        <div className="auth-page auth-split" style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--shell-bg)', padding: '88px 16px 40px' }}>
          <AuthShowcase kind="notfound" />
          <img className="portal-wordmark portal-wordmark--auth" src="/scaleezy-wordmark-dark.webp" alt="Scaleezy" />
          <div className="auth-logo-sub" style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '32px' }}>YOUR VISION. OUR CRAFT.</div>

          <div className="auth-card" style={{ maxWidth: '420px', width: '100%', background: 'var(--surface-color)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: 'clamp(20px, 6vw, 40px)', boxShadow: '0 8px 30px rgba(0,0,0,0.02)', textAlign: 'center' }}>
            <h2 className="auth-title" style={{ fontSize: '24px', color: 'var(--text-primary)', fontWeight: 600, margin: '0 0 8px 0' }}>Boutique not found</h2>
            <p className="auth-subtitle" style={{ fontSize: '13.5px', color: 'var(--text-secondary)', margin: '0 0 28px 0' }}>
              No active boutique uses the address <strong>/{portalSlug}</strong>. Check the spelling with your boutique, or create a new one.
            </p>
            <button type="button" className="btn-primary" style={{ width: '100%' }}
                    onClick={() => { setFindSlug(portalSlug); setFindError(null); setView('find'); }}>
              Try another address
            </button>
            <div className="auth-card-footer" style={{ borderTop: '1px solid var(--border-color)', marginTop: '28px', paddingTop: '20px', fontSize: '13.5px', color: 'var(--text-secondary)' }}>
              <a href="/app?register" style={{ color: 'var(--accent-text, #b07c40)', fontWeight: 600, textDecoration: 'none' }}>Request access</a>
              {' · '}
              <a href="/" style={{ color: 'var(--accent-text, #b07c40)', fontWeight: 600, textDecoration: 'none' }}>Back to Home</a>
            </div>
          </div>
        </div>
      )}

      {view === 'login' && !boutiqueNotFound && (
        <div className="auth-page auth-split" style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--shell-bg)', padding: '76px 16px 20px' }}>
          <AuthShowcase kind="login" />
          
          {/* Back to Home Button */}
          <button 
            onClick={() => { window.location.href = '/'; }}
            style={{
              position: 'absolute',
              top: '30px',
              left: '5%',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: 'var(--surface-color)',
              border: '1px solid var(--border-color)',
              padding: '10px 18px',
              borderRadius: '99px',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              fontSize: '13px',
              fontWeight: '600',
              boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
              transition: 'all 0.2s ease'
            }}
            onMouseOver={(e) => { e.currentTarget.style.borderColor = 'var(--accent-text, #b07c40)'; e.currentTarget.style.color = 'var(--accent-text, #b07c40)'; }}
            onMouseOut={(e) => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
          >
            <ArrowLeft size={16} />
            Back to Home
          </button>

          <img className="portal-wordmark portal-wordmark--auth" src="/scaleezy-wordmark-dark.webp" alt="Scaleezy" />
          <div className="auth-logo-sub" style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '18px' }}>YOUR VISION. OUR CRAFT.</div>

          <div className="auth-card" style={{ maxWidth: '420px', width: '100%', background: 'var(--surface-color)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: 'clamp(20px, 5vw, 32px)', gap: '16px', boxShadow: '0 8px 30px rgba(0,0,0,0.02)' }}>
            <h2 className="auth-title" style={{ fontSize: '24px', color: 'var(--text-primary)', fontWeight: 600, margin: 0 }}>{justRegistered ? 'Your boutique is ready 🎉' : 'Welcome back 👋'}</h2>
            <p className="auth-subtitle" style={{ fontSize: '13.5px', color: 'var(--text-secondary)', margin: '-8px 0 8px 0' }}>{justRegistered ? 'Sign in with the email and password you just created.' : 'Log in to your workspace.'}</p>
            
            <form onSubmit={handleLoginSubmit} className="auth-form" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label className="form-label" style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Email</label>
                <div className="input-wrapper" style={{ position: 'relative' }}>
                  <Mail size={16} className="input-icon-left" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input 
                    type="text" 
                    placeholder="Enter your email"
                    value={loginEmail}
                    readOnly={!loginUnlocked}
                    onPointerDown={unlockLogin}
                    onFocus={unlockLogin}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    style={{ width: '100%', padding: '12px 14px 12px 42px', fontSize: '14px', borderRadius: '8px', border: '1px solid var(--border-color)', outline: 'none' }}
                    required
                  />
                </div>
              </div>

              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label className="form-label" style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Password</label>
                <div className="input-wrapper" style={{ position: 'relative' }}>
                  <Lock size={16} className="input-icon-left" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input 
                    type={showLoginPassword ? "text" : "password"} 
                    placeholder="Enter your password"
                    value={loginPassword}
                    readOnly={!loginUnlocked}
                    onPointerDown={unlockLogin}
                    onFocus={unlockLogin}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    style={{ width: '100%', padding: '12px 40px 12px 42px', fontSize: '14px', borderRadius: '8px', border: '1px solid var(--border-color)', outline: 'none' }}
                    required
                  />
                  <button 
                    type="button"
                    style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
                    onClick={() => setShowLoginPassword(!showLoginPassword)}
                  >
                    {showLoginPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div className="auth-remember-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', margin: '6px 0 10px 0' }}>
                <span />
                <button
                  type="button"
                  className="forgot-password-link"
                  onClick={() => { setResetEmail(loginEmail); setResetSent(false); setAuthError(null); setView('forgot'); }}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--accent-text, #b07c40)', fontWeight: 600, fontSize: '13px', whiteSpace: 'nowrap' }}
                >
                  Forgot password?
                </button>
              </div>

              {authError && (
                <div role="alert" style={{ background: '#fdf2f2', border: '1px solid #f5c6c6', color: '#8a2020', borderRadius: '8px', padding: '10px 12px', fontSize: '13px' }}>
                  {authError}
                </div>
              )}

              <button type="submit" className="btn-primary" disabled={authBusy} style={{ justifyContent: 'center', padding: '14px', borderRadius: '8px', fontWeight: 600, fontSize: '14px', opacity: authBusy ? 0.6 : 1, cursor: authBusy ? 'wait' : 'pointer' }}>
                {authBusy ? 'Signing in…' : 'Login to Workspace'}
              </button>
            </form>

            <div className="auth-card-footer" style={{ borderTop: '1px solid var(--border-color)', marginTop: '4px', paddingTop: '16px', textAlign: 'center', fontSize: '13.5px', color: 'var(--text-secondary)' }}>
              Don't have a boutique account?{' '}
              <a href="/app?register" style={{ color: 'var(--accent-text, #b07c40)', fontWeight: 600, textDecoration: 'none' }}>
                Request access
              </a>
            </div>
          </div>
        </div>
      )}

      {/* 3. SIGN UP SCREEN (Image 3) */}
      {/* Ask for a reset link. Reached from the login screen; leaves back to
          it. Nothing here reveals whether the address is one we know. */}
      {view === 'forgot' && (
        <div className="auth-page auth-split" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--shell-bg)', padding: '88px 16px 40px' }}>
          <AuthShowcase kind="help" />
          <div className="auth-card" style={{ background: 'var(--surface-color)', border: '1px solid var(--border-color)', borderRadius: '14px', padding: 'clamp(20px, 6vw, 36px)', width: '100%', maxWidth: '420px', boxShadow: '0 4px 20px rgba(0,0,0,0.04)' }}>
            <h2 style={{ margin: '0 0 8px 0', fontSize: '22px' }}>Reset your password</h2>

            {resetSent ? (
              <>
                <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: 1.6 }}>
                  If <strong>{resetEmail}</strong> has an account, a reset link is on its way.
                  It stops working in an hour. Check your spam folder if it has not arrived
                  in a few minutes.
                </p>
                <button type="button" className="btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '13px', borderRadius: '8px', fontWeight: 600 }} onClick={() => { setResetSent(false); setView('login'); }}>
                  Back to sign in
                </button>
              </>
            ) : (
              <form onSubmit={handleForgotSubmit}>
                <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: 1.6, marginTop: 0 }}>
                  Enter the email address you sign in with and we will send you a link to
                  choose a new password.
                </p>
                <input
                  type="email"
                  autoFocus
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  placeholder="you@yourboutique.com"
                  style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '14px', marginBottom: '12px', boxSizing: 'border-box' }}
                />
                {authError && (
                  <div role="alert" style={{ background: '#fdf2f2', border: '1px solid #f5c6c6', color: '#8a2020', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', marginBottom: '12px' }}>
                    {authError}
                  </div>
                )}
                <button type="submit" className="btn-primary" disabled={authBusy} style={{ width: '100%', justifyContent: 'center', padding: '13px', borderRadius: '8px', fontWeight: 600, opacity: authBusy ? 0.6 : 1, cursor: authBusy ? 'wait' : 'pointer' }}>
                  {authBusy ? 'Sending…' : 'Send reset link'}
                </button>
                <button type="button" onClick={() => { setAuthError(null); setView('login'); }} style={{ width: '100%', marginTop: '10px', background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '13px', cursor: 'pointer' }}>
                  Back to sign in
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Choose the new password. Only reachable by following the emailed
          link, which is what put resetToken in state. */}
      {view === 'reset' && (
        <div className="auth-page auth-split" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--shell-bg)', padding: '88px 16px 40px' }}>
          <AuthShowcase kind="help" />
          <div className="auth-card" style={{ background: 'var(--surface-color)', border: '1px solid var(--border-color)', borderRadius: '14px', padding: 'clamp(20px, 6vw, 36px)', width: '100%', maxWidth: '420px', boxShadow: '0 4px 20px rgba(0,0,0,0.04)' }}>
            <h2 style={{ margin: '0 0 8px 0', fontSize: '22px' }}>Choose a new password</h2>

            {resetDone ? (
              <>
                <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: 1.6 }}>
                  Your password has been changed, and every device that was signed in to
                  this account has been signed out.
                </p>
                <button type="button" className="btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '13px', borderRadius: '8px', fontWeight: 600 }} onClick={() => { setResetDone(false); setResetToken(null); setView('login'); }}>
                  Sign in
                </button>
              </>
            ) : (
              <form onSubmit={handleResetSubmit}>
                <input
                  type="password"
                  autoFocus
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  minLength={8}
                  placeholder="New password (min 8 characters)"
                  style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '14px', marginBottom: '10px', boxSizing: 'border-box' }}
                />
                <input
                  type="password"
                  value={resetConfirm}
                  onChange={(e) => setResetConfirm(e.target.value)}
                  placeholder="Repeat new password"
                  style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '14px', marginBottom: '12px', boxSizing: 'border-box' }}
                />
                {authError && (
                  <div role="alert" style={{ background: '#fdf2f2', border: '1px solid #f5c6c6', color: '#8a2020', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', marginBottom: '12px', whiteSpace: 'pre-wrap' }}>
                    {authError}
                  </div>
                )}
                <button type="submit" className="btn-primary" disabled={authBusy} style={{ width: '100%', justifyContent: 'center', padding: '13px', borderRadius: '8px', fontWeight: 600, opacity: authBusy ? 0.6 : 1, cursor: authBusy ? 'wait' : 'pointer' }}>
                  {authBusy ? 'Saving…' : 'Change password'}
                </button>
                <button type="button" onClick={() => { setAuthError(null); setResetToken(null); setView('login'); }} style={{ width: '100%', marginTop: '10px', background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '13px', cursor: 'pointer' }}>
                  Back to sign in
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* First sign-in on a boutique the platform team created: the owner
          replaces the temporary password before anything else. The server
          refuses every other request from this account until they do. */}
      {view === 'change-password' && currentUser && (
        <div className="auth-page auth-split" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--shell-bg)', padding: '88px 16px 40px' }}>
          <AuthShowcase kind="password" />
          <img className="portal-wordmark portal-wordmark--auth" src="/scaleezy-wordmark-dark.webp" alt="Scaleezy" />
          <div className="auth-card" style={{ width: '100%', maxWidth: '440px', marginTop: '24px' }}>
            <form onSubmit={handleChangePasswordSubmit} className="auth-form" style={{ gap: '12px' }}>
              <div>
                <h2 className="auth-title" style={{ fontSize: '22px' }}>Choose your password</h2>
                <p className="auth-subtitle" style={{ marginTop: '4px', marginBottom: 0 }}>
                  Welcome{currentUser.first_name ? `, ${currentUser.first_name}` : ''}. You signed in with a temporary
                  password. Choose your own to continue; the temporary one stops working once you save.
                </p>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="change-current">Temporary password</label>
                <input id="change-current" type="password" className="form-control" autoComplete="current-password"
                       value={changeCurrent} onChange={(e) => setChangeCurrent(e.target.value)}
                       placeholder="From your login email" />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="change-new">New password</label>
                <input id="change-new" type="password" className="form-control" autoComplete="new-password" autoFocus
                       value={changeNew} minLength={8} onChange={(e) => setChangeNew(e.target.value)}
                       placeholder="At least 8 characters, not all numbers" />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="change-confirm">Type it again</label>
                <input id="change-confirm" type="password" className="form-control" autoComplete="new-password"
                       value={changeConfirm} onChange={(e) => setChangeConfirm(e.target.value)} />
              </div>
              {authError && (
                <div role="alert" style={{ background: '#fdf2f2', border: '1px solid #f5c6c6', color: '#8a2020', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', whiteSpace: 'pre-wrap' }}>
                  {authError}
                </div>
              )}
              <button type="submit" className="btn-primary" disabled={authBusy || !changeCurrent || !changeNew || !changeConfirm}
                      style={{ justifyContent: 'center' }}>
                {authBusy ? 'Saving…' : 'Save and continue'}
              </button>
              <button type="button" className="btn-secondary" disabled={logoutBusy}
                      onClick={() => { setAuthError(null); handleLogout(); }} style={{ justifyContent: 'center' }}>
                Sign out
              </button>
            </form>
          </div>
        </div>
      )}

      {view === 'signup' && (
        <div className="auth-page auth-page--signup auth-split auth-split--wide" style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--shell-bg)' }}>
          <AuthShowcase kind="signup" />
          
          {/* Back to Home Button */}
          <button 
            onClick={() => { window.location.href = '/'; }}
            style={{
              position: 'absolute',
              top: '30px',
              left: '5%',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: 'var(--surface-color)',
              border: '1px solid var(--border-color)',
              padding: '10px 18px',
              borderRadius: '99px',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              fontSize: '13px',
              fontWeight: '600',
              boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
              transition: 'all 0.2s ease'
            }}
            onMouseOver={(e) => { e.currentTarget.style.borderColor = 'var(--accent-text, #b07c40)'; e.currentTarget.style.color = 'var(--accent-text, #b07c40)'; }}
            onMouseOut={(e) => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
          >
            <ArrowLeft size={16} />
            Back to Home
          </button>

          <img className="portal-wordmark portal-wordmark--auth" src="/scaleezy-wordmark-dark.webp" alt="Scaleezy" />
          <div className="auth-logo-sub" style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '16px' }}>YOUR VISION. OUR CRAFT.</div>

          {/* One card, no steps. It used to be a two-tab wizard (owner on
              tab 1, boutique on tab 2) with a step tracker above it; owners
              lost their place between the tabs. Everything is on one screen
              now, sized to fit a laptop viewport without scrolling. */}
          {signupStep === 1 && <h2 className="auth-title auth-outside-title">Request access</h2>}
          <div className="auth-card auth-card--signup">
            {signupStep === 1 && (
              <form onSubmit={handleSignupSubmit} className="auth-form" style={{ gap: '10px' }}>
                <div>
                  <p className="auth-subtitle" style={{ marginTop: '4px', marginBottom: 0 }}>Tell us about your boutique. Our team reviews every request and emails you your login details.</p>
                </div>

                <div className="signup-section-title"><span className="signup-section-num">1</span>Your boutique</div>
                <div className="form-grid-2 signup-grid">
                  <div className="form-group">
                    <label className="form-label">Boutique name</label>
                    <input
                      type="text"
                      placeholder="e.g. Aditi's Atelier"
                      className="form-control"
                      value={boutiqueName}
                      maxLength={LIMITS.name}
                      onChange={(e) => setBoutiqueName(e.target.value)}
                      required
                      autoFocus
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Boutique address</label>
                    <input
                      type="text"
                      placeholder="Street, area, city, PIN"
                      className="form-control"
                      value={boutiqueAddress}
                      maxLength={LIMITS.address}
                      onChange={(e) => setBoutiqueAddress(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="signup-section-title"><span className="signup-section-num">2</span>About you (the owner)</div>
                <div className="form-grid-2 signup-grid">
                  <div className="form-group">
                    <label className="form-label">First name</label>
                    <input
                      type="text"
                      placeholder="Enter first name"
                      value={signupForm.first_name}
                      maxLength={LIMITS.name}
                      onChange={(e) => setSignupForm({...signupForm, first_name: cleanName(e.target.value)})}
                      required
                      className="form-control"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Last name</label>
                    <input
                      type="text"
                      placeholder="Enter last name"
                      value={signupForm.last_name}
                      maxLength={LIMITS.name}
                      onChange={(e) => setSignupForm({...signupForm, last_name: cleanName(e.target.value)})}
                      required
                      className="form-control"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Email address</label>
                    <input
                      type="email"
                      placeholder="name@example.com"
                      value={signupForm.email_address}
                      maxLength={LIMITS.email}
                      onChange={(e) => setSignupForm({...signupForm, email_address: e.target.value})}
                      onBlur={(e) => setSignupForm({...signupForm, email_address: cleanEmail(e.target.value)})}
                      required
                      className="form-control"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Mobile number</label>
                    <div className="input-wrapper">
                      <span className="input-icon-left" style={{ left: '12px', fontSize: '14px' }}>+91</span>
                      <input
                        type="tel"
                        inputMode="numeric"
                        placeholder="10-digit mobile number"
                        value={signupForm.mobile_number}
                        onChange={(e) => setSignupForm({...signupForm, mobile_number: tenDigits(e.target.value)})}
                        style={{ paddingLeft: '50px' }}
                        required
                      />
                    </div>
                  </div>
                </div>

                {signupError && (
                  <div role="alert" style={{ background: '#fdf2f2', border: '1px solid #f5c6c6', color: '#8a2020', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', whiteSpace: 'pre-wrap' }}>
                    {signupError}
                  </div>
                )}

                <div className="mobile-stack-grid signup-footer">
                  <label className="remember-me-checkbox" style={{ fontSize: '12.5px' }}>
                    <input type="checkbox" checked={signupForm.terms} required onChange={(e) => setSignupForm({...signupForm, terms: e.target.checked})} />
                    {/* Each document opens to be read; clicking its name does not tick the box. */}
                    <span>
                      I agree to the{' '}
                      <button type="button" onClick={(e) => { e.preventDefault(); setLegalDoc('terms'); }} style={legalLink}>Terms & Conditions</button>
                      {' '}and{' '}
                      <button type="button" onClick={(e) => { e.preventDefault(); setLegalDoc('privacy'); }} style={legalLink}>Privacy Policy</button>
                    </span>
                  </label>
                  {legalDoc && (
                    <FormModal icon={ShieldCheck} tone="green" width="720px"
                               title={legalDoc === 'terms' ? 'Terms & Conditions' : 'Privacy Policy'}
                               onClose={() => setLegalDoc(null)}
                               footer={(
                                 <>
                                   <button type="button" className="btn-secondary" onClick={() => setLegalDoc(null)}>Close</button>
                                   <button type="button" className="btn-primary"
                                           onClick={() => { setSignupForm((prev) => ({ ...prev, terms: true })); setLegalDoc(null); }}>
                                     <Check size={16} /> I agree
                                   </button>
                                 </>
                               )}>
                      {(() => {
                        const text = (legalDoc === 'terms' ? TERMS_AND_CONDITIONS : PRIVACY_POLICY).trim();
                        return text ? (
                          <div style={{ fontSize: '13.5px', lineHeight: 1.6, color: 'var(--text-secondary)', maxHeight: '60vh', overflowY: 'auto' }}>
                            {text.split(/\n\s*\n/).map((para, i) => (
                              // "3. Your data belongs to you" on a line of its own is a section heading.
                              /^\d+\.\s/.test(para) && !para.includes('\n')
                                ? <h4 key={i} style={{ margin: '18px 0 6px', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{para}</h4>
                                : <p key={i} style={{ margin: '0 0 12px', whiteSpace: 'pre-line' }}>{para}</p>
                            ))}
                          </div>
                        ) : (
                          <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', margin: 0 }}>
                            The full text will appear here.
                          </p>
                        );
                      })()}
                    </FormModal>
                  )}
                  <button type="button" className="btn-secondary" style={{ justifyContent: 'center' }}
                          onClick={() => setView('login')}>
                    Log in instead
                  </button>
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={!signupReady || signupBusy}
                    title={signupReady ? undefined : (signupForm.terms ? 'Fill every box above to continue' : 'Fill every box above and accept the Terms & Conditions to continue')}
                    style={{ justifyContent: 'center', opacity: signupReady ? 1 : 0.5, cursor: signupReady ? 'pointer' : 'not-allowed' }}
                  >
                    {signupBusy ? 'Sending your request…' : 'Request access'}
                  </button>
                </div>
              </form>
            )}

            {signupStep === 2 && (
              <div style={{ textAlign: 'center', padding: '32px' }}>
                <div className="success-circle" style={{ margin: '0 auto 20px' }}><Check size={36} /></div>
                <h2 className="auth-title">Request received</h2>
                <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  Thank you{signupForm.first_name ? `, ${signupForm.first_name.trim()}` : ''}. Your request is under review.
                  We&apos;ve sent a welcome email to <strong>{signupForm.email_address.trim()}</strong>, and we&apos;ll
                  share your login credentials there very soon.
                </p>
                <button type="button" className="btn-secondary" style={{ marginTop: '12px', justifyContent: 'center' }}
                        onClick={() => { window.location.href = '/'; }}>
                  Back to home
                </button>
              </div>
            )}

            {signupStep === 1 && (
              <div className="auth-card-footer" style={{ borderTop: '1px solid var(--border-color)', marginTop: '24px', paddingTop: '18px', textAlign: 'center', fontSize: '15px', color: 'var(--text-secondary)' }}>
                Already have a boutique?{' '}
                <a href="/app" style={{ color: 'var(--accent-text, #b07c40)', fontWeight: 700, fontSize: '16px', textDecoration: 'none' }}
                   onClick={(e) => { e.preventDefault(); setView('login'); }}>
                  Log in
                </a>
              </div>
            )}
          </div>
        </div>
      )}

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
            {dashboardTab === 'designs' && (
              <>
                <PageHeader
                  title={t('designsPage.title')}
                  subtitle={t('designsPage.subtitle')}
                  actions={(!currentUser?.role || currentUser.role === 'Owner' || adminCan('design.upload')) && (
                      <button className="btn-primary" style={{ padding: '10px 18px' }} onClick={() => setShowDesignUpload(true)}>
                        <Plus size={16} />
                        {t('designsPage.addNewDesign')}
                      </button>
                  )}
                />
                {/* The same upload form the library's "Upload design" button
                    opens; on save the library refreshes through its token. */}
                {showDesignUpload && (
                  <Suspense fallback={<ScreenLoading />}>
                    <DesignUpload
                      onClose={() => setShowDesignUpload(false)}
                      onUploaded={() => {
                        setShowDesignUpload(false);
                        setDesignLibraryToken(t => t + 1);
                        setDesignsView('library');
                        fetchDashboardAndConfig();
                      }}
                    />
                  </Suspense>
                )}

                <div className="design-manager-content">
                  {/* Dashboard first: stats before images, so opening the module
                      answers "how is the library doing" rather than dropping
                      straight into a grid. */}
                  <div className="tabs-header dl-tabs" style={{ marginBottom: '16px' }}>
                    {SHOW_DESIGN_OVERVIEW_TAB && (
                    <button className={`tab-btn ${designsView === 'dashboard' ? 'active' : ''}`}
                            onClick={() => setDesignsView('dashboard')}>
                      {t('designsPage.overviewTab', 'Overview')}
                    </button>
                    )}
                    <button className={`tab-btn ${designsView === 'library' || (!SHOW_DESIGN_OVERVIEW_TAB && designsView === 'dashboard') ? 'active' : ''}`}
                            onClick={() => setDesignsView('library')}>
                      {t('designsPage.boutiqueDesignsTab', 'Boutique designs')}
                    </button>
                    <button className={`tab-btn ${designsView === 'requests' ? 'active' : ''}`}
                            onClick={() => setDesignsView('requests')}>
                      {currentUser?.role === 'Designer' ? t('nav.myWork') : t('nav.designWork')}
                    </button>
                  </div>

                  <Suspense fallback={<div className="content-card"><Loader page /></div>}>
                    {designsView === 'requests' ? (
                      <DesignWork currentUser={currentUser} />
                    ) : designsView === 'dashboard' && SHOW_DESIGN_OVERVIEW_TAB ? (
                      <DesignDashboard
                        onOpenLibrary={() => setDesignsView('library')}
                        canManageDesigners={!currentUser?.role || currentUser.role === 'Owner' || adminCan('team.manage')}
                        shopSlug={currentUser?.shop_slug}
                      />
                    ) : (
                      <DesignLibrary
                        refreshToken={designLibraryToken}
                        canReview={!currentUser?.role || currentUser.role === 'Owner' || adminCan('design.approve')}
                        canStock={!currentUser?.role || currentUser.role === 'Owner' || adminCan('inventory.items')}
                        onOpenRequests={() => setDesignsView('requests')}
                        onOpenDesigners={navTabs.includes('staff') ? () => {
                          setStaffDesignersVisit(sectionVisit + 1);
                          setSectionVisit(n => n + 1);
                          setDashboardTab('staff');
                          window.scrollTo(0, 0);
                        } : null}
                        onUploaded={() => setDesignsView('library')}
                        onEditDesign={(design) => {
                          setEditingDesign({ id: design.id });
                          setDesignForm({
                            name: design.title || '',
                            garment_type: design.garment_type || 'Lehenga',
                            neckline_style: (design.attributes || {}).neckline_style || '',
                            sleeve_style: (design.attributes || {}).sleeve_style || '',
                            image_url: design.image_url || '',
                            is_boutique: design.source === 'catalogue',
                            price: String(design.estimated_price ?? 0),
                            description: design.description || '',
                            catalogue: design.catalogue?.category ? {
                              category: design.catalogue.category,
                              subcategory: design.catalogue.subcategory || undefined,
                              option: design.catalogue.option || undefined,
                            } : {},
                            catalogue_path: design.catalogue?.category ? {
                              category: design.catalogue.category,
                              subcategory: design.catalogue.subcategory || '',
                              option: design.catalogue.option || '',
                            } : null,
                          });
                          setDesignImageFile(null);
                          setShowDesignModal(true);
                        }}
                        onDeleteDesign={(design) => handleDeleteDesign(design.id)}
                      />
                    )}
                  </Suspense>
                </div>
              </>
            )}

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
          {showAppointmentModal && (
            <div className="existing-customer-search-modal apt-modal" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}>
              <div className="search-modal-card apt-card">
                <div className="search-modal-header apt-head">
                  <h3>
                    {editingAppointment
                      ? t('dashboard.appointmentDetails', 'Appointment Details')
                      : t('dashboard.bookAppointment', 'Book an Appointment')}
                  </h3>
                  <button className="close-btn" onClick={closeAppointmentModal}><X size={20} /></button>
                </div>
                <form onSubmit={handleSaveAppointment} className="apt-form">
                  <div>
                    <label className="form-label">Client *</label>
                    {/* Whose appointment this is cannot be edited -- moving it
                        to another person is a different booking. So the
                        existing/new chooser is only on a fresh booking. */}
                    {!editingAppointment && (
                      <div className="apt-seg">
                        {[[false, 'Existing client'], [true, 'New client']].map(([isNew, label]) => (
                          <button key={label} type="button"
                                  className={appointmentForm.isNewCustomer === isNew ? 'btn-primary' : 'btn-secondary'}
                                  onClick={() => setAppointmentForm({
                                    ...appointmentForm, isNewCustomer: isNew, customer: '' })}>
                            {label}
                          </button>
                        ))}
                      </div>
                    )}
                    {appointmentForm.isNewCustomer && !editingAppointment ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div className="form-grid-2">
                          <input className="form-control" placeholder="First name *" required
                                 maxLength={LIMITS.name} value={appointmentForm.new_first_name}
                                 onChange={(e) => setAppointmentForm({ ...appointmentForm, new_first_name: cleanName(e.target.value) })} />
                          <input className="form-control" placeholder="Last name"
                                 maxLength={LIMITS.name} value={appointmentForm.new_last_name}
                                 onChange={(e) => setAppointmentForm({ ...appointmentForm, new_last_name: cleanName(e.target.value) })} />
                        </div>
                        <div className="form-grid-2">
                          <input className="form-control" type="tel" inputMode="numeric" placeholder="Mobile number *" required
                                 value={appointmentForm.new_mobile}
                                 onChange={(e) => setAppointmentForm({ ...appointmentForm, new_mobile: cleanMobile(e.target.value) })} />
                          <select className="form-control" value={appointmentForm.new_gender}
                                  onChange={(e) => setAppointmentForm({ ...appointmentForm, new_gender: e.target.value })}>
                            <option value="">Gender</option>
                            <option value="Female">Female</option>
                            <option value="Male">Male</option>
                            <option value="Other">Other</option>
                          </select>
                        </div>
                        <span className="od-hint">They are added to your customers, and the confirmation goes to this number.</span>
                      </div>
                    ) : (
                      <CustomerPicker required disabled={!!editingAppointment}
                                      value={appointmentForm.customer ? String(appointmentForm.customer) : ''}
                                      onChange={(next) => setAppointmentForm((f) => ({ ...f, customer: next }))}
                                      placeholder="Search a client by name or mobile" />
                    )}
                  </div>
                  <div>
                    <label className="form-label">Type</label>
                    <select className="form-control"
                            value={appointmentForm.appointment_type}
                            onChange={(e) => setAppointmentForm({
                              ...appointmentForm,
                              appointment_type: e.target.value,
                              
                              custom_type: e.target.value === 'OTHER' ? appointmentForm.custom_type : '',
                            })}>
                      {Object.entries(APPOINTMENT_TYPE_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                    {appointmentForm.appointment_type === 'OTHER' && (
                      <input className="form-control apt-custom-type" required
                             maxLength={50} autoFocus
                             placeholder={t('dashboard.customTypePlaceholder', 'What kind of appointment?')}
                             value={appointmentForm.custom_type}
                             onChange={(e) => setAppointmentForm({ ...appointmentForm, custom_type: e.target.value })} />
                    )}
                  </div>
                  <div>
                    <label className="form-label">Date & time *</label>
                    <input className="form-control" type="datetime-local" required
                           ref={appointmentDateRef}
                           min={editingAppointment ? undefined : `${todayIso()}T00:00`}
                           value={appointmentForm.scheduled_time}
                           onChange={(e) => setAppointmentForm({ ...appointmentForm, scheduled_time: e.target.value })} />
                    {/* The calendar itself is the browser's, drawn outside the
                        page, so its Clear/Today row cannot be added to. This
                        is the page's own confirmation: what has been picked,
                        in words, and a Done that shuts the calendar. The value
                        is already committed by then -- the field writes on
                        every change -- so this confirms, it does not save. */}
                    <div className="apt-when">
                      <span className={appointmentForm.scheduled_time ? 'apt-when-set' : ''}>
                        {appointmentForm.scheduled_time
                          ? fmtDateTime(appointmentForm.scheduled_time)
                          : t('dashboard.pickDateTime', 'No date and time chosen yet')}
                      </span>
                      <button type="button" className="btn-secondary at-btn-sm"
                              disabled={!appointmentForm.scheduled_time}
                              onClick={() => appointmentDateRef.current?.blur()}>
                        {t('common.done', 'Done')}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="form-label">With</label>
                    <select className="form-control"
                            value={appointmentForm.assigned_staff}
                            onChange={(e) => setAppointmentForm({ ...appointmentForm, assigned_staff: e.target.value })}>
                      <option value="">Unassigned</option>
                      {tailors.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                  {editingAppointment && (
                    <div>
                      <label className="form-label">Status</label>
                      <select className="form-control"
                              value={appointmentForm.status}
                              onChange={(e) => setAppointmentForm({ ...appointmentForm, status: e.target.value })}>
                        {Object.entries(APPOINTMENT_STATUS_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="form-label">Notes</label>
                    <textarea className="form-control" rows={2} maxLength={LIMITS.note}
                              value={appointmentForm.notes}
                              onChange={(e) => setAppointmentForm({ ...appointmentForm, notes: e.target.value })} />
                  </div>
                  <div className="apt-foot">
                    {editingAppointment && appointmentForm.status !== 'CANCELLED' && (
                      <button type="button" className="btn-secondary" disabled={savingAppointment}
                              style={{ marginRight: 'auto', color: 'var(--danger-color)', borderColor: 'rgba(192,57,43,0.3)' }}
                              onClick={handleCancelAppointment}>
                        {t('dashboard.cancelAppointment', 'Cancel appointment')}
                      </button>
                    )}
                    <button type="button" className="btn-secondary" onClick={closeAppointmentModal}>
                      {t('common.close', 'Close')}
                    </button>
                    <button type="submit" className="btn-primary" disabled={savingAppointment}>
                      {savingAppointment
                        ? t('common.saving', 'Saving…')
                        : editingAppointment
                          ? t('common.saveChanges', 'Save changes')
                          : t('dashboard.bookAppointmentBtn', 'Book appointment')}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Designs CRUD Modal Overlay */}
          {showDesignModal && (
            <FormModal
              icon={Shirt} tone="amber" zIndex={1100} width="720px"
              title={editingDesign ? t('designsPage.editDesignDetails', 'Edit Design Details') : t('designsPage.addNewDesignTitle', 'Add New Design to Collection')}
              subtitle="Add garment details to your boutique collection."
              onClose={() => setShowDesignModal(false)}
              footer={(
                <>
                  <button type="button" className="btn-secondary" onClick={() => setShowDesignModal(false)}>{t('common.cancel', 'Cancel')}</button>
                  <button type="submit" form="design-form" className="btn-primary" disabled={designSaving}>
                    <Save size={16} /> {designSaving ? t('common.saving', 'Saving…') : t('designsPage.saveDesign', 'Save Design')}
                  </button>
                </>
              )}
            >
              <form id="design-form" onSubmit={handleSaveDesign} className="at-stack">
                <Field label={t('designsPage.designName', 'Design Name')} required icon={Type}>
                  <input
                    type="text"
                    required
                    className="form-control"
                    placeholder="e.g. Royal Maroon Velvet Lehenga"
                    maxLength={LIMITS.name}
                    value={designForm.name}
                    onChange={e => setDesignForm({...designForm, name: e.target.value})}
                  />
                </Field>

                <div className="at-form-grid">
                  <Field label={t('designsPage.garmentCategory', 'Garment Category')} required icon={Shirt}>
                    <select
                      className="form-control"
                      value={designForm.garment_type}
                      onChange={e => setDesignForm({...designForm, garment_type: e.target.value, catalogue: {}, catalogue_path: null})}
                    >
                      <option value="Lehenga">{t('designsPage.lehenga', 'Lehenga')}</option>
                      <option value="Gown">{t('designsPage.gown', 'Gown')}</option>
                      <option value="Saree">{t('designsPage.saree', 'Saree')}</option>
                      <option value="Blouse">{t('designsPage.blouse', 'Blouse')}</option>
                      <option value="Kurti">{t('designsPage.kurti', 'Kurti')}</option>
                      <option value="Sherwani">{t('designsPage.sherwani', 'Sherwani')}</option>
                      <option value="Anarkali">{t('designsPage.anarkali', 'Anarkali')}</option>
                      <option value="Suit">{t('designsPage.salwarKameez', 'Salwar Kameez')}</option>
                      <option value="Jacket">{t('designsPage.jacket', 'Jacket')}</option>
                      {/* Men's wear. Values slug to the template / catalogue
                          keys the picker below looks up ("Mens Suit" ->
                          mens_suit), so an apostrophe would break the match. */}
                      <option value="Shirt">{t('designsPage.mensShirt', "Men's Shirt")}</option>
                      <option value="T-Shirt">{t('designsPage.tShirt', 'T-Shirt')}</option>
                      <option value="Kurta">{t('designsPage.mensKurta', "Men's Kurta")}</option>
                      <option value="Indo-Western">{t('designsPage.indoWestern', 'Indo-Western')}</option>
                      <option value="Mens Suit">{t('designsPage.mensSuit', "Men's Suit")}</option>
                      <option value="Trouser">{t('designsPage.trouser', 'Trouser')}</option>
                      <option value="Jeans">{t('designsPage.jeans', 'Jeans')}</option>
                      <option value="Shorts">{t('designsPage.shorts', 'Shorts')}</option>
                      <option value="Mens Bottom Wear">{t('designsPage.mensBottomWear', "Men's Bottom Wear")}</option>
                      <option value="Coat">{t('designsPage.coat', 'Coat / Overcoat')}</option>
                      <option value="Casual Wear">{t('designsPage.casualWear', 'Casual Wear')}</option>
                    </select>
                  </Field>
                  <Field label={t('designsPage.designType', 'Design Type')} required icon={Tag}>
                    <select
                      className="form-control"
                      value={designForm.is_boutique}
                      onChange={e => setDesignForm({...designForm, is_boutique: e.target.value === 'true' || e.target.value === true})}
                    >
                      <option value="true">{t('designsPage.boutiqueCatalogCollection', 'Boutique Catalog Collection')}</option>
                      <option value="false">{t('designsPage.aiSuggestionTemplate', 'AI Suggestion Template')}</option>
                    </select>
                  </Field>
                  {/* Where in the garment's design catalogue this design is
                      filed. The garment here is a name ("Saree"); the
                      catalogue is keyed the way templates are, so the name is
                      slugged the same way the server will slug it. Nothing
                      renders for a garment without a catalogue. */}
                  <DesignCataloguePicker
                    garmentKey={(designForm.garment_type || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}
                    value={designForm.catalogue || {}}
                    onChange={(value, payload) => setDesignForm({ ...designForm, catalogue: value, catalogue_path: payload })}
                  />
                  <Field label={t('designsPage.necklineStyleOptional', 'Neckline Style (Optional)')} icon={Sparkles}>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g. Sweetheart Neck"
                      maxLength={LIMITS.name}
                      value={designForm.neckline_style}
                      onChange={e => setDesignForm({...designForm, neckline_style: e.target.value})}
                    />
                  </Field>
                  <Field label={t('designsPage.sleeveStyleOptional', 'Sleeve Style (Optional)')} icon={Shirt}>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g. Cap Sleeve"
                      maxLength={LIMITS.name}
                      value={designForm.sleeve_style}
                      onChange={e => setDesignForm({...designForm, sleeve_style: e.target.value})}
                    />
                  </Field>
                </div>

                <Field label={t('designsPage.catalogPriceLabel', 'Catalog Price (₹) - Only for Boutique Catalog')} icon={IndianRupee}>
                  <input
                    type="number"
                    min="0"
                    max={LIMITS.amount}
                    step="0.01"
                    inputMode="decimal"
                    className="form-control"
                    placeholder="e.g. 45000"
                    value={designForm.price}
                    onChange={e => setDesignForm({...designForm, price: cleanAmount(e.target.value)})}
                    disabled={designForm.is_boutique === false || designForm.is_boutique === 'false'}
                  />
                </Field>

                <Field label={t('designsPage.uploadImageOptional', 'Upload Image (Optional)')} icon={Upload}
                       hint={designImageFile ? `Selected: ${designImageFile.name}` : 'Choose a photo of the garment from this device.'}>
                  <input
                    type="file"
                    accept="image/*"
                    className="form-control"
                    onChange={e => {
                      const f = e.target.files?.[0] || null;
                      const bad = f ? imageFilesError([f]) : '';
                      if (bad) { alert(bad); e.target.value = ''; return; }
                      setDesignImageFile(f);
                    }}
                  />
                  <div style={{ marginTop: '8px' }}>
                    <CameraButton onFiles={([f]) => setDesignImageFile(f || null)} />
                  </div>
                </Field>

                {/* 255: the width of BoutiqueDesign.image_url on the server. */}
                <Field label={t('designsPage.imageUrlOptional', 'Image URL (Optional)')} icon={LinkIcon}
                       hint="Add a link if the image is hosted online.">
                  <input
                    type="url"
                    className="form-control"
                    placeholder="e.g. https://images.unsplash.com/photo-..."
                    maxLength={255}
                    value={designForm.image_url}
                    onChange={e => setDesignForm({...designForm, image_url: e.target.value})}
                  />
                </Field>

                <Field label={t('designsPage.descriptionOptional', 'Description (Optional)')} icon={FileText}>
                  <textarea
                    className="form-control"
                    placeholder="e.g. Hand-embroidered with gold thread, georgette base..."
                    rows="3"
                    maxLength={LIMITS.note}
                    value={designForm.description}
                    onChange={e => setDesignForm({...designForm, description: e.target.value})}
                  />
                </Field>
                <div className="at-field-counter" style={{ marginTop: '-8px' }}>{(designForm.description || '').length}/{LIMITS.note}</div>

                <InfoNote tone="amber" title="Tip">
                  High quality images and detailed descriptions help showcase your designs better.
                </InfoNote>
              </form>
            </FormModal>
          )}

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
      {view === 'order-selector' && (
        <div className={`portal-layout${navCollapsed ? ' nav-collapsed' : ''}`}>
          {/* Below 1024px .portal-sidebar is an off-canvas drawer. Without a way
              to open it -- and without the overlay to shut it again -- this
              screen had no navigation at all on a phone: the sidebar sat parked
              at translateX(-100%) and nothing on the page could bring it back. */}
          <MobileHeader
            showBell={showBell}
            title="New Order"
            currentUser={currentUser}
            notificationsCount={notifications.filter(n => !n.is_read).length}
            onOpenMenu={() => setMobileNavOpen(!mobileNavOpen)}
            accountItems={headerAccountItems((tab) => { setView('dashboard'); setDashboardTab(tab); setSelectedDirectoryCustomer(null); setCustomerAddMode(null); setMobileNavOpen(false); })}
            onOpenNotifications={() => {
              setShowNotificationsDrawer(true);
              if (markingNotificationsRead) return;
              setMarkingNotificationsRead(true);
              api.markNotificationsAsRead(currentUser?.role || 'Owner', currentUser?.email)
                .then(() => fetchNotifications())
                    
                    .catch(() => {})
                    .finally(() => setMarkingNotificationsRead(false));
            }}
          />

          {mobileNavOpen && (
            <div className="mobile-portal-overlay" onClick={() => setMobileNavOpen(false)} />
          )}

          {/* Reuse Sidebar for Portal Continuity */}
          <aside className={`portal-sidebar ${mobileNavOpen ? 'mobile-open' : ''}`}>
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
            
            <nav className="portal-menu">
              <PortalMenu
                sections={sidebarSections}
                activeTab={dashboardTab}
                collapsed={navCollapsed && !mobileNavOpen}
                onPick={(tab) => { setView('dashboard'); setDashboardTab(tab); setSelectedDirectoryCustomer(null); setCustomerAddMode(null); setMobileNavOpen(false); }}
              />
            </nav>
          </aside>

          <main className="portal-main">
            {accountBar((tab) => { setView('dashboard'); setDashboardTab(tab); setSelectedDirectoryCustomer(null); setCustomerAddMode(null); setMobileNavOpen(false); })}
            <div className="selector-container">
              {/* Back to where New order was opened from. The dashboard keeps
                  the section it was on (and the customer page, if one was
                  open) while this chooser shows, so returning to it is enough. */}
              <div className="selector-back">
                <button type="button" className="at-link" onClick={() => setView('dashboard')}>
                  <ArrowLeft size={16} /> {t('entry.back', 'Back')}
                </button>
              </div>
              <div className="selector-header">
                <h1 className="selector-title" style={{ fontFamily: 'var(--font-serif)', fontSize: '32px' }}>{t('entry.newOrderTitle', 'New order')}</h1>
                <p className="selector-subtitle" style={{ color: 'var(--text-secondary)' }}>{t('entry.serviceQuestion', 'What are we doing for this customer today?')}</p>
              </div>

              {/* The first question: three doors. A new design by our designer
                  is not a door of its own any more -- it is one of the ways to
                  choose the look inside Stitching. A garment stitched elsewhere
                  comes in through Alteration, beside ours. */}
              <div className="wz-services wz-services--three">
                <button type="button" className="wz-service" onClick={() => startService('stitch')}>
                  <IconTile icon={Scissors} tone="green" size={48} iconSize={22} />
                  <span className="wz-service-title">{t('entry.serviceStitching', 'Stitching')}</span>
                  <span className="wz-service-desc">{t('entry.serviceStitchingDesc', 'A blouse, saree work, a lehenga. The look comes from our catalogue, the customer\u2019s photos, or a new design by our designer.')}</span>
                </button>
                <button type="button" className="wz-service" onClick={() => startService('alter')}
                        disabled={currentUser?.role === 'Designer'}
                        title={currentUser?.role === 'Designer' ? t('entry.serviceAlterNotYou', 'Alterations are raised at the counter.') : undefined}>
                  <IconTile icon={Ruler} tone="amber" size={48} iconSize={22} />
                  <span className="wz-service-title">{t('entry.serviceAlteration', 'Alteration')}</span>
                  <span className="wz-service-desc">{t('entry.serviceAlterationDesc', 'Fix or adjust a garment \u2014 one we made, or one stitched elsewhere.')}</span>
                </button>
                {(!currentUser?.role || currentUser.role === 'Owner') && (
                  <button type="button" className="wz-service" onClick={() => setStartingBoutiqueRun(true)}>
                    <IconTile icon={Factory} tone="violet" size={48} iconSize={22} />
                    <span className="wz-service-title">{t('entry.serviceInHouse', 'In-house')}</span>
                    <span className="wz-service-desc">{t('entry.serviceInHouseDesc', 'Garments for our own stock or the showroom. No customer \u2014 they go into inventory when they are done.')}</span>
                  </button>
                )}
              </div>

              {/* Orders already being written. Offered, never resumed
                  silently: picking one up is a decision, and so is throwing it
                  away. Shows enough to tell two apart -- who it is for, what is
                  on it, how far it got and when it was last touched. */}
              {resumableDrafts.length > 0 && (
                <div className="content-card" style={{ marginTop: '24px' }}>
                  <div style={{ fontWeight: 600, marginBottom: '4px' }}>
                    {resumableDrafts.length === 1
                      ? t('entry.orderInProgressOne', 'You have an order in progress')
                      : t('entry.orderInProgressMany', `You have ${resumableDrafts.length} orders in progress`, { count: resumableDrafts.length })}
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                    {t('entry.savedAutomaticallySub', 'Saved automatically. Pick one up where you left it, or discard it.')}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {resumableDrafts.map(draft => {
                      const garments = (draft.payload?.garments || [])
                        .map(g => g.template_key).filter(Boolean);
                      return (
                        <div key={draft.id} style={{ display: 'flex', alignItems: 'center', gap: '12px',
                                                     flexWrap: 'wrap', borderTop: '1px solid var(--border-color)',
                                                     paddingTop: '10px' }}>
                          <div style={{ flex: '1 1 260px' }}>
                            <div style={{ fontWeight: 600 }}>
                              {draft.customer_name || (garments.length ? garments.join(', ') : t('entry.unnamedCustomer', 'Unnamed customer'))}
                            </div>
                            <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                              {draft.customer_name
                                ? (garments.length ? garments.join(', ') : t('wizard.noGarmentChosen', 'No garment yet'))
                                : t('entry.customerNotYet', 'Customer not added yet')}
                              {' · '}{(() => { const total = WIZARD_STEPS[draft.payload?.service === 'design' ? 'design' : 'stitch'].length; return t('entry.stepXofY', 'Step {step} of {total}', { step: Math.min(draft.current_step, total), total }); })()}
                              {' · '}{t('entry.lastSaved', 'saved')} {fmtDateTime(draft.updated_at)}
                            </div>
                          </div>
                          <button type="button" className="btn-primary" onClick={() => hydrateWizard(draft)}>
                            {t('entry.resume', 'Resume')}
                          </button>
                          {discardingDraftId === draft.id ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                                {t('entry.discardConfirmDesc', 'Discard this order? Nothing has been booked, but everything entered on it will be lost.')}
                              </span>
                              <button type="button" className="btn-secondary"
                                      onClick={() => setDiscardingDraftId(null)}>
                                {t('entry.keepIt', 'Keep it')}
                              </button>
                              <button type="button" className="btn-primary" disabled={deletingDraftId === draft.id} onClick={async () => {
                                if (deletingDraftId) return;
                                setDeletingDraftId(draft.id);
                                try {
                                  await api.deleteOrderDraft(draft.id);
                                  setResumableDrafts(prev => prev.filter(d => d.id !== draft.id));
                                } catch (err) {
                                  console.error('Could not discard the draft', err);
                                  alert('Could not discard that order — it is still saved.');
                                } finally {
                                  setDiscardingDraftId(null);
                                  setDeletingDraftId(null);
                                }
                              }}>
                                {deletingDraftId === draft.id
                                  ? t('common.discarding', 'Discarding…')
                                  : t('entry.discardPermanently', 'Discard permanently')}
                              </button>
                            </div>
                          ) : (
                            <button type="button" className="btn-secondary"
                                    onClick={() => setDiscardingDraftId(draft.id)}>
                              {t('entry.discard', 'Discard')}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {startingBoutiqueRun && (
                <BoutiqueProductionDialog
                  onClose={() => setStartingBoutiqueRun(false)}
                  onCreated={async () => {
                    setStartingBoutiqueRun(false);
                    await fetchDashboardAndConfig();
                    setView('dashboard');
                    setDashboardTab('orders');
                  }} />
              )}
            </div>
          </main>
        </div>
      )}

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
            {wizardStepKey === 'who' && (
              <>
                <div className="wz-who-wrap">
                <div className="page-title-group">
                  <h1 className="page-title">{t('wizard.whoTitle', 'Who is this for?')}</h1>
                  <p className="page-subtitle">
                    {serviceType === 'alter' && alterOutside
                      ? t('wizard.whoAlterOutsideSubtitle', 'Find the customer by name or mobile number, or type a new walk-in’s name and number.')
                      : serviceType === 'alter'
                      ? t('wizard.whoAlterSubtitleBoth', 'Find the customer by name or mobile number. A garment stitched elsewhere is taken in under “Stitched elsewhere”.')
                      : t('wizard.whoSubtitle', 'Type the customer’s name, then their mobile number. A customer we know comes up as you type either one.')}
                  </p>
                </div>

                <div className="content-card wz-card wz-who">
                  {/* One Alteration door for both kinds of garment. Ours is
                      found on the customer's delivered orders; one stitched
                      elsewhere has no order to hang off, so it is taken in
                      with its own short form. */}
                  {serviceType === 'alter' && (
                    <div className="wz-whose-field">
                      <span className="form-label" id="wz-whose-label">{t('wizard.alterWhose', 'Whose garment is it?')}</span>
                      <div className="wz-whose" role="radiogroup" aria-labelledby="wz-whose-label">
                        <button type="button" role="radio" aria-checked={!alterOutside}
                                className={`wz-whose-opt${alterOutside ? '' : ' wz-whose-opt--on'}`}
                                onClick={() => setAlterOutside(false)}>
                          <span className="wz-whose-icon"><Shirt size={20} /></span>
                          <span className="wz-whose-text">
                            <span className="wz-whose-title">{t('wizard.alterOurs', 'Stitched by us')}</span>
                            <span className="wz-whose-sub">{t('wizard.alterOursSub', 'A garment we made and delivered')}</span>
                          </span>
                          <span className="wz-whose-mark" aria-hidden="true">{!alterOutside && <Check size={14} />}</span>
                        </button>
                        <button type="button" role="radio" aria-checked={alterOutside}
                                className={`wz-whose-opt${alterOutside ? ' wz-whose-opt--on' : ''}`}
                                onClick={() => setAlterOutside(true)}>
                          <span className="wz-whose-icon"><Scissors size={20} /></span>
                          <span className="wz-whose-text">
                            <span className="wz-whose-title">{t('wizard.alterOutside', 'Stitched elsewhere')}</span>
                            <span className="wz-whose-sub">{t('wizard.alterOutsideSub', 'Made by another tailor, brought in for changes')}</span>
                          </span>
                          <span className="wz-whose-mark" aria-hidden="true">{alterOutside && <Check size={14} />}</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* The customer's name first, then their mobile number. A
                      customer picked from the matches shows here in its place. */}
                  {customerId ? (
                    <div className="wz-known">
                      <AvatarInitials name={`${customerForm.first_name} ${customerForm.last_name}`} size={40} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div className="wz-known-name">{customerForm.first_name} {customerForm.last_name} <TierBadge tier={customerTier(customerForm)} /></div>
                        <div className="od-hint">
                          {formatMobile(customerForm.mobile_number)}{customerForm.city_region ? ` · ${customerForm.city_region}` : ''} · {customerLocked
                            ? t('wizard.fixedFromProfile', 'from their profile; edit it there to change it')
                            : t('wizard.knownCustomer', 'a customer we know')}
                        </div>
                        {numberMatched?.id === customerId && numberMatched.typedName
                          && numberMatched.typedName.toLowerCase() !== `${customerForm.first_name} ${customerForm.last_name}`.trim().toLowerCase() && (
                          <div className="wz-known-note">
                            {t('wizard.numberMatchedNote', 'This number is already saved for this customer, so the name “{typed}” was replaced. For a different customer, change the number.', { typed: numberMatched.typedName })}
                          </div>
                        )}
                      </div>
                      {/* From a customer's own profile the customer is fixed. Otherwise
                          Delete takes them off this order -- the card, the name and the
                          number -- to start again. The customer stays in the book. */}
                      {customerLocked ? <Lock size={16} style={{ color: 'var(--text-secondary)' }} aria-hidden="true" /> : (
                      <button type="button" className="btn-secondary at-btn-sm"
                              title={t('wizard.removeCustomer', 'Remove this customer from the order')}
                              aria-label={t('wizard.removeCustomer', 'Remove this customer from the order')}
                              style={{ color: 'var(--danger-color)', borderColor: 'var(--danger-color)' }}
                              onClick={() => { clearPickedCustomer(''); requestAnimationFrame(() => document.getElementById('wz-name')?.focus()); }}>
                        <Trash2 size={14} /> {t('common.delete', 'Delete')}
                      </button>
                      )}
                    </div>
                  ) : (
                    <div className="form-group">
                      <label className="form-label" htmlFor="wz-name">{t('wizard.customerName', 'Customer Name')} <span className="required">*</span></label>
                      <input id="wz-name" type="text" className="form-control" value={customerName} autoFocus={!customerLocked} autoComplete="off"
                             maxLength={LIMITS.name}
                             onChange={(e) => setCustomerNameSplit(cleanName(e.target.value))}
                             placeholder={t('wizard.namePlaceholder', 'e.g. Amara Singh')} />
                      {matchBy === 'name' && customerMatchList}
                    </div>
                  )}

                  <div className="wz-who-row">
                  <div className="wz-who-col">
                  <div className="form-group">
                    <label className="form-label" htmlFor="wz-mobile">{t('wizard.mobileNumber', 'Mobile Number')} <span className="required">*</span></label>
                    <div className="input-wrapper">
                      <span className="input-icon-left" style={{ fontSize: '14px', left: '12px' }}>🇮🇳 +91</span>
                      <input id="wz-mobile" type="tel" inputMode="numeric" autoComplete="off"
                             value={customerForm.mobile_number}
                             readOnly={customerLocked && !!customerId} aria-readonly={customerLocked && !!customerId}
                             onChange={(e) => {
                               const digits = cleanMobile(e.target.value);
                               if (customerId) { clearPickedCustomer(digits); return; }
                               setCustomerForm({ ...customerForm, mobile_number: digits });
                             }}
                             style={{ paddingLeft: '65px' }} placeholder="98765 43210" />
                    </div>
                  </div>

                  {!customerId && (
                    <>
                      {matchBy === 'mobile' && customerMatchList}
                      {serviceType === 'alter' && customerLookupTyped && customerMatches.length === 0 && !customerMatchesLoading && (
                        alterOutside ? (
                          <p className="od-hint" style={{ marginTop: '8px' }}>
                            {t('wizard.newWalkIn', 'Not in your book yet: they are added as a new walk-in customer when you take the garment in.')}
                          </p>
                        ) : (
                          <p className="od-hint" style={{ marginTop: '8px' }}>
                            {t('wizard.noCustomerForAlterOutside', 'No customer with this name or number in your book. If the garment was stitched elsewhere, take it in under')}{' '}
                            <button type="button" className="at-link" onClick={() => setAlterOutside(true)}>
                              {t('wizard.alterOutside', 'Stitched elsewhere')}
                            </button>.
                          </p>
                        )
                      )}
                    </>
                  )}
                  </div>

                  {/* Gender is kept on the customer's record; the garments were
                      chosen before we got here, so it filters nothing now.
                      Alterations skip it -- their garments come from past orders. */}
                  {serviceType !== 'alter' && !customerId && (
                    <div className="form-group">
                      <label className="form-label" htmlFor="wz-gender">{t('wizard.gender', 'Gender')} <span className="od-hint">({t('common.optional', 'optional')})</span></label>
                      <select id="wz-gender" className="form-control" value={customerForm.gender || ''}
                              onChange={(e) => setCustomerForm({ ...customerForm, gender: e.target.value })}>
                        <option value="">{t('wizard.selectGender', 'Select Gender')}</option>
                        <option value="Female">{t('wizard.female', 'Female')}</option>
                        <option value="Male">{t('wizard.male', 'Male')}</option>
                        <option value="Other">{t('wizard.other', 'Other')}</option>
                      </select>
                    </div>
                  )}
                  </div>

                  {serviceType !== 'alter' && (
                    <details className="wz-more">
                      <summary>{t('wizard.moreAboutCustomer', 'More about the customer')} <span className="od-hint">({t('common.optional', 'optional')})</span></summary>
                      <div className="form-grid-2" style={{ marginTop: '12px' }}>
                        <div className="form-group">
                          <label className="form-label">{t('wizard.emailAddress', 'Email Address')}</label>
                          <input type="email" className="form-control" value={customerForm.email_address || ''} maxLength={LIMITS.email}
                                 onChange={(e) => setCustomerForm({ ...customerForm, email_address: e.target.value })}
                                 onBlur={(e) => setCustomerForm({ ...customerForm, email_address: cleanEmail(e.target.value) })}
                                 placeholder="e.g. amara.s@example.com" />
                        </div>
                        <div className="form-group">
                          <label className="form-label">{t('wizard.cityRegion', 'City / Region')}</label>
                          <input type="text" className="form-control" value={customerForm.city_region || ''} maxLength={LIMITS.name}
                                 onChange={(e) => setCustomerForm({ ...customerForm, city_region: e.target.value })} placeholder="e.g. New Delhi" />
                        </div>
                      </div>
                      <div className="form-group">
                        <label className="form-label">{t('wizard.address', 'Address')}</label>
                        <input type="text" className="form-control" value={customerForm.address || ''} maxLength={LIMITS.address}
                               onChange={(e) => setCustomerForm({ ...customerForm, address: e.target.value })}
                               placeholder={t('wizard.addressPlaceholder', 'Street name, Apartment, City, State, PIN code')} />
                      </div>
                      <div className="form-grid-2">
                        <div className="form-group">
                          <label className="form-label">{t('wizard.customerType', 'Customer tier')}</label>
                          <select className="form-control" value={customerForm.customer_type}
                                  onChange={(e) => setCustomerForm({ ...customerForm, customer_type: e.target.value })}>
                            <option value="Silver">{tierName('Silver', t('wizard.silver', 'Silver'))}</option>
                            <option value="Gold">{tierName('Gold', t('wizard.gold', 'Gold'))}</option>
                            <option value="Platinum">{tierName('Platinum', t('wizard.platinum', 'Platinum'))}</option>
                          </select>
                        </div>
                        <div className="form-group">
                          <label className="form-label">{t('wizard.source', 'Source')}</label>
                          <select className="form-control" value={customerForm.source}
                                  onChange={(e) => setCustomerForm({ ...customerForm, source: e.target.value })}>
                            <option value="Walk In">{t('wizard.walkIn', 'Walk In')}</option>
                            <option value="Instagram">{t('wizard.instagram', 'Instagram')}</option>
                            <option value="Referral">{t('wizard.referral', 'Referral')}</option>
                            <option value="Website">{t('wizard.website', 'Website')}</option>
                          </select>
                        </div>
                      </div>
                    </details>
                  )}

                </div>
                </div>
              </>
            )}

            {/* TYPE: the garments, and for each one only what its cut needs. */}
            {wizardStepKey === 'type' && (
              <>
                {/* Before the first garment is picked: one centred column, like
                    the Customer step. With garments, the full-width layout. */}
                <div className={`wz-type-wrap${garmentJobs.length === 0 ? ' wz-type-wrap--empty' : ''}`}>
                <div className="page-title-group">
                  <h1 className="page-title">{t('wizard.typeTitle', 'What are we making?')}</h1>
                  <p className="page-subtitle">{t('wizard.garmentFlowSubtitle', 'Each garment in turn: what it needs, then its design and fabric below.')}</p>
                </div>

                <div className="content-card wz-card">
                  {/* Picks the first garment only. Once one is on the order the
                      next is added from the prompt under the last section, so
                      garments are filled in one after another, not all at once. */}
                  {garmentJobs.length === 0 && <DressesDropdown
                    title={t('wizard.garmentsInOrder', 'Garments in this order')}
                    subtitle={t('wizard.garmentsPickSeveral', 'Tick every garment being made, then add them.')}
                    garmentTemplates={garmentsForGender(garmentTemplates, customerForm.gender)}
                    garmentJobs={garmentJobs}
                    addingGarmentKey={addingGarmentKey}
                    garmentTemplatesError={garmentTemplatesError}
                    loadGarmentTemplates={loadGarmentTemplates}
                    addGarments={addGarments}
                  />}

                  {garmentJobs.length > 1 && (() => {
                    
                    const filled = (job) => Object.keys(validateSpec(job.template, job.values, { sections: ['basic', 'style'] })).length === 0
                      && (job.template?.sections || [])
                        .filter((sec) => sec.key === 'basic' || sec.key === 'style')
                        .some((sec) => sec.fields.some((f) => {
                          const v = job.values?.[f.key];
                          return f.key !== 'delivery_date' && v !== '' && v != null && !(Array.isArray(v) && !v.length)
                            && !(f.default != null && v === f.default);
                        }));
                    const openKey = openGarment?.key;
                    return (
                      <div style={{ marginTop: '16px' }}>
                        {/* The same stepper the wizard draws across the top, one
                            circle per garment: a tick once every required
                            question this step asks is answered -- the same
                            check Next runs -- the open one filled, the rest
                            numbered. Clicking a circle scrolls to that garment. */}
                        <div className="stepper-progress-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px 0' }}>
                          {garmentJobs.map((job, idx) => {
                            const isActive = job.key === openKey;
                            const complete = garmentsDone.includes(job.key) && filled(job) && !isActive;
                            const missing = !filled(job) && Boolean(garmentErrors[job.key]);
                            // One garment shows at a time: a circle opens that one's details.
                            const goTo = () => openGarmentAt(job.key);
                            return (
                              <React.Fragment key={job.key}>
                                <div className="stepper-step stepper-step--link" role="button" tabIndex={0}
                                     aria-current={isActive ? 'step' : undefined}
                                     title={`Go to ${garmentLabel(job)}`}
                                     onClick={goTo}
                                     onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goTo(); } }}
                                     style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', flex: 1, position: 'relative', zIndex: 2, cursor: 'pointer' }}>
                                  <div style={{
                                    width: '28px', height: '28px', borderRadius: '50%',
                                    backgroundColor: complete ? 'var(--primary-color)' : (isActive ? 'var(--selected-bg)' : 'var(--surface-inset)'),
                                    color: complete ? 'var(--primary-foreground)' : isActive ? 'var(--selected-fg)' : 'var(--text-secondary)',
                                    border: isActive ? '2px solid var(--primary-color)' : missing ? '2px solid var(--danger-color, #b91c1c)' : 'none',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '12px', fontWeight: 600, marginBottom: '8px',
                                  }}>
                                    {complete ? <Check size={14} /> : idx + 1}
                                  </div>
                                  <span style={{ fontSize: '11px', fontWeight: isActive || complete ? 600 : 500, color: isActive || complete ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                                    {garmentLabel(job)}
                                  </span>
                                  <span style={{ fontSize: '9px', color: missing ? 'var(--danger-color, #b91c1c)' : 'var(--text-secondary)', marginTop: '2px' }}>
                                    {complete ? t('wizard.completed', 'Done') : missing ? t('wizard.garmentMissing', 'Something missing') : isActive ? t('wizard.garmentNow', 'Fill in now') : t('wizard.garmentNext', 'Up next')}
                                  </span>
                                </div>
                                {idx < garmentJobs.length - 1 && (
                                  <div style={{ display: 'flex', alignItems: 'center', flex: 1, margin: '0 -20px', transform: 'translateY(-20px)', zIndex: 1, color: complete ? 'var(--primary-color)' : 'var(--border-color)' }}>
                                    <div style={{ height: '2px', flex: 1, backgroundColor: 'currentColor' }}></div>
                                    <ArrowRight size={16} style={{ marginLeft: '-4px', flexShrink: 0 }} />
                                  </div>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                  {garmentJobs.map((job, idx) => {
                    if (job.key !== openGarment?.key) return null;
                    const sections = ['basic', 'style'].filter((k) => job.template.sections.some((sec) => sec.key === k));
                    const upFront = (f) => f.key !== 'delivery_date' && (f.is_required || Boolean(f.visible_when));
                    return (
                      <div key={job.key} id={`wz-garment-${job.key}`} className="wz-garment">
                        <div className="wz-garment-head">
                          <span className="wz-garment-num">{idx + 1}</span>
                          <div>
                            {renamingGarment?.key === job.key ? (
                              <input className="form-control" autoFocus maxLength={60}
                                     aria-label={t('wizard.garmentName', 'Garment name')}
                                     placeholder={job.template.name}
                                     value={renamingGarment.text}
                                     onChange={(e) => setRenamingGarment({ key: job.key, text: e.target.value })}
                                     onBlur={saveGarmentName}
                                     onKeyDown={(e) => {
                                       if (e.key === 'Enter') { e.preventDefault(); saveGarmentName(); }
                                       if (e.key === 'Escape') setRenamingGarment(null);
                                     }}
                                     style={{ maxWidth: '280px', padding: '4px 8px' }} />
                            ) : (
                              <div className="wz-garment-name" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                {garmentLabel(job)}
                                <button type="button" className="btn-secondary at-btn-sm"
                                        title={t('wizard.renameGarment', 'Rename this garment on this order')}
                                        aria-label={t('wizard.renameGarment', 'Rename this garment on this order')}
                                        style={{ padding: '2px 6px', minHeight: 0 }}
                                        onClick={() => setRenamingGarment({ key: job.key, text: job.label || '' })}>
                                  <Edit2 size={12} />
                                </button>
                              </div>
                            )}
                            <div className="wz-garment-sub">
                              {job.label ? `${job.template.name} · ` : ''}{t('wizard.whatDoesItNeed', 'What does it need?')}
                            </div>
                          </div>
                          <button type="button" className="btn-secondary at-btn-sm" style={{ marginLeft: 'auto' }} onClick={() => removeGarment(job.key)}>
                            <Trash2 size={12} /> {t('common.remove', 'Remove')}
                          </button>
                        </div>

                        {/* How many of this garment, asked first -- the customer says
                            "three sarees" before anything else. [+] adds one of the same
                            design that follows this one as it is filled; a follower says
                            so instead. A paired garment (a saree's blouse) is counted
                            with its saree, so it shows neither. */}
                        {(() => {
                          const source = job.sameAs && garmentJobs.find(j => j.key === job.sameAs);
                          if (source) {
                            return (
                              <div className="od-hint wz-same-hint">
                                <Copy size={13} style={{ verticalAlign: '-2px' }} />{' '}
                                {t('wizard.sameDesignAs', 'Same design as {name}: filled in from it as you go. Change anything here and this one becomes its own design.', { name: garmentLabel(source) })}
                              </div>
                            );
                          }
                          if (job.pairedWith) return null;
                          const total = garmentJobs.filter(j => j.template?.key === job.template?.key).length;
                          const followers = garmentJobs.filter(j => j.sameAs === job.key).length;
                          return (
                            <div className="wz-qty">
                              <span className="wz-qty-label">
                                {t('wizard.howMany', 'How many {name}?', { name: job.template.name })}
                              </span>
                              <span className="wz-qty-stepper">
                                <button type="button" className="wz-qty-btn" disabled={!followers}
                                        aria-label={t('wizard.oneFewer', 'One fewer of the same design')} onClick={() => dropFollower(job.key)}>−</button>
                                <span aria-live="polite" className="wz-qty-num">{total}</span>
                                <button type="button" className="wz-qty-btn"
                                        aria-label={t('wizard.oneMoreSame', 'One more, same design')} onClick={() => copyGarment(job.key)}>+</button>
                              </span>
                              <button type="button" className="btn-secondary at-btn-sm wz-qty-other"
                                      disabled={!!addingGarmentKey} onClick={() => addAnotherOf(job)}>
                                <Plus size={12} /> {t('wizard.anotherDifferent', 'One with a different design')}
                              </button>
                              {followers > 0 && (
                                <div className="od-hint wz-qty-hint">
                                  {t('wizard.followersHint', '{n} more with the same design: whatever you fill here is copied to them. Change one and it becomes its own design.', { n: followers })}
                                </div>
                              )}
                            </div>
                          );
                        })()}

                        <details open className="wz-sec wz-sec--first">
                          <summary className="wz-sec-head">
                            <span className="wz-sec-icon" aria-hidden><ClipboardList size={17} /></span>
                            <span className="wz-sec-titles">
                              <span className="wz-sec-title">{t('wizard.detailsTitle', 'Details')}</span>
                              <span className="wz-sec-sub">{t('wizard.detailsSub', 'The style, and anything special')}</span>
                            </span>
                            <ChevronDown size={18} className="wz-sec-chev" aria-hidden />
                          </summary>
                        {sections.map((sectionKey) => (
                          <div key={sectionKey} className="wz-garment-section">
                            <TemplateForm template={job.template} section={sectionKey} values={job.values}
                                          errors={garmentErrors[job.key] || {}} only={upFront}
                                          voiceFor={MAGGAM_NOTE_VOICE}
                                          purchases={job.purchases || []} onPurchaseChange={(fieldKey, row) => updateGarmentPurchase(job.key, fieldKey, row)}
                                          onChange={(values) => updateGarmentValues(job.key, values)} />
                          </div>
                        ))}

                        {/* Anything the options above have no box for, in the
                            customer's own words. The template's own
                            special_instructions field (Production Notes), so it
                            is validated and stored with the garment's spec and
                            the tailor reads it on the garment's brief. */}
                        <div className="wz-garment-section">
                          <div className="od-hint" style={{ marginBottom: '6px' }}>
                            {t('wizard.garmentNoteHint', 'Anything the options above don’t cover? Write it here.')}
                          </div>
                          <TemplateForm template={job.template} section="production" values={job.values}
                                        errors={garmentErrors[job.key] || {}} only={(f) => f.key === 'special_instructions'}
                                        plainTextarea
                                        onChange={(values) => updateGarmentValues(job.key, values)} />
                          {/* This garment's own voice note, recorded the way the
                              measurements note is: record, hear it, Send or Delete.
                              Kept in the template's `audio_note` field, so it is
                              stored with the garment and played on its summary. */}
                          {job.template.sections.some(sec => sec.fields.some(f => f.key === 'audio_note')) && (
                            /* Up to ten, kept as a list ([{ url, by, at }]); a garment
                               saved before keeps its one clip (a URL) as the first. */
                            <VoiceRecorder
                              notes={voiceNoteList(job.values?.audio_note)}
                              onSend={async (blob) => {
                                const url = await api.uploadVoiceNote(blob);
                                const by = [currentUser?.first_name, currentUser?.last_name].filter(Boolean).join(' ') || currentUser?.name || currentUser?.email || '';
                                setGarmentJobs(prev => prev.map(j => (j.key === job.key
                                  ? { ...j, values: { ...j.values, audio_note: [...voiceNoteList(j.values?.audio_note), { url, by, at: new Date().toISOString() }] } } : j)));
                              }}
                              onDelete={(index) => setGarmentJobs(prev => prev.map(j => {
                                if (j.key !== job.key) return j;
                                const rest = { ...j.values };
                                const left = voiceNoteList(j.values?.audio_note).filter((_, i) => i !== index);
                                if (left.length) rest.audio_note = left; else delete rest.audio_note;
                                return { ...j, values: rest };
                              }))}
                            />
                          )}
                        </div>
                        </details>

                        {/* THE LOOK: part of this garment's own card, under its details. */}
                        <details id={`wz-design-${job.key}`} className="wz-sec">
                          <summary className="wz-sec-head">
                            <span className="wz-sec-icon" aria-hidden><Palette size={17} /></span>
                            <span className="wz-sec-titles">
                              <span className="wz-sec-title">{t('wizard.designTitle', 'Choose design')}</span>
                              <span className="wz-sec-sub">{t('wizard.designSub', 'How the look is decided, plus trims')}</span>
                            </span>
                            <ChevronDown size={18} className="wz-sec-chev" aria-hidden />
                          </summary>

                        {/* A petticoat is not designed: its styles as pictures, in
                            place of the three cards. The choice is the template's
                            petticoat_style, saved with the garment's other details. */}
                        {job.template?.key === 'petticoat' ? (
                          <PetticoatStylePicker value={job.values?.petticoat_style || ''}
                                                onChange={(style) => updateGarmentValues(job.key, { ...(job.values || {}), petticoat_style: style })} />
                        ) : (
                        /* The three ways to choose a design, side by side; a narrow screen stacks them as rows. */
                        <div className="wz-dchoices">
                          <div className="od-hint wz-dchoices-hint">{t('wizard.designChoiceHint', 'Use one or more: a look from our catalogue, the customer’s own photos, or a new design by our designer.')}</div>
                          <button
                            type="button"
                            className={`wz-dchoice${ partSelection[job.key] && Object.keys(partSelection[job.key]).length > 0 ? ' wz-dchoice--on' : '' }`}
                            onClick={() => setActiveDesignTab(prev => ({ ...prev, [job.key]: 'catalogue' }))}
                          >
                            <IconTile icon={Sparkles} tone={partSelection[job.key] && Object.keys(partSelection[job.key]).length > 0 ? 'green' : 'neutral'} size={40} iconSize={19} className="wz-dchoice-icon" />
                            <span className="wz-dchoice-title">{t('wizard.sheetCatalogue', 'Pick a look from our catalogue')}</span>
                            <span className="wz-dchoice-desc">Browse and choose design looks directly from your boutique catalogue.</span>
                            {partSelection[job.key] && Object.keys(partSelection[job.key]).length > 0 ? (
                              <span className="wz-dchoice-status wz-dchoice-status--on">✓ Design selected (Click to view/change)</span>
                            ) : (
                              <span className="wz-dchoice-status">Click to open catalogue →</span>
                            )}
                          </button>

                          <button
                            type="button"
                            className={`wz-dchoice${ partReferences[job.key] && Object.values(partReferences[job.key]).flat().length > 0 ? ' wz-dchoice--on' : '' }`}
                            onClick={() => setActiveDesignTab(prev => ({ ...prev, [job.key]: 'references' }))}
                          >
                            <IconTile icon={Camera} tone={partReferences[job.key] && Object.values(partReferences[job.key]).flat().length > 0 ? 'amber' : 'neutral'} size={40} iconSize={19} className="wz-dchoice-icon" />
                            <span className="wz-dchoice-title">{t('wizard.sheetPhotos', 'Photos & references from customer')}</span>
                            <span className="wz-dchoice-desc">Upload customer photos or add web links as reference for this garment.</span>
                            {partReferences[job.key] && Object.values(partReferences[job.key]).flat().length > 0 ? (
                              <span className="wz-dchoice-status wz-dchoice-status--on">
                                ✓ {Object.values(partReferences[job.key]).flat().length} reference(s) added
                              </span>
                            ) : (
                              <span className="wz-dchoice-status">Click to add photos or links →</span>
                            )}
                          </button>

                          {/* A new design by our designer: what used to be its own
                              door on the New order screen. It is the whole order's
                              choice (a designer is assigned once, for the order). */}
                          <button
                            type="button"
                            className={`wz-dchoice${serviceType === 'design' ? ' wz-dchoice--on' : ''}`}
                            aria-pressed={serviceType === 'design'}
                            onClick={() => setServiceType(prev => (prev === 'design' ? 'stitch' : 'design'))}
                          >
                            <IconTile icon={PenTool} tone={serviceType === 'design' ? 'green' : 'neutral'} size={40} iconSize={19} className="wz-dchoice-icon" />
                            <span className="wz-dchoice-title">{t('entry.serviceDesign', 'Design something new')}</span>
                            <span className="wz-dchoice-desc">{t('entry.serviceDesignDesc', 'Our designer draws it for the customer, then we stitch it.')}</span>
                            {serviceType === 'design' ? (
                              <span className="wz-dchoice-status wz-dchoice-status--on">✓ {t('wizard.designerChosenBelow', 'Pick the designer below (click to undo)')}</span>
                            ) : (
                              <span className="wz-dchoice-status">{t('wizard.askDesigner', 'Click to ask our designer →')}</span>
                            )}
                          </button>
                        </div>
                        )}

                        {/* Everything picked for this garment, split by where it
                            came from -- our catalogue, or the customer -- each
                            picture named by the part it was kept on. */}
                        {(() => {
                          const declared = job.template?.design_parts || [];
                          const order = new Map(declared.map((p, i) => [p.key, i]));
                          const label = (k) => declared.find(p => p.key === k)?.label || k.replace(/_/g, ' ');
                          const byPart = ([a], [b]) => (order.get(a) ?? 99) - (order.get(b) ?? 99);
                          const ours = Object.entries(job.design?.parts || {}).sort(byPart)
                            .filter(([, img]) => img?.image_url)
                            .map(([k, img]) => ({ key: `pick:${k}`, src: img.image_url, part: label(k), sub: img.design_title || '' }));
                          const theirs = Object.entries(job.design?.part_refs || {}).sort(byPart)
                            .flatMap(([k, list]) => (list || []).filter(r => r?.image_url).map(r => ({
                              key: `ref:${k}:${r.id}`, src: r.image_url, part: label(k),
                              sub: r.source === 'customer_link' ? t('wizard.customerLink', 'Link') : (r.design_title || t('wizard.customerPhoto', 'Photo')),
                            })));
                          if (!ours.length && !theirs.length) return null;
                          const group = (title, items) => items.length > 0 && (
                            <div style={{ marginTop: '12px' }}>
                              <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>{title} <span className="od-hint">· {items.length}</span></div>
                              <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))' }}>
                                {items.map(it => (
                                  <a key={it.key} href={resolveMediaUrl(it.src)} target="_blank" rel="noopener noreferrer"
                                     style={{ textDecoration: 'none', color: 'inherit', border: '1px solid var(--border-color)',
                                              borderRadius: '10px', overflow: 'hidden', background: 'var(--surface-color)' }}>
                                    <img src={resolveMediaUrl(it.src)} alt={it.part} loading="lazy"
                                         style={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', display: 'block' }} />
                                    <div style={{ padding: '5px 7px' }}>
                                      <div style={{ fontSize: '11.5px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.part}</div>
                                      <div style={{ fontSize: '10px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.sub}</div>
                                    </div>
                                  </a>
                                ))}
                              </div>
                            </div>
                          );
                          return (
                            <div className="wz-garment-section">
                              <div className="ui-eyebrow">{t('wizard.chosenForGarment', 'Chosen for this {name}', { name: job.template.name })}</div>
                              {group(t('wizard.fromOurCatalogue', 'From our catalogue'), ours)}
                              {group(t('wizard.fromCustomer', 'Uploaded by the customer'), theirs)}
                            </div>
                          );
                        })()}

                        {activeDesignTab[job.key] === 'catalogue' && (
                          <FormModal
                            icon={Sparkles}
                            tone="green"
                            title={`Catalogue Looks — ${job.template?.name || job.key}`}
                            subtitle="Browse and choose design looks directly from your boutique catalogue."
                            width="960px"
                            onClose={() => setActiveDesignTab(prev => ({ ...prev, [job.key]: null }))}
                            footer={
                              <button
                                type="button"
                                className="btn-primary"
                                style={{ padding: '8px 24px', fontSize: '13px' }}
                                onClick={() => setActiveDesignTab(prev => ({ ...prev, [job.key]: null }))}
                              >
                                Done
                              </button>
                            }
                          >
                            <Suspense fallback={<ScreenLoading />}>
                              <GarmentPartPicker
                                garmentKey={job.template?.key || job.key}
                                garmentName={job.template?.name || job.key}
                                selection={partSelection[job.key] || {}}
                                onChange={(next) => handlePartSelection(job.key, next)} />
                            </Suspense>
                          </FormModal>
                        )}

                        {activeDesignTab[job.key] === 'references' && (
                          <FormModal
                            icon={Camera}
                            tone="amber"
                            title={`Customer References — ${job.template?.name || job.key}`}
                            subtitle="Upload customer photos or add web links as reference for this garment."
                            width="920px"
                            onClose={() => setActiveDesignTab(prev => ({ ...prev, [job.key]: null }))}
                            footer={
                              <button
                                type="button"
                                className="btn-primary"
                                style={{ padding: '8px 24px', fontSize: '13px' }}
                                onClick={() => setActiveDesignTab(prev => ({ ...prev, [job.key]: null }))}
                              >
                                Done
                              </button>
                            }
                          >
                            <Suspense fallback={<ScreenLoading />}>
                              <GarmentPartPicker ownOnly
                                                 withoutWork={!job.values?.hand_work || job.values.hand_work === 'none'}
                                                 garmentKey={job.template?.key || job.key}
                                                 garmentName={job.template?.name || job.key}
                                                 references={partReferences[job.key] || {}}
                                                 onReferencesChange={(next) => handlePartReferences(job.key, next)} />
                            </Suspense>
                          </FormModal>
                        )}

                  {serviceType === 'design' && (
                    <div className="wz-designer">
                      <div className="wz-garment-head"><div className="wz-garment-name">{t('wizard.designerTitle', 'Who will design it?')}</div></div>
                      {/* No designer on the team: the person taking the order
                          designs it ("Me"), the only choice. */}
                      <div className="form-group">
                        <label className="form-label" htmlFor="wz-designer">{t('wizard.designer', 'Designer')} <span className="required">*</span></label>
                        <select id="wz-designer" className="form-control" value={designerChoice}
                                style={{ maxWidth: '320px' }}
                                onChange={(e) => setDesignRequest({ ...designRequest, designer: e.target.value })}>
                          {designers.length === 0 ? (
                            <option value={SELF_DESIGNER}>{selfDesignerLabel}</option>
                          ) : (
                            <>
                              <option value="">{t('wizard.pickDesigner', 'Pick a designer')}</option>
                              {designers.map((d) => <option key={d.id} value={d.id}>{d.name}{d.specialisation ? ` · ${d.specialisation}` : ''}</option>)}
                              {/* A draft saved as "Me" before the team had a designer. */}
                              {designerChoice === SELF_DESIGNER && <option value={SELF_DESIGNER}>{selfDesignerLabel}</option>}
                            </>
                          )}
                        </select>
                      </div>
                      <div className="form-group">
                        <label className="form-label" htmlFor="wz-brief">{t('wizard.brief', 'What does the customer want?')}</label>
                        <textarea id="wz-brief" className="form-control" rows={4} value={designRequest.brief} maxLength={LIMITS.note}
                                  onChange={(e) => setDesignRequest({ ...designRequest, brief: e.target.value })}
                                  placeholder={t('wizard.briefPlaceholder', 'e.g. A peplum blouse with a scalloped hem, in the green of the saree border.')} />
                        {/* Or say it: the same recorder the tailor's notes use. Text,
                            a voice note or both; the clip is held on the draft and
                            reaches the designer with the brief at confirm. */}
                        {/* Up to ten: each Send adds one (voice_notes); a draft
                            from before keeps its one voice_note as the first. */}
                        <VoiceRecorder
                          notes={voiceNoteList(designRequest.voice_notes, designRequest.voice_note)}
                          onSend={async (blob) => {
                            const url = await api.uploadVoiceNote(blob);
                            const by = [currentUser?.first_name, currentUser?.last_name].filter(Boolean).join(' ') || currentUser?.name || currentUser?.email || '';
                            setDesignRequest(prev => ({ ...prev, voice_note: null,
                              voice_notes: [...voiceNoteList(prev.voice_notes, prev.voice_note), { url, by, at: new Date().toISOString() }] }));
                          }}
                          onDelete={(index) => setDesignRequest(prev => ({ ...prev, voice_note: null,
                            voice_notes: voiceNoteList(prev.voice_notes, prev.voice_note).filter((_, i) => i !== index) }))}
                        />
                      </div>
                    </div>
                  )}

                        {/* Trims and accessories belong to the look, so they sit
                            under Design rather than Fabric (MOM, 2026-10-24). */}
                        <details className="wz-more wz-trims">
                          <summary><Package size={14} /> {t('wizard.sheetTrims', 'Trims & accessories')} <span className="od-hint">({t('common.optional', 'optional')})</span></summary>
                          {canSeeTab(currentUser, 'inventory') && (
                            <details className="wz-more wz-trims-group" open>
                              <summary><Package size={14} /> {t('wizard.sheetBoutiqueAccessories', 'Boutique Accessories & Trims')} <span className="od-hint">({t('common.optional', 'optional')})</span></summary>
                              <Suspense fallback={<ScreenLoading />}>
                                <GarmentFabricPicker
                                  garmentJobs={[job]}
                                  fabrics={fabrics}
                                  taxonomy={fabricTaxonomy}
                                  selection={fabricSelection}
                                  onChange={handleFabricSelection}
                                  accessoryDetails={{ [job.key]: job.accessories || {} }}
                                  onAccessoryDetailsChange={(jobKey, next) => setGarmentJobs(prev => prev.map(j => (j.key === jobKey ? { ...j, accessories: next } : j)))}
                                  accessoriesOnly />
                              </Suspense>
                            </details>
                          )}
                          <details className="wz-more wz-trims-group" open>
                            <summary><Package size={14} /> {t('wizard.sheetCustomerAccessories', 'Customer Accessories (My Accessories)')} <span className="od-hint">({t('common.optional', 'optional')})</span></summary>
                            <Suspense fallback={<ScreenLoading />}>
                              <GarmentPartPicker ownOnly isFabric accessoriesOnly
                                                 garmentKey={job.template?.key || job.key}
                                                 garmentName={job.template?.name || job.key}
                                                 taxonomy={fabricTaxonomy}
                                                 references={partReferences[job.key] || {}}
                                                 onReferencesChange={(next) => handlePartReferences(job.key, next)} />
                            </Suspense>
                          </details>
                        </details>
                        </details>

                        {/* FABRIC: part of this garment's own card, under its details. */}
                        <details id={`wz-fabric-${job.key}`} className="wz-sec">
                          <summary className="wz-sec-head">
                            <span className="wz-sec-icon" aria-hidden><Layers size={17} /></span>
                            <span className="wz-sec-titles">
                              <span className="wz-sec-title">{t('wizard.fabricTitle', 'Choose fabric')}</span>
                              <span className="wz-sec-sub">{t('wizard.fabricSub', 'Where the cloth comes from')}</span>
                            </span>
                            <ChevronDown size={18} className="wz-sec-chev" aria-hidden />
                          </summary>

                        {/* Where the cloth comes from -- the template's own
                            fabric_source field, so it travels with the garment. */}
                        {job.template.sections.some((sec) => sec.key === 'materials') && (
                          <div className="wz-garment-section">
                            <TemplateForm template={job.template} section="materials" values={job.values}
                                          errors={garmentErrors[job.key] || {}} only={(f) => f.key === 'fabric_source'}
                                          onChange={(values) => {
                                            updateGarmentValues(job.key, values);
                                            // "Need to buy": open a row below to say what and how much,
                                            // unless one is open already. Left blank, it is not recorded.
                                            if (values.fabric_source === 'buy' && (job.values?.fabric_source || 'inventory') !== 'buy'
                                                && !(job.purchases || []).some(r => !r.field_key)) {
                                              setGarmentJobs(prev => prev.map(j => (j.key === job.key
                                                ? { ...j, purchases: [...(j.purchases || []), { name: '', quantity: '', unit: 'METER', estimated_cost: '', required_by: '', notes: '' }] }
                                                : j)));
                                            }
                                          }} />
                          </div>
                        )}

                        {/* From our inventory, where this boutique has no fabric stock to
                            pick from (its plan has no Inventory): say so, not a blank space. */}
                        {!canSeeTab(currentUser, 'inventory') && (job.values?.fabric_source || 'inventory') === 'inventory' && (
                          <p className="od-hint" style={{ margin: '4px 0 10px' }}>
                            {t('wizard.noInventoryModule', 'Fabric stock is not part of this boutique’s plan, so there is no shelf to pick from here. The workroom will choose the fabric — or choose “Need to buy” to note what to buy.')}
                          </p>
                        )}

                        {canSeeTab(currentUser, 'inventory') && (job.values?.fabric_source || 'inventory') === 'inventory' && (
                          <details className="wz-more" open>
                            <summary><Layers size={14} /> {t('wizard.sheetFabric', 'Fabric from our stock')} <span className="od-hint">({t('common.optional', 'optional')})</span></summary>
                            <Suspense fallback={<ScreenLoading />}>
                              {fabrics.length === 0 ? (
                                <p className="od-hint" style={{ margin: '10px 0 0' }}>{t('wizard.noFabricInStock', 'No fabric in stock yet. The workroom can pick a roll later.')}</p>
                              ) : (
                                <>
                                  <FabricColorFilter fabrics={fabrics} value={fabricColorQuery} onChange={setFabricColorQuery} />
                                  <GarmentFabricPicker
                                    garmentJobs={[job]}
                                    fabrics={colourFilteredFabrics}
                                    taxonomy={fabricTaxonomy}
                                    selection={fabricSelection}
                                    onChange={handleFabricSelection} />
                                </>
                              )}
                            </Suspense>
                          </details>
                        )}

                        {(job.values?.fabric_source || 'inventory') === 'buy' && (
                          <p className="od-hint" style={{ margin: '4px 0 10px' }}>
                            {t('wizard.fabricToBuy', 'To be bought for this order. Note what and how much under Trims & accessories, or in the notes for the tailor.')}
                          </p>
                        )}

                        {/* Something the customer wants that the shelf does not
                            hold: bought for this order, tracked in Inventory →
                            To buy for orders. Never stock. */}
                        <div className="wz-garment-section">
                          <GarmentPurchases rows={job.purchases || []}
                                            onChange={(rows) => setGarmentJobs(prev => prev.map(j => (j.key === job.key ? { ...j, purchases: rows } : j)))} />
                        </div>
                        {/* The customer's own cloth, part by part: only once the
                            Fabric question says the customer provides it. */}
                        {(job.values?.fabric_source || 'inventory') === 'customer' && (
                          <details className="wz-more" open>
                            <summary><Layers size={14} /> {t('wizard.sheetCustomerFabric', 'Fabric the customer is bringing')}</summary>
                            <Suspense fallback={<ScreenLoading />}>
                              <GarmentPartPicker ownOnly isFabric
                                                 garmentKey={job.template?.key || job.key}
                                                 garmentName={job.template?.name || job.key}
                                                 taxonomy={fabricTaxonomy}
                                                 references={partReferences[job.key] || {}}
                                                 onReferencesChange={(next) => handlePartReferences(job.key, next)} />
                            </Suspense>
                          </details>
                        )}

                        </details>

                        {/* Move between garments from where the form ends, not
                            from the circles at the top. "Next" runs the footer's
                            own Next: same checks, same save, same next garment. */}
                        {garmentJobs.length > 1 && (() => {
                          const done = [...new Set([...garmentsDone, job.key])];
                          const nextJob = [...garmentJobs.slice(idx + 1), ...garmentJobs.slice(0, idx)].find(j => !done.includes(j.key));
                          const prevJob = garmentJobs[idx - 1];
                          if (!nextJob && !prevJob) return null;
                          return (
                            <div className="wz-gnav">
                              {prevJob ? (
                                <button type="button" className="btn-secondary" onClick={() => openGarmentAt(prevJob.key)}>
                                  <ArrowLeft size={16} /> {garmentLabel(prevJob)}
                                </button>
                              ) : <span />}
                              {nextJob && (
                                <button type="button" className="btn-primary" onClick={handleNext} disabled={ctaBusy}>
                                  {t('wizard.nextGarment', 'Next garment')}: {garmentLabel(nextJob)} <ArrowRight size={16} />
                                </button>
                              )}
                            </div>
                          );
                        })()}

                      </div>
                    );
                  })}

                  {/* Another garment, once this one is filled in. */}
                  {garmentJobs.length > 0 && (
                    <details ref={addMoreGarmentsRef} className="wz-more wz-addmore">
                      <summary><Plus size={14} /> {t('wizard.addMoreGarments', 'Add more garments to this order')}</summary>
                      <div style={{ marginTop: '10px' }}>
                        <DressesDropdown compact
                          title={t('wizard.addMoreGarments', 'Add more garments to this order')}
                          garmentTemplates={garmentsForGender(garmentTemplates, customerForm.gender)}
                          garmentJobs={garmentJobs}
                          addingGarmentKey={addingGarmentKey}
                          garmentTemplatesError={garmentTemplatesError}
                          loadGarmentTemplates={loadGarmentTemplates}
                          addGarments={async (keys) => {
                            await addGarments(keys);
                            if (addMoreGarmentsRef.current) addMoreGarmentsRef.current.open = false;
                          }}
                        />
                      </div>
                    </details>
                  )}

                </div>
                </div>
              </>
            )}

            {/* MEASUREMENTS: only the fields each garment's cut asks for. */}
            {wizardStepKey === 'measure' && (
              <>
                <div className="page-title-group">
                  <h1 className="page-title">{t('wizard.measurements', 'Measurements')}</h1>
                  <p className="page-subtitle">{t('wizard.measurementsSubtitle', 'Body measurements for every garment on this order. Each one asks only for what its cut needs.')}</p>
                </div>
                {garmentJobs.map((job) => {
                  const section = job.template.sections.find((sec) => sec.key === 'measurements');
                  if (!section) return null;

                  const customerM = customerForm?.measurements || {};
                  const mergedValues = { ...job.values };
                  let autoPrefilled = false;
                  (section.fields || []).forEach((f) => {
                    if ((mergedValues[f.key] === undefined || mergedValues[f.key] === null || mergedValues[f.key] === '') && f.unit) {
                      const fetched = getCustomerMeasurement(customerM, f.key);
                      if (fetched !== undefined && fetched !== null && fetched !== '') {
                        mergedValues[f.key] = fetched;
                        autoPrefilled = true;
                      }
                    }
                  });

                  const numeric = (section.fields || []).filter((f) => f.field_type === 'number' && !f.validation?.group);
                  const filledCount = numeric.filter((f) => mergedValues[f.key] !== undefined && mergedValues[f.key] !== null && mergedValues[f.key] !== '').length;
                  return (
                    <div className="content-card wz-card wz-measure-card" key={job.key} id={`wz-garment-${job.key}`}>
                      <div className="wz-measure-head">
                        <IconTile icon={Ruler} tone="green" size={36} iconSize={18} />
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div className="wz-measure-title">{garmentLabel(job)}</div>
                          {numeric.length > 0 && (
                            <div className="od-hint">
                              {t('wizard.measuredOf', '{done} of {total} measured, in inches', { done: filledCount, total: numeric.length })}
                            </div>
                          )}
                        </div>
                        {autoPrefilled && (
                          <span className="wz-measure-loaded">✓ {t('wizard.measurementsLoaded', 'Last measurements loaded')}</span>
                        )}
                      </div>
                      <TemplateForm
                        template={job.template}
                        section="measurements"
                        values={mergedValues}
                        errors={garmentErrors[job.key] || {}}
                        onChange={(values) => updateGarmentValues(job.key, values)}
                        only={(f) => f.field_type !== 'textarea'}
                      />
                      {/* The measurements added by hand sit with the figures, before the notes. */}
                      <ExtraMeasurements values={mergedValues} error={garmentErrors[job.key]?.[EXTRA_MEASUREMENTS]}
                                         onChange={(values) => updateGarmentValues(job.key, values)} />
                      {(section.fields || []).some((f) => f.field_type === 'textarea') && (
                        <div style={{ marginTop: '14px' }}>
                          <TemplateForm
                            template={job.template}
                            section="measurements"
                            values={mergedValues}
                            errors={garmentErrors[job.key] || {}}
                            onChange={(values) => updateGarmentValues(job.key, values)}
                            only={(f) => f.field_type === 'textarea'}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
                {!needsMeasurements() && (
                  <div className="content-card wz-card od-hint">{t('wizard.nothingToMeasure', 'Nothing to measure for these garments.')}</div>
                )}

                {/* The same recorder the workflow's stage review uses: record,
                    hear it back, Send keeps it under the sender's name, Delete
                    throws it away. Sent here means uploaded and held on the
                    draft; it lands on the order at confirm. */}
                <div className="content-card wz-card wz-measure-notes">
                  <Field label={t('wizard.notesForTailor', 'Notes for the tailor')}>
                    {/* The same note the "What" screen asks for; one field, two doors. */}
                    <VoiceTextarea className="form-control" rows={3} value={specialInstructions} maxLength={LIMITS.note}
                                   onChange={(e) => setSpecialInstructions(e.target.value)}
                                   placeholder={t('wizard.notesPlaceholder', 'e.g. padding, side zip, extra margin at the waist')} />
                    <VoiceRecorder
                      notes={measureVoiceNotes}
                      onSend={async (blob) => {
                        const url = await api.uploadVoiceNote(blob);
                        const by = [currentUser?.first_name, currentUser?.last_name].filter(Boolean).join(' ') || currentUser?.name || currentUser?.email || '';
                        setMeasureVoiceNotes(prev => [...prev, { url, by, at: new Date().toISOString() }]);
                      }}
                      onDelete={(index) => setMeasureVoiceNotes(prev => prev.filter((_, i) => i !== index))}
                    />
                  </Field>
                </div>
              </>
            )}

            {/* REVIEW: everything the order will say, on one page, before a
                price is put on it. Each card jumps back to the screen that
                owns it. */}
            {wizardStepKey === 'review' && (() => {
              const stepOf = (key) => wizardSteps.findIndex(st => st.key === key) + 1;
              const slotLabel = (garmentKey, slotKey) => {
                const g = (fabricTaxonomy?.garments || []).find(x => x.key === garmentKey);
                const slot = (g?.sections || []).flatMap(sec => sec.slots || []).find(sl => sl.key === slotKey);
                return slot?.label || slotKey.replace(/_/g, ' ');
              };
              const rollName = (id) => fabrics.find(f => String(f.id) === String(id))?.name || 'Stock item';
              
              const card = (title, step, body, extraClass = '') => (
                <div className={`content-card wz-card wz-review-card${extraClass ? ` ${extraClass}` : ''}`} style={{ padding: '16px 20px', gap: 0, marginTop: '-16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '18px', fontWeight: 500, margin: 0 }}>{title}</h2>
                    <button type="button" className="btn-secondary at-btn-sm" onClick={() => {
                      if (typeof step === 'string') {
                        const first = garmentJobs[0]?.key;
                        if (first) setActiveGarmentKey(first);
                        jumpToStep(stepOf('type'));
                        setTimeout(() => { const sec = document.getElementById(`wz-${step}-${first}`); if (sec) { sec.open = true; sec.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }, 80);
                      } else jumpToStep(step);
                    }}>
                      <Edit2 size={12} /> {t('common.edit', 'Edit')}
                    </button>
                  </div>
                  {body}
                </div>
              );
              
              const accessoryKeys = new Set(ALL_ACCESSORY_OPTIONS.map(o => o.key));
              const partName = (p, img) => img?.part_label || String(p).replace(/_/g, ' ');
              const withGarment = (job, list) => list.map(pic => ({
                ...pic, label: garmentJobs.length > 1 ? `${job.template?.name || job.key} · ${pic.label}` : pic.label }));
              const stockPics = (job, keep) => Object.entries(job.fabrics || {})
                .filter(([slotKey]) => keep(slotKey))
                .flatMap(([slotKey, ids]) => (ids || [])
                  .map(id => fabrics.find(f => String(f.id) === String(id)))
                  .filter(f => f?.image_url)
                  .map(f => ({ key: `${job.key}:${slotKey}:${f.id}`, image_url: f.image_url,
                               label: `${slotLabel(job.template?.key || job.key, slotKey)} · ${f.name}` })));
              const groups = [
                { key: 'design', title: t('wizard.reviewDesign', 'Design'), items: garmentJobs.flatMap(job => withGarment(job,
                  Object.entries(job.design?.parts || {}).filter(([, img]) => img?.image_url)
                    .map(([part, img]) => ({ key: `${job.key}:pick:${part}`, image_url: img.image_url,
                                              label: `${partName(part, img)} · ${img.design_title || 'from our catalogue'}` })))) },
                { key: 'fabric', title: t('wizard.sheetFabric', 'Fabric from our stock'), items: garmentJobs.flatMap(job => withGarment(job,
                  stockPics(job, k => !accessoryKeys.has(k)))) },
                { key: 'accessories', title: t('wizard.sheetBoutiqueAccessories', 'Boutique Accessories & Trims'), items: garmentJobs.flatMap(job => withGarment(job,
                  stockPics(job, k => accessoryKeys.has(k)))) },
                { key: 'customer', title: t('wizard.reviewCustomerPhotos', 'From the customer'), items: garmentJobs.flatMap(job => withGarment(job, [
                  ...Object.values(job.design?.part_refs || {}).flat().filter(r => r?.image_url)
                    .map(r => ({ key: `${job.key}:ref:${r.id}`, image_url: r.image_url,
                                 label: `${partName(r.part, r)} · ${r.design_title || 'reference'}` })),
                  ...(job.template?.sections || []).flatMap(sec => sec.fields)
                    .filter(f => f.field_type === 'file' && job.values?.[f.key])
                    .flatMap(f => (Array.isArray(job.values[f.key]) ? job.values[f.key] : [job.values[f.key]])
                      .filter(u => typeof u === 'string')
                      .map((u, i) => ({ key: `${job.key}:file:${f.key}:${i}`, image_url: u, label: f.label }))),
                ])) },
              ].filter(g => g.items.length > 0);
              const thumb = (pic, items, i) => (
                <figure key={pic.key} style={{ margin: 0, position: 'relative' }}>
                  <img src={resolveMediaUrl(pic.image_url)} alt="" loading="lazy"
                       style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: '10px',
                                border: '1px solid var(--border-color)', display: 'block' }} />
                  <button type="button" className="btn-secondary at-btn-sm"
                          style={{ position: 'absolute', top: '8px', right: '8px', minHeight: '28px', padding: '0 10px' }}
                          onClick={() => setReviewView({ items, index: i })}>
                    <Eye size={12} /> {t('common.view', 'View')}
                  </button>
                  <figcaption style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px', lineHeight: 1.3 }}>{pic.label}</figcaption>
                </figure>
              );
              const fabricLines = garmentJobs.flatMap(job =>
                Object.entries(job.fabrics || {}).flatMap(([slotKey, ids]) => (ids || []).map(id => ({
                  key: `${job.key}:${slotKey}:${id}`, garment: job.template?.name || job.key,
                  part: slotLabel(job.template?.key || job.key, slotKey), name: rollName(id),
                  qty: job.fabric_qty?.[`${slotKey}:${id}`],
                }))));
              return (
                <>
                  <div className="page-title-group">
                    <h1 className="page-title">{t('wizard.reviewTitle', 'Review and confirm')}</h1>
                    <p className="page-subtitle">{t('wizard.reviewSubtitle', 'Everything this order will say. Check it once; the price comes next.')}</p>
                  </div>

                  <div style={{ marginTop: '16px' }} />
                  {card(t('wizard.step.who', 'Customer'), stepOf('who'), (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <AvatarInitials name={`${customerForm.first_name} ${customerForm.last_name}`} size={40} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600 }}>{customerForm.first_name} {customerForm.last_name}</div>
                        <div className="od-hint">
                          {[formatMobile(customerForm.mobile_number), customerForm.gender, customerForm.city_region].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                    </div>
                  ))}

                  {card(t('wizard.step.type', 'Apparel'), stepOf('type'), (
                    <>
                      <div className={`ui-badge ${isMaggamOrder() ? 'ui-badge--warning' : 'ui-badge--neutral'}`} style={{ marginBottom: '10px' }}>
                        {isMaggamOrder()
                          ? t('wizard.maggamPath', 'Maggam order — goes through paper cutting, embroidery and its verification before the fabric is cut')
                          : t('wizard.stitchingPath', 'Plain stitching order — cut, then stitch')}
                        {isMaggamOrder() && garmentJobs.some(j => !j.values?.hand_work || j.values.hand_work === 'none')
                          && ` ${t('wizard.mixedPath', '· Garments without maggam skip it: cut, then stitch')}`}
                      </div>
                      <GarmentSummary jobs={garmentJobs.map(job => ({ key: job.key, template: { ...job.template, name: garmentLabel(job) }, values: job.values || {} }))} />
                    </>
                  ), 'wz-review-card--main')}

                  {groups.length > 0 && card(t('wizard.reviewPhotos', 'Photos & references'), 'design', (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {groups.map(group => (
                        <section key={group.key}>
                          <div className="ui-eyebrow" style={{ marginBottom: '8px' }}>
                            {group.title} <span className="ui-badge ui-badge--neutral" style={{ marginLeft: '6px' }}>{group.items.length}</span>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))', gap: '8px' }}>
                            {group.items.map((pic, i) => thumb(pic, group.items, i))}
                          </div>
                        </section>
                      ))}
                    </div>
                  ))}
                  {reviewView && (
                    <Suspense fallback={null}>
                      <ReviewLightbox items={reviewView.items} index={reviewView.index}
                                      onIndexChange={(i) => setReviewView({ ...reviewView, index: i })}
                                      onClose={() => setReviewView(null)} />
                    </Suspense>
                  )}

                  {/* "See it on a model": every garment drawn on a model, from its
                      designs and rolls -- here on the Review step, once the order's
                      garments are all chosen. Renders nothing where the vendor is
                      not set up and there is no base picture. The photograph lands
                      on job.design.preview and confirms with the rest. */}
                  <div className="wz-review-preview">
                    <Suspense fallback={null}>
                      <GarmentPreviews jobs={garmentJobs} title={t('wizard.reviewPreview', 'See it on a model')}
                      // Picked from the book, or typed in validly on the Customer step.
                      customer={{ id: customerId, name: customerName, mobile: customerForm.mobile_number,
                                  given: !!customerId || (!customerBlank() && !customerProblem()) }}
                      ensureCustomerId={ensureCustomerId}
                      // No customer yet: back to the Customer step, as the stepper does.
                      onCustomer={() => { jumpToStep(wizardSteps.findIndex(s => s.key === 'who') + 1); window.scrollTo(0, 0); }}
                      onPreview={(jobKey, url, backUrl, { presentation, annotations } = {}) => {
                        // Each kind of picture has its own place: a mannequin, the sketch (with
                        // its labels), the customer's own photo (shared with the Review step),
                        // or the standard model.
                        const ai = customerForm.ai_model || {};
                        const update = presentation === 'sketch'
                          ? { sketch_preview: url, sketch_labels: annotations || [] }
                          : presentation === 'mannequin'
                            ? { mannequin_preview: url, mannequin_preview_back: backUrl || null }
                            : ai.mode === 'customer' && ai.consent && ai.photo
                              ? { customer_preview: url, customer_preview_back: backUrl || null }
                              : { preview: url, preview_back: backUrl || null };
                        setGarmentJobs(prev => prev.map(j => j.key === jobKey
                          ? { ...j, design: { ...(j.design || {}), ...update } } : j));
                      }}
                      // Rides customerForm, so it is saved with the draft; a different customer picked resets it.
                      aiModel={customerForm.ai_model}
                      onAiModel={(ai_model) => {
                        // A new (or removed) customer photo: the customer's pictures show the
                        // old person, so they go; the standard model's stay.
                        if ((ai_model.photo || '') !== (customerForm.ai_model?.photo || '')) {
                          setGarmentJobs(prev => prev.map(j => (j.design ? { ...j, design: { ...j.design,
                            customer_preview: '', customer_preview_back: null } } : j)));
                        }
                        setCustomerForm(prev => ({ ...prev, ai_model }));
                      }}
                      />
                    </Suspense>
                  </div>

                  {/* Only with the customer's consent and photo, chosen on the Garments step. */}
                  {customerForm.ai_model?.mode === 'customer' && customerForm.ai_model.consent && customerForm.ai_model.photo
                    && card(t('wizard.reviewOnCustomer', 'AI pictures on the customer'), 'design', (
                    <Suspense fallback={null}>
                      <GarmentPreviews jobs={garmentJobs} customerPhoto={customerForm.ai_model.photo}
                        customer={{ id: customerId, given: true }} ensureCustomerId={ensureCustomerId}
                        onPreview={(jobKey, url, backUrl) => setGarmentJobs(prev => prev.map(j => j.key === jobKey
                          ? { ...j, design: { ...(j.design || {}), customer_preview: url, customer_preview_back: backUrl || null } } : j))} />
                    </Suspense>
                  ))}

                  {garmentJobs.some(job => (job.purchases || []).length) && card(t('wizard.sheetPurchases', 'To buy for this order'), 'fabric', (
                    <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
                      <tbody>
                        {garmentJobs.flatMap(job => (job.purchases || []).map((row, i) => (
                          <tr key={`${job.key}:${i}`} style={{ borderTop: '1px solid var(--border-color)' }}>
                            <td style={{ padding: '8px 0', color: 'var(--text-secondary)' }}>{garmentLabel(job)}</td>
                            <td style={{ padding: '8px 0', fontWeight: 600 }}>🛒 {row.name}</td>
                            <td style={{ padding: '8px 0', textAlign: 'right' }}>{row.quantity} {(row.unit || 'METER').toLowerCase()} · {inr(row.estimated_cost)} est.</td>
                          </tr>
                        )))}
                      </tbody>
                    </table>
                  ))}
                  {fabricLines.length > 0 && card(t('wizard.sheetFabric', 'Fabric from our stock'), 'fabric', (
                    <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
                      <tbody>
                        {fabricLines.map(line => (
                          <tr key={line.key} style={{ borderTop: '1px solid var(--border-color)' }}>
                            <td style={{ padding: '8px 0', color: 'var(--text-secondary)' }}>{line.garment} · {line.part}</td>
                            <td style={{ padding: '8px 0', fontWeight: 600 }}>{line.name}</td>
                            <td style={{ padding: '8px 0', textAlign: 'right' }}>{line.qty ? `${line.qty} m` : <span className="od-hint">no quantity</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ))}
                  {/* The ticked accessories, each with its type ("Self", "Other: ...")
                      and measurement, as saved on the garment. */}
                  {garmentJobs.some(job => Object.keys(job.accessories || {}).length) && card(t('wizard.sheetAccessories', 'Accessories'), 'design', (
                    <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
                      <tbody>
                        {garmentJobs.flatMap(job => Object.entries(job.accessories || {}).map(([key, d]) => (
                          <tr key={`${job.key}:${key}`} style={{ borderTop: '1px solid var(--border-color)' }}>
                            <td style={{ padding: '8px 0', color: 'var(--text-secondary)' }}>
                              {garmentLabel(job)} · {ALL_ACCESSORY_OPTIONS.find(o => o.key === key)?.label || key}
                            </td>
                            <td style={{ padding: '8px 0', fontWeight: 600 }}>
                              {d?.style === 'Other' ? (d.other ? `Other: ${d.other}` : 'Other') : (d?.style || '—')}
                            </td>
                            <td style={{ padding: '8px 0', textAlign: 'right' }}>{d?.measure || <span className="od-hint">no measurement</span>}</td>
                          </tr>
                        )))}
                      </tbody>
                    </table>
                  ))}

                  {serviceType === 'design' && card(t('wizard.designerTitle', 'Who will design it?'), 'design', (
                    <div style={{ fontSize: '14px' }}>
                      {designerChoice === SELF_DESIGNER ? selfDesignerLabel
                        : designers.find(d => String(d.id) === String(designerChoice))?.name || designerChoice || <span className="od-hint">Not picked</span>}
                      {designRequest.brief && <div className="od-hint" style={{ marginTop: '4px' }}>{designRequest.brief}</div>}
                      {voiceNoteList(designRequest.voice_notes, designRequest.voice_note).map((note, i) => (
                        <VoiceNotePlayer key={`${note.url}:${i}`} src={note.url} />
                      ))}
                    </div>
                  ))}
                </>
              );
            })()}

            {/* MONEY: when it is promised for, what it costs, what was paid. */}
            {wizardStepKey === 'money' && (
              <>
                <div className="page-title-group">
                  <h1 className="page-title">{t('wizard.moneyTitle', 'Complete the order & invoice')}</h1>
                  <p className="page-subtitle">{t('wizard.moneySubtitle', 'A price per garment, the date it is promised for, and anything paid now.')}</p>
                </div>

                {wizardError && (
                  <div role="alert" className="wz-error">
                    <span>{wizardError}</span>
                    <button type="button" className="btn-ghost at-btn-sm" onClick={() => setWizardError(null)} aria-label={t('common.dismiss', 'Dismiss')}><X size={14} /></button>
                  </div>
                )}

                <div className="content-card wz-card wz-money-card">
                  <div className="form-group" style={{ maxWidth: '260px' }}>
                    <label className="form-label" htmlFor="wz-ready">{t('wizard.readyBy', 'Ready by')} <span className="required">*</span></label>
                    <input id="wz-ready" type="date" className="form-control" value={readyBy} min={todayIso()}
                           onChange={(e) => setReadyBy(e.target.value)} />
                  </div>

                  {/* Each garment's optional questions (urgency, trial and the
                      like), here beside the date and the price they bear on. */}
                  {garmentJobs.map((job) => {
                    const sections = ['basic', 'style'].filter((k) => job.template.sections.some((sec) => sec.key === k));
                    const foldedAway = (f) => f.key !== 'delivery_date' && !f.is_required && !f.visible_when;
                    const hasOptional = sections.some((k) => (job.template.sections.find((sec) => sec.key === k)?.fields || []).some((f) => foldedAway(f) && f.field_type !== 'file'));
                    if (!hasOptional) return null;
                    return (
                      <details key={job.key} className="wz-more" style={{ marginBottom: '12px' }}>
                        <summary>{garmentJobs.length > 1 ? `${job.template.name} · ` : ''}{t('wizard.moreDetails', 'More details')} <span className="od-hint">({t('common.optional', 'optional')})</span></summary>
                        {sections.map((sectionKey) => (
                          <div key={sectionKey} className="wz-garment-section">
                            <TemplateForm template={job.template} section={sectionKey} values={job.values}
                                          errors={garmentErrors[job.key] || {}} only={foldedAway}
                                          purchases={job.purchases || []} onPurchaseChange={(fieldKey, row) => updateGarmentPurchase(job.key, fieldKey, row)}
                                          onChange={(values) => updateGarmentValues(job.key, values)} />
                          </div>
                        ))}
                      </details>
                    );
                  })}

                  {/* "Price not decided yet": the order is placed without
                      prices, which are added on the order page later. */}
                  <label className="wz-price-later" style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '4px 0 12px', fontSize: '14px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={Boolean(quotePrices.price_later)}
                           onChange={(e) => setQuotePrices({ ...quotePrices, price_later: e.target.checked })} />
                    {t('wizard.priceLater', 'Price not decided yet')}
                  </label>
                  <div className="wz-money">
                    {quotePrices.price_later ? (
                      <div className="od-hint" style={{ marginBottom: '4px' }}>
                        {t('wizard.priceLaterHint', 'The prices are added on the order later (Prices). No invoice is sent to the customer until then.')}
                      </div>
                    ) : (
                    <>
                    {garmentJobs.map((job) => (
                      <div key={job.key} className="wz-money-row">
                        <label htmlFor={`wz-price-${job.key}`} className="wz-money-label">{job.template.name}</label>
                        <div className="wz-money-input">
                          <span>₹</span>
                          <input id={`wz-price-${job.key}`} type="number" min="0" max={LIMITS.amount} step="1" inputMode="decimal" className="form-control"
                                 value={job.pricing?.base ?? ''} placeholder={serviceType === 'design' ? t('wizard.quoteLater', 'quote later') : '0'}
                                 onChange={(e) => setJobPrice(job.key, 'base', cleanAmount(e.target.value))} />
                        </div>
                      </div>
                    ))}
                    {garmentJobs.flatMap((job) => jobExtras(job).map(([key, label]) => (
                      <div key={`${job.key}-${key}`} className="wz-money-row">
                        <label htmlFor={`wz-extra-${job.key}-${key}`} className="wz-money-label" style={{ paddingLeft: '16px' }}>
                          {job.template.name} · {label} <span className="od-hint">({t('wizard.extraWork', 'extra work')})</span>
                        </label>
                        <div className="wz-money-input">
                          <span>₹</span>
                          <input id={`wz-extra-${job.key}-${key}`} type="number" min="0" max={LIMITS.amount} step="1" inputMode="decimal" className="form-control"
                                 value={job.pricing?.extras?.[key] ?? ''} placeholder="0"
                                 onChange={(e) => setJobExtra(job.key, key, cleanAmount(e.target.value))} />
                        </div>
                      </div>
                    )))}
                    {/* Fabric and accessories from our stock: the amount is
                        entered here, once the measurements are in; the price is
                        that amount × the item's selling price from Inventory. */}
                    {garmentJobs.flatMap((job) => jobMaterialCharges(job).map((line) => {
                      const unit = !line.item?.unit || line.item.unit === 'METER' ? 'm' : line.item.unit === 'PIECE' ? 'pcs' : String(line.item.unit).toLowerCase();
                      return (
                        <div key={`${job.key}-${line.key}`} className="wz-money-row">
                          <span className="wz-money-label" style={{ paddingLeft: '16px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <span>
                              {job.template.name} · {line.item?.name || t('wizard.stockItem', 'Stock item')}{' '}
                              <span className="od-hint">
                                ({line.item?.is_accessory ? t('wizard.accessory', 'accessory') : t('wizard.fabric', 'fabric')} · {line.rate ? `${inr(line.rate)}/${unit}` : t('wizard.noPriceSet', 'no price set')})
                              </span>
                            </span>
                            {line.editable ? (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <input inputMode="decimal" className="form-control" style={{ width: '80px', padding: '4px 8px' }}
                                       placeholder={unit === 'm' ? t('wizard.metres', 'metres') : t('wizard.qty', 'qty')}
                                       aria-label={`${line.item?.name || ''} · ${unit}`}
                                       value={line.quantity}
                                       onChange={(e) => handleFabricQuantity(job.key, line.slot, line.id, cleanAmount(e.target.value, { max: LIMITS.quantity, decimals: 3 }))} />
                                <span className="od-hint">{unit}</span>
                              </span>
                            ) : (
                              <span className="od-hint">{line.quantity} {unit}</span>
                            )}
                          </span>
                          <div className="wz-money-input">
                            <span>₹</span>
                            <input type="number" className="form-control" value={line.amount} readOnly tabIndex={-1}
                                   aria-label={`${job.template.name} · ${line.item?.name || ''}`} />
                          </div>
                        </div>
                      );
                    }))}
                    <div className="wz-money-row">
                      <label htmlFor="wz-packaging" className="wz-money-label">{t('wizard.packaging', 'Packaging & handling')}</label>
                      <div className="wz-money-input">
                        <span>₹</span>
                        <input id="wz-packaging" type="number" min="0" max={LIMITS.amount} step="1" inputMode="decimal" className="form-control"
                               value={quotePrices.packaging ?? ''} onChange={(e) => setQuotePrices({ ...quotePrices, packaging: cleanAmount(e.target.value) })} />
                      </div>
                    </div>
                    <div className="wz-money-row">
                      <label htmlFor="wz-discount" className="wz-money-label">{t('wizard.discount', 'Discount')} <span className="od-hint">({t('common.optional', 'optional')})</span></label>
                      <div className="wz-money-input">
                        <span>₹</span>
                        <input id="wz-discount" type="number" min="0" max={LIMITS.amount} step="1" inputMode="decimal" className="form-control"
                               value={quotePrices.discount || ''} placeholder="0" onChange={(e) => setQuotePrices({ ...quotePrices, discount: cleanAmount(e.target.value) })} />
                      </div>
                    </div>
                    <div className="wz-money-row">
                      <label htmlFor="wz-gst" className="wz-money-label">{t('wizard.gstInput', 'GST')} <span className="od-hint">({t('common.optional', 'optional')})</span></label>
                      <div className="wz-money-input">
                        <select className="form-control" aria-label={t('wizard.gstAs', 'GST as')} style={{ width: '64px', textAlign: 'left' }}
                                value={quotePrices.gst_mode || 'percent'}
                                onChange={(e) => setQuotePrices({ ...quotePrices, gst_mode: e.target.value,
                                  gst_value: cleanAmount(quotePrices.gst_value, { max: e.target.value === 'amount' ? LIMITS.amount : 100 }) })}>
                          <option value="percent">%</option>
                          <option value="amount">₹</option>
                        </select>
                        <input id="wz-gst" type="number" min="0" max={quotePrices.gst_mode === 'amount' ? LIMITS.amount : 100} step="0.01" inputMode="decimal" className="form-control"
                               value={quotePrices.gst_value || ''} placeholder="0"
                               onChange={(e) => setQuotePrices({ ...quotePrices, gst_value: cleanAmount(e.target.value, { max: quotePrices.gst_mode === 'amount' ? LIMITS.amount : 100 }) })} />
                      </div>
                    </div>
                    <div className="wz-money-total">
                      <div><span>{quotePrices.gst_mode !== 'amount' && parseFloat(quotePrices.gst_value || 0) > 0 ? `GST ${parseFloat(quotePrices.gst_value)}%` : 'GST'}</span><strong>{inr(getTaxes())}</strong></div>
                      <div className="wz-money-grand"><span>{t('wizard.total', 'Total')}</span><strong>{inr(getTotalPrice())}</strong></div>
                    </div>
                    </>
                    )}
                    <div className="wz-money-row">
                      <label htmlFor="wz-advance" className="wz-money-label">{t('wizard.advanceNow', 'Advance paid now')}</label>
                      <div className="wz-money-input">
                        <span>₹</span>
                        <input id="wz-advance" type="number" min="0" max={LIMITS.amount} step="1" inputMode="decimal" className="form-control"
                               value={advancePaymentAmount || ''} placeholder="0"
                               onChange={(e) => setAdvancePaymentAmount(cleanAmount(e.target.value))} />
                      </div>
                    </div>
                    <div className="od-hint" style={{ textAlign: 'right' }}>
                      {quotePrices.price_later
                        ? t('wizard.balanceWhenPriced', 'The balance is worked out when the prices are added.')
                        : Number(advancePaymentAmount) >= getTotalPrice() && getTotalPrice() > 0
                        ? t('wizard.paidInFull', 'Paid in full')
                        : `${t('wizard.balanceAtDelivery', 'Balance at delivery')}: ${inr(Math.max(0, getTotalPrice() - Number(advancePaymentAmount || 0)))}`}
                    </div>
                  </div>
                  <p className="od-hint" style={{ marginTop: '14px' }}>
                    {t('wizard.termsPrinted', 'The boutique’s terms are printed on the invoice the customer receives.')}
                  </p>
                </div>
              </>
            )}

            {/* ALTER, screen 2: which garment we made. */}
            {wizardStepKey === 'garment' && (
              <>
                <div className="page-title-group">
                  <h1 className="page-title">{t('wizard.alterGarmentTitle', 'Which garment?')}</h1>
                  <p className="page-subtitle">{t('wizard.alterGarmentSubtitle', 'One of the garments we delivered to this customer.')}</p>
                </div>
                <div className="content-card wz-card">
                  {alterCandidates.length === 0 ? (
                    <div className="od-empty" style={{ textAlign: 'left' }}>
                      {t('wizard.noDeliveredGarmentsOutside', 'Nothing we made has been delivered to this customer yet. If the garment was stitched elsewhere, take it in under')}{' '}
                      <button type="button" className="at-link" onClick={() => setAlterOutside(true)}>
                        {t('wizard.alterOutside', 'Stitched elsewhere')}
                      </button>.
                    </div>
                  ) : (
                    <div className="wz-choices" role="radiogroup" aria-label={t('wizard.alterGarmentTitle', 'Which garment?')}>
                      {alterCandidates.map(({ order, job }) => {
                        const picked = alterPick?.job.id === job.id;
                        return (
                          <button type="button" key={job.id} role="radio" aria-checked={picked}
                                  className={`wz-choice${picked ? ' wz-choice--on' : ''}`}
                                  onClick={() => setAlterationForm({ ...alterationForm, orderId: order.order_id, garmentJobId: job.id })}>
                            <IconTile icon={Shirt} tone={picked ? 'green' : 'neutral'} size={40} iconSize={18} />
                            <span style={{ minWidth: 0, flex: 1 }}>
                              <span className="wz-match-name">{job.display_name || job.template_name || t('wizard.garment', 'Garment')}</span>
                              <span className="od-hint" style={{ display: 'block' }}>
                                {t('wizard.order', 'Order')} {orderRef(order)}{order.estimated_delivery ? ` · ${t('wizard.delivered', 'delivered')} ${fmtDate(order.estimated_delivery)}` : ''}
                              </span>
                            </span>
                            {picked && <Check size={18} />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ALTER, screen 3: what is wrong, free or paid, anything paid now. */}
            {wizardStepKey === 'issue' && (
              <>
                <div className="page-title-group">
                  <h1 className="page-title">{t('wizard.alterIssueTitle', 'What needs changing?')}</h1>
                  <p className="page-subtitle">{t('wizard.alterIssueSubtitle', 'It goes to the workshop like any order, numbered under the order it came from.')}</p>
                </div>
                {wizardError && (
                  <div role="alert" className="wz-error">
                    <span>{wizardError}</span>
                    <button type="button" className="btn-ghost at-btn-sm" onClick={() => setWizardError(null)} aria-label={t('common.dismiss', 'Dismiss')}><X size={14} /></button>
                  </div>
                )}
                <div className="content-card wz-card">
                  <div className="form-group">
                    <label className="form-label" htmlFor="wz-issue">{t('wizard.alterIssue', 'What is wrong')} <span className="required">*</span></label>
                    <VoiceTextarea id="wz-issue" className="form-control" rows={4} value={alterationForm.issue} maxLength={LIMITS.note}
                              onChange={(e) => setAlterationForm({ ...alterationForm, issue: e.target.value })}
                              placeholder={t('wizard.alterIssuePlaceholder', 'e.g. Waist too tight, let out by an inch. Sleeve length short.')} />
                  </div>
                  {/* Required: the garment as it came back, before any work. */}
                  <div className="form-group">
                    <span className="form-label">{t('wizard.outPhoto', 'Photo as it came in')} <span className="required">*</span></span>
                    {outsidePhoto ? (
                      <div className="wz-out-photo">
                        <img src={outsidePhoto.url} alt={t('wizard.outPhotoAlt', 'The garment as it came in')} />
                        <div className="wz-out-photo-meta">
                          <span className="wz-out-photo-name">{outsidePhoto.file.name}</span>
                          <button type="button" className="btn-secondary at-btn-sm" onClick={() => setOutsidePhoto(null)}>
                            <X size={13} /> {t('common.remove', 'Remove')}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <Dropzone compact camera
                                onFiles={([file]) => {
                                  if (!file) return;
                                  const bad = imageFilesError([file]);
                                  if (bad) { alert(bad); return; }
                                  setOutsidePhoto({ file, url: URL.createObjectURL(file) });
                                }}
                                title={t('wizard.outPhotoDrop', 'Drop a photo here')}
                                subtitle={t('wizard.outPhotoOr', 'or choose a photo')}
                                chooseLabel={t('wizard.outPhotoChoose', 'Choose photo')} />
                    )}
                  </div>
                  <div className="form-group">
                    <span className="form-label">{t('wizard.alterKind', 'Who pays')}</span>
                    <div className="at-seg" role="group">
                      <button type="button" aria-pressed={alterationForm.type === 'FREE_BOUTIQUE_FAULT'}
                              onClick={() => setAlterationForm({ ...alterationForm, type: 'FREE_BOUTIQUE_FAULT', charge: '', paidNow: '' })}>
                        {t('wizard.alterFree', 'Free · our fault')}
                      </button>
                      <button type="button" aria-pressed={alterationForm.type === 'PAID_CLIENT_REQUEST'}
                              onClick={() => setAlterationForm({ ...alterationForm, type: 'PAID_CLIENT_REQUEST' })}>
                        {t('wizard.alterPaid', 'Paid · customer request')}
                      </button>
                    </div>
                  </div>
                  {alterationForm.type === 'PAID_CLIENT_REQUEST' && (
                    <div className="form-grid-2">
                      <div className="form-group">
                        <label className="form-label" htmlFor="wz-charge">{t('wizard.alterCharge', 'Charge')} <span className="od-hint">({t('common.optional', 'optional')})</span></label>
                        <input id="wz-charge" type="number" min="0" max={LIMITS.amount} step="1" inputMode="decimal" className="form-control" value={alterationForm.charge}
                               onChange={(e) => setAlterationForm({ ...alterationForm, charge: cleanAmount(e.target.value) })} placeholder="0" />
                      </div>
                      <div className="form-group">
                        <label className="form-label" htmlFor="wz-paidnow">{t('wizard.alterPaidNow', 'Paid now')} <span className="od-hint">({t('common.optional', 'optional')})</span></label>
                        <input id="wz-paidnow" type="number" min="0" max={LIMITS.amount} step="1" inputMode="decimal" className="form-control" value={alterationForm.paidNow}
                               onChange={(e) => setAlterationForm({ ...alterationForm, paidNow: cleanAmount(e.target.value) })} placeholder="0" />
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
            {/* OUTSIDE GARMENT, screen 2: what was brought in. No order of
                ours names it, so it is described, and photographed as it
                arrived -- the record of what was already wrong. */}
            {wizardStepKey === 'outGarment' && (
              <div className="wz-who-wrap">
                <div className="page-title-group">
                  <h1 className="page-title">{t('wizard.outGarmentTitle', 'What garment is it?')}</h1>
                  <p className="page-subtitle">{t('wizard.outGarmentSubtitle', 'Stitched elsewhere. Say what it is, and take a photo of it as it came in.')}</p>
                </div>
                <div className="content-card wz-card wz-who">
                  <div className="wz-who-row">
                    <div className="form-group">
                      <label className="form-label" htmlFor="wz-out-type">{t('wizard.outGarmentType', 'Garment type')}</label>
                      <select id="wz-out-type" className="form-control" value={outsideForm.templateId}
                              onChange={(e) => setOutsideForm({ ...outsideForm, templateId: e.target.value })}>
                        <option value="">{t('wizard.outGarmentOther', 'Other (describe it)')}</option>
                        {garmentTemplates.map((tpl) => <option key={tpl.id} value={tpl.id}>{tpl.name}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="wz-out-note">
                        {t('wizard.outGarmentNote', 'About the garment')}{' '}
                        {outsideForm.templateId
                          ? <span className="od-hint">({t('common.optional', 'optional')})</span>
                          : <span className="required">*</span>}
                      </label>
                      <input id="wz-out-note" className="form-control" maxLength={200} value={outsideForm.note}
                             onChange={(e) => setOutsideForm({ ...outsideForm, note: e.target.value })}
                             placeholder={t('wizard.outGarmentNotePlaceholder', 'e.g. Green silk blouse, bought in Chennai')} />
                    </div>
                  </div>
                  <div className="form-group">
                    <span className="form-label">{t('wizard.outPhoto', 'Photo as it came in')} <span className="required">*</span></span>
                    {outsidePhoto ? (
                      <div className="wz-out-photo">
                        <img src={outsidePhoto.url} alt={t('wizard.outPhotoAlt', 'The garment as it came in')} />
                        <div className="wz-out-photo-meta">
                          <span className="wz-out-photo-name">{outsidePhoto.file.name}</span>
                          <button type="button" className="btn-secondary at-btn-sm" onClick={() => setOutsidePhoto(null)}>
                            <X size={13} /> {t('common.remove', 'Remove')}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <Dropzone compact camera
                                onFiles={([file]) => {
                                  if (!file) return;
                                  setOutsidePhoto({ file, url: URL.createObjectURL(file) });
                                }}
                                title={t('wizard.outPhotoDrop', 'Drop a photo here')}
                                subtitle={t('wizard.outPhotoOr', 'or choose a photo')}
                                chooseLabel={t('wizard.outPhotoChoose', 'Choose photo')} />
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* OUTSIDE GARMENT, screen 3: what needs changing, and the charge. */}
            {wizardStepKey === 'outIssue' && (
              <div className="wz-who-wrap">
                <div className="page-title-group">
                  <h1 className="page-title">{t('wizard.alterIssueTitle', 'What needs changing?')}</h1>
                  <p className="page-subtitle">{t('wizard.outIssueSubtitle', 'Always a paid job: the garment is not one of ours. The charge can be set after inspection.')}</p>
                </div>
                {wizardError && (
                  <div role="alert" className="wz-error">
                    <span>{wizardError}</span>
                    <button type="button" className="btn-ghost at-btn-sm" onClick={() => setWizardError(null)} aria-label={t('common.dismiss', 'Dismiss')}><X size={14} /></button>
                  </div>
                )}
                <div className="content-card wz-card wz-who">
                  <div className="wz-who-row wz-who-row--even">
                    <div className="form-group">
                      <label className="form-label" htmlFor="wz-out-request">{t('wizard.outRequest', 'Customer’s request')} <span className="required">*</span></label>
                      <VoiceTextarea id="wz-out-request" className="form-control" rows={2} maxLength={LIMITS.note} value={outsideForm.request}
                                     onChange={(e) => setOutsideForm({ ...outsideForm, request: e.target.value })}
                                     placeholder={t('wizard.outRequestPlaceholder', 'The sleeves are too tight…')} />
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="wz-out-adjust">{t('wizard.outAdjustments', 'Adjustments')} <span className="od-hint">({t('wizard.onePerLine', 'one per line')})</span></label>
                      <VoiceTextarea id="wz-out-adjust" className="form-control" rows={2} maxLength={LIMITS.note} value={outsideForm.adjustments}
                                     onChange={(e) => setOutsideForm({ ...outsideForm, adjustments: e.target.value })}
                                     placeholder={t('wizard.outAdjustmentsPlaceholder', 'e.g. sleeve: let out 1 inch')} />
                    </div>
                  </div>
                  <div className="form-group">
                    <span className="form-label">{t('wizard.outScale', 'How big is the job?')} <span className="od-hint">({t('common.optional', 'optional')})</span></span>
                    <div className="at-seg" role="group">
                      <button type="button" aria-pressed={outsideForm.scale === 'SMALL'}
                              onClick={() => setOutsideForm({ ...outsideForm, scale: outsideForm.scale === 'SMALL' ? '' : 'SMALL' })}>
                        {t('wizard.outScaleSmall', 'Small · a quick fix')}
                      </button>
                      <button type="button" aria-pressed={outsideForm.scale === 'BIG'}
                              onClick={() => setOutsideForm({ ...outsideForm, scale: outsideForm.scale === 'BIG' ? '' : 'BIG' })}>
                        {t('wizard.outScaleBig', 'Big · more work, more time')}
                      </button>
                    </div>
                  </div>
                  <div className="wz-who-row wz-who-row--three">
                    <div className="form-group">
                      <label className="form-label" htmlFor="wz-out-charge">{t('wizard.alterCharge', 'Charge')} <span className="od-hint">({t('common.optional', 'optional')})</span></label>
                      <input id="wz-out-charge" type="number" min="0" max={LIMITS.amount} step="1" inputMode="decimal" className="form-control" value={outsideForm.charge}
                             onChange={(e) => setOutsideForm({ ...outsideForm, charge: cleanAmount(e.target.value) })} placeholder="0" />
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="wz-out-paid">{t('wizard.alterPaidNow', 'Paid now')} <span className="od-hint">({t('common.optional', 'optional')})</span></label>
                      <input id="wz-out-paid" type="number" min="0" max={LIMITS.amount} step="1" inputMode="decimal" className="form-control" value={outsideForm.paidNow}
                             onChange={(e) => setOutsideForm({ ...outsideForm, paidNow: cleanAmount(e.target.value) })} placeholder="0" />
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="wz-out-notes">{t('wizard.outNotes', 'Notes')} <span className="od-hint">({t('common.optional', 'optional')})</span></label>
                      <input id="wz-out-notes" className="form-control" maxLength={LIMITS.note} value={outsideForm.notes}
                             onChange={(e) => setOutsideForm({ ...outsideForm, notes: e.target.value })} />
                    </div>
                  </div>
                </div>
              </div>
            )}
            </div>

          </div>
        </div>
      )}

      {/* CONFIRMED VIEW */}
      {view === 'confirmed' && confirmedOrder && (() => {
        const confirmedCustomerName = (
          confirmedOrder.customer_name
          || `${customerForm.first_name || ''} ${customerForm.last_name || ''}`.trim()
          || 'the customer');
        return (
        <div className="order-confirmed-container">
          <div className="success-badge-container">
            <div className="success-circle"><Check size={40} /></div>
            {/* The owner or a master places this order at the counter, with
                the customer standing in front of them or not there at all.
                Addressed to "you", the screen thanked the boutique for its own
                order and named the customer as the reader. It names the
                customer as the customer instead. */}
            <h1 className="success-title">
              {t('confirmed.title', 'Order created for {name} 🎉', { name: confirmedCustomerName })}
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '15px' }}>
              {t('confirmed.subtitle',
                 'It is with the workroom now, and sits on {name}\'s profile with everything recorded here.',
                 { name: confirmedCustomerName })}
            </p>
            <div className="order-id-badge">
              <span>Order ID: <strong>{orderRef(confirmedOrder)}</strong></span>
            </div>
          </div>

          <div className="order-meta-info-grid">
            <div className="meta-info-block">
              <span className="meta-info-label">Order Date</span>
              <span className="meta-info-val">
                {fmtDate(confirmedOrder.order_date)}
              </span>
            </div>
            <div className="meta-info-block">
              <span className="meta-info-label">Payment Status</span>
              {/* Was the literal `Paid • ₹{total_amount}` in success green,
                  referencing neither payment_status nor amount_paid -- so the
                  screen staff turn to face the customer announced the order
                  settled in full the moment it was placed, and contradicted the
                  invoice one click later. total_amount also arrives as a string
                  (COERCE_DECIMAL_TO_STRING is unset), and String.toLocaleString
                  does no grouping, so it printed ₹51502.50 rather than
                  ₹51,502.50. parseFloat fixes the second half. */}
              <span className="meta-info-val" style={{ color: confirmedOrder.payment_status === 'Paid' ? 'var(--success-color)' : 'var(--text-primary)' }}>
                {confirmedOrder.payment_status} • {formatMoney(confirmedOrder.amount_paid)}
                {confirmedOrder.payment_status !== 'Paid' && (
                  <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>
                    {' '}of {formatMoney(confirmedOrder.total_amount)}
                  </span>
                )}
              </span>
            </div>
            <div className="meta-info-block">
              <span className="meta-info-label">Estimated Delivery</span>
              <span className="meta-info-val">
                {fmtDate(confirmedOrder.estimated_delivery)}
              </span>
            </div>
          </div>

          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600 }}>What happens next?</h3>
            <div className="timeline-tracker">
              <div className="timeline-line"></div>
              {[
                { label: 'Stylist Review', desc: 'A stylist is reviewing the order details.', active: true, completed: true },
                { label: 'Design & Creation', desc: 'Artisans will cut and assemble the garment.', active: false, completed: false },
                { label: 'Quality Check', desc: 'Multi-level measurement and stitching validation.', active: false, completed: false },
                { label: 'Packed & Shipped', desc: 'Packed securely and handed over to the customer.', active: false, completed: false }
              ].map((node, i) => (
                <div key={i} className={`timeline-node ${node.completed ? 'completed' : ''} ${node.active ? 'active' : ''}`}>
                  <div className="timeline-node-circle">
                    {node.completed ? <Check size={14} /> : (i + 1)}
                  </div>
                  <span className="timeline-node-label">{node.label}</span>
                  <span className="timeline-node-desc">{node.desc}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="whatsapp-action-card">
            <div className="whatsapp-info">
              <span className="whatsapp-title">Crafting something just for you ✨</span>
              <span className="whatsapp-desc">Need changes or have questions? Chat directly with us on WhatsApp.</span>
            </div>
            <button className="whatsapp-btn" onClick={() => window.open(waLink(customerForm.mobile_number))}>
              <MessageSquare size={18} />
              Chat on WhatsApp
            </button>
          </div>

          {/* `flex: 1` alone does not shrink a button below its own text, so at
              390px these two ran off both edges of the screen -- the last two
              controls of the whole order flow, on a screen that then scrolled
              sideways. Wrapping, with a width floor, stacks them instead. */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', justifyContent: 'center', width: '100%', maxWidth: '450px' }}>
            {orderBucket(confirmedOrder) === 'workshop' ? (
              <div className="at-sent-note" role="status" style={{ flex: '1 1 100%' }}>
                <CheckCircle2 size={18} /> {t('ordersPage.inTheWorkshop', 'In the workshop')}
                {confirmedOrder.tailor_name ? ` · ${confirmedOrder.tailor_name}` : ''}
              </div>
            ) : (
              <button className="btn-primary" style={{ flex: '1 1 100%', justifyContent: 'center', minHeight: '48px' }} disabled={sendBusy}
                      onClick={() => openSendToWorkshop(confirmedOrder)}>
                <Scissors size={18} /> {t('ordersPage.sendToWorkshop', 'Send to workshop')}
              </button>
            )}
            <button className="btn-secondary" style={{ flex: '1 1 180px', justifyContent: 'center' }} onClick={() => setShowInvoiceModal(true)}>
              <FileText size={18} /> View & Print Invoice
            </button>
            <button className="btn-secondary" style={{ flex: '1 1 180px', justifyContent: 'center' }} onClick={() => { setView('dashboard'); fetchDashboardAndConfig(); }}>
              Back to Dashboard
            </button>
          </div>
        </div>
        );
      })()}

      {/* Footer Navigation Bar (Only in Wizard View) */}
      {view === 'wizard' && (
        <div className="footer-actions-bar">
          <div className="footer-left-actions">
            <button className="btn-secondary" onClick={handleBack} disabled={ctaBusy}>
              <ArrowLeft size={16} />
              {t('common.back', 'Back')}
            </button>
          </div>
          <div className="footer-right-actions">
            {serviceType !== 'alter' && wizardStepKey !== 'money' && (
              <button className="btn-secondary" onClick={handleSaveDraft} disabled={ctaBusy}>
                {t('wizard.saveAsDraft', 'Save for later')}
              </button>
            )}
            <button className="btn-primary" onClick={handleNext} disabled={ctaBusy} style={{ opacity: ctaBusy ? 0.6 : 1 }}>
              {ctaBusy ? t('wizard.working', 'Working\u2026')
                : wizardStepKey === 'money' ? <>{t('wizard.completeOrder', 'Complete the order')} <Check size={16} /></>
                : wizardStepKey === 'issue' ? <>{t('wizard.createAlteration', 'Create alteration')} <Check size={16} /></>
                : wizardStepKey === 'outIssue' ? <>{t('wizard.takeItIn', 'Take it in')} <Check size={16} /></>
                : <>{t('common.next', 'Next')} <ArrowRight size={16} /></>}
            </button>
          </div>
        </div>
      )}

      {/* INVOICE MODAL */}
      {showInvoiceModal && confirmedOrder && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <div className="invoice-modal-content" style={{
            backgroundColor: 'var(--surface-color)',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '700px',
            maxHeight: '90vh',
            overflowY: 'auto',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            display: 'flex',
            flexDirection: 'column'
          }}>
            {/* Modal Header */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '16px 24px',
              borderBottom: '1px solid var(--border-color)'
            }} className="no-print">
              <h3 style={{ fontSize: '16px', fontWeight: 700 }}>Customer Invoice</h3>
              <button 
                aria-label="Close invoice"
                onClick={() => setShowInvoiceModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Invoice Printable Area */}
            <div id="invoice-printable" style={{ padding: '40px', color: '#1a1f36', fontSize: '13px', lineHeight: 1.5 }}>
              {/* Styling for printing */}
              <style>{`
                @media print {
                  body * {
                    visibility: hidden;
                  }
                  #invoice-printable, #invoice-printable * {
                    visibility: visible;
                  }
                  #invoice-printable {
                    position: absolute;
                    left: 0;
                    top: 0;
                    width: 100%;
                    padding: 0;
                  }
                  .no-print {
                    display: none !important;
                  }
                  /* Only the invoice and the boxes holding it are laid out:
                     the page behind would otherwise print as blank pages,
                     and the dialog's 90vh scroll box would cut the bill. */
                  body *:not(:has(#invoice-printable)):not(#invoice-printable):not(#invoice-printable *) {
                    display: none !important;
                  }
                  div:has(> .invoice-modal-content), .invoice-modal-content {
                    position: static !important;
                    max-height: none !important;
                    overflow: visible !important;
                    padding: 0 !important;
                    background: none !important;
                    box-shadow: none !important;
                  }
                }
              `}</style>

              {confirmedOrder.price_pending ? (
                <div className="od-hint" style={{ textAlign: 'center', padding: '24px 0' }}>
                  The price of this order is not decided yet. Add the prices on the order (Prices) and the invoice is made from them.
                </div>
              ) : (
              <InvoiceRenderer
                template={confirmedOrder.invoice_template || boutiqueSettings?.invoice_template || 'classic'}
                data={normalizeInvoiceData(confirmedOrder, boutiqueSettings, currentUser)}
              />
              )}
            </div>

            {/* Modal Footer Controls */}
            <div style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '12px',
              padding: '16px 24px',
              borderTop: '1px solid var(--border-color)',
              backgroundColor: '#fafbfc',
              borderBottomLeftRadius: '12px',
              borderBottomRightRadius: '12px'
            }} className="no-print invoice-modal-foot">
              {/* How the last Send on WhatsApp for this bill went. A send that
                  did not go through shows no note: the button turns into
                  Retry again instead. */}
              {invoiceSend?.orderId === confirmedOrder.id && !['retrying', 'failed', 'error'].includes(invoiceSend.state) && (
                <div className={`invoice-send-note invoice-send-note--${invoiceSend.state}`} role="status" aria-live="polite">
                  {invoiceSend.state === 'sending' && 'Sending the invoice on WhatsApp…'}
                  {invoiceSend.state === 'sent' && `Invoice sent to ${confirmedOrder.customer_name || 'the customer'} on WhatsApp.`}
                  {invoiceSend.state === 'retrying' && `Not sent yet${invoiceSend.error ? ` (${invoiceSend.error.replace(/^WhatsApp sending failed:\s*/, '')})` : ''}. It will be tried again automatically.`}
                  {invoiceSend.state === 'failed' && `Could not send${invoiceSend.error ? `: ${invoiceSend.error.replace(/^WhatsApp sending failed:\s*/, '')}` : '.'}`}
                  {invoiceSend.state === 'pending' && 'Still sending. If it does not go through, it will be tried again automatically.'}
                  {invoiceSend.state === 'manual' && (
                    <>
                      WhatsApp sending is not set up.{' '}
                      {invoiceSend.url && <a href={invoiceSend.url} target="_blank" rel="noopener noreferrer">Open WhatsApp</a>}
                    </>
                  )}
                  {invoiceSend.state === 'error' && invoiceSend.error}
                </div>
              )}
              <button
                className="btn-secondary"
                onClick={() => setShowInvoiceModal(false)}
              >
                Close
              </button>
              {/* Owner or Master, on a bill with a customer: the PDF to the
                  customer's WhatsApp. */}
              {(!currentUser?.role || ['Owner', 'Master'].includes(currentUser.role)) && confirmedOrder.customer && !confirmedOrder.price_pending && (
                <button
                  type="button"
                  className="btn-secondary invoice-send-btn"
                  disabled={invoiceSend?.orderId === confirmedOrder.id && invoiceSend.state === 'sending'}
                  onClick={() => sendInvoiceToWhatsApp(confirmedOrder)}
                >
                  {invoiceSend?.orderId === confirmedOrder.id && ['retrying', 'failed', 'error'].includes(invoiceSend.state)
                    ? <RefreshCw size={16} /> : <Send size={16} />}
                  {invoiceSend?.orderId === confirmedOrder.id && invoiceSend.state === 'sending' ? 'Sending…'
                    : invoiceSend?.orderId === confirmedOrder.id && invoiceSend.state === 'sent' ? 'Send again'
                    : invoiceSend?.orderId === confirmedOrder.id && ['retrying', 'failed', 'error'].includes(invoiceSend.state) ? 'Retry again'
                    : 'Send on WhatsApp'}
                </button>
              )}
              {!confirmedOrder.price_pending && (
              <button 
                className="btn-primary" 
                onClick={() => window.print()}
              >
                <Printer size={16} /> Print Invoice
              </button>
              )}
            </div>
          </div>
        </div>
      )}

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
      {reversalPrompt && (
        <div className="existing-customer-search-modal" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1300 }}>
          <div className="search-modal-card" style={{ maxWidth: '420px', width: '100%', padding: '24px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 600, fontFamily: 'var(--font-serif)', marginBottom: '8px' }}>
              {reversalPrompt.type === 'failqc' ? 'Fail this quality check?' : 'Reopen this stage?'}
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
              {reversalPrompt.type === 'failqc'
                ? 'The stitching stages reopen for rework and the order drops back to Design & Creation. Say what was wrong — the tailor doing the rework reads this.'
                : 'This goes on the order\u2019s record with your name. Say why the stage is being reopened.'}
            </p>
            {reversalPrompt.type === 'reopen' && (() => {
              
              const mine = (s) => !s.garment_job || !selectedStageObj?.garment_job || s.garment_job === selectedStageObj.garment_job;
              const stages = (activeReviewOrder?.stages || []).filter(mine);
              const at = stages.findIndex(s => s.id === selectedStageObj?.id);
              const reset = at === -1 ? [] : stages.slice(at + 1).filter(s => s.status !== 'NOT_STARTED');
              return reset.length > 0 && (
                <div role="alert" style={{ display: 'flex', gap: '8px', padding: '10px 12px', marginBottom: '12px', borderRadius: '10px',
                                           background: 'var(--warning-bg)', color: 'var(--warning-color)', fontSize: '13px' }}>
                  <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
                  <span>
                    <strong>Later work will be reset.</strong>{' '}
                    {reset.map(s => s.stage_name || s.stage_key).join(', ')} {reset.length === 1 ? 'goes' : 'go'} back to Not started and must be done again.
                  </span>
                </div>
              );
            })()}
            <textarea
              className="form-control"
              rows={3}
              autoFocus
              placeholder={reversalPrompt.type === 'failqc' ? 'e.g. Hem is crooked on the left panel' : 'e.g. Completed on the wrong order'}
              maxLength={LIMITS.reason}
              value={reversalReason}
              onChange={(e) => setReversalReason(e.target.value)}
              style={{ marginBottom: '16px' }}
            />
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button type="button" className="btn-secondary" disabled={reversalBusy} onClick={() => setReversalPrompt(null)}>
                Cancel
              </button>
              <button
                type="button" className="btn-primary" disabled={reversalBusy || !reversalReason.trim()}
                onClick={async () => {
                  if (reversalBusy) return;
                  setReversalBusy(true);
                  try {
                    if (reversalPrompt.type === 'failqc') {
                      await api.failQualityCheck(activeReviewOrder.id, reversalReason.trim(), selectedStageObj?.garment_job || null);
                    } else {
                      await api.reopenStage(activeReviewOrder.id, selectedStageObj.stage_key, reversalReason.trim(), selectedStageObj.garment_job || null);
                    }
                    setReversalPrompt(null);
                    setActiveReviewStage(null);
                    setActiveReviewOrder(null);
                    setSelectedStageObj(null);
                    fetchDashboardAndConfig();
                  } catch (err) {
                    alert(err.message);
                  } finally {
                    setReversalBusy(false);
                  }
                }}
              >
                {reversalBusy ? 'Recording…' : (reversalPrompt.type === 'failqc' ? 'Fail QC' : 'Reopen Stage')}
              </button>
            </div>
          </div>
        </div>
      )}
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
