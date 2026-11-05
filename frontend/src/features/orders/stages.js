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

// The steps of an order, in workflow order, named in color-tokens.css.
const stage = (n) => ({
  rowBg: `var(--stage-${n}-row)`, bg: `var(--stage-${n}-fill)`,
  border: `var(--stage-${n}-border)`, text: `var(--stage-${n}-text)`,
});
const ALTERATION = { rowBg: 'var(--warning-50)', bg: 'var(--warning-100)', border: 'var(--warning-300)', text: 'var(--warning-700)' };
const CANCELLED = { rowBg: 'var(--neutral-50)', bg: 'var(--neutral-200)', border: 'var(--neutral-400)', text: 'var(--neutral-700)' };

export const STEP_COLORS = {
  // 1. Order taken (Pill 1: #E3EED4)
  created:     stage(1),
  order_taken: stage(1),
  new:         stage(1),
  not_sent:    stage(1),

  // 2. Design
  design:          stage(2),
  pattern_cutting: stage(2),

  // 3. Paper cutting
  paper_cutting: stage(3),

  // 4. Maggam design (Pill 2: #AEC3B0)
  maggam_work:   stage(4),
  maggam_design: stage(4),
  maggam:        stage(4),
  embroidery:    stage(4),

  // 5. Maggam handwork
  maggam_handwork: stage(5),

  // 6. Maggam verification
  maggam_verification: stage(6),

  // 7. Fabric cutting (Pill 3: #6B9071)
  fabric_cutting: stage(7),
  cutting:        stage(7),

  // 8. Stitching
  stitching:             stage(8),
  stitching_in_progress: stage(8),

  // 9. Hemming & finishing
  finishing:         stage(9),
  hemming:           stage(9),
  hemming_finishing: stage(9),

  // 10. Pressing (Pill 4: #375534)
  pressing:           stage(10),
  ironing:            stage(10),
  packaging:          stage(10),
  pressing_packaging: stage(10),

  // 11. Master quality check
  master_quality_check: stage(11),
  quality_check:        stage(11),
  qc:                   stage(11),

  // 12. Trial booking
  trial_scheduled: stage(12),
  trial_booking:   stage(12),

  // 13. Trial (Pill 5: #0F2A1D)
  trial_completed: stage(13),
  trial:           stage(13),

  // 14. Delivery prep
  ready_for_delivery: stage(14),
  delivery_prep:      stage(14),

  // 15. Payment
  payment: stage(15),

  // 16. Delivery (Sand: #978A56)
  delivery:  stage(16),
  delivered: stage(16),

  // Alteration & Status
  alteration:      ALTERATION,
  alteration_work: ALTERATION,
  cancelled:       CANCELLED,
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
