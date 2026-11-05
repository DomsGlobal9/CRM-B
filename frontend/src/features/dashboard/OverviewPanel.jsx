import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, Check, CalendarClock, ChevronRight, ClipboardCheck, ClipboardList, Clock, MessageSquareWarning, PackageCheck, Plus, RotateCw, Ruler, Scissors, Search, ShieldCheck, Shirt, Truck, TrendingUp, Users, Wallet } from 'lucide-react';
import { PageHeader } from '../../components/ui/Atelier';
import { HeaderClock } from '../../components/ui/HeaderClock';
import { GuidedHighlight } from '../../components/ui/GuidedHighlight';
import { hasTask } from '../../components/ui/tourTasks';
import { api } from '../../services/api';
import { formatDate as fmtDate, inr } from '../../services/format';
import { orderBucket, stageNow } from '../orders/stages';
import { isoDay, plusDaysIso, todayIso } from '../../services/dates';
import { APPOINTMENT_TYPE_LABELS } from '../../constants/appointments';
import { useLanguage } from '../../i18n/LanguageContext.jsx';
import { useApp } from '../../context/AppContext';
import './dashboard.css';

const compactInr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { notation: 'compact', maximumFractionDigits: 1 })}`;

/** One of the four figures across the top. */
function Figure({ icon: Icon, tone, label, value, sub, extra, onClick }) {
  return (
    <button type="button" className={`dsh-figure dsh-figure--${tone}`} onClick={onClick}>
      <span className="dsh-figure-top">
        <span className="dsh-figure-label">{label}</span>
        <span className="dsh-icon"><Icon size={17} /></span>
      </span>
      <span className="dsh-figure-value">{value}</span>
      <span className="dsh-figure-foot">
        {extra}
        <span className="dsh-figure-sub">{sub}</span>
      </span>
    </button>
  );
}

/** Revenue this period against the same days of the month before. */
function useGrowth(reloadKey) {
  const [growth, setGrowth] = useState(null);
  useEffect(() => {
    let live = true;
    const now = new Date();
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    const sameDay = new Date(now.getFullYear(), now.getMonth() - 1, Math.min(now.getDate(), lastMonthEnd.getDate()));
    const total = (report) => (report?.series || []).reduce((sum, row) => sum + Number(row.revenue || 0), 0);
    Promise.all([
      api.getFinanceTrend({ period: 'custom', since: isoDay(new Date(now.getFullYear(), now.getMonth(), 1)), until: isoDay(now) }),
      api.getFinanceTrend({ period: 'custom', since: isoDay(new Date(now.getFullYear(), now.getMonth() - 1, 1)), until: isoDay(sameDay) }),
    ]).then(([current, before]) => {
      if (!live) return;
      const was = total(before);
      setGrowth(was > 0 ? Math.round(((total(current) - was) / was) * 100) : null);
    }).catch(() => { if (live) setGrowth(null); });
    return () => { live = false; };
  }, [reloadKey]);
  return growth;
}

const PERIODS = [['week', 'Weekly'], ['month', 'Monthly'], ['year', 'Yearly']];

/** Revenue over the period (GET /finance/trend/) above the orders taken in the
 *  same buckets, sharing one time axis and one tooltip. Two plots, never two
 *  scales on one plot. */
function BusinessChart({ orders, ordersReady, reloadKey, t }) {
  const [period, setPeriod] = useState('month');
  const [result, setResult] = useState({ key: null, rows: null, failed: false });
  const [hover, setHover] = useState(null);
  const askedFor = `${period}:${reloadKey}`;

  useEffect(() => {
    let live = true;
    api.getFinanceTrend({ period })
      .then((report) => { if (live) setResult({ key: askedFor, rows: report?.series || [], failed: false }); })
      .catch(() => { if (live) setResult({ key: askedFor, rows: null, failed: true }); });
    return () => { live = false; };
  }, [period, askedFor]);

  const loading = result.key !== askedFor;
  const rows = useMemo(() => (result.rows || []).map((row) => {
    const count = orders.filter((o) => {
      const day = o.order_date ? isoDay(new Date(o.order_date)) : '';
      return day >= row.since && day <= row.until;
    }).length;
    const start = new Date(`${row.since}T00:00:00`);
    const label = period === 'year' ? start.toLocaleDateString([], { month: 'short' })
      : period === 'week' ? start.toLocaleDateString([], { weekday: 'short' })
        : String(start.getDate());
    const full = period === 'year' ? start.toLocaleDateString([], { month: 'long', year: 'numeric' })
      : start.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
    return { label, full, revenue: Number(row.revenue || 0), orders: count };
  }), [result.rows, orders, period]);

  const n = rows.length;
  const topRevenue = Math.max(...rows.map((r) => r.revenue), 1);
  const topOrders = Math.max(...rows.map((r) => r.orders), 1);
  const totalRevenue = rows.reduce((sum, r) => sum + r.revenue, 0);
  const totalOrders = rows.reduce((sum, r) => sum + r.orders, 0);
  const every = n > 14 ? Math.ceil(n / 7) : 1;
  const point = (r, i) => [((i + 0.5) / n) * 1000, 176 - (r.revenue / topRevenue) * 160];
  const line = rows.map(point).reduce((path, [x, y], i, pts) => {
    if (!i) return `M ${x} ${y}`;
    const [px, py] = pts[i - 1];
    const mid = (px + x) / 2;
    return `${path} C ${mid} ${py}, ${mid} ${y}, ${x} ${y}`;
  }, '');
  const first = n ? point(rows[0], 0)[0] : 0;
  const last = n ? point(rows[n - 1], n - 1)[0] : 0;
  const shown = hover !== null && rows[hover] ? rows[hover] : null;
  const shownX = shown ? ((hover + 0.5) / n) * 100 : 0;

  return (
    <section className="dsh-card dsh-a-chart">
      <header className="dsh-head">
        <div>
          <h2 className="dsh-title">{t('dashboard.businessTrend', 'Revenue & orders')}</h2>
          <ul className="dsh-legend">
            <li><span className="dsh-key dsh-key--line" aria-hidden="true" />{t('dashboard.legendRevenue', 'Revenue')} <strong>{inr(totalRevenue)}</strong></li>
            <li><span className="dsh-key dsh-key--bar" aria-hidden="true" />{t('dashboard.legendOrders', 'Orders')} <strong>{ordersReady ? totalOrders : '…'}</strong></li>
          </ul>
        </div>
        <div className="dsh-seg" role="group" aria-label={t('dashboard.chartPeriod', 'Period')}>
          {PERIODS.map(([key, label]) => (
            <button key={key} type="button" aria-pressed={period === key} onClick={() => { setPeriod(key); setHover(null); }}>
              {t(`dashboard.period_${key}`, label)}
            </button>
          ))}
        </div>
      </header>

      {result.failed && !loading ? (
        <p className="dsh-none">{t('dashboard.trendUnavailable', 'The revenue trend is not available on this account.')}</p>
      ) : !n ? (
        <div className="dsh-chart-empty">{loading ? t('common.loading', 'Loading...') : t('dashboard.noTrend', 'Nothing recorded in this period yet.')}</div>
      ) : (
        <div className={`dsh-chart${loading ? ' dsh-chart--busy' : ''}`}
             role="img" aria-label={`${t('dashboard.legendRevenue', 'Revenue')} ${inr(totalRevenue)}, ${t('dashboard.legendOrders', 'Orders')} ${totalOrders}`}
             onMouseLeave={() => setHover(null)}>
          <div className="dsh-plot dsh-plot--line">
            <span className="dsh-y dsh-y--top">{compactInr(topRevenue)}</span>
            <span className="dsh-y dsh-y--mid">{compactInr(topRevenue / 2)}</span>
            <svg viewBox="0 0 1000 180" preserveAspectRatio="none" aria-hidden="true">
              <defs>
                <linearGradient id="dsh-area" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#B7F34A" stopOpacity=".26" />
                  <stop offset="100%" stopColor="#B7F34A" stopOpacity="0" />
                </linearGradient>
              </defs>
              <line x1="0" x2="1000" y1="16" y2="16" className="dsh-grid-line" />
              <line x1="0" x2="1000" y1="96" y2="96" className="dsh-grid-line" />
              <line x1="0" x2="1000" y1="176" y2="176" className="dsh-grid-line" />
              <path d={`${line} L ${last} 176 L ${first} 176 Z`} fill="url(#dsh-area)" />
              <path d={line} className="dsh-line" />
            </svg>
          </div>
          <div className="dsh-plot dsh-plot--bars" aria-hidden="true">
            {rows.map((r, i) => (
              <span key={i} className="dsh-bar-slot">
                <span className={`dsh-bar${hover === i ? ' dsh-bar--on' : ''}`} style={{ height: r.orders ? `${Math.max(10, (r.orders / topOrders) * 100)}%` : 0 }} />
              </span>
            ))}
          </div>
          <div className="dsh-x" aria-hidden="true">
            {rows.map((r, i) => <span key={i}>{i % every === 0 ? r.label : ''}</span>)}
          </div>
          {/* Hit areas much wider than the marks: one column per bucket. */}
          <div className="dsh-hits" aria-hidden="true">
            {rows.map((r, i) => <span key={i} onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} />)}
          </div>
          {shown && (
            <>
              <span className="dsh-cross" style={{ left: `${shownX}%` }} aria-hidden="true" />
              <div className="dsh-tip" style={{ left: `${Math.min(Math.max(shownX, 14), 86)}%` }} role="status">
                <div className="dsh-tip-day">{shown.full}</div>
                <div className="dsh-tip-row"><span className="dsh-key dsh-key--line" aria-hidden="true" />{t('dashboard.legendRevenue', 'Revenue')}<strong>{inr(shown.revenue)}</strong></div>
                <div className="dsh-tip-row"><span className="dsh-key dsh-key--bar" aria-hidden="true" />{t('dashboard.legendOrders', 'Orders')}<strong>{ordersReady ? shown.orders : '…'}</strong></div>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}

/** A count that needs the order list shows a dash until the list has come. */
const countOf = (ready, n) => (ready ? n : '…');

/** Which of the five steps a workflow stage belongs to, by key or by name
 *  (a boutique can name its own stages). */
const STEP_OF = (key, name) => {
  const text = `${key} ${name}`.toLowerCase();
  if (/trial|fitting/.test(text)) return 'trial';
  if (/ready|deliver|payment|dispatch/.test(text)) return 'ready';
  if (/finish|press|hem|quality|_check|qc|packag/.test(text)) return 'finishing';
  if (/stitch|alter/.test(text)) return 'stitching';
  if (/cut|maggam|paper|pattern/.test(text)) return 'cutting';
  return 'stitching';
};
const STEPS = [
  ['cutting', 'Cutting', Scissors],
  ['stitching', 'Stitching', Shirt],
  ['finishing', 'Finishing', ShieldCheck],
  ['trial', 'Trial', Ruler],
  ['ready', 'Ready', PackageCheck],
];

/**
 * The owner's Dashboard: how much is coming in and owed, what needs acting on,
 * what the workshop is doing, and today. Real figures only: GET /dashboard/, the
 * finance trend, and the order list for what only the orders can say (those
 * counts fill in a moment after the page draws).
 */
export default function OverviewPanel({ appointments, blankAppointmentForm, currentUserName, dashboardData, guideOrders, justRegistered, loading, onboardingSteps, openAppointment, ordersList, queuedMessages = [], setAppointmentForm, setEditingAppointment, setInvoiceFilter, setOnboardingDismissed, setOrdersFilterTab, setOrdersSearch, setOrdersStageFilter, setShowAppointmentModal, setTaskGuide, setView, showOnboarding }) {
  const { t } = useLanguage();
  const { dashboardTab, refresh: fetchDashboardAndConfig, setDashboardTab } = useApp();
  const [query, setQuery] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [showUpcoming, setShowUpcoming] = useState(false);
  const growth = useGrowth(reloadKey);

  const stats = dashboardData?.stats || {};
  const today = dashboardData?.today || {};
  const outstanding = Number(stats.outstanding) || 0;
  const overdue = Number(stats.overdue) || 0;
  const bookAppointment = () => { setEditingAppointment(null); setAppointmentForm(blankAppointmentForm); setShowAppointmentModal(true); };
  const refreshAll = () => { fetchDashboardAndConfig(); setReloadKey((k) => k + 1); };

  // What only the order list can say. The boutique's own production runs are
  // work, not sales, as in GET /dashboard/.
  const ordersReady = ordersList.length > 0 || stats.total_orders === 0;
  const customerOrders = useMemo(() => ordersList.filter((o) => o.kind !== 'internal'), [ordersList]);
  const { dueSoon, deliveries, toCheck } = useMemo(() => {
    const now = todayIso();
    const tomorrow = plusDaysIso(1);
    const live = customerOrders.filter((o) => !['Delivered', 'Cancelled'].includes(o.order_status));
    return {
      dueSoon: live.filter((o) => o.estimated_delivery === now || o.estimated_delivery === tomorrow).length,
      deliveries: live.filter((o) => o.estimated_delivery === now),
      toCheck: live.reduce((sum, o) => sum + (o.stages || []).filter((st) => st.status === 'PENDING_VERIFICATION').length, 0),
    };
  }, [customerOrders]);
  const failedMessages = queuedMessages.filter((m) => m.status === 'FAILED').length;

  // Counted by GET /dashboard/ (workroom), so the page need not wait for every
  // order; counted from the order list only by an older server.
  const workroom = dashboardData?.workroom;
  const dist = {};
  let fresh = workroom ? workroom.new : 0;
  if (workroom) {
    workroom.stages.forEach((row) => { dist[row.key] = { name: row.name, count: row.count }; });
  } else ordersList.forEach((o) => {
    const bucket = orderBucket(o);
    if (bucket === 'new') fresh += 1;
    if (bucket !== 'workshop') return;
    const now = stageNow(o);
    if (!now) return;
    const key = now.current.stage_key;
    dist[key] = dist[key] || { name: now.name, count: 0 };
    dist[key].count += 1;
  });
  const steps = STEPS.map(([key, label, icon]) => {
    const parts = Object.entries(dist).filter(([stageKey, stage]) => STEP_OF(stageKey, stage.name) === key);
    return { key, label, icon, parts, count: parts.reduce((sum, [, stage]) => sum + stage.count, 0) };
  });
  const openStep = (parts) => {
    // One stage: straight to its orders. Several: the whole workshop.
    setOrdersStageFilter(parts.length === 1 ? parts[0][0] : 'All');
    setDashboardTab('workshop');
  };

  const attention = [
    { key: 'overdue', icon: AlertTriangle, count: overdue, level: 'high', label: t('dashboard.attnOverdue', 'Overdue orders'), go: () => setDashboardTab('workshop') },
    { key: 'due', icon: CalendarClock, count: countOf(ordersReady, dueSoon), n: dueSoon, level: 'medium', label: t('dashboard.attnDueSoon', 'Due today or tomorrow'), go: () => setDashboardTab('workshop') },
    { key: 'check', icon: ClipboardCheck, count: countOf(ordersReady, toCheck), n: toCheck, level: 'medium', label: t('dashboard.attnToCheck', 'Work pieces waiting to be checked'), go: () => setDashboardTab('check') },
    { key: 'messages', icon: MessageSquareWarning, count: failedMessages, level: 'high', label: t('dashboard.attnMessagesFailed', 'Customer messages that failed'), go: () => setDashboardTab('orders') },
  ];

  const now = todayIso();
  const apptsToday = appointments.filter((a) => isoDay(new Date(a.scheduled_time)) === now);
  const apptsLater = appointments.filter((a) => isoDay(new Date(a.scheduled_time)) !== now);
  const apptRow = (a) => {
    const when = new Date(a.scheduled_time);
    const customer = a.customer_detail ? `${a.customer_detail.first_name || ''} ${a.customer_detail.last_name || ''}`.trim() : '';
    return (
      <li key={a.id}>
        <button type="button" className="dsh-appt" onClick={() => openAppointment(a)}>
          <span className="dsh-appt-time">
            {isoDay(when) === now ? '' : `${fmtDate(a.scheduled_time)}, `}
            {when.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
          </span>
          <span className="dsh-appt-who">
            {customer || t('dashboard.customer', 'Customer')}
            <span>{a.custom_type || APPOINTMENT_TYPE_LABELS[a.appointment_type] || a.appointment_type}</span>
          </span>
        </button>
      </li>
    );
  };

  return (
    <>
      <PageHeader
        title={t('nav.dashboard', 'Dashboard')}
        actions={(
          <>
            <form className="dsh-search" role="search" onSubmit={(e) => {
              e.preventDefault();
              const text = query.trim().toLowerCase();
              if (!text) return;
              // The Orders page searches one pile at a time: open the first match's.
              const hit = ordersList.find((o) => [o.customer_name, o.order_id, o.customer_phone]
                .some((field) => (field || '').toLowerCase().includes(text)));
              setOrdersSearch(query.trim());
              setOrdersFilterTab(hit ? orderBucket(hit) : null);
              setDashboardTab('orders');
            }}>
              <Search size={16} aria-hidden="true" />
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)}
                     placeholder={t('dashboard.searchOrders', 'Search orders…')} aria-label={t('dashboard.searchOrders', 'Search orders…')} />
            </form>
            {/* The dashboard's New order: highlighted, without the callout. */}
            <GuidedHighlight show={guideOrders}>
              <button className="btn-primary btn-gold dsh-new-order" onClick={() => setView('order-selector')}>
                <Plus size={16} />
                {t('dashboard.newOrder')}
              </button>
            </GuidedHighlight>
          </>
        )}
      />

      <div className="dsh">
      <section className="dsh-welcome">
        <div>
          <h2 className="dsh-welcome-title">
            {justRegistered && dashboardTab === 'overview' && !ordersList.length && !dashboardData?.stats?.total_orders
              ? t('dashboard.welcomeNewUser', `Welcome ${currentUserName} to Scaleezy! 👋`, { name: currentUserName })
              : t('dashboard.welcomeBackUser', `Welcome back, ${currentUserName}! 👋`, { name: currentUserName })}
          </h2>
          <p className="dsh-welcome-sub">{t('dashboard.subtitle')}</p>
        </div>
        <div className="dsh-welcome-side">
          <HeaderClock />
          <button type="button" className="dsh-refresh" disabled={loading} onClick={refreshAll}
                  title={t('common.refresh', 'Refresh')} aria-label={t('common.refresh', 'Refresh')}>
            <RotateCw size={15} className={loading ? 'spin' : ''} />
          </button>
        </div>
      </section>

      {showOnboarding && (
        <section className="content-card" data-tour="getting-started" style={{ padding: '20px', marginBottom: '16px', border: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '12px' }}>
            <div>
              <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '20px', fontWeight: 500 }}>{t('dashboard.gettingStarted', 'Getting started')}</h2>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                {t('dashboard.onboardingProgress', '{done} of {total} done — this is the order the work flows in.', { done: onboardingSteps.filter(step => step.done).length, total: onboardingSteps.length })}
              </p>
            </div>
            <button
              type="button" className="btn-secondary" style={{ fontSize: '11px', padding: '4px 10px' }}
              onClick={() => {
                setOnboardingDismissed(true);
                try {
                  localStorage.setItem(`onboarding_dismissed_${localStorage.getItem('tenant_id') || ''}`, '1');
                } catch { /* per-device convenience only */ }
              }}
            >
              {t('dashboard.dismiss', 'Dismiss')}
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {onboardingSteps.map((step, i) => (
              <button
                key={step.key}
                type="button"
                disabled={step.done || !step.go}
                onClick={() => { step.go(); if (hasTask(step.key)) setTaskGuide({ key: step.key, label: step.label }); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px',
                  background: 'transparent', border: 'none', borderRadius: '6px', textAlign: 'left',
                  cursor: step.done || !step.go ? 'default' : 'pointer', width: '100%',
                  color: step.done ? 'var(--text-muted)' : 'var(--text-primary)',
                }}
              >
                <span style={{
                  width: '20px', height: '20px', borderRadius: '50%', flexShrink: 0,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  border: step.done ? 'none' : '1.5px solid var(--border-color)',
                  background: step.done ? 'var(--success-color)' : 'transparent', color: '#fff', fontSize: '12px',
                }}>
                  {step.done ? <Check size={12} /> : i + 1}
                </span>
                <span style={{ fontSize: '13px' }}>
                  {step.label}
                </span>
                {!step.done && step.go && <ArrowRight size={13} style={{ marginLeft: 'auto', opacity: 0.5 }} />}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* at-stat-grid dash-stats: where the guided tour points. */}
      <section className="at-stat-grid dash-stats dsh-figures">
        <Figure icon={TrendingUp} tone="lead" label={t('dashboard.revenueThisMonth', 'Revenue this month')} value={inr(stats.revenue_month)}
                extra={growth !== null && (
                  <span className={`dsh-delta dsh-delta--${growth < 0 ? 'down' : 'up'}`}
                        title={t('dashboard.growthHint', 'Payments received, against the same days last month')}>
                    {growth < 0 ? <ArrowDownRight size={13} /> : <ArrowUpRight size={13} />}{Math.abs(growth)}%
                  </span>
                )}
                sub={t('dashboard.allTime', '{amount} all time', { amount: inr(stats.revenue_total) })}
                onClick={() => { setInvoiceFilter('All'); setDashboardTab('invoices'); }} />
        <Figure icon={Wallet} tone="neutral" label={t('dashboard.moneyToCollect', 'Money to collect')} value={inr(outstanding)}
                sub={outstanding > 0 ? t('dashboard.pendingAcrossActive', 'pending across active orders') : t('dashboard.allSettled', 'all settled')}
                onClick={() => { setInvoiceFilter('Pending'); setDashboardTab('invoices'); }} />
        <Figure icon={ClipboardList} tone="neutral" label={t('dashboard.activeOrders', 'Active orders')} value={stats.active_orders ?? 0}
                sub={`${t('dashboard.dueThisWeek', '{n} due this week', { n: stats.due_soon ?? 0 })}${overdue ? ` · ${t('dashboard.overdueCount', '{n} overdue', { n: overdue })}` : ''}`}
                onClick={() => setDashboardTab('workshop')} />
        <Figure icon={AlertTriangle} tone={overdue > 0 ? 'danger' : 'neutral'} label={t('dashboard.overdueOrders', 'Overdue orders')} value={overdue}
                sub={overdue > 0 ? t('dashboard.requiresAttention', 'Requires attention') : t('dashboard.nothingLate', 'nothing is late')}
                onClick={() => setDashboardTab('workshop')} />
      </section>

      <div className="dsh-board">
        <BusinessChart orders={customerOrders} ordersReady={ordersReady} reloadKey={reloadKey} t={t} />

        <section className="dsh-card dsh-a-need">
          <h2 className="dsh-title">{t('dashboard.needsAttention', 'Needs attention')}</h2>
          <ul className="dsh-attn">
            {attention.map(({ key, icon: Icon, count, n, level, label, go }) => {
              const clear = (n ?? count) === 0;
              return (
                <li key={key}>
                  <button type="button" className={`dsh-attn-row${clear ? ' dsh-attn-row--clear' : ` dsh-attn-row--${level}`}`} onClick={go}>
                    <span className="dsh-icon">{clear ? <Check size={16} /> : <Icon size={16} />}</span>
                    <span className="dsh-attn-label">
                      {label}
                      <span className="dsh-attn-level">
                        {clear ? t('dashboard.levelClear', 'All clear') : level === 'high' ? t('dashboard.levelHigh', 'High priority') : t('dashboard.levelMedium', 'Soon')}
                      </span>
                    </span>
                    <span className="dsh-attn-count">{count}</span>
                    <ChevronRight size={15} className="dsh-chev" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="dsh-card dsh-a-work">
          <header className="dsh-head">
            <h2 className="dsh-title">{t('dashboard.inWorkroom', 'Work in progress')}</h2>
            <button type="button" className="dsh-link" onClick={() => setDashboardTab('workshop')}>
              {t('dashboard.allOrders', 'All orders')} <ArrowRight size={14} />
            </button>
          </header>
          <div className="dsh-steps">
            {fresh > 0 && (
              <button type="button" className="dsh-step" onClick={() => { setOrdersFilterTab('new'); setDashboardTab('orders'); }}>
                <span className="dsh-icon"><Clock size={16} /></span>
                <span className="dsh-step-value">{fresh}</span>
                <span className="dsh-step-name">{t('ordersPage.notSentYet', 'Not sent yet')}</span>
                <span className="dsh-step-note">{t('dashboard.stepNotStarted', 'Waiting to start')}</span>
              </button>
            )}
            {steps.map(({ key, label, icon: Icon, parts, count }) => (
              <button key={key} type="button" className={`dsh-step${count ? '' : ' dsh-step--empty'}`} onClick={() => openStep(parts)}>
                <span className="dsh-icon"><Icon size={16} /></span>
                <span className="dsh-step-value">{count}</span>
                <span className="dsh-step-name">{t(`dashboard.step_${key}`, label)}</span>
                <span className="dsh-step-note">
                  {parts.length ? parts.map(([, stage]) => `${stage.name} ${stage.count}`).join(' · ') : t('dashboard.stepEmpty', 'Nothing here')}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="dsh-card dsh-a-today">
          <header className="dsh-head">
            <h2 className="dsh-title">{t('dashboard.todaysAgenda', "Today's agenda")}</h2>
            <button type="button" className="dsh-link" onClick={bookAppointment}>
              <Plus size={14} /> {t('dashboard.bookShort', 'Book')}
            </button>
          </header>
          <div className="dsh-agenda">
            <button type="button" className="dsh-agenda-cell" onClick={() => setDashboardTab('staff')}>
              <span className="dsh-icon"><Users size={15} /></span>
              <strong>{today.staff_present ?? 0}</strong>
              <span>{t('dashboard.agendaStaff', 'Staff present')}</span>
            </button>
            <div className="dsh-agenda-cell">
              <span className="dsh-icon"><CalendarClock size={15} /></span>
              <strong>{apptsToday.length}</strong>
              <span>{t('dashboard.agendaAppointments', 'Appointments & trials')}</span>
            </div>
            <button type="button" className="dsh-agenda-cell" onClick={() => setDashboardTab('workshop')}>
              <span className="dsh-icon"><Truck size={15} /></span>
              <strong>{countOf(ordersReady, deliveries.length)}</strong>
              <span>{t('dashboard.agendaDeliveries', 'Deliveries')}</span>
            </button>
          </div>
          {apptsToday.length > 0 && <ul className="dsh-appts">{apptsToday.slice(0, 3).map(apptRow)}{showUpcoming && apptsToday.slice(3).map(apptRow)}</ul>}
          {showUpcoming && apptsLater.length > 0 && <ul className="dsh-appts">{apptsLater.map(apptRow)}</ul>}
          {(apptsLater.length > 0 || apptsToday.length > 3) && (
            <button type="button" className="dsh-more" onClick={() => setShowUpcoming(!showUpcoming)}>
              {showUpcoming ? t('dashboard.showLess', 'Show less') : t('dashboard.showUpcoming', 'Show all appointments ({n})', { n: appointments.length })}
            </button>
          )}
          {appointments.length === 0 && <p className="dsh-none">{t('dashboard.noAppointments', 'No appointments booked.')}</p>}
        </section>
      </div>
      </div>
    </>
  );
}
