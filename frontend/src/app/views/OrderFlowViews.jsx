import OrderTypeSelector from '../../features/orderWizard/OrderTypeSelector';
import WizardHeader from '../../features/orderWizard/WizardHeader';
import WhoStep from '../../features/orderWizard/WhoStep';
import GarmentsStep from '../../features/orderWizard/GarmentsStep';
import MeasurementsStep from '../../features/orderWizard/MeasurementsStep';
import ReviewStep from '../../features/orderWizard/ReviewStep';
import MoneyStep from '../../features/orderWizard/MoneyStep';
import AlterGarmentStep from '../../features/orderWizard/AlterGarmentStep';
import AlterIssueStep from '../../features/orderWizard/AlterIssueStep';
import OutsideGarmentStep from '../../features/orderWizard/OutsideGarmentStep';
import OutsideIssueStep from '../../features/orderWizard/OutsideIssueStep';
import OrderConfirmedScreen from '../../features/orders/OrderConfirmedScreen';
import WizardFooter from '../../features/orderWizard/WizardFooter';
import { useAppState } from '../state/appState';

/**
 * Taking an order: what kind of order, the order form with its steps and
 * its Back / Next bar, and the order-taken screen.
 */
export default function OrderFlowViews() {
  const { accountBar, advancePaymentAmount, alterOutside, alterationForm, confirmedOrder, ctaBusy, currentStep, customerForm, customerId, customerLocked, customerMatches, customerMatchesLoading, customerName, designRequest, designerChoice, designers, draftSaveState, fabricTaxonomy, fabrics, fetchNotifications, garmentErrors, garmentJobs, garmentTemplates, garmentTemplatesError, garmentsDone, getTaxes, getTotalPrice, headerAccountItems, hydrateWizard, jobExtras, jobMaterialCharges, loadGarmentTemplates, markingNotificationsRead, matchBy, maxStepReached, measureVoiceNotes, mobileNavOpen, navCollapsed, notifications, numberMatched, openGarment, openSendToWorkshop, outsideForm, outsidePhoto, quotePrices, readyBy, resumableDrafts, reviewView, sendBusy, serviceType, setActiveGarmentKey, setAdvancePaymentAmount, setAlterOutside, setAlterationForm, setCustomerAddMode, setCustomerForm, setDesignRequest, setGarmentJobs, setMarkingNotificationsRead, setMeasureVoiceNotes, setMobileNavOpen, setOutsideForm, setOutsidePhoto, setQuotePrices, setReadyBy, setResumableDrafts, setReviewView, setSelectedDirectoryCustomer, setServiceType, setShowInvoiceModal, setShowNotificationsDrawer, setSpecialInstructions, setView, setWizardError, showBell, sidebarSections, specialInstructions, startService, toggleNav, view, wizard, wizardError, wizardStepKey, wizardSteps } = useAppState();
  return (
    <>
      {/* 5. ORDER TYPE SELECTOR (Image 5) */}
      {view === 'order-selector' && <OrderTypeSelector wizard={wizard} accountBar={accountBar} fetchNotifications={fetchNotifications} headerAccountItems={headerAccountItems} hydrateWizard={hydrateWizard} markingNotificationsRead={markingNotificationsRead} mobileNavOpen={mobileNavOpen} navCollapsed={navCollapsed} notifications={notifications} resumableDrafts={resumableDrafts} setCustomerAddMode={setCustomerAddMode} setMarkingNotificationsRead={setMarkingNotificationsRead} setMobileNavOpen={setMobileNavOpen} setResumableDrafts={setResumableDrafts} setSelectedDirectoryCustomer={setSelectedDirectoryCustomer} setShowNotificationsDrawer={setShowNotificationsDrawer} setView={setView} showBell={showBell} sidebarSections={sidebarSections} startService={startService} toggleNav={toggleNav} />}

      {/* 6. THE ORDER WIZARD: who, what, (designer), measurements, money.
          Every screen is one question a counter can answer with the customer
          standing there; everything the workroom decides later stays out. */}
      {view === 'wizard' && (
        // flex, not 100vh: the Back/Next bar follows in the same column, so the
        // wizard takes what is left above it and a short step does not scroll.
        <div className="wizard-outer-wrapper">
          {/* Brand header & stepper */}
          <WizardHeader wizard={wizard} currentStep={currentStep} draftSaveState={draftSaveState} garmentJobs={garmentJobs} maxStepReached={maxStepReached} serviceType={serviceType} wizardSteps={wizardSteps} />

          <div className="main-content full-width">
            <div className="workspace-panel">

            {/* WHO: the mobile number finds a customer the boutique already
                knows; a new one needs a name. Everything else about them is
                optional and folded away. */}
            {wizardStepKey === 'who' && <WhoStep wizard={wizard} alterOutside={alterOutside} customerForm={customerForm} customerId={customerId} customerLocked={customerLocked} customerMatches={customerMatches} customerMatchesLoading={customerMatchesLoading} customerName={customerName} matchBy={matchBy} numberMatched={numberMatched} serviceType={serviceType} setAlterOutside={setAlterOutside} setCustomerForm={setCustomerForm} />}

            {/* TYPE: the garments, and for each one only what its cut needs. */}
            {wizardStepKey === 'type' && <GarmentsStep wizard={wizard} ctaBusy={ctaBusy} customerForm={customerForm} designRequest={designRequest} designerChoice={designerChoice} designers={designers} fabricTaxonomy={fabricTaxonomy} fabrics={fabrics} garmentErrors={garmentErrors} garmentJobs={garmentJobs} garmentTemplates={garmentTemplates} garmentTemplatesError={garmentTemplatesError} garmentsDone={garmentsDone} loadGarmentTemplates={loadGarmentTemplates} openGarment={openGarment} serviceType={serviceType} setDesignRequest={setDesignRequest} setGarmentJobs={setGarmentJobs} setServiceType={setServiceType} />}

            {/* MEASUREMENTS: only the fields each garment's cut asks for. */}
            {wizardStepKey === 'measure' && <MeasurementsStep wizard={wizard} customerForm={customerForm} garmentErrors={garmentErrors} garmentJobs={garmentJobs} measureVoiceNotes={measureVoiceNotes} setMeasureVoiceNotes={setMeasureVoiceNotes} setSpecialInstructions={setSpecialInstructions} specialInstructions={specialInstructions} />}

            {/* REVIEW: everything the order will say, on one page, before a
                price is put on it. Each card jumps back to the screen that
                owns it. */}
            {wizardStepKey === 'review' && <ReviewStep wizard={wizard} customerForm={customerForm} customerId={customerId} customerName={customerName} designRequest={designRequest} designerChoice={designerChoice} designers={designers} fabricTaxonomy={fabricTaxonomy} fabrics={fabrics} garmentJobs={garmentJobs} reviewView={reviewView} serviceType={serviceType} setActiveGarmentKey={setActiveGarmentKey} setCustomerForm={setCustomerForm} setGarmentJobs={setGarmentJobs} setReviewView={setReviewView} wizardSteps={wizardSteps} />}

            {/* MONEY: when it is promised for, what it costs, what was paid. */}
            {wizardStepKey === 'money' && <MoneyStep wizard={wizard} advancePaymentAmount={advancePaymentAmount} garmentErrors={garmentErrors} garmentJobs={garmentJobs} getTaxes={getTaxes} getTotalPrice={getTotalPrice} jobExtras={jobExtras} jobMaterialCharges={jobMaterialCharges} quotePrices={quotePrices} readyBy={readyBy} serviceType={serviceType} setAdvancePaymentAmount={setAdvancePaymentAmount} setQuotePrices={setQuotePrices} setReadyBy={setReadyBy} setWizardError={setWizardError} wizardError={wizardError} />}

            {/* ALTER, screen 2: which garment we made. */}
            {wizardStepKey === 'garment' && <AlterGarmentStep wizard={wizard} alterationForm={alterationForm} setAlterOutside={setAlterOutside} setAlterationForm={setAlterationForm} />}

            {/* ALTER, screen 3: what is wrong, free or paid, anything paid now. */}
            {wizardStepKey === 'issue' && <AlterIssueStep alterationForm={alterationForm} outsidePhoto={outsidePhoto} setAlterationForm={setAlterationForm} setOutsidePhoto={setOutsidePhoto} setWizardError={setWizardError} wizardError={wizardError} />}
            {/* OUTSIDE GARMENT, screen 2: what was brought in. No order of
                ours names it, so it is described, and photographed as it
                arrived -- the record of what was already wrong. */}
            {wizardStepKey === 'outGarment' && <OutsideGarmentStep garmentTemplates={garmentTemplates} outsideForm={outsideForm} outsidePhoto={outsidePhoto} setOutsideForm={setOutsideForm} setOutsidePhoto={setOutsidePhoto} />}

            {/* OUTSIDE GARMENT, screen 3: what needs changing, and the charge. */}
            {wizardStepKey === 'outIssue' && <OutsideIssueStep outsideForm={outsideForm} setOutsideForm={setOutsideForm} setWizardError={setWizardError} wizardError={wizardError} />}
            </div>

          </div>
        </div>
      )}

      {/* CONFIRMED VIEW */}
      {view === 'confirmed' && confirmedOrder && <OrderConfirmedScreen confirmedOrder={confirmedOrder} customerForm={customerForm} openSendToWorkshop={openSendToWorkshop} sendBusy={sendBusy} setShowInvoiceModal={setShowInvoiceModal} setView={setView} />}

      {/* Footer Navigation Bar (Only in Wizard View) */}
      {view === 'wizard' && <WizardFooter wizard={wizard} ctaBusy={ctaBusy} serviceType={serviceType} wizardStepKey={wizardStepKey} />}

    </>
  );
}
