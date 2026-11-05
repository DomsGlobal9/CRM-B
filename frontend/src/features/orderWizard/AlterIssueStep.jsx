import { X } from 'lucide-react';
import VoiceTextarea from '../../components/ui/VoiceTextarea';
import { LIMITS, cleanAmount, imageFilesError } from '../../utils/validate';
import { Dropzone } from '../../components/ui/Atelier';
import { useLanguage } from '../../i18n/LanguageContext.jsx';

/**
 * Alteration, screen 3: what is wrong, free or paid, and anything paid now.
 */
export default function AlterIssueStep({ alterationForm, outsidePhoto, setAlterationForm, setOutsidePhoto, setWizardError, wizardError }) {
  const { t } = useLanguage();
  return (
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
  );
}
