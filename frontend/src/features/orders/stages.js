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
  // Cutting: Sky Blue
  pattern_cutting: { rowBg: '#dbeafe', bg: '#bfdbfe', border: '#3b82f6', text: '#1d4ed8' },
  cutting:         { rowBg: '#dbeafe', bg: '#bfdbfe', border: '#3b82f6', text: '#1d4ed8' },
  // Paper Cutting: Vivid Turquoise Teal
  paper_cutting:   { rowBg: '#ccfbf1', bg: '#99f6e4', border: '#14b8a6', text: '#0f766e' },
  // Fabric Cutting: Indigo / Royal Periwinkle
  fabric_cutting:  { rowBg: '#e0e7ff', bg: '#c7d2fe', border: '#6366f1', text: '#4338ca' },
  // Maggam / Embroidery: Deep Orchid Purple
  maggam:              { rowBg: '#f3e8ff', bg: '#e9d5ff', border: '#a855f7', text: '#7e22ce' },
  maggam_work:         { rowBg: '#f3e8ff', bg: '#e9d5ff', border: '#a855f7', text: '#7e22ce' },
  maggam_handwork:     { rowBg: '#f3e8ff', bg: '#e9d5ff', border: '#a855f7', text: '#7e22ce' },
  maggam_verification: { rowBg: '#fae8ff', bg: '#f5d0fe', border: '#d946ef', text: '#a21caf' },
  embroidery:          { rowBg: '#f3e8ff', bg: '#e9d5ff', border: '#a855f7', text: '#7e22ce' },
  // Stitching: Warm Golden Amber
  stitching:             { rowBg: '#fef3c7', bg: '#fde68a', border: '#f59e0b', text: '#b45309' },
  stitching_in_progress: { rowBg: '#fef3c7', bg: '#fde68a', border: '#f59e0b', text: '#b45309' },
  // Finishing: Fresh Lime Chartreuse
  finishing: { rowBg: '#ecfccb', bg: '#d9f99d', border: '#84cc16', text: '#3f6212' },
  // Pressing & Packaging: Electric Cyan / Aqua
  pressing:  { rowBg: '#cffafe', bg: '#a5f3fc', border: '#06b6d4', text: '#0e7490' },
  ironing:   { rowBg: '#cffafe', bg: '#a5f3fc', border: '#06b6d4', text: '#0e7490' },
  packaging: { rowBg: '#cffafe', bg: '#a5f3fc', border: '#06b6d4', text: '#0e7490' },
  // Quality Check: Vivid Rose Pink
  master_quality_check: { rowBg: '#fce7f3', bg: '#fbcfe8', border: '#ec4899', text: '#be185d' },
  quality_check:        { rowBg: '#fce7f3', bg: '#fbcfe8', border: '#ec4899', text: '#be185d' },
  qc:                   { rowBg: '#fce7f3', bg: '#fbcfe8', border: '#ec4899', text: '#be185d' },
  // Trial: Lavender Iris
  trial:           { rowBg: '#ede9fe', bg: '#ddd6fe', border: '#8b5cf6', text: '#6d28d9' },
  trial_scheduled: { rowBg: '#ede9fe', bg: '#ddd6fe', border: '#8b5cf6', text: '#6d28d9' },
  trial_completed: { rowBg: '#dcfce7', bg: '#bbf7d0', border: '#22c55e', text: '#15803d' },
  // Alteration: Tangerine Orange
  alteration:      { rowBg: '#ffedd5', bg: '#fed7aa', border: '#f97316', text: '#c2410c' },
  alteration_work: { rowBg: '#ffedd5', bg: '#fed7aa', border: '#f97316', text: '#c2410c' },
  // Delivery: Fresh Emerald Green
  ready_for_delivery: { rowBg: '#dcfce7', bg: '#bbf7d0', border: '#22c55e', text: '#15803d' },
  delivery:           { rowBg: '#dcfce7', bg: '#bbf7d0', border: '#22c55e', text: '#15803d' },
  delivered:          { rowBg: '#dcfce7', bg: '#bbf7d0', border: '#22c55e', text: '#15803d' },
  // Payment: Fuchsia Berry
  payment: { rowBg: '#fae8ff', bg: '#f5d0fe', border: '#d946ef', text: '#a21caf' },
  // New / Created / Not sent: Canary Yellow
  new:      { rowBg: '#fef9c3', bg: '#fef08a', border: '#eab308', text: '#854d0e' },
  not_sent: { rowBg: '#fef9c3', bg: '#fef08a', border: '#eab308', text: '#854d0e' },
  // Cancelled: Cool Slate Gray
  cancelled: { rowBg: '#e2e8f0', bg: '#cbd5e1', border: '#64748b', text: '#475569' },
};

export const getStageBadgeStyle = (stageKey, stageName = '') => {
  if (stageKey && STEP_COLORS[stageKey]) return STEP_COLORS[stageKey];
  const name = (stageName || stageKey || '').toLowerCase();
  if (name.includes('paper')) return STEP_COLORS.paper_cutting;
  if (name.includes('fabric')) return STEP_COLORS.fabric_cutting;
  if (name.includes('cut')) return STEP_COLORS.pattern_cutting;
  if (name.includes('maggam') || name.includes('embroid') || name.includes('zari')) return STEP_COLORS.maggam_work;
  if (name.includes('stitch') || name.includes('sew')) return STEP_COLORS.stitching_in_progress;
  if (name.includes('finish') || name.includes('hem')) return STEP_COLORS.finishing;
  if (name.includes('press') || name.includes('iron') || name.includes('pack')) return STEP_COLORS.pressing;
  if (name.includes('qc') || name.includes('quality') || name.includes('check')) return STEP_COLORS.master_quality_check;
  if (name.includes('trial') || name.includes('fit')) return STEP_COLORS.trial_scheduled;
  if (name.includes('alter')) return STEP_COLORS.alteration_work;
  if (name.includes('deliver') || name.includes('ready')) return STEP_COLORS.delivered;
  if (name.includes('pay') || name.includes('bill')) return STEP_COLORS.payment;
  if (name.includes('cancel')) return STEP_COLORS.cancelled;
  if (name.includes('not sent') || name.includes('new') || name.includes('create')) return STEP_COLORS.new;

  const PALETTE = [
    { rowBg: '#dbeafe', bg: '#bfdbfe', border: '#3b82f6', text: '#1d4ed8' }, // Blue
    { rowBg: '#f3e8ff', bg: '#e9d5ff', border: '#a855f7', text: '#7e22ce' }, // Purple
    { rowBg: '#fef3c7', bg: '#fde68a', border: '#f59e0b', text: '#b45309' }, // Amber
    { rowBg: '#ccfbf1', bg: '#99f6e4', border: '#14b8a6', text: '#0f766e' }, // Teal
    { rowBg: '#fce7f3', bg: '#fbcfe8', border: '#ec4899', text: '#be185d' }, // Rose Pink
    { rowBg: '#ffedd5', bg: '#fed7aa', border: '#f97316', text: '#c2410c' }, // Orange
    { rowBg: '#ecfccb', bg: '#d9f99d', border: '#84cc16', text: '#3f6212' }, // Lime
    { rowBg: '#cffafe', bg: '#a5f3fc', border: '#06b6d4', text: '#0e7490' }, // Cyan
    { rowBg: '#e0e7ff', bg: '#c7d2fe', border: '#6366f1', text: '#4338ca' }, // Indigo
    { rowBg: '#dcfce7', bg: '#bbf7d0', border: '#22c55e', text: '#15803d' }, // Emerald
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
