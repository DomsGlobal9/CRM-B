export const orderStageKey = (order) => {
  const stages = order.stages || [];
  const current = stages.find((st) => st.status === 'PENDING_VERIFICATION')
    || stages.find((st) => st.status === 'IN_PROGRESS' || st.status === 'PAUSED')
    || stages.find((st) => st.status !== 'COMPLETED' && st.status !== 'SKIPPED')
    || stages[stages.length - 1];
  return current ? current.stage_key : '';
};

/** Where an order sits for the owner: 'new' (still on the counter),
 *  'workshop' (someone is working on it) or 'done' (delivered or cancelled). */
export const ORDER_CLOSED = ['Delivered', 'Cancelled'];
export const orderBucket = (order) => {
  if (ORDER_CLOSED.includes(order.order_status)) return 'done';
  const started = (order.stages || []).some((st) => st.stage_key !== 'created' && !['NOT_STARTED', 'SKIPPED'].includes(st.status));
  return started ? 'workshop' : 'new';
};
/** The stage the order is standing on, with the step before and after it
 *  (by name, so per-garment rows count once). */
export const stageNow = (order, jobId = null) => {
  // `jobId`: one garment's own journey (its steps and the order's shared ones).
  const stages = [...(order.stages || [])].filter(st => !jobId || !st.garment_job || st.garment_job === jobId)
    .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
  const current = stages.find(st => st.status === 'PENDING_VERIFICATION')
    || stages.find(st => st.status === 'IN_PROGRESS' || st.status === 'PAUSED')
    || stages.find(st => st.status !== 'COMPLETED' && st.status !== 'SKIPPED');
  if (!current) return null;
  
  const lane = stages.filter(st => !current.garment_job || !st.garment_job || st.garment_job === current.garment_job);
  const i = lane.indexOf(current);
  const prev = lane.slice(0, i).reverse().find(st => st.stage_key !== current.stage_key);
  const next = lane.slice(i + 1).find(st => st.stage_key !== current.stage_key);
  return { current, prev, next, name: current.stage_name };
};
/** Who has a stage right now: the assignee, else whoever last moved it. */
export const stageWho = (st) => st.assigned_to_name || (st.status !== 'NOT_STARTED' && st.performed_by_name) || '';
/** '3 h' / '2 d' since a timestamp, for the order book's stage strip. */
export const sinceLabel = (iso) => {
  if (!iso) return '';
  const hours = Math.floor((Date.now() - new Date(iso).getTime()) / 36e5);
  return hours < 1 ? 'just now' : hours < 24 ? `${hours} h` : `${Math.floor(hours / 24)} d`;
};

export const STEP_COLORS = {
  // 1. Order taken (Pill 1: #E3EED4)
  created:     { rowBg: '#F4F8EE', bg: '#E3EED4', border: '#B1BAA5', text: '#132216' },
  order_taken: { rowBg: '#F4F8EE', bg: '#E3EED4', border: '#B1BAA5', text: '#132216' },
  new:         { rowBg: '#F4F8EE', bg: '#E3EED4', border: '#B1BAA5', text: '#132216' },
  not_sent:    { rowBg: '#F4F8EE', bg: '#E3EED4', border: '#B1BAA5', text: '#132216' },

  // 2. Design
  design:          { rowBg: '#EEF5E7', bg: '#D1E0C8', border: '#A3AE9C', text: '#132216' },
  pattern_cutting: { rowBg: '#EEF5E7', bg: '#D1E0C8', border: '#A3AE9C', text: '#132216' },

  // 3. Paper cutting
  paper_cutting: { rowBg: '#E8F1DF', bg: '#C0D1BC', border: '#96A393', text: '#132216' },

  // 4. Maggam design (Pill 2: #AEC3B0)
  maggam_work:   { rowBg: '#E2EDD7', bg: '#AEC3B0', border: '#889889', text: '#132216' },
  maggam_design: { rowBg: '#E2EDD7', bg: '#AEC3B0', border: '#889889', text: '#132216' },
  maggam:        { rowBg: '#E2EDD7', bg: '#AEC3B0', border: '#889889', text: '#132216' },
  embroidery:    { rowBg: '#E2EDD7', bg: '#AEC3B0', border: '#889889', text: '#132216' },

  // 5. Maggam handwork
  maggam_handwork: { rowBg: '#DCE9D0', bg: '#98B29B', border: '#768B79', text: '#132216' },

  // 6. Maggam verification
  maggam_verification: { rowBg: '#D6E5C8', bg: '#81A186', border: '#657E69', text: '#132216' },

  // 7. Fabric cutting (Pill 3: #6B9071)
  fabric_cutting: { rowBg: '#D0E1C1', bg: '#6B9071', border: '#537058', text: '#132216' },
  cutting:        { rowBg: '#D0E1C1', bg: '#6B9071', border: '#537058', text: '#132216' },

  // 8. Stitching
  stitching:             { rowBg: '#CADDBC', bg: '#5A7C5D', border: '#466148', text: '#FFFFFF' },
  stitching_in_progress: { rowBg: '#CADDBC', bg: '#5A7C5D', border: '#466148', text: '#FFFFFF' },

  // 9. Hemming & finishing
  finishing:         { rowBg: '#C4D9B7', bg: '#486948', border: '#385238', text: '#FFFFFF' },
  hemming:           { rowBg: '#C4D9B7', bg: '#486948', border: '#385238', text: '#FFFFFF' },
  hemming_finishing: { rowBg: '#C4D9B7', bg: '#486948', border: '#385238', text: '#FFFFFF' },

  // 10. Pressing (Pill 4: #375534)
  pressing:           { rowBg: '#BED5B1', bg: '#375534', border: '#2B4229', text: '#FFFFFF' },
  ironing:            { rowBg: '#BED5B1', bg: '#375534', border: '#2B4229', text: '#FFFFFF' },
  packaging:          { rowBg: '#BED5B1', bg: '#375534', border: '#2B4229', text: '#FFFFFF' },
  pressing_packaging: { rowBg: '#BED5B1', bg: '#375534', border: '#2B4229', text: '#FFFFFF' },

  // 11. Master quality check
  master_quality_check: { rowBg: '#B8D1AC', bg: '#2A472C', border: '#203723', text: '#FFFFFF' },
  quality_check:        { rowBg: '#B8D1AC', bg: '#2A472C', border: '#203723', text: '#FFFFFF' },
  qc:                   { rowBg: '#B8D1AC', bg: '#2A472C', border: '#203723', text: '#FFFFFF' },

  // 12. Trial booking
  trial_scheduled: { rowBg: '#B2CDA6', bg: '#1C3825', border: '#162C1D', text: '#FFFFFF' },
  trial_booking:   { rowBg: '#B2CDA6', bg: '#1C3825', border: '#162C1D', text: '#FFFFFF' },

  // 13. Trial (Pill 5: #0F2A1D)
  trial_completed: { rowBg: '#ACC9A1', bg: '#0F2A1D', border: '#0C2117', text: '#FFFFFF' },
  trial:           { rowBg: '#ACC9A1', bg: '#0F2A1D', border: '#0C2117', text: '#FFFFFF' },

  // 14. Delivery prep
  ready_for_delivery: { rowBg: '#D0D9B8', bg: '#535A3A', border: '#41462D', text: '#FFFFFF' },
  delivery_prep:      { rowBg: '#D0D9B8', bg: '#535A3A', border: '#41462D', text: '#FFFFFF' },

  // 15. Payment
  payment: { rowBg: '#DFDDC4', bg: '#7C774B', border: '#615D3A', text: '#FFFFFF' },

  // 16. Delivery (Sand: #978A56)
  delivery:  { rowBg: '#EEE8D2', bg: '#978A56', border: '#766C43', text: '#132216' },
  delivered: { rowBg: '#EEE8D2', bg: '#978A56', border: '#766C43', text: '#132216' },

  // Alteration & Status
  alteration:      { rowBg: '#ffedd5', bg: '#fed7aa', border: '#f97316', text: '#c2410c' },
  alteration_work: { rowBg: '#ffedd5', bg: '#fed7aa', border: '#f97316', text: '#c2410c' },
  cancelled:       { rowBg: '#e2e8f0', bg: '#cbd5e1', border: '#64748b', text: '#475569' },
};

export const getStageBadgeStyle = (stageKey, stageName = '') => {
  if (stageKey && STEP_COLORS[stageKey]) return STEP_COLORS[stageKey];
  const name = (stageName || stageKey || '').toLowerCase();

  if (name.includes('order taken') || name.includes('not sent') || name.includes('new') || name.includes('create')) return STEP_COLORS.created;
  if (name.includes('design') && !name.includes('maggam')) return STEP_COLORS.design;
  if (name.includes('paper')) return STEP_COLORS.paper_cutting;
  if (name.includes('maggam verification') || name.includes('maggam verify')) return STEP_COLORS.maggam_verification;
  if (name.includes('maggam handwork') || name.includes('maggam hand')) return STEP_COLORS.maggam_handwork;
  if (name.includes('maggam') || name.includes('embroid') || name.includes('zari')) return STEP_COLORS.maggam_work;
  if (name.includes('fabric')) return STEP_COLORS.fabric_cutting;
  if (name.includes('cut')) return STEP_COLORS.pattern_cutting;
  if (name.includes('stitch') || name.includes('sew')) return STEP_COLORS.stitching_in_progress;
  if (name.includes('finish') || name.includes('hem')) return STEP_COLORS.finishing;
  if (name.includes('press') || name.includes('iron') || name.includes('pack')) return STEP_COLORS.pressing;
  if (name.includes('qc') || name.includes('quality') || name.includes('check')) return STEP_COLORS.master_quality_check;
  if (name.includes('trial book') || name.includes('trial schedule')) return STEP_COLORS.trial_scheduled;
  if (name.includes('trial') || name.includes('fit')) return STEP_COLORS.trial_completed;
  if (name.includes('prep') || name.includes('ready')) return STEP_COLORS.ready_for_delivery;
  if (name.includes('pay') || name.includes('bill')) return STEP_COLORS.payment;
  if (name.includes('deliver')) return STEP_COLORS.delivered;
  if (name.includes('alter')) return STEP_COLORS.alteration_work;
  if (name.includes('cancel')) return STEP_COLORS.cancelled;

  const PALETTE = [
    STEP_COLORS.created,
    STEP_COLORS.design,
    STEP_COLORS.paper_cutting,
    STEP_COLORS.maggam_work,
    STEP_COLORS.fabric_cutting,
    STEP_COLORS.stitching,
    STEP_COLORS.finishing,
    STEP_COLORS.pressing,
    STEP_COLORS.master_quality_check,
    STEP_COLORS.trial_completed,
    STEP_COLORS.ready_for_delivery,
    STEP_COLORS.delivered,
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash << 5) - hash + name.charCodeAt(i);
  return PALETTE[Math.abs(hash) % PALETTE.length];
};

export const STEP_STATE = (status) =>
  (status === 'COMPLETED' || status === 'SKIPPED') ? 'done'
    : (status === 'IN_PROGRESS' || status === 'PAUSED' || status === 'PENDING_VERIFICATION') ? 'live'
    : 'next';
export const STEP_LABEL = { done: 'Completed', live: 'In progress', next: 'Not started' };
export const STEP_TONE = { done: 'success', live: 'info', next: 'neutral' };

export const anyVoiceNote = (stage) => Boolean(stage.voice_note);

/** One status per stage key across its rows: a per-garment stage is done
 *  once every garment's row is, live while any has begun. The order-level
 *  view the header counts and the kanban use. */
export const rollupStages = (stages) => {
  const out = [];
  const seen = new Map();
  (stages || []).forEach((s) => {
    const cur = seen.get(s.stage_key);
    if (!cur) { const row = { ...s, garment_job: null, garment_name: null }; seen.set(s.stage_key, row); out.push(row); return; }
    const a = STEP_STATE(cur.status), b = STEP_STATE(s.status);
    if (a === 'done' && b !== 'done') cur.status = b === 'live' ? s.status : 'IN_PROGRESS';
    else if (a === 'next' && b !== 'next') cur.status = 'IN_PROGRESS';
    else if (a === 'done' && b === 'done' && s.completed_at && (!cur.completed_at || s.completed_at > cur.completed_at)) cur.completed_at = s.completed_at;
  });
  return out;
};

/** The journey in plain parts: the order-level steps before the workroom,
 *  one garment per card for the per-garment steps, then the order-level
 *  steps after. A stage with no garment on an order with no garment rows
 *  (an older order) goes in the head, so it still reads top to bottom. */
export const stageLanes = (stages) => {
  const rows = stages || [];
  const garments = [];
  rows.forEach((s) => {
    if (!s.garment_job) return;
    let lane = garments.find((l) => l.key === s.garment_job);
    if (!lane) { lane = { key: s.garment_job, label: s.garment_name || 'Garment', stages: [] }; garments.push(lane); }
    lane.stages.push(s);
  });
  const shared = rows.filter((s) => !s.garment_job);
  if (!garments.length) return { head: shared, garments, tail: [] };
  const firstSeq = Math.min(...garments.map((l) => l.stages[0].sequence));
  return {
    head: shared.filter((s) => s.sequence < firstSeq),
    garments,
    tail: shared.filter((s) => s.sequence >= firstSeq),
  };
};

export const isSettled = (s) => s.status === 'COMPLETED' || s.status === 'SKIPPED';
export const isLive = (s) => ['IN_PROGRESS', 'PAUSED', 'PENDING_VERIFICATION'].includes(s.status);
/** The one row to do now: the one in hand, else the first not yet done. */
export const currentRow = (rows) => rows.find(isLive) || rows.find((s) => !isSettled(s)) || null;

/** What a stage is doing, in words, and the tone of its badge. */
export const stageWords = (t, status) => (
  status === 'COMPLETED' ? [t('ordersPage.taskDone', 'Completed'), 'success']
  : status === 'SKIPPED' ? [t('ordersPage.taskSkipped', 'Skipped'), 'neutral']
  : status === 'PENDING_VERIFICATION' ? [t('ordersPage.taskWaitingCheck', 'Waiting for check'), 'warning']
  : status === 'PAUSED' ? [t('ordersPage.taskPaused', 'Paused'), 'warning']
  : isLive({ status }) ? [t('ordersPage.taskLive', 'In progress'), 'info']
  : [t('ordersPage.taskNotStarted', 'Not started'), 'neutral']);

/** The row of a stage to open: the garment in hand, else the first not yet
 *  done, else the first. A rolled-up step names a stage, not a garment. */
export const rowToOpen = (stages, stageKey) => {
  const rows = (stages || []).filter((s) => s.stage_key === stageKey);
  return rows.find(isLive) || rows.find((s) => !isSettled(s)) || rows[0] || null;
};
