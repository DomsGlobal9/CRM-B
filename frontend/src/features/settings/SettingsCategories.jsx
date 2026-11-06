import { ChevronRight, Crown, FileText, MessageSquare, Store } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext.jsx';

/** The category cards on Settings, each listing the popups it opens. */
export default function SettingsCategories({ isOwner, hasInvoiceAccess, hasTierAccess, onBoutiqueUpdated, setActiveModal, setShowBoutiqueDetails }) {
  const { t } = useLanguage();
  return (
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
  );
}
