import { Check, X } from 'lucide-react';
import React from 'react';
import { useLanguage } from '../../i18n/LanguageContext.jsx';

/**
 * The wizard's top: the wordmark and draft save state, the close button, and
 * the step bar (which steps are done, which is open, which can be jumped to).
 */
export default function WizardHeader({ wizard, currentStep, draftSaveState, garmentJobs, maxStepReached, serviceType, wizardSteps }) {
  const { canJumpAhead, customerBlank, jumpToStep, leaveWizard, needsMeasurements } = wizard;
  const { t } = useLanguage();
  return (
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
          const canJump = !skipped && stepNum !== currentStep && (stepNum <= maxStepReached || canJumpAhead);
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
                  {skipped ? t('wizard.notNeeded', 'Not needed')
                    : isCompleted && step.key === 'who' && serviceType !== 'alter' && customerBlank() ? t('wizard.customerLater', 'Fill before completing')
                    : isCompleted ? t('wizard.completed', 'Done') : t(`wizard.stepSub.${step.key}`, step.sub)}
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
  );
}
