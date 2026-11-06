import { X } from 'lucide-react';

/** The frame around every settings popup: its heading, its body and Done. */
export default function SettingsModal({ activeModal, modalConfig, setActiveModal, children }) {
  return (
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
          {children}
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
  );
}
