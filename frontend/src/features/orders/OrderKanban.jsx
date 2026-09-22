import { useState } from 'react';
import {
  Calendar, CheckCircle2, ClipboardList, Hand, IndianRupee, Package, PackageCheck, PenTool, Ruler, Scissors,
  Shirt, ShieldCheck, Sparkles, Truck, User, Zap,
} from 'lucide-react';
import { api } from '../../services/api';
import { formatDate, orderRef } from '../../services/format';
import { IconTile } from '../../components/ui/Atelier';
import { expressLabel, isExpressOrder } from './express';


const SETTLED = new Set(['COMPLETED', 'SKIPPED']);
const DUE_SOON_DAYS = 7; 
const STATUS_LABEL = {
  NOT_STARTED: 'Not started',
  IN_PROGRESS: 'In progress',
  PAUSED: 'In progress',
  PENDING_VERIFICATION: 'In progress',
  COMPLETED: 'Completed',
  SKIPPED: 'Completed',
};

const STAGE_LOOK = {
  created:               ['amber',   Sparkles,     'New orders to be processed'],
  measurements_completed:['amber',   Ruler,        'Awaiting / in progress'],
  fabric_confirmed:      ['green',   Package,      'Fabric selected & ready'],
  pattern_cutting:       ['blue',    Scissors,     'Cutting in progress'],
  paper_cutting:         ['blue',    Scissors,     'Paper pattern for the embroiderer'],
  maggam_work:           ['violet',  PenTool,      'Embroidery in progress'],
  maggam_handwork:       ['violet',  Hand,         'Frame work on the finished design'],
  maggam_verification:   ['violet',  ShieldCheck,  'Embroidery awaiting sign-off'],
  fabric_cutting:        ['blue',    Scissors,     'Cutting after embroidery'],
  stitching_in_progress: ['violet',  Shirt,        'Stitching in progress'],
  finishing:             ['amber',   Shirt,        'Hemming & finishing'],
  pressing:              ['amber',   PackageCheck, 'Pressing & packaging'],
  master_quality_check:  ['blue',    ShieldCheck,  'Master inspection'],
  trial_scheduled:       ['green',   Calendar,     'Fitting booked'],
  trial_completed:       ['green',   CheckCircle2, 'Fitting done'],
  ready_for_delivery:    ['green',   PackageCheck, 'Packed and waiting'],
  payment:               ['green',   IndianRupee,  'Settling the bill'],
  delivered:             ['green',   Truck,        'With the customer'],
};

function liveStage(order, columns) {
  if (!(order.stages || []).length) {
    
    return { stage_key: order.current_stage_key, status: null, legacy: true };
  }
  
  for (const col of columns) {
    const stage = rowsOf(order, col.key).find((s) => !SETTLED.has(s.status));
    if (stage) return stage;
  }
  const last = columns[columns.length - 1];
  return (last && rowsOf(order, last.key)[0]) || null;
}

const rowsOf = (order, key) => (order.stages || []).filter((s) => s.stage_key === key);

function dueTone(order, today) {
  if (!order.estimated_delivery || order.order_status === 'Delivered') return null;
  const due = new Date(order.estimated_delivery);
  if (due < today) return 'overdue';
  const soon = new Date(today);
  soon.setDate(soon.getDate() + DUE_SOON_DAYS);
  return due <= soon ? 'soon' : null;
}

function reworkNote(order) {
  // The latest thing that happened to the order, if it was a reversal.
  const last = (order.activities || [])[0];
  if (last?.event_type === 'QC_FAILED') return 'QC failed — rework';
  if (last?.event_type === 'STAGE_REOPENED') return 'Stage reopened';
  return null;
}

const PAYMENT_TONE = { Paid: 'success', 'Partially Paid': 'warning', Pending: 'danger' };

export default function OrderKanban({ orders, workflow, onOpen, onChanged, canDrag = true }) {
  const [dragging, setDragging] = useState(null);
  const [overColumn, setOverColumn] = useState(null);
  const [busyOrder, setBusyOrder] = useState(null);

  const carried = new Set(orders.flatMap((o) => (o.stages || []).map((s) => s.stage_key)));
  const columns = (workflow && workflow.length)
    ? workflow.filter((s) => s.key && (carried.size === 0 || carried.has(s.key)))
    : ((orders[0]?.stages || []).map((s) => ({ key: s.stage_key, name: s.stage_name })));
  const keys = columns.map((c) => c.key);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const placed = columns.map((col) => ({ col, cards: [] }));
  const byKey = Object.fromEntries(placed.map((p) => [p.col.key, p]));
  orders.forEach((order) => {
    const stage = liveStage(order, columns);
    const slot = stage && byKey[stage.stage_key];
    if (slot) slot.cards.push({ order, stage });
  });

  const moveOrder = async (order, target) => {
    const current = liveStage(order, columns);
    const from = keys.indexOf(current?.stage_key);
    const to = keys.indexOf(target.key);
    if (from === -1 || to === -1 || to === from) return;

    if (to < from) {
      alert(`${target.name} is already settled for ${orderRef(order)}. `
        + 'Moving a settled stage backwards needs a supervisor: open the card '
        + 'and use Reopen Stage (or Fail QC for rework).');
      return;
    }

    const stageOf = (key) => rowsOf(order, key)[0];
    if (!stageOf(target.key)) {
      alert(`${orderRef(order)} does not go through ${target.name}: it is on the other path.`);
      return;
    }
    
    const hops = keys.slice(from, to).filter((k) => stageOf(k));
    if (hops.length > 1) {
      const names = hops.map((k) => columns.find((c) => c.key === k)?.name || k).join(', ');
      if (!window.confirm(`Moving ${orderRef(order)} to ${target.name} will complete `
          + `${hops.length} stages first (${names}). Continue?`)) return;
    }

    setBusyOrder(order.id);
    try {
      for (const key of hops) {
        const col = columns.find((c) => c.key === key);
        
        for (const row of rowsOf(order, key)) {
          if (SETTLED.has(row.status)) continue;
          const status = (col?.optional && row.status === 'NOT_STARTED') ? 'SKIPPED' : 'COMPLETED';
          await api.transitionStage(order.id, key, status, '', [], null, null, false, row.garment_job || null);
        }
      }
      for (const row of rowsOf(order, target.key)) {
        if (SETTLED.has(row.status) || row.status === 'IN_PROGRESS') continue;
        await api.transitionStage(order.id, target.key, 'IN_PROGRESS', '', [], null, null, false, row.garment_job || null);
      }
    } catch (err) {
      alert(`Could not move ${orderRef(order)}: ${err.message}`);
    } finally {
      setBusyOrder(null);
      onChanged();
    }
  };

  if (!columns.length) {
    return (
      <div className="ui-card" style={{ padding: 'var(--space-10)', textAlign: 'center', color: 'var(--text-muted)' }}>
        No workflow stages are configured for this boutique.
      </div>
    );
  }

  return (
    <div className="kanban-board" role="list" aria-label="Orders by production stage">
      {placed.map(({ col, cards }) => {
        const overdue = cards.filter(({ order }) => dueTone(order, today) === 'overdue').length;
        const isOver = overColumn === col.key && dragging !== null;
        const [tone, Icon, gloss] = STAGE_LOOK[col.key] || ['neutral', ClipboardList, ''];
        return (
          <section
            key={col.key}
            role="listitem"
            className={`kanban-column${isOver ? ' kanban-column--over' : ''}`}
            onDragOver={(e) => { if (canDrag && dragging) { e.preventDefault(); setOverColumn(col.key); } }}
            onDragLeave={() => setOverColumn((k) => (k === col.key ? null : k))}
            onDrop={(e) => {
              e.preventDefault();
              setOverColumn(null);
              const order = orders.find((o) => String(o.id) === e.dataTransfer.getData('text/plain'));
              setDragging(null);
              if (order) moveOrder(order, col);
            }}
          >
            <header className={`kanban-column-head at-stat--${tone}`}>
              <IconTile icon={Icon} tone={tone} size={32} iconSize={15} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="kanban-column-title">{col.name}{col.optional ? ' · optional' : ''}</div>
                <div className="kanban-column-sub">
                  {gloss || `${cards.length} ${cards.length === 1 ? 'order' : 'orders'}`}
                </div>
                {overdue > 0 && (
                  <div className="kanban-column-meta">
                    <span className="ui-badge ui-badge--danger">{overdue} overdue</span>
                  </div>
                )}
              </div>
              <span className="kanban-count" title={`${cards.length} ${cards.length === 1 ? 'order' : 'orders'}`}>{cards.length}</span>
            </header>

            <div className="kanban-cards">
              {cards.length === 0 && <div className="kanban-empty">—</div>}
              {cards.map(({ order, stage }) => {
                const due = dueTone(order, today);
                const rework = reworkNote(order);
                const handler = stage?.assigned_to_name || order.tailor_name || order.master_name;
                const busy = busyOrder === order.id;
                const inert = busy || stage?.legacy;
                const statusTone = ['IN_PROGRESS', 'PAUSED', 'PENDING_VERIFICATION'].includes(stage?.status) ? 'info'
                  : SETTLED.has(stage?.status) ? 'success' : 'neutral';
                return (
                  <article
                    key={order.id}
                    className={`kanban-card ui-card ui-card--tap${busy ? ' kanban-card--busy' : ''}${isExpressOrder(order) ? ' gh-express' : ''}`}
                    draggable={canDrag && !inert}
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', String(order.id));
                      e.dataTransfer.effectAllowed = 'move';
                      setDragging(order.id);
                    }}
                    onDragEnd={() => { setDragging(null); setOverColumn(null); }}
                    onClick={() => { if (!stage?.legacy) onOpen(order, stage); }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!stage?.legacy) onOpen(order, stage); } }}
                    title={stage?.legacy ? 'No production stages recorded for this order.' : undefined}
                    tabIndex={0}
                    role="button"
                    aria-label={`${orderRef(order)} for ${order.customer_name}, ${col.name}, ${STATUS_LABEL[stage?.status] || ''}`}
                  >
                    {/* The finished garment where it has been photographed;
                        until then a tinted tile in the column's colour. */}
                    <div className={`kanban-thumb at-tile--${tone}`}>
                      {order.completed_garment_image
                        ? <img src={order.completed_garment_image} alt="" />
                        : <Shirt size={22} />}
                    </div>
                    <div className="kanban-card-body">
                      <div className="kanban-card-head">
                        <span className="kanban-card-ref">{orderRef(order)}
                          {isExpressOrder(order) && (
                            <span className="gh-express-tag" title={expressLabel(order)}><Zap size={11} /> EXPRESS</span>
                          )}
                        </span>
                        <span className={`ui-badge ui-badge--${statusTone}`}>
                          {stage?.legacy ? 'No stages' : (STATUS_LABEL[stage?.status] || stage?.status || '—')}
                        </span>
                      </div>
                      <div className="kanban-card-customer">{order.customer_name}</div>
                      {order.garment_label && (
                        <div className="kanban-card-line">{order.garment_label}</div>
                      )}
                      <div className="kanban-card-line">
                        <Calendar size={12} />
                        Delivery: {order.estimated_delivery ? formatDate(order.estimated_delivery) : 'TBD'}
                        {due === 'overdue' && <span className="ui-badge ui-badge--danger">Overdue</span>}
                        {due === 'soon' && <span className="ui-badge ui-badge--warning">Due soon</span>}
                      </div>
                      <div className="kanban-card-line">
                        <User size={12} />
                        {stage?.assigned_to_name ? 'Assigned' : order.tailor_name ? 'Tailor' : 'Master'}: {handler || <span style={{ color: 'var(--text-muted)' }}>Unassigned</span>}
                      </div>
                      {(rework || order.payment_status) && (
                        <div className="kanban-card-flags">
                          {rework && <span className="ui-badge ui-badge--danger">{rework}</span>}
                          {order.payment_status && (
                            <span className={`ui-badge ui-badge--${PAYMENT_TONE[order.payment_status] || 'neutral'}`}>{order.payment_status}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
