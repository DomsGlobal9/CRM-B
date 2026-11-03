import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext.jsx';

/**
 * The wizard's bar along the bottom: back, save as draft, and the next step
 * (or place the order).
 */
export default function WizardFooter({ wizard, ctaBusy, serviceType, wizardStepKey }) {
  const { handleBack, handleNext, handleSaveDraft } = wizard;
  const { t } = useLanguage();
  return (
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
  );
}
