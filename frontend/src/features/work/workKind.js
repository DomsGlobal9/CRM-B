/* What kind of work a My work card is, from its stage key (crm_api/models.py
   default workflow), with the colour its card is marked in. A to-do task is
   its own kind. Self-check: node src/features/work/workKind.check.mjs */

const KINDS = [
  { key: 'cutting', label: 'Cutting', color: 'var(--info-500)', stages: ['pattern_cutting', 'paper_cutting', 'fabric_cutting'] },
  { key: 'maggam', label: 'Maggam', color: 'var(--info-600)', stages: ['maggam_work', 'maggam_handwork', 'maggam_verification'] },
  { key: 'stitching', label: 'Stitching', color: '#d97706', stages: ['stitching_in_progress'] },
  { key: 'finishing', label: 'Finishing', color: 'var(--info-800)', stages: ['finishing', 'pressing'] },
  { key: 'qc', label: 'Quality check', color: '#db2777', stages: ['master_quality_check'] },
  { key: 'trial', label: 'Trial', color: 'var(--info-700)', stages: ['trial_scheduled', 'trial_completed'] },
  { key: 'delivery', label: 'Delivery', color: '#16a34a', stages: ['ready_for_delivery', 'payment', 'delivered'] },
  { key: 'alteration', label: 'Alteration', color: '#ea580c', stages: ['alteration_work'] },
];

const OTHER = { key: 'other', label: 'Other', color: '#64748b' };

export const workKind = (stageKey) => KINDS.find((k) => k.stages.includes(stageKey)) || OTHER;
