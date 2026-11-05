import { useCallback, useEffect, useRef, useState } from 'react';
import { portalSlugFromPath } from '../../navigation/portalSlug';
import { applyTenantTheme } from '../../theme';
import { api } from '../../services/api';
import { useLanguage } from '../../i18n/LanguageContext.jsx';
import { canSeeTab, visibleNav } from '../../navigation/nav';
import useAuthForms from '../../features/auth/useAuthForms';
import { DEFAULT_CUSTOMER_DATA, EMPTY_ALTERATION, EMPTY_OUTSIDE, SELF_DESIGNER, WIZARD_DRAFT_KEY, WIZARD_STEPS } from '../../features/orders/wizard';
import { plusDaysIso } from '../../services/dates';
import { syncFollowers } from '../../services/garmentCopies';
import { markTourSeen, tourSeen } from '../../components/ui/tourState';
import { setTierNames } from '../../services/tierNames';
import { useFabricTaxonomy } from '../../features/fabrics/taxonomy';
import useWorkspaceData from '../../context/useWorkspaceData';
import useOrderDraft from '../../features/orderWizard/useOrderDraft';
import { cleanEmail, displayMobile, emailError, imageFilesError, phoneError } from '../../services/validate';
import { useCustomerLookup } from '../../features/customers/useCustomerLookup';
import useAutosave from '../../hooks/useAutosave';
import { maySignOff } from '../../services/signOff';
import { NO_TIERS } from '../../features/customers/customerBook';
import useOrderWizard from '../../features/orderWizard/useOrderWizard';
import useDesignManager from '../../features/designStudio/useDesignManager';
import useAppointments from '../../features/appointments/useAppointments';
import useStageReview from '../../features/orders/useStageReview';
import useOrdersPage from '../../features/orders/useOrdersPage';
import useCustomerBook from '../../features/customers/useCustomerBook';
import useSession from '../../features/auth/useSession';
import useWorkspaceShell from '../../navigation/useWorkspaceShell';

/**
 * Everything the app holds while it runs, in one place: the signed-in user and
 * the page on screen, each page's data and state (most of it in the area hooks
 * this calls -- useSession, useWorkspaceData, useOrderWizard, useCustomerBook,
 * ...), and the order being written. AppStateProvider calls it once; the views
 * read it with useAppState(). The hooks run in the order they are written
 * here, which matters: each one is handed values declared above it.
 */
export default function useAppStateValue() {
  
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
  if (canSeeTab(currentUser, 'alterations')) navTabs.push('alterations');
  const dashboardTab = (!navTabs.length || navTabs.includes(requestedTab)) ? requestedTab : navTabs[0];
  // The bell (inbox alerts) shows on the owner's Dashboard page only -- not
  // on any other page, and not for any other role. Read by the top bar, the
  // phone header and the tablet header alike.
  const showBell = (!currentUser?.role || currentUser.role === 'Owner') && view === 'dashboard' && dashboardTab === 'overview';

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

  // Only the order form uses the garment list: asked for when it opens, and kept.
  const onOrderScreen = view === 'wizard';
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

  // The workspace's data, one request each (context/useWorkspaceData.jsx).
  const workspaceData = useWorkspaceData({ view, currentUser, dashboardTab, onboardingDismissed, setSelectedDashboardOrder, setDashboardData, setTailors, setDesignerStaff, setAppointments, showAppointmentModal, setFabrics, setCustomerStats, setOrdersList, setOrdersLoaded, setQueuedMessages, setDirectoryVersion, setLoading, setWhatsappStatus, setBoutiqueSettings, activeReviewStage, setLoadErrors, setNotifications });
  const { fetchNotifications, markNotificationsRead, pendingLoads, fetchDashboardAndConfig, fetchWhatsAppStatus } = workspaceData;

  // Above the order draft (useOrderDraft, just below), which reads both.
  const [customerLocked, setCustomerLocked] = useState(false);
  const wizardSteps = (serviceType === 'alter' && alterOutside ? WIZARD_STEPS.alterOutside : WIZARD_STEPS[serviceType])
    || WIZARD_STEPS.stitch;

  // The order being written, as a draft (features/orderWizard/useOrderDraft.jsx).
  const orderDraft = useOrderDraft({ setView, currentStep, setMaxStepReached, reachStep, setActiveGarmentKey, activeGarmentKey, setGarmentsDone, garmentsDone, setCustomerId, customerId, setCustomerForm, customerForm, setServiceType, serviceType, setCustomerName, setReadyBy, readyBy, setDesignRequest, designRequest, designerChoice, garmentJobs, setGarmentJobs, setDraftId, draftId, setDraftVersion, draftVersion, setDraftSaveState, setGarmentErrors, setDesignNotes, designNotes, setSelectedDesignTemplates, selectedDesignTemplates, setDesignSource, designSource, setDesignLinks, designLinks, setAdvancePaymentAmount, advancePaymentAmount, setSpecialInstructions, specialInstructions, setMeasureVoiceNotes, measureVoiceNotes, setQuotePrices, quotePrices, setWizardError, setAlterOutside, fabrics, setCustomerLocked, wizardSteps });
  const { defaultMaterialSource, garmentMaterialFields, serialiseWizard, hydrateWizard, persistDraft, jobExtras, jobMaterialCharges, getSubtotal, getTaxes, getTotalPrice } = orderDraft;

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

  // Open an order from an alteration (below the data loader, which it reloads).
  const openAlteration = (id) => {
    setSelectedDirectoryCustomer(null);
    setDashboardTab('orders');
    setOpenOrdersRowId(id);
    fetchDashboardAndConfig();
  };
  const rememberAlteration = () => {};

  // The order wizard's own state and logic (features/orderWizard/useOrderWizard.jsx).
  const wizard = useOrderWizard({ setView, currentUser, t, currentStep, maxStepReached, reachStep, setActiveGarmentKey, garmentsDone, setGarmentsDone, customerId, setCustomerId, customerForm, setCustomerForm, serviceType, setCustomerName, readyBy, designerChoice, alterationForm, garmentTemplates, garmentJobs, setGarmentJobs, draftId, setDraftId, setDraftVersion, setDraftSaveState, setGarmentErrors, advancePaymentAmount, setAdvancePaymentAmount, quotePrices, setQuotePrices, setWizardError, defaultMaterialSource, garmentMaterialFields, persistDraft, alterOutside, outsideForm, outsidePhoto, openAlteration, rememberAlteration, fabrics, ordersList, setConfirmedOrder, fetchDashboardAndConfig, pickCustomer, customerLocked, matchDigits, matchName, matchBy, customerMatches, setNumberMatched, wizardSteps, wizardStepKey, openGarment, setCtaBusy, getSubtotal, getTotalPrice, refreshCustomerBook });
  const { activePairingGarment, setActivePairingGarment, pairingQueue, setPairingQueue, handleAddPairedGarments } = wizard;
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
  const ordersPage = useOrdersPage({ lastTabRef, t, navSections, dashboardTab, ordersTabPick, ordersStageFilter, fetchDashboardAndConfig });
  const { previousDashboardTab, getTabLabel, ordersAlterationOrder, setOrdersAlterationOrder, sendErrorsOrderId, setSendErrorsOrderId, completingAllOrderId, setCompletingAllOrderId, ordersSearch, setOrdersSearch, ordersFilterTab, ordersTierFilter, setOrdersTierFilter, ordersTypeFilter, setOrdersTypeFilter, ordersGarmentFilter, setOrdersGarmentFilter, ordersView, setOrdersView, ordersKind, setOrdersKind, ordersPageSize, setOrdersPageSize, ordersListPage, goToOrdersPage, orderMatchesFilters, savingVerificationOrderId, setSavingVerificationOrderId, assigningWorkflowOrderId, designerInCharge, assignOrderDesigner } = ordersPage;
  // The Customers and Leads pages' own state (features/customers/useCustomerBook.jsx).
  const customerBook = useCustomerBook({ currentUser, dashboardTab, setSelectedDirectoryCustomer, selectedDirectoryCustomer, directoryVersion, fetchDashboardAndConfig, startService, setCustomerAddMode, setEditingCustomer, adminCan, isOwnerUser });
  const { styleNotesFor, setStyleNotesFor, alterationOrder, setAlterationOrder, expandedCustomerOrderId, setExpandedCustomerOrderId, approvingDesignId, searchQuery, setSearchQuery, customerView, customerPageSize, setCustomerPageSize, customerFilters, setCustomerFilters, customerDirectory, handleStartNewCustomer, deletingAllCustomers, setDeletingAllCustomers, customerActionId, startEditCustomer, handleDeleteCustomer, handleMarkLeadContacted, orderTypeFor, setOrderTypeFor, handleSelectExistingCustomer, beginOrderForCustomer, customerPhotoBusy, uploadDirectoryCustomerPhoto, handleApproveDesign, isLead, directoryLoading, directoryData, bookSummary, directoryCount, pagedCustomers, customerPageNow, customerPageCount, customerPageFrom, goToCustomerPage, canEditCustomer, canDeleteCustomer, canImportCustomers } = customerBook;
  // Signing in and out (features/auth/useSession.jsx).
  const session = useSession({ setView, setDashboardTab, setCurrentUser, currentUser, portalSlug, dashboardTab, setAuthError, setChangeNew, setChangeConfirm, authBusy, setAuthBusy, changeCurrent, setChangeCurrent, changeNew, changeConfirm, loginEmail, loginPassword, setLoginPassword, setLoginEmail, setLoginUnlocked, resetToken, logoutBusy, setLogoutBusy, setJustRegistered, draftAfterReload, openDesignRequests, setLoading, setStaffSetup, staffSetup, setSetupCurrent, hydrateWizard, pendingLoads, fetchDashboardAndConfig });
  const { toProfileStep, finishStaffSetup, handleChangePasswordSubmit, handleLoginSubmit, handleLogout } = session;
  // What the workspace's frame shows around the pages (navigation/useWorkspaceShell.jsx).
  const shell = useWorkspaceShell({ setView, setDashboardTab, currentUser, t, currentUserName, navSections, navTabs, dashboardTab, showBell, onboardingDismissed, setSelectedDirectoryCustomer, dashboardData, tailors, fabrics, ordersList, ordersLoaded, loading, setTourOpen, tourOpen, setPageTour, pageTour, notifications, setShowNotificationsDrawer, markingNotificationsRead, setMarkingNotificationsRead, markNotificationsRead, handleLogout, setCustomerAddMode, setEditingCustomer, bookTotal, adminCan, isOwnerUser });
  const { headerAccountItems, accountBar, sidebarSections, reportsSwitch, canAddCustomer, guideCustomers, guideOrders, sidebarHint, onboardingSteps, showOnboarding, tourMenu, pageTourOpen } = shell;
  // What every page reads with useApp() (context/AppContext.js).
  const appContext = {
    currentUser, boutiqueSettings, dashboardTab, setDashboardTab,
    refresh: fetchDashboardAndConfig, adminCan, isOwner: isOwnerUser,
  };

  return {
    accountBar,
    activePairingGarment,
    activeReviewOrder,
    activeReviewStage,
    advancePaymentAmount,
    alterOutside,
    alterationForm,
    alterationOrder,
    appContext,
    appointmentDateRef,
    appointmentForm,
    appointments,
    approvingDesignId,
    assignOrderDesigner,
    assigningStageKey,
    assigningWorkflowOrderId,
    auth,
    beginOrderForCustomer,
    blankAppointmentForm,
    bookSummary,
    bookTiers,
    bookTotal,
    boutiqueAutosave,
    boutiqueFormError,
    boutiqueFormRef,
    boutiqueNotFound,
    boutiqueSettings,
    canAddCustomer,
    canDeleteCustomer,
    canEditCustomer,
    canImportCustomers,
    closeAppointmentModal,
    completingAllOrderId,
    confirmedOrder,
    ctaBusy,
    currentStep,
    currentUser,
    currentUserName,
    customerActionId,
    customerAddMode,
    customerDirectory,
    customerFilters,
    customerForm,
    customerId,
    customerLocked,
    customerMatches,
    customerMatchesLoading,
    customerName,
    customerPageCount,
    customerPageFrom,
    customerPageNow,
    customerPageSize,
    customerPhotoBusy,
    customerView,
    dashboardData,
    dashboardTab,
    deletingAllCustomers,
    designForm,
    designImageFile,
    designLibraryToken,
    designRequest,
    designSaving,
    designerChoice,
    designerInCharge,
    designers,
    designsView,
    directoryCount,
    directoryData,
    directoryDetailLoading,
    directoryLoading,
    draftSaveState,
    editingAppointment,
    editingCustomer,
    editingDesign,
    eligibleStaffForStage,
    expandedCustomerOrderId,
    fabricTaxonomy,
    fabrics,
    fetchDashboardAndConfig,
    fetchNotifications,
    markNotificationsRead,
    fetchWhatsAppStatus,
    finishStaffSetup,
    garmentErrors,
    garmentJobs,
    garmentTemplates,
    garmentTemplatesError,
    garmentsDone,
    getTabLabel,
    getTaxes,
    getTotalPrice,
    globalError,
    goToCustomerPage,
    guideCustomers,
    guideOrders,
    handleAddPairedGarments,
    handleApproveDesign,
    handleAssignStage,
    handleCancelAppointment,
    handleChangePasswordSubmit,
    handleDeleteCustomer,
    handleDeleteDesign,
    handleLoginSubmit,
    handleLogout,
    handleMarkLeadContacted,
    handleMarkMessageSent,
    handleRetryMessage,
    handleSaveAppointment,
    handleSaveDesign,
    handleSelectExistingCustomer,
    handleStartNewCustomer,
    headerAccountItems,
    hydrateWizard,
    invoiceFilter,
    invoiceSearch,
    invoiceSend,
    isLead,
    jobExtras,
    jobMaterialCharges,
    justRegistered,
    loadGarmentTemplates,
    loading,
    logoFile,
    logoutBusy,
    markingNotificationsRead,
    matchBy,
    maxStepReached,
    measureVoiceNotes,
    mobileNavOpen,
    navCollapsed,
    navSections,
    navTabs,
    notifications,
    numberMatched,
    onboardingSteps,
    openAlteration,
    openAppointment,
    openDirectoryCustomer,
    openGarment,
    openGarmentJob,
    openOrder,
    openSendToWorkshop,
    openStageReview,
    orderMatchesFilters,
    orderTypeFor,
    ordersAlterationOrder,
    ordersFilterTab,
    ordersGarmentFilter,
    ordersList,
    ordersSearch,
    ordersStageFilter,
    ordersTierFilter,
    ordersTypeFilter,
    ordersView,
    ordersKind,
    setOrdersKind,
    ordersPageSize,
    setOrdersPageSize,
    ordersListPage,
    goToOrdersPage,
    outsideForm,
    outsidePhoto,
    pageTour,
    pageTourEmpty,
    pageTourOpen,
    pagedCustomers,
    pairingQueue,
    paymentError,
    pickLogo,
    portalLookupDone,
    portalSlug,
    previousDashboardTab,
    queuedMessages,
    quotePrices,
    readyBy,
    refreshCustomerBook,
    rememberAlteration,
    reportsSwitch,
    resumableDrafts,
    reversalBusy,
    reversalPrompt,
    reversalReason,
    reviewView,
    saveBoutiqueForm,
    savingAppointment,
    savingPaymentId,
    savingVerificationOrderId,
    searchQuery,
    sectionVisit,
    selectedDirectoryCustomer,
    selectedStageObj,
    sendBusy,
    sendErrorsOrderId,
    sendInvoiceToWhatsApp,
    serviceType,
    setActiveGarmentKey,
    setActivePairingGarment,
    setActiveReviewOrder,
    setActiveReviewStage,
    setAdvancePaymentAmount,
    setAlterOutside,
    setAlterationForm,
    setAlterationOrder,
    setAppointmentForm,
    setBoutiqueSettings,
    setCompletingAllOrderId,
    setConfirmedOrder,
    setCurrentUser,
    setCustomerAddMode,
    setCustomerFilters,
    setCustomerForm,
    setCustomerPageSize,
    setDashboardTab,
    setDeletingAllCustomers,
    setDesignForm,
    setDesignImageFile,
    setDesignLibraryToken,
    setDesignNotes,
    setDesignRequest,
    setDesignsView,
    setDirectoryVersion,
    setEditingAppointment,
    setEditingCustomer,
    setEditingDesign,
    setExpandedCustomerOrderId,
    setGarmentJobs,
    setInvoiceFilter,
    setInvoiceSearch,
    setLogoFile,
    setMarkingNotificationsRead,
    setMeasureVoiceNotes,
    setMobileNavOpen,
    setOnboardingDismissed,
    setOpenGarmentJob,
    setOpenOrdersRowId,
    setOrderTypeFor,
    setOrdersAlterationOrder,
    setOrdersFilterTab,
    setOrdersGarmentFilter,
    setOrdersSearch,
    setOrdersStageFilter,
    setOrdersTierFilter,
    setOrdersTypeFilter,
    setOrdersView,
    setOutsideForm,
    setOutsidePhoto,
    setPageTour,
    setPairingQueue,
    setPaymentError,
    setQuotePrices,
    setReadyBy,
    setResumableDrafts,
    setReversalBusy,
    setReversalPrompt,
    setReversalReason,
    setReviewView,
    setSavingPaymentId,
    setSavingVerificationOrderId,
    setSearchQuery,
    setSectionVisit,
    setSelectedDashboardOrder,
    setSelectedDirectoryCustomer,
    setSelectedStageObj,
    setSendErrorsOrderId,
    setServiceType,
    setSettingsSaving,
    setShowAppointmentModal,
    setShowDesignModal,
    setShowDesignUpload,
    setShowInvoiceModal,
    setShowNotificationsDrawer,
    setSpecialInstructions,
    setStaffDesignersVisit,
    setStageReviewComments,
    setStageReviewImages,
    setStageReviewRecording,
    setStageTransitionBusy,
    setStyleNotesFor,
    setTaskGuide,
    setTourOpen,
    setView,
    setViewAllCustomerMeasurements,
    setWizardError,
    settingsSaving,
    setupCurrent,
    showAppointmentModal,
    showBell,
    showDesignModal,
    showDesignUpload,
    showInvoiceModal,
    showNotificationsDrawer,
    showOnboarding,
    sidebarHint,
    sidebarSections,
    specialInstructions,
    staffDesignersVisit,
    staffSetup,
    stageReviewComments,
    stageReviewImages,
    stageReviewRecording,
    stageTransitionBusy,
    startEditCustomer,
    startService,
    styleNotesFor,
    t,
    tailors,
    taskGuide,
    toProfileStep,
    toggleNav,
    tourMenu,
    tourOpen,
    uploadDirectoryCustomerPhoto,
    view,
    viewAllCustomerMeasurements,
    whatsappStatus,
    wizard,
    wizardError,
    wizardStepKey,
    wizardSteps,
  };
}
