import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { api } from '../../api';
import { expressLabel, isExpressJob, isExpressOrder } from '../orders/express';
import { workKind } from './workKind';
import { orderRef, formatDate } from '../../utils/format';
import { resolveMediaUrl } from '../../services/media';
import { maySignOff, submitsForSignOff } from '../orders/signOff';
import { useLanguage } from '../../i18n/LanguageContext.jsx';
import { Tabs } from '../../components/ui/Atelier';
import CustomerMessageQueue from '../orders/CustomerMessageQueue';
import CardGlance from './CardGlance';
import JobScreen from './JobScreen';
import { FINISHED, ago, approvedBy, assignedToMe, garmentLabel, humanise, inWorkshop, isOpenOrder, sentBackCount, stageActivities, stageRef, statusLabel, submittedAt } from './workHelpers';
import './work.css';
import { workOpenedKey } from '../../constants/storageKeys';

// The "Customer messages not sent" box at the top of My work: hidden, not
// removed -- set to true to bring it back.
const SHOW_FAILED_MESSAGES = false;

/**
 * The floor's three screens: My work, Done, To check. One job = one stage of
 * one order that is mine. Everything reads off the orders the app already
 * fetched; every save goes through api.transitionStage and then onChanged().
 */

// My work shows this many cards first, and this many more per "Show more".
const PAGE = 5;

export default function WorkPanel({ view, orders = [], currentUser, workflowConfig = [], tailors, fabricTaxonomy, onChanged,
                                    customerMessages = [], onMarkMessageSent, onRetryMessage }) {
  const { t } = useLanguage();
  const me = currentUser?.tailor_id;
  const isSupervisor = ['Master', 'Designer'].includes(currentUser?.role);
  const [open, setOpen] = useState(null); // { orderId, stageKey }
  const [seen, setSeen] = useState(() => new Set()); // 'orderId:stageKey' ticked this session
  const [toast, setToast] = useState('');
  // My work's status tab: 'all' is the whole list, as it always was.
  const [tab, setTab] = useState('all');
  // My work's step filter (Cutting, Stitching, ...): Masters and Designers
  // only. 'all' is every step, the list as it always was.
  const [step, setStep] = useState('all');
  // How many cards My work shows, remembered for the tab and step it was
  // widened on: another tab or step starts again from the first PAGE.
  const [shown, setShown] = useState({ key: '', n: PAGE });
  const canFilterSteps = view === 'open' && ['Master', 'Designer'].includes(currentUser?.role);
  // Work handed to me that I have not opened yet is marked NEW, so a fresh
  // assignment stands out from the jobs already on my list. Opened jobs are
  // remembered on this device per person; a job handed back to me counts again.
  // shortcut: remembered per device, not per account -- move to the server if staff share or switch phones.
  const openedStore = workOpenedKey(currentUser?.id ?? '');
  const [opened, setOpened] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem(openedStore) || '[]')); } catch { return new Set(); }
  });
  const openedId = (stage) => `${stage.id}:${stage.assigned_to}`;
  const isNew = (order, stage) => view === 'open' && me != null && stage.assigned_to === me
    && !FINISHED.includes(stage.status) && stage.status !== 'PENDING_VERIFICATION'
    && !opened.has(openedId(stage))
    // Not moved by me: a step someone else started for me is still new to me.
    && !stageActivities(order, stage).some((a) => a.event_type === 'STAGE_TRANSITION' && a.user === currentUser?.id);
  const markOpened = (order, stage) => {
    if (!isNew(order, stage)) return;
    setOpened((prev) => {
      const next = new Set(prev).add(openedId(stage));
      try { localStorage.setItem(openedStore, JSON.stringify([...next].slice(-500))); } catch { /* private mode */ }
      return next;
    });
  };
  // Other people move steps too: reload quietly every minute and on coming
  // back to the app, but not while a job is open.
  const openRef = useRef(null);
  useEffect(() => { openRef.current = open; }, [open]);
  useEffect(() => {
    if (!onChanged) return undefined;
    const again = () => { if (!openRef.current && !document.hidden) onChanged(); };
    const timer = setInterval(again, 60000);
    window.addEventListener('focus', again);
    return () => { clearInterval(timer); window.removeEventListener('focus', again); };
  }, [onChanged]);

  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(''), 3000);
    return () => clearTimeout(id);
  }, [toast]);

  // A supervisor opening a submitted stage leaves the "seen" tick.
  useEffect(() => {
    if (view !== 'check' || !open) return;
    const key = `${open.orderId}:${open.stageId}`;
    api.markStageSeen(open.orderId, open.stageKey, open.garmentJob || null).then(() => setSeen((s) => new Set(s).add(key))).catch(() => {});
  }, [view, open]);

  const rolesFor = (key) => workflowConfig.find((s) => s.key === key)?.roles || [];
  const isMine = (order, s) => s.assigned_to === me
    || (rolesFor(s.stage_key).includes(currentUser?.role) && s.assigned_to == null
        && (order.tailor === me || order.master === me || currentUser?.role !== 'Tailor'));
  // On My work a supervisor sees every Workshop order's work, whoever holds it.
  // A Designer's step is not shown to the Master: the Designer ranks above them.
  const isDesignerStep = (s) => s.assigned_to_role === 'Designer' || s.performed_by_role === 'Designer';
  const isListed = (order, s) => isMine(order, s) || (view === 'open' && isSupervisor && inWorkshop(order)
    && !(currentUser?.role === 'Master' && isDesignerStep(s)));
  // Earlier work on this garment (and the order-level stages) must be finished.
  const isReady = (order, s) => (order.stages || []).every((o) => o.sequence >= s.sequence || FINISHED.includes(o.status)
    || (o.garment_job && s.garment_job && o.garment_job !== s.garment_job));

  // Every (order, stage) pair this view lists, already sorted.
  const { items: allItems, later } = useMemo(() => {
    const out = [];
    let notReady = 0;
    orders.forEach((order) => {
      (order.stages || []).forEach((stage) => {
        if (view === 'check') {
          if (isOpenOrder(order) && stage.status === 'PENDING_VERIFICATION' && maySignOff(currentUser?.role, stage)) out.push({ order, stage, at: submittedAt(order, stage) });
          return;
        }
        // A step split between several people: a worker's jobs are their own
        // parts of it (a Master or Designer still sees the step as a whole).
        if ((stage.parts || []).length && !isSupervisor) {
          stage.parts.filter((part) => part.assigned_to === me).forEach((part) => {
            if (view === 'done') { if (part.status === 'COMPLETED') out.push({ order, stage, part, at: part.completed_at || part.started_at }); return; }
            if (FINISHED.includes(stage.status) || !isOpenOrder(order)) return;
            if (part.status === 'IN_PROGRESS') out.push({ order, stage, part, group: 'now' });
            else if (part.status === 'PENDING_VERIFICATION') out.push({ order, stage, part, group: 'waiting' });
            else if (part.status === 'NOT_STARTED') {
              if (isReady(order, stage)) out.push({ order, stage, part, group: 'next' });
              else notReady += 1;
            }
          });
          return;
        }
        if (!isListed(order, stage)) return;
        const finished = FINISHED.includes(stage.status);
        if (view === 'done') { if (finished) out.push({ order, stage, at: stage.completed_at || stage.started_at }); return; }
        if (finished || !isOpenOrder(order)) return;
        if (stage.status === 'IN_PROGRESS') out.push({ order, stage, group: 'now' });
        // A Master's own submission waits for the Owner or Designer, so it
        // sits in their Waiting group like a worker's does.
        else if (stage.status === 'PENDING_VERIFICATION') {
          if (!isSupervisor || (stage.performed_by === me && !maySignOff(currentUser?.role, stage))) out.push({ order, stage, group: 'waiting' });
        }
        else if (isReady(order, stage)) out.push({ order, stage, group: 'next' });
        else notReady += 1;
      });
    });
    if (view !== 'open') out.sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));
    return { items: out, later: notReady };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, view, me, currentUser?.role, workflowConfig]);

  // The steps in this list, each with how many jobs it has; a step picked
  // earlier that has since emptied falls back to all of them.
  const steps = useMemo(() => {
    if (!canFilterSteps) return [];
    const byKey = new Map();
    allItems.forEach(({ stage }) => {
      const hit = byKey.get(stage.stage_key);
      if (hit) hit.count += 1;
      else byKey.set(stage.stage_key, { key: stage.stage_key, label: stage.stage_name || humanise(stage.stage_key), count: 1 });
    });
    return [...byKey.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [allItems, canFilterSteps]);
  const activeStep = steps.some((s) => s.key === step) ? step : 'all';
  const stepActive = activeStep !== 'all';
  const items = stepActive ? allItems.filter((i) => i.stage.stage_key === activeStep) : allItems;

  // The open job re-reads from the fresh orders after each refetch.
  const current = open && (() => {
    const order = orders.find((o) => o.id === open.orderId);
    const stage = order?.stages?.find((s) => s.id === open.stageId);
    const part = open.partId ? (stage?.parts || []).find((p) => p.id === open.partId) : null;
    if (open.partId && !part) return null;
    return order && stage ? { order, stage, part } : null;
  })();

  const done = (msg) => { setOpen(null); setToast(msg); onChanged?.(); };
  // Saved without closing the job (a voice note): the list refreshes behind it.
  const refreshed = (msg) => { setToast(msg); onChanged?.(); };

  // A stage belonging to one garment is Express only when that garment is;
  // an order-wide stage is Express when any garment on the order is.
  const stageIsExpress = (order, stage) => (stage?.garment_job
    ? (order.garment_jobs || []).some((j) => j.id === stage.garment_job && isExpressJob(j))
    : isExpressOrder(order));

  const card = ({ order, stage, part }, extra) => (
    <button type="button" key={`${order.id}-${stage.id}${part ? `-${part.id}` : ''}`} className={`wk-card${stageIsExpress(order, stage) ? ' gh-express' : ''}${isNew(order, stage) ? ' wk-card--new' : ''}`}
            data-kind={workKind(stage.stage_key).key} style={{ '--wk-kind': workKind(stage.stage_key).color }}
            onClick={() => { markOpened(order, stage); setOpen({ orderId: order.id, stageId: stage.id, stageKey: stage.stage_key, garmentJob: stage.garment_job || null, partId: part?.id || null }); }}>
      <div className="wk-card-head">
        {/* The garment here; the step itself is the coloured tag below, once. */}
        <div className="wk-card-title">{stage.garment_name || garmentLabel(order, t)}
          {isNew(order, stage) && (
            <span className="wk-new-tag" title={t('workPage.newHint', 'Assigned to you, not opened yet')}>{t('workPage.new', 'NEW')}</span>
          )}
          {stageIsExpress(order, stage) && (
            <span className="gh-express-tag" title={expressLabel(order)}>EXPRESS</span>
          )}
        </div>
        {extra.chip}
      </div>
      <div className="wk-card-sub">
        {/* The step, by name, in its kind's colour (Pattern cutting, Paper
            cutting and Fabric cutting share the cutting blue). */}
        <span className="wk-kind-tag">{stage.stage_name || humanise(stage.stage_key)}{part ? ` · ${part.label}` : ''}</span>
        {stageRef(order, stage)} · {order.customer_name}
      </div>
      {extra.meta && <div className="wk-card-meta">{extra.meta}</div>}
      {/* A part's card names the part's person, not the whole step's. */}
      <CardGlance order={order} stage={part ? { ...stage, assigned_to_name: part.assigned_to_name, assigned_to_role: part.assigned_to_role } : stage} t={t} />
      {extra.body}
    </button>
  );

  let body;
  if (view === 'open') {
    // Work just handed to me leads the list, latest assignment first: the
    // card highlighted, saying what it was assigned for. Opened once, it
    // goes back to its own place under "Do now" or "Next".
    const assignedAt = ({ order, stage }) => new Date(
      assignedToMe(order, stage, me)?.timestamp || order.activities?.[0]?.timestamp || order.order_date || 0);
    const newOnTop = items.filter((i) => (i.group === 'next' || i.group === 'now') && isNew(i.order, i.stage))
      .sort((a, b) => assignedAt(b) - assignedAt(a));
    const newSection = (list) => list.length > 0 && (
      <section className="wk-group">
        {list.map((it) => card(it, {
          chip: it.group === 'now'
            ? <span className="ui-badge ui-badge--warning">{t('workPage.inProgress', 'In progress')}</span>
            : null, // no "Ready" badge on a job not started yet
          meta: it.order.estimated_delivery && <span>{t('workPage.due', 'Due')} {formatDate(it.order.estimated_delivery)}</span>,
          body: (
            <div className="wk-assigned-for">
              {t('workPage.assignedFor', 'Assigned to you for:')}{' '}
              <strong>{it.stage.stage_name || humanise(it.stage.stage_key)}</strong>
              {it.stage.garment_name && <> ({it.stage.garment_name})</>}
            </div>
          ),
        }))}
      </section>
    );
    const groups = [
      ['now', t('workPage.doNow', 'Do now')],
      ['next', t('workPage.next', 'Next')],
      ['waiting', t('workPage.waitingForMaster', 'Waiting for the master')],
    ];
    // One card of a Do now / Next / Waiting list (also the status tabs' cards).
    const groupCard = (key, it) => {
      const sentBack = key === 'now' && (it.part ? it.part.verification_note : it.stage.verification_note);
      const chip = key === 'now'
        ? <span className={`ui-badge ui-badge--${sentBack ? 'danger' : 'warning'}`}>{sentBack ? t('workPage.sentBack', 'Sent back') : t('workPage.inProgress', 'In progress')}</span>
        : key === 'next'
          ? null // no "Ready" badge on a job not started yet
          : <span className="ui-badge ui-badge--info">{t('workPage.waiting', 'Waiting')}</span>;
      const due = it.order.estimated_delivery && <span>{t('workPage.due', 'Due')} {formatDate(it.order.estimated_delivery)}</span>;
      const sent = key === 'waiting' && <span>· {t('workPage.sentAgo', 'sent {n} ago', { n: ago(submittedAt(it.order, it.stage), t) })}</span>;
      return card(it, {
        chip, meta: (due || sent) && <>{due}{sent}</>,
        body: sentBack && <div className="wk-card-note">{String(sentBack).split('\n')[0]}</div>,
      });
    };
    // Status tabs over the same list. A tab shows one status, newest
    // assignment first; "All" is the whole list exactly as before.
    const byStatus = (group) => [
      ...newOnTop.filter((i) => i.group === group),
      ...items.filter((i) => i.group === group && !newOnTop.includes(i)),
    ];
    const tabs = [
      ['all', t('workPage.tabAll', 'All'), null],
      ['assigned', t('workPage.tabAssigned', 'Assigned'), byStatus('next')],
      ['now', t('workPage.inProgress', 'In progress'), byStatus('now')],
      ['waiting', t('workPage.tabWaiting', 'Waiting for check'), byStatus('waiting')],
    ].filter(([key, , list]) => key === 'all' || key === 'assigned' || key === 'now' || list.length > 0);
    const active = tabs.some(([key]) => key === tab) ? tab : 'all';
    // The pager: the first `limit` cards in the order they are listed, then
    // "Show more". `takeAll` hands the allowance out list by list, in order.
    const pageKey = `${active}|${activeStep}`;
    const limit = shown.key === pageKey ? shown.n : PAGE;
    const takeAll = (lists) => {
      let left = limit;
      return lists.map((list) => { const out = list.slice(0, Math.max(left, 0)); left -= out.length; return out; });
    };
    const pager = (total) => total > limit && (
      <div className="wk-more">
        <span className="wk-more-count">
          {t('workPage.showingOf', 'Showing {n} of {total}', { n: limit, total })}
        </span>
        <div className="wk-more-actions">
          <button type="button" className="btn-secondary" onClick={() => setShown({ key: pageKey, n: limit + PAGE })}>
            {t('workPage.showMore', 'Show {n} more', { n: Math.min(PAGE, total - limit) })} <ChevronDown size={16} />
          </button>
          {total - limit > PAGE && (
            <button type="button" className="wk-more-all" onClick={() => setShown({ key: pageKey, n: total })}>
              {t('workPage.showAll', 'Show all {total}', { total })}
            </button>
          )}
        </div>
      </div>
    );
    const tabBar = (
      <Tabs className="wk-tabs" ariaLabel={t('workPage.byStatus', 'Work by status')} value={active} onChange={setTab}
            tabs={tabs.map(([key, label, list]) => ({ key, label, count: key === 'all' ? items.length : list.length }))} />
    );
    // The status tabs, and beside them the step filter (Master / Designer).
    const filterBar = canFilterSteps && steps.length > 0 ? (
      <div className="wk-toolbar">
        {tabBar}
        <label className="wk-step-filter">
          <span>{t('workPage.workStep', 'Work step')}</span>
          <select className="form-control" value={activeStep} onChange={(e) => setStep(e.target.value)}
                  aria-label={t('workPage.filterByStep', 'Filter by work step')}>
            <option value="all">{t('workPage.allSteps', 'All steps')} ({allItems.length})</option>
            {steps.map((s) => <option key={s.key} value={s.key}>{s.label} ({s.count})</option>)}
          </select>
        </label>
      </div>
    ) : tabBar;
    const tabList = tabs.find(([key]) => key === active)?.[2];
    if (active !== 'all') {
      body = (
        <>
          {filterBar}
          {tabList.length === 0
            ? <div className="wk-empty">{t('workPage.emptyTab', 'Nothing here right now.')}</div>
            : <section className="wk-group">{tabList.slice(0, limit).map((it) => groupCard(active === 'assigned' ? 'next' : active, it))}</section>}
          {pager(tabList.length)}
        </>
      );
    } else {
    // The All list in its order -- new work, Do now, Next, Waiting --
    // each section showing what is left of the pager's allowance.
    const groupLists = groups.map(([key, label]) => [key, label,
      items.filter((i) => i.group === key && !((key === 'next' || key === 'now') && isNew(i.order, i.stage)))]);
    const allTotal = newOnTop.length
      + groupLists.reduce((sum, [, , list]) => sum + list.length, 0);
    const [visNew, ...visLists] = takeAll([newOnTop, ...groupLists.map(([, , list]) => list)]);
    const visGroups = groupLists.map(([key, label, list], i) => [key, label, list, visLists[i]]);
    body = stepActive && items.length === 0
      ? <>{filterBar}<div className="wk-empty">{t('workPage.emptyStep', 'No work for this step right now.')}</div></>
      : items.length === 0 && newOnTop.length === 0
      ? (
        <div className="wk-empty">
          {later
            ? t('workPage.emptyLater', 'Nothing to do right now. {n} job(s) are waiting for earlier steps to finish.', { n: later })
            : t('workPage.emptyOpen', 'Nothing to do right now.')}
        </div>
      )
      : (
        <>
          {filterBar}
          {newSection(visNew)}
          {visGroups.map(([key, label, list, shownList]) => {
            if (!shownList.length) return null;
            return (
              <section key={key} className="wk-group">
                <h3 className="wk-group-title">{label} <span className="wk-count">{list.length}</span></h3>
                {shownList.map((it) => groupCard(key, it))}
              </section>
            );
          })}
          {pager(allTotal)}
          {later > 0 && <div className="wk-quiet">{t('workPage.moreLater', '{n} more later', { n: later })}</div>}
        </>
      );
    }
  } else if (view === 'done') {
    body = items.length === 0
      ? <div className="wk-empty">{t('workPage.emptyDone', 'Nothing finished yet.')}</div>
      : items.map((it) => {
        const back = sentBackCount(it.order, it.stage);
        const who = approvedBy(it.order, it.stage);
        return card(it, {
          chip: it.stage.status === 'COMPLETED'
            ? <span className="ui-badge ui-badge--success">✓ {who ? t('workPage.checkedBy', 'Checked by {who}', { who }) : t('workPage.checked', 'Checked')}</span>
            : <span className="ui-badge ui-badge--neutral">{statusLabel(it.stage.status, t)}</span>,
          meta: <>{it.at && <span>{formatDate(it.at)}</span>}{back > 0 && <span>· {back === 1 ? t('workPage.sentBackOnce', 'sent back once') : t('workPage.sentBackTimes', 'sent back {n} times', { n: back })}</span>}</>,
          body: <Thumbs urls={it.stage.attachments} />,
        });
      });
  } else {
    body = items.length === 0
      ? <div className="wk-empty">{t('workPage.emptyCheck', 'Nothing waiting for a check.')}</div>
      : items.map((it) => card(it, {
        chip: !it.stage.verification_seen_at && !seen.has(`${it.order.id}:${it.stage.id}`)
          && <span className="wk-dot" aria-label={t('workPage.new', 'new')} />,
        meta: <>
          <span>{it.stage.performed_by_name || it.stage.assigned_to_name || t('workPage.someone', 'Someone')}</span>
          <span>· {t('workPage.waitingAgo', 'waiting {n}', { n: ago(it.at, t) })}</span>
        </>,
        body: <Thumbs urls={it.stage.attachments} />,
      }));
  }

  // A Master has no order page to reach: the Workshop orders' customer
  // messages WhatsApp gave up on sit at the top of My work instead.
  // Hidden for now (SHOW_FAILED_MESSAGES); the messages are still listed for
  // the owner, on the orders' pages.
  const failedMessages = view === 'open' && onRetryMessage
    ? customerMessages.filter((m) => m.status === 'FAILED' && orders.some((o) => o.id === m.order && inWorkshop(o)))
    : [];

  return (
    <div className="wk">
      {SHOW_FAILED_MESSAGES && failedMessages.length > 0 && (
        <CustomerMessageQueue
          title={t('workPage.failedMessages', 'Customer messages not sent')}
          messages={failedMessages}
          orderLabel={(m) => { const o = orders.find((x) => x.id === m.order); return o ? orderRef(o) : ''; }}
          onMarkSent={onMarkMessageSent}
          onRetry={onRetryMessage}
        />
      )}
      {body}
      {current && (
        <JobScreen key={`${current.order.id}-${current.stage.stage_key}${current.part ? `-${current.part.id}` : ''}`} order={current.order} stage={current.stage}
                   part={current.part} workflowConfig={workflowConfig}
                   mode={view === 'check' ? 'check' : view === 'done' ? 'read' : 'work'}
                   isSupervisor={isSupervisor} me={me} stageRoles={rolesFor(current.stage.stage_key)}
                   submits={submitsForSignOff(currentUser?.role, currentUser?.role, current.stage.stage_key, rolesFor(current.stage.stage_key))}
                   tailors={tailors} fabricTaxonomy={fabricTaxonomy}
                   onClose={() => setOpen(null)} onDone={done} onSaved={refreshed} />
      )}
      {toast && <div className="wk-toast" role="status">{toast}</div>}
    </div>
  );
}

function Thumbs({ urls }) {
  const list = (urls || []).slice(0, 3);
  if (!list.length) return null;
  return <div className="wk-thumbs">{list.map((u) => <img key={u} src={resolveMediaUrl(u)} alt="" loading="lazy" />)}</div>;
}
