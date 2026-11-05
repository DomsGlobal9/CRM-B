import { Suspense, lazy } from 'react';
import InvoiceModal from '../../features/invoices/InvoiceModal';
import NotificationsDrawer from '../../features/notifications/NotificationsDrawer';
import StageReviewModal from '../../features/orders/StageReviewModal';
import { NetworkActivityBar } from './NetworkActivityBar';
import ReversalPrompt from '../../features/orders/ReversalPrompt';
import GarmentPairingModal from '../../features/orderWizard/GarmentPairingModal';
import { useAppState } from '../state/appState';

const ReviewLightbox = lazy(() => import('../../features/designStudio/GarmentPartPicker').then(m => ({ default: m.Lightbox })));

/**
 * Above every screen: the invoice, the bell's alerts, a stage under review and
 * its reopen prompt, the photo viewer, the activity bar, and the garment pairing
 * suggestion.
 */
export default function Overlays() {
  const { activePairingGarment, activeReviewOrder, activeReviewStage, assigningStageKey, confirmedOrder, eligibleStaffForStage, fabricTaxonomy, garmentJobs, garmentTemplates, handleAddPairedGarments, handleAssignStage, invoiceSend, notifications, openGarmentJob, pairingQueue, reversalBusy, reversalPrompt, reversalReason, reviewView, selectedStageObj, sendInvoiceToWhatsApp, setActivePairingGarment, setActiveReviewOrder, setActiveReviewStage, setPairingQueue, setReversalBusy, setReversalPrompt, setReversalReason, setReviewView, setSelectedStageObj, setShowInvoiceModal, setShowNotificationsDrawer, setStageReviewComments, setStageReviewImages, setStageReviewRecording, setStageTransitionBusy, showInvoiceModal, showNotificationsDrawer, stageReviewComments, stageReviewImages, stageReviewRecording, stageTransitionBusy, view } = useAppState();
  return (
    <>
      {/* INVOICE MODAL */}
      {showInvoiceModal && confirmedOrder && <InvoiceModal confirmedOrder={confirmedOrder} invoiceSend={invoiceSend} sendInvoiceToWhatsApp={sendInvoiceToWhatsApp} setShowInvoiceModal={setShowInvoiceModal} />}

      {/* Notifications Drawer */}
      {showNotificationsDrawer && <NotificationsDrawer notifications={notifications} setShowNotificationsDrawer={setShowNotificationsDrawer} />}

      {/* Stage Review Modal */}
      {activeReviewStage && activeReviewOrder && <StageReviewModal activeReviewOrder={activeReviewOrder} activeReviewStage={activeReviewStage} assigningStageKey={assigningStageKey} eligibleStaffForStage={eligibleStaffForStage} fabricTaxonomy={fabricTaxonomy} handleAssignStage={handleAssignStage} openGarmentJob={openGarmentJob} reversalBusy={reversalBusy} selectedStageObj={selectedStageObj} setActiveReviewOrder={setActiveReviewOrder} setActiveReviewStage={setActiveReviewStage} setReversalPrompt={setReversalPrompt} setReversalReason={setReversalReason} setReviewView={setReviewView} setSelectedStageObj={setSelectedStageObj} setStageReviewComments={setStageReviewComments} setStageReviewImages={setStageReviewImages} setStageReviewRecording={setStageReviewRecording} setStageTransitionBusy={setStageTransitionBusy} stageReviewComments={stageReviewComments} stageReviewImages={stageReviewImages} stageReviewRecording={stageReviewRecording} stageTransitionBusy={stageTransitionBusy} />}

      <NetworkActivityBar />
      {reviewView && view !== 'wizard' && (
        <Suspense fallback={null}>
          <ReviewLightbox items={reviewView.items} index={reviewView.index}
                          onIndexChange={(i) => setReviewView({ ...reviewView, index: i })}
                          onClose={() => setReviewView(null)} />
        </Suspense>
      )}
      {reversalPrompt && <ReversalPrompt activeReviewOrder={activeReviewOrder} reversalBusy={reversalBusy} reversalPrompt={reversalPrompt} reversalReason={reversalReason} selectedStageObj={selectedStageObj} setActiveReviewOrder={setActiveReviewOrder} setActiveReviewStage={setActiveReviewStage} setReversalBusy={setReversalBusy} setReversalPrompt={setReversalPrompt} setReversalReason={setReversalReason} setSelectedStageObj={setSelectedStageObj} />}
      <GarmentPairingModal
        isOpen={!!activePairingGarment}
        // The next garment picked together with this one, if any, has its suggestion next.
        onClose={() => { setActivePairingGarment(pairingQueue[0] || null); setPairingQueue(pairingQueue.slice(1)); }}
        primaryGarmentKey={activePairingGarment?.key}
        primaryGarmentName={activePairingGarment?.name}
        primaryJobKey={activePairingGarment?.jobKey}
        garmentTemplates={garmentTemplates}
        garmentJobs={garmentJobs}
        onAddPairedGarments={handleAddPairedGarments}
      />
    </>
  );
}
