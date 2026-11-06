import { orderRef } from '../../utils/format';
import { extraMeasurements } from '../catalog/templates';

/** What the work screens read off an order and its stages: labels, who did what, and measurements. */

const CLOSED = ['Delivered', 'Cancelled'];

export const FINISHED = ['COMPLETED', 'SKIPPED'];

const STATUS_LABELS = {
  NOT_STARTED: ['workPage.statusTodo', 'To do'],
  IN_PROGRESS: ['workPage.statusInProgress', 'In progress'],
  PENDING_VERIFICATION: ['workPage.statusSent', 'Sent for checking'],
  COMPLETED: ['workPage.statusDone', 'Done'],
  SKIPPED: ['workPage.statusSkipped', 'Skipped'],
  PAUSED: ['workPage.statusPaused', 'Paused'],
};

export const isOpenOrder = (o) => !CLOSED.includes(o.order_status);

// The owner's Workshop list: an open order whose work has begun past "created"
// (App.jsx orderBucket). Masters and Designers run the floor, so their My work
// shows the same orders.
export const inWorkshop = (o) => isOpenOrder(o) && (o.stages || []).some((st) => st.stage_key !== 'created'
  && !['NOT_STARTED', 'SKIPPED'].includes(st.status));

export const humanise = (key) => String(key || '').replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

export const statusLabel = (status, t) => { const [k, d] = STATUS_LABELS[status] || []; return k ? t(k, d) : String(status || ''); };

// Orders written before garment jobs existed name their garment on the order.
export const garmentLabel = (order, t) =>
  (order.flow === 'alteration' && order.alteration_garment_name)
  || (order.garment_jobs || []).map((j) => j.display_name || j.template_name).filter(Boolean).join(', ')
  || order.customer_garment_type || t('workPage.customGarment', 'Custom garment');

// A per-garment stage names its garment; an order-level one names them all.
export const jobTitle = (order, stage, t) => `${stage.garment_name || garmentLabel(order, t)} · ${stage.stage_name || humanise(stage.stage_key)}`;

// "#14-2": the order, and which garment of a several-garment order this step is for.
export const stageRef = (order, stage) => {
  const all = order.garment_jobs || [];
  const at = stage.garment_job ? all.findIndex((j) => j.id === stage.garment_job) : -1;
  return all.length > 1 && at >= 0 ? `${orderRef(order)}-${at + 1}` : orderRef(order);
};

// '5 min' / '2 h' / '3 d' since a timestamp.
export function ago(ts, t) {
  if (!ts) return '';
  const mins = Math.max(0, Math.round((Date.now() - new Date(ts).getTime()) / 60000));
  if (mins < 60) return t('workPage.agoMin', '{n} min', { n: mins });
  if (mins < 48 * 60) return t('workPage.agoHour', '{n} h', { n: Math.round(mins / 60) });
  return t('workPage.agoDay', '{n} d', { n: Math.round(mins / 1440) });
}

// Activities arrive newest first.
// This row's own: on a per-garment stage, the activity names the garment.
export const stageActivities = (order, stage) =>
  (order.activities || []).filter((a) => a.metadata?.stage_key === stage.stage_key
    && (!stage.garment_job || !a.metadata?.garment_job || a.metadata.garment_job === stage.garment_job));

// The latest "assigned to <me>" on this row: when it was handed over.
export const assignedToMe = (order, stage, me) => stageActivities(order, stage)
  .find((a) => a.event_type === 'ASSIGNMENT' && String(a.metadata?.assigned_to_id) === String(me));

export const submittedAt = (order, stage) =>
  stageActivities(order, stage).find((a) => a.metadata?.new_status === 'PENDING_VERIFICATION')?.timestamp
  || stageActivities(order, stage)[0]?.timestamp || stage.started_at;

export const sentBackCount = (order, stage) =>
  stageActivities(order, stage).filter((a) => a.metadata?.old_status === 'PENDING_VERIFICATION' && a.metadata?.new_status === 'IN_PROGRESS').length;

export const approvedBy = (order, stage) =>
  stageActivities(order, stage).find((a) => a.event_type === 'STAGE_TRANSITION' && a.metadata?.new_status === 'COMPLETED')?.user_name;

// The worker's latest word. stage.comments holds whoever wrote last, the
// master's send-back reason included, so it cannot be shown as the worker's.
// ponytail: activities carry no role, so a master's plain note on a waiting stage would pass too; add a role to the activity if that ever bites.
export const workerNote = (order, stage) =>
  stageActivities(order, stage).find((a) => a.metadata?.new_status === 'PENDING_VERIFICATION');

export const noteThread = (order, stage) =>
  stageActivities(order, stage).filter((a) =>
    (a.event_type === 'STAGE_TRANSITION' || a.event_type === 'STAGE_NOTE') && (a.metadata.comments || a.metadata.voice_note)).slice(0, 20);

export const entries = (obj) => Object.entries(obj || {}).filter(([, v]) => v !== '' && v != null && typeof v !== 'object');

// A garment's measurements with the ones added by hand ("Add other
// measurement") after the template's, each as [name, value].
export const measureEntries = (m) => [...entries(m),
  ...extraMeasurements(m).map((row) => [String(row.label ?? '').trim(), String(row.value ?? '').trim()])];
