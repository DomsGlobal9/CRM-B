import React, { useState } from 'react';
import { useLanguage } from '../i18n/LanguageContext.jsx';
import LanguageSelector from './LanguageSelector.jsx';
import { PageHeader } from './ui/Atelier.jsx';
import { InvoiceTemplateSelector } from './invoice/InvoiceTemplateSelector.jsx';
import DailySummarySettings from './DailySummarySettings.jsx';
import TierNamesSettings from './TierNamesSettings.jsx';
import { UserAvatar } from './ui/UserAvatar.jsx';
import MyDetails from '../features/staff/MyDetails.jsx';
import BoutiqueDetailsCard from './BoutiqueDetailsCard.jsx';
import {
  Globe, ShieldCheck, CheckCircle2, Building, Link2, User, Clock,
  MessageSquare, RotateCw, RefreshCw, SunMoon, Sun, Moon, Monitor,
  Store, FileText, Crown, X, Copy, Check, ChevronRight, AlertCircle, Smartphone, Camera, KeyRound, Pencil
} from 'lucide-react';
import { getColorMode, setColorMode, subscribeTheme } from '../theme.js';
import { api } from '../services/api.js';
import { imageFilesError } from '../services/validate.js';

const iconChip = {
  width: '40px', height: '40px', borderRadius: 'var(--radius-md)', flexShrink: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'var(--accent-color)', color: 'var(--accent-text)',
};

const LANGUAGES_DATA = [
  { code: 'en', native: 'English', english: 'English' },
  { code: 'hi', native: 'हिंदी', english: 'Hindi' },
  { code: 'te', native: 'తెలుగు', english: 'Telugu' },
  { code: 'mr', native: 'मराठी', english: 'Marathi' },
  { code: 'ar', native: 'العربية', english: 'Arabic' },
  { code: 'gu', native: 'ગુજરાતી', english: 'Gujarati' },
  { code: 'ml', native: 'മലയാളം', english: 'Malayalam' },
  { code: 'ta', native: 'தமிழ்', english: 'Tamil' },
  { code: 'kn', native: 'ಕನ್ನಡ', english: 'Kannada' },
  { code: 'es', native: 'Español', english: 'Spanish' },
  { code: 'de', native: 'Deutsch', english: 'German' },
];

export const SettingsPage = ({
  currentUser,
  boutiqueSettings,
  onTierNamesSaved,
  whatsappStatus = { connected: false, status: 'disconnected', qrCode: null },
  fetchWhatsAppStatus,
  onUserUpdated,
  onBoutiqueUpdated,
}) => {
  const { t, language, setLanguage } = useLanguage();
  const [resetting, setResetting] = useState(false);
  const [sendingSaving, setSendingSaving] = useState(false);
  const [sendingError, setSendingError] = useState('');
  const [savedBoutiqueSending, setSavedBoutiqueSending] = useState(null);
  const [copied, setCopied] = useState(false);
  const [mode, setMode] = useState(getColorMode);
  // The top bar's theme button changes this too, so "Active look" stays true.
  React.useEffect(() => subscribeTheme(() => setMode(getColorMode())), []);
  const [showBoutiqueDetails, setShowBoutiqueDetails] = useState(false);
  const [activeModal, setActiveModal] = useState(null); // 'language' | 'appearance' | 'workspace' | 'whatsapp' | 'invoice' | 'tiers' | 'summary'

  // The address a customer or staff member opens, as the My profile page shows it.
  const webAddress = currentUser?.shop_slug
    ? `${window.location.origin}/${currentUser.shop_slug}`
    : (localStorage.getItem('tenant_id') || '--');
  const [copiedField, setCopiedField] = useState('');
  const [photoBusy, setPhotoBusy] = useState(false);

  const copyField = async (key, text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(key);
      setTimeout(() => setCopiedField(''), 2000);
    } catch {
      /* clipboard write failed */
    }
  };

  // The signed-in person's own photo, saved the way the My profile page saves it.
  const handlePhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const bad = imageFilesError([file]);
    if (bad) { alert(bad); return; }
    setPhotoBusy(true);
    try {
      onUserUpdated(await api.updateMyPhoto(file));
    } catch (err) {
      alert(err.message || 'Could not update your photo.');
    } finally {
      setPhotoBusy(false);
    }
  };

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/${currentUser?.shop_slug || ''}`
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard write failed */
    }
  };

  const modes = [
    ['light', t('settingsPage.modeLight', 'Light'), Sun, 'Clean, high-visibility bright layout'],
    ['dark', t('settingsPage.modeDark', 'Dark'), Moon, 'Deep contrast, comfortable in low light'],
    ['system', t('settingsPage.modeDefault', 'Default'), Monitor, 'Follows your device OS appearance'],
  ];
  
  const isOwner = !currentUser?.role || currentUser?.role === 'Owner';
  const hasInvoiceAccess = isOwner || (currentUser?.admin_tasks || []).includes('invoices.template');
  const hasTierAccess = isOwner || (currentUser?.admin_tasks || []).includes('settings.edit');

  React.useEffect(() => {
    if (isOwner && fetchWhatsAppStatus) {
      fetchWhatsAppStatus();
      const interval = setInterval(fetchWhatsAppStatus, 3000);
      return () => clearInterval(interval);
    }
  }, [fetchWhatsAppStatus, isOwner]);

  const handleReset = async () => {
    setResetting(true);
    try {
      await api.resetWhatsAppStatus();
      if (fetchWhatsAppStatus) {
        await fetchWhatsAppStatus();
      }
    } catch (err) {
      console.error('Failed to reset WhatsApp session:', err);
    } finally {
      setResetting(false);
    }
  };

  // Undefined until the first status answer: the switch waits rather than
  // showing a position nobody has read yet. What the owner just saved wins over
  // the status poll, which goes through the WhatsApp service, can take seconds,
  // and may have set out before the save.
  const platformSendingOn = whatsappStatus.sendingEnabled;
  const boutiqueSendingOn = savedBoutiqueSending ?? whatsappStatus.boutiqueSendingEnabled;
  const sendingKnown = typeof boutiqueSendingOn === 'boolean';
  const sendingOff = platformSendingOn === false || boutiqueSendingOn === false;

  const handleSendingToggle = async (enabled) => {
    setSendingSaving(true);
    setSendingError('');
    try {
      const saved = await api.setWhatsAppSending(enabled);
      setSavedBoutiqueSending(saved.boutiqueSendingEnabled);
    } catch (err) {
      setSendingError(err?.message || t('settingsPage.whatsappSwitchFailed', 'Could not change the WhatsApp switch.'));
    } finally {
      setSendingSaving(false);
    }
  };

  const getModalConfig = () => {
    switch (activeModal) {
      case 'name':
        return {
          title: t('settingsPage.editNameTitle', 'Edit name'),
          subtitle: t('settingsPage.editNameDesc', 'The name shown on your account.'),
          icon: User,
          maxWidth: '520px',
        };
      case 'password':
        return {
          title: t('settingsPage.changePasswordTitle', 'Change password'),
          subtitle: t('settingsPage.changePasswordDesc', 'Enter your current password, then choose a new one.'),
          icon: KeyRound,
          maxWidth: '520px',
        };
      case 'language':
        return {
          title: t('settingsPage.languageSectionTitle', 'Language & Regional'),
          subtitle: t('settingsPage.languageSectionDesc', 'Select your preferred interface display language'),
          icon: Globe,
          maxWidth: '680px',
        };
      case 'appearance':
        return {
          title: t('settingsPage.appearanceTitle', 'Appearance & Theme'),
          subtitle: t('settingsPage.appearanceDesc', 'Light or dark, customized for this device'),
          icon: SunMoon,
          maxWidth: '680px',
        };
      case 'workspace':
        return {
          title: t('settingsPage.systemSectionTitle', 'Workspace & Boutique Info'),
          subtitle: t('settingsPage.systemSectionDesc', 'Boutique details, active session and sign-in URL'),
          icon: ShieldCheck,
          maxWidth: '580px',
        };
      case 'whatsapp':
        return {
          title: t('settingsPage.whatsappTitle', 'WhatsApp Integration'),
          subtitle: t('settingsPage.whatsappSubtitle', 'Link boutique WhatsApp account for automated messages'),
          icon: MessageSquare,
          maxWidth: '640px',
        };
      case 'invoice':
        return {
          title: t('settingsPage.invoiceTemplateTitle', 'Invoice Template Selection'),
          subtitle: t('settingsPage.invoiceTemplateSubtitle', 'Select design style before generating customer invoices'),
          icon: FileText,
          maxWidth: '740px',
        };
      case 'tiers':
        return {
          title: 'Customer Tiers',
          subtitle: 'Give the three customer tiers your boutique own custom names',
          icon: Crown,
          maxWidth: '580px',
        };
      case 'summary':
        return {
          title: t('summarySettings.title', 'Daily Summary Notifications'),
          subtitle: t('summarySettings.subtitle', 'Each person gets a summary of their work at 11 PM. Choose recipients and language.'),
          icon: Clock,
          maxWidth: '780px',
        };
      default:
        return null;
    }
  };

  const modalConfig = getModalConfig();

  return (
    <div className="settings-ref-page">
      {/* 1. Header Row: Title on Left, [A] Hi, Aditi v on Right in same row */}
      <div className="settings-header-row">
        <div className="settings-header-text">
          <p className="settings-page-subtitle">{t('settingsPage.subtitle', 'Language, appearance, WhatsApp and the look of your invoices.')}</p>
        </div>
      </div>

      {/* 2. Boutique Overview Banner */}
      <div className="settings-profile-banner">
        {/* Left Green Block */}
        <div className="settings-profile-left">
          <div className="settings-profile-header">
            <div className="settings-profile-photo">
              <div className="settings-profile-photo-ring">
                <UserAvatar user={currentUser} size={72} />
              </div>
              {onUserUpdated && (
                <label className="settings-profile-camera" title="Change photo">
                  {photoBusy ? <RotateCw size={14} className="spin" /> : <Camera size={14} />}
                  <input type="file" accept="image/*" capture="environment" hidden aria-label="Change photo"
                         disabled={photoBusy} onChange={handlePhoto} />
                </label>
              )}
            </div>
            <div className="settings-profile-info">
              <span className="settings-profile-name">
                {currentUser?.first_name ? currentUser.first_name + ' ' + (currentUser.last_name || '') : (currentUser?.email || 'Boutique Owner')}
                {onUserUpdated && (
                  <button type="button" className="settings-profile-edit" onClick={() => setActiveModal('name')}
                          title={t('settingsPage.editNameTitle', 'Edit name')} aria-label={t('settingsPage.editNameTitle', 'Edit name')}>
                    <Pencil size={13} />
                  </button>
                )}
              </span>
              <span className="settings-profile-role">
                {currentUser?.role || 'Owner'}
              </span>
            </div>
          </div>

          <div className="settings-profile-meta">
            <div className="settings-profile-meta-item">
              <span className="settings-profile-meta-label">Boutique</span>
              <span className="settings-profile-meta-value">
                {boutiqueSettings?.name || 'Scaleezy Atelier'}
              </span>
            </div>

            <div className="settings-profile-meta-item">
              <span className="settings-profile-meta-label">Shop ID</span>
              <span className="settings-profile-meta-value">
                <span>{currentUser?.shop_slug || 'scaleezy'}</span>
                <button
                  type="button"
                  onClick={handleCopyUrl}
                  title="Copy boutique URL"
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--brand-link, #166534)', display: 'inline-flex', alignItems: 'center' }}
                >
                  {copied ? <Check size={14} color="var(--success-color)" /> : <Copy size={14} />}
                </button>
              </span>
            </div>
          </div>
        </div>

        {/* Right Details Block */}
        <div className="settings-profile-right">
          <div className="settings-profile-details-grid">
            <div className="settings-profile-field">
              <span className="settings-profile-field-label">{t('accountPage.tenantDomain', 'Boutique web address')}</span>
              <span className="settings-profile-field-value">
                <span>{webAddress}</span>
                {webAddress !== '--' && (
                  <button type="button" className="settings-profile-copy" onClick={() => copyField('address', webAddress)} aria-label="Copy boutique web address">
                    {copiedField === 'address' ? <Check size={14} color="var(--success-color)" /> : <Copy size={14} />}
                  </button>
                )}
              </span>
            </div>

            <div className="settings-profile-field">
              <span className="settings-profile-field-label">Login email</span>
              <span className="settings-profile-field-value">
                <span>{currentUser?.email || 'owner@scaleezy.com'}</span>
                {currentUser?.email && (
                  <button type="button" className="settings-profile-copy" onClick={() => copyField('email', currentUser.email)} aria-label="Copy email">
                    {copiedField === 'email' ? <Check size={14} color="var(--success-color)" /> : <Copy size={14} />}
                  </button>
                )}
              </span>
            </div>

            <div className="settings-profile-field">
              <span className="settings-profile-field-label">Timezone</span>
              <span className="settings-profile-field-value">{boutiqueSettings?.timezone || 'Asia/Kolkata (IST)'}</span>
            </div>

            <div className="settings-profile-field">
              <span className="settings-profile-field-label">Active look</span>
              <span className="settings-profile-field-value">
                <span style={{ textTransform: 'capitalize' }}>{mode}</span>
                <button
                  type="button"
                  onClick={() => setActiveModal('appearance')}
                  style={{ background: 'none', border: 'none', padding: 0, color: 'var(--brand-link, #166534)', fontWeight: 600, fontSize: '12px', cursor: 'pointer', textDecoration: 'underline' }}
                >
                  Change
                </button>
              </span>
            </div>

            <div className="settings-profile-field">
              <span className="settings-profile-field-label">Signed in as</span>
              <span className="settings-profile-field-value">
                <span className="ui-badge" style={{ background: 'var(--accent-color)', color: 'var(--text-primary)', border: '1px solid var(--accent-border)' }}>
                  {currentUser?.role || 'Owner'}
                </span>
              </span>
            </div>

            {onUserUpdated && (
              <div className="settings-profile-field">
                <span className="settings-profile-field-label">{t('settingsPage.passwordLabel', 'Password')}</span>
                <span className="settings-profile-field-value">
                  <span aria-hidden="true">••••••••</span>
                  <button
                    type="button"
                    onClick={() => setActiveModal('password')}
                    aria-label={t('settingsPage.changePasswordTitle', 'Change password')}
                    style={{ background: 'none', border: 'none', padding: 0, color: 'var(--brand-link, #166534)', fontWeight: 600, fontSize: '12px', cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    Change
                  </button>
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3. Category Cards Grid with Clickable Text Links */}
      <div className="settings-cats-grid">
        {/* Card 1: Your Shop */}
        <div className="settings-cat-card">
          <div className="settings-cat-header">
            <div className="settings-cat-icon-chip">
              <Store size={20} />
            </div>
            <h3 className="settings-cat-title">Your shop</h3>
          </div>
          <div className="settings-cat-list">
            {/* The owner, or a role handed settings.edit: the server refuses
                everyone else, so the line is not drawn for them. */}
            {hasTierAccess && onBoutiqueUpdated && (
              <button
                type="button"
                className="settings-cat-item"
                onClick={() => setShowBoutiqueDetails(true)}
              >
                <span className="settings-cat-item-text">
                  <span>{t('settingsPage.boutiqueDetailsTitle', 'Boutique details')}</span>
                  <ChevronRight size={14} color="var(--text-secondary)" />
                </span>
              </button>
            )}

            <button
              type="button"
              className="settings-cat-item"
              onClick={() => setActiveModal('workspace')}
            >
              <span className="settings-cat-item-text">
                <span>Name, logo and bill details</span>
                <ChevronRight size={14} color="var(--text-secondary)" />
              </span>
            </button>

            <button
              type="button"
              className="settings-cat-item"
              onClick={() => setActiveModal('language')}
            >
              <span className="settings-cat-item-text">
                <span>Language & regional</span>
                <ChevronRight size={14} color="var(--text-secondary)" />
              </span>
            </button>

            <button
              type="button"
              className="settings-cat-item"
              onClick={() => setActiveModal('appearance')}
            >
              <span className="settings-cat-item-text">
                <span>Appearance & theme</span>
                <ChevronRight size={14} color="var(--text-secondary)" />
              </span>
            </button>
          </div>
        </div>

        {/* Card 2: Team and access */}
        <div className="settings-cat-card">
          <div className="settings-cat-header">
            <div className="settings-cat-icon-chip">
              <MessageSquare size={20} />
            </div>
            <h3 className="settings-cat-title">Team & alerts</h3>
          </div>
          <div className="settings-cat-list">
            {isOwner && (
              <button
                type="button"
                className="settings-cat-item"
                onClick={() => setActiveModal('whatsapp')}
              >
                <span className="settings-cat-item-text">
                  <span>WhatsApp integration</span>
                  <ChevronRight size={14} color="var(--text-secondary)" />
                </span>
              </button>
            )}

            {isOwner && (
              <button
                type="button"
                className="settings-cat-item"
                onClick={() => setActiveModal('summary')}
              >
                <span className="settings-cat-item-text">
                  <span>Daily summary notifications</span>
                  <ChevronRight size={14} color="var(--text-secondary)" />
                </span>
              </button>
            )}

            {!isOwner && (
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', padding: '6px 0' }}>
                Standard staff account permissions active.
              </div>
            )}
          </div>
        </div>

        {/* Card 3: Invoicing */}
        <div className="settings-cat-card">
          <div className="settings-cat-header">
            <div className="settings-cat-icon-chip">
              <FileText size={20} />
            </div>
            <h3 className="settings-cat-title">Invoicing</h3>
          </div>
          <div className="settings-cat-list">
            {hasInvoiceAccess ? (
              <button
                type="button"
                className="settings-cat-item"
                onClick={() => setActiveModal('invoice')}
              >
                <span className="settings-cat-item-text">
                  <span>Invoice template styles</span>
                  <ChevronRight size={14} color="var(--text-secondary)" />
                </span>
              </button>
            ) : (
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', padding: '6px 0' }}>
                Invoice template managed by boutique owner.
              </div>
            )}
          </div>
        </div>

        {/* Card 4: Customer tiers */}
        <div className="settings-cat-card">
          <div className="settings-cat-header">
            <div className="settings-cat-icon-chip">
              <Crown size={20} />
            </div>
            <h3 className="settings-cat-title">Customer tiers</h3>
          </div>
          <div className="settings-cat-list">
            {hasTierAccess ? (
              <button
                type="button"
                className="settings-cat-item"
                onClick={() => setActiveModal('tiers')}
              >
                <span className="settings-cat-item-text">
                  <span>Tier names & loyalty badges</span>
                  <ChevronRight size={14} color="var(--text-secondary)" />
                </span>
              </button>
            ) : (
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', padding: '6px 0' }}>
                Tier names managed by boutique owner.
              </div>
            )}
          </div>
        </div>
      </div>

      {showBoutiqueDetails && (
        <BoutiqueDetailsCard
          settings={boutiqueSettings}
          onSaved={onBoutiqueUpdated}
          onClose={() => setShowBoutiqueDetails(false)}
        />
      )}

      {/* 4. Interactive Modal Popup for Selected Setting */}
      {activeModal && modalConfig && (
        <div
          className="settings-modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setActiveModal(null);
          }}
        >
          <div
            className="settings-modal-dialog"
            style={{ maxWidth: modalConfig.maxWidth }}
            role="dialog"
            aria-modal="true"
          >
            {/* Modal Header */}
            <div className="settings-modal-header">
              <div className="settings-modal-header-left">
                <div className="settings-icon-chip">
                  <modalConfig.icon size={18} />
                </div>
                <div>
                  <h3 className="settings-modal-title">{modalConfig.title}</h3>
                  <p className="settings-modal-subtitle">{modalConfig.subtitle}</p>
                </div>
              </div>
              <button
                type="button"
                className="settings-modal-close-btn"
                onClick={() => setActiveModal(null)}
                aria-label="Close dialog"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Body with Perfectly Aligned Content */}
            <div className={`settings-modal-content${activeModal === 'invoice' ? ' settings-modal-content--invoice' : ''}`}>
              {/* Own name and password: the same forms as the My profile page. */}
              {(activeModal === 'name' || activeModal === 'password') && currentUser && (
                <MyDetails key={activeModal} user={currentUser} onUser={onUserUpdated} only={activeModal} />
              )}

              {/* 1. Language Modal: Interactive Language Cards Grid */}
              {activeModal === 'language' && (
                <div>
                  <div className="settings-lang-grid">
                    {LANGUAGES_DATA.map((langItem) => {
                      const isCurrent = language === langItem.code;
                      return (
                        <div
                          key={langItem.code}
                          className={`settings-lang-card${isCurrent ? ' settings-lang-card--active' : ''}`}
                          onClick={() => setLanguage(langItem.code)}
                          role="button"
                          tabIndex={0}
                        >
                          <div>
                            <div className="settings-lang-native">{langItem.native}</div>
                            <div className="settings-lang-english">{langItem.english} ({langItem.code.toUpperCase()})</div>
                          </div>
                          {isCurrent && (
                            <Check size={18} color="var(--primary-color)" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 2. Appearance Modal: 3 Interactive Visual Theme Cards */}
              {activeModal === 'appearance' && (
                <div>
                  <div className="ui-eyebrow" style={{ marginBottom: '14px' }}>
                    Choose Workspace Look
                  </div>
                  <div className="settings-theme-cards-grid">
                    {modes.map(([key, label, Icon, desc]) => {
                      const isSelected = mode === key;
                      return (
                        <div
                          key={key}
                          className={`settings-theme-card${isSelected ? ' settings-theme-card--active' : ''}`}
                          onClick={() => { setColorMode(key); setMode(key); }}
                          role="button"
                          tabIndex={0}
                        >
                          <div className={`settings-theme-preview settings-theme-preview--${key}`}>
                            <div className="settings-theme-preview-header">
                              <span className="settings-theme-preview-dot" />
                              <span className="settings-theme-preview-dot" />
                              <span className="settings-theme-preview-dot" />
                            </div>
                            <div className="settings-theme-preview-body">
                              <div className="settings-theme-preview-line settings-theme-preview-line--title" />
                              <div className="settings-theme-preview-line settings-theme-preview-line--sub" />
                            </div>
                          </div>
                          <div className="settings-theme-info">
                            <div className="settings-theme-name">
                              <Icon size={16} />
                              <span>{label}</span>
                              {isSelected && <Check size={16} color="var(--primary-color)" style={{ marginLeft: 'auto' }} />}
                            </div>
                            <div className="settings-theme-desc">{desc}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 3. Workspace Modal: Structured Info Cards */}
              {activeModal === 'workspace' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div className="settings-info-list">
                    <div className="settings-info-item">
                      <div className="settings-info-label">
                        <User size={16} />
                        <span>{t('settingsPage.activeUser', 'Signed in as')}</span>
                      </div>
                      <div className="settings-info-value">
                        <span className="ui-badge" style={{ background: 'var(--accent-color)', color: 'var(--text-primary)', border: '1px solid var(--accent-border)', fontWeight: 600, padding: '4px 10px', borderRadius: '12px', fontSize: '12.5px' }}>
                          {currentUser?.role || 'Owner'} {currentUser?.first_name ? '(' + currentUser.first_name + ')' : (currentUser?.email ? '(' + currentUser.email.split('@')[0] + ')' : '')}
                        </span>
                      </div>
                    </div>

                    <div className="settings-info-item">
                      <div className="settings-info-label">
                        <Building size={16} />
                        <span>{t('settingsPage.boutiqueName', 'Boutique Name')}</span>
                      </div>
                      <div className="settings-info-value">
                        {boutiqueSettings?.name || 'Scaleezy Atelier'}
                      </div>
                    </div>

                    <div className="settings-info-item">
                      <div className="settings-info-label">
                        <Clock size={16} />
                        <span>{t('settingsPage.timezone', 'Time zone & currency')}</span>
                      </div>
                      <div className="settings-info-value">
                        {boutiqueSettings?.timezone || 'Asia/Kolkata (IST)'}
                      </div>
                    </div>

                    <div className="settings-info-item">
                      <div className="settings-info-label">
                        <Globe size={16} />
                        <span>Login email</span>
                      </div>
                      <div className="settings-info-value">
                        {currentUser?.email || '--'}
                      </div>
                    </div>
                  </div>

                  {currentUser?.shop_slug && (
                    <div style={{ padding: '16px', background: 'var(--surface-inset)', borderRadius: 'var(--radius-lg, 12px)', border: '1px solid var(--border-color)' }}>
                      <div className="ui-eyebrow" style={{ marginBottom: '8px' }}>Boutique Sign-In Address</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--surface-color)', padding: '10px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                        <Link2 size={16} color="var(--brand-link, #166534)" flexShrink={0} />
                        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', flex: 1, overflowWrap: 'anywhere' }}>
                          {window.location.origin + '/' + currentUser.shop_slug}
                        </span>
                        <button
                          type="button"
                          onClick={handleCopyUrl}
                          className="btn-secondary"
                          style={{ fontSize: '12px', padding: '6px 14px', flexShrink: 0, borderRadius: 'var(--radius-md)' }}
                        >
                          {copied ? (
                            <>
                              <Check size={14} color="var(--success-color)" /> Copied
                            </>
                          ) : (
                            <>
                              <Copy size={14} /> Copy
                            </>
                          )}
                        </button>
                      </div>
                      <p style={{ margin: '8px 0 0', fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                        Staff and customers can use this URL to directly reach your boutique portal.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* 4. WhatsApp Modal: Clean Stepper & Pairing Container */}
              {activeModal === 'whatsapp' && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid var(--border-color)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: whatsappStatus.connected ? 'var(--success-color)' : (whatsappStatus.qrCode ? '#f59e0b' : 'var(--text-secondary)') }} />
                      <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                        Status: {whatsappStatus.connected ? 'Connected' : (whatsappStatus.qrCode ? 'Waiting for Scan' : 'Disconnected')}
                      </span>
                    </div>

                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ fontSize: '12px', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px', borderRadius: 'var(--radius-md)' }}
                      onClick={handleReset}
                      disabled={resetting}
                    >
                      <RefreshCw size={13} className={resetting ? 'spin' : ''} />
                      <span>{resetting ? t('settingsPage.resetting', 'Resetting...') : t('settingsPage.resetSession', 'Reset Session')}</span>
                    </button>
                  </div>

                  {/* Connected and allowed to send are separate: this decides
                      whether anything goes out, whatever the connection says. */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', marginBottom: '16px', padding: '14px 16px', background: 'var(--surface-inset)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)' }}>
                    <label htmlFor="whatsapp-sending-switch" style={{ margin: 0, cursor: platformSendingOn === false ? 'default' : 'pointer' }}>
                      <span style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                        {t('settingsPage.whatsappSendingLabel', 'Send WhatsApp messages')}
                      </span>
                      <span style={{ display: 'block', fontSize: '12.5px', fontWeight: 400, color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                        {!sendingKnown
                          ? t('settingsPage.whatsappSendingChecking', 'Checking whether messages are on...')
                          : platformSendingOn === false
                          ? t('settingsPage.whatsappSendingPlatformOff', 'Turned off for the whole platform by the administrator, so nothing is sent and this switch cannot override it.')
                          : boutiqueSendingOn === false
                            ? t('settingsPage.whatsappSendingOff', 'Off: order updates, invoices, birthday wishes and appointment confirmations are not sent, even while WhatsApp is connected. Turning this on does not send what was missed. Website sign-in codes still go out.')
                            : t('settingsPage.whatsappSendingOn', 'On: order updates, invoices, birthday wishes and appointment confirmations go out automatically while WhatsApp is connected.')}
                      </span>
                    </label>
                    <input
                      id="whatsapp-sending-switch"
                      type="checkbox"
                      role="switch"
                      checked={sendingKnown && platformSendingOn !== false && boutiqueSendingOn}
                      disabled={!sendingKnown || sendingSaving || platformSendingOn === false}
                      onChange={(e) => handleSendingToggle(e.target.checked)}
                      style={{ width: '18px', height: '18px', flexShrink: 0, marginTop: '2px', accentColor: 'var(--primary-color)', cursor: platformSendingOn === false ? 'not-allowed' : 'pointer' }}
                    />
                  </div>
                  {sendingError && (
                    <div role="alert" style={{ marginBottom: '16px', fontSize: '12.5px', color: 'var(--danger-color)' }}>{sendingError}</div>
                  )}

                  {whatsappStatus.connected ? (
                    <div style={{ padding: '20px', background: 'var(--success-bg)', border: '1px solid color-mix(in srgb, var(--success-color) 40%, transparent)', borderRadius: 'var(--radius-lg)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                        <CheckCircle2 size={20} color="var(--success-color)" />
                        <span style={{ fontWeight: 700, fontSize: '15px', color: 'var(--success-text)' }}>
                          {sendingOff
                            ? t('settingsPage.connectedNotSendingTitle', 'WhatsApp Connected, Sending Off')
                            : t('settingsPage.connectedTitle', 'WhatsApp Connected & Active')}
                        </span>
                      </div>
                      <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                        {sendingOff
                          ? t('settingsPage.connectedNotSendingDesc', 'This number is linked, but customers are not being messaged.')
                          : t('settingsPage.connectedDesc', 'Automated customer order receipts, stage progress updates, and delivery alerts are actively delivering.')}
                      </div>
                      <div style={{ marginTop: '18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '14px', borderTop: '1px solid color-mix(in srgb, var(--success-color) 25%, transparent)' }}>
                        <span className="ui-badge" style={{ background: 'var(--surface-color)', color: 'var(--success-text)', border: '1px solid color-mix(in srgb, var(--success-color) 30%, transparent)', fontWeight: 600 }}>
                          {sendingOff
                            ? t('settingsPage.connectedNotSendingBadge', 'Connected, Not Sending')
                            : t('settingsPage.connectedBadge', 'Active & Connected')}
                        </span>
                        <button
                          type="button"
                          style={{ background: 'none', border: 'none', color: 'var(--danger-color)', fontSize: '12.5px', cursor: 'pointer', fontWeight: 600, textDecoration: 'underline' }}
                          onClick={handleReset}
                        >
                          {t('settingsPage.disconnectRepair', 'Disconnect & Re-pair')}
                        </button>
                      </div>
                    </div>
                  ) : whatsappStatus.qrCode ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(200px, 240px)', gap: '20px', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
                          Pair with your phone
                        </div>
                        <p style={{ margin: '0 0 14px 0', fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                          Scan the QR code with WhatsApp on your mobile phone to connect this boutique account.
                        </p>

                        <div className="settings-qr-instruction-steps">
                          <div className="settings-qr-step">
                            <span className="settings-qr-step-num">1</span>
                            <span>Open WhatsApp on your phone</span>
                          </div>
                          <div className="settings-qr-step">
                            <span className="settings-qr-step-num">2</span>
                            <span>Tap <strong>Settings</strong> or <strong>Menu</strong> &gt; <strong>Linked Devices</strong></span>
                          </div>
                          <div className="settings-qr-step">
                            <span className="settings-qr-step-num">3</span>
                            <span>Point your camera at this QR code</span>
                          </div>
                        </div>
                      </div>

                      <div className="settings-qr-box">
                        <img
                          src={whatsappStatus.qrCode}
                          alt="WhatsApp Link QR Code"
                          style={{ width: '170px', height: '170px', objectFit: 'contain', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', padding: '6px', background: '#ffffff' }}
                        />
                        <div style={{ marginTop: '12px', fontSize: '12px', color: 'var(--success-text)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <RotateCw size={14} className="spin" /> {t('settingsPage.waitingQrScan', 'Waiting for QR scan...')}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ padding: '28px 24px', border: '1px dashed var(--border-strong)', borderRadius: 'var(--radius-lg)', background: 'var(--surface-inset)', textAlign: 'center' }}>
                      <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--success-bg)', color: 'var(--success-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                        <MessageSquare size={20} />
                      </div>
                      <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text-primary)', marginBottom: '6px' }}>
                        {t('settingsPage.linkWhatsAppAccount', 'Link WhatsApp Account')}
                      </div>
                      <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '18px', maxWidth: '380px', margin: '0 auto 18px', lineHeight: 1.45 }}>
                        {t('settingsPage.linkWhatsAppDesc', 'Click below to generate WhatsApp QR code for scanning.')}
                      </div>
                      <button
                        type="button"
                        className="btn-primary"
                        style={{ width: '100%', maxWidth: '280px', margin: '0 auto', justifyContent: 'center', gap: '8px' }}
                        onClick={handleReset}
                        disabled={resetting}
                      >
                        <RotateCw size={14} className={resetting ? 'spin' : ''} />
                        <span>{resetting ? t('settingsPage.generatingQrCode', 'Generating QR Code...') : t('settingsPage.generateQrCode', 'Generate WhatsApp QR Code')}</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* 5. Invoice Template Modal: Clean Embedded Mode Without Duplicate Headers */}
              {activeModal === 'invoice' && (
                <InvoiceTemplateSelector currentUser={currentUser} hideHeader={true} />
              )}

              {/* 6. Customer Tiers Modal: Clean Embedded Mode Without Duplicate Headers */}
              {activeModal === 'tiers' && (
                <TierNamesSettings
                  key={boutiqueSettings ? 'loaded' : 'loading'}
                  iconChip={iconChip}
                  tierNames={boutiqueSettings?.tier_names}
                  onSaved={onTierNamesSaved}
                  hideHeader={true}
                />
              )}

              {/* 7. Daily Summary Modal: Clean Embedded Mode Without Duplicate Headers */}
              {activeModal === 'summary' && (
                <DailySummarySettings iconChip={iconChip} hideHeader={true} />
              )}
            </div>

            {/* Modal Footer */}
            <div className="settings-modal-footer">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setActiveModal(null)}
                style={{ fontSize: '13px', padding: '8px 20px', borderRadius: 'var(--radius-md)', fontWeight: 600 }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SettingsPage;
