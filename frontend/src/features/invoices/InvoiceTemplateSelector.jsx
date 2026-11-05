import React, { useState, useEffect } from 'react';
import { api } from '../../api';
import { InvoiceRenderer, normalizeInvoiceData } from './InvoiceTemplates';
import { Check, Sparkles, AlertCircle, Loader2, Eye, ChevronLeft, ChevronRight } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext.jsx';
import Loader from '../../components/ui/Loader';

const TEMPLATE_OPTIONS = [
  {
    id: 'classic',
    name: 'Classic Template',
    tagline: 'Traditional & Formal',
    description: 'Clean, timeless layout with structured lines and prominent boutique header.'
  },
  {
    id: 'modern',
    name: 'Modern Template',
    tagline: 'Sleek & Contemporary',
    description: 'Dark accent header banner, crisp modern typography, and colored status badges.'
  },
  {
    id: 'elegant',
    name: 'Elegant Template',
    tagline: 'Luxury & Haute Couture',
    description: 'Refined serif typography, warm golden accents, and luxury sign-off footer.'
  }
];

export const InvoiceTemplateSelector = ({ currentUser, hideHeader = false }) => {
  const { t } = useLanguage();
  // The owner, or a role handed the invoice design (core/admin_access.py).
  const isOwner = !currentUser?.role || currentUser?.role === 'Owner'
    || (currentUser?.admin_tasks || []).includes('invoices.template');
  const [selectedTemplate, setSelectedTemplate] = useState('classic');
  const [availableTemplates, setAvailableTemplates] = useState(TEMPLATE_OPTIONS);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState('');
  
  const [previewModalTemplate, setPreviewModalTemplate] = useState(null);

  const getTemplateDetails = (tplId) => {
    switch (tplId) {
      case 'classic':
        return {
          id: 'classic',
          name: t('settingsPage.classicName', 'Classic Template'),
          tagline: t('settingsPage.classicTagline', 'Traditional & Formal'),
          description: t('settingsPage.classicDesc', 'Clean, timeless layout with structured lines and prominent boutique header.')
        };
      case 'modern':
        return {
          id: 'modern',
          name: t('settingsPage.modernName', 'Modern Template'),
          tagline: t('settingsPage.modernTagline', 'Sleek & Contemporary'),
          description: t('settingsPage.modernDesc', 'Dark accent header banner, crisp modern typography, and colored status badges.')
        };
      case 'elegant':
        return {
          id: 'elegant',
          name: t('settingsPage.elegantName', 'Elegant Template'),
          tagline: t('settingsPage.elegantTagline', 'Luxury & Haute Couture'),
          description: t('settingsPage.elegantDesc', 'Refined serif typography, warm golden accents, and luxury sign-off footer.')
        };
      default:
        return TEMPLATE_OPTIONS.find(t => t.id === tplId) || TEMPLATE_OPTIONS[0];
    }
  };

  const previewData = normalizeInvoiceData(null, null, currentUser);

  useEffect(() => {
    if (!isOwner) return;
    let isMounted = true;
    setLoading(true);
    api.getInvoiceTemplate()
      .then((data) => {
        if (isMounted) {
          if (data?.template) {
            setSelectedTemplate(data.template);
            const idx = TEMPLATE_OPTIONS.findIndex(t => t.id === data.template);
            if (idx !== -1) setCurrentIndex(idx);
          }
          if (data?.templates) {
            setAvailableTemplates(TEMPLATE_OPTIONS);
          }
          setError(null);
        }
      })
      .catch((err) => {
        if (isMounted) {
          console.error("Failed to load invoice template setting:", err);
          setError(err.message || t('settingsPage.failedToLoadTemplate', 'Failed to load template settings.'));
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => { isMounted = false; };
  }, [isOwner, t]);

  const handleSelectTemplate = async (templateId) => {
    if (saving) return;
    setSaving(true);
    setError(null);
    setSuccessMsg('');

    try {
      const res = await api.updateInvoiceTemplate(templateId);
      if (res?.template) {
        setSelectedTemplate(res.template);
        setSuccessMsg(`Invoice template updated to "${getTemplateDetails(templateId).name}".`);
        setTimeout(() => setSuccessMsg(''), 4000);
        setPreviewModalTemplate(null);
      }
    } catch (err) {
      console.error("Failed to save template selection:", err);
      setError(err.message || t('settingsPage.failedToUpdateTemplate', 'Failed to update invoice template.'));
    } finally {
      setSaving(false);
    }
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev + 1) % availableTemplates.length);
  };

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev - 1 + availableTemplates.length) % availableTemplates.length);
  };

  if (!isOwner) {
    return null;
  }

  const currentTemplate = availableTemplates[currentIndex] || availableTemplates[0];
  const currentTplDetails = getTemplateDetails(currentTemplate.id);
  const isSelected = selectedTemplate === currentTemplate.id;

  const cardStyle = hideHeader ? {
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: 0,
    padding: 0,
    boxShadow: 'none',
    display: 'flex',
    flexDirection: 'column',
  } : {
    backgroundColor: 'var(--surface-color)',
    border: '1px solid var(--border-color)',
    borderRadius: 'var(--radius-xl, 16px)',
    padding: '22px',
    boxShadow: 'var(--shadow-card)',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
  };

  return (
    <div className={`settings-card its-card${hideHeader ? ' its-card--embedded' : ' ui-card'}`} style={cardStyle}>
      <div>
        {/* Header - Only shown when not embedded in a modal */}
        {!hideHeader && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ padding: '8px', borderRadius: '10px', backgroundColor: 'var(--accent-color)', color: 'var(--accent-text)' }}>
                <Sparkles size={18} />
              </div>
              <div>
                <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {t('settingsPage.invoiceTemplateTitle', 'Invoice Template Selection')}
                </h2>
                <p style={{ margin: '2px 0 0 0', fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
                  {t('settingsPage.invoiceTemplateSubtitle', 'Choose your desired template style for customer invoices')}
                </p>
              </div>
            </div>
            {saving && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                <Loader2 className="spin" size={14} /> {t('settingsPage.saving', 'Saving...')}
              </div>
            )}
          </div>
        )}

        {saving && hideHeader && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
            <Loader2 className="spin" size={14} /> {t('settingsPage.saving', 'Saving...')}
          </div>
        )}

        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', backgroundColor: 'var(--danger-bg)', border: '1px solid var(--danger-color)', borderRadius: 'var(--radius-md)', color: 'var(--danger-color)', fontSize: '12px', marginBottom: '12px' }}>
            <AlertCircle size={15} />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', backgroundColor: 'var(--success-bg)', border: '1px solid var(--success-color)', borderRadius: 'var(--radius-md)', color: 'var(--success-color)', fontSize: '12px', marginBottom: '12px' }}>
            <Check size={15} />
            <span>{successMsg}</span>
          </div>
        )}

        {loading ? (
          <Loader page label={t('settingsPage.loadingTemplates', 'Loading template settings...')} />
        ) : (
          <div style={{ position: 'relative' }}>
            {/* Single Displayed Template Card */}
            <div
              className="its-tpl"
              style={{
                border: isSelected ? '2px solid var(--primary-color)' : '1px solid var(--border-color)',
                borderRadius: 'var(--radius-lg, 12px)',
                padding: '16px',
                backgroundColor: isSelected ? 'var(--accent-color)' : 'var(--surface-2)',
                position: 'relative',
                transition: 'all 0.25s ease',
                boxShadow: isSelected ? '0 4px 12px color-mix(in srgb, var(--primary-color) 12%, transparent)' : 'none'
              }}
            >
              {/* Header Info */}
              <div className="its-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px', paddingRight: '12px' }}>
                <div>
                  <h3 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 2px 0', color: 'var(--text-primary)' }}>
                    {currentTplDetails.name}
                  </h3>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--accent-text)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    {currentTplDetails.tagline}
                  </span>
                </div>
                {isSelected ? (
                  <span className="its-badge" style={{
                    backgroundColor: 'var(--primary-color)',
                    color: 'var(--primary-foreground)',
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '3px 10px',
                    borderRadius: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}>
                    <Check size={12} /> {t('settingsPage.activeDefault', 'Active Default')}
                  </span>
                ) : (
                  <span className="its-badge" style={{ fontSize: '11px', color: 'var(--text-secondary)', backgroundColor: 'var(--surface-inset)', padding: '3px 8px', borderRadius: '8px', fontWeight: 600 }}>
                    {currentIndex + 1} {t('settingsPage.of', 'of')} {availableTemplates.length}
                  </span>
                )}
              </div>

              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 12px 0', lineHeight: 1.4 }}>
                {currentTplDetails.description}
              </p>

              {/* Scaled Invoice Frame */}
              <div
                className="its-frame"
                onClick={() => setPreviewModalTemplate(currentTemplate)}
                style={{
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md, 8px)',
                  overflow: 'hidden',
                  backgroundColor: '#ffffff',
                  height: hideHeader ? '200px' : '240px',
                  position: 'relative',
                  cursor: 'pointer',
                  boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.03)'
                }}
              >
                <div style={{
                  transform: 'scale(0.35)',
                  transformOrigin: 'top left',
                  width: '280%',
                  padding: '16px',
                  pointerEvents: 'none',
                  userSelect: 'none'
                }}>
                  <InvoiceRenderer template={currentTemplate.id} data={previewData} />
                </div>
                <div style={{
                  position: 'absolute',
                  bottom: '8px',
                  right: '8px',
                  backgroundColor: 'rgba(15, 23, 42, 0.75)',
                  color: '#ffffff',
                  fontSize: '11px',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  backdropFilter: 'blur(2px)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  pointerEvents: 'none'
                }}>
                  <Eye size={12} /> {t('settingsPage.clickToZoomWide', 'Click to Zoom Wide')}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="its-actions" style={{ marginTop: '14px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  disabled={saving}
                  className={isSelected ? 'btn-primary' : 'btn-secondary'}
                  style={{
                    flex: '1 1 0',
                    minWidth: '120px',
                    justifyContent: 'center',
                    fontSize: '13px',
                    padding: '8px 14px',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: isSelected ? 'var(--primary-color)' : undefined,
                    color: isSelected ? 'var(--primary-foreground)' : undefined,
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                  onClick={() => handleSelectTemplate(currentTemplate.id)}
                >
                  {saving ? (
                    <>
                      <Loader2 className="spin" size={14} /> {t('settingsPage.saving', 'Saving...')}
                    </>
                  ) : isSelected ? (
                    <>
                      <Check size={14} /> {t('settingsPage.activeTemplate', 'Active Template')}
                    </>
                  ) : (
                    t('settingsPage.selectTemplate', 'Select Template')
                  )}
                </button>

                <button
                  type="button"
                  className="btn-secondary"
                  style={{
                    flex: '1 1 0',
                    minWidth: '120px',
                    justifyContent: 'center',
                    fontSize: '13px',
                    padding: '8px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    borderRadius: 'var(--radius-md)',
                    fontWeight: 600
                  }}
                  onClick={() => setPreviewModalTemplate(currentTemplate)}
                >
                  <Eye size={14} /> {t('settingsPage.previewWide', 'Preview Wide')}
                </button>
              </div>
            </div>

            {/* Right Arrow Navigation Button */}
            <button
              type="button"
              className="its-arrow its-arrow--next"
              onClick={handleNext}
              style={{
                position: 'absolute',
                top: '50%',
                right: '8px',
                transform: 'translateY(-50%)',
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                backgroundColor: 'var(--surface-color)',
                border: '1px solid var(--border-strong)',
                boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: 'var(--text-primary)',
                zIndex: 10,
                transition: 'all 0.2s ease'
              }}
              title={t('settingsPage.viewNextTemplate', 'View Next Template')}
            >
              <ChevronRight size={20} />
            </button>

            {/* Left Arrow Navigation Button */}
            <button
              type="button"
              className="its-arrow its-arrow--prev"
              onClick={handlePrev}
              style={{
                position: 'absolute',
                top: '50%',
                left: '8px',
                transform: 'translateY(-50%)',
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                backgroundColor: 'var(--surface-color)',
                border: '1px solid var(--border-strong)',
                boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: 'var(--text-primary)',
                zIndex: 10,
                transition: 'all 0.2s ease'
              }}
              title={t('settingsPage.viewPrevTemplate', 'View Previous Template')}
            >
              <ChevronLeft size={20} />
            </button>
          </div>
        )}

        {/* Wide Popup Modal */}
        {previewModalTemplate && (
          <div className="its-modal" style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 99999,
            padding: '20px'
          }}>
            <div className="its-modal-box" style={{
              backgroundColor: 'var(--surface-color)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-xl, 16px)',
              width: '100%',
              maxWidth: '860px',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              overflow: 'hidden'
            }}>
              {/* Modal Header */}
              <div className="its-modal-head" style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '18px 24px',
                borderBottom: '1px solid var(--border-color)',
                backgroundColor: 'var(--surface-2)'
              }}>
                <div>
                  <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {getTemplateDetails(previewModalTemplate.id).name}
                    {selectedTemplate === previewModalTemplate.id && (
                      <span style={{ fontSize: '11px', fontWeight: 700, backgroundColor: 'var(--primary-color)', color: 'var(--primary-foreground)', padding: '2px 8px', borderRadius: '12px' }}>
                        {t('settingsPage.currentlySelected', 'Currently Selected')}
                      </span>
                    )}
                  </h3>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{getTemplateDetails(previewModalTemplate.id).tagline}</span>
                </div>
              </div>

              {/* Modal Body - Wide Invoice Display */}
              <div className="its-modal-body" style={{ padding: '32px 40px', overflowY: 'auto', flex: 1, backgroundColor: 'var(--surface-inset)' }}>
                <div style={{ backgroundColor: '#ffffff', borderRadius: '8px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                  <InvoiceRenderer template={previewModalTemplate.id} data={previewData} />
                </div>
              </div>

              {/* Modal Footer Controls */}
              <div className="its-modal-foot" style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '16px 24px',
                borderTop: '1px solid var(--border-color)',
                backgroundColor: 'var(--surface-2)'
              }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setPreviewModalTemplate(null)}
                  style={{ fontSize: '13px', padding: '8px 16px' }}
                >
                  {t('settingsPage.closePreview', 'Close Preview')}
                </button>
                <button
                  type="button"
                  disabled={saving || selectedTemplate === previewModalTemplate.id}
                  className="btn-primary"
                  style={{
                    fontSize: '13px',
                    padding: '8px 20px',
                    color: 'var(--primary-foreground)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                  onClick={() => handleSelectTemplate(previewModalTemplate.id)}
                >
                  {saving ? (
                    <>
                      <Loader2 className="spin" size={16} /> {t('settingsPage.applying', 'Applying...')}
                    </>
                  ) : selectedTemplate === previewModalTemplate.id ? (
                    <>
                      <Check size={16} /> {t('settingsPage.activeTemplate', 'Active Template')}
                    </>
                  ) : (
                    <>
                      <Check size={16} /> {t('settingsPage.selectAndApplyTemplate', 'Select & Apply Template')}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
