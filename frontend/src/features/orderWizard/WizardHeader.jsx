import { Check, X } from 'lucide-react';
import React from 'react';
import { useLanguage } from '../../i18n/LanguageContext.jsx';

/**
 * The wizard's top & sidebar:
 * - Left sidebar contains the Scaleezy logo and the vertical steps.
 * - Top-right actions contain autosave state and the close button (without a full-width top bar).
 */
export default function WizardHeader({ wizard, currentStep, draftSaveState, garmentJobs, maxStepReached, serviceType, wizardSteps }) {
  const { canJumpAhead, customerBlank, jumpToStep, leaveWizard, needsMeasurements } = wizard;
  const { t } = useLanguage();

  const autosaveElement = serviceType !== 'alter' && (
    <span className="wizard-autosave-text"
          style={{ fontSize: '12.5px',
                   color: draftSaveState === 'conflict' || draftSaveState === 'failed'
                          ? 'var(--danger-color)' : 'var(--text-secondary)' }}>
      {draftSaveState === 'idle' && t('wizard.autosaveOn', 'Autosaves every minute')}
      {draftSaveState === 'saving' && t('wizard.saving')}
      {draftSaveState === 'saved' && <>{t('wizard.saved')} · {t('wizard.autosaveOn', 'Autosaves every minute')}</>}
      {draftSaveState === 'failed' && t('wizard.couldNotSave')}
      {draftSaveState === 'conflict' && t('wizard.conflict')}
    </span>
  );

  const closeButtonElement = (
    <button type="button" className="btn-ghost wizard-close-btn" aria-label={t('common.close', 'Close')} onClick={leaveWizard}
            style={{ color: 'var(--text-secondary)' }}>
      <X size={20} />
    </button>
  );

  return (
    <>
      {/* Left Sidebar: Logo + Order Steps */}
      <aside className="wizard-sidebar">
        <div className="wizard-sidebar-head">
          <div className="wizard-sidebar-logo">
            <img className="portal-wordmark portal-wordmark--ink" src="/scaleezy-wordmark-dark.webp" alt="Scaleezy" style={{ height: 28 }} />
          </div>
          {/* Mobile-only header actions */}
          <div className="wizard-mobile-actions">
            {autosaveElement}
            {closeButtonElement}
          </div>
        </div>

        <div className="stepper-sidebar-heading">{t('wizard.orderSteps', 'Order Steps')}</div>

        <div className="stepper-progress-bar">
          {wizardSteps.map((step, index) => {
            const stepNum = index + 1;
            const skipped = step.key === 'measure' && garmentJobs.length > 0 && !needsMeasurements();
            const isCompleted = currentStep > stepNum;
            const isActive = currentStep === stepNum;
            const canJump = !skipped && stepNum !== currentStep && (stepNum <= maxStepReached || canJumpAhead);
            const stepStateClass = isCompleted ? 'stepper-step--completed' : (isActive ? 'stepper-step--active' : 'stepper-step--pending');
            return (
              <React.Fragment key={step.key}>
                <div className={`stepper-step ${stepStateClass}${canJump ? ' stepper-step--link' : ''}`}
                     role={canJump ? 'button' : undefined}
                     tabIndex={canJump ? 0 : undefined}
                     aria-current={isActive ? 'step' : undefined}
                     title={canJump ? `Go to ${t(`wizard.step.${step.key}`, step.label)}` : undefined}
                     onClick={canJump ? () => jumpToStep(stepNum) : undefined}
                     onKeyDown={canJump ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); jumpToStep(stepNum); } } : undefined}
                     style={{ opacity: skipped ? 0.55 : 1 }}>
                  <div className="stepper-circle">
                    {isCompleted ? <Check size={16} strokeWidth={2.6} /> : stepNum}
                  </div>
                  <div className="stepper-text-group">
                    <span className="stepper-title">
                      {t(`wizard.step.${step.key}`, step.label)}
                    </span>
                    <span className="stepper-subtitle">
                      {skipped ? t('wizard.notNeeded', 'Not needed')
                        : isCompleted && step.key === 'who' && serviceType !== 'alter' && customerBlank() ? t('wizard.customerLater', 'Fill before completing')
                        : isCompleted ? t('wizard.completed', 'Done') : t(`wizard.stepSub.${step.key}`, step.sub)}
                    </span>
                  </div>
                </div>
                {index < wizardSteps.length - 1 && (
                  <div className={`stepper-line ${currentStep > stepNum ? 'stepper-line--completed' : ''}`}></div>
                )}
              </React.Fragment>
            );
          })}
        </div>
        {/* Phones only (CSS): the strip scrolls, so say where in it we are. */}
        <div className="stepper-count">{t('entry.stepXofY', 'Step {step} of {total}', { step: currentStep, total: wizardSteps.length })}</div>
      </aside>
    </>
  );
}
