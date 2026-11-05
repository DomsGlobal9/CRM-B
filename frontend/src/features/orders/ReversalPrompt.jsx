import { AlertTriangle } from 'lucide-react';
import { LIMITS } from '../../services/validate';
import { api } from '../../services/api';
import { useApp } from '../../context/AppContext';

/**
 * Failing a quality check (the stitching stages reopen for rework) or reopening
 * a finished stage, with the reason given, which goes on the order's record.
 */
export default function ReversalPrompt({ activeReviewOrder, reversalBusy, reversalPrompt, reversalReason, selectedStageObj, setActiveReviewOrder, setActiveReviewStage, setReversalBusy, setReversalPrompt, setReversalReason, setSelectedStageObj }) {
  const { refresh: fetchDashboardAndConfig } = useApp();
  return (
    <div className="existing-customer-search-modal" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1300 }}>
      <div className="search-modal-card" style={{ maxWidth: '420px', width: '100%', padding: '24px' }}>
        <h3 style={{ fontSize: '18px', fontWeight: 600, fontFamily: 'var(--font-serif)', marginBottom: '8px' }}>
          {reversalPrompt.type === 'failqc' ? 'Fail this quality check?' : 'Reopen this stage?'}
        </h3>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
          {reversalPrompt.type === 'failqc'
            ? 'The stitching stages reopen for rework and the order drops back to Design & Creation. Say what was wrong — the tailor doing the rework reads this.'
            : 'This goes on the order\u2019s record with your name. Say why the stage is being reopened.'}
        </p>
        {reversalPrompt.type === 'reopen' && (() => {

          const mine = (s) => !s.garment_job || !selectedStageObj?.garment_job || s.garment_job === selectedStageObj.garment_job;
          const stages = (activeReviewOrder?.stages || []).filter(mine);
          const at = stages.findIndex(s => s.id === selectedStageObj?.id);
          const reset = at === -1 ? [] : stages.slice(at + 1).filter(s => s.status !== 'NOT_STARTED');
          return reset.length > 0 && (
            <div role="alert" style={{ display: 'flex', gap: '8px', padding: '10px 12px', marginBottom: '12px', borderRadius: '10px',
                                       background: 'var(--warning-bg)', color: 'var(--warning-text)', fontSize: '13px' }}>
              <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
              <span>
                <strong>Later work will be reset.</strong>{' '}
                {reset.map(s => s.stage_name || s.stage_key).join(', ')} {reset.length === 1 ? 'goes' : 'go'} back to Not started and must be done again.
              </span>
            </div>
          );
        })()}
        <textarea
          className="form-control"
          rows={3}
          autoFocus
          placeholder={reversalPrompt.type === 'failqc' ? 'e.g. Hem is crooked on the left panel' : 'e.g. Completed on the wrong order'}
          maxLength={LIMITS.reason}
          value={reversalReason}
          onChange={(e) => setReversalReason(e.target.value)}
          style={{ marginBottom: '16px' }}
        />
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button type="button" className="btn-secondary" disabled={reversalBusy} onClick={() => setReversalPrompt(null)}>
            Cancel
          </button>
          <button
            type="button" className="btn-primary" disabled={reversalBusy || !reversalReason.trim()}
            onClick={async () => {
              if (reversalBusy) return;
              setReversalBusy(true);
              try {
                if (reversalPrompt.type === 'failqc') {
                  await api.failQualityCheck(activeReviewOrder.id, reversalReason.trim(), selectedStageObj?.garment_job || null);
                } else {
                  await api.reopenStage(activeReviewOrder.id, selectedStageObj.stage_key, reversalReason.trim(), selectedStageObj.garment_job || null);
                }
                setReversalPrompt(null);
                setActiveReviewStage(null);
                setActiveReviewOrder(null);
                setSelectedStageObj(null);
                fetchDashboardAndConfig();
              } catch (err) {
                alert(err.message);
              } finally {
                setReversalBusy(false);
              }
            }}
          >
            {reversalBusy ? 'Recording…' : (reversalPrompt.type === 'failqc' ? 'Fail QC' : 'Reopen Stage')}
          </button>
        </div>
      </div>
    </div>
  );
}
