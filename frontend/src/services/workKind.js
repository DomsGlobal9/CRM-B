/* What kind of work a My work card is, from its stage key (crm_api/models.py
   default workflow), with the colour its card is marked in. A to-do task is
   its own kind. Self-check: node src/services/workKind.check.mjs */

const KINDS = [
  { key: 'cutting', label: 'Cutting', color: '#2563eb', stages: ['pattern_cutting', 'paper_cutting', 'fabric_cutting'] },
  { key: 'maggam', label: 'Maggam', color: '#7c3aed', stages: ['maggam_work', 'maggam_handwork', 'maggam_verification'] },
  { key: 'stitching', label: 'Stitching', color: '#d97706', stages: ['stitching_in_progress'] },
  { key: 'finishing', label: 'Finishing', color: '#0d9488', stages: ['finishing', 'pressing'] },
  { key: 'qc', label: 'Quality check', color: '#db2777', stages: ['master_quality_check'] },
  { key: 'trial', label: 'Trial', color: '#4f46e5', stages: ['trial_scheduled', 'trial_completed'] },
  { key: 'delivery', label: 'Delivery', color: '#16a34a', stages: ['ready_for_delivery', 'payment', 'delivered'] },
  { key: 'alteration', label: 'Alteration', color: '#ea580c', stages: ['alteration_work'] },
];

const OTHER = { key: 'other', label: 'Other', color: '#64748b' };

/** The to-do tasks on My work. */
export const TODO_KIND = { key: 'todo', label: 'To-do', color: '#0891b2' };

export const workKind = (stageKey) => KINDS.find((k) => k.stages.includes(stageKey)) || OTHER;
