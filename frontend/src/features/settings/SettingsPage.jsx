import React, { useState } from 'react';
import { useLanguage } from '../../i18n/LanguageContext.jsx';
import { InvoiceTemplateSelector } from '../invoices/InvoiceTemplateSelector.jsx';
import DailySummarySettings from './DailySummarySettings.jsx';
import TierNamesSettings from './TierNamesSettings.jsx';
import MyDetails from '../staff/MyDetails.jsx';
import BoutiqueDetailsCard from './BoutiqueDetailsCard.jsx';
import ProfileBanner from './ProfileBanner.jsx';
import SettingsCategories from './SettingsCategories.jsx';
import SettingsModal from './SettingsModal.jsx';
import { AppearancePanel, LanguagePanel, WorkspacePanel } from './SettingsPanels.jsx';
import WhatsAppPanel from './WhatsAppPanel.jsx';
import { getModalConfig } from './settingsModalConfig.js';
import { useWhatsAppControls } from './useWhatsAppControls.js';
import { getColorMode, subscribeTheme } from '../../styles/theme.js';
import { userIsOwner } from '../../constants/roles';

/** Settings: the banner, the category cards, and whichever popup is open. */

const iconChip = {
  width: '40px', height: '40px', borderRadius: 'var(--radius-md)', flexShrink: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'var(--accent-color)', color: 'var(--accent-text)',
};

export const SettingsPage = ({
  currentUser,
  boutiqueSettings,
  onTierNamesSaved,
  whatsappStatus = { connected: false, status: 'disconnected', qrCode: null },
  fetchWhatsAppStatus,
  onUserUpdated,
  onBoutiqueUpdated,
}) => {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);
  const [mode, setMode] = useState(getColorMode);
  // The top bar's theme button changes this too, so "Active look" stays true.
  React.useEffect(() => subscribeTheme(() => setMode(getColorMode())), []);
  const [showBoutiqueDetails, setShowBoutiqueDetails] = useState(false);
  const [activeModal, setActiveModal] = useState(null); // 'language' | 'appearance' | 'workspace' | 'whatsapp' | 'invoice' | 'tiers' | 'summary'

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

  const isOwner = userIsOwner(currentUser);
  const hasInvoiceAccess = isOwner || (currentUser?.admin_tasks || []).includes('invoices.template');
  const hasTierAccess = isOwner || (currentUser?.admin_tasks || []).includes('settings.edit');

  const whatsapp = useWhatsAppControls({ whatsappStatus, fetchWhatsAppStatus, isOwner, t });
  const modalConfig = getModalConfig(activeModal, t);

  return (
    <div className="settings-ref-page">
      {/* 2. Boutique Overview Banner */}
      <ProfileBanner currentUser={currentUser} boutiqueSettings={boutiqueSettings} onUserUpdated={onUserUpdated}
                     mode={mode} copied={copied} handleCopyUrl={handleCopyUrl} setActiveModal={setActiveModal} />

      {/* 3. Category Cards Grid with Clickable Text Links */}
      <SettingsCategories isOwner={isOwner} hasInvoiceAccess={hasInvoiceAccess} hasTierAccess={hasTierAccess}
                          onBoutiqueUpdated={onBoutiqueUpdated} setActiveModal={setActiveModal}
                          setShowBoutiqueDetails={setShowBoutiqueDetails} />

      {showBoutiqueDetails && (
        <BoutiqueDetailsCard
          settings={boutiqueSettings}
          onSaved={onBoutiqueUpdated}
          onClose={() => setShowBoutiqueDetails(false)}
        />
      )}

      {/* 4. Interactive Modal Popup for Selected Setting */}
      {activeModal && modalConfig && (
        <SettingsModal activeModal={activeModal} modalConfig={modalConfig} setActiveModal={setActiveModal}>
          {/* Own name and password: the same forms as the My profile page. */}
          {(activeModal === 'name' || activeModal === 'password') && currentUser && (
            <MyDetails key={activeModal} user={currentUser} onUser={onUserUpdated} only={activeModal} />
          )}

          {/* 1. Language Modal: Interactive Language Cards Grid */}
          {activeModal === 'language' && (
            <LanguagePanel />
          )}

          {/* 2. Appearance Modal: 3 Interactive Visual Theme Cards */}
          {activeModal === 'appearance' && (
            <AppearancePanel mode={mode} setMode={setMode} />
          )}

          {/* 3. Workspace Modal: Structured Info Cards */}
          {activeModal === 'workspace' && (
            <WorkspacePanel currentUser={currentUser} boutiqueSettings={boutiqueSettings} copied={copied} handleCopyUrl={handleCopyUrl} />
          )}

          {/* 4. WhatsApp Modal: Clean Stepper & Pairing Container */}
          {activeModal === 'whatsapp' && (
            <WhatsAppPanel whatsappStatus={whatsappStatus} {...whatsapp} />
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
        </SettingsModal>
      )}
    </div>
  );
};

export default SettingsPage;
