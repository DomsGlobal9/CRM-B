import { X } from 'lucide-react';
import VoiceTextarea from '../../components/ui/VoiceTextarea';
import { LIMITS, cleanAmount } from '../../utils/validate';
import { useLanguage } from '../../i18n/LanguageContext.jsx';

/**
 * Outside garment, screen 3: what needs changing on a garment stitched elsewhere,
 * and the charge.
 */
export default function OutsideIssueStep({ outsideForm, setOutsideForm, setWizardError, wizardError }) {
  const { t } = useLanguage();
  return (
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
  );
}
