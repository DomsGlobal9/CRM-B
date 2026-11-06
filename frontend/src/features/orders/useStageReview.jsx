import { useState } from 'react';
import { ASSIGN_ONLY_TO } from '../../constants/roles';
import { api } from '../../api';

/**
 * Assigning a stage and taking one back: who may be given a stage, the
 * assignment itself, and the fail-QC or reopen prompt with its reason.
 */
export default function useStageReview({ tailors, designerStaff, boutiqueSettings, setSelectedStageObj, fetchDashboardAndConfig }) {
  const [assigningStageKey, setAssigningStageKey] = useState(null);

  const [stageTransitionBusy, setStageTransitionBusy] = useState(false);

  const [reversalPrompt, setReversalPrompt] = useState(null);

  const [reversalReason, setReversalReason] = useState('');

  const [reversalBusy, setReversalBusy] = useState(false);

  const eligibleStaffForStage = (stageKey) => {
    // Hemming & finishing goes only to the Hemming & Pressing Staff.
    const only = ASSIGN_ONLY_TO[stageKey];
    if (only) return tailors.filter(t => only.includes(t.role));
    const stageConf = (boutiqueSettings?.workflow_config || []).find(s => s.key === stageKey);
    const allowed = stageConf?.roles || [];
    if (allowed.length === 0) return tailors;
    const pool = allowed.includes('Designer') ? [...tailors, ...designerStaff] : tailors;
    return pool.filter(t => allowed.includes(t.role));
  };

  const handleAssignStage = async (orderId, stageKey, tailorId, garmentJob = null) => {
    setAssigningStageKey(stageKey);
    try {
      const updated = await api.assignStage(orderId, stageKey, tailorId || null, garmentJob);
      // The open stage sheet reads this, so the picker keeps the new name.
      setSelectedStageObj((cur) => (cur && cur.id === updated?.id ? updated : cur));
      await fetchDashboardAndConfig();
    } catch (err) {
      alert(err.message || 'Could not assign this stage.');
    } finally {
      setAssigningStageKey(null);
    }
  };

  return {
    assigningStageKey,
    setAssigningStageKey,
    stageTransitionBusy,
    setStageTransitionBusy,
    reversalPrompt,
    setReversalPrompt,
    reversalReason,
    setReversalReason,
    reversalBusy,
    setReversalBusy,
    eligibleStaffForStage,
    handleAssignStage,
  };
}
