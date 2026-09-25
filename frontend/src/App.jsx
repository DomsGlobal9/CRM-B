import React, { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { Users, ShoppingBag, Scissors, Upload, Zap, Check, ArrowRight, ArrowLeft, Heart, MessageSquare, Copy, ShieldCheck, BarChart2, FolderOpen, Sparkles, X, ExternalLink, ChevronRight, Lock, Mail, Phone, Calendar, FileText, Printer, Bell, User, MapPin, Eye, EyeOff, Edit2, Plus, Trash2, LogOut, History, Package, Menu, PenTool, Settings, RotateCw, Clock, Wallet, AlertTriangle, Shirt, TrendingUp, AlertCircle, CalendarDays, LayoutGrid, List, Receipt, Banknote, PackageCheck, CheckCircle2, Boxes, Crown, ShoppingCart, Coins, ClipboardList, Type, Tag, Layers, Palette, IndianRupee, Link as LinkIcon, Image as ImageIcon, Save, Play, RefreshCw, Ruler, Target, Leaf, Building2, Globe, Camera, Store, PanelLeftClose, PanelLeftOpen, Contact, ChevronDown, Mic, Filter } from 'lucide-react';
import { api } from './services/api';
import { resolveMediaUrl } from './services/media';
import { LIMITS, tenDigits, cleanMobile, displayMobile, mobileError, phoneError, cleanName, nameError, cleanEmail, emailError, cleanAmount, amountError, isPastDate, imageFilesError } from './services/validate';
import {
  formatMoney, formatDate as fmtDate, formatDateTime as fmtDateTime,
  formatTime as fmtTime, setBoutiqueTimeZone, orderRef,
} from './services/format';

const GarmentPartPicker = lazy(() => import('./features/designStudio/GarmentPartPicker'));
const ReviewLightbox = lazy(() => import('./features/designStudio/GarmentPartPicker').then(m => ({ default: m.Lightbox })));
import { ACCESSORY_OPTIONS } from './features/designStudio/GarmentPartPicker';
const GarmentFabricPicker = lazy(() => import('./features/fabrics/GarmentFabricPicker'));
const FabricColorFilter = lazy(() => import('./features/fabrics/FabricColorFilter'));
import { fabricMatchesColour } from './features/fabrics/colour';

const InventoryPanel = lazy(() => import('./features/inventory/InventoryPanel'));
const DesignLibrary = lazy(() => import('./features/designStudio/DesignLibrary'));
const DesignUpload = lazy(() => import('./features/designStudio/DesignUpload'));
const DesignDashboard = lazy(() => import('./features/designStudio/DesignDashboard'));
const DesignWork = lazy(() => import('./features/designStudio/DesignWork'));
const CustomerDesigns = lazy(() => import('./features/designStudio/CustomerDesigns'));
const StaffPanel = lazy(() => import('./features/staff/StaffPanel'));
const OutsideGarmentIntake = lazy(() => import('./features/alterations/OutsideGarmentIntake'));
const FinancePanel = lazy(() => import('./features/finance/FinancePanel'));
const WorkPanel = lazy(() => import('./features/work/WorkPanel'));
import TemplateForm from './features/catalog/TemplateForm';
import GarmentPurchases from './features/catalog/GarmentPurchases';
import { purchaseError } from './features/catalog/materials';
import DesignCataloguePicker from './features/designStudio/DesignCataloguePicker';
import GarmentSelectionsReview from './features/catalog/GarmentSelectionsReview';
import OrderAlterations, { RequestAlterationModal } from './features/alterations/OrderAlterations';
import OrderGarmentBrief from './features/catalog/OrderGarmentBrief';
import GarmentSummary from './features/catalog/GarmentSummary';
import { AddCustomerChooser, CustomerForm, DeleteAllCustomersDialog } from './features/customers/AddCustomer';
import OrderKanban from './features/orders/OrderKanban';
import { expressLabel, isExpressOrder } from './features/orders/express';
import { useFabricTaxonomy } from './features/fabrics/taxonomy';
import { formatInternational } from './services/phone';
import useAutosave from './hooks/useAutosave';
import { applyTenantTheme } from './theme';
import { MobileHeader } from './components/ui/MobileHeader';
import { PageHeader, StatCard, SectionCard, Chips, AvatarInitials, ProgressBar, SearchBox, Segmented, IconTile, FormModal, Field, Dropzone, PhotoTile, InfoNote, FormSection, AddPhotoButton, CameraButton } from './components/ui/Atelier';
import { useLanguage } from './i18n/LanguageContext.jsx';
import LanguageSelector from './components/LanguageSelector.jsx';
import SettingsPage from './components/SettingsPage.jsx';
import { InvoiceRenderer, normalizeInvoiceData } from './components/invoice/InvoiceTemplates';
import { BottomNavigation } from './components/ui/BottomNavigation';

import { BottomSheet } from './components/ui/BottomSheet';
import { ResponsiveCard } from './components/ui/ResponsiveCard';
import { ProgressiveAccordion } from './components/ui/ProgressiveAccordion';
import DressesDropdown from './components/ui/DressesDropdown';
import GarmentPairingModal, { getGarmentPairConfig } from './components/ui/GarmentPairingModal';
import VoiceTextarea, { SpeakButton, VoiceNotePlayer, VoiceRecorder } from './components/ui/VoiceTextarea';
import Loader from './components/ui/Loader';


const WIZARD_STEPS = {
  stitch: [
    { key: 'who', label: 'Customer', sub: 'Who it is for' },
    { key: 'type', label: 'Apparel', sub: 'What we are making' },
    { key: 'design', label: 'Design', sub: 'The look' },
    { key: 'fabric', label: 'Fabric', sub: 'Cloth and trims' },
    { key: 'measure', label: 'Measurements', sub: 'Body measurements' },
    { key: 'personal', label: 'Personalization', sub: 'Extras, if any' },
    { key: 'review', label: 'Review', sub: 'Check everything' },
    { key: 'money', label: 'Complete the order', sub: 'Invoice & payment' },
  ],
  design: [
    { key: 'who', label: 'Customer', sub: 'Who it is for' },
    { key: 'type', label: 'Apparel', sub: 'What we are making' },
    { key: 'design', label: 'Design', sub: 'The look' },
    { key: 'fabric', label: 'Fabric', sub: 'Cloth and trims' },
    { key: 'measure', label: 'Measurements', sub: 'Body measurements' },
    { key: 'personal', label: 'Personalization', sub: 'Extras, if any' },
    { key: 'review', label: 'Review', sub: 'Check everything' },
    { key: 'money', label: 'Complete the order', sub: 'Invoice & payment' },
  ],
  alter: [
    { key: 'who', label: 'Customer', sub: 'Who it is for' },
    { key: 'garment', label: 'Garment', sub: 'Which one we made' },
    { key: 'issue', label: 'Details', sub: 'What needs changing' },
  ],
};
const EMPTY_ALTERATION = { orderId: '', garmentJobId: '', issue: '', type: 'PAID_CLIENT_REQUEST', charge: '', paidNow: '' };

const MEASURE_KEYS = {
  chest: 'bust', bust: 'bust', waist: 'waist', hip: 'hips', shoulder: 'shoulder', neck: 'neck',
  height: 'height', underbust: 'underbust', high_waist: 'high_waist', armhole: 'armhole',
  upper_arm: 'upper_arm', bicep: 'upper_arm', elbow: 'elbow', wrist: 'wrist',
  shoulder_to_bust: 'shoulder_to_bust', shoulder_to_waist: 'shoulder_to_waist',
  waist_to_hip: 'waist_to_hip', waist_to_floor: 'waist_to_floor', floor_length: 'waist_to_floor',
  crotch: 'rise', thigh: 'thigh', knee: 'knee', calf: 'calf', ankle: 'ankle',
  inseam: 'inseam', outseam: 'outseam',
};
const SHEET_COLUMNS = new Set(['bust', 'waist', 'hips', 'shoulder', 'arm_length', 'neck', 'length']);
const sheetGet = (sheet, key) => (SHEET_COLUMNS.has(key) ? sheet[key] : sheet.additional_measurements?.[key]);
const sheetSet = (sheet, key, value) => {
  if (SHEET_COLUMNS.has(key)) sheet[key] = value;
  else sheet.additional_measurements = { ...(sheet.additional_measurements || {}), [key]: value };
};
const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const todayIso = () => isoDay(new Date());
const plusDaysIso = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return isoDay(d); };

const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;


const UserAvatar = ({ user, size }) => {
  const url = resolveMediaUrl(user?.profile_photo || '');
  const initial = (user?.first_name || user?.name || user?.email || 'U').trim().charAt(0).toUpperCase();
  const box = size ? { width: size, height: size } : { width: '100%', height: '100%' };
  if (url) {
    return <img src={url} alt="" style={{ ...box, borderRadius: '50%', objectFit: 'cover' }} />;
  }
  return (
    <div style={{ ...box, borderRadius: '50%', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', background: 'var(--selected-bg)', color: 'var(--selected-fg)',
                  fontWeight: 600, fontSize: size ? size * 0.42 : '1em' }}>
      {initial}
    </div>
  );
};


const TIERS = ['Platinum', 'Gold', 'Silver'];

// Customers per page in the customer book: 20 to 50.
const CUSTOMER_PAGE_SIZES = [20, 30, 40, 50];
/** Page numbers to show: the first, the last, and the current one with its
 *  neighbours; a gap between them is drawn as '…'. */
const pageNumbers = (page, count) => {
  const pages = [...new Set([1, page - 1, page, page + 1, count])].filter((n) => n >= 1 && n <= count).sort((a, b) => a - b);
  return pages.flatMap((n, i) => (i && n - pages[i - 1] > 1 ? [`gap-${n}`, n] : [n]));
};

function Pager({ page, pageCount, pageSize, sizes, onPage, onSize, label = 'Per page' }) {
  return (
    <nav className="at-pager" aria-label="Pages">
      <label className="at-pager-size">
        {label}
        <select className="form-control" value={pageSize} onChange={(e) => onSize(Number(e.target.value))}>
          {sizes.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
      <div className="at-pager-pages">
        <button type="button" className="btn-secondary at-btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          <ArrowLeft size={14} /> Prev
        </button>
        {pageNumbers(page, pageCount).map((n) => (typeof n === 'string'
          ? <span key={n} className="at-pager-gap">…</span>
          : (
            <button key={n} type="button" aria-current={n === page ? 'page' : undefined}
                    className={`at-pager-num${n === page ? ' at-pager-num--on' : ''}`} onClick={() => onPage(n)}>
              {n}
            </button>
          )))}
        <button type="button" className="btn-secondary at-btn-sm" disabled={page >= pageCount} onClick={() => onPage(page + 1)} aria-label="Next page">
          Next <ArrowRight size={14} />
        </button>
      </div>
    </nav>
  );
}
const customerTier = (record) => (TIERS.includes(record?.customer_type) ? record.customer_type : 'Silver');
const tierCounts = (customers) =>
  TIERS.reduce((acc, tier) => ({ ...acc, [tier]: customers.filter((c) => customerTier(c) === tier).length }), {});
const TIER_TONES = {
  Platinum: { background: 'var(--accent-color)', color: 'var(--brand-link)', border: '1px solid var(--primary-color)' },
  Gold: { background: 'var(--warning-bg)', color: 'var(--warning-color)', border: '1px solid color-mix(in srgb, var(--warning-color) 35%, transparent)' },
  Silver: { background: 'var(--surface-inset)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' },
};
const TierBadge = ({ tier }) => (
  <span style={{
    fontSize: 'var(--text-2xs)', fontWeight: 'var(--weight-bold)', letterSpacing: '0.06em',
    padding: '2px 8px', borderRadius: '999px', textTransform: 'uppercase', ...TIER_TONES[tier] || TIER_TONES.Silver,
  }}>{tier}</span>
);


const orderStageKey = (order) => {
  const stages = order.stages || [];
  const current = stages.find((st) => st.status === 'PENDING_VERIFICATION')
    || stages.find((st) => st.status === 'IN_PROGRESS' || st.status === 'PAUSED')
    || stages.find((st) => st.status !== 'COMPLETED' && st.status !== 'SKIPPED')
    || stages[stages.length - 1];
  return current ? current.stage_key : '';
};

/** Where an order sits for the owner: 'new' (still on the counter),
 *  'workshop' (someone is working on it) or 'done' (delivered or cancelled). */
const ORDER_CLOSED = ['Delivered', 'Cancelled'];
const orderBucket = (order) => {
  if (ORDER_CLOSED.includes(order.order_status)) return 'done';
  const started = (order.stages || []).some((st) => st.stage_key !== 'created' && !['NOT_STARTED', 'SKIPPED'].includes(st.status));
  return started ? 'workshop' : 'new';
};
/** The stage the order is standing on, with the step before and after it
 *  (by name, so per-garment rows count once). */
const stageNow = (order) => {
  const stages = [...(order.stages || [])].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
  const current = stages.find(st => st.status === 'PENDING_VERIFICATION')
    || stages.find(st => st.status === 'IN_PROGRESS' || st.status === 'PAUSED')
    || stages.find(st => st.status !== 'COMPLETED' && st.status !== 'SKIPPED');
  if (!current) return null;
  const i = stages.indexOf(current);
  const prev = stages.slice(0, i).reverse().find(st => st.stage_key !== current.stage_key);
  const next = stages.slice(i + 1).find(st => st.stage_key !== current.stage_key);
  return { current, prev, next, name: current.stage_name };
};
/** Who has a stage right now: the assignee, else whoever last moved it. */
const stageWho = (st) => st.assigned_to_name || (st.status !== 'NOT_STARTED' && st.performed_by_name) || '';
/** '3 h' / '2 d' since a timestamp, for the order book's stage strip. */
const sinceLabel = (iso) => {
  if (!iso) return '';
  const hours = Math.floor((Date.now() - new Date(iso).getTime()) / 36e5);
  return hours < 1 ? 'just now' : hours < 24 ? `${hours} h` : `${Math.floor(hours / 24)} d`;
};

const StyleProfileCard = ({ customer }) => {
  const { t } = useLanguage();
  const dna = customer?.style_dna || {};
  const rows = [
    [t('customersPage.totalSpent', 'Total spent'), dna.revenue ?? dna.budget, Wallet], [t('customersPage.stylePreferences', 'Style preferences'), dna.style, Shirt],
    [t('customersPage.size', 'Size'), dna.size, Ruler], [t('customersPage.visitPattern', 'Visit pattern'), dna.visit_pattern, CalendarDays],
  ].filter(([, v]) => v);
  const riskColor = dna.risk_level === 'danger' ? 'var(--danger-color)'
    : dna.risk_level === 'warning' ? 'var(--warning-color)' : 'var(--success-color)';
  const hasAny = rows.length || dna.risk_status || dna.next_action;
  return (
    <SectionCard icon={Sparkles} tone="amber"
                 title={t('customersPage.styleProfile', 'Style profile')}>
      {!hasAny && (
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>{t('customersPage.noStyleProfile', 'No style profile for this customer yet.')}</div>
      )}
      {rows.map(([label, value, Icon]) => (
        <div key={label} className="at-dna-row">
          <span className="at-dna-label"><Icon size={16} /> {label}</span>
          <strong>{value}</strong>
        </div>
      ))}
      {dna.risk_status && (
        <div className="at-dna-row">
          <span className="at-dna-label"><ShieldCheck size={16} /> {t('customersPage.activity', 'Activity')}</span>
          <strong style={{ color: riskColor, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: riskColor }} />
            {dna.risk_status}
          </strong>
        </div>
      )}
      {dna.next_action && (
        <div className="at-dna-row">
          <span className="at-dna-label"><Target size={16} /> {t('customersPage.suggestedNextStep', 'Suggested next step')}</span>
          <strong style={{ color: 'var(--accent-text)', fontStyle: 'italic' }}>{dna.next_action}</strong>
        </div>
      )}
      {hasAny && (
        <InfoNote tone="green" icon={Leaf} style={{ marginTop: 'var(--space-3)', padding: '10px 14px' }}>
          <em>{t('customersPage.calculatedFromSales', 'Calculated from sales data.')}</em>
        </InfoNote>
      )}
    </SectionCard>
  );
};


const HeaderClock = () => {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(id);
  }, []);
  const date = now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return (
    <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
      {date} · <b style={{ color: 'var(--text-primary)' }}>{time}</b>
    </span>
  );
};

const ScreenLoading = () => <Loader page />;
import { isVisible, splitSpec, validateSpec, withDefaults } from './services/templates';


const SUPERVISOR_ROLES = ['Master'];


const PRODUCTION_ROLES = [
  'Tailor', 'Master', 'Maggam Master', 'Karigar', 'Maggam Karigar', 'Packaging Staff', 'QC Staff',
];
const isProductionStaff = (role) => PRODUCTION_ROLES.includes(role);

const orderStatusTone = (st) =>
  st === 'Delivered' ? 'success'
    : st === 'Cancelled' ? 'neutral'
    : (st === 'Shipped' || st === 'Ready for Dispatch') ? 'info'
    : 'warning';


const STEP_STATE = (status) =>
  (status === 'COMPLETED' || status === 'SKIPPED') ? 'done'
    : (status === 'IN_PROGRESS' || status === 'PAUSED' || status === 'PENDING_VERIFICATION') ? 'live'
    : 'next';
const STEP_LABEL = { done: 'Completed', live: 'In progress', next: 'Not started' };
const STEP_TONE = { done: 'success', live: 'info', next: 'neutral' };


const formatMobile = (raw) => {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    const n = digits.slice(2);
    return `+91 ${n.slice(0, 5)} ${n.slice(5)}`;
  }
  if (digits.length === 10) return `${digits.slice(0, 5)} ${digits.slice(5)}`;
  // A foreign number is stored as its digits; show it with its + and code.
  return formatInternational(raw);
};


const waLink = (raw) => `https://wa.me/${String(raw || '').replace(/\D/g, '')}`;



const APPOINTMENT_STATUS_LABELS = {
  SCHEDULED: 'Scheduled',
  CONFIRMED: 'Confirmed',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  RESCHEDULED: 'Rescheduled',
};

const APPOINTMENT_TYPE_LABELS = {
  CONSULTATION: 'Design Consultation',
  MEASUREMENT: 'Measurement Fitting',
  TRIAL: 'Garment Trial',
  DELIVERY: 'Final Delivery',
  OTHER: 'Other',
};


const STAFF_ROLES = [
  { value: 'Tailor', label: 'Stitching Tailor', hint: 'Stitches the garment.' },
  { value: 'Master', label: 'Master Tailor (generalist)', hint: 'Can work on every stage.' },
  { value: 'Maggam Master', label: 'Maggam Master', hint: 'Runs embroidery before stitching.' },
  { value: 'Karigar', label: 'Karigar', hint: 'Handwork on the frame, alongside the Maggam Master.' },
  { value: 'Maggam Karigar', label: 'Maggam Karigar', hint: 'Frame work on the finished design, after the Maggam Master.' },
  { value: 'Packaging Staff', label: 'Packaging Staff', hint: 'Packs the garment before dispatch.' },
  { value: 'QC Staff', label: 'QC Staff', hint: 'Runs the quality inspection.' },
];


const MENS_GARMENT_KEYS = new Set([
  'shirt', 't_shirt', 'kurta', 'indo_western', 'mens_suit', 'trouser', 'jeans',
  'shorts', 'mens_bottom_wear', 'coat', 'casual_wear', 'sherwani', 'jacket',
]);
const WOMENS_GARMENT_KEYS = new Set([
  'saree', 'blouse', 'lehenga', 'lehenga_blouse', 'dupatta', 'kurti', 'anarkali',
  'petticoat', 'bottom_wear', 'gown', 'suit', 'jacket',
]);
const garmentsForGender = (templates, gender) => {
  const keys = gender === 'Male' ? MENS_GARMENT_KEYS : gender === 'Female' ? WOMENS_GARMENT_KEYS : null;
  return keys ? templates.filter((t) => keys.has(t.key)) : templates;
};

const GARMENT_PRICES = {
  'Lehenga': 32000,
  'Gown': 25000,
  'Saree': 15000,
  'Anarkali': 18000,
  'Kurti': 5000,
  'Sherwani': 35000,
  'Suit': 22000,
  // men's wear
  'Shirt': 3500,
  'T-Shirt': 1500,
  'Kurta': 4500,
  'Indo-Western': 25000,
  'Mens Suit': 30000,
  'Trouser': 3000,
  'Jeans': 3000,
  'Shorts': 2000,
  'Mens Bottom Wear': 2500,
  'Coat': 18000,
  'Casual Wear': 3000
};

const DEFAULT_CUSTOMER_DATA = {
  first_name: '',
  last_name: '',
  mobile_number: '',
  email_address: '',
  address: '',
  city_region: '',
  source: 'Walk In',
  customer_type: 'Silver',
  gender: '',
  garment_type: 'Lehenga',
  neckline_style: '',
  sleeve_style: '',
  back_style: '',
  length_preference: '',
  silhouette: '',
  embellishments: '',
  pattern_style: '',
  occasion: '',
  custom_requirements: '',
  date_of_birth: '',
  occupation: '',
  preferred_communication: 'WhatsApp',
  notes: '',
  measurements: {
    bust: '',
    waist: '',
    hips: '',
    shoulder: '',
    arm_length: '',
    neck: '',
    length: ''
  }
};

const humaniseSpecKey = (key) => {
  const words = String(key).replace(/_/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

const orderGarmentNames = (order) => {
  if (!order) return [];
  if (Array.isArray(order.garments) && order.garments.length) return order.garments;
  const jobs = order.garment_jobs || [];
  if (jobs.length) return jobs.map(j => j.template_name || j.template_key || 'Custom garment');
  return order.customer_garment_type ? [order.customer_garment_type] : [];
};

const orderGarmentLabel = (order) => {
  const names = orderGarmentNames(order);
  if (!names.length) return 'Custom garment';
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
};

const getVisibleMeasurementFields = (stitchParts) => {
  const allFields = ['bust', 'waist', 'hips', 'shoulder', 'arm_length', 'neck', 'length'];
  if (!stitchParts || stitchParts.length === 0) return allFields;
  
  const hasUpper = stitchParts.some(p => ['Blouse', 'Blouse / Choli', 'Kurta / Kameez', 'Sherwani Top', 'Anarkali Dress', 'Gown Body', 'Kurti Top'].includes(p));
  const hasLower = stitchParts.some(p => ['Skirt', 'Salwar / Bottom', 'Pants / Churidar', 'Bottom Churidar', 'Petticoat'].includes(p));
  
  const fields = [];
  if (hasUpper) {
    fields.push('bust', 'shoulder', 'arm_length', 'neck');
  }
  if (hasLower) {
    fields.push('hips');
  }
  if (hasUpper || hasLower) {
    fields.push('waist', 'length');
  }
  
  return allFields.filter(f => fields.includes(f));
};


function CustomerMessageQueue({ orderId, messages, onMarkSent }) {
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);

  const markSent = async (messageId) => {
    setBusyId(messageId);
    setError(null);
    try {
      await onMarkSent(orderId, messageId);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  if (!messages.length && !error) return null;

  const queued = messages.filter((m) => m.status === 'QUEUED');
  const when = (iso) => {
    if (!iso) return ['', ''];
    const d = new Date(iso);
    return [
      d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }),
      d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
    ];
  };

  return (
    <div className="at-section od-updates">
      <div className="od-section-head">
        <IconTile icon={MessageSquare} tone="neutral" size={36} iconSize={16} />
        <div className="od-section-title">
          <h3>Customer updates</h3>
          {queued.length > 0
            ? <span className="ui-badge ui-badge--warning">{queued.length} waiting to send</span>
            : <span className="od-section-sub">Everything sent</span>}
        </div>
      </div>

      {error && <div className="od-error">{error}</div>}

      <ol className="od-feed">
        {messages.map((message) => {
          const isQueued = message.status === 'QUEUED';
          const [day, time] = when(message.created_at);
          return (
            <li key={message.id} className={`od-feed-item${isQueued ? '' : ' od-feed-item--sent'}`}>
              <span className={`od-feed-dot od-feed-dot--${isQueued ? 'queued' : 'sent'}`} aria-hidden="true" />
              <div className="od-feed-when">{day}<br />{time}</div>
              <div className="od-feed-body">
                <div className="od-feed-meta">
                  <span className="ui-badge ui-badge--neutral">{message.template_key.replace(/_/g, ' ')}</span>
                  <span>{message.to_number}</span>
                  {!isQueued && (
                    <span>· {message.status.toLowerCase()}{message.sent_by_name ? ` by ${message.sent_by_name}` : ''}</span>
                  )}
                </div>
                <p className="od-feed-text">{message.body}</p>
              </div>
              {isQueued && (
                <div className="od-feed-actions">
                  {message.whatsapp_url ? (
                    <a href={message.whatsapp_url} target="_blank" rel="noopener noreferrer" className="btn-secondary at-btn-sm">
                      <MessageSquare size={14} /> Open WhatsApp
                    </a>
                  ) : (
                    <span className="od-hint">No mobile number</span>
                  )}
                  <button type="button" className="btn-secondary at-btn-sm" disabled={busyId === message.id}
                          onClick={() => markSent(message.id)}>
                    <Check size={14} /> {busyId === message.id ? 'Saving…' : 'Mark sent'}
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

const GARMENT_VIEWS = [
  ['FRONT', 'Front view'], ['BACK', 'Back view'],
  ['LEFT', 'Left side'], ['RIGHT', 'Right side'],
  ['DETAIL', 'Close-up detail'], ['FABRIC', 'Fabric texture'],
  ['SLEEVE', 'Sleeve detail'], ['BLOUSE', 'Blouse detail'],
  ['DUPATTA', 'Dupatta styling'],
];

function GarmentGallery({ order, onChanged }) {
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [view, setView] = useState('FRONT');

  const images = order.garment_images || [];
  const published = order.garment_images_published;
  const have = new Set(images.map((i) => i.view));
  const missing = ['FRONT', 'BACK'].filter((v) => !have.has(v));

  const run = async (work) => {
    setBusy(true);
    setError(null);
    try {
      await work();
      await onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="at-section od-gallery">
      <div className="od-section-head">
        <IconTile icon={Camera} tone="amber" size={40} iconSize={18} />
        <div className="od-section-title od-section-title--stack">
          <h3>{t('ordersPage.garmentPhotos', 'Garment photos')}</h3>
          <span className="od-section-sub">
            {published
              ? t('ordersPage.visibleToCustomer', 'visible to the customer')
              : t('ordersPage.uploadedNotShared', '{count} uploaded, not yet shared', { count: images.length })}
          </span>
        </div>
        <div className="od-head-actions">
          <select className="form-control od-select" value={view} onChange={(e) => setView(e.target.value)} disabled={busy}
                  aria-label="Which view the next photo shows">
            {GARMENT_VIEWS.map(([value, label]) => (
              <option key={value} value={value}>{label}{have.has(value) ? ' (replace)' : ''}</option>
            ))}
          </select>
          <AddPhotoButton camera className="btn-primary at-btn-sm" icon={Plus} disabled={busy}
                          label={busy ? 'Working…' : t('common.addPhoto', 'Add photo')}
                          onFiles={([file]) => { const bad = imageFilesError([file]); if (bad) { alert(bad); return; } run(() => api.uploadGarmentImage(order.id, view, file)); }} />
        </div>
      </div>

      {error && <div className="od-error">{error}</div>}

      {images.length > 0 ? (
        <div className="od-photos">
          {images.map((image) => (
            <PhotoTile key={image.id} src={resolveMediaUrl(image.image)} alt={image.view_label} label={image.view_label} size={112}
                       onRemove={busy ? undefined : () => run(() => api.deleteGarmentImage(order.id, image.id))} />
          ))}
        </div>
      ) : (
        <div className="od-photos-empty">
          <Camera size={18} />
          <span>{t('ordersPage.noPhotosYet', 'No photos yet. Add the front and back views to share them with the customer.')}</span>
        </div>
      )}

      {/* Sharing is what the photos are for: the customer sees them once front
          and back are in. */}
      <div className="od-gallery-foot">
        <button type="button" className="btn-secondary at-btn-sm"
                disabled={busy || (!published && missing.length > 0)}
                title={missing.length ? `Still needs: ${missing.join(', ')}` : ''}
                onClick={() => run(() => api.publishGarmentImages(order.id, !published))}>
          <ArrowRight size={14} /> {published ? 'Hide from customer' : t('ordersPage.shareWithCustomer', 'Share with customer')}
        </button>
        {!published && missing.length > 0 && (
          <span className="od-hint">{t('ordersPage.needsFrontAndBack', 'needs front and back')}</span>
        )}
      </div>
    </section>
  );
}

// Which stages carry a voice note worth pointing at. Default: any stage with
// a recording. Callers that know who is looking pass a narrower test, so a
// person is not pointed at their own note.
const anyVoiceNote = (stage) => Boolean(stage.voice_note);

/** One status per stage key across its rows: a per-garment stage is done
 *  once every garment's row is, live while any has begun. The order-level
 *  view the header counts and the kanban use. */
const rollupStages = (stages) => {
  const out = [];
  const seen = new Map();
  (stages || []).forEach((s) => {
    const cur = seen.get(s.stage_key);
    if (!cur) { const row = { ...s, garment_job: null, garment_name: null }; seen.set(s.stage_key, row); out.push(row); return; }
    const a = STEP_STATE(cur.status), b = STEP_STATE(s.status);
    if (a === 'done' && b !== 'done') cur.status = b === 'live' ? s.status : 'IN_PROGRESS';
    else if (a === 'next' && b !== 'next') cur.status = 'IN_PROGRESS';
    else if (a === 'done' && b === 'done' && s.completed_at && (!cur.completed_at || s.completed_at > cur.completed_at)) cur.completed_at = s.completed_at;
  });
  return out;
};

/** The journey in plain parts: the order-level steps before the workroom,
 *  one garment per card for the per-garment steps, then the order-level
 *  steps after. A stage with no garment on an order with no garment rows
 *  (an older order) goes in the head, so it still reads top to bottom. */
const stageLanes = (stages) => {
  const rows = stages || [];
  const garments = [];
  rows.forEach((s) => {
    if (!s.garment_job) return;
    let lane = garments.find((l) => l.key === s.garment_job);
    if (!lane) { lane = { key: s.garment_job, label: s.garment_name || 'Garment', stages: [] }; garments.push(lane); }
    lane.stages.push(s);
  });
  const shared = rows.filter((s) => !s.garment_job);
  if (!garments.length) return { head: shared, garments, tail: [] };
  const firstSeq = Math.min(...garments.map((l) => l.stages[0].sequence));
  return {
    head: shared.filter((s) => s.sequence < firstSeq),
    garments,
    tail: shared.filter((s) => s.sequence >= firstSeq),
  };
};

const isSettled = (s) => s.status === 'COMPLETED' || s.status === 'SKIPPED';
const isLive = (s) => ['IN_PROGRESS', 'PAUSED', 'PENDING_VERIFICATION'].includes(s.status);
/** The one row to do now: the one in hand, else the first not yet done. */
const currentRow = (rows) => rows.find(isLive) || rows.find((s) => !isSettled(s)) || null;

/** One task line: a plain mark, the name, and what state it is in, in words. */
function JourneyTask({ stage, current, onSelect, hasVoiceNote }) {
  const { t } = useLanguage();
  const done = isSettled(stage);
  const live = isLive(stage);
  const words = stage.status === 'COMPLETED' ? t('ordersPage.taskDone', 'Completed')
    : stage.status === 'SKIPPED' ? t('ordersPage.taskSkipped', 'Skipped')
    : stage.status === 'PENDING_VERIFICATION' ? t('ordersPage.taskWaitingCheck', 'Waiting for check')
    : stage.status === 'PAUSED' ? t('ordersPage.taskPaused', 'Paused')
    : live ? t('ordersPage.taskLive', 'In progress')
    : t('ordersPage.taskNotStarted', 'Not started');
  const shortDate = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return (
    <button type="button" className={`oj-task${done ? ' oj-task--done' : ''}${current ? ' oj-task--current' : ''}`}
            onClick={() => onSelect(stage)}
            title={`${stage.stage_name} — ${words}`}>
      <span className="oj-mark" aria-hidden="true">{done ? '✓' : live ? '●' : '○'}</span>
      <span className="oj-task-name">
        {stage.stage_name}
        {hasVoiceNote(stage) && <Mic size={12} className="oj-mic" aria-label="Voice note" />}
      </span>
      <span className="oj-task-state">
        {words}{stage.status === 'COMPLETED' && stage.completed_at ? ` · ${shortDate(stage.completed_at)}` : ''}
      </span>
      {current && <span className="oj-task-now">← {t('ordersPage.currentTask', 'Current task')}</span>}
    </button>
  );
}

function JourneyTaskList({ rows, onSelectStage, hasVoiceNote }) {
  const now = currentRow(rows);
  return (
    <div className="oj-tasks" role="list">
      {rows.map((stage) => (
        <JourneyTask key={stage.id || stage.stage_key} stage={stage} current={now === stage}
                     onSelect={onSelectStage} hasVoiceNote={hasVoiceNote} />
      ))}
    </div>
  );
}

/** One garment, folded to a line -- its name and how far along it is -- and
 *  opened to its task list. Only one garment is open at a time, so the
 *  person reads one job, not every job on the order. */
function StageTimeline({ stages, onSelectStage, hasVoiceNote = anyVoiceNote }) {
  const { t } = useLanguage();
  const { head, garments, tail } = stageLanes(stages);
  const autoKey = (garments.find((g) => g.stages.some(isLive)) || garments.find((g) => g.stages.some((s) => !isSettled(s))))?.key || null;
  const [pick, setPick] = React.useState();
  const openKey = pick === undefined ? autoKey : pick;
  const setOpenKey = setPick;

  if (!stages || stages.length === 0) {
    return (
      <div className="od-empty">
        {t('ordersPage.noProductionStages', 'No production stages recorded for this order.')}
      </div>
    );
  }
  const allGarmentsDone = garments.every((g) => g.stages.every(isSettled));

  return (
    <div className="oj">
      {head.length > 0 && <JourneyTaskList rows={head} onSelectStage={onSelectStage} hasVoiceNote={hasVoiceNote} />}

      {garments.length > 0 && (
        <div className="oj-section">
          <div className="stat-label">{t('ordersPage.garmentsToMake', 'Garments to make')}</div>
          {garments.map((g) => {
            const done = g.stages.filter(isSettled).length;
            const finished = done === g.stages.length;
            const open = g.key === openKey;
            const now = currentRow(g.stages);
            return (
              <div key={g.key} className={`oj-garment${finished ? ' oj-garment--done' : ''}${open ? ' oj-garment--open' : ''}`}>
                <button type="button" className="oj-garment-head" aria-expanded={open}
                        onClick={() => setOpenKey(open ? null : g.key)}>
                  <span className="oj-mark" aria-hidden="true">{finished ? '✓' : now && isLive(now) ? '●' : '○'}</span>
                  <span className="oj-garment-name">{g.label}</span>
                  <span className="oj-garment-progress">
                    <span>{t('ordersPage.garmentProgress', '{done} of {total} completed').replace('{done}', done).replace('{total}', g.stages.length)}</span>
                    <span className="oj-bar" aria-hidden="true"><span style={{ width: `${(done / g.stages.length) * 100}%` }} /></span>
                  </span>
                  {!finished && now && !open && <span className="oj-garment-next">{t('ordersPage.nextUp', 'Now')}: {now.stage_name}</span>}
                  <ChevronDown size={16} className="oj-chevron" />
                </button>
                {open && <JourneyTaskList rows={g.stages} onSelectStage={onSelectStage} hasVoiceNote={hasVoiceNote} />}
              </div>
            );
          })}
        </div>
      )}

      {tail.length > 0 && (
        <div className="oj-section">
          <div className="stat-label">{t('ordersPage.orderCompletion', 'Order completion')}</div>
          {garments.length > 0 && !allGarmentsDone && (
            <div className="oj-hint">{t('ordersPage.afterGarments', 'Starts once every garment above is finished.')}</div>
          )}
          <JourneyTaskList rows={tail} onSelectStage={onSelectStage} hasVoiceNote={hasVoiceNote} />
        </div>
      )}
    </div>
  );
}

/** What a stage is doing, in words, and the tone of its badge. */
const stageWords = (t, status) => (
  status === 'COMPLETED' ? [t('ordersPage.taskDone', 'Completed'), 'success']
  : status === 'SKIPPED' ? [t('ordersPage.taskSkipped', 'Skipped'), 'neutral']
  : status === 'PENDING_VERIFICATION' ? [t('ordersPage.taskWaitingCheck', 'Waiting for check'), 'warning']
  : status === 'PAUSED' ? [t('ordersPage.taskPaused', 'Paused'), 'warning']
  : isLive({ status }) ? [t('ordersPage.taskLive', 'In progress'), 'info']
  : [t('ordersPage.taskNotStarted', 'Not started'), 'neutral']);

/** The row of a stage to open: the garment in hand, else the first not yet
 *  done, else the first. A rolled-up step names a stage, not a garment. */
const rowToOpen = (stages, stageKey) => {
  const rows = (stages || []).filter((s) => s.stage_key === stageKey);
  return rows.find(isLive) || rows.find((s) => !isSettled(s)) || rows[0] || null;
};

/** The order's journey as one table: a numbered step per stage (a per-garment
 *  stage counts once), what state it is in, when it closed, and the one
 *  action that fits. Every row opens its stage. */
function OrderTaskTable({ stages, onSelectStage }) {
  const { t } = useLanguage();
  const steps = rollupStages(stages);
  if (!steps.length) {
    return <div className="od-empty">{t('ordersPage.noProductionStages', 'No production stages recorded for this order.')}</div>;
  }
  const current = currentRow(steps);
  return (
    <div className="at-table-wrap od-tasks-wrap">
      <table className="at-table at-table--fit od-tasks">
        <thead>
          <tr>
            <th className="od-tasks-num">#</th>
            <th>{t('ordersPage.taskCol', 'Task')}</th>
            <th>{t('common.status', 'Status')}</th>
            <th>{t('ordersPage.completedOn', 'Completed on')}</th>
            <th style={{ textAlign: 'right' }}>{t('common.actions', 'Actions')}</th>
          </tr>
        </thead>
        <tbody>
          {steps.map((step, i) => {
            const [words, tone] = stageWords(t, step.status);
            const done = isSettled(step);
            const live = isLive(step);
            const open = () => { const row = rowToOpen(stages, step.stage_key); if (row) onSelectStage(row); };
            return (
              <tr key={step.stage_key} className={step === current ? 'od-tasks-row--current' : done ? 'od-tasks-row--done' : ''}
                  onClick={open} style={{ cursor: 'pointer' }}>
                <td className="od-tasks-num">{i + 1}</td>
                <td data-label={t('ordersPage.taskCol', 'Task')}>
                  <span className="od-tasks-name">{step.stage_name}{anyVoiceNote(step) && <Mic size={12} className="oj-mic" aria-label="Voice note" />}</span>
                </td>
                <td data-label={t('common.status', 'Status')}>
                  <span className={`ui-badge ui-badge--${tone}`}>
                    <span className="od-tasks-dot" aria-hidden="true" />{words}
                  </span>
                </td>
                <td data-label={t('ordersPage.completedOn', 'Completed on')} className="od-tasks-when">
                  {step.status === 'COMPLETED' && step.completed_at ? fmtDate(step.completed_at) : '—'}
                </td>
                <td style={{ textAlign: 'right' }}>
                  {live ? (
                    <button type="button" className="btn-primary at-btn-sm" onClick={(e) => { e.stopPropagation(); open(); }}>
                      {t('ordersPage.updateStage', 'Update')}
                    </button>
                  ) : done ? (
                    <button type="button" className="btn-secondary at-btn-sm" onClick={(e) => { e.stopPropagation(); open(); }}>
                      {t('common.view', 'View')}
                    </button>
                  ) : (
                    <span className="od-tasks-when">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Each garment on the order with its own steps as chips, so a two-garment
 *  order shows which blouse is on which step. A chip opens that row. */
function OrderGarmentsCard({ order, onSelectStage }) {
  const { t } = useLanguage();
  const jobs = order.garment_jobs || [];
  if (!jobs.length) return null;
  return (
    <section className="at-section od-garments">
      <div className="od-section-head">
        <IconTile icon={Shirt} tone="green" size={40} iconSize={18} />
        <div className="od-section-title od-section-title--stack">
          <h3>{t('ordersPage.garmentsInOrder', 'Garments in this order')}</h3>
          <span className="od-section-sub">{t('ordersPage.garmentsInOrderSub', 'Items to be prepared')}</span>
        </div>
      </div>
      <div className="od-garment-list">
        {jobs.map((job) => {
          const rows = (order.stages || []).filter((s) => s.garment_job === job.id).sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
          return (
            <div key={job.id} className="od-garment">
              <div className="od-garment-tile" aria-hidden="true"><Shirt size={20} /></div>
              <div className="od-garment-body">
                <div className="od-garment-name">{job.template_name || t('ordersPage.garment', 'Garment')}</div>
                {rows.length > 0 && (
                  <div className="od-garment-steps">
                    {rows.map((s) => {
                      const state = STEP_STATE(s.status);
                      return (
                        <button key={s.id} type="button" className={`od-garment-step od-garment-step--${state}`}
                                onClick={() => onSelectStage(s)} title={`${s.stage_name} — ${stageWords(t, s.status)[0]}`}>
                          {s.stage_name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/**
 * How the order leaves the boutique: pickup, or a courier with its details.
 * Intake no longer asks; the counter decides here, when it is decided, through
 * the same PATCH the rest of the order page uses.
 */
function DeliveryCard({ order, canEdit, onSaved }) {
  const { t } = useLanguage();
  const [editing, setEditing] = useState(false);
  const fromOrder = () => ({
    delivery_method: order.delivery_method || 'Direct Pickup',
    courier_service: order.courier_service || '',
    tracking_number: order.tracking_number || '',
    delivery_address: order.delivery_address || '',
  });
  const [form, setForm] = useState(fromOrder);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const courier = form.delivery_method === 'Courier';
  const save = async () => {
    setBusy(true); setError(null);
    try {
      await api.updateOrder(order.id, courier ? form : { ...form, courier_service: '', tracking_number: '' });
      setEditing(false);
      if (onSaved) onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="od-delivery">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-primary)' }}>
          {t('ordersPage.deliveryMethodLabel', 'Delivery Method:')} {order.delivery_method_display || t(`deliveryMethod.${order.delivery_method}`, order.delivery_method)}
        </span>
        {canEdit && !editing && (
          <button type="button" className="btn-secondary at-btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setEditing(true)}>
            <Edit2 size={12} /> {t('common.edit', 'Edit')}
          </button>
        )}
      </div>
      {!editing && order.delivery_method === 'Courier' && (
        <div className="mobile-stack-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginTop: 8 }}>
          <div><strong>Courier:</strong> {order.courier_service || 'TBD'}</div>
          <div><strong>Tracking:</strong> {order.tracking_number || 'TBD'}</div>
          <div style={{ gridColumn: 'span 2' }}><strong>Address:</strong> {order.delivery_address || 'No address specified'}</div>
        </div>
      )}
      {editing && (
        <div className="od-delivery-form">
          <div className="at-seg" role="group" aria-label={t('ordersPage.deliveryMethodLabel', 'Delivery Method:')}>
            {['Direct Pickup', 'Courier'].map((method) => (
              <button key={method} type="button" aria-pressed={form.delivery_method === method}
                      onClick={() => setForm({ ...form, delivery_method: method })}>
                {t(`deliveryMethod.${method}`, method)}
              </button>
            ))}
          </div>
          {courier && (
            <div className="form-grid-2" style={{ marginTop: 10 }}>
              <input className="form-control" placeholder="Courier (e.g. DTDC, Blue Dart)" value={form.courier_service} maxLength={LIMITS.reference}
                     onChange={(e) => setForm({ ...form, courier_service: e.target.value })} />
              <input className="form-control" placeholder="Tracking number" value={form.tracking_number} maxLength={LIMITS.reference}
                     onChange={(e) => setForm({ ...form, tracking_number: e.target.value })} />
              <textarea className="form-control" rows={2} placeholder="Delivery address" style={{ gridColumn: 'span 2' }} maxLength={LIMITS.address}
                        value={form.delivery_address} onChange={(e) => setForm({ ...form, delivery_address: e.target.value })} />
            </div>
          )}
          {error && <div className="od-error">{error}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button type="button" className="btn-primary at-btn-sm" disabled={busy} onClick={save}>{busy ? 'Saving\u2026' : t('common.save', 'Save')}</button>
            <button type="button" className="btn-secondary at-btn-sm" disabled={busy} onClick={() => { setEditing(false); setForm(fromOrder()); }}>{t('common.cancel', 'Cancel')}</button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The order's special instructions, where the boutique can edit the order.
 * Saved on blur and every minute like the rest of the product, through the
 * PATCH the master's checklist already uses. Keyed by order at the call site,
 * so a different order starts from its own text.
 */
function OrderNotesCard({ order, canEdit, onSaved }) {
  const [text, setText] = useState(order.special_instructions || '');
  const [state, setState] = useState('idle');
  const savedRef = useRef(order.special_instructions || '');
  const [voiceNote, setVoiceNote] = useState({
    url: order.instructions_voice_note || '', by: order.instructions_voice_note_by || '', at: order.instructions_voice_note_at || null,
  });
  const sendVoice = async (blob) => {
    const url = await api.uploadVoiceNote(blob);
    const updated = await api.updateOrder(order.id, { instructions_voice_note: url });
    setVoiceNote({ url, by: updated?.instructions_voice_note_by || '', at: updated?.instructions_voice_note_at || null });
    if (onSaved) onSaved();
  };
  const deleteVoice = async () => {
    await api.updateOrder(order.id, { instructions_voice_note: '' });
    setVoiceNote({ url: '', by: '', at: null });
    if (onSaved) onSaved();
  };

  const save = async () => {
    const value = text.trim();
    if (value === savedRef.current) return;
    setState('saving');
    try {
      await api.updateOrder(order.id, { special_instructions: value });
      savedRef.current = value;
      setState('saved');
      if (onSaved) onSaved();
    } catch (err) {
      setState('error');
      throw err;
    }
  };
  useAutosave({ getSnapshot: () => (canEdit ? text.trim() : null), save, enabled: canEdit });

  if (!canEdit && !text) return null;
  return (
    <section className="at-section od-notes">
      <div className="od-section-head">
        <IconTile icon={FileText} tone="neutral" size={40} iconSize={18} />
        <div className="od-section-title od-section-title--stack">
          <h3>Special instructions</h3>
          <span className="od-section-sub">What the workroom should know about this order.</span>
        </div>
      </div>
      {canEdit ? (
        <>
          <VoiceTextarea className="form-control od-notes-input" rows={4} maxLength={500} value={text}
                    placeholder="Anything the workroom should know about this order…"
                    onChange={(e) => { setText(e.target.value); setState('idle'); }}
                    onBlur={() => save().catch(() => {})} />
          <VoiceRecorder sent={voiceNote.url ? voiceNote : null} onSend={sendVoice} onDelete={deleteVoice} />
          <div className="od-notes-foot">
            <span className={state === 'error' ? 'od-error' : 'od-hint'}>
              {state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved' : state === 'error' ? 'Could not save, will retry' : 'Saves on its own'}
            </span>
            <span className="od-hint">{text.length}/500</span>
          </div>
        </>
      ) : (
        <>
          <p className="od-notes-text">{text}</p>
          <VoiceNotePlayer src={voiceNote.url} />
          {voiceNote.url && (
            <div className="od-hint" style={{ marginTop: '4px' }}>
              Voice note from <strong>{voiceNote.by || 'someone'}</strong>
              {voiceNote.at ? ` · ${new Date(voiceNote.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}` : ''}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function CuttingUsage({ orderId }) {
  const [plan, setPlan] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState({});
  const [busyLineId, setBusyLineId] = useState(null);

  const refresh = () => api.getMaterialChecklist(orderId)
    .then((data) => { setPlan(data.plan); setLoaded(true); })
    .catch(() => setLoaded(true));
  useEffect(() => { refresh(); }, [orderId]);

  if (!loaded) return <Loader inline label="Loading materials…" />;
  const lines = (plan?.lines || []).filter((l) => l.item && !l.is_customer_supplied);
  if (!lines.length) {
    return <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No stock material is planned on this order.</div>;
  }
  const unit = (line) => (line.unit_display || line.unit || '').toLowerCase();
  const record = async (line) => {
    const entry = draft[line.id] || {};
    const used = Number(entry.used || 0);
    const wasted = Number(entry.wasted || 0);
    if (!(used > 0 || wasted > 0)) { alert('Enter the quantity used, the waste, or both.'); return; }
    setBusyLineId(line.id);
    try {
      await api.consumePlanLine(plan.id, { line: line.id, used, wasted, stage_key: 'pattern_cutting' });
      setDraft((d) => ({ ...d, [line.id]: {} }));
      await refresh();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusyLineId(null);
    }
  };
  const num = { padding: '6px 8px', fontSize: '13px', width: '96px' };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {lines.map((line) => (
        <div key={line.id} style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px 12px',
                                    display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px' }}>
          <div style={{ flex: '1 1 220px', minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: '13.5px' }}>{line.material_name}</div>
            <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>
              {line.garment_name ? `${line.garment_name} · ` : ''}
              planned {line.required_quantity} {unit(line)} · reserved {line.reserved_quantity}
              {Number(line.consumed_quantity) > 0 ? ` · used ${line.consumed_quantity}` : ''}
              {Number(line.wasted_quantity) > 0 ? ` · waste ${line.wasted_quantity}` : ''}
              {line.available_stock !== undefined && line.available_stock !== null ? ` · ${line.available_stock} on the shelf` : ''}
            </div>
          </div>
          <input type="number" min="0" max={LIMITS.quantity} step="0.001" inputMode="decimal" className="form-control" style={num} placeholder={`Used (${unit(line)})`}
                 value={draft[line.id]?.used ?? ''}
                 onChange={(e) => { const used = cleanAmount(e.target.value, { max: LIMITS.quantity, decimals: 3 }); setDraft((d) => ({ ...d, [line.id]: { ...(d[line.id] || {}), used } })); }} />
          <input type="number" min="0" max={LIMITS.quantity} step="0.001" inputMode="decimal" className="form-control" style={num} placeholder="Waste"
                 value={draft[line.id]?.wasted ?? ''}
                 onChange={(e) => { const wasted = cleanAmount(e.target.value, { max: LIMITS.quantity, decimals: 3 }); setDraft((d) => ({ ...d, [line.id]: { ...(d[line.id] || {}), wasted } })); }} />
          <button type="button" className="btn-secondary" style={{ fontSize: '12px', padding: '6px 12px' }}
                  disabled={busyLineId === line.id} onClick={() => record(line)}>
            {busyLineId === line.id ? 'Recording…' : 'Record'}
          </button>
        </div>
      ))}
    </div>
  );
}


const hasMaterials = (order) =>
  (order.garment_jobs || []).some((job) => (job.materials || []).length > 0);

function MaterialsChecklist({ orderId, role, onActivity }) {
  const [plan, setPlan] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [opened, setOpened] = useState(false);
  const [busyLineId, setBusyLineId] = useState(null);
  const canEdit = role === 'Owner' || role === 'Master';

  const refresh = () => api.getMaterialChecklist(orderId)
    .then((data) => { setPlan(data.plan); setLoaded(true); })
    .catch(() => setLoaded(true));
  useEffect(() => { if (opened) refresh(); /* eslint-disable-next-line */ }, [opened, orderId]);

  if (!opened) {
    return (
      <button type="button" className="btn-secondary at-btn-sm" onClick={() => setOpened(true)}>
        Show materials <ArrowRight size={14} />
      </button>
    );
  }
  if (!loaded) return <div style={{ padding: '6px 0' }}><Loader inline label="Loading materials…" /></div>;
  if (!plan || !(plan.lines || []).length) {
    return <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '6px 0' }}>No materials were planned on this order.</div>;
  }
  const remaining = plan.lines.filter((l) => !l.gathered_at).length;

  const act = async (fn) => {
    try { await fn(); await refresh(); if (onActivity) onActivity(); }
    catch (err) { alert(err.message); }
    finally { setBusyLineId(null); }
  };

  return (
    <div style={{ marginTop: '8px' }}>
      <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '8px', color: remaining ? '#b45309' : 'var(--success-color)' }}>
        {remaining ? `⚠ ${remaining} of ${plan.lines.length} still to gather` : `✓ All ${plan.lines.length} materials gathered`}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {plan.lines.map((line) => (
          <div key={line.id} style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '8px 10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: canEdit ? 'pointer' : 'default', flex: '1 1 auto' }}>
                <input
                  type="checkbox"
                  checked={!!line.gathered_at}
                  disabled={!canEdit || busyLineId === line.id}
                  onChange={(e) => {
                    setBusyLineId(line.id);
                    act(() => api.gatherMaterialLine(plan.id, line.id, e.target.checked));
                  }}
                />
                <span style={{ textDecoration: line.gathered_at ? 'line-through' : 'none' }}>
                  {line.material_name} — {line.required_quantity} {line.unit_display || line.unit}
                  {line.is_customer_supplied ? ' (customer\u2019s own)' : ''}
                </span>
              </label>
              {canEdit && (
                <AddPhotoButton camera className="btn-secondary" style={{ fontSize: '11px', padding: '3px 8px' }} iconSize={12}
                                disabled={busyLineId === line.id}
                                onFiles={([f]) => {
                                  const bad = imageFilesError([f]);
                                  if (bad) { alert(bad); return; }
                                  setBusyLineId(line.id);
                                  act(() => api.addMaterialLinePhoto(plan.id, line.id, f));
                                }} />
              )}
            </div>
            {(line.gathered_at || Number(line.consumed_quantity) > 0 || (line.photos || []).length > 0) && (
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px', display: 'flex', flexWrap: 'wrap', gap: '4px 12px', alignItems: 'center' }}>
                {line.gathered_at && (
                  <span>Gathered by {line.gathered_by_name || 'staff'} · {new Date(line.gathered_at).toLocaleDateString()}</span>
                )}
                {Number(line.consumed_quantity) > 0 && (
                  <span>{line.consumed_quantity} {line.unit_display || line.unit} used in stitching</span>
                )}
                {(line.photos || []).map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noreferrer">
                    <img src={url} alt="material" style={{ width: '34px', height: '34px', objectFit: 'cover', borderRadius: '4px', border: '1px solid var(--border-color)' }} />
                  </a>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}


function NetworkActivityBar() {
  const [active, setActive] = useState(false);
  useEffect(() => {
    const onActivity = (e) => setActive(e.detail > 0);
    window.addEventListener('api-activity', onActivity);
    return () => window.removeEventListener('api-activity', onActivity);
  }, []);
  if (!active) return null;
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: '3px', zIndex: 3000, overflow: 'hidden', background: 'rgba(15, 41, 30, 0.12)' }}>
      <div style={{ position: 'absolute', top: 0, bottom: 0, width: '38%', background: 'var(--text-primary, var(--text-primary))', borderRadius: '3px', animation: 'apiActivitySweep 1.1s ease-in-out infinite' }} />
    </div>
  );
}

const NAV_MODULE = {
  overview: null,
  orders: null,
  workshop: null,
  alterations: 'alterations',
  customers: null,
  work: null,
  check: null,
  done: null,
  invoices: null,
  analytics: null,
  account: null,
  settings: null,
  designs: 'design_studio',
  designWork: 'design_studio',
  inventory: 'inventory',
  staff: 'staff',
  finance: 'finance',
};

const hasModule = (user, key) =>
  !key || !Array.isArray(user?.modules) || user.modules.includes(key);


const canSeeTab = (user, tab) => {
  if (import.meta.env.DEV && !(tab in NAV_MODULE)) {
    console.warn(`canSeeTab: no NAV_MODULE row for "${tab}" -- showing it to every role. Add a module key, or an explicit null if that is meant.`);
  }
  return hasModule(user, NAV_MODULE[tab]);
};


const navSectionsFor = (user, t) => {
  const role = user?.role;
  const sections =
    (!role || role === 'Owner') ? [
      { key: 'daily', label: t('nav.groups.daily', 'Overview'), items: [
        { tab: 'overview', icon: Store, label: t('nav.dashboard'), phone: true },
        { tab: 'orders', icon: ShoppingBag, label: t('nav.manageOrders'), phone: true, phoneLabel: t('nav.orders', 'Orders') },
        { tab: 'workshop', icon: Scissors, label: t('nav.workshop', 'Production'), phone: true },
        { tab: 'customers', icon: Contact, label: t('nav.customers'), phone: true },
      ] },
      { key: 'design', label: t('nav.groups.design', 'Design'), items: [
        { tab: 'designs', icon: Palette, label: t('nav.manageDesigns') },
      ] },
      
      { key: 'stock', label: t('nav.groups.stock', 'Stock'), items: [
        { tab: 'inventory', icon: Package, label: t('nav.inventory'), phone: true },
      ] },
      
      { key: 'people', label: t('nav.groups.people', 'Team'), items: [
        { tab: 'staff', icon: Users, label: t('nav.staffManagement') },
      ] },
      { key: 'business', label: t('nav.groups.business', 'Finance'), items: [
        { tab: 'finance', icon: Wallet, label: t('nav.finance', 'Profit & Costs') },
        { tab: 'invoices', icon: Receipt, label: t('nav.invoices') },
        { tab: 'analytics', icon: BarChart2, label: t('nav.analytics') },
      ] },
    ] : role === 'Master' ? [
      { key: 'master', items: [
        { tab: 'work', icon: ClipboardList, label: t('nav.myWork', 'My work'), phone: true },
        { tab: 'check', icon: ShieldCheck, label: t('nav.toCheck', 'To check'), phone: true },
        { tab: 'done', icon: CheckCircle2, label: t('nav.doneWork', 'Done'), phone: true },
        { tab: 'designs', icon: Palette, label: t('nav.manageDesigns') },
        { tab: 'staff', icon: Clock, label: t('nav.myAttendance') },
      ] },
    ] : role === 'Designer' ? [
      { key: 'designer', items: [
        { tab: 'designs', icon: Palette, label: t('nav.designStudio'), phone: true },
      ] },
    ] : [
      { key: 'production', items: [
        { tab: 'work', icon: ClipboardList, label: t('nav.myWork', 'My work'), phone: true },
        { tab: 'done', icon: CheckCircle2, label: t('nav.doneWork', 'Done'), phone: true },
        { tab: 'staff', icon: Clock, label: t('nav.myAttendance') },
      ] },
    ];

  const roomy = !role || role === 'Owner' || role === 'Master';
  return [...sections, { key: 'session', divider: true, label: t('nav.groups.account', 'Account'), items: [
    { tab: 'account', icon: User, label: t('nav.account'), phone: !roomy },
    { tab: 'settings', icon: Settings, label: t('nav.settings') },
  ] }];
};

/* Drop what this user cannot reach, then drop any group left with nothing
   under it -- otherwise the sidebar grows headings over empty space. */
const visibleNav = (user, t) => navSectionsFor(user, t)
  .map((section) => ({ ...section, items: section.items.filter((i) => canSeeTab(user, i.tab)) }))
  .filter((section) => section.items.length);


/* First-time spotlight on a control: a breathing ring around the child and a
   bobbing callout above it, arrow pointing down at it. Only visual: the child
   is untouched and stays clickable, and nothing opens on its own. */
function GuidedHighlight({ show, text, children }) {
  if (!show) return children;
  return (
    <span className="gh">
      <span className="gh-callout" role="note">{text}</span>
      <span className="gh-ring">{children}</span>
    </span>
  );
}

function NavItem({ icon: Icon, label, active, onClick, collapsed, hint }) {
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

function PortalMenu({ sections, activeTab, onPick, collapsed = false, hints = {} }) {
  return sections.map((section) => (
    <React.Fragment key={section.key}>
      {section.divider && <div className="portal-menu-divider" />}
      {section.label && <div className="portal-menu-group">{section.label}</div>}
      {section.items.map(({ tab, icon, label }) => (
        <NavItem key={tab} icon={icon} label={label} active={activeTab === tab}
                 collapsed={collapsed} onClick={() => onPick(tab)} hint={hints[tab]} />
      ))}
    </React.Fragment>
  ));
}


function App() {
  
  const [view, setView] = useState(
    () => new URLSearchParams(window.location.search).get('reset') ? 'reset' : 'login');
  const [requestedTab, setDashboardTab] = useState('overview'); 
  const [navCollapsed, setNavCollapsed] = useState(() => {
    try { return localStorage.getItem('nav_collapsed') === '1'; } catch { return false; }
  });
  const toggleNav = () => setNavCollapsed((c) => {
    try { localStorage.setItem('nav_collapsed', c ? '0' : '1'); } catch { /* per-device convenience only */ }
    return !c;
  });
  const [currentUser, setCurrentUser] = useState(null);
 
  useEffect(() => { applyTenantTheme(currentUser); }, [currentUser]);
  const { t, language } = useLanguage();
  const currentUserName = currentUser?.first_name || currentUser?.name || currentUser?.email?.split('@')[0] || 'User';

  
  const navSections = visibleNav(currentUser, t);

  const navTabs = navSections.flatMap((s) => s.items.map((i) => i.tab));
  if (canSeeTab(currentUser, 'alterations')) navTabs.push('alterations');
  const dashboardTab = (!navTabs.length || navTabs.includes(requestedTab)) ? requestedTab : navTabs[0];

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
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
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);

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
  const [signupBusy, setSignupBusy] = useState(false);

  const [signupError, setSignupError] = useState(null);
  const [justRegistered, setJustRegistered] = useState(false);
  const [boutiqueName, setBoutiqueName] = useState('');
  const [boutiqueAddress, setBoutiqueAddress] = useState('');
  
  const passwordMismatch = !!signupForm.confirm_password && signupForm.confirm_password !== signupForm.password;
  const signupReady = !!(boutiqueName.trim() && boutiqueAddress.trim()
    && signupForm.first_name.trim() && signupForm.last_name.trim()
    && signupForm.email_address.trim() && signupForm.mobile_number
    && signupForm.password.length >= 8 && signupForm.confirm_password === signupForm.password
    && signupForm.terms);

  const [currentStep, setCurrentStep] = useState(1);
  
  const [maxStepReached, setMaxStepReached] = useState(1);
  const reachStep = useCallback((n) => {
    setCurrentStep(n);
    setMaxStepReached((m) => Math.max(m, n));
  }, []);
  
  const [addingGarmentKey, setAddingGarmentKey] = useState(null);
  const [activeGarmentKey, setActiveGarmentKey] = useState(null);

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
  const [alterationForm, setAlterationForm] = useState(EMPTY_ALTERATION);
  
  const [garmentTemplates, setGarmentTemplates] = useState([]);
  const [garmentJobs, setGarmentJobs] = useState([]);
  const [activePairingGarment, setActivePairingGarment] = useState(null);
  const [draftId, setDraftId] = useState(null);
  const [draftVersion, setDraftVersion] = useState(null);
  const [draftSaveState, setDraftSaveState] = useState('idle');
  const [resumableDrafts, setResumableDrafts] = useState([]);
  const [discardingDraftId, setDiscardingDraftId] = useState(null);
  const [garmentErrors, setGarmentErrors] = useState({});
  const [garmentTemplatesError, setGarmentTemplatesError] = useState(null);
  const [designLibraryToken, setDesignLibraryToken] = useState(0);
  const [designsView, setDesignsView] = useState('dashboard'); 
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
  const [measureVoiceNote, setMeasureVoiceNote] = useState(null);

  const [quotePrices, setQuotePrices] = useState({ packaging: 500, discount: 0 });
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);

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
    loadGarmentTemplates();
  }, [currentUser, loadGarmentTemplates]);

  const addGarment = async (key, skipPairingPrompt = false, allowAnother = false, pairedWith = null) => {
    const taken = garmentJobs.some(job => job.key === key);
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

  /** How much of a chosen material this dress needs, keyed by template field. */

  /** Where one material comes from: boutique stock, or the customer's own. */

  /** What the customer brought for one material -- its name and its unit. */

  /** A material line nobody has spoken for yet comes from stock. The
   *  per-line source is set on the line itself. */
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
  const validateGarments = ({ partial = false, sections = null } = {}) => {
    const errors = {};
    const quantityErrors = {};
    garmentJobs.forEach(job => {
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
      design_request: designRequest,
      garments: garmentJobs.map(job => {
        const values = withDate(job.values || {});
        const design = { ...(job.design || {}) };
        delete design.request;
        const wantsDesigner = serviceType === 'design' && designRequest.designer;
        return {
          key: job.key,
          paired_with: job.pairedWith || null,
          template: job.template?.id,
          template_key: job.template?.key || job.key,
          spec: splitSpec(job.template, values).spec,
          measurements: splitSpec(job.template, values).measurements,
          values,
          quantities: job.quantities || {},
          pricing: job.pricing || {},
          design: wantsDesigner
            ? { ...design, request: { designer: designRequest.designer, brief: designRequest.brief || '' } }
            : design,
          fabrics: job.fabrics || {},
          fabric_qty: job.fabric_qty || {},
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
      // The advance decides the payment status on the server; `option` is kept
      // for older readers of the draft.
      payment: { option: total > 0 && advance >= total ? 'full' : 'partial', advance },
      special_instructions: specialInstructions,
      instructions_voice_note: measureVoiceNote?.url || '',
      instructions_voice_note_by: measureVoiceNote?.by || '',
      instructions_voice_note_at: measureVoiceNote?.at || null,
    };
  };

  /** Put a saved draft back on screen, exactly where it was left. */
  const hydrateWizard = async (draft) => {
    const payload = draft.payload || {};
    setDraftId(draft.id);
    setDraftVersion(draft.version);
    setCustomerId(draft.customer || null);

    const { garments = [], design = {}, prices, payment = {},
            service, ready_by, design_request, ...customer } = payload;
    
    ['fabric', 'staff', 'delivery'].forEach((key) => { delete customer[key]; });
    setCustomerForm(prev => ({ ...prev, ...customer }));
    setCustomerName(`${customer.first_name || ''} ${customer.last_name || ''}`.trim());
    const kind = service === 'design' ? 'design' : 'stitch';
    setServiceType(kind);
    
    setReadyBy(ready_by || garments.find(g => g.values?.delivery_date)?.values.delivery_date || plusDaysIso(15));
    setDesignRequest(design_request || { designer: '', brief: '' });

    const rebuilt = [];
    for (const garment of garments) {
      try {
        const template = await api.getGarmentTemplate(garment.template_key);
        rebuilt.push({
          key: garment.key || garment.template_key,
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
                                 discount: prices.discount ?? 0 });
    if (payment.advance !== undefined) setAdvancePaymentAmount(payment.advance);
    setSpecialInstructions(payload.special_instructions || '');
    setMeasureVoiceNote(payload.instructions_voice_note
      ? { url: payload.instructions_voice_note, by: payload.instructions_voice_note_by || '', at: payload.instructions_voice_note_at || null }
      : null);
    setWizardError(null);
    setDraftSaveState('idle');
    setGarmentErrors({});
    
    let step = Math.min(draft.current_step || 1, WIZARD_STEPS[kind].length);
    
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
  const persistDraft = async ({ step } = {}) => {
    const payload = serialiseWizard();
    const current_step = step || currentStep;
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
  
  const [alterationOrder, setAlterationOrder] = useState(null);
  
  const [ordersAlterationOrder, setOrdersAlterationOrder] = useState(null);
  
  const [takingInOutside, setTakingInOutside] = useState(false);
  
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
  const [approvingDesignId, setApprovingDesignId] = useState(null);
  const [assigningStageKey, setAssigningStageKey] = useState(null);

  // Backend fetched collections
  const [dashboardData, setDashboardData] = useState(null);
  const [tailors, setTailors] = useState([]);
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
  const [customersList, setCustomersList] = useState([]);
  const [ordersList, setOrdersList] = useState([]);
  const [queuedMessages, setQueuedMessages] = useState([]);
  const [confirmedOrder, setConfirmedOrder] = useState(null);
  const [sendingOrder, setSendingOrder] = useState(null);
  const [sendForm, setSendForm] = useState({ master: '', tailor: '' });
  const [sendError, setSendError] = useState('');
  const [sendBusy, setSendBusy] = useState(false);

  // Existing Customer Search Modal
  const [allCustomers, setAllCustomers] = useState([]);

  // Search & Filters for dashboard
  const [searchQuery, setSearchQuery] = useState('');
  const [customerTypeFilter, setCustomerTypeFilter] = useState('All');
  const [customerPageAt, setCustomerPageAt] = useState({ key: '', page: 1 });
  const [customerPageSize, setCustomerPageSize] = useState(CUSTOMER_PAGE_SIZES[0]);
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
      const query = ordersSearch.toLowerCase();
      const matchesId = order.order_id.toLowerCase().includes(query)
        || orderRef(order).toLowerCase().includes(query);
      const matchesClient = (order.customer_name || '').toLowerCase().includes(query);
      return matchesId || matchesClient;
    }
    return true;
  };
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [invoiceFilter, setInvoiceFilter] = useState('All');
  const [loading, setLoading] = useState(true);
  const [whatsappStatus, setWhatsappStatus] = useState({ connected: false, status: 'disconnected', qrCode: null });
  const [boutiqueSettings, setBoutiqueSettings] = useState(null);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [logoFile, setLogoFile] = useState(null);
  
  const [activeReviewStage, setActiveReviewStage] = useState(null);
  const [activeReviewOrder, setActiveReviewOrder] = useState(null);
  const [stageReviewComments, setStageReviewComments] = useState('');
  
  const [stageReviewMicKick, setStageReviewMicKick] = useState(0);
  
  const [stageReviewImages, setStageReviewImages] = useState([]);
  
  const [stageReviewRecording, setStageReviewRecording] = useState(false);
  const [selectedStageObj, setSelectedStageObj] = useState(null);
  const [selectedPerformerId, setSelectedPerformerId] = useState('');
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

  const checkAuthSession = async () => {
    try {
      const user = await api.getMe();
      if (user) {
        setCurrentUser(user);
        setView('dashboard');
        if (user.role === 'Designer') {
          openDesignRequests();
          return;
        }
        if (isProductionStaff(user.role)) {
          setDashboardTab('work');
        } else {
          setDashboardTab('overview');
        }
        await fetchDashboardAndConfig(user);
      }
    } catch (e) {
      console.log("No saved session");
    } finally {
      setLoading(false);
    }
  };

  // Model display parked — see task 16
  // const getDrapedPreviewImage = (fabric, designUrl) => {
  // const color = fabric?.color?.toLowerCase() || '';
  // if (color.includes('rose') || color.includes('pink')) {
  // return 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=600';
  // }
  // if (color.includes('gold') || color.includes('yellow')) {
  // return 'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?w=600';
  // }
  // if (color.includes('black') || color.includes('charcoal')) {
  // return 'https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=600';
  // }
  // if (color.includes('blue')) {
  // return 'https://images.unsplash.com/photo-1539008835657-9e8e62c8425b?w=600';
  // }
  // if (color.includes('green') || color.includes('olive')) {
  // return 'https://images.unsplash.com/photo-1605721911519-3dfeb3be25e7?w=600';
  // }
  // return 'https://images.unsplash.com/photo-1518049368264-7a13d7825d19?w=600';
  // };

  // Each collection paints as soon as its own request lands rather than waiting on
  // the slowest one, and a failed request is reported instead of leaving the panel
  // looking like an empty boutique.
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

    // Concurrently, which is what the note above always claimed: every one of
    // these reads a different endpoint and none of them looks at state another
    // one writes, so awaiting them one after another only added up their
    // latencies. Against a database a region away that was nine round trips in
    // series before the first screen was usable. Each still applies its own
    // result the moment it lands and still reports its own failure by name --
    // load() swallows per-collection errors, so one slow or broken endpoint
    // cannot hold up or fail the rest.
    //
    // Which requests are made is UNCHANGED: the same hasModule gates, the same
    // Owner-only check on queued messages. A role that could not fetch a
    // collection before still does not fetch it, and the server still decides.
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

      load('customers', api.getCustomers, (data) => {
        setCustomersList(data);
        setAllCustomers(data);
      }),

      load('orders', api.getOrders, setOrdersList),

      hasModule(user, 'tailors') && load('tailors', api.getTailors, setTailors),
      hasModule(user, 'scheduling') && load('appointments', () => api.getAppointments({ upcoming: 'true' }), setAppointments),
      hasModule(user, 'inventory') && load('fabrics', () => api.getInventoryItems({ picker: 'true' }), setFabrics),
      hasModule(user, 'design_studio') && load('designs', api.getAllBoutiqueDesigns, setAllDesigns),

      load('settings', api.getBoutiqueSettings, (data) => {
        setBoutiqueSettings(data);
        setBoutiqueTimeZone(data?.timezone);
      }),

      hasModule(user, 'notifications') && load('notifications', () => fetchNotifications(user), () => {}),

      (!user?.role || user.role === 'Owner')
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
    if (view === 'login' || view === 'signup' || view === 'forgot' || view === 'reset') return;
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

  const blankAppointmentForm = {
    customer: '', appointment_type: 'TRIAL', custom_type: '', scheduled_time: '',
    assigned_staff: '', notes: '', status: 'SCHEDULED',
    // Booking for somebody not in the book yet: the three things the counter
    // has at the door. Sent as `new_customer`; the server writes the customer.
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

  const workshopMasters = () => tailors.filter((tl) => tl.role === 'Master');
  const workshopCrew = () => tailors.filter((tl) => tl.role !== 'Master');
  const defaultWorkshopPicks = (order) => {
    const open = {};
    ordersList.forEach((o) => { if (o.tailor && !ORDER_CLOSED.includes(o.order_status)) open[o.tailor] = (open[o.tailor] || 0) + 1; });
    const freest = [...workshopCrew()].sort((a, b) =>
      ((b.status === 'Available') - (a.status === 'Available')) || ((open[a.id] || 0) - (open[b.id] || 0)))[0];
    return { master: order.master || workshopMasters()[0]?.id || '', tailor: order.tailor || freest?.id || '' };
  };
  const sendToWorkshop = async (order, picks, inModal) => {
    if (sendBusy) return;
    setSendBusy(true); setSendError('');
    try {
      const updated = await api.sendToWorkshop(order.id, picks);
      setSendingOrder(null);
      setConfirmedOrder((prev) => (prev && prev.id === updated.id ? { ...prev, ...updated } : prev));
      fetchDashboardAndConfig();
      if (!inModal) {
        const row = (updated.stages || []).find((st) => st.stage_key === updated.started_stage);
        const stage = row?.stage_name || '';
        const who = row?.assigned_to_name || updated.master_name || updated.tailor_name || 'the workshop';
        alert(stage
          ? t('ordersPage.sentToWorkshop', 'Sent to the workshop — {tailor} starts with {stage}', { tailor: who, stage })
          : t('ordersPage.sentToWorkshopPlain', 'Sent to the workshop'));
      }
    } catch (err) {
      if (inModal) setSendError(err.message); else alert(err.message);
    } finally {
      setSendBusy(false);
    }
  };
  // One Master and one tailor: nothing to choose, so send in one tap.
  const openSendToWorkshop = (order) => {
    const picks = defaultWorkshopPicks(order);
    if (workshopMasters().length === 1 && workshopCrew().length === 1) { sendToWorkshop(order, picks, false); return; }
    setSendForm(picks); setSendError(''); setSendingOrder(order);
  };

  const handleAssignWorkflow = async (orderId, updates) => {
    if (assigningWorkflowOrderId) return;
    setAssigningWorkflowOrderId(orderId);
    try {
      await api.updateOrder(orderId, updates);
      fetchDashboardAndConfig();
    } catch (err) {
      alert("Failed to update staff assignment: " + err.message);
    } finally {
      setAssigningWorkflowOrderId(null);
    }
  };

  const handleSaveDesign = async (e) => {
    e.preventDefault();
    if (designSaving) return;
    const imageUrl = (designForm.image_url || '').trim();
    const bad = amountError(designForm.price, { label: 'Catalog price' })
      // Legacy catalogue rows hold a bare file name, so only a foreign scheme or whitespace is refused.
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
        // Only a complete position is sent; a half-chosen one would be refused.
        catalogue: designForm.catalogue_path || undefined,
      };
      delete payload.catalogue_path;
      if (designImageFile) {
        // An uploaded photo wins over a pasted link.
        payload.image_url = (await api.uploadBoutiqueDesignImage(designImageFile)).image_url;
      }
      if (!payload.image_url) {
        // Curated apparel image
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

  // Auth Action Handlers
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
      const res = await api.login(loginEmail, loginPassword);
      setJustRegistered(false);
      setCurrentUser(res.user);
      setView('dashboard');
      if (res.user.role === 'Designer') {
        openDesignRequests();
        return;
      }
      if (isProductionStaff(res.user.role)) {
        setDashboardTab('work');
      } else {
        setDashboardTab('overview');
      }
      fetchDashboardAndConfig(res.user);
    } catch (err) {
      setAuthError(err.message || 'Invalid credentials.');
    } finally {
      setAuthBusy(false);
    }
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
      const res = await api.signup({
        first_name: signupForm.first_name,
        last_name: signupForm.last_name,
        email_address: signupForm.email_address,
        mobile_number: signupForm.mobile_number,
        password: signupForm.password,
        business_name: boutiqueName,
        business_address: boutiqueAddress
      });
      setJustRegistered(true);
      if (!res.token) { setView('login'); return; }
      setCurrentUser(res.user);
      setSignupStep(2);
      setTimeout(() => {
        setView('dashboard');
        fetchDashboardAndConfig(res.user);
      }, 1500);
    } catch (err) {
      setSignupError(err.message || 'Registration failed.');
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
      setView('login');
      setShowLogoutConfirm(false);
    } finally {
      setLogoutBusy(false);
    }
  };

  // Start Order Creation Flows
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
  const clearPickedCustomer = (mobile) => {
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
  const startService = (kind, cust = null) => {
    setServiceType(kind);
    setCustomerId(null);
    setCustomerForm(DEFAULT_CUSTOMER_DATA);
    setCustomerName('');
    setDesignNotes('');
    setDesignFiles([]);
    setSelectedDesignTemplates([]);
    setGarmentJobs([]);
    setGarmentErrors({});
    setQuotePrices({ packaging: 500, discount: 0 });
    setAdvancePaymentAmount(0);
    setSpecialInstructions('');
    setMeasureVoiceNote(null);
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
  /** "Take a new order": ask which service first. */
  const handleStartNewCustomer = () => setCustomerAddMode('choose');

  const [customerAddMode, setCustomerAddMode] = useState(null);
  // The Owner's edit / delete on the customer book. The server holds the same
  // rule: PATCH and DELETE on /customers/ are refused to every other role.
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
  const handleSelectExistingCustomer = (cust) => startService('stitch', cust);

  /** Customers whose number contains what has been typed so far. */
  const customerMatches = React.useMemo(() => {
    if (customerId) return [];
    const digits = (customerForm.mobile_number || '').replace(/\D/g, '');
    if (digits.length < 3) return [];
    return allCustomers
      .filter(c => (c.mobile_number || '').replace(/\D/g, '').includes(digits))
      .slice(0, 5);
  }, [allCustomers, customerForm.mobile_number, customerId]);
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

  const jumpToStep = useCallback((n) => {
    if (n === currentStep || n > maxStepReached) return;
    reachStep(n);
  }, [currentStep, maxStepReached, reachStep]);
  const wizardSteps = WIZARD_STEPS[serviceType] || WIZARD_STEPS.stitch;
  useEffect(() => {
    document.querySelector('.wizard-header-container [aria-current="step"]')
      ?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [currentStep]);
  const wizardStepKey = wizardSteps[currentStep - 1]?.key;
  /** Whether any garment on the order has a measurement to take right now. */
  const needsMeasurements = () => garmentJobs.some(job =>
    ((job.template?.sections || []).find(sec => sec.key === 'measurements')?.fields || [])
      .some(f => f.field_type !== 'file' && isVisible(f, job.values || {})));
  const handleBack = () => {
    if (currentStep <= 1) { setView('order-selector'); return; }
    const previous = wizardSteps[currentStep - 2];
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
      setView('dashboard');
      openAlteration(created.id);
    } catch (err) {
      setWizardError(err.message || 'Could not create the alteration.');
    }
  };

  const performNext = async () => {
    try {
      if (wizardStepKey === 'who') {
        const mobileBad = mobileError(customerForm.mobile_number);
        if (mobileBad) { alert(mobileBad); return; }
        if (serviceType === 'alter') {
          if (!customerId) { alert('Pick the customer from the list: alterations are for garments we made.'); return; }
        } else {
          // A customer picked from the book keeps the name the book holds;
          // only a name typed here is held to the letters-only rule.
          const nameBad = customerId ? '' : nameError(customerForm.first_name, { label: 'Customer name' });
          if (nameBad || customerForm.first_name.trim().length < 2) {
            alert(nameBad || 'Enter the customer\u2019s name (at least 2 letters).');
            return;
          }
        }
        const emailBad = emailError(customerForm.email_address);
        if (emailBad) { alert(`${emailBad} Or leave it blank.`); return; }
        if (serviceType === 'alter') { reachStep(currentStep + 1); return; }
        await persistDraft({ step: currentStep + 1 });
        reachStep(currentStep + 1);
      } else if (wizardStepKey === 'type') {
        if (garmentJobs.length === 0) { alert('Add at least one garment to this order.'); return; }
        if (!validateGarments({ sections: ['basic', 'style'] })) {
          alert('Say what each garment needs \u2014 see the highlighted fields.');
          return;
        }
        await persistDraft({ step: currentStep + 1 });
        reachStep(currentStep + 1);
      } else if (wizardStepKey === 'design') {
        if (serviceType === 'design' && !designRequest.designer) { alert('Pick the designer.'); return; }
        await persistDraft({ step: currentStep + 1 });
        reachStep(currentStep + 1);
      } else if (wizardStepKey === 'fabric') {
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
      } else if (wizardStepKey === 'personal') {
        // Everything here is optional; a typed value is still checked so a
        // bad number does not reach the review unremarked.
        if (!validateGarments({ sections: ['basic', 'style'] })) {
          alert('Something on this screen is not valid — see the highlighted fields.');
          return;
        }
        await persistDraft({ step: currentStep + 1 });
        reachStep(currentStep + 1);
      } else if (wizardStepKey === 'review') {
        await persistDraft({ step: currentStep + 1 });
        reachStep(currentStep + 1);
      } else if (wizardStepKey === 'money') {
        if (garmentJobs.length === 0) { alert('Add at least one garment to this order.'); reachStep(wizardSteps.findIndex(st => st.key === 'type') + 1); return; }
        if (!readyBy) { alert('Pick the ready-by date.'); return; }
        if (isPastDate(readyBy)) { alert('The ready-by date cannot be in the past.'); return; }
        if (garmentJobs.some(j => j.values?.trial_date && j.values.trial_date > readyBy)) {
          alert('The trial date must be on or before the ready-by date.');
          return;
        }
        // The boxes only take digits, so the two cross-field rules are all
        // that is left: a discount within the goods, an advance within the total.
        const goods = getSubtotal() + parseFloat(quotePrices.discount || 0);
        if (parseFloat(quotePrices.discount || 0) > goods) {
          setQuotePrices({ ...quotePrices, discount: String(goods) });
          alert(`The discount cannot be more than the order subtotal, so it was set to ${inr(goods)}.`);
          return;
        }
        const total = getTotalPrice();
        if (Number(advancePaymentAmount || 0) > total) {
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
        // One designer on the team is not a choice to make.
        if (list.length === 1) setDesignRequest(prev => (prev.designer ? prev : { ...prev, designer: list[0].id }));
      })
      .catch(() => { if (!cancelled) setDesigners([]); });
    return () => { cancelled = true; };
  }, [view, serviceType]);

  const handleNext = () => runOnce(performNext);
  const handleSaveDraft = () => runOnce(performSaveDraft);

  useAutosave({
    getSnapshot: () => JSON.stringify(serialiseWizard()),
    save: () => persistDraft(),
    enabled: view === 'wizard' && serviceType !== 'alter' && draftSaveState !== 'conflict',
    paused: ctaBusy,
  });

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
  const jobSubtotal = (job) =>
    PRICING_FIELDS.reduce((sum, [key]) => sum + parseFloat(job.pricing?.[key] || 0), 0)
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

  const getTaxes = () => {
    return getSubtotal() * 0.05;
  };

  const getTotalPrice = () => {
    return getSubtotal() + getTaxes();
  };

  const getPasswordStrength = () => {
    const len = signupForm.password.length;
    if (len === 0) return '';
    if (len < 8) return 'weak';
    if (len < 12) return 'medium';
    return 'strong';
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


  const [stockPrompt, setStockPrompt] = useState(null);      
  const [reviewView, setReviewView] = useState(null);       
  const [restockTrip, setRestockTrip] = useState(null);      
  useEffect(() => {
    if (!restockTrip || restockTrip.draftId) return;
    
    (async () => {
      try {
        const id = await persistDraft({ step: currentStep });
        setRestockTrip({ ...restockTrip, draftId: id });
        setView('dashboard');
        setDashboardTab('inventory');
      } catch (err) {
        setRestockTrip(null);
        alert(`Could not save the order before leaving: ${err.message}`);
      }
    })();
  }, [restockTrip]); 
  const finishRestockTrip = async () => {
    const trip = restockTrip;
    setRestockTrip(null);
    if (!trip?.draftId) return;
    try {
      const [rolls, draft] = await Promise.all([
        api.getInventoryItems({ picker: 'true' }), api.getOrderDraft(trip.draftId)]);
      setFabrics(rolls || []);
      await hydrateWizard(draft);
    } catch (err) {
      alert(`Could not return to the order: ${err.message}. Open it from your drafts.`);
    }
  };

  const fabricQuantities = React.useMemo(
    () => Object.fromEntries(garmentJobs.map(job => [job.key, job.fabric_qty || {}])),
    [garmentJobs]);
  const handleFabricQuantity = (garmentKey, slot, fabricId, quantity) => {
    setGarmentJobs(prev => prev.map(job => job.key === garmentKey
      ? { ...job, fabric_qty: { ...(job.fabric_qty || {}), [`${slot}:${fabricId}`]: quantity } }
      : job));
  };

  const colourFilteredFabrics = React.useMemo(() => {
    const q = fabricColorQuery.trim().toLowerCase();
    if (!q) return fabrics;
    const chosen = new Set(
      Object.values(fabricSelection).flatMap(bySlot => Object.values(bySlot).flat()));
    return fabrics.filter(f =>
      fabricMatchesColour(f, q) || chosen.has(String(f.id)));
  }, [fabrics, fabricColorQuery, fabricSelection]);

  
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
    const canVerify = !currentUser?.role || currentUser.role === 'Owner' || SUPERVISOR_ROLES.includes(currentUser.role);
    if (stage.status === 'PENDING_VERIFICATION' && !stage.verification_seen_at && canVerify) {
      api.markStageSeen(order.id, stage.stage_key, stage.garment_job || null)
        .then((seen) => setSelectedStageObj((prev) => (prev && prev.id === seen.id ? { ...prev, ...seen } : prev)))
        .catch(() => {});
    }
  };

  
  const openDirectoryCustomer = async (summaryRow) => {
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
    const stageConf = (boutiqueSettings?.workflow_config || []).find(s => s.key === stageKey);
    const allowed = stageConf?.roles || [];
    if (allowed.length === 0) return tailors;
    return tailors.filter(t => allowed.includes(t.role));
  };

  const stitchingStaff = () => eligibleStaffForStage('stitching_in_progress');

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
      await api.assignStage(orderId, stageKey, tailorId || null, garmentJob);
      await fetchDashboardAndConfig();
    } catch (err) {
      alert(err.message || 'Could not assign this stage.');
    } finally {
      setAssigningStageKey(null);
    }
  };

  
  const directoryCustomers = React.useMemo(() => {
    const term = searchQuery.toLowerCase();
    return customersList.filter(cust => {
      const matchesSearch =
        ((cust.first_name || '') + ' ' + (cust.last_name || '')).toLowerCase().includes(term) ||
        (cust.mobile_number || '').includes(term) ||
        (cust.email_address || '').toLowerCase().includes(term);
      const matchesType = customerTypeFilter === 'All' || customerTier(cust) === customerTypeFilter;
      return matchesSearch && matchesType;
    });
  }, [customersList, searchQuery, customerTypeFilter]);
  // One page of the book at a time. The page belongs to the search, tier and
  // page size it was picked under: change any of them and it is page 1 again.
  // A list that shrank under the page shows its last page.
  const customerPageKey = `${searchQuery}|${customerTypeFilter}|${customerPageSize}`;
  const customerPage = customerPageAt.key === customerPageKey ? customerPageAt.page : 1;
  const customerPageCount = Math.max(1, Math.ceil(directoryCustomers.length / customerPageSize));
  const customerPageNow = Math.min(customerPage, customerPageCount);
  const customerPageFrom = (customerPageNow - 1) * customerPageSize;
  const pagedCustomers = directoryCustomers.slice(customerPageFrom, customerPageFrom + customerPageSize);
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

  if (loading && !dashboardData && view === 'login') {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: 'var(--selected-bg)', color: 'var(--selected-fg)', fontSize: '18px', fontFamily: 'var(--font-sans, sans-serif)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ border: '4px solid rgba(255,255,255,0.1)', borderTop: '4px solid #d4af37', borderRadius: '50%', width: '40px', height: '40px', animation: 'spin 1s linear infinite', margin: '0 auto 16px auto' }}></div>
          <span>Loading Atelier CRM...</span>
          <style>{`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      </div>
    );
  }


  // Driven by real data, so it can never disagree with the boutique's actual
  // state -- and it teaches the workflow in the order the work happens.
  // First-time pointers. Counted off the lists already loaded for the
  // dashboard, so nothing extra is fetched; each stops on its own at ten.
  const canAddCustomer = !currentUser?.role || currentUser.role === 'Owner';
  const guideCustomers = !loading && canAddCustomer && customersList.length < 10;
  const guideOrders = !loading && ordersList.length < 10;
  // Sidebar spotlights: Customers while under ten customers, Orders while
  // under ten orders. Independent of each other; each hides on its own tab,
  // where the page's button carries the guidance instead.
  const sidebarHint = {
    ...(guideCustomers && dashboardTab !== 'customers' ? { customers: t('onboard.sidebarCustomers', 'Add new customers') } : {}),
    ...(guideOrders && dashboardTab !== 'orders' ? { orders: ordersList.length ? t('onboard.sidebarOrders', 'Create orders here') : t('onboard.sidebarFirstOrder', 'Create your first order') } : {}),
  };

  const onboardingSteps = [
    { key: 'boutique', label: 'Create your boutique', done: true },
    { key: 'customer', label: 'Add your first customer', done: customersList.length > 0, go: () => setView('order-selector') },
    { key: 'order', label: 'Take your first order', done: ordersList.length > 0, go: () => setView('order-selector') },
    { key: 'staff', label: 'Add your tailors, masters and designers', done: tailors.length > 0, tab: 'staff', go: () => setDashboardTab('staff') },
    { key: 'fabrics', label: 'Put your first fabric on the shelf', done: fabrics.length > 0, tab: 'inventory', go: () => setDashboardTab('inventory') },
    { key: 'production', label: 'Move an order through the workroom', done: ordersList.some(o => o.order_status && o.order_status !== 'Received'), tab: 'orders', go: () => setDashboardTab('orders') },

  ].filter((step) => !step.tab || canSeeTab(currentUser, step.tab));
  const showOnboarding = !loading && !onboardingDismissed && onboardingSteps.some(step => !step.done);
  return (
    <div className="app-container">
      {/* 2. SIGN IN SCREEN (Image 2) */}

      {view === 'login' && (
        <div className="auth-page" style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--shell-bg)', padding: '88px 16px 40px' }}>
          
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

          <img className="portal-wordmark portal-wordmark--auth" src="/scaleezy-wordmark.webp" alt="Scaleezy" />
          <div className="auth-logo-sub" style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '32px' }}>YOUR VISION. OUR CRAFT.</div>

          <div className="auth-card" style={{ maxWidth: '420px', width: '100%', background: 'var(--surface-color)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: 'clamp(20px, 6vw, 40px)', boxShadow: '0 8px 30px rgba(0,0,0,0.02)' }}>
            <h2 className="auth-title" style={{ fontSize: '24px', color: 'var(--text-primary)', fontWeight: 600, margin: '0 0 8px 0' }}>{justRegistered ? 'Your boutique is ready 🎉' : 'Welcome back 👋'}</h2>
            <p className="auth-subtitle" style={{ fontSize: '13.5px', color: 'var(--text-secondary)', margin: '0 0 32px 0' }}>{justRegistered ? 'Sign in with the email and password you just created.' : 'Login to continue your custom creation journey.'}</p>
            
            <form onSubmit={handleLoginSubmit} className="auth-form" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label className="form-label" style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Email</label>
                <div className="input-wrapper" style={{ position: 'relative' }}>
                  <Mail size={16} className="input-icon-left" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input 
                    type="text" 
                    placeholder="Enter your email"
                    value={loginEmail}
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

            <div className="auth-card-footer" style={{ borderTop: '1px solid var(--border-color)', marginTop: '32px', paddingTop: '20px', textAlign: 'center', fontSize: '13.5px', color: 'var(--text-secondary)' }}>
              Don't have a boutique account?{' '}
              <a href="#" style={{ color: 'var(--accent-text, #b07c40)', fontWeight: 600, textDecoration: 'none' }} onClick={() => { setSignupStep(1); setView('signup'); }}>
                Signup
              </a>
            </div>
          </div>
        </div>
      )}



      {/* 3. SIGN UP SCREEN (Image 3) */}
      {/* Ask for a reset link. Reached from the login screen; leaves back to
          it. Nothing here reveals whether the address is one we know. */}
      {view === 'forgot' && (
        <div className="auth-page" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--shell-bg)', padding: '88px 16px 40px' }}>
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
        <div className="auth-page" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--shell-bg)', padding: '88px 16px 40px' }}>
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

      {view === 'signup' && (
        <div className="auth-page auth-page--signup" style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--shell-bg)' }}>
          
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

          <img className="portal-wordmark portal-wordmark--auth" src="/scaleezy-wordmark.webp" alt="Scaleezy" />
          <div className="auth-logo-sub" style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '16px' }}>YOUR VISION. OUR CRAFT.</div>

          {/* One card, no steps. It used to be a two-tab wizard (owner on
              tab 1, boutique on tab 2) with a step tracker above it; owners
              lost their place between the tabs. Everything is on one screen
              now, sized to fit a laptop viewport without scrolling. */}
          <div className="auth-card auth-card--signup">
            {signupStep === 1 && (
              <form onSubmit={handleSignupSubmit} className="auth-form" style={{ gap: '10px' }}>
                <div>
                  <h2 className="auth-title" style={{ fontSize: '24px' }}>Create your boutique account</h2>
                  <p className="auth-subtitle" style={{ marginTop: '4px', marginBottom: 0 }}>Fill in the boxes below. The button lights up when everything is filled.</p>
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
                  <div className="form-group">
                    <div className="signup-label-row">
                      <label className="form-label">Password</label>
                      <span className="password-strength-text">
                        {signupForm.password ? <>Strength: <span>{getPasswordStrength()}</span></> : '8 or more characters'}
                      </span>
                    </div>
                    <input
                      type="password"
                      placeholder="At least 8 characters"
                      value={signupForm.password}
                      minLength={8}
                      onChange={(e) => setSignupForm({...signupForm, password: e.target.value})}
                      required
                      className="form-control"
                    />
                    {/* Always rendered, so typing the first character does
                        not push the row below it down. */}
                    <div className="password-strength-bar">
                      <div className={`password-strength-fill ${getPasswordStrength()}`}></div>
                    </div>
                  </div>
                  <div className="form-group">
                    <div className="signup-label-row">
                      <label className="form-label">Type the password again</label>
                      <span className="password-strength-text" style={passwordMismatch ? { color: '#ba1a1a' } : undefined}>
                        {passwordMismatch ? 'Not the same' : signupForm.confirm_password ? 'Matches' : 'Same as the first'}
                      </span>
                    </div>
                    <input
                      type="password"
                      placeholder="Same password once more"
                      value={signupForm.confirm_password}
                      onChange={(e) => setSignupForm({...signupForm, confirm_password: e.target.value})}
                      required
                      className="form-control"
                      style={passwordMismatch ? { borderColor: '#ba1a1a' } : undefined}
                    />
                    <div className="password-strength-bar">
                      <div className={`password-strength-fill ${signupForm.confirm_password ? (passwordMismatch ? 'weak' : 'strong') : ''}`}></div>
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
                    <input type="checkbox" checked={signupForm.terms} onChange={(e) => setSignupForm({...signupForm, terms: e.target.checked})} />
                    I agree to the Terms & Conditions and Privacy Policy
                  </label>
                  <button type="button" className="btn-secondary" style={{ justifyContent: 'center' }} onClick={() => setView('login')}>
                    Log in instead
                  </button>
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={!signupReady || signupBusy}
                    title={signupReady ? undefined : 'Fill every box above to continue'}
                    style={{ justifyContent: 'center', opacity: signupReady ? 1 : 0.5, cursor: signupReady ? 'pointer' : 'not-allowed' }}
                  >
                    {signupBusy ? 'Creating your boutique…' : 'Create Account'}
                  </button>
                </div>
              </form>
            )}

            {signupStep === 2 && (
              <div style={{ textAlign: 'center', padding: '32px' }}>
                <div className="success-circle" style={{ margin: '0 auto 20px' }}><Check size={36} /></div>
                <h2 className="auth-title">Registration Complete!</h2>
                <p style={{ color: 'var(--text-secondary)' }}>Welcome to Scaleezy. Redirecting you to the portal workspace...</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4. BOUTIQUE PORTAL MAIN WORKSPACE (Image 4) */}
      {view === 'dashboard' && currentUser && (
        <div className={`portal-layout${navCollapsed ? ' nav-collapsed' : ''}`}>
          <MobileHeader
            title={t(
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
              <button
                disabled={markingNotificationsRead}
                onClick={() => {
                  setShowNotificationsDrawer(true);
                  if (markingNotificationsRead) return;
                  setMarkingNotificationsRead(true);
                  api.markNotificationsAsRead(currentUser.role || 'Owner', currentUser.email)
                    .then(() => fetchNotifications())
                    // Never let the bell take the app down: a refused or failed
                    // mark-read is not worth losing the session over.
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
                sections={navSections}
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
              <NavItem icon={LogOut} label={t('nav.logout')} collapsed={navCollapsed && !mobileNavOpen}
                       onClick={() => { setShowLogoutConfirm(true); setMobileNavOpen(false); }} />
            </nav>


          </aside>

          {/* Main Content Area */}
          <main className="portal-main" key={`${dashboardTab}:${sectionVisit}`}>
            {(dashboardTab === 'work' || dashboardTab === 'done' || dashboardTab === 'check') && (
              <>
                <PageHeader
                  title={dashboardTab === 'work' ? t('nav.myWork', 'My work') : dashboardTab === 'check' ? t('nav.toCheck', 'To check') : t('nav.doneWork', 'Done')}
                  subtitle={t('dashboard.hiUser', `Hi, ${currentUserName}`, { name: currentUserName })}
                />
                <Suspense fallback={<ScreenLoading />}>
                  <WorkPanel view={dashboardTab === 'work' ? 'open' : dashboardTab} orders={ordersList} currentUser={currentUser} workflowConfig={boutiqueSettings?.workflow_config || []} tailors={tailors} fabricTaxonomy={fabricTaxonomy} onChanged={fetchDashboardAndConfig} />
                </Suspense>
              </>
            )}

            {dashboardTab === 'overview' && (
              <>
                <PageHeader
                  title={justRegistered && dashboardTab === 'overview' && !ordersList.length
                    ? t('dashboard.welcomeNewUser', `Welcome ${currentUserName} to Scaleezy! 👋`, { name: currentUserName })
                    : t('dashboard.welcomeBackUser', `Welcome back, ${currentUserName}! 👋`, { name: currentUserName })}
                  subtitle={t('dashboard.subtitle')}
                  meta={<HeaderClock />}
                  aside={(
                    <>
                      <button
                        type="button"
                        className="btn-secondary at-btn-sm"
                        disabled={markingNotificationsRead}
                        title={t('common.inboxAlerts', 'Inbox Alerts')}
                        aria-label={t('common.inboxAlerts', 'Inbox Alerts')}
                        onClick={() => {
                          setShowNotificationsDrawer(true);
                          if (markingNotificationsRead) return;
                          setMarkingNotificationsRead(true);
                          api.markNotificationsAsRead(currentUser.role || 'Owner', currentUser.email)
                            .then(() => fetchNotifications())
                            .catch(() => {})
                            .finally(() => setMarkingNotificationsRead(false));
                        }}
                        style={{ position: 'relative', borderRadius: '999px' }}
                      >
                        <Bell size={16} />
                        {notifications.filter(n => !n.is_read).length > 0 && (
                          <span style={{ backgroundColor: 'var(--danger-color)', color: '#fff', borderRadius: '10px',
                                         padding: '1px 7px', fontSize: '10px', fontWeight: 700 }}>
                            {notifications.filter(n => !n.is_read).length}
                          </span>
                        )}
                      </button>
                      <div className="user-profile-widget">
                        <div className="user-avatar-circle">
                          <UserAvatar user={currentUser} />
                        </div>
                        <span>{t('dashboard.hiUser', `Hi, ${currentUserName}`, { name: currentUserName })}</span>
                      </div>
                    </>
                  )}
                  actions={(
                    <>
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={loading}
                        onClick={() => fetchDashboardAndConfig()}
                        style={{ padding: '10px 16px', fontSize: '13px' }}
                        title="Refresh Dashboard Data"
                      >
                        {!loading && <RotateCw size={15} />}
                        <span>{loading ? t('common.loading', 'Loading...') : t('common.refresh', 'Refresh')}</span>
                      </button>
                      <GuidedHighlight show={guideOrders} text={ordersList.length ? t('onboard.newOrder', 'Create an order') : t('onboard.firstOrder', 'Create your first order')}>
                        <button className="btn-primary btn-gold" style={{ padding: '10px 18px' }} onClick={() => setView('order-selector')}>
                          <Plus size={16} />
                          {t('dashboard.newOrder')}
                        </button>
                      </GuidedHighlight>
                    </>
                  )}
                />

                {showOnboarding && (
                  <section className="content-card" style={{ padding: '20px', marginBottom: '16px', border: '1px solid var(--border-color)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '12px' }}>
                      <div>
                        <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '20px', fontWeight: 500 }}>{t('dashboard.gettingStarted', 'Getting started')}</h2>
                        <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                          {t('dashboard.onboardingProgress', '{done} of {total} done — this is the order the work flows in.', { done: onboardingSteps.filter(step => step.done).length, total: onboardingSteps.length })}
                        </p>
                      </div>
                      <button
                        type="button" className="btn-secondary" style={{ fontSize: '11px', padding: '4px 10px' }}
                        onClick={() => {
                          setOnboardingDismissed(true);
                          try {
                            localStorage.setItem(`onboarding_dismissed_${localStorage.getItem('tenant_id') || ''}`, '1');
                          } catch { /* per-device convenience only */ }
                        }}
                      >
                        {t('dashboard.dismiss', 'Dismiss')}
                      </button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {onboardingSteps.map((step, i) => (
                        <button
                          key={step.key}
                          type="button"
                          disabled={step.done || !step.go}
                          onClick={step.go}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px',
                            background: 'transparent', border: 'none', borderRadius: '6px', textAlign: 'left',
                            cursor: step.done || !step.go ? 'default' : 'pointer', width: '100%',
                            color: step.done ? 'var(--text-muted)' : 'var(--text-primary)',
                          }}
                        >
                          <span style={{
                            width: '20px', height: '20px', borderRadius: '50%', flexShrink: 0,
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            border: step.done ? 'none' : '1.5px solid var(--border-color)',
                            background: step.done ? 'var(--success-color)' : 'transparent', color: '#fff', fontSize: '12px',
                          }}>
                            {step.done ? <Check size={12} /> : i + 1}
                          </span>
                          <span style={{ fontSize: '13px', textDecoration: step.done ? 'line-through' : 'none' }}>
                            {step.label}
                          </span>
                          {!step.done && step.go && <ArrowRight size={13} style={{ marginLeft: 'auto', opacity: 0.5 }} />}
                        </button>
                      ))}
                    </div>
                  </section>
                )}

                {/* The money reads first, then what needs acting on, then today,
                    then detail. All figures from /api/dashboard/ (dashboardData). */}
                {(() => {
                  const s = dashboardData?.stats || {};
                  const outstanding = Number(s.outstanding) || 0;
                  const overdue = Number(s.overdue) || 0;
                  return (
                    <section className="at-stat-grid" style={{ marginBottom: 'var(--space-5)' }}>
                      <StatCard icon={TrendingUp} tone="green" label={t('dashboard.revenueThisMonth', 'Revenue this month')}
                                value={inr(s.revenue_month)} sub={t('dashboard.allTime', '{amount} all time', { amount: inr(s.revenue_total) })}
                                onClick={() => { setInvoiceFilter('All'); setDashboardTab('invoices'); }} />
                      <StatCard icon={Wallet} tone="amber" label={t('dashboard.toCollect', 'To collect')} value={inr(outstanding)}
                                sub={outstanding > 0 ? t('dashboard.acrossActiveOrders', 'across active orders') : t('dashboard.allSettled', 'all settled')}
                                onClick={() => { setInvoiceFilter('Pending'); setDashboardTab('invoices'); }} />
                      <StatCard icon={ClipboardList} tone="violet" label={t('dashboard.activeOrders', 'Active orders')} value={s.active_orders ?? 0}
                                sub={`${t('dashboard.dueThisWeek', '{n} due this week', { n: s.due_soon ?? 0 })}${overdue ? ` · ${t('dashboard.overdueCount', '{n} overdue', { n: overdue })}` : ''}`}
                                onClick={() => setDashboardTab('workshop')} />
                      <StatCard icon={Users} tone="blue" label={t('dashboard.totalCustomers', 'Customers')} value={s.total_customers ?? 0}
                                sub={(() => { const c = tierCounts(customersList); return t('dashboard.tierSummary', '{platinum} Platinum · {gold} Gold · {silver} Silver', { platinum: c.Platinum, gold: c.Gold, silver: c.Silver }); })()}
                                onClick={() => setDashboardTab('customers')} />
                    </section>
                  );
                })()}

                {/* Production pipeline: one tile per stage orders are standing
                    on right now, in workroom order, plus the two piles either
                    side of it. */}
                {(() => {
                  const dist = {};
                  let fresh = 0;
                  ordersList.forEach((o) => {
                    const b = orderBucket(o);
                    if (b === 'new') fresh += 1;
                    if (b !== 'workshop') return;
                    const now = stageNow(o);
                    if (!now) return;
                    const k = now.current.stage_key;
                    dist[k] = dist[k] || { name: now.name, count: 0, seq: now.current.sequence ?? 0 };
                    dist[k].count += 1;
                  });
                  const entries = [
                    ...(fresh ? [['new', { name: t('ordersPage.notSentYet', 'Not sent yet'), count: fresh, seq: -1 }]] : []),
                    ...Object.entries(dist).sort((a, b) => a[1].seq - b[1].seq),
                  ];
                  const LOOK = { new: ['amber', Clock], pattern_cutting: ['rose', Scissors], fabric_cutting: ['rose', Scissors], alteration_work: ['rose', Scissors],
                    stitching_in_progress: ['blue', Shirt], finishing: ['blue', Shirt], master_quality_check: ['violet', ShieldCheck],
                    ready_for_delivery: ['green', PackageCheck], payment: ['amber', Wallet], delivered: ['green', CheckCircle2] };
                  const jump = (key) => {
                    if (key === 'new') { setOrdersFilterTab('new'); setDashboardTab('orders'); return; }
                    setOrdersStageFilter(key); setDashboardTab('workshop');
                  };
                  return (
                    <SectionCard icon={Boxes} tone="green" title={t('dashboard.inWorkroom', 'In the workroom')}
                                 action={() => setDashboardTab('workshop')} actionLabel={t('dashboard.allOrders', 'All orders')}
                                 style={{ marginBottom: 'var(--space-5)' }}>
                      {entries.length === 0 ? (
                        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                          {t('dashboard.noOrdersFloor', 'No orders yet. Create the first one to see it move through the floor.')}
                        </div>
                      ) : (
                        <div className="at-pipeline">
                          {entries.map(([key, { name, count }]) => {
                            const [tone, Icon] = LOOK[key] || ['neutral', Package];
                            return (
                              <button key={key} type="button" className={`at-pipeline-tile at-stat--${tone}`} onClick={() => jump(key)}>
                                <IconTile icon={Icon} tone={tone} size={34} iconSize={16} />
                                <span className="at-pipeline-value">{count}</span>
                                <span className="at-pipeline-label">{name}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </SectionCard>
                  );
                })()}

                {/* Needs attention | Today */}
                {/* alignItems: the class sets `start`, which leaves the right
                    column at its content height. Stretching makes both columns
                    the height of the row, which is what lets the two cards on
                    the right add up to the attention list beside them. */}
                <div className="at-grid-2" style={{ marginBottom: 'var(--space-5)', alignItems: 'stretch' }}>
                  <SectionCard icon={AlertCircle} tone="rose" title={t('dashboard.needsAttention', 'Needs attention')}
                               action={() => setDashboardTab('orders')} actionLabel={t('dashboard.viewAll', 'View All')}>
                    {(() => {
                      const att = dashboardData?.attention || {};
                      const due = att.due || [];
                      const unpaid = att.unpaid || [];
                      if (!due.length && !unpaid.length && !att.low_stock && !att.pending_designs) {
                        return <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                          {t('dashboard.nothingNeedsYou', 'Nothing needs you right now — no overdue orders, balances or low stock.')}
                        </div>;
                      }
                      const row = (key, onClick, ref, label, badge) => (
                        <div key={key} className="at-row at-row--tap" onClick={onClick}>
                          {ref && <span className="at-row-title" style={{ minWidth: '44px' }}>{ref}</span>}
                          <span className="at-row-main" style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>{label}</span>
                          {badge}
                          <ChevronRight size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                        </div>
                      );
                      // One row per order: an order both due and unpaid was
                      // listed twice, once per list, so the two chips share a row.
                      const byOrder = new Map(due.map((o) => [o.id, { ...o, isDue: true }]));
                      unpaid.forEach((o) => byOrder.set(o.id, { ...(byOrder.get(o.id) || o), balance: o.balance, isUnpaid: true }));
                      return (
                        <div>
                          {[...byOrder.values()].map((o) => row(`order-${o.id}`, () => setDashboardTab('orders'), orderRef(o), o.customer || t('dashboard.customer', 'Customer'),
                            <span style={{ display: 'inline-flex', gap: '4px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                              {o.isDue && <span className={`ui-badge ui-badge--${o.overdue ? 'danger' : 'warning'}`}>
                                {o.overdue ? t('dashboard.overdue', 'Overdue') : t('dashboard.due', 'Due')} {o.due ? new Date(o.due).toLocaleDateString([], { day: 'numeric', month: 'short' }) : ''}
                              </span>}
                              {o.isUnpaid && <span className="ui-badge ui-badge--warning">{t('dashboard.balanceDue', '{amount} due', { amount: inr(o.balance) })}</span>}
                            </span>))}
                          {att.low_stock > 0 && row('stock', () => setDashboardTab('inventory'), null, t('dashboard.lowStock', 'Low stock'),
                            <span className="ui-badge ui-badge--warning">{att.low_stock === 1 ? t('dashboard.lowStockOne', '{n} item', { n: 1 }) : t('dashboard.lowStockMany', '{n} items', { n: att.low_stock })}</span>)}
                          {att.pending_designs > 0 && row('designs', openDesignRequests, null, t('dashboard.designsAwaitingReview', 'Designs awaiting review'),
                            <span className="ui-badge ui-badge--info">{att.pending_designs}</span>)}
                        </div>
                      );
                    })()}
                  </SectionCard>

                  {/* The right column: two separate cards, one under the other
                      with the stack's own gap between them. The column is
                      stretched to the row, attendance keeps its natural height,
                      and appointments below takes whatever is left -- so
                      attendance + gap + appointments is exactly the height of
                      the attention card on the left. */}
                  <div className="at-stack" style={{ minHeight: 0 }}>
                  <SectionCard icon={CalendarDays} tone="green" title={t('dashboard.today', 'Today')}>
                    {(() => {
                      const today = dashboardData?.today || {};
                      return (
                        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                          <button type="button" className="at-pipeline-tile at-stat--green" style={{ flex: 1 }}
                                  onClick={() => setDashboardTab('staff')}>
                            <span className="at-pipeline-value" style={{ color: 'var(--tone-green-fg)' }}>{today.staff_working ?? 0}</span>
                            <span className="at-pipeline-label">{t('dashboard.onFloorNow', 'Working now')}</span>
                          </button>
                          <div className="at-pipeline-tile at-stat--neutral" style={{ flex: 1, cursor: 'default' }}>
                            <span className="at-pipeline-value">{today.staff_present ?? 0}</span>
                            <span className="at-pipeline-label">{t('dashboard.presentToday', 'Present today')}</span>
                          </div>
                        </div>
                      );
                    })()}
                  </SectionCard>
                  {/* Appointments, in their own card under attendance. They used
                      to share the attendance card, where Book Appointment sat
                      inside the empty state -- so the moment the first booking
                      was made the button vanished and there was no way to make a
                      second. It belongs in the header, where it is there whether
                      the list is empty or not. */}
                  <SectionCard icon={Calendar} tone="green" style={{ flex: 1 }}
                               title={t('dashboard.appointments', 'Appointments')}
                               subtitle={t('dashboard.appointmentsSub', 'Consultations, trials and deliveries still to come')}
                               action={() => { setEditingAppointment(null); setAppointmentForm(blankAppointmentForm); setShowAppointmentModal(true); }}
                               actionLabel={t('dashboard.bookAppointment', 'Book Appointment')}>
                    {(() => {
                      // The upcoming list, not the dashboard's today-only
                      // summary: the table shows the date, so a booking
                      // further out belongs in it, and today's rows are the
                      // ones tinted.
                      if (appointments.length === 0) {
                        return (
                          <div style={{ textAlign: 'center', padding: 'var(--space-2) 0' }}>
                            <IconTile icon={Calendar} tone="neutral" size={40} iconSize={18} />
                            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', margin: 'var(--space-2) 0 var(--space-3)' }}>
                              {t('dashboard.noAppointments', 'No appointments booked.')}
                            </div>
                            <button type="button" className="btn-primary at-btn-sm" style={{ margin: '0 auto' }}
                                    onClick={() => { setEditingAppointment(null); setAppointmentForm(blankAppointmentForm); setShowAppointmentModal(true); }}>
                              <Plus size={14} /> {t('dashboard.bookAppointment', 'Book Appointment')}
                            </button>
                          </div>
                        );
                      }
                      const today = todayIso();
                      return (
                        <div className="at-table-wrap">
                          <table className="at-table at-table--fit">
                            <thead>
                              <tr>
                                <th>{t('dashboard.apptCustomer', 'Customer')}</th>
                                <th>{t('dashboard.apptReason', 'Reason')}</th>
                                <th>{t('dashboard.apptDate', 'Date')}</th>
                                <th>{t('dashboard.apptTime', 'Time')}</th>
                                <th>{t('dashboard.apptWith', 'With')}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {appointments.map((a) => {
                                const when = new Date(a.scheduled_time);
                                const isToday = isoDay(when) === today;
                                const customer = a.customer_detail
                                  ? `${a.customer_detail.first_name || ''} ${a.customer_detail.last_name || ''}`.trim()
                                  : '';
                                return (
                                  <tr key={a.id} className={`at-row--tap${isToday ? ' appt-today' : ''}`}
                                      onClick={() => openAppointment(a)}>
                                    <td data-label={t('dashboard.apptCustomer', 'Customer')}
                                        style={{ fontWeight: 'var(--weight-semibold)' }}>
                                      {customer || t('dashboard.customer', 'Customer')}
                                    </td>
                                    <td data-label={t('dashboard.apptReason', 'Reason')}>
                                      {a.custom_type
                                        || APPOINTMENT_TYPE_LABELS[a.appointment_type]
                                        || a.appointment_type}
                                    </td>
                                    <td data-label={t('dashboard.apptDate', 'Date')} style={{ whiteSpace: 'nowrap' }}>
                                      {isToday
                                        ? <strong>{t('dashboard.apptToday', 'Today')}</strong>
                                        : fmtDate(a.scheduled_time)}
                                    </td>
                                    <td data-label={t('dashboard.apptTime', 'Time')} style={{ whiteSpace: 'nowrap' }}>
                                      {when.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                                    </td>
                                    <td data-label={t('dashboard.apptWith', 'With')}
                                        style={{ color: 'var(--text-secondary)' }}>
                                      {a.assigned_staff_detail?.name || t('dashboard.apptUnassigned', 'Unassigned')}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      );
                    })()}
                  </SectionCard>
                  </div>
                </div>

                {/* Recent orders, full width: a ref / customer / amount list
                    reads as a ledger, and a ledger wants the row. The header's
                    New Order and the sidebar already carry every shortcut the
                    Quick Actions card duplicated. */}
                <SectionCard icon={ShoppingBag} tone="blue" title={t('dashboard.recentOrders', 'Latest orders')}
                             subtitle={t('dashboard.latestOrdersSub', 'Recently placed orders')}
                             action={() => setDashboardTab('orders')} actionLabel={t('dashboard.viewAll', 'View all')}>
                  {!dashboardData?.recent_orders || dashboardData.recent_orders.length === 0 ? (
                    <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
                      {t('dashboard.noOrdersYet', 'No orders yet.')}
                    </div>
                  ) : (
                    <div>
                      {dashboardData.recent_orders.map((order) => (
                        <div key={order.id || order.order_id} className="at-row at-row--tap"
                             onClick={() => setDashboardTab('orders')}>
                          <span className="at-row-title" style={{ minWidth: '44px' }}>{orderRef(order)}</span>
                          {/* Stacked like the amount/status cell opposite: the
                              name and the garment are two spans, and inline
                              they ran together as "Asrita DasSaree". */}
                          <span className="at-row-main" style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                            <span className="at-row-title" style={{ fontWeight: 500 }}>{order.customer_name || order.customer || t('dashboard.customer', 'Customer')}</span>
                            <span className="at-row-sub">{order.garment_label || ''}</span>
                          </span>
                          <span style={{ textAlign: 'right' }}>
                            <div className="at-row-title at-num">{order.total_amount != null ? inr(order.total_amount) : ''}</div>
                            <div className="at-row-sub">{t(`status.${order.order_status}`, order.order_status || order.status || '')}</div>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </SectionCard>
              </>
            )}

            {/* INVENTORY TAB */}
            {dashboardTab === 'inventory' && (
              <Suspense fallback={<ScreenLoading />}>
                <InventoryPanel currentUser={currentUser}
                                restockItem={restockTrip?.fabric || null}
                                onRestockDone={finishRestockTrip} />
              </Suspense>
            )}

            {dashboardTab === 'staff' && (
              <Suspense fallback={<ScreenLoading />}>
                <StaffPanel currentUser={currentUser} />
              </Suspense>
            )}

            {dashboardTab === 'finance' && (
              <Suspense fallback={<ScreenLoading />}>
                <FinancePanel />
              </Suspense>
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
                  aside={(
                    <div className="user-profile-widget">
                      <div className="user-avatar-circle">
                        <UserAvatar user={currentUser} />
                      </div>
                      <span>{t('dashboard.hiUser', `Hi, ${currentUserName}`, { name: currentUserName })}</span>
                    </div>
                  )}
                  actions={(!currentUser?.role || currentUser.role === 'Owner') && (
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
                  <div className="tabs-header" style={{ marginBottom: '16px' }}>
                    <button className={`tab-btn ${designsView === 'dashboard' ? 'active' : ''}`}
                            onClick={() => setDesignsView('dashboard')}>
                      {t('designsPage.overviewTab', 'Overview')}
                    </button>
                    <button className={`tab-btn ${designsView === 'library' ? 'active' : ''}`}
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
                    ) : designsView === 'dashboard' ? (
                      <DesignDashboard
                        onOpenLibrary={() => setDesignsView('library')}
                        canManageDesigners={!currentUser?.role || currentUser.role === 'Owner'}
                      />
                    ) : (
                      <DesignLibrary
                        refreshToken={designLibraryToken}
                        canReview={!currentUser?.role || currentUser.role === 'Owner'}
                        canStock={!currentUser?.role || currentUser.role === 'Owner'}
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
            {['orders', 'workshop'].includes(dashboardTab) && openOrder && (() => {
              const order = openOrder;
              const stages = order.stages || [];
              const allDone = stages.length > 0 && stages.every(st => st.status === 'COMPLETED' || st.status === 'SKIPPED');
              const tasksDone = stages.filter(st => st.status === 'COMPLETED' || st.status === 'SKIPPED').length;
              const stepChip = `${tasksDone} of ${stages.length} ${t('ordersPage.tasksCompleted', 'tasks completed')}`;
              const verification = order.master_verification || {};
              const verifyTotal = 6 + (orderGarmentNames(order).includes('Saree') ? 1 : 0);
              const verified = Object.values(verification).filter(Boolean).length;
              return (
                <div className="od-page">
                  <div className="od-topbar">
                    <button type="button" className="btn-link od-back" onClick={() => setOpenOrdersRowId(null)}>
                      <ArrowLeft size={16} /> {dashboardTab === 'workshop' ? t('ordersPage.backToWorkshop', 'Back to workshop') : t('ordersPage.backToOrders', 'Back to orders')}
                    </button>
                    {/* The one thing to do next lives up here: send it to the
                        workshop, or (the owner's shortcut) close every stage. */}
                    <div className="od-topbar-actions">
                      {orderBucket(order) === 'new' && ['Owner', 'Master'].includes(currentUser.role) && (
                        <button type="button" className="btn-primary od-send-btn" disabled={sendBusy}
                                onClick={() => openSendToWorkshop(order)}>
                          <Scissors size={16} /> {t('ordersPage.sendToWorkshop', 'Send to workshop')}
                        </button>
                      )}
                      {currentUser.role === 'Owner' && stages.length > 0 && !allDone && orderBucket(order) !== 'new' && (
                        <button type="button" className="btn-primary"
                                disabled={completingAllOrderId === order.id}
                                onClick={async () => {
                                  if (!window.confirm((order.payment_status === 'Paid' ? '' : `Payment is not complete: ${inr(order.amount_paid)} of ${inr(order.total_amount)} received.

`) + 'Complete every remaining stage and mark this order Delivered?')) return;
                                  setCompletingAllOrderId(order.id);
                                  try { await api.completeAllStages(order.id); await fetchDashboardAndConfig(); }
                                  catch (err) { alert(err.message); }
                                  finally { setCompletingAllOrderId(null); }
                                }}>
                          <CheckCircle2 size={16} /> {completingAllOrderId === order.id ? t('ordersPage.completing', 'Completing…') : t('ordersPage.markComplete', 'Mark as complete')}
                        </button>
                      )}
                    </div>
                  </div>

                  <header className="od-head">
                    <div className="od-head-left">
                      <div className="od-title-row">
                        <h1 className="od-title">Order {orderRef(order)}</h1>
                        {/* Where it stands, in the workroom's words: the stages
                            move the order along, so nothing to pick here. */}
                        {(() => {
                          const bucket = orderBucket(order);
                          const text = bucket === 'done' ? t(`status.${order.order_status}`, order.order_status)
                            : bucket === 'new' ? t('ordersPage.notSentYet', 'Not sent yet')
                            : (stageNow(order)?.name || t('ordersPage.tabInProgress', 'In progress'));
                          return (
                            <span className={`od-status od-status--${orderStatusTone(order.order_status)}`} style={{ padding: '0 14px', fontWeight: 600, fontSize: 'var(--text-sm)' }}>
                              {text}
                            </span>
                          );
                        })()}
                        {verified > 0 && (
                          <span className="ui-badge ui-badge--success">
                            👑 {t('ordersPage.masterVerified', 'Master Verified:')} {verified}/{verifyTotal} ({Math.round((verified / verifyTotal) * 100)}%)
                          </span>
                        )}
                        {order.flow && order.flow !== 'legacy' && (() => {
                          const canSwitch = order.flow !== 'alteration' && (currentUser?.role === 'Owner' || currentUser?.role === 'Master')
                            && !(order.stages || []).some(st => st.stage_key !== 'created' && st.status !== 'NOT_STARTED');
                          const label = order.flow === 'alteration' ? t('ordersPage.flowAlteration', 'Alteration')
                            : order.flow === 'maggam' ? t('ordersPage.flowMaggam', 'Maggam order') : t('ordersPage.flowStitching', 'Stitching order');
                          return canSwitch ? (
                            <label className={`ui-badge ${order.flow === 'maggam' ? 'ui-badge--warning' : 'ui-badge--neutral'}`} style={{ cursor: 'pointer', gap: '4px' }} title="Change how this order is made">
                              <select value={order.flow} aria-label="Order path"
                                      style={{ background: 'transparent', border: 'none', font: 'inherit', color: 'inherit', cursor: 'pointer' }}
                                      onChange={async (e) => {
                                        try { await api.setOrderFlow(order.id, e.target.value); fetchDashboardAndConfig(); }
                                        catch (err) { alert(err.message); }
                                      }}>
                                <option value="stitching">{t('ordersPage.flowStitching', 'Stitching order')}</option>
                                <option value="maggam">{t('ordersPage.flowMaggam', 'Maggam order')}</option>
                              </select>
                            </label>
                          ) : (
                            <span className={`ui-badge ${order.flow === 'maggam' ? 'ui-badge--warning' : 'ui-badge--neutral'}`}>{label}</span>
                          );
                        })()}
                      </div>
                      <div className="od-meta">
                        <span><User size={14} />{t('ordersPage.client', 'Customer:')} <strong>{order.customer_name}</strong></span>
                        <span className="od-meta-sep" aria-hidden="true">·</span>
                        <span><Calendar size={14} />{t('ordersPage.created', 'Taken on:')} {fmtDate(order.order_date)}</span>
                        {order.flow === 'alteration' && (
                          <>
                            <span className="od-meta-sep" aria-hidden="true">·</span>
                            <span><Scissors size={14} />
                              {order.alteration_of ? (
                                <>{t('ordersPage.alterationOf', 'Alteration of')} <button type="button" className="at-link" onClick={() => setOpenOrdersRowId(order.alteration_of)}>{order.alteration_of_reference}</button></>
                              ) : t('ordersPage.outsideGarment', 'Garment from outside')}
                              {order.alteration_garment_name ? ` · ${order.alteration_garment_name}` : ''}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <p className="od-quote">“From fabric to finesse, we keep you in the loop.”</p>
                  </header>

                  {/* The four facts to scan: who is on it, what it is worth, when it is due. */}
                  <section className="od-facts">
                    <div className="od-fact">
                      <IconTile icon={User} tone="green" size={44} iconSize={20} />
                      <div>
                        <div className="od-fact-label">{t('ordersPage.supervisingMaster', 'Supervising Master')}</div>
                        {isProductionStaff(currentUser.role) ? (
                          <div className={`od-fact-value${order.master_name ? '' : ' od-fact-value--empty'}`}>
                            {order.master_name || t('ordersPage.unassigned', 'Unassigned')}
                          </div>
                        ) : (
                          <select className="od-fact-select" value={order.master || ''} aria-label={t('ordersPage.supervisingMaster', 'Supervising Master')}
                                  disabled={assigningWorkflowOrderId === order.id}
                                  onChange={(e) => handleAssignWorkflow(order.id, { master: e.target.value || null })}>
                            <option value="">{t('ordersPage.unassigned', 'Unassigned')}</option>
                            {order.master && !tailors.some(tl => tl.id === order.master) && (
                              <option value={order.master}>{order.master_name || `#${order.master}`}</option>
                            )}
                            {tailors.filter(tl => tl.role === 'Master').map(tl => <option key={tl.id} value={tl.id}>{tl.name}</option>)}
                          </select>
                        )}
                      </div>
                    </div>
                    <div className="od-fact">
                      <IconTile icon={Scissors} tone="amber" size={44} iconSize={20} />
                      <div>
                        <div className="od-fact-label">{t('ordersPage.stitchingTailor', 'Stitching Tailor')}</div>
                        {isProductionStaff(currentUser.role) ? (
                          <div className={`od-fact-value${order.tailor_name ? '' : ' od-fact-value--empty'}`}>
                            {order.tailor_name || t('ordersPage.unassigned', 'Unassigned')}
                          </div>
                        ) : (
                          <select className="od-fact-select" value={order.tailor || ''} aria-label={t('ordersPage.stitchingTailor', 'Stitching Tailor')}
                                  disabled={assigningWorkflowOrderId === order.id}
                                  onChange={(e) => handleAssignWorkflow(order.id, { tailor: e.target.value || null })}>
                            <option value="">{t('ordersPage.unassigned', 'Unassigned')}</option>
                            {order.tailor && !stitchingStaff().some(tl => tl.id === order.tailor) && (
                              <option value={order.tailor}>{order.tailor_name || `#${order.tailor}`}</option>
                            )}
                            {stitchingStaff().map(tl => <option key={tl.id} value={tl.id}>{tl.name}</option>)}
                          </select>
                        )}
                      </div>
                    </div>
                    {!isProductionStaff(currentUser.role) && (
                      <div className="od-fact">
                        <IconTile icon={IndianRupee} tone="green" size={44} iconSize={20} />
                        <div>
                          <div className="od-fact-label">{t('ordersPage.totalValue', 'Total Value')}</div>
                          <div className="od-fact-value">{inr(order.total_amount)}</div>
                        </div>
                      </div>
                    )}
                    <div className="od-fact">
                      <IconTile icon={Calendar} tone="amber" size={44} iconSize={20} />
                      <div>
                        <div className="od-fact-label">{t('ordersPage.estDelivery', 'Est. Delivery')}</div>
                        <div className="od-fact-value">{order.estimated_delivery ? fmtDate(order.estimated_delivery) : t('ordersPage.tbd', 'TBD')}</div>
                      </div>
                    </div>
                  </section>

                  {/* Where the order stands in the workroom; a step opens its panel. */}
                  {/* Previous / current / next, each a door into that stage. */}
                  {orderBucket(order) === 'workshop' && (() => {
                    const now = stageNow(order);
                    if (!now) return null;
                    const cols = [
                      { key: 'prev', label: t('ordersPage.previousStage', 'Previous stage'), st: now.prev, Icon: Check,
                        sub: now.prev?.completed_at ? `${t('ordersPage.completedOn', 'Completed on')} ${fmtDate(now.prev.completed_at)}` : '' },
                      { key: 'now', label: t('ordersPage.currentStage', 'Current stage'), st: now.current, Icon: Scissors,
                        sub: [now.current.started_at && `${t('ordersPage.startedOn', 'Started on')} ${fmtDate(now.current.started_at)}`,
                              stageWho(now.current), now.current.status === 'PENDING_VERIFICATION' && t('ordersPage.waitingForCheck', 'waiting for check')]
                          .filter(Boolean).join(' · ') },
                      { key: 'next', label: t('ordersPage.nextStage', 'Next stage'), st: now.next, Icon: Clock,
                        sub: now.next ? t('ordersPage.startsAfter', 'Starts after {stage}', { stage: now.name.toLowerCase() }) : '' },
                    ];
                    return (
                      <section className="at-section od-strip" aria-label={t('ordersPage.whereItStands', 'Where it stands')}>
                        {cols.map(({ key, label, st, Icon, sub }, idx) => (
                          <React.Fragment key={key}>
                            {idx > 0 && <span className="od-strip-arrow" aria-hidden="true"><ChevronRight size={18} /></span>}
                            <div className={`od-strip-col od-strip-col--${key}`}>
                              <span className="ui-eyebrow">{label}</span>
                              <button type="button" className="od-strip-pill" disabled={!st} onClick={() => st && openStageReview(order, st)}>
                                <span className="od-strip-icon"><Icon size={16} /></span>
                                <span className="od-strip-name">{st ? st.stage_name : '—'}</span>
                              </button>
                              {sub && <span className="od-strip-sub">{sub}</span>}
                            </div>
                          </React.Fragment>
                        ))}
                      </section>
                    );
                  })()}

                  <div className="od-columns">
                    <div className="od-main">
                  <section className="at-section od-journey">
                        <div className="od-section-head">
                          <IconTile icon={ClipboardList} tone="amber" size={40} iconSize={18} />
                          <div className="od-section-title od-section-title--stack">
                            <h3>{t('ordersPage.orderJourney', 'Order journey & tasks')}</h3>
                            <span className="od-section-sub">{t('ordersPage.orderJourneySub', 'Track and manage tasks for this order')}</span>
                          </div>
                          {stages.length > 0 && (
                            <div className="od-head-actions od-progress">
                              <span className="od-progress-text">{stepChip}</span>
                              <span className="od-progress-bar"><ProgressBar pct={Math.round((tasksDone / stages.length) * 100)} tone="green" /></span>
                              <span className="od-progress-pct">{Math.round((tasksDone / stages.length) * 100)}%</span>
                            </div>
                          )}
                        </div>
                        <OrderTaskTable stages={stages} onSelectStage={(stage) => openStageReview(order, stage)} />
                      </section>

                      <CustomerMessageQueue
                        orderId={order.id}
                        messages={queuedMessages.filter(m => m.order === order.id)}
                        onMarkSent={handleMarkMessageSent}
                      />

                      {/* Raw materials checklist; nothing to gather, no section. */}
                      {hasMaterials(order) && (
                      <section className="at-section od-materials">
                        <div className="od-section-head">
                          <IconTile icon={Layers} tone="neutral" size={40} iconSize={18} />
                          <div className="od-section-title od-section-title--stack">
                            <h3>{t('ordersPage.rawMaterials', 'Raw materials checklist')}</h3>
                            <span className="od-section-sub">{t('ordersPage.rawMaterialsSub', 'Track the materials used for this order.')}</span>
                          </div>
                        </div>
                        {(order.purchases || []).filter(pu => pu.status !== 'CANCELLED').length > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
                            {(order.purchases || []).filter(pu => pu.status !== 'CANCELLED').map(pu => (
                              <div key={pu.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', padding: '8px 12px', borderRadius: 'var(--radius-md)', background: 'var(--surface-2)', fontSize: '13px' }}>
                                <span>🛒 <strong>{pu.name}</strong>{pu.garment_name ? ` · ${pu.garment_name}` : ''}</span>
                                <span style={{ color: 'var(--text-secondary)' }}>
                                  {Number(pu.quantity)} {pu.unit_display} · {pu.actual_cost != null ? `${inr(pu.actual_cost)} paid` : `${inr(pu.estimated_cost)} estimated`}
                                </span>
                                <span className={`ui-badge ui-badge--${{ TO_PURCHASE: 'warning', PURCHASED: 'info', RECEIVED: 'success' }[pu.status] || 'neutral'}`} style={{ marginLeft: 'auto' }}>
                                  {pu.status === 'TO_PURCHASE' ? 'Need to buy' : pu.status_display}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                        <MaterialsChecklist orderId={order.id} role={currentUser.role} />
                      </section>
                      )}

                      <div className="od-extra">
                          {/* Post-delivery alterations. Shown only once the
                              order is Delivered -- before that a fitting
                              problem is production's to fix, not a new job. */}
                          <OrderAlterations
                            order={order}
                            customerId={order.customer}
                            currentUser={currentUser}
                            onOpenAlteration={openAlteration}
                          />

                          {/* Master verification checklist */}
                          {currentUser.role === 'Master' && (
                            <div style={{ padding: 'var(--space-4)', background: 'var(--accent-color)',
                                 border: '1px solid var(--accent-border)', borderRadius: 'var(--radius-md)', textAlign: 'left' }}>
                              <div className="ui-eyebrow" style={{ marginBottom: 'var(--space-3)', color: 'var(--accent-text)' }}>👑 Master production verification</div>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-2) var(--space-4)' }}>
                                {[
                                  { key: 'dress_cutting', label: 'Dress & Pattern Cutting' },
                                  { key: 'thread', label: 'Matching Thread & Accents' },
                                  { key: 'hemming', label: 'Hemming & Seam Finishes' },
                                  ...(order.customer_garment_type === 'Saree' ? [{ key: 'fall_pico', label: 'Fall & Pico / Peack' }] : []),
                                  { key: 'hook_buttons', label: 'Hook or Buttons Closure' },
                                  { key: 'pressing', label: 'Garment Steam Pressing' },
                                  { key: 'dispatch_trial', label: 'Dispatch or Fit Trial Ready' }
                                ].map(item => {
                                  const isChecked = order.master_verification?.[item.key] || false;
                                  return (
                                    <label key={item.key} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--text-sm)', cursor: 'pointer' }}>
                                      <input
                                        type="checkbox"
                                        checked={isChecked}
                                        disabled={savingVerificationOrderId === order.id}
                                        onChange={async (e) => {
                                          if (savingVerificationOrderId) return;
                                          const updatedVerification = { ...(order.master_verification || {}), [item.key]: e.target.checked };
                                          setSavingVerificationOrderId(order.id);
                                          try {
                                            await api.saveMasterVerification(order.id, updatedVerification);
                                            fetchDashboardAndConfig();
                                          } catch (err) {
                                            alert("Failed to update verification check: " + err.message);
                                          } finally {
                                            setSavingVerificationOrderId(null);
                                          }
                                        }}
                                      />
                                      <span style={{ textDecoration: isChecked ? 'line-through' : 'none', color: isChecked ? 'var(--text-muted)' : 'var(--text-primary)' }}>
                                        {item.label}
                                      </span>
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Delivery */}
                          <DeliveryCard key={`${order.id}-${order.delivery_method}-${order.tracking_number}`} order={order}
                                        canEdit={!isProductionStaff(currentUser.role)} onSaved={fetchDashboardAndConfig} />

                          {/* Tailor completion report */}
                          {(order.tailor_comments || order.completed_garment_image) && (
                            <div style={{ background: 'var(--accent-color)', border: '1px solid var(--accent-border)',
                                 borderRadius: 'var(--radius-md)', padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                              <div className="ui-eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', color: 'var(--accent-text)' }}>
                                <Scissors size={13} /> Stitching completion report
                              </div>
                              {order.tailor_comments && (
                                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', margin: 0, fontStyle: 'italic' }}>
                                  "{order.tailor_comments}"<SpeakButton text={order.tailor_comments} />
                                </p>
                              )}
                              {(() => {
                                const stitching = (order.stages || []).find(st => st.stage_key === 'stitching_in_progress');
                                const photos = stitching?.attachments?.length ? stitching.attachments
                                  : (order.completed_garment_image ? [order.completed_garment_image] : []);
                                const reviews = stitching?.attachment_reviews || {};
                                const canReview = currentUser?.role === 'Owner' || currentUser?.role === 'Master';
                                const items = photos.map((u, i) => ({ image_url: u, label: `Photo ${i + 1}` }));
                                const reject = async (url) => {
                                  const remark = window.prompt('What is wrong with this photo? The tailor reads this.');
                                  if (remark === null) return;
                                  if (!remark.trim()) { alert('A remark is required to reject a photo.'); return; }
                                  try { await api.reviewStagePhoto(order.id, 'stitching_in_progress', url, remark.trim().slice(0, LIMITS.reason), 'REJECTED', stitching?.garment_job || null); fetchDashboardAndConfig(); }
                                  catch (err) { alert(err.message); }
                                };
                                const clear = async (url) => {
                                  try { await api.reviewStagePhoto(order.id, 'stitching_in_progress', url, '', 'CLEAR', stitching?.garment_job || null); fetchDashboardAndConfig(); }
                                  catch (err) { alert(err.message); }
                                };
                                return photos.length > 0 && (
                                  <div style={{ marginTop: '4px' }}>
                                    <span className="ui-eyebrow" style={{ display: 'block', marginBottom: '6px' }}>
                                      Garment photo{photos.length === 1 ? '' : 's'} · {photos.length}
                                    </span>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                                      {photos.map((url, i) => {
                                        const verdict = reviews[url];
                                        return (
                                          <div key={url} style={{ width: '120px' }}>
                                            <div style={{ position: 'relative' }}>
                                              <img src={url} alt="" style={{ width: '120px', height: '120px', objectFit: 'cover', borderRadius: 'var(--radius-md)', display: 'block',
                                                                              border: verdict ? '2px solid var(--danger-color)' : '1px solid var(--border-color)',
                                                                              opacity: verdict ? 0.7 : 1 }} />
                                              <button type="button" className="btn-secondary at-btn-sm" title="View"
                                                      style={{ position: 'absolute', top: '6px', right: '6px', minHeight: '26px', padding: '0 8px' }}
                                                      onClick={() => setReviewView({ items, index: i })}>
                                                <Eye size={12} /> View
                                              </button>
                                              {verdict && (
                                                <span style={{ position: 'absolute', left: '6px', bottom: '6px', fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '10px',
                                                               background: 'var(--danger-color)', color: '#fff' }}>Rejected</span>
                                              )}
                                            </div>
                                            {verdict && (
                                              <div style={{ fontSize: '11px', color: 'var(--danger-color)', marginTop: '4px', lineHeight: 1.3 }}>{verdict.remark}</div>
                                            )}
                                            {canReview && (
                                              verdict
                                                ? <button type="button" className="btn-link" style={{ fontSize: '11px', padding: 0, minHeight: '24px' }} onClick={() => clear(url)}>Undo rejection</button>
                                                : <button type="button" className="btn-link" style={{ fontSize: '11px', padding: 0, minHeight: '24px', color: 'var(--danger-color)' }} onClick={() => reject(url)}>
                                                    <X size={11} /> Reject photo
                                                  </button>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>
                          )}
                      </div>
                      <div className="od-tip" role="note">
                        <IconTile icon={Sparkles} tone="green" size={36} iconSize={16} />
                        <div>
                          <strong>{t('ordersPage.tipTitle', 'Keep the quality high!')}</strong>
                          <span>{t('ordersPage.tipText', 'Check measurements and design notes before moving to the next stage.')}</span>
                        </div>
                      </div>
                    </div>

                    <aside className="od-side">
                      <OrderGarmentsCard order={order} onSelectStage={(stage) => openStageReview(order, stage)} />
                      <GarmentGallery order={order} onChanged={fetchDashboardAndConfig} />
                      <section className="at-section od-customer">
                        <div className="od-section-head" style={{ marginBottom: 0 }}>
                          <IconTile icon={User} tone="neutral" size={40} iconSize={18} />
                          <div className="od-section-title od-section-title--stack">
                            <h3>{t('ordersPage.customerDetails', 'Customer details')}</h3>
                            <span className="od-section-sub">{order.customer_name}</span>
                          </div>
                          <button type="button" className="btn-secondary at-btn-sm"
                                  onClick={() => {
                                    const cust = customersList.find((c) => c.id === order.customer) || { id: order.customer, first_name: order.customer_name, last_name: '' };
                                    setDashboardTab('customers'); openDirectoryCustomer(cust);
                                  }}>
                            {t('ordersPage.viewCustomer', 'View customer')} <ArrowRight size={14} />
                          </button>
                        </div>
                      </section>

                      <OrderNotesCard key={order.id} order={order} canEdit={!isProductionStaff(currentUser.role)} onSaved={fetchDashboardAndConfig} />
                    </aside>
                  </div>
                </div>
              );
            })()}

            {['orders', 'workshop'].includes(dashboardTab) && !openOrder && (
              <>
                {ordersAlterationOrder && (
                  <RequestAlterationModal
                    order={ordersAlterationOrder}
                    customerId={ordersAlterationOrder.customer}
                    onClose={() => setOrdersAlterationOrder(null)}
                    onCreated={(created) => { setOrdersAlterationOrder(null); rememberAlteration(created); openAlteration(created.id); }}
                  />
                )}
                {/* A garment we did not make, brought in for work: the same
                    intake the Alterations tab offers, reachable from where
                    the counter is standing. Opens on the new alteration. */}
                {takingInOutside && (
                  <Suspense fallback={<ScreenLoading />}>
                    <OutsideGarmentIntake
                      onClose={() => setTakingInOutside(false)}
                      onCreated={(created) => { setTakingInOutside(false); rememberAlteration(created); openAlteration(created.id); }}
                    />
                  </Suspense>
                )}
                <PageHeader
                  title={dashboardTab === 'workshop' ? t('ordersPage.workshopTitle', 'Workshop') : t('ordersPage.title')}
                  subtitle={dashboardTab === 'workshop' ? t('ordersPage.workshopSubtitle', 'Every order being made, who has it, and what comes next.') : t('ordersPage.subtitle')}
                  aside={<SearchBox value={ordersSearch} onChange={setOrdersSearch} placeholder={t('ordersPage.searchPlaceholder')} />}
                  actions={dashboardTab === 'workshop' ? null : (
                    <>
                      {(!currentUser?.role || ['Owner', 'Master'].includes(currentUser.role)) && (
                        <button className="btn-secondary" style={{ padding: '10px 18px' }} onClick={() => setTakingInOutside(true)}>
                          <Scissors size={16} /> Outside garment alteration
                        </button>
                      )}
                      {(!currentUser?.role || currentUser.role === 'Owner') && (
                        <GuidedHighlight show={guideOrders} text={ordersList.length ? t('onboard.newOrder', 'Create an order') : t('onboard.firstOrder', 'Create your first order')}>
                          <button className="btn-primary btn-gold" style={{ padding: '10px 18px' }} onClick={() => setView('order-selector')}>
                            <Plus size={16} /> {t('ordersPage.newOrder')}
                          </button>
                        </GuidedHighlight>
                      )}
                    </>
                  )}
                />

                {(() => {
                  // Three piles: still on the counter, being made, out the door.
                  const fresh = ordersList.filter(o => orderBucket(o) === 'new').length;
                  const making = ordersList.filter(o => orderBucket(o) === 'workshop').length;
                  const done = ordersList.filter(o => orderBucket(o) === 'done').length;
                  return (
                    <>
                      {dashboardTab === 'orders' && (
                        <section className="at-stat-grid">
                          <StatCard icon={ShoppingCart} tone="amber" label={t('ordersPage.tabNew', 'New')} value={fresh} sub={t('ordersPage.tabNewSub', 'waiting to be sent')}
                                    onClick={() => setOrdersFilterTab('new')} />
                          <StatCard icon={Scissors} tone="blue" label={t('ordersPage.tabInProgress', 'In progress')} value={making} sub={t('ordersPage.tabWorkshopSub', 'being made')}
                                    onClick={() => setOrdersFilterTab('workshop')} />
                          <StatCard icon={CheckCircle2} tone="green" label={t('ordersPage.tabDone', 'Closed')} value={done} sub={t('ordersPage.tabDoneSub', 'delivered or cancelled')}
                                    onClick={() => setOrdersFilterTab('done')} />
                        </section>
                      )}
                      <div className="at-toolbar">
                        {dashboardTab === 'orders' && (
                          <Chips value={ordersFilterTab} onChange={setOrdersFilterTab} options={[
                            { key: 'new', label: t('ordersPage.tabNew', 'New'), count: fresh },
                            { key: 'workshop', label: t('ordersPage.tabInProgress', 'In progress'), count: making },
                            { key: 'done', label: t('ordersPage.tabDone', 'Closed'), count: done },
                          ]} />
                        )}
                        {/* Narrow by who it is for, what it is, and where it stands;
                            the list and the board read the same filter. */}
                        <details className="at-toolbar-filters at-filters-fold">
                          <summary className="at-phone-only"><Filter size={14} /> {t('common.filters', 'Filters')}</summary>
                          <select className="form-control at-filter" value={ordersTypeFilter} aria-label="Order type"
                                  onChange={(e) => setOrdersTypeFilter(e.target.value)}>
                            <option value="All">{t('ordersPage.allTypes', 'All types')}</option>
                            <option value="Stitching">{t('ordersPage.typeStitching', 'Stitching')}</option>
                            <option value="Maggam">{t('ordersPage.typeMaggam', 'Maggam')}</option>
                            <option value="Alteration">{t('ordersPage.typeAlteration', 'Alterations')}</option>
                          </select>
                          <select className="form-control at-filter" value={ordersTierFilter} aria-label="Customer type"
                                  onChange={(e) => setOrdersTierFilter(e.target.value)}>
                            <option value="All">{t('ordersPage.allCustomerTypes', 'All customer types')}</option>
                            {TIERS.map(tier => <option key={tier} value={tier}>{t(`wizard.${tier.toLowerCase()}`, tier)}</option>)}
                          </select>
                          <select className="form-control at-filter" value={ordersGarmentFilter} aria-label="Garment"
                                  onChange={(e) => setOrdersGarmentFilter(e.target.value)}>
                            <option value="All">{t('ordersPage.allGarments', 'All garments')}</option>
                            {[...new Set(ordersList.flatMap(orderGarmentNames))].sort().map(name => (
                              <option key={name} value={name}>{name}</option>
                            ))}
                          </select>
                          <select className="form-control at-filter" value={ordersStageFilter} aria-label="Workroom step"
                                  onChange={(e) => setOrdersStageFilter(e.target.value)}>
                            <option value="All">{t('ordersPage.allStages', 'All stages')}</option>
                            {(boutiqueSettings?.workflow_config?.length
                              ? boutiqueSettings.workflow_config.map(c => [c.key, c.name])
                              : [...new Map(ordersList.flatMap(o => (o.stages || []).map(st => [st.stage_key, st.stage_name]))).entries()]
                            ).map(([key, name]) => <option key={key} value={key}>{name}</option>)}
                          </select>
                        </details>
                        {/* List / Board: two drawings of the workshop; the
                            board's columns are stages, so only that tab has one. */}
                        {dashboardTab === 'workshop' && (
                          <div className="at-toolbar-right">
                            <Segmented ariaLabel="Orders view" value={ordersView} onChange={setOrdersView} options={[
                              { key: 'kanban', label: 'Board', icon: LayoutGrid },
                              { key: 'list', label: 'List', icon: List },
                            ]} />
                          </div>
                        )}
                      </div>
                    </>
                  );
                })()}

                <div className="orders-registry-content" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                  {ordersView === 'kanban' && dashboardTab === 'workshop' ? (
                    <OrderKanban
                      orders={ordersList.filter(orderMatchesFilters)}
                      workflow={boutiqueSettings?.workflow_config}
                      onOpen={(order, stage) => openStageReview(order, stage)}
                      onChanged={fetchDashboardAndConfig}
                    />
                  ) : (
                  /* Orders list */
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                    {(() => {
                      const statusTone = (st) =>
                        st === 'Delivered' ? 'success'
                          : st === 'Cancelled' ? 'neutral'
                          : (st === 'Shipped' || st === 'Ready for Dispatch') ? 'info'
                          : 'warning';
                      const filtered = ordersList.filter(orderMatchesFilters);

                      if (filtered.length === 0) {
                        return (
                          <div className="ui-card" style={{ padding: 'var(--space-10)', textAlign: 'center', color: 'var(--text-muted)' }}>
                            {ordersList.length === 0 ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', alignItems: 'center' }}>
                                <div style={{ fontWeight: 'var(--weight-semibold)', color: 'var(--text-primary)', fontSize: 'var(--text-md)' }}>{t('ordersPage.noOrdersYet', 'No orders yet')}</div>
                                <div style={{ fontSize: 'var(--text-sm)', maxWidth: '44ch', lineHeight: 'var(--leading-normal)' }}>
                                  {t('ordersPage.noOrdersYetDesc', 'Orders you create will appear here, with their production stage and who is working on them.')}
                                </div>
                                <button className="btn-primary" onClick={() => setView('order-selector')}>
                                  {t('ordersPage.createFirstOrder', 'Create your first order')}
                                </button>
                              </div>
                            ) : t('ordersPage.noOrdersMatching', 'No orders found matching the criteria.')}
                          </div>
                        );
                      }

                      const today = todayIso();

                      return (
                      <div className="at-table-wrap">
                      <table className="at-table at-table--fit">
                        <thead>
                          <tr>
                            <th>Order ID</th>
                            <th>Type</th>
                            <th>Customer Name</th>
                            <th>Est. Delivery Date</th>
                            <th>Status</th>
                            <th style={{ textAlign: 'right' }}>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                      {filtered.map(order => {
                        const isDelivered = order.order_status === 'Delivered';
                        const isCancelled = order.order_status === 'Cancelled';
                        const bucket = orderBucket(order);
                        const stage = bucket === 'workshop' ? stageNow(order) : null;
                        const late = bucket === 'workshop' && order.estimated_delivery && order.estimated_delivery < today;
                        // Delivered on: when the last step closed, else the promised day.
                        const deliveredOn = isDelivered
                          ? ((order.stages || []).filter(st => st.completed_at).map(st => st.completed_at).sort().pop() || order.estimated_delivery)
                          : null;
                        return (
                        <React.Fragment key={order.id}>
                        <tr className={isExpressOrder(order) && !isDelivered && !isCancelled ? 'gh-express' : undefined}
                            style={isCancelled ? { opacity: 0.55 } : undefined}>
                          <td style={{ fontWeight: 'var(--weight-bold)' }}>{orderRef(order)}
                            {isExpressOrder(order) && !isDelivered && !isCancelled && (
                              <span className="gh-express-tag" title={expressLabel(order)}><Zap size={11} /> EXPRESS</span>
                            )}
                            <span className="at-phone-only" style={{ fontWeight: 'var(--weight-regular)', color: 'var(--text-secondary)' }}>· {order.customer_name}</span></td>
                          <td className="at-desk-only">{order.flow === 'alteration' ? 'Alteration' : order.flow === 'maggam' ? 'Maggam' : 'Stitching'}</td>
                          <td className="at-desk-only">{order.customer_name}</td>
                          <td data-label={t('ordersPage.estDelivery', 'Delivery')}>{order.estimated_delivery ? fmtDate(order.estimated_delivery) : '—'}</td>
                          <td data-label={t('ordersPage.whereItStands', 'Where it stands')}>
                            {bucket === 'done' && (
                              <div className="at-stage-strip">
                                <span className={`ui-badge ui-badge--${statusTone(order.order_status)}`}>{isDelivered ? 'Delivered' : 'Cancelled'}</span>
                                {deliveredOn && <span className="at-stage-strip-muted">{fmtDate(deliveredOn)}</span>}
                                <span className="at-stage-strip-muted">{inr(order.total_amount)}</span>
                              </div>
                            )}
                            {bucket === 'new' && (
                              <span className="ui-badge ui-badge--warning">{t('ordersPage.notSentYet', 'Not sent yet')}</span>
                            )}
                            {/* Where it stands: the step before (done), the step
                                it is on with who has it and for how long, the
                                step after. */}
                            {stage && (
                              <div className="at-stage-strip">
                                {stage.prev && (
                                  <span className="at-stage-strip-muted"><Check size={13} /> {stage.prev.stage_name}</span>
                                )}
                                <span className="at-stage-strip-now">
                                  {stage.prev && <span className="at-stage-strip-arrow" aria-hidden="true">→ </span>}
                                  <strong>{stage.current.stage_name}</strong>
                                  {(() => {
                                    const who = stageWho(stage.current);
                                    const since = sinceLabel(stage.current.started_at);
                                    return (who || since) ? (
                                      <span className="at-stage-strip-muted">
                                        {who && ` · ${who}`}{since && ` · ${t('ordersPage.since', 'since')} ${since}`}
                                      </span>
                                    ) : null;
                                  })()}
                                </span>
                                {stage.next && (
                                  <span className="at-stage-strip-muted"><span className="at-stage-strip-arrow" aria-hidden="true">→ </span>{stage.next.stage_name}</span>
                                )}
                                {late && <span className="ui-badge ui-badge--danger">{t('ordersPage.late', 'Late')}</span>}
                              </div>
                            )}
                          </td>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
                              {bucket === 'new' && (!currentUser?.role || ['Owner', 'Master'].includes(currentUser.role)) && (
                                <button type="button" className="btn-primary at-btn-sm" disabled={sendBusy}
                                        onClick={() => openSendToWorkshop(order)}>
                                  <Scissors size={12} /> {t('ordersPage.sendToWorkshop', 'Send to workshop')}
                                </button>
                              )}
                              {/* A delivered garment can come back: the same
                                  request form the order card and the customer
                                  profile open, one click from the row, for
                                  the roles that run the counter. */}
                              {isDelivered && order.flow !== 'alteration' && (!currentUser?.role || ['Owner', 'Master'].includes(currentUser.role)) && (
                                <button type="button" className="btn-secondary at-btn-sm"
                                        style={{ color: 'var(--accent-text)', borderColor: 'var(--accent-border)', background: 'var(--accent-color)' }}
                                        onClick={() => setOrdersAlterationOrder(order)}>
                                  <Scissors size={12} /> Alteration
                                </button>
                              )}
                              {/* An order being made is read in the Workshop room. */}
                              <button type="button" className="btn-secondary at-btn-sm"
                                      onClick={() => { if (bucket === 'workshop') setDashboardTab('workshop'); setOpenOrdersRowId(order.id); }}>
                                <Eye size={12} /> View
                              </button>
                            </div>
                          </td>
                        </tr>
                        </React.Fragment>
                        );
                      })}
                        </tbody>
                      </table>
                      </div>
                      );
                    })()}
                  </div>
                  )}
                </div>
              </>
            )}

            {/* 5. CUSTOMERS TAB */}
            {dashboardTab === 'customers' && editingCustomer && (
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
              <DeleteAllCustomersDialog total={customersList.length}
                                        onClose={() => setDeletingAllCustomers(false)}
                                        onDeleted={() => fetchDashboardAndConfig()} />
            )}
            {dashboardTab === 'customers' && !editingCustomer && !selectedDirectoryCustomer && customerAddMode === 'choose' && (
              <AddCustomerChooser onBack={() => setCustomerAddMode(null)} onManual={() => setCustomerAddMode('manual')}
                                  onImported={() => fetchDashboardAndConfig()} />
            )}
            {dashboardTab === 'customers' && !editingCustomer && !selectedDirectoryCustomer && customerAddMode === 'manual' && (
              <CustomerForm onBack={() => setCustomerAddMode('choose')}
                            onSaved={async () => { await fetchDashboardAndConfig(); setCustomerAddMode(null); }} />
            )}
            {dashboardTab === 'customers' && !editingCustomer && !selectedDirectoryCustomer && !customerAddMode && (
              <>
                <PageHeader
                  title={t('customersPage.title')}
                  subtitle={t('customersPage.subtitle')}
                  aside={(
                    <>
                      <SearchBox value={searchQuery} onChange={setSearchQuery} placeholder={t('customersPage.searchPlaceholder')} />
                      <div className="user-profile-widget">
                        <div className="user-avatar-circle">
                          <UserAvatar user={currentUser} />
                        </div>
                        <span>{t('dashboard.hiUser', `Hi, ${currentUserName}`, { name: currentUserName })}</span>
                      </div>
                    </>
                  )}
                  actions={canAddCustomer && (
                    <>
                      {customersList.length > 0 && (
                        <button type="button" className="btn-secondary at-btn-danger" style={{ padding: '10px 18px' }}
                                onClick={() => setDeletingAllCustomers(true)}>
                          <Trash2 size={16} /> Delete all
                        </button>
                      )}
                      <GuidedHighlight show={guideCustomers} text={customersList.length ? t('onboard.addCustomer', 'Start here') : t('onboard.addFirstCustomer', 'Add your first customer')}>
                        <button className="btn-primary" style={{ padding: '10px 18px' }} onClick={handleStartNewCustomer}>
                          <Plus size={16} /> Add Customer
                        </button>
                      </GuidedHighlight>
                    </>
                  )}
                />

                {(() => {
                  const now = new Date();
                  const thisMonth = customersList.filter(c => {
                    const d = new Date(c.created_at);
                    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
                  }).length;
                  const tiers = tierCounts(customersList);
                  const withOrders = customersList.filter(c => (c.order_count ?? c.orders?.length ?? 0) > 0).length;
                  return (
                    <>
                      <section className="at-stat-grid">
                        <StatCard icon={Users} tone="green" label="Total Customers" value={customersList.length}
                                  sub={t('customersPage.withOrdersCount', '{n} with orders', { n: withOrders })} />
                        <StatCard icon={Crown} tone="amber" label="Platinum customers" value={tiers.Platinum}
                                  sub={`${tiers.Gold} Gold · ${tiers.Silver} Silver`} />
                        <StatCard icon={CalendarDays} tone="violet" label="New This Month" value={thisMonth} sub="registered" />
                        <StatCard icon={ShoppingBag} tone="blue" label="With Orders" value={withOrders} sub="at least one order" />
                      </section>
                      <div className="at-toolbar">
                        <Chips value={customerTypeFilter} onChange={setCustomerTypeFilter} options={[
                          { key: 'All', label: t('customersPage.filterAll'), count: customersList.length },
                          ...TIERS.map(tier => ({ key: tier, label: t(`wizard.${tier.toLowerCase()}`, tier), count: tiers[tier] })),
                        ]} />
                        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                          {directoryCustomers.length
                            ? `Showing ${customerPageFrom + 1}–${customerPageFrom + pagedCustomers.length} of ${directoryCustomers.length}`
                            : 'Showing 0'}
                          {directoryCustomers.length !== customersList.length ? ` (${customersList.length} in total)` : ''}
                        </span>
                      </div>
                    </>
                  );
                })()}

                <div className="customers-list-container at-stack">
                  {loading && customersList.length === 0 ? (
                    <div className="ui-card" style={{ padding: '48px', textAlign: 'center' }}>
                      <span style={{ color: 'var(--text-muted)' }}>{t('common.loading')}</span>
                    </div>
                  ) : loadErrors.includes('customers') ? (
                    <div style={{ padding: '48px', textAlign: 'center', background: 'var(--danger-bg)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--danger-color)' }}>
                      <div style={{ color: 'var(--danger-color)', marginBottom: '12px' }}>Could not load the customer directory.</div>
                      <button type="button" className="btn-secondary" onClick={() => fetchDashboardAndConfig()}>Retry</button>
                    </div>
                  ) : directoryCustomers.length === 0 ? (
                    <div className="ui-card" style={{ padding: '48px', textAlign: 'center' }}>
                      {customersList.length === 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center' }}>
                          <div style={{ fontWeight: 'var(--weight-semibold)', color: 'var(--text-primary)' }}>{t('customersPage.noCustomersYet')}</div>
                          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', maxWidth: '44ch', lineHeight: 'var(--leading-normal)' }}>
                            Everyone you take an order for is kept here, with their measurements, past orders and preferences.
                          </div>
                          <button className="btn-primary" onClick={handleStartNewCustomer}>
                            {t('customersPage.addFirstCustomer')}
                          </button>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>{t('customersPage.noMatchingCustomers')}</span>
                      )}
                    </div>
                  ) : (
                    // One line per customer, the same roster table the Team
                    // page uses. Fixed column widths and single-line cells,
                    // so every row is the same two-line height and the
                    // columns line up down the page. A row opens the
                    // customer, as the card did.
                    <>
                    <div className="at-table-wrap">
                      <table className="at-table at-table--fit" style={{ tableLayout: 'fixed' }}>
                        <thead>
                          <tr>
                            <th style={{ width: canAddCustomer ? '27%' : '30%' }}>Customer</th>
                            <th style={{ width: canAddCustomer ? '24%' : '26%' }}>Body measurements</th>
                            <th style={{ width: canAddCustomer ? '13%' : '14%' }}>Style notes</th>
                            <th style={{ width: canAddCustomer ? '13%' : '15%' }}>Orders</th>
                            <th style={{ width: canAddCustomer ? '23%' : '15%' }}></th>
                          </tr>
                        </thead>
                        <tbody>
                    {pagedCustomers.map(cust => {
                      const m = cust.measurements;
                      const parts = m?.additional_measurements?.stitch_parts || [];
                      const visible = m ? getVisibleMeasurementFields(parts) : [];
                      const FIELDS = [['bust', 'Bust'], ['waist', 'Waist'], ['hips', 'Hips'], ['shoulder', 'Shoulder'],
                                      ['arm_length', 'Arm'], ['neck', 'Neck'], ['length', 'Length']];
                      // Only columns holding a number: a row of dashes says nothing.
                      const shown = FIELDS.filter(([k]) => visible.includes(k) && m?.[k]).slice(0, 4);
                      const tags = [
                        `${cust.garment_type || ''}${parts.length ? ` (${parts.join(', ')})` : ''}`.trim(),
                        cust.neckline_style && `Neck: ${cust.neckline_style}`,
                        cust.sleeve_style && `Sleeve: ${cust.sleeve_style}`,
                        cust.silhouette && `Silhouette: ${cust.silhouette}`,
                        cust.occasion && `${t('customersPage.occasion')} ${cust.occasion}`,
                      ].filter(Boolean);
                      const open = () => openDirectoryCustomer(cust);
                      const orders = cust.order_count ?? cust.orders?.length ?? 0;
                      const contact = [formatMobile(cust.mobile_number), cust.email_address, cust.city_region || cust.address].filter(Boolean);
                      // One line, cut with an ellipsis; the full text is the tooltip.
                      const line = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
                      const sub = { ...line, fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: '2px' };
                      const measure = (v) => (v === null || v === undefined || v === '' ? '—' : Number(v) || v);
                      return (
                        <tr
                          key={cust.id}
                          role="button"
                          tabIndex={0}
                          style={{ cursor: 'pointer' }}
                          onClick={open}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } }}
                        >
                          <td data-label="Customer" style={{ overflow: 'hidden' }}>
                            <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', minWidth: 0 }}>
                              <AvatarInitials name={`${cust.first_name} ${cust.last_name}`} size={36} />
                              <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                                  <span style={{ ...line, fontWeight: 'var(--weight-semibold)', color: 'var(--text-primary)' }}
                                        title={`${cust.first_name} ${cust.last_name}`}>
                                    {cust.first_name} {cust.last_name}
                                  </span>
                                  <span style={{ flexShrink: 0 }}><TierBadge tier={customerTier(cust)} /></span>
                                </div>
                                <div style={sub} title={contact.join(' · ')}>
                                  <Phone size={11} style={{ verticalAlign: '-1px', marginRight: '4px' }} />{contact.join(' · ')}
                                </div>
                              </div>
                            </div>
                          </td>

                          <td data-label="Body measurements" style={{ overflow: 'hidden' }}>
                            {m && shown.length > 0 ? (
                              <div style={{ ...line, fontVariantNumeric: 'tabular-nums' }}
                                   title={shown.map(([k, label]) => `${label} ${measure(m[k])}`).join(' · ')}>
                                {shown.map(([k, label], i) => (
                                  <span key={k}>
                                    {i > 0 && <span style={{ color: 'var(--border-color)', margin: '0 8px' }}>·</span>}
                                    <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>{label} </span>
                                    <strong>{measure(m[k])}</strong>
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }} title={t('customersPage.notRecorded', 'Not recorded')}>{t('customersPage.notRecorded', 'Not recorded')}</span>
                            )}
                          </td>

                          <td data-label="Style notes" style={{ overflow: 'hidden' }}>
                            <div className="at-tags" style={{ flexWrap: 'nowrap', overflow: 'hidden' }} title={tags.join(' · ')}>
                              {tags.map(tag => <span key={tag} className="at-tag" style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>{tag}</span>)}
                            </div>
                            {cust.custom_requirements && (
                              <div style={sub} title={cust.custom_requirements}>{cust.custom_requirements}</div>
                            )}
                          </td>

                          <td data-label="Orders" style={{ overflow: 'hidden' }}>
                            <div style={{ fontWeight: 700 }}>{orders}</div>
                            <div style={sub} title={`${inr(cust.total_spend)} spent · ${t('customersPage.registered')} ${fmtDate(cust.created_at)}`}>
                              {inr(cust.total_spend)} · {fmtDate(cust.created_at)}
                            </div>
                          </td>

                          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <button
                              type="button"
                              className="at-link"
                              style={{ fontSize: 'var(--text-xs)', color: 'var(--accent-text)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                              onClick={(e) => { e.stopPropagation(); setStyleNotesFor(cust); }}
                            >
                              <Sparkles size={12} /> {t('customersPage.viewStyleDna')}
                            </button>
                            {canAddCustomer && (
                              <span className="at-row-actions" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                                <button type="button" className="at-icon-btn" title="Edit customer" aria-label={`Edit ${cust.first_name} ${cust.last_name}`}
                                        disabled={customerActionId === cust.id} onClick={() => startEditCustomer(cust)}>
                                  <Edit2 size={15} />
                                </button>
                                <button type="button" className="at-icon-btn at-icon-btn--danger" title="Delete customer" aria-label={`Delete ${cust.first_name} ${cust.last_name}`}
                                        disabled={customerActionId === cust.id} onClick={() => handleDeleteCustomer(cust)}>
                                  <Trash2 size={15} />
                                </button>
                              </span>
                            )}
                            <ChevronRight size={16} style={{ color: 'var(--text-muted)', verticalAlign: 'middle', marginLeft: '6px' }} />
                          </td>
                        </tr>
                      );
                    })}
                        </tbody>
                      </table>
                    </div>
                    {directoryCustomers.length > CUSTOMER_PAGE_SIZES[0] && (
                      <Pager page={customerPageNow} pageCount={customerPageCount} pageSize={customerPageSize}
                             sizes={CUSTOMER_PAGE_SIZES} onPage={goToCustomerPage} onSize={setCustomerPageSize}
                             label="Customers per page" />
                    )}
                    </>
                  )}
                </div>
              </>
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
            {dashboardTab === 'customers' && selectedDirectoryCustomer && (() => {
              const c = selectedDirectoryCustomer;
              const isOwner = !currentUser?.role || currentUser.role === 'Owner';
              const parts = c.measurements?.additional_measurements?.stitch_parts || [];
              const visible = c.measurements ? getVisibleMeasurementFields(parts) : [];
              const FIELDS = [['bust', 'Bust'], ['waist', 'Waist'], ['hips', 'Hips'], ['shoulder', 'Shoulder'],
                              ['arm_length', 'Arm Length'], ['neck', 'Neck'], ['length', 'Length']];
              const shown = FIELDS.filter(([k]) => visible.includes(k));
              const orders = c.orders || [];
              const orderCount = c.order_count ?? orders.length;
              
              const goExisting = () => {
                
                startService('stitch', c);
                if (c.design_preferences?.length > 0) {
                  setDesignNotes(c.design_preferences[0].notes || '');
                }
              };
              const reorder = (order) => {
                
                startService('stitch', c);
                setQuotePrices({ packaging: order.packaging_handling, discount: order.discount || 0 });
              };
              const statusTone = (st) => st === 'Delivered' ? 'success' : st === 'Cancelled' ? 'neutral' : 'warning';
              return (
              <div className="customer-detail-view-container at-stack">
                <div className="at-toolbar" style={{ margin: 0 }}>
                  <button type="button" className="at-link" onClick={() => setSelectedDirectoryCustomer(null)}>
                    <ArrowLeft size={16} /> {t('customersPage.backToCustomers', 'Back to Customers')}
                  </button>
                  {isOwner && (
                    <div className="at-toolbar-right">
                      <button type="button" className="btn-secondary" disabled={customerActionId === c.id} onClick={() => startEditCustomer(c)}>
                        <Edit2 size={16} /> Edit
                      </button>
                      <button type="button" className="btn-secondary at-btn-danger" disabled={customerActionId === c.id} onClick={() => handleDeleteCustomer(c)}>
                        <Trash2 size={16} /> Delete
                      </button>
                      <button className="btn-secondary" style={{ color: 'var(--accent-text)', borderColor: 'var(--accent-border)', background: 'var(--surface-color)' }} onClick={goExisting}>
                        <Copy size={16} /> {t('customersPage.goExistingDesign', 'Go with Existing Design')}
                      </button>
                      <button className="btn-primary" onClick={() => handleSelectExistingCustomer(c)}>
                        <Sparkles size={16} /> {t('customersPage.newOrder', 'New order')}
                      </button>
                    </div>
                  )}
                </div>

                <div className="ui-card at-profile-head">
                  <div className="at-profile-id">
                    <AvatarInitials name={`${c.first_name} ${c.last_name}`} size={96} tone="rose" />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        <h2 className="at-page-title" style={{ fontSize: 'var(--text-2xl)' }}>{c.first_name} {c.last_name}</h2>
                        <TierBadge tier={customerTier(c)} />
                      </div>
                      {c.source && <div className="at-page-sub">{c.source}</div>}
                      <div className="at-contact" style={{ fontSize: 'var(--text-sm)', marginTop: '12px' }}>
                        <span><Phone size={14} /> {formatMobile(c.mobile_number)}</span>
                        {c.email_address && <span><Mail size={14} /> {c.email_address}</span>}
                        {(c.address || c.city_region) && (
                          <span><MapPin size={14} /> {[c.address, c.city_region].filter(Boolean).join(', ')}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="at-profile-stats">
                    <div className="at-profile-stat">
                      <IconTile icon={CalendarDays} tone="blue" size={36} iconSize={16} />
                      <div><div className="at-measure-label">{t('customersPage.customerSince', 'Customer since')}</div><div className="at-measure-value">{fmtDate(c.created_at)}</div></div>
                    </div>
                    <div className="at-profile-stat">
                      <IconTile icon={ShoppingBag} tone="amber" size={36} iconSize={16} />
                      <div><div className="at-measure-label">{t('customersPage.totalOrders', 'Total orders')}</div><div className="at-measure-value">{orderCount}</div></div>
                    </div>
                    <div className="at-profile-stat">
                      <IconTile icon={Heart} tone="rose" size={36} iconSize={16} />
                      <div><div className="at-measure-label">{t('customersPage.preference', 'Preference')}</div><div className="at-measure-value">{c.occasion || c.garment_type || '—'}</div></div>
                    </div>
                  </div>
                </div>

                <div className="responsive-profile-grid">
                  <div className="at-stack">
                    <SectionCard icon={Ruler} tone="amber" title={t('customersPage.measurementsTitle', 'Measurements')}
                                 subtitle={parts.length > 0 ? t('customersPage.stitchingParts', 'Stitching: {parts}', { parts: parts.join(', ') }) : undefined}>
                      {c.measurements ? (
                        <>
                          <div className="at-measure-cols">
                            {shown.map(([k, label]) => (
                              <div key={k} className="at-measure-row">
                                <span>{label}</span>
                                <strong>{c.measurements[k] ? `${c.measurements[k]} in` : '—'}</strong>
                              </div>
                            ))}
                            <div className="at-measure-row">
                              <span>{t('customersPage.occasionLabel', 'Occasion')}</span>
                              <strong>{c.occasion || '—'}</strong>
                            </div>
                          </div>
                          {c.measurement_history && c.measurement_history.length > 0 && (
                            <div style={{ marginTop: 'var(--space-4)' }}>
                              <div className="ui-eyebrow" style={{ color: 'var(--accent-text)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: 'var(--space-3)' }}>
                                <History size={13} /> {t('customersPage.sizingHistory', 'Measurement history')}
                              </div>
                              <div className="at-stack" style={{ gap: 'var(--space-2)', maxHeight: '300px', overflowY: 'auto', paddingRight: '4px' }}>
                                {[...c.measurement_history].reverse().map((hist, idx, arr) => (
                                  <div key={hist.id || idx} className="at-version">
                                    <div className="at-version-head">
                                      <strong style={{ color: 'var(--text-primary)' }}>Version {arr.length - idx}</strong>
                                      <span style={{ color: 'var(--text-secondary)' }}>{fmtDateTime(hist.changed_at)}</span>
                                    </div>
                                    <div className="at-version-grid">
                                      {FIELDS.filter(([k]) => visible.includes(k)).map(([k, label]) => (
                                        <span key={k}>{label.replace(' Length', '')} <strong>{hist[k] || '—'}</strong></span>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        <p style={{ color: 'var(--text-muted)', margin: 0 }}>No measurements saved yet.</p>
                      )}
                    </SectionCard>

                    <SectionCard icon={ShoppingBag} tone="amber" title={t('customersPage.orderHistory', 'Order History')}
                                 action={orders.length > 0 ? () => setDashboardTab('orders') : undefined} actionLabel="View All">
                      {directoryDetailLoading && !c.orders ? (
                        <Loader section label="Loading order history…" />
                      ) : orders.length === 0 ? (
                        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', margin: 0 }}>{t('customersPage.noOrdersYet', 'No orders yet.')}</p>
                      ) : orders.map(order => {
                        // The row opens the order's production progress, so
                        // "where is my dress?" is answered from the profile.
                        const isOpen = expandedCustomerOrderId === order.id;
                        const stages = order.stages || [];
                        const done = stages.filter(st => st.status === 'COMPLETED').length;
                        const current = stages.find(st => st.status === 'IN_PROGRESS');
                        const toggle = () => setExpandedCustomerOrderId(isOpen ? null : order.id);
                        return (
                          <div key={order.id} className={`at-order-row${isOpen ? ' at-order-row--open' : ''}`}>
                            <div
                              role="button"
                              tabIndex={0}
                              className="at-order-row-head"
                              onClick={toggle}
                              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } }}
                            >
                              <div className="at-thumb at-tile--amber">
                                {order.completed_garment_image ? <img src={order.completed_garment_image} alt="" /> : <Shirt size={18} />}
                              </div>
                              <div className="at-row-main">
                                <div className="at-row-title">Order {orderRef(order)}</div>
                                <div className="at-row-sub">
                                  {order.garment_label || orderGarmentLabel(order)} · {order.tailor_name || 'Tailor not assigned'}
                                  {stages.length > 0 ? ` · ${done}/${stages.length} stages${current ? ` · ${current.stage_name}` : ''}` : ''}
                                </div>
                              </div>
                              {order.order_status === 'Delivered' && currentUser?.role !== 'Designer' && (
                                <button type="button" className="btn-secondary at-btn-sm"
                                        onClick={(e) => { e.stopPropagation(); setAlterationOrder(order); }}>
                                  <Scissors size={12} /> Alteration
                                </button>
                              )}
                              <span className={`ui-badge ui-badge--${statusTone(order.order_status)}`}>{order.order_status}</span>
                              <span className="at-row-sub" style={{ whiteSpace: 'nowrap' }}>{fmtDate(order.order_date)}</span>
                              <strong className="at-num" style={{ color: 'var(--accent-text)' }}>{inr(order.total_amount)}</strong>
                              <ChevronRight size={16} style={{ transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', color: 'var(--text-muted)' }} />
                            </div>

                            {isOpen && (
                              <div className="at-order-row-body">
                                <StageTimeline
                                  stages={stages}
                                  onSelectStage={(stage) => openStageReview(order, stage)}
                                />
                                {stages.length > 0 && (
                                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '8px', marginTop: '12px' }}>
                                    {stages.map(stage => (
                                      <div key={stage.id || stage.stage_key} style={{ fontSize: 'var(--text-2xs)', padding: '8px 10px', borderRadius: 'var(--radius-sm)', background: 'var(--surface-2)', border: '1px solid var(--border-color)' }}>
                                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{stage.stage_name}{stage.garment_name ? ` · ${stage.garment_name}` : ''}</div>
                                        <div style={{ color: 'var(--text-muted)', marginTop: '2px' }}>
                                          {STEP_LABEL[STEP_STATE(stage.status)].toLowerCase()}
                                          {stage.assigned_to_name ? ` · ${stage.assigned_to_name}` : ''}
                                        </div>
                                        {stage.completed_at && <div style={{ color: 'var(--text-muted)' }}>{fmtDate(stage.completed_at)}</div>}
                                      </div>
                                    ))}
                                  </div>
                                )}
                                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: '12px' }}>
                                  <span>Payment: <strong style={{ color: 'var(--text-primary)' }}>{order.payment_status}</strong></span>
                                  <span>Delivery: <strong style={{ color: 'var(--text-primary)' }}>{order.delivery_method}</strong></span>
                                  {order.estimated_delivery && (
                                    <span>Expected: <strong style={{ color: 'var(--text-primary)' }}>{fmtDate(order.estimated_delivery)}</strong></span>
                                  )}
                                </div>
                                {isOwner && (
                                  <button type="button" className="btn-secondary at-btn-sm"
                                          style={{ marginTop: '12px', color: 'var(--accent-text)', borderColor: 'var(--accent-border)', background: 'var(--accent-color)' }}
                                          onClick={(e) => { e.stopPropagation(); reorder(order); }}>
                                    <Copy size={12} /> Reorder Style
                                  </button>
                                )}
                                {/* Renders only once the order is Delivered: the
                                    way to take a garment back for alteration. */}
                                <OrderAlterations
                                  order={order}
                                  customerId={c.id}
                                  currentUser={currentUser}
                                  onOpenAlteration={openAlteration}
                                  compact
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </SectionCard>
                    {alterationOrder && (
                      <RequestAlterationModal
                        order={alterationOrder}
                        customerId={c.id}
                        onClose={() => setAlterationOrder(null)}
                        onCreated={(created) => { setAlterationOrder(null); rememberAlteration(created); openAlteration(created.id); }}
                      />
                    )}
                  </div>

                  <div className="at-stack">
                    <StyleProfileCard customer={c} />

                    <SectionCard icon={ImageIcon} tone="green" title="Saved Designs & Inspiration">
                      {!c.design_preferences || c.design_preferences.length === 0 ? (
                        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', margin: 0 }}>No saved designs or reference images.</p>
                      ) : (
                        <div className="at-stack">
                          {c.design_preferences.map((pref, i) => (
                            <div key={pref.id || i} className="at-form-section" style={{ borderColor: pref.is_approved ? 'var(--success-color)' : undefined, gap: 'var(--space-3)' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                  <span className="ui-eyebrow">{pref.source_display || 'Boutique catalogue'}</span>
                                  {pref.is_approved && <span className="ui-badge ui-badge--success">Approved for production</span>}
                                </div>
                                {!pref.is_approved && pref.id && (
                                  <button type="button" className="btn-secondary at-btn-sm"
                                          disabled={approvingDesignId === pref.id}
                                          onClick={() => handleApproveDesign(pref.id, pref.reference_images?.[0])}>
                                    {approvingDesignId === pref.id ? 'Approving…' : 'Approve for production'}
                                  </button>
                                )}
                              </div>
                              {pref.notes && <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', margin: 0 }}>{pref.notes}</p>}
                              {pref.reference_images?.length > 0 && (
                                <div className="at-photos">
                                  {pref.reference_images.map((url, j) => (
                                    <span key={`${i}-${j}`} className="at-photo" style={{ width: 96, height: 120, borderColor: pref.approved_image === url ? 'var(--success-color)' : undefined, borderWidth: pref.approved_image === url ? 2 : 1 }}>
                                      <img src={url} alt="Design reference" />
                                    </span>
                                  ))}
                                </div>
                              )}
                              {pref.reference_links?.length > 0 && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                  {pref.reference_links.map((link, j) => (
                                    <a key={j} href={link} target="_blank" rel="noreferrer" className="at-link" style={{ fontSize: 'var(--text-xs)', overflowWrap: 'anywhere', whiteSpace: 'normal' }}>
                                      {link}
                                    </a>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </SectionCard>
                  </div>
                </div>
              </div>
              );
            })()}

            {/* 6. INVOICES TAB */}

            {dashboardTab === 'invoices' && (() => {
              const paidTotal = ordersList.reduce((sum, o) => sum + parseFloat(o.amount_paid || 0), 0);
              const pendingTotal = ordersList.reduce((sum, o) => sum + Math.max(0, parseFloat(o.total_amount || 0) - parseFloat(o.amount_paid || 0)), 0);
              const grandTotal = ordersList.reduce((sum, o) => sum + parseFloat(o.total_amount), 0);
              const paidCount = ordersList.filter(o => o.payment_status === 'Paid').length;
              const pendingCount = ordersList.length - paidCount;
              const filtered = ordersList.filter(order => {
                if (invoiceFilter === 'Paid' && order.payment_status !== 'Paid') return false;
                if (invoiceFilter === 'Pending' && order.payment_status === 'Paid') return false;
                if (invoiceSearch.trim()) {
                  const query = invoiceSearch.toLowerCase();
                  const matchesId = order.order_id.toLowerCase().includes(query)
                    || orderRef(order).toLowerCase().includes(query);
                  const matchesClient = (order.customer_name || '').toLowerCase().includes(query);
                  return matchesId || matchesClient;
                }
                return true;
              });
              const statusTone = (st) => st === 'Paid' ? 'success' : st === 'Partially Paid' ? 'warning' : 'danger';
              return (
              <>
                <PageHeader
                  title={t('invoicesPage.title', 'Invoices & Billing')}
                  subtitle={t('invoicesPage.subtitle', 'Manage invoices, verify billing payments, and print receipts.')}
                  aside={(
                    <div className="user-profile-widget">
                      <div className="user-avatar-circle">
                        <UserAvatar user={currentUser} />
                      </div>
                      <span>{t('dashboard.hiUser', `Hi, ${currentUserName}`, { name: currentUserName })}</span>
                    </div>
                  )}
                />

                <section className="at-stat-grid">
                  <StatCard icon={Banknote} tone="green" label={t('invoicesPage.totalCollectedRevenue', 'Total Collected Revenue')}
                            value={formatMoney(paidTotal)} sub={`${paidCount} settled in full`} />
                  <StatCard icon={Wallet} tone="amber" label={t('invoicesPage.outstandingBalance', 'Outstanding Balance')}
                            value={formatMoney(pendingTotal)} sub={`across ${pendingCount} invoice${pendingCount === 1 ? '' : 's'}`} />
                  <StatCard icon={Receipt} tone="blue" label={t('invoicesPage.totalInvoicedVolume', 'Total Invoiced Volume')}
                            value={formatMoney(grandTotal)} sub={`${ordersList.length} invoice${ordersList.length === 1 ? '' : 's'}`} />
                </section>

                <div className="at-toolbar">
                  <Chips value={invoiceFilter} onChange={setInvoiceFilter} options={[
                    { key: 'All', label: t('common.all', 'All'), count: ordersList.length },
                    { key: 'Paid', label: t('invoicesPage.paid', 'Paid'), count: paidCount },
                    { key: 'Pending', label: t('invoicesPage.pending', 'Pending'), count: pendingCount },
                  ]} />
                  <div className="at-toolbar-right">
                    <SearchBox value={invoiceSearch} onChange={setInvoiceSearch}
                               placeholder={t('invoicesPage.searchPlaceholder', 'Search Invoice ID or Client...')} />
                  </div>
                </div>

                {paymentError && (
                  <div role="alert" style={{ marginBottom: '16px', background: 'var(--danger-bg)', border: '1px solid var(--danger-color)', color: 'var(--danger-color)', borderRadius: 'var(--radius-md)', padding: '12px 14px', fontSize: 'var(--text-sm)', display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                    <span>{paymentError}</span>
                    <button type="button" onClick={() => setPaymentError(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontWeight: 700 }}>Dismiss</button>
                  </div>
                )}

                {/* Fixed column widths and one-line cells, so every row is the
                    same height and the money columns line up down the page;
                    below 1024px the rows stack into labelled cards. */}
                <div className="invoices-content at-table-wrap">
                  <table className="at-table at-table--fit" style={{ tableLayout: 'fixed' }}>
                    <thead>
                      <tr>
                        <th style={{ width: '7%' }}>{t('invoicesPage.invoiceId', 'Invoice ID')}</th>
                        <th style={{ width: '19%' }}>{t('invoicesPage.billingClient', 'Billing Client')}</th>
                        <th style={{ width: '11%' }}>{t('common.date', 'Date')}</th>
                        <th style={{ width: '10%', textAlign: 'right' }}>{t('invoicesPage.totalPrice', 'Total Price')}</th>
                        <th style={{ width: '20%' }}>{t('invoicesPage.totalPaid', 'Total Paid')}</th>
                        <th style={{ width: '10%', textAlign: 'right' }}>{t('invoicesPage.balanceDue', 'Balance Due')}</th>
                        <th style={{ width: '12%' }}>{t('common.status', 'Payment Status')}</th>
                        <th style={{ width: '11%', textAlign: 'right' }}>{t('common.actions', 'Action')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.length === 0 ? (
                        <tr>
                          <td colSpan="8" style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                            {ordersList.length === 0
                              ? t('invoicesPage.emptyState', 'Invoices appear here once you have created an order.')
                              : t('invoicesPage.noMatchingInvoices', 'No invoices matching the criteria.')}
                          </td>
                        </tr>
                      ) : filtered.map(order => {
                        const total = Number(order.total_amount) || 0;
                        const paid = Number(order.amount_paid || 0);
                        const balance = Math.max(0, total - paid);
                        const pct = total > 0 ? Math.round((paid / total) * 100) : 0;
                        return (
                          <tr key={order.id}>
                            <td data-label={t('invoicesPage.invoiceId', 'Invoice ID')} style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{orderRef(order)}</td>
                            <td data-label={t('invoicesPage.billingClient', 'Billing Client')} style={{ overflow: 'hidden' }}>
                              <span className="at-cell-person">
                                <AvatarInitials name={order.customer_name} size={32} />
                                <span style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={order.customer_name}>{order.customer_name}</span>
                              </span>
                            </td>
                            <td data-label={t('common.date', 'Date')} style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{fmtDate(order.order_date)}</td>
                            <td data-label={t('invoicesPage.totalPrice', 'Total Price')} className="at-num" style={{ fontWeight: 600, textAlign: 'right', whiteSpace: 'nowrap' }}>{formatMoney(order.total_amount)}</td>
                            {/* Editable: the one place a part payment is recorded. The
                                backend derives the label, clamps to the total and caps
                                the advance -- only the input lives here. */}
                            <td data-label={t('invoicesPage.totalPaid', 'Total Paid')}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', color: 'var(--success-color)', fontWeight: 600, height: '32px',
                                            border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', padding: '0 0 0 8px', background: 'var(--surface-color)', flex: '0 1 120px', minWidth: '90px' }}>
                                <span>₹</span>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  max={order.total_amount}
                                  inputMode="decimal"
                                  defaultValue={parseFloat(order.amount_paid || 0)}
                                  disabled={savingPaymentId === order.id}
                                  aria-label={`Amount paid for invoice ${orderRef(order)}`}
                                  onChange={(e) => { e.target.value = cleanAmount(e.target.value); }}
                                  onBlur={async (e) => {
                                    const next = parseFloat(e.target.value);
                                    const current = parseFloat(order.amount_paid || 0);
                                    // Blur fires on every tab-through; only write
                                    // when the number actually moved.
                                    if (isNaN(next) || next === current) {
                                      e.target.value = current;
                                      return;
                                    }
                                    const bad = amountError(next, { label: 'Amount paid', max: Number(order.total_amount) || LIMITS.amount });
                                    if (bad) { alert(bad); e.target.value = current; return; }
                                    setSavingPaymentId(order.id);
                                    try {
                                      await api.updateOrder(order.id, { amount_paid: next });
                                      await fetchDashboardAndConfig();
                                    } catch (err) {
                                      e.target.value = current;
                                      setPaymentError(`Could not record that payment for ${orderRef(order)} — ${err.message}`);
                                    } finally {
                                      setSavingPaymentId(null);
                                    }
                                  }}
                                  onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
                                  style={{ width: '100%', minWidth: 0, minHeight: 0, height: '30px', padding: '0 6px', fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--success-color)', border: 'none', borderRadius: 'var(--radius-sm)', background: 'transparent' }}
                                />
                              </div>
                                <span className="at-num" style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}
                                      title={Number(order.advance_paid) > 0 ? t('invoicesPage.ofWhichAdvance', '{amount} advance', { amount: formatMoney(order.advance_paid) }) : undefined}>
                                  <strong style={{ color: pct >= 100 ? 'var(--success-color)' : 'var(--text-primary)' }}>{pct}%</strong>
                                  {Number(order.advance_paid) > 0 && (
                                    <span style={{ color: 'var(--text-muted)' }}> · {t('invoicesPage.ofWhichAdvance', '{amount} advance', { amount: formatMoney(order.advance_paid) })}</span>
                                  )}
                                </span>
                              </div>
                              <div style={{ marginTop: '6px', maxWidth: '220px' }}><ProgressBar pct={pct} tone="green" /></div>
                            </td>
                            <td data-label={t('invoicesPage.balanceDue', 'Balance Due')} className="at-num" style={{ color: balance > 0 ? 'var(--danger-color)' : 'var(--text-secondary)', fontWeight: 600, textAlign: 'right', whiteSpace: 'nowrap' }}>
                              {formatMoney(balance)}
                            </td>
                            <td data-label={t('common.status', 'Payment Status')} style={{ overflow: 'hidden' }}>
                              {/* The select is the status: its value is the badge the
                                  ledger used to draw beside it, in the badge's colour. */}
                              <span className={`ui-badge ui-badge--${statusTone(order.payment_status)}`} style={{ display: 'inline-flex', padding: 0, maxWidth: '100%' }}>
                                <select
                                  value={order.payment_status}
                                  disabled={savingPaymentId === order.id}
                                  aria-label={`Payment status for invoice ${orderRef(order)}`}
                                  onChange={async (e) => {
                                    setSavingPaymentId(order.id);
                                    try {
                                      await api.updateOrder(order.id, { payment_status: e.target.value });
                                      fetchDashboardAndConfig();
                                    } catch (err) {
                                      e.target.value = order.payment_status;
                                      setPaymentError(`Could not update ${orderRef(order)} — ${err.message}`);
                                    } finally {
                                      setSavingPaymentId(null);
                                    }
                                  }}
                                  className="form-control"
                                  style={{ padding: '0 26px 0 10px', fontSize: '12px', fontWeight: 600, width: '100%', maxWidth: '150px', minWidth: '96px', margin: 0, minHeight: 0, height: '30px', color: 'inherit', border: 'none', borderRadius: '999px', background: 'transparent', cursor: 'pointer' }}
                                >
                                  {/* "Partially Paid" is a *derived* label, not a thing to
                                      choose; it appears only as the current value. */}
                                  <option value="Pending">{t('invoicesPage.pending', 'Pending')}</option>
                                  {order.payment_status === 'Partially Paid' && (
                                    <option value="Partially Paid">{t('invoicesPage.partiallyPaid', 'Partially Paid')}</option>
                                  )}
                                  <option value="Paid">{t('invoicesPage.paid', 'Paid')}</option>
                                </select>
                              </span>
                            </td>
                            <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                              <button className="btn-secondary at-btn-sm" title={t('invoicesPage.viewInvoice', 'View Invoice')} onClick={() => {
                                setConfirmedOrder(order);
                                setShowInvoiceModal(true);
                              }}>
                                <FileText size={12} /> {t('invoicesPage.viewInvoice', 'View Invoice')}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
              );
            })()}

            {/* 7. ANALYTICS TAB */}
            {dashboardTab === 'analytics' && (() => {
              // Same definition as the Invoices header and the Balance Due
              // cells: collected is money received, not the face value of
              // orders that happen to be labelled Paid.
              const paidRevenue = ordersList.reduce((sum, o) => sum + parseFloat(o.amount_paid || 0), 0);
              const totalBilling = ordersList.reduce((sum, o) => sum + parseFloat(o.total_amount || 0), 0);
              const pendingBill = Math.max(0, totalBilling - paidRevenue);
              const aov = ordersList.length > 0 ? (totalBilling / ordersList.length) : 0;

              // Counted per garment ordered, not per customer: the order wizard
              // writes neckline and sleeve onto the garment job, never onto the
              // customer, and a blouse-and-lehenga order is two garments.
              const garmentDist = {};
              const necklineDist = {};
              const sleeveDist = {};
              let garmentTotal = 0;
              const tally = (dist, value) => {
                if (value === undefined || value === null || value === '') return;
                const label = humaniseSpecKey(value);
                dist[label] = (dist[label] || 0) + 1;
              };
              ordersList.forEach(o => {
                orderGarmentNames(o).forEach(name => {
                  garmentDist[name] = (garmentDist[name] || 0) + 1;
                  garmentTotal += 1;
                });
                (o.garment_jobs || []).forEach(job => {
                  tally(necklineDist, job.spec?.front_neck);
                  tally(sleeveDist, job.spec?.sleeve_length);
                });
              });

              const topGarmentsList = Object.entries(garmentDist).sort((a, b) => b[1] - a[1]).slice(0, 4);
              const topNecklinesList = Object.entries(necklineDist).sort((a, b) => b[1] - a[1]).slice(0, 4);
              const topSleevesList = Object.entries(sleeveDist).sort((a, b) => b[1] - a[1]).slice(0, 4);

              const busyTailors = tailors.filter(t => t.status === 'Busy').length;

              const segments = (() => {
                const total = customersList.length || 1;
                const counts = tierCounts(customersList);
                const colors = { Platinum: 'var(--primary-color)', Gold: 'var(--warning-color)', Silver: 'var(--border-strong)' };
                const rows = TIERS.map(tier => ({
                  name: t(`wizard.${tier.toLowerCase()}`, tier), count: counts[tier], color: colors[tier],
                })).map(r => ({ ...r, pct: Math.round((r.count / total) * 100) }));
                let acc = 0;
                const stops = rows.map(r => { const from = acc; acc += (r.count / total) * 100; return `${r.color} ${from}% ${acc}%`; });
                return { rows, gradient: `conic-gradient(${stops.join(', ')}${acc < 100 ? `, var(--surface-inset) ${acc}% 100%` : ''})` };
              })();

              const bar = (label, count, total, tone) => {
                const pct = Math.round((count / (total || 1)) * 100) || 0;
                return (
                  <div key={label} className="at-bar-row">
                    <div className="at-bar-head">
                      <span>{label}</span>
                      <span className="at-num" style={{ fontWeight: 600 }}>{count} ({pct}%)</span>
                    </div>
                    <ProgressBar pct={pct} tone={tone} />
                  </div>
                );
              };

              return (
                <>
                  <PageHeader
                    title={t('analyticsPage.title', 'Business Analytics & Trends')}
                    subtitle={t('analyticsPage.subtitle', 'Summary of revenues, style preferences, and operations workload.')}
                    aside={(
                      <div className="user-profile-widget">
                        <div className="user-avatar-circle">
                          <UserAvatar user={currentUser} />
                        </div>
                        <span>{t('dashboard.hiUser', `Hi, ${currentUserName}`, { name: currentUserName })}</span>
                      </div>
                    )}
                  />

                  <section className="at-stat-grid" style={{ marginBottom: 'var(--space-5)' }}>
                    <StatCard icon={Coins} tone="green" label={t('analyticsPage.collectedRevenue', 'Collected Revenue')}
                              value={inr(paidRevenue)} sub={t('analyticsPage.fromPaidOrders', 'From paid customer orders')} />
                    <StatCard icon={Receipt} tone="amber" label={t('analyticsPage.pendingInvoices', 'Pending Invoices')}
                              value={inr(pendingBill)} sub={t('analyticsPage.awaitingPayment', 'Awaiting full or partial payment')} />
                    <StatCard icon={BarChart2} tone="blue" label={t('analyticsPage.avgTicketSize', 'Average Ticket Size')}
                              value={inr(aov)} sub={t('analyticsPage.perBespokeOrder', 'Per bespoke order')} />
                    <StatCard icon={Users} tone="violet" label={t('analyticsPage.clientBase', 'Client Base')}
                              value={`${customersList.length} ${customersList.length === 1 ? t('analyticsPage.clientSingle', 'Client') : t('analyticsPage.clientPlural', 'Clients')}`}
                              sub={t('analyticsPage.totalDirectoryProfiles', 'Total boutique directory profiles')} />
                  </section>

                  <div className="at-grid-2">
                    <div className="at-stack">
                      <SectionCard icon={Shirt} tone="green" title={t('analyticsPage.popularGarmentTypes', 'Popular Garment Types')}
                                   subtitle="Most ordered garment categories" action={() => setDashboardTab('orders')}>
                        {topGarmentsList.length === 0 ? (
                          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>No garments ordered yet.</div>
                        ) : (
                          <div className="at-stack" style={{ gap: 'var(--space-3)' }}>
                            {topGarmentsList.map(([garment, count]) => bar(garment, count, garmentTotal, 'forest'))}
                          </div>
                        )}
                      </SectionCard>

                      <SectionCard icon={Users} tone="violet" title={t('analyticsPage.customerSegmentation', 'Customer Segmentation')}
                                   subtitle="Customers grouped by how much they spend" action={() => setDashboardTab('customers')}>
                        <div style={{ display: 'flex', gap: 'var(--space-6)', alignItems: 'center', flexWrap: 'wrap' }}>
                          <div className="at-donut" style={{ background: segments.gradient }}>
                            <div className="at-donut-label">
                              <span className="at-donut-value">{customersList.length}</span>
                              <span className="at-donut-sub">Customers</span>
                            </div>
                          </div>
                          <div className="at-legend">
                            {segments.rows.map(seg => (
                              <div key={seg.name} className="at-legend-row">
                                <span className="at-legend-dot" style={{ background: seg.color }} />
                                <span style={{ flex: 1 }}>{seg.name}</span>
                                <span className="at-num" style={{ fontWeight: 600 }}>{seg.count} ({seg.pct}%)</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </SectionCard>

                      <SectionCard icon={PenTool} tone="amber" title={t('analyticsPage.necklineSleeveTrends', 'Neckline & Sleeve Trends')}
                                   subtitle="What is being asked for at the counter">
                        <div className="mobile-stack-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                          <div>
                            <div className="ui-eyebrow" style={{ marginBottom: '8px' }}>{t('analyticsPage.topNecklines', 'Top Necklines')}</div>
                            {topNecklinesList.length === 0 && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>None recorded yet.</div>}
                            {topNecklinesList.map(([style, count]) => (
                              <div key={style} style={{ fontSize: 'var(--text-sm)', display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                                <span>{style}</span>
                                <span className="at-num" style={{ fontWeight: 600 }}>{count}</span>
                              </div>
                            ))}
                          </div>
                          <div>
                            <div className="ui-eyebrow" style={{ marginBottom: '8px' }}>{t('analyticsPage.topSleeves', 'Top Sleeves')}</div>
                            {topSleevesList.length === 0 && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>None recorded yet.</div>}
                            {topSleevesList.map(([style, count]) => (
                              <div key={style} style={{ fontSize: 'var(--text-sm)', display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                                <span>{style}</span>
                                <span className="at-num" style={{ fontWeight: 600 }}>{count}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </SectionCard>
                    </div>

                    <div className="at-stack">
                      <SectionCard icon={Scissors} tone="blue" title={t('analyticsPage.staffWorkloadOverview', 'Staff & Workload Overview')}
                                   subtitle="Who is working, and who is free" action={() => setDashboardTab('staff')} actionLabel="Manage team">
                        <div className="wl-tiles" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 'var(--space-3)' }}>
                          <div className="at-pipeline-tile at-stat--blue" style={{ cursor: 'default' }}>
                            <span className="at-pipeline-label ui-eyebrow">{t('analyticsPage.totalTailoringTeam', 'Total Tailoring Team')}</span>
                            <span className="at-pipeline-value">{tailors.length}</span>
                          </div>
                          <div className="at-pipeline-tile at-stat--amber" style={{ cursor: 'default' }}>
                            <span className="at-pipeline-label ui-eyebrow">{t('analyticsPage.busyAssignedTailors', 'Busy / Assigned Tailors')}</span>
                            <span className="at-pipeline-value" style={{ color: 'var(--tone-amber-fg)' }}>{busyTailors}</span>
                          </div>
                          <div className="at-pipeline-tile at-stat--green" style={{ cursor: 'default' }}>
                            <span className="at-pipeline-label ui-eyebrow">{t('analyticsPage.availableStaffCapacity', 'Available Staff capacity')}</span>
                            <span className="at-pipeline-value" style={{ color: 'var(--tone-green-fg)' }}>{tailors.length - busyTailors}</span>
                          </div>
                        </div>
                      </SectionCard>

                      <SectionCard icon={FileText} tone="green" title={t('analyticsPage.orderStatusBreakdown', 'Order Status Breakdown')}
                                   subtitle="Current order distribution" action={() => setDashboardTab('orders')}>
                        <div className="at-stack" style={{ gap: 'var(--space-3)' }}>
                          {Object.entries(dashboardData?.stats?.status_distribution || {})
                            .sort((a, b) => b[1] - a[1])
                            .map(([status, count]) => bar(t(`status.${status}`, status), count, ordersList.length, 'forest'))}
                        </div>
                      </SectionCard>
                    </div>
                  </div>
                </>
              );
            })()}

            {/* 8. MY ACCOUNT SETTINGS TAB */}
            {dashboardTab === 'account' && (() => {
              const isOwner = !currentUser?.role || currentUser.role === 'Owner';
              const tenant = localStorage.getItem('tenant_id') || '--';
              const copyText = (text) => navigator.clipboard?.writeText(text);
              return (
              <>
                <PageHeader
                  title={t('accountPage.title')}
                  subtitle={t('accountPage.subtitle')}
                  aside={(
                    <div className="user-profile-widget">
                      <div className="user-avatar-circle">
                        <UserAvatar user={currentUser} />
                      </div>
                      <span>{t('dashboard.hiUser', `Hi, ${currentUserName}`, { name: currentUserName })}</span>
                    </div>
                  )}
                />

                <div className="account-settings-container at-account">
                  <div className="ui-card at-account-card">
                    <div className="at-cover" />
                    <div className="at-account-avatar">
                      <div className="at-account-avatar-ring">
                        <UserAvatar user={currentUser} />
                      </div>
                      {/* Editable by any signed-in user -- the photo is stored
                          per-user (UserAvatar), so the owner can set theirs too. */}
                      <label className="at-account-camera" title="Change photo">
                        <Camera size={16} />
                        <input type="file" accept="image/*" capture="environment" hidden
                               onChange={async (e) => {
                                 const f = e.target.files?.[0];
                                 if (!f) return;
                                 const bad = imageFilesError([f]);
                                 if (bad) { alert(bad); return; }
                                 try {
                                   const updated = await api.updateMyPhoto(f);
                                   setCurrentUser(updated);
                                 } catch (err) {
                                   alert(err.message || 'Could not update your photo.');
                                 }
                               }} />
                      </label>
                    </div>
                    <h3 className="at-account-name">{currentUser.first_name} {currentUser.last_name}</h3>
                    {/* The signed-in role, not a hardcoded claim. */}
                    <span className="ui-badge ui-badge--neutral">{currentUser.role || 'Boutique Owner'}</span>

                    <div className="at-account-rows">
                      <div className="at-account-row">
                        <Globe size={16} />
                        <div>
                          <div className="at-measure-label">{t('accountPage.tenantDomain', 'Tenant Domain')}</div>
                          <div className="at-measure-value" style={{ overflowWrap: 'anywhere' }}>{tenant}</div>
                        </div>
                        {tenant !== '--' && (
                          <button type="button" className="at-modal-close" style={{ width: 30, height: 30 }} onClick={() => copyText(tenant)} aria-label="Copy tenant domain">
                            <Copy size={13} />
                          </button>
                        )}
                      </div>
                      <div className="at-account-row">
                        <Mail size={16} />
                        <div>
                          <div className="at-measure-label">{t('accountPage.atelierEmail', 'Atelier Email')}</div>
                          <div className="at-measure-value" style={{ overflowWrap: 'anywhere' }}>{currentUser.email}</div>
                        </div>
                        {currentUser.email && (
                          <button type="button" className="at-modal-close" style={{ width: 30, height: 30 }} onClick={() => copyText(currentUser.email)} aria-label="Copy email">
                            <Copy size={13} />
                          </button>
                        )}
                      </div>
                      <div className="at-account-row">
                        <ShieldCheck size={16} />
                        <div>
                          <div className="at-measure-label">Role</div>
                          <div className="at-measure-value">{currentUser.role || 'Owner'}</div>
                        </div>
                      </div>
                      {/* No "Member since": nothing in the API carries the
                          tenant's created_on, and an absent fact beats a
                          confident wrong one. */}
                    </div>
                  </div>

                  {/* Owner only: submitting POSTs /boutique-settings/, which
                      RolePermission refuses for every other role. A form that
                      cannot succeed should not be drawn. */}
                  {isOwner && (
                    <SectionCard icon={Store} tone="green" title={t('accountPage.editProfile', 'Edit Boutique Profile')}
                                 subtitle="Keep your boutique information up to date. This will be visible across the platform.">
                      <form
                        ref={boutiqueFormRef}
                        className="at-stack"
                        onReset={() => setLogoFile(null)}
                        onSubmit={async (e) => {
                          e.preventDefault();
                          if (settingsSaving) return;
                          const bad = boutiqueFormError(e.target);
                          if (bad) { alert(bad); return; }
                          setSettingsSaving(true);
                          try {
                            await saveBoutiqueForm(e.target);
                            alert("Boutique settings updated successfully!");
                          } catch (err) {
                            console.error(err);
                            alert("Failed to update boutique settings");
                          } finally {
                            setSettingsSaving(false);
                          }
                        }}
                      >
                        <Field label={t('accountPage.boutiqueName', 'Boutique Name')} required icon={Building2}>
                          <input type="text" name="boutiqueName" className="form-control" maxLength={LIMITS.name}
                                 defaultValue={boutiqueSettings?.name || ''} placeholder="e.g. Aditi's Atelier" required />
                        </Field>
                        <Field label={t('accountPage.boutiqueAddress', 'Boutique Address')} required icon={MapPin}>
                          <textarea name="boutiqueAddress" className="form-control" rows={3} maxLength={LIMITS.address}
                                    defaultValue={boutiqueSettings?.address || ''} placeholder="Street, area, city, PIN" required />
                        </Field>
                        <div className="at-form-grid">
                          <Field label={t('accountPage.boutiquePhone', 'Boutique Phone')} required icon={Phone}>
                            {/* The store phone printed on invoices: often a landline, so no mobile rule. */}
                            <input type="text" name="boutiquePhone" className="form-control" inputMode="tel" maxLength={50}
                                   defaultValue={boutiqueSettings?.phone || ''} placeholder="044-2345 6789" required />
                          </Field>
                          <Field label={t('accountPage.boutiqueEmail', 'Boutique Email')} required icon={Mail}>
                            <input type="email" name="boutiqueEmail" className="form-control" maxLength={LIMITS.email}
                                   defaultValue={boutiqueSettings?.email || ''} placeholder="you@yourboutique.com" required
                                   onBlur={(e) => { e.target.value = cleanEmail(e.target.value); }} />
                          </Field>
                        </div>

                        <div className="at-field">
                          <span className="at-field-label">{t('accountPage.boutiqueLogo', 'Boutique Logo')}</span>
                          <div className="at-side-by-side">
                            {(logoFile || boutiqueSettings?.logo) ? (
                              <div className="at-form-section" style={{ flexDirection: 'row', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                                <img src={logoFile ? URL.createObjectURL(logoFile) : boutiqueSettings.logo} alt="Boutique logo"
                                     style={{ width: 56, height: 56, objectFit: 'contain', borderRadius: '8px', background: 'var(--surface-inset)', border: '1px solid var(--border-color)' }} />
                                <div className="at-row-main">
                                  <div className="at-row-title">{logoFile ? logoFile.name : 'Current logo'}</div>
                                  <div className="at-row-sub">{logoFile ? 'Saved with the next autosave or Save Changes.' : 'Choose a file to replace it.'}</div>
                                </div>
                                <button type="button" className="btn-secondary at-btn-sm" onClick={() => document.getElementById('boutique-logo-file').click()}>
                                  <Upload size={14} /> Choose file
                                </button>
                                {logoFile && (
                                  <button type="button" className="btn-secondary at-btn-sm" onClick={() => setLogoFile(null)}>Remove</button>
                                )}
                                <input id="boutique-logo-file" type="file" accept="image/*" hidden
                                       onChange={(e) => pickLogo(e.target.files?.[0] || null)} />
                              </div>
                            ) : (
                              <Dropzone camera
                                        title="Drag & drop your logo here" subtitle="or choose a file from your device"
                                        chooseLabel="Choose file"
                                        onFiles={(files) => pickLogo(files[0] || null)} />
                            )}
                            <InfoNote tone="green" icon={ShieldCheck} title="Logo Guidelines"
                                      items={['Recommended size: 512 × 512 px', 'Formats: PNG, JPG (Max 2MB)', 'Square image works best', 'This logo will appear on invoices and customer communication.']} />
                          </div>
                        </div>

                        {/* Off by default: a small team is usually the owner and
                            one or two designers, and a queue with nobody to clear
                            it is friction with no benefit. */}
                        <label className="at-switch-row">
                          <IconTile icon={Settings} tone="neutral" size={36} iconSize={16} />
                          <span className="at-row-main">
                            <span className="at-row-title">{t('accountPage.requireApproval', 'Require approval for new designs')}</span>
                            <span className="at-row-sub" style={{ display: 'block' }}>
                              {t('accountPage.approvalHelp', 'When on, uploads from staff other than you wait for your review before appearing in the library.')}
                            </span>
                          </span>
                          <span className="at-switch">
                            <input type="checkbox" name="designApprovalRequired" defaultChecked={!!boutiqueSettings?.design_approval_required} />
                            <i />
                          </span>
                        </label>

                        <div className="at-form-foot">
                          <button type="reset" className="btn-secondary">{t('common.cancel', 'Cancel')}</button>
                          <button type="submit" className="btn-primary" disabled={settingsSaving}>
                            <Save size={16} /> {settingsSaving ? t('common.saving', 'Saving…') : t('accountPage.saveChanges', 'Save Changes')}
                          </button>
                          <span style={{ fontSize: '12px', color: 'var(--text-muted)', alignSelf: 'center' }}>
                            {boutiqueAutosave.saving ? t('common.saving', 'Saving…')
                              : boutiqueAutosave.lastSavedAt
                                ? `Autosaved ${boutiqueAutosave.lastSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                                : 'Autosaves every minute while you edit'}
                          </span>
                        </div>
                      </form>
                    </SectionCard>
                  )}
                </div>
              </>
              );
            })()}

            {/* 9. SETTINGS TAB */}
            {dashboardTab === 'settings' && (
              <SettingsPage
                currentUser={currentUser}
                boutiqueSettings={boutiqueSettings}
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
                      <select className="form-control" required disabled={!!editingAppointment}
                              value={appointmentForm.customer}
                              onChange={(e) => setAppointmentForm({ ...appointmentForm, customer: e.target.value })}>
                        <option value="">Select a client</option>
                        {allCustomers.map(c => (
                          <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>
                        ))}
                      </select>
                    )}
                  </div>
                  <div>
                    <label className="form-label">Type</label>
                    <select className="form-control"
                            value={appointmentForm.appointment_type}
                            onChange={(e) => setAppointmentForm({
                              ...appointmentForm,
                              appointment_type: e.target.value,
                              // Moving off Other drops what was typed, so a
                              // standard booking cannot be saved carrying a
                              // stale label nothing will ever show.
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
              renders, so from anywhere else every tab was inert. */}
          <BottomNavigation
            tabs={[
              ...navSections.flatMap((s) => s.items).filter((i) => i.phone)
                .map((i) => ({ key: i.tab, label: i.phoneLabel || i.label, icon: i.icon })),
              { key: 'more', label: t('nav.menu', 'Menu'), icon: Menu }
            ]}
            activeTab={dashboardTab}
            onChangeTab={(tab) => { setDashboardTab(tab); setSelectedDirectoryCustomer(null); setEditingCustomer(null); }}
            onOpenMore={() => setMobileNavOpen(true)}
          />
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
            title="New Order"
            currentUser={currentUser}
            notificationsCount={notifications.filter(n => !n.is_read).length}
            onOpenMenu={() => setMobileNavOpen(!mobileNavOpen)}
            onOpenNotifications={() => {
              setShowNotificationsDrawer(true);
              if (markingNotificationsRead) return;
              setMarkingNotificationsRead(true);
              api.markNotificationsAsRead(currentUser?.role || 'Owner', currentUser?.email)
                .then(() => fetchNotifications())
                    // Never let the bell take the app down: a refused or failed
                    // mark-read is not worth losing the session over.
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
                sections={navSections}
                activeTab={dashboardTab}
                collapsed={navCollapsed && !mobileNavOpen}
                onPick={(tab) => { setView('dashboard'); setDashboardTab(tab); setSelectedDirectoryCustomer(null); setCustomerAddMode(null); setMobileNavOpen(false); }}
              />
              <NavItem icon={LogOut} label={t('nav.logout')} collapsed={navCollapsed && !mobileNavOpen}
                       onClick={() => { setShowLogoutConfirm(true); setMobileNavOpen(false); }} />
            </nav>
          </aside>

          <main className="portal-main">
            <div className="selector-container">
              <div className="selector-header">
                <h1 className="selector-title" style={{ fontFamily: 'var(--font-serif)', fontSize: '32px' }}>{t('entry.newOrderTitle', 'New order')}</h1>
                <p className="selector-subtitle" style={{ color: 'var(--text-secondary)' }}>{t('entry.serviceQuestion', 'What are we doing for this customer today?')}</p>
              </div>

              {/* Orders already being written. Offered, never resumed
                  silently: picking one up is a decision, and so is throwing it
                  away. Shows enough to tell two apart -- who it is for, what is
                  on it, how far it got and when it was last touched. */}
              {resumableDrafts.length > 0 && (
                <div className="content-card" style={{ marginBottom: '20px' }}>
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

              {/* The first question. Three doors, one wizard behind them. */}
              <div className="wz-services">
                <button type="button" className="wz-service" onClick={() => startService('stitch')}>
                  <IconTile icon={Scissors} tone="green" size={48} iconSize={22} />
                  <span className="wz-service-title">{t('entry.serviceStitch', 'Stitch something')}</span>
                  <span className="wz-service-desc">{t('entry.serviceStitchDesc', 'A blouse, saree work, a lehenga. The look comes from our catalogue or the customer\u2019s own photos.')}</span>
                </button>
                <button type="button" className="wz-service" onClick={() => startService('alter')}
                        disabled={currentUser?.role === 'Designer'}
                        title={currentUser?.role === 'Designer' ? t('entry.serviceAlterNotYou', 'Alterations are raised at the counter.') : undefined}>
                  <IconTile icon={Ruler} tone="amber" size={48} iconSize={22} />
                  <span className="wz-service-title">{t('entry.serviceAlter', 'Alter a garment')}</span>
                  <span className="wz-service-desc">{t('entry.serviceAlterDesc', 'Fix or adjust a garment we made and delivered.')}</span>
                </button>
                <button type="button" className="wz-service" onClick={() => startService('design')}>
                  <IconTile icon={PenTool} tone="neutral" size={48} iconSize={22} />
                  <span className="wz-service-title">{t('entry.serviceDesign', 'Design something new')}</span>
                  <span className="wz-service-desc">{t('entry.serviceDesignDesc', 'Our designer draws it for the customer, then we stitch it.')}</span>
                </button>
              </div>
            </div>
          </main>
        </div>
      )}

      {/* 6. THE ORDER WIZARD: who, what, (designer), measurements, money.
          Every screen is one question a counter can answer with the customer
          standing there; everything the workroom decides later stays out. */}
      {view === 'wizard' && (
        <div className="wizard-outer-wrapper" style={{ display: 'flex', flexDirection: 'column', width: '100%', minHeight: '100vh', backgroundColor: 'var(--bg-color)' }}>
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
                const canJump = !skipped && stepNum !== currentStep && stepNum <= maxStepReached;
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
                        {skipped ? t('wizard.notNeeded', 'Not needed') : isCompleted ? t('wizard.completed', 'Done') : t(`wizard.stepSub.${step.key}`, step.sub)}
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

          <div className="main-content" style={{ padding: '40px 24px 100px', maxWidth: '1280px', margin: '0 auto', width: '100%' }}>
            <div className="workspace-panel">

            {/* WHO: the mobile number finds a customer the boutique already
                knows; a new one needs a name. Everything else about them is
                optional and folded away. */}
            {wizardStepKey === 'who' && (
              <>
                <div className="page-title-group">
                  <h1 className="page-title">{t('wizard.whoTitle', 'Who is this for?')}</h1>
                  <p className="page-subtitle">
                    {serviceType === 'alter'
                      ? t('wizard.whoAlterSubtitle', 'Type the mobile number to find the customer. Alterations are for garments we made.')
                      : t('wizard.whoSubtitle', 'Type the mobile number. A customer we know comes up as you type; a new one just needs a name.')}
                  </p>
                </div>

                <div className="content-card wz-card">
                  <div className="form-group">
                    <label className="form-label" htmlFor="wz-mobile">{t('wizard.mobileNumber', 'Mobile Number')} <span className="required">*</span></label>
                    <div className="input-wrapper">
                      <span className="input-icon-left" style={{ fontSize: '14px', left: '12px' }}>🇮🇳 +91</span>
                      <input id="wz-mobile" type="tel" inputMode="numeric" autoFocus
                             value={customerForm.mobile_number}
                             onChange={(e) => { const digits = cleanMobile(e.target.value); setCustomerForm({ ...customerForm, mobile_number: digits }); if (customerId) clearPickedCustomer(digits); }}
                             style={{ paddingLeft: '65px' }} placeholder="98765 43210" />
                    </div>
                  </div>

                  {/* Gender is kept on the customer's record; the garments were
                      chosen before we got here, so it filters nothing now.
                      Alterations skip it -- their garments come from past orders. */}
                  {serviceType !== 'alter' && (
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

                  {customerId ? (
                    <div className="wz-known">
                      <AvatarInitials name={`${customerForm.first_name} ${customerForm.last_name}`} size={40} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div className="wz-known-name">{customerForm.first_name} {customerForm.last_name} <TierBadge tier={customerTier(customerForm)} /></div>
                        <div className="od-hint">{formatMobile(customerForm.mobile_number)}{customerForm.city_region ? ` · ${customerForm.city_region}` : ''} · {t('wizard.knownCustomer', 'a customer we know')}</div>
                      </div>
                      <button type="button" className="btn-secondary at-btn-sm" onClick={() => clearPickedCustomer(customerForm.mobile_number)}>
                        {t('wizard.notThem', 'Not them')}
                      </button>
                    </div>
                  ) : (
                    <>
                      {customerMatches.length > 0 && (
                        <div className="wz-matches" role="listbox" aria-label={t('wizard.matches', 'Customers matching this number')}>
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
                      )}
                      {serviceType === 'alter' ? (
                        customerForm.mobile_number.replace(/\D/g, '').length >= 4 && customerMatches.length === 0 && (
                          <p className="od-hint" style={{ marginTop: '8px' }}>
                            {t('wizard.noCustomerForAlter', 'No customer with this number. Alterations can only be raised on a garment we made, so the customer must already be in your book.')}
                          </p>
                        )
                      ) : (
                        <div className="form-group" style={{ marginTop: '14px' }}>
                          <label className="form-label" htmlFor="wz-name">{t('wizard.customerName', 'Customer Name')} <span className="required">*</span></label>
                          <input id="wz-name" type="text" className="form-control" value={customerName}
                                 maxLength={LIMITS.name}
                                 onChange={(e) => setCustomerNameSplit(cleanName(e.target.value))}
                                 placeholder={t('wizard.namePlaceholder', 'e.g. Amara Singh')} />
                        </div>
                      )}
                    </>
                  )}

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
                            <option value="Silver">{t('wizard.silver', 'Silver')}</option>
                            <option value="Gold">{t('wizard.gold', 'Gold')}</option>
                            <option value="Platinum">{t('wizard.platinum', 'Platinum')}</option>
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
              </>
            )}

            {/* TYPE: the garments, and for each one only what its cut needs. */}
            {wizardStepKey === 'type' && (
              <>
                <div className="page-title-group">
                  <h1 className="page-title">{t('wizard.typeTitle', 'What are we making?')}</h1>
                  <p className="page-subtitle">{t('wizard.typeSubtitle', 'Add each garment and answer only what it asks.')}</p>
                </div>

                <div className="content-card wz-card">
                  {/* Picks the first garment only. Once one is on the order the
                      next is added from the prompt under the last section, so
                      garments are filled in one after another, not all at once. */}
                  {garmentJobs.length === 0 && <DressesDropdown
                    title={t('wizard.dressesInOrder', 'Dresses in this Order')}
                    subtitle={t('wizard.dressesSubtitle', 'Pick every garment being made.')}
                    garmentTemplates={garmentsForGender(garmentTemplates, customerForm.gender)}
                    garmentJobs={garmentJobs}
                    addingGarmentKey={addingGarmentKey}
                    garmentTemplatesError={garmentTemplatesError}
                    loadGarmentTemplates={loadGarmentTemplates}
                    addGarment={addGarment}
                    removeGarment={removeGarment}
                  />}

                  {garmentJobs.length > 1 && (() => {
                    // Filled in: every required question this step asks is
                    // answered -- the same check Next runs -- and at least one
                    // answered by hand. A garment with no required question (a
                    // petticoat) is valid the moment it is added, and must not
                    // read Done before anyone has answered anything on it. Only
                    // the template's current fields count, so an answer a draft
                    // kept for a question since removed (hand work on a
                    // petticoat) does not.
                    const filled = (job) => Object.keys(validateSpec(job.template, job.values, { sections: ['basic', 'style'] })).length === 0
                      && (job.template?.sections || [])
                        .filter((sec) => sec.key === 'basic' || sec.key === 'style')
                        .some((sec) => sec.fields.some((f) => {
                          const v = job.values?.[f.key];
                          return f.key !== 'delivery_date' && v !== '' && v != null && !(Array.isArray(v) && !v.length)
                            && !(f.default != null && v === f.default);
                        }));
                    const picked = garmentJobs.find(j => j.key === activeGarmentKey);
                    const openKey = (picked && !filled(picked) ? picked : garmentJobs.find(j => !filled(j)))?.key;
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
                            const complete = filled(job) && !isActive;
                            const missing = !filled(job) && Boolean(garmentErrors[job.key]);
                            // Sections are stacked below, so a circle scrolls to its garment.
                            const goTo = () => {
                              setActiveGarmentKey(job.key);
                              document.getElementById(`wz-garment-${job.key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                            };
                            return (
                              <React.Fragment key={job.key}>
                                <div className="stepper-step stepper-step--link" role="button" tabIndex={0}
                                     aria-current={isActive ? 'step' : undefined}
                                     title={`Go to ${job.template?.name || job.key}`}
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
                                    {job.template?.name || job.key}
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
                    const sections = ['basic', 'style'].filter((k) => job.template.sections.some((sec) => sec.key === k));
                    const upFront = (f) => f.key !== 'delivery_date' && (f.is_required || Boolean(f.visible_when));
                    const foldedAway = (f) => f.key !== 'delivery_date' && !upFront(f);
                    const hasOptional = sections.some((k) => (job.template.sections.find((sec) => sec.key === k)?.fields || []).some((f) => foldedAway(f) && f.field_type !== 'file'));
                    return (
                      <div key={job.key} id={`wz-garment-${job.key}`} className="wz-garment">
                        <div className="wz-garment-head">
                          <span className="wz-garment-num">{idx + 1}</span>
                          <div>
                            <div className="wz-garment-name">{job.template.name}</div>
                            <div className="wz-garment-sub">{t('wizard.whatDoesItNeed', 'What does it need?')}</div>
                          </div>
                          <button type="button" className="btn-secondary at-btn-sm" style={{ marginLeft: 'auto' }} onClick={() => removeGarment(job.key)}>
                            <Trash2 size={12} /> {t('common.remove', 'Remove')}
                          </button>
                        </div>

                        {sections.map((sectionKey) => (
                          <div key={sectionKey} className="wz-garment-section">
                            <TemplateForm template={job.template} section={sectionKey} values={job.values}
                                          errors={garmentErrors[job.key] || {}} only={upFront}
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
                                        onChange={(values) => updateGarmentValues(job.key, values)} />
                        </div>

                        {hasOptional && (
                          <details className="wz-more">
                            <summary>{t('wizard.moreDetails', 'More details')} <span className="od-hint">({t('common.optional', 'optional')})</span></summary>
                            {sections.map((sectionKey) => (
                              <div key={sectionKey} className="wz-garment-section">
                                <TemplateForm template={job.template} section={sectionKey} values={job.values}
                                              errors={garmentErrors[job.key] || {}} only={foldedAway}
                                              purchases={job.purchases || []} onPurchaseChange={(fieldKey, row) => updateGarmentPurchase(job.key, fieldKey, row)}
                                              onChange={(values) => updateGarmentValues(job.key, values)} />
                              </div>
                            ))}
                          </details>
                        )}
                        {/* Sections stack one under another, so the prompt to
                            add the next garment sits after the last one. Same
                            list and same addGarment as the dropdown above; the
                            new garment renders right below this. */}
                        {idx === garmentJobs.length - 1 && (
                          <details className="wz-more">
                            <summary><Plus size={14} /> {t('wizard.addAnotherGarment', 'Do you need to add another garment?')}</summary>
                            <select className="form-control" value="" disabled={!!addingGarmentKey} style={{ marginTop: '8px' }}
                                    onChange={(e) => {
                                      if (!e.target.value) return;
                                      e.target.closest('details').open = false;
                                      addGarment(e.target.value);
                                    }}>
                              <option value="">{addingGarmentKey ? t('common.loading', 'Loading…') : t('wizard.selectGarment', 'Select Garment')}</option>
                              {garmentsForGender(garmentTemplates, customerForm.gender)
                                .filter((tpl) => !garmentJobs.some((j) => j.key === tpl.key))
                                .map((tpl) => <option key={tpl.key} value={tpl.key}>{tpl.name}</option>)}
                            </select>
                          </details>
                        )}
                      </div>
                    );
                  })}

                </div>
              </>
            )}

            {/* FABRIC: from stock, or what the customer brought, per garment. */}
            {wizardStepKey === 'fabric' && (
              <>
                <div className="page-title-group">
                  <h1 className="page-title">{t('wizard.fabricTitle', 'Fabric')}</h1>
                  <p className="page-subtitle">{t('wizard.fabricSubtitle', 'From our stock, or what the customer brings. Skip if it is decided later.')}</p>
                </div>

                <div className="content-card wz-card">
                  {garmentJobs.map((job, idx) => (
                      <div key={job.key} className="wz-garment">
                        <div className="wz-garment-head">
                          <span className="wz-garment-num">{idx + 1}</span>
                          <div><div className="wz-garment-name">{job.template.name}</div></div>
                        </div>

                        {/* Where the cloth comes from -- the template's own
                            fabric_source field, so it travels with the garment. */}
                        {job.template.sections.some((sec) => sec.key === 'materials') && (
                          <div className="wz-garment-section">
                            <TemplateForm template={job.template} section="materials" values={job.values}
                                          errors={garmentErrors[job.key] || {}} only={(f) => f.key === 'fabric_source'}
                                          onChange={(values) => updateGarmentValues(job.key, values)} />
                          </div>
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
                                    onChange={handleFabricSelection}
                                    quantities={fabricQuantities}
                                    onQuantityChange={handleFabricQuantity}
                                    onPickOutOfStock={(fabric, proceed) => setStockPrompt({ fabric, proceed })} />
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
                        <details className="wz-more" open={(job.values?.fabric_source || 'inventory') === 'customer'}>
                          <summary><Layers size={14} /> {t('wizard.sheetCustomerFabric', 'Customer fabrics (they bring it)')} <span className="od-hint">({t('common.optional', 'optional')})</span></summary>
                          <Suspense fallback={<ScreenLoading />}>
                            <GarmentPartPicker ownOnly isFabric
                                               garmentKey={job.template?.key || job.key}
                                               garmentName={job.template?.name || job.key}
                                               taxonomy={fabricTaxonomy}
                                               references={partReferences[job.key] || {}}
                                               onReferencesChange={(next) => handlePartReferences(job.key, next)} />
                          </Suspense>
                        </details>

                        <details className="wz-more">
                          <summary><Package size={14} /> {t('wizard.sheetTrims', 'Trims & accessories')} <span className="od-hint">({t('common.optional', 'optional')})</span></summary>
                          {canSeeTab(currentUser, 'inventory') && (
                            <details className="wz-more" open>
                              <summary><Package size={14} /> {t('wizard.sheetBoutiqueAccessories', 'Boutique Accessories & Trims')} <span className="od-hint">({t('common.optional', 'optional')})</span></summary>
                              <Suspense fallback={<ScreenLoading />}>
                                <GarmentFabricPicker
                                  garmentJobs={[job]}
                                  fabrics={fabrics}
                                  taxonomy={fabricTaxonomy}
                                  selection={fabricSelection}
                                  onChange={handleFabricSelection}
                                  quantities={fabricQuantities}
                                  onQuantityChange={handleFabricQuantity}
                                  accessoriesOnly />
                              </Suspense>
                            </details>
                          )}
                          <details className="wz-more" open>
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
                      </div>
                  ))}
                </div>
              </>
            )}

            {/* DESIGN: a look from the catalogue or a photo the customer brought;
                for a design order, the designer and the brief. */}
            {wizardStepKey === 'design' && (
              <>
                <div className="page-title-group">
                  <h1 className="page-title">{t('wizard.designTitle', 'The look')}</h1>
                  <p className="page-subtitle">{t('wizard.designSubtitle', 'A look from our catalogue, or a photo the customer brought. Skip for a plain garment.')}</p>
                </div>

                <div className="content-card wz-card">
                  {garmentJobs.map((job, idx) => (
                      <div key={job.key} className="wz-garment">
                        <div className="wz-garment-head">
                          <span className="wz-garment-num">{idx + 1}</span>
                          <div><div className="wz-garment-name">{job.template.name}</div></div>
                        </div>

                        <details className="wz-more" open>
                          <summary><Sparkles size={14} /> {t('wizard.sheetCatalogue', 'Pick a look from our catalogue')} <span className="od-hint">({t('common.optional', 'optional')})</span></summary>
                          <Suspense fallback={<ScreenLoading />}>
                            <GarmentPartPicker
                              garmentKey={job.template?.key || job.key}
                              garmentName={job.template?.name || job.key}
                              selection={partSelection[job.key] || {}}
                              onChange={(next) => handlePartSelection(job.key, next)} />
                          </Suspense>
                        </details>

                        <details className="wz-more" open>
                          <summary><Camera size={14} /> {t('wizard.sheetPhotos', 'Photos & references from the customer')} <span className="od-hint">({t('common.optional', 'optional')})</span></summary>
                          <Suspense fallback={<ScreenLoading />}>
                            <GarmentPartPicker ownOnly
                                               garmentKey={job.template?.key || job.key}
                                               garmentName={job.template?.name || job.key}
                                               references={partReferences[job.key] || {}}
                                               onReferencesChange={(next) => handlePartReferences(job.key, next)} />
                          </Suspense>
                        </details>

                        {/* Customer Designs: a design the customer described, captured
                            by the studio -- a photograph of a paper sketch, or drawn
                            here. Order-level, as its tab on the old Design Studio
                            screen was; its own rows kept for the customer, nothing on
                            the draft. */}
                        <details className="wz-more">
                          <summary><PenTool size={14} /> {t('wizard.sheetCustomerDesigns', 'Customer Designs')} <span className="od-hint">({t('common.optional', 'optional')})</span></summary>
                          <Suspense fallback={<ScreenLoading />}>
                            <CustomerDesigns
                              customerId={customerId}
                              customers={allCustomers}
                              orders={ordersList}
                              garmentTemplates={garmentTemplates}
                              templateId={job.template?.id}
                              garmentName={job.template?.name}
                              newCustomer={customerForm}
                              onCustomerCreated={(row) => {
                                setCustomerId(row.id);
                                setAllCustomers((prev) => [row, ...prev]);
                              }}
                            />
                          </Suspense>
                        </details>
                      </div>
                  ))}


                  {serviceType === 'design' && (
                    <div className="wz-garment" style={{ marginTop: '18px' }}>
                      <div className="wz-garment-head"><div className="wz-garment-name">{t('wizard.designerTitle', 'Who designs it?')}</div></div>
                      {designers.length === 0 ? (
                        <div className="od-empty" style={{ textAlign: 'left' }}>
                          {t('wizard.noDesigners', 'No designer on the team yet. Add one under Team, or go back and pick a look from the catalogue instead.')}
                        </div>
                      ) : (
                        <div className="form-group">
                          <label className="form-label" htmlFor="wz-designer">{t('wizard.designer', 'Designer')} <span className="required">*</span></label>
                          <select id="wz-designer" className="form-control" value={designRequest.designer}
                                  onChange={(e) => setDesignRequest({ ...designRequest, designer: e.target.value })}>
                            <option value="">{t('wizard.pickDesigner', 'Pick a designer')}</option>
                            {designers.map((d) => <option key={d.id} value={d.id}>{d.name}{d.specialisation ? ` · ${d.specialisation}` : ''}</option>)}
                          </select>
                        </div>
                      )}
                      <div className="form-group">
                        <label className="form-label" htmlFor="wz-brief">{t('wizard.brief', 'What does the customer want?')}</label>
                        <VoiceTextarea id="wz-brief" className="form-control" rows={4} value={designRequest.brief} maxLength={LIMITS.note}
                                  onChange={(e) => setDesignRequest({ ...designRequest, brief: e.target.value })}
                                  placeholder={t('wizard.briefPlaceholder', 'e.g. A peplum blouse with a scalloped hem, in the green of the saree border.')} />
                      </div>
                    </div>
                  )}

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
                  const groups = [...new Set(section.fields.filter((f) => isVisible(f, job.values)).map((f) => f.validation?.group).filter(Boolean))];
                  return (
                    <div className="content-card wz-card" key={job.key} id={`wz-garment-${job.key}`}>
                      <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Scissors size={20} /> {job.template.name}
                      </div>
                      <TemplateForm template={job.template} section="measurements" values={job.values}
                                    errors={garmentErrors[job.key] || {}}
                                    only={(f) => f.key !== 'measurement_notes' && !(groups.length && f.validation?.group)}
                                    onChange={(values) => updateGarmentValues(job.key, values)} />
                      {groups.map((group) => (
                        <details key={group} className="wz-more">
                          <summary><Plus size={14} /> {group} <span className="od-hint">({t('common.optional', 'optional')})</span></summary>
                          <TemplateForm template={job.template} section="measurements" values={job.values}
                                        errors={garmentErrors[job.key] || {}}
                                        only={(f) => f.validation?.group === group}
                                        onChange={(values) => updateGarmentValues(job.key, values)} />
                        </details>
                      ))}
                      {/* The note (spoken or typed) for whatever the numbers cannot say, last. */}
                      <TemplateForm template={job.template} section="measurements" values={job.values}
                                    errors={garmentErrors[job.key] || {}} only={(f) => f.key === 'measurement_notes'}
                                    onChange={(values) => updateGarmentValues(job.key, values)} />
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
                <div className="content-card wz-card">
                  <Field label={t('wizard.notesForTailor', 'Notes for the tailor')}>
                    {/* The same note the "What" screen asks for; one field, two doors. */}
                    <VoiceTextarea className="form-control" rows={3} value={specialInstructions} maxLength={LIMITS.note}
                                   onChange={(e) => setSpecialInstructions(e.target.value)}
                                   placeholder={t('wizard.notesPlaceholder', 'e.g. padding, side zip, extra margin at the waist')} />
                    <VoiceRecorder
                      sent={measureVoiceNote}
                      onSend={async (blob) => {
                        const url = await api.uploadVoiceNote(blob);
                        const by = [currentUser?.first_name, currentUser?.last_name].filter(Boolean).join(' ') || currentUser?.name || currentUser?.email || '';
                        setMeasureVoiceNote({ url, by, at: new Date().toISOString() });
                      }}
                      onDelete={() => setMeasureVoiceNote(null)}
                    />
                  </Field>
                </div>
              </>
            )}

            {/* PERSONALIZATION: the optional extras per garment -- the
                questions its cut does not insist on, and anything in the
                customer's own words -- after the measurements are taken. */}
            {wizardStepKey === 'personal' && (
              <>
                <div className="page-title-group">
                  <h1 className="page-title">{t('wizard.personalTitle', 'Anything extra?')}</h1>
                  <p className="page-subtitle">{t('wizard.personalSubtitle', 'Optional details per garment, and notes for the tailor. Skip what does not apply.')}</p>
                </div>
                <div className="content-card wz-card">
                  {garmentJobs.map((job, idx) => {
                    const sections = ['basic', 'style'].filter((k) => job.template.sections.some((sec) => sec.key === k));
                    const foldedAway = (f) => f.key !== 'delivery_date' && !f.is_required && !f.visible_when;
                    const hasOptional = sections.some((k) => (job.template.sections.find((sec) => sec.key === k)?.fields || []).some((f) => foldedAway(f) && f.field_type !== 'file'));
                    return (
                      <div key={job.key} className="wz-garment">
                        <div className="wz-garment-head">
                          <span className="wz-garment-num">{idx + 1}</span>
                          <div>
                            <div className="wz-garment-name">{job.template.name}</div>
                            <div className="wz-garment-sub">{t('wizard.personalSub', 'Optional')}</div>
                          </div>
                        </div>

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
                                        onChange={(values) => updateGarmentValues(job.key, values)} />
                        </div>

                        {hasOptional && (
                          <details className="wz-more">
                            <summary>{t('wizard.moreDetails', 'More details')} <span className="od-hint">({t('common.optional', 'optional')})</span></summary>
                            {sections.map((sectionKey) => (
                              <div key={sectionKey} className="wz-garment-section">
                                <TemplateForm template={job.template} section={sectionKey} values={job.values}
                                              errors={garmentErrors[job.key] || {}} only={foldedAway}
                                              purchases={job.purchases || []} onPurchaseChange={(fieldKey, row) => updateGarmentPurchase(job.key, fieldKey, row)}
                                              onChange={(values) => updateGarmentValues(job.key, values)} />
                              </div>
                            ))}
                          </details>
                        )}

                      </div>
                    );
                  })}

                  {garmentJobs.length > 0 && (
                    <div className="form-group" style={{ marginTop: '18px' }}>
                      <label className="form-label" htmlFor="wz-notes">{t('wizard.notesForTailor', 'Notes for the tailor')} <span className="od-hint">({t('common.optional', 'optional')})</span></label>
                      <VoiceTextarea id="wz-notes" className="form-control" rows={3} value={specialInstructions} maxLength={LIMITS.note}
                                onChange={(e) => setSpecialInstructions(e.target.value)}
                                placeholder={t('wizard.notesPlaceholder', 'e.g. padding, side zip, extra margin at the waist')} />
                    </div>
                  )}
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
              const card = (title, step, body) => (
                <div className="content-card wz-card" style={{ padding: '16px 20px', gap: 0, marginTop: '-16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '18px', fontWeight: 500, margin: 0 }}>{title}</h2>
                    <button type="button" className="btn-secondary at-btn-sm" onClick={() => jumpToStep(step)}>
                      <Edit2 size={12} /> {t('common.edit', 'Edit')}
                    </button>
                  </div>
                  {body}
                </div>
              );
              
              const accessoryKeys = new Set(ACCESSORY_OPTIONS.map(o => o.key));
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
                      </div>
                      <GarmentSummary jobs={garmentJobs.map(job => ({ key: job.key, template: job.template, values: job.values || {} }))} />
                    </>
                  ))}

                  {groups.length > 0 && card(t('wizard.reviewPhotos', 'Photos & references'), stepOf('design'), (
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
                  {/* The garment drawn on a model, from the designs and rolls
                      above. Renders nothing where the vendor is not set up or
                      no garment has a design. The photograph lands on
                      job.design.preview and confirms with the rest.
                      Switched off for now; uncomment to bring it back.
                      Model display parked — see task 16 */}
                  {/* <Suspense fallback={null}>
                    <GarmentPreviews jobs={garmentJobs} title={t('wizard.reviewPreview', 'See it on a model')}
                      onPreview={(jobKey, url) => setGarmentJobs(prev => prev.map(j => j.key === jobKey
                        ? { ...j, design: { ...(j.design || {}), preview: url } } : j))}
                      onView={(url, label) => setReviewView({ items: [{ key: 'preview', image_url: url, label }], index: 0 })} />
                  </Suspense> */}
                  {reviewView && (
                    <Suspense fallback={null}>
                      <ReviewLightbox items={reviewView.items} index={reviewView.index}
                                      onIndexChange={(i) => setReviewView({ ...reviewView, index: i })}
                                      onClose={() => setReviewView(null)} />
                    </Suspense>
                  )}

                  {garmentJobs.some(job => (job.purchases || []).length) && card(t('wizard.sheetPurchases', 'To buy for this order'), stepOf('fabric'), (
                    <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
                      <tbody>
                        {garmentJobs.flatMap(job => (job.purchases || []).map((row, i) => (
                          <tr key={`${job.key}:${i}`} style={{ borderTop: '1px solid var(--border-color)' }}>
                            <td style={{ padding: '8px 0', color: 'var(--text-secondary)' }}>{job.template?.name || job.key}</td>
                            <td style={{ padding: '8px 0', fontWeight: 600 }}>🛒 {row.name}</td>
                            <td style={{ padding: '8px 0', textAlign: 'right' }}>{row.quantity} {(row.unit || 'METER').toLowerCase()} · {inr(row.estimated_cost)} est.</td>
                          </tr>
                        )))}
                      </tbody>
                    </table>
                  ))}
                  {fabricLines.length > 0 && card(t('wizard.sheetFabric', 'Fabric from our stock'), stepOf('fabric'), (
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

                  {serviceType === 'design' && card(t('wizard.designerTitle', 'Who designs it?'), stepOf('design'), (
                    <div style={{ fontSize: '14px' }}>
                      {designers.find(d => String(d.id) === String(designRequest.designer))?.name || designRequest.designer || <span className="od-hint">Not picked</span>}
                      {designRequest.brief && <div className="od-hint" style={{ marginTop: '4px' }}>{designRequest.brief}</div>}
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

                <div className="content-card wz-card">
                  <div className="form-group" style={{ maxWidth: '260px' }}>
                    <label className="form-label" htmlFor="wz-ready">{t('wizard.readyBy', 'Ready by')} <span className="required">*</span></label>
                    <input id="wz-ready" type="date" className="form-control" value={readyBy} min={todayIso()}
                           onChange={(e) => setReadyBy(e.target.value)} />
                  </div>

                  <div className="wz-money">
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
                    <div className="wz-money-total">
                      <div><span>{t('wizard.gst', 'GST 5%')}</span><strong>{inr(getTaxes())}</strong></div>
                      <div className="wz-money-grand"><span>{t('wizard.total', 'Total')}</span><strong>{inr(getTotalPrice())}</strong></div>
                    </div>
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
                      {Number(advancePaymentAmount) >= getTotalPrice() && getTotalPrice() > 0
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
                      {t('wizard.noDeliveredGarments', 'Nothing delivered to this customer yet. Alterations can only be raised on a garment we made.')}
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
                              <span className="wz-match-name">{job.template_name || t('wizard.garment', 'Garment')}</span>
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
            </div>

            {/* Right Sidebar */}
            <div className="sidebar-panel">
              <div className="sidebar-card">
                <div className="sidebar-card-title">
                  <Sparkles size={16} />
                  {t('wizard.howItWorks', 'How it works')}
                </div>
                <div className="instruction-steps">
                  {wizardSteps.map((step, index) => (
                    <div className="instruction-step" key={step.key}>
                      <div className="step-num-badge">{index + 1}</div>
                      <div className="instruction-step-content">
                        <span className="instruction-step-title">{t(`wizard.step.${step.key}`, step.label)}</span>
                        <span className="instruction-step-desc">{t(`wizard.stepSub.${step.key}`, step.sub)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {serviceType !== 'alter' && garmentJobs.length > 0 && (
                <div className="sidebar-card">
                  <div className="sidebar-card-title"><Shirt size={16} /> {t('wizard.thisOrder', 'This order')}</div>
                  <div className="od-hint" style={{ lineHeight: 1.6 }}>
                    {customerForm.first_name ? <div><strong>{customerForm.first_name} {customerForm.last_name}</strong></div> : null}
                    <div>{garmentJobs.map((j) => j.template?.name || j.key).join(', ')}</div>
                    {wizardStepKey === 'money' && <div>{t('wizard.total', 'Total')}: <strong>{inr(getTotalPrice())}</strong></div>}
                  </div>
                </div>
              )}
              <div className="sidebar-card">
                <div className="sidebar-card-title">
                  <ShieldCheck size={16} />
                  {t('wizard.privacyAssured', 'Privacy Assured')}
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  {t('wizard.privacyAssuredDesc', 'Customer details, style files, and measurement records are saved exclusively to the Scaleezy database and never shared.')}
                </p>
              </div>
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
                : <>{t('common.next', 'Next')} <ArrowRight size={16} /></>}
            </button>
          </div>
        </div>
      )}

      {/* INVOICE MODAL */}
      {/* Send to the workshop: who leads it, who stitches it, when it is due. */}
      {sendingOrder && (
        <FormModal icon={Scissors} tone="amber" width="460px"
                   title={t('ordersPage.sendModalTitle', 'Send to the workshop')}
                   subtitle={`${orderRef(sendingOrder)} · ${sendingOrder.customer_name || ''}`}
                   onClose={() => !sendBusy && setSendingOrder(null)}
                   footer={(
                     <button type="button" className="btn-primary" style={{ width: '100%', justifyContent: 'center', minHeight: '48px' }}
                             disabled={sendBusy} onClick={() => sendToWorkshop(sendingOrder, sendForm, true)}>
                       <Scissors size={16} /> {sendBusy ? t('ordersPage.sending', 'Sending…') : t('ordersPage.send', 'Send')}
                     </button>
                   )}>
          <Field label={t('ordersPage.supervisingMaster', 'Master in charge')} htmlFor="send-master">
            <select id="send-master" className="form-control" value={sendForm.master} onChange={(e) => setSendForm({ ...sendForm, master: e.target.value })}>
              <option value="">{t('ordersPage.unassigned', 'Not yet assigned')}</option>
              {workshopMasters().map(tl => <option key={tl.id} value={tl.id}>{tl.name}</option>)}
            </select>
          </Field>
          <Field label={t('ordersPage.stitchingTailor', 'Stitching tailor')} htmlFor="send-tailor">
            <select id="send-tailor" className="form-control" value={sendForm.tailor} onChange={(e) => setSendForm({ ...sendForm, tailor: e.target.value })}>
              <option value="">{t('ordersPage.unassigned', 'Not yet assigned')}</option>
              {workshopCrew().map(tl => (
                <option key={tl.id} value={tl.id}>{tl.name}{tl.status && tl.status !== 'Available' ? ` (${tl.status})` : ''}</option>
              ))}
            </select>
          </Field>
          <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
            <Calendar size={14} style={{ verticalAlign: '-2px' }} /> {t('ordersPage.estDelivery', 'Promised by')}: <strong style={{ color: 'var(--text-primary)' }}>
              {sendingOrder.estimated_delivery ? fmtDate(sendingOrder.estimated_delivery) : t('ordersPage.tbd', 'Not set')}
            </strong>
          </div>
          {sendError && (
            <div className="ui-badge ui-badge--danger" role="alert" style={{ whiteSpace: 'normal', display: 'block', marginTop: '12px', padding: '10px 12px', fontSize: '14px' }}>
              {sendError}
            </div>
          )}
        </FormModal>
      )}

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
                    visibility: visible;
                  }
                    position: absolute;
                    left: 0;
                    top: 0;
                    width: 100%;
                    padding: 0;
                  }
                  .no-print {
                    display: none !important;
                  }
                }
              `}</style>

              <InvoiceRenderer
                template={confirmedOrder.invoice_template || boutiqueSettings?.invoice_template || 'classic'}
                data={normalizeInvoiceData(confirmedOrder, boutiqueSettings, currentUser)}
              />
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
            }} className="no-print">
              <button 
                className="btn-secondary" 
                onClick={() => setShowInvoiceModal(false)}
              >
                Close
              </button>
              <button 
                className="btn-primary" 
                onClick={() => window.print()}
              >
                <Printer size={16} /> Print Invoice
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notifications Drawer */}
      {showNotificationsDrawer && (
        <div style={{
          position: 'fixed',
          top: 0,
          right: 0,
          width: '400px',
          height: '100%',
          backgroundColor: 'var(--surface-color)',
          borderLeft: '1px solid var(--border-color)',
          boxShadow: '-4px 0 24px rgba(0,0,0,0.15)',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column'
        }}>
          {/* Header */}
          <div style={{
            padding: '20px',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Bell size={20} style={{ color: 'var(--accent-text, #b07c40)' }} />
              <h3 style={{ fontSize: '18px', fontWeight: 600, margin: 0, fontFamily: 'var(--font-serif)' }}>Boutique alerts</h3>
            </div>
            <button 
              className="btn-secondary" 
              style={{ padding: '4px 10px', fontSize: '12px' }}
              onClick={() => setShowNotificationsDrawer(false)}
            >
              Close
            </button>
          </div>

          {/* List */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            {notifications.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: '13px' }}>
                No notifications received yet.
              </div>
            ) : (
              notifications.map(n => (
                <div key={n.id} style={{
                  padding: '16px',
                  backgroundColor: n.is_read ? 'rgba(0,0,0,0.01)' : 'rgba(212,175,55,0.04)',
                  border: `1px solid ${n.is_read ? 'var(--border-color)' : 'rgba(212,175,55,0.2)'}`,
                  borderRadius: '8px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)' }}>{n.title}</span>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>{n.message}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Stage Review Modal */}
      {activeReviewStage && activeReviewOrder && (() => {
        const stage = selectedStageObj;
        const closeStage = () => {
          setActiveReviewStage(null);
          setActiveReviewOrder(null);
          setSelectedStageObj(null);
          setSelectedPerformerId('');
        };
        const isSupervisor = !currentUser.role || currentUser.role === 'Owner'
          || SUPERVISOR_ROLES.includes(currentUser.role);
        const transition = async (status, okMessage, comments = stageReviewComments, sentVoiceNote = null, clearVoiceNote = false) => {
          if (stageTransitionBusy) return;
          if (status === 'COMPLETED' && stage.stage_key === 'payment' && activeReviewOrder.payment_status !== 'Paid') {
            const paid = Number(activeReviewOrder.amount_paid || 0), total = Number(activeReviewOrder.total_amount || 0);
            if (!window.confirm(`Payment is not complete: ${inr(paid)} of ${inr(total)} received (${inr(total - paid)} outstanding).

Complete the Payment stage with this partial payment?`)) return;
          }
          if (stageReviewRecording) { alert(t('ordersPage.stopRecordingFirst', 'Stop the recording first, then save.')); return; }
          setStageTransitionBusy(true);
          try {
            const voiceNote = sentVoiceNote;
            await api.transitionStage(
              activeReviewOrder.id,
              stage.stage_key,
              status,
              comments,
              stageReviewImages,
              selectedPerformerId || null,
              voiceNote,
              clearVoiceNote,
              stage.garment_job || null
            );
            alert(okMessage);
            closeStage();
            fetchDashboardAndConfig();
          } catch (err) {
            alert("Failed to transition: " + err.message);
          } finally {
            setStageTransitionBusy(false);
          }
        };
        const tone = STEP_TONE[STEP_STATE(stage?.status)];
        const jobs = activeReviewOrder.garment_jobs || [];
        const answered = (obj) => Object.values(obj || {}).filter(v => v !== '' && v !== null && v !== undefined).length;
        const detailCount = jobs.reduce((n, j) => n + answered(j.spec) + answered(j.measurements), 0);
        const mins = Math.floor((stage?.duration_seconds || 0) / 60);
        const hrs = Math.floor(mins / 60);
        const duration = hrs > 0 ? `${hrs}h ${mins % 60}m` : `${mins}m`;
        const settled = stage && (stage.status === 'COMPLETED' || stage.status === 'SKIPPED');
        return (
          <FormModal
            icon={Scissors} tone="green" width="1000px" zIndex={1100}
            title={stage ? `Production Stage: ${stage.stage_name}${stage.garment_name ? ` · ${stage.garment_name}` : ''}` : `Stage Review: ${activeReviewStage}`}
            subtitle={`Order ID: ${orderRef(activeReviewOrder)}${activeReviewOrder.customer_name ? ` · ${activeReviewOrder.customer_name}` : ''}`}
            onClose={closeStage}
            footer={stage && (
              <>
                {stageReviewComments.trim() && (
                  <button className="btn-secondary" disabled={stageTransitionBusy}
                          title={t('ordersPage.saveNoteHint', 'Leave this note on the stage without changing its status')}
                          onClick={() => transition(stage.status, t('ordersPage.noteSaved', 'Note saved.'))}>
                    <MessageSquare size={16} /> {t('ordersPage.saveNote', 'Save note')}
                  </button>
                )}
                {(stage.status === 'NOT_STARTED' || stage.status === 'PAUSED') && (
                  <button className="btn-primary" disabled={stageTransitionBusy}
                          onClick={() => transition('IN_PROGRESS', 'Step started.')}>
                    <Play size={16} /> {stage.status === 'PAUSED' ? 'Resume' : 'Start'}
                  </button>
                )}
                {/* A step is started, then completed. A worker marks it done
                    with a photo and the owner or Master confirms; the server
                    holds the same rule. No pause: a step is in progress until
                    it is complete. */}
                {stage.status === 'IN_PROGRESS' && (isSupervisor ? (
                  <button className="btn-primary" disabled={stageTransitionBusy}
                          onClick={() => transition('COMPLETED', 'Step completed.')}>
                    <Check size={16} /> Mark completed
                  </button>
                ) : (
                  <button className="btn-primary" disabled={stageTransitionBusy || stageReviewImages.length === 0}
                          title={stageReviewImages.length ? '' : 'Upload a photo of the work first'}
                          onClick={() => transition('PENDING_VERIFICATION', 'Sent for verification. The owner or Master will confirm it.')}>
                    <Check size={16} /> Submit for verification
                  </button>
                ))}
                {stage.status === 'PENDING_VERIFICATION' && (isSupervisor ? (
                  <>
                    <button className="btn-secondary at-btn-warn" disabled={stageTransitionBusy}
                            onClick={() => {
                              const note = window.prompt('What needs to be redone? The worker will see this note.');
                              if (note && note.trim()) transition('IN_PROGRESS', 'Sent back to the worker.', note.trim().slice(0, LIMITS.reason));
                            }}>
                      <X size={16} /> Send Back
                    </button>
                    <button className="btn-primary" disabled={stageTransitionBusy}
                            onClick={() => transition('COMPLETED', 'Confirmed. Step completed.')}>
                      <Check size={16} /> Confirm completed
                    </button>
                  </>
                ) : (
                  <span style={{ fontSize: '13px', color: 'var(--text-secondary)', alignSelf: 'center' }}>
                    Marked done. The owner or Master will confirm it.
                  </span>
                ))}
                {/* Reversals. Forward-only is the rule; these are the two
                    audited exceptions, supervisors only, reason required.
                    The server enforces all of it -- these buttons only appear
                    where they could succeed. */}
                {settled && (currentUser?.role === 'Owner' || currentUser?.role === 'Master') && (
                  <button className="btn-secondary at-btn-warn" disabled={reversalBusy}
                          onClick={() => { setReversalReason(''); setReversalPrompt({ type: 'reopen' }); }}>
                    Reopen Stage…
                  </button>
                )}
                {stage.stage_key === 'master_quality_check' && stage.status !== 'COMPLETED'
                  && ['Owner', 'Master', 'QC Staff'].includes(currentUser?.role) && (
                  <button className="btn-secondary at-btn-danger" disabled={reversalBusy}
                          onClick={() => { setReversalReason(''); setReversalPrompt({ type: 'failqc' }); }}>
                    Fail QC — Send for Rework…
                  </button>
                )}
              </>
            )}
          >
            {/* What this stage is for, and where it stands. */}
            <div className="at-stage-summary">
              <div className="at-form-section" style={{ flexDirection: 'row', alignItems: 'center', gap: 'var(--space-4)' }}>
                <div className="kanban-thumb at-tile--green" style={{ width: 72, height: 90 }}>
                  {activeReviewOrder.completed_garment_image
                    ? <img src={activeReviewOrder.completed_garment_image} alt="" />
                    : <Shirt size={28} />}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span className="at-section-title" style={{ fontSize: 'var(--text-xl)' }}>{orderGarmentLabel(activeReviewOrder)}</span>
                    {detailCount > 0 && <span className="ui-badge ui-badge--neutral">{detailCount} details</span>}
                  </div>
                  <div className="at-section-sub" style={{ fontSize: 'var(--text-sm)', marginTop: '4px' }}>
                    {activeReviewOrder.customer_name}
                    {jobs.length > 1 ? ` · ${jobs.length} garments` : ''}
                    {activeReviewOrder.estimated_delivery ? ` · Delivery ${fmtDate(activeReviewOrder.estimated_delivery)}` : ''}
                  </div>
                  {activeReviewOrder.garment_label && jobs.length > 1 && (
                    <div className="at-section-sub">{activeReviewOrder.garment_label}</div>
                  )}
                </div>
              </div>
              {stage && (
                <div className="at-form-section at-stat--green" style={{ gap: 'var(--space-3)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                    <span className="ui-eyebrow" style={{ color: 'var(--text-primary)' }}>Status</span>
                    <span className={`ui-badge ui-badge--${tone}`}>● {STEP_LABEL[STEP_STATE(stage.status)]}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                    <div>
                      <div className="ui-eyebrow">Started</div>
                      <div className="stage-meta-value" style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <Calendar size={14} /> {stage.started_at ? fmtDateTime(stage.started_at) : '—'}
                      </div>
                    </div>
                    <div>
                      <div className="ui-eyebrow">SLA / target</div>
                      <div className="stage-meta-value" style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <Clock size={14} /> {stage.sla_hours} hours
                      </div>
                    </div>
                    {stage.completed_at && (
                      <div>
                        <div className="ui-eyebrow">Completed</div>
                        <div className="stage-meta-value">{fmtDateTime(stage.completed_at)}</div>
                      </div>
                    )}
                    {stage.duration_seconds > 0 && (
                      <div>
                        <div className="ui-eyebrow">Actual duration</div>
                        <div className="stage-meta-value">{duration}</div>
                      </div>
                    )}
                    {stage.performed_by_name && (
                      <div>
                        <div className="ui-eyebrow">Performed by</div>
                        <div className="stage-meta-value">{stage.performed_by_name}</div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* What is actually being made: the garments as the template
                groups them -- measurements, style, materials -- with the
                labels the order form used. Nested on the order payload, so it
                needs no fetch beyond the template itself. */}
            {jobs.length > 0 && (
             
              <div className="at-stage-brief">
                <OrderGarmentBrief
                  jobs={jobs}
                  specialInstructions={activeReviewOrder.special_instructions}
                  voiceNote={activeReviewOrder.instructions_voice_note}
                  voiceNoteBy={activeReviewOrder.instructions_voice_note_by}
                  voiceNoteAt={activeReviewOrder.instructions_voice_note_at}
                />
              </div>
            )}
            {/* An order with no garment lines still carries its instructions;
                without the brief they had nowhere to show, so the person doing
                the work never saw or heard them. */}
            {jobs.length === 0 && (activeReviewOrder.special_instructions || activeReviewOrder.instructions_voice_note) && (
              <InfoNote icon={FileText} tone="warning" title="Special instructions">
                {activeReviewOrder.special_instructions && (
                  <>&ldquo;{activeReviewOrder.special_instructions}&rdquo;<SpeakButton text={activeReviewOrder.special_instructions} /></>
                )}
                <VoiceNotePlayer src={activeReviewOrder.instructions_voice_note} />
                {activeReviewOrder.instructions_voice_note && (
                  <div className="od-hint" style={{ marginTop: '4px' }}>
                    Voice note from <strong>{activeReviewOrder.instructions_voice_note_by || t('ordersPage.someone', 'Someone')}</strong>
                  </div>
                )}
              </InfoNote>
            )}

            {/* The designs, fabrics and accessories chosen for each garment,
                read back exactly as the order's review step showed them. Off
                the job's own `selections` snapshot: the floor roles have no
                inventory module, so nothing here asks /api/inventory/. Orders
                placed before the snapshot existed have nothing to show. */}
            {jobs.some((j) => Object.keys(j.selections || {}).length > 0) && (
              <FormSection icon={Layers} tone="green" title="Designs &amp; fabrics"
                           subtitle="What was chosen for every garment when the order was placed.">
                <GarmentSelectionsReview
                  jobs={jobs.map((j) => ({
                    key: j.id,
                    template: { key: j.template_key, name: j.template_name },
                    design: j.selections?.design,
                    fabrics: j.selections?.fabrics,
                    slot_labels: j.selections?.slot_labels,
                    fabric_qty: j.selections?.fabric_qty,
                  }))}
                  fabrics={jobs.flatMap((j) => j.selections?.fabric_items || [])}
                  taxonomy={fabricTaxonomy}
                />
              </FormSection>
            )}

            {/* What the cutting table actually took from each roll. Recorded
                here, at the stage it happens, by the people standing at it;
                Stitching Completed only mops up lines nobody recorded. */}
            {(stage?.stage_key === 'pattern_cutting' || stage?.stage_key === 'fabric_cutting')
              && (currentUser?.role === 'Owner' || currentUser?.role === 'Master') && (
              <FormSection icon={Scissors} tone="green" title="Fabric used at cutting"
                           subtitle="Metres cut from each roll, and the offcuts. Stock and the order's material cost follow from this.">
                <CuttingUsage orderId={activeReviewOrder.id} />
              </FormSection>
            )}

            {stage && stage.verification_note && stage.status !== 'COMPLETED' && (
              <InfoNote icon={AlertTriangle} tone="warning" title="Sent back for rework">
                &ldquo;{stage.verification_note}&rdquo;
              </InfoNote>
            )}
            {stage && stage.status === 'PENDING_VERIFICATION' && (
              <InfoNote icon={Clock} tone="warning" title="Pending verification">
                {stage.performed_by_name || 'The worker'} has submitted this stage. Check the photos below
                {isSupervisor ? ', then verify it or send it back.' : '. The owner or Master will verify it.'}
                {stage.verification_seen_at && (
                  <div className="od-hint" style={{ marginTop: '6px' }}>
                    <Eye size={12} style={{ verticalAlign: '-2px', marginRight: '4px' }} />
                    Seen by {stage.verification_seen_by || 'the verifier'} · {new Date(stage.verification_seen_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
                  </div>
                )}
              </InfoNote>
            )}
            {stage && (stage.comments || stage.voice_note) && (
              <InfoNote icon={FileText} tone="neutral" title={t('ordersPage.latestNote', 'Latest note')}>
                {stage.comments && <>&ldquo;{stage.comments}&rdquo;<SpeakButton text={stage.comments} /></>}
                <VoiceNotePlayer src={stage.voice_note} />
                {stage.voice_note && (
                  <div className="od-hint" style={{ marginTop: '4px' }}>
                    Voice note from <strong>{stage.voice_note_by || t('ordersPage.someone', 'Someone')}</strong>
                    {stage.voice_note_at ? ` · ${new Date(stage.voice_note_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}` : ''}
                  </div>
                )}
              </InfoNote>
            )}
            {stage && (() => {
              // The thread the tailor and the owner talk through on this stage.
              const notes = (activeReviewOrder.activities || [])
                .filter((a) => (a.event_type === 'STAGE_TRANSITION' || a.event_type === 'STAGE_NOTE') && a.metadata?.stage_key === stage.stage_key
                  && (a.metadata.comments || a.metadata.voice_note))
                .slice(0, 20);
              if (!notes.length) return null;
              return (
                <div className="at-field">
                  <span className="at-field-label">{t('ordersPage.stageNotesThread', 'Notes on this stage')}</span>
                  {notes.map((a, i) => (
                    <div key={a.id || i} style={{ padding: '6px 0', fontSize: '13px',
                                                   borderTop: i ? '1px solid var(--border-color)' : 'none' }}>
                      <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                        {a.user_name || t('ordersPage.someone', 'Someone')}
                        {' · '}
                        {new Date(a.timestamp).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </div>
                      {a.metadata.comments && <div>{a.metadata.comments}</div>}
                      {a.metadata.voice_note && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <VoiceNotePlayer src={a.metadata.voice_note} style={{ flex: '1 1 200px', marginTop: 0 }} />
                          {/* The browser's own ⋮ on the player cannot be added
                              to, so Delete sits beside it -- the same button the
                              recorder above draws for the stage's note. */}
                          {a.id && (
                            <button type="button" className="btn-secondary"
                                    style={{ padding: '4px 10px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                                    disabled={stageTransitionBusy}
                                    title={t('ordersPage.deleteVoiceNote', 'Delete this voice note')}
                                    onClick={async () => {
                                      if (!window.confirm(t('ordersPage.deleteVoiceNoteConfirm', 'Delete this voice note?'))) return;
                                      setStageTransitionBusy(true);
                                      try {
                                        await api.deleteStageNoteVoice(activeReviewOrder.id, a.id);
                                        
                                        setActiveReviewOrder((prev) => prev && ({
                                          ...prev,
                                          activities: (prev.activities || []).flatMap((row) => {
                                            if (row.id !== a.id) return [row];
                                            const { voice_note, voice_note_by, voice_note_at, ...rest } = row.metadata || {}; // eslint-disable-line no-unused-vars
                                            return row.event_type === 'STAGE_NOTE' && !rest.comments ? [] : [{ ...row, metadata: rest }];
                                          }),
                                        }));
                                        fetchDashboardAndConfig();
                                      } catch (err) {
                                        alert(err.message || t('ordersPage.voiceNoteDeleteFailed', 'Could not delete the voice note.'));
                                      } finally {
                                        setStageTransitionBusy(false);
                                      }
                                    }}>
                              <Trash2 size={13} /> {t('common.delete', 'Delete')}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              );
            })()}

            {stage && stage.attachments && stage.attachments.length > 0 && (
              <div className="at-field">
                <span className="at-field-label">Progress photos ({stage.attachments.length})</span>
                <div className="at-photos">
                  {stage.attachments.map((url, i) => {
                    const verdict = stage.attachment_reviews?.[url];
                    const items = stage.attachments.map((u, n) => ({ image_url: u, label: `Photo ${n + 1}` }));
                    return (
                      <div key={url} style={{ position: 'relative', width: '96px' }}>
                        <div style={{ position: 'relative' }}>
                          <PhotoTile src={url} alt={`attachment-${i}`} size={96} />
                          <button type="button" className="btn-secondary at-btn-sm" title="View"
                                  style={{ position: 'absolute', top: '6px', right: '6px', minHeight: '26px', padding: '0 8px' }}
                                  onClick={() => setReviewView({ items, index: i })}>
                            <Eye size={12} /> View
                          </button>
                          {verdict && (
                            <span style={{ position: 'absolute', left: '6px', bottom: '6px', fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '10px',
                                           background: 'var(--danger-color)', color: '#fff' }}>Rejected</span>
                          )}
                        </div>
                        {verdict && <div style={{ fontSize: '11px', color: 'var(--danger-color)', marginTop: '4px', lineHeight: 1.3 }}>{verdict.remark}</div>}
                        {isSupervisor && stage.status === 'PENDING_VERIFICATION' && (
                          verdict
                            ? <button type="button" className="btn-link" style={{ fontSize: '11px', padding: 0, minHeight: '24px' }}
                                      onClick={async () => {
                                        try { const o = await api.reviewStagePhoto(activeReviewOrder.id, stage.stage_key, url, '', 'CLEAR', stage.garment_job || null); setActiveReviewOrder(o); setSelectedStageObj(o.stages.find(st => st.id === stage.id)); fetchDashboardAndConfig(); }
                                        catch (err) { alert(err.message); }
                                      }}>Undo rejection</button>
                            : <button type="button" className="btn-link" style={{ fontSize: '11px', padding: 0, minHeight: '24px', color: 'var(--danger-color)' }}
                                      onClick={async () => {
                                        const remark = window.prompt('What is wrong with this photo? The tailor reads this.');
                                        if (remark === null) return;
                                        if (!remark.trim()) { alert('A remark is required to reject a photo.'); return; }
                                        try { const o = await api.reviewStagePhoto(activeReviewOrder.id, stage.stage_key, url, remark.trim().slice(0, LIMITS.reason), 'REJECTED', stage.garment_job || null); setActiveReviewOrder(o); setSelectedStageObj(o.stages.find(st => st.id === stage.id)); fetchDashboardAndConfig(); }
                                        catch (err) { alert(err.message); }
                                      }}><X size={11} /> Reject photo</button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Hand this stage to someone, say who did the work, note what
                happened, photograph it. assign_stage and the performer field
                are supervisor calls; the API refuses them from anyone else. */}
            <FormSection icon={RefreshCw} tone="green" title="Manage Stage Transition">
              <div className="at-form-grid">
                {stage && isSupervisor && (
                  <Field label="Assign this stage to" icon={User}>
                    <select
                      className="form-control"
                      value={stage.assigned_to || ''}
                      disabled={assigningStageKey === stage.stage_key}
                      onChange={(e) => handleAssignStage(activeReviewOrder.id, stage.stage_key, e.target.value, stage.garment_job || null)}
                    >
                      <option value="">Unassigned</option>
                      {eligibleStaffForStage(stage.stage_key).map(t => (
                        <option key={t.id} value={t.id}>{t.name} · {t.role}</option>
                      ))}
                    </select>
                  </Field>
                )}
                {isSupervisor && (
                  <Field label="Record who performed this" icon={Users}>
                    <select
                      className="form-control"
                      value={selectedPerformerId}
                      onChange={(e) => setSelectedPerformerId(e.target.value)}
                    >
                      <option value="">-- Select Tailor / Master --</option>
                      {(stage ? eligibleStaffForStage(stage.stage_key) : tailors).map(t => (
                        <option key={t.id} value={t.id}>{t.name} ({t.role})</option>
                      ))}
                    </select>
                  </Field>
                )}
                {/* One grid cell: the notes box, and under it the voice
                    note. The recorder sits outside the bordered control --
                    Field lays its children out in a row for icon + input,
                    which squeezed the textarea to a few characters wide. */}
                <div className="at-field">
                <Field label="Comments / Fitting Logs">
                  <VoiceTextarea
                    className="form-control"
                    placeholder="Enter notes, alterations details, or comments..."
                    maxLength={LIMITS.note}
                    value={stageReviewComments}
                    onChange={(e) => setStageReviewComments(e.target.value)}
                    onMic={() => setStageReviewMicKick((k) => k + 1)}
                  />
                </Field>
                  {/* The voice note proper: recorded on its own (nothing is
                      transcribed into the box), heard back, then Send saves
                      it on the stage under the sender's name -- with whatever
                      text is in the box -- or Delete throws it away. */}
                  <VoiceRecorder
                    disabled={stageTransitionBusy}
                    startToken={stageReviewMicKick}
                    onRecordingChange={setStageReviewRecording}
                    sent={stage.voice_note ? { url: stage.voice_note, by: stage.voice_note_by, at: stage.voice_note_at } : null}
                    onSend={async (blob) => {
                      const url = await api.uploadVoiceNote(blob);
                      await transition(stage.status, t('ordersPage.voiceNoteSent', 'Voice note sent.'), stageReviewComments, url);
                    }}
                    onDelete={() => transition(stage.status, t('ordersPage.voiceNoteDeleted', 'Voice note deleted.'), stageReviewComments, null, true)}
                  />
                </div>
                <div className="at-field">
                  <span className="at-field-label">
                    Upload Progress Photos <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(up to 5)</span>
                  </span>
                  {stageReviewImages.length > 0 && (
                    <div className="at-photos" style={{ marginBottom: '8px' }}>
                      {stageReviewImages.map((file, i) => (
                        <PhotoTile key={`${file.name}-${i}`} src={URL.createObjectURL(file)} size={88}
                                   onRemove={() => setStageReviewImages(prev => prev.filter((_, n) => n !== i))} />
                      ))}
                    </div>
                  )}
                  {stageReviewImages.length < 5 && (
                    <Dropzone compact multiple camera
                              title="Drag & drop images here" subtitle="or choose from your device — several at once"
                              chooseLabel={stageReviewImages.length ? 'Add more' : 'Add photos'}
                              onFiles={(files) => {
                                const bad = imageFilesError(files);
                                if (bad) { alert(bad); return; }
                                setStageReviewImages(prev => {
                                  const room = 5 - prev.length;
                                  if (files.length > room) alert(`Up to 5 photos. Only ${room} more ${room === 1 ? 'was' : 'were'} added.`);
                                  return [...prev, ...files.slice(0, room)];
                                });
                              }} />
                  )}
                </div>
              </div>
            </FormSection>
          </FormModal>
        );
      })()}


      <NetworkActivityBar />
      {reviewView && view !== 'wizard' && (
        <Suspense fallback={null}>
          <ReviewLightbox items={reviewView.items} index={reviewView.index}
                          onIndexChange={(i) => setReviewView({ ...reviewView, index: i })}
                          onClose={() => setReviewView(null)} />
        </Suspense>
      )}
      {stockPrompt && (
        <div className="existing-customer-search-modal" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1300 }}>
          <div className="search-modal-card" style={{ maxWidth: '440px', width: '100%', padding: '24px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 600, fontFamily: 'var(--font-serif)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertTriangle size={18} style={{ color: 'var(--warning-color)' }} /> Out of stock
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '18px' }}>
              <strong style={{ color: 'var(--text-primary)' }}>{stockPrompt.fabric.name}</strong> has no stock right now.
              Restock it first, or carry on with the order and let the workroom sort the material out later.
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button type="button" className="btn-secondary" onClick={() => setStockPrompt(null)}>Cancel</button>
              <button type="button" className="btn-secondary"
                      onClick={() => { stockPrompt.proceed(); setStockPrompt(null); }}>
                Complete the order
              </button>
              <button type="button" className="btn-primary"
                      onClick={() => { stockPrompt.proceed(); setRestockTrip({ fabric: stockPrompt.fabric }); setStockPrompt(null); }}>
                <Boxes size={16} /> Restock now
              </button>
            </div>
          </div>
        </div>
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
              // Later work is reset with it: the server does this, the
              // warning just makes sure nobody is surprised.
              // Only this garment's later rows and the order-level ones, as the server does.
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
            <VoiceTextarea
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
      {/* Rendered at the root so both sidebars' Logout items reach it,
          whichever view is on screen. */}
      {showLogoutConfirm && (
        <div className="existing-customer-search-modal" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1300 }}>
          <div className="search-modal-card" style={{ maxWidth: '360px', width: '100%', padding: '24px', textAlign: 'center' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 600, fontFamily: 'var(--font-serif)', marginBottom: '8px' }}>
              Log out?
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
              You will need to sign in again to open your boutique.
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button type="button" className="btn-secondary" disabled={logoutBusy} onClick={() => setShowLogoutConfirm(false)}>
                Cancel
              </button>
              <button type="button" className="btn-primary" disabled={logoutBusy} onClick={handleLogout}>
                {logoutBusy ? 'Logging out…' : 'Logout'}
              </button>
            </div>
          </div>
        </div>
      )}


      <GarmentPairingModal
        isOpen={!!activePairingGarment}
        onClose={() => setActivePairingGarment(null)}
        primaryGarmentKey={activePairingGarment?.key}
        primaryGarmentName={activePairingGarment?.name}
        primaryJobKey={activePairingGarment?.jobKey}
        garmentTemplates={garmentTemplates}
        garmentJobs={garmentJobs}
        onAddPairedGarments={handleAddPairedGarments}
      />
    </div>
  );
}

export default App;
