import { useId, useMemo } from 'react';
import { ArrowDownRight, ArrowUpRight, BarChart2, CircleDot, Coins, FileText, PenTool, Receipt, Scissors, Shirt, Users } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext.jsx';
import { useApp } from '../../context/AppContext';
import { PageHeader, ProgressBar, SectionCard, StatCard } from '../../components/ui/Atelier';
import { inr, orderGarmentNames } from '../../utils/format';
import { tierName } from '../customers/tierNames';
import { TIERS } from '../customers/customerBook';
import { humaniseSpecKey } from '../orders/orderHelpers';
import './insightsPage.css';

const DAY_MS = 24 * 60 * 60 * 1000;
const SPARK_WEEKS = 12;
const paidOf = (o) => parseFloat(o.amount_paid || 0);
const totalOf = (o) => parseFloat(o.total_amount || 0);
const whenOf = (o) => (o.order_date ? new Date(o.order_date).getTime() : NaN);

// Orders grouped into the last 12 weeks by the day they were placed, oldest first.
function weeklyBuckets(orders) {
  const now = Date.now();
  const weeks = Array.from({ length: SPARK_WEEKS }, () => []);
  orders.forEach((o) => {
    const age = Math.floor((now - whenOf(o)) / (7 * DAY_MS));
    if (age >= 0 && age < SPARK_WEEKS) weeks[SPARK_WEEKS - 1 - age].push(o);
  });
  return weeks;
}

// Percent change, last 30 days against the 30 before, by order date. Null when
// either side has no orders: nothing honest to compare.
function monthChange(orders, measure) {
  const now = Date.now();
  const recent = [];
  const before = [];
  orders.forEach((o) => {
    const age = now - whenOf(o);
    if (age >= 0 && age < 30 * DAY_MS) recent.push(o);
    else if (age >= 30 * DAY_MS && age < 60 * DAY_MS) before.push(o);
  });
  if (!recent.length || !before.length) return null;
  const was = measure(before);
  return was > 0 ? ((measure(recent) - was) / was) * 100 : null;
}

const sumPaid = (list) => list.reduce((sum, o) => sum + paidOf(o), 0);
const sumWaiting = (list) => list.reduce((sum, o) => sum + Math.max(0, totalOf(o) - paidOf(o)), 0);
const avgBill = (list) => (list.length ? list.reduce((sum, o) => sum + totalOf(o), 0) / list.length : 0);
const countCustomers = (list) => new Set(list.map((o) => o.customer ?? o.customer_name)).size;

function DeltaChip({ value }) {
  if (value == null) return null;
  const down = value < 0;
  const Arrow = down ? ArrowDownRight : ArrowUpRight;
  return (
    <span className={`ins-delta${down ? ' ins-delta--down' : ''}`} title="Compared with the previous 30 days, by order date">
      <Arrow size={12} /> {down ? '' : '+'}{value.toFixed(1)}%
    </span>
  );
}

/** A small trend line and fill, drawn from the numbers passed in. */
function Sparkline({ points, tone = 'strong', label }) {
  const id = `ins-spark-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  if (!points.some((p) => p > 0)) return null;
  const W = 200;
  const H = 52;
  const max = Math.max(...points);
  const xy = points.map((p, i) => [(i / (points.length - 1)) * W, H - 4 - (p / max) * (H - 12)]);
  // Smooth through the midpoints, so the line reads as a trend.
  const line = xy.reduce((d, [x, y], i) => {
    if (i === 0) return `M${x} ${y}`;
    const [px, py] = xy[i - 1];
    const mx = (px + x) / 2;
    return `${d} C${mx} ${py} ${mx} ${y} ${x} ${y}`;
  }, '');
  return (
    <svg className={`ins-spark ins-spark--${tone}`} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={label}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity="0.32" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${W} ${H} L0 ${H} Z`} fill={`url(#${id})`} />
      <path d={line} className="ins-spark-line" />
    </svg>
  );
}

const onePlace = (part, whole) => (whole > 0 ? ((part / whole) * 100).toFixed(1) : '0.0');

/**
 * Insights (the analytics tab): revenue, the customer book's tiers and the
 * team's workload. Shown under the Reports switch, which App draws above it.
 * Everything here is worked out from data App has already loaded.
 */
export default function InsightsPanel({ ordersList, tailors, bookTotal, bookTiers, dashboardData }) {
  const { t } = useLanguage();
  const { setDashboardTab } = useApp();
  const trends = useMemo(() => {
    const weeks = weeklyBuckets(ordersList);
    return {
      paid: weeks.map(sumPaid),
      waiting: weeks.map(sumWaiting),
      avg: weeks.map(avgBill),
      customers: weeks.map(countCustomers),
      paidChange: monthChange(ordersList, sumPaid),
      avgChange: monthChange(ordersList, avgBill),
    };
  }, [ordersList]);
  const paidRevenue = ordersList.reduce((sum, o) => sum + parseFloat(o.amount_paid || 0), 0);
  const totalBilling = ordersList.reduce((sum, o) => sum + parseFloat(o.total_amount || 0), 0);
  const pendingBill = Math.max(0, totalBilling - paidRevenue);
  const aov = ordersList.length > 0 ? (totalBilling / ordersList.length) : 0;

  const garmentDist = {};
  const necklineDist = {};
  const sleeveDist = {};
  let garmentTotal = 0;
  const tally = (dist, value) => {
    if (value === undefined || value === null || value === '') return;
    const label = humaniseSpecKey(value);
    dist[label] = (dist[label] || 0) + 1;
  };
  ordersList.forEach(o => {
    orderGarmentNames(o).forEach(name => {
      garmentDist[name] = (garmentDist[name] || 0) + 1;
      garmentTotal += 1;
    });
    (o.garment_jobs || []).forEach(job => {
      tally(necklineDist, job.spec?.front_neck);
      tally(sleeveDist, job.spec?.sleeve_length);
    });
  });

  const topGarmentsList = Object.entries(garmentDist).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const topNecklinesList = Object.entries(necklineDist).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const topSleevesList = Object.entries(sleeveDist).sort((a, b) => b[1] - a[1]).slice(0, 4);

  const busyTailors = tailors.filter(t => t.status === 'Busy').length;
  const freeTailors = tailors.length - busyTailors;
  const busyPct = onePlace(busyTailors, tailors.length);
  const freePct = onePlace(freeTailors, tailors.length);
  const sparkLabel = 'Last 12 weeks, by order date';

  const segments = (() => {
    const total = bookTotal || 1;
    const counts = bookTiers;
    const colors = { Platinum: 'var(--ins-platinum)', Gold: 'var(--ins-gold)', Silver: 'var(--ins-silver)' };
    const rows = TIERS.map(tier => ({
      name: tierName(tier, t(`wizard.${tier.toLowerCase()}`, tier)), count: counts[tier], color: colors[tier],
    })).map(r => ({ ...r, pct: Math.round((r.count / total) * 100) }));
    const topCount = Math.max(...rows.map((r) => r.count || 0));
    let acc = 0;
    const stops = [];
    for (const r of rows) { const from = acc; acc += (r.count / total) * 100; stops.push(`${r.color} ${from}% ${acc}%`); }
    return { rows, topCount, gradient: `conic-gradient(${stops.join(', ')}${acc < 100 ? `, var(--surface-inset) ${acc}% 100%` : ''})` };
  })();

  const bar = (label, count, total, tone) => {
    const pct = Math.round((count / (total || 1)) * 100) || 0;
    return (
      <div key={label} className="at-bar-row">
        <div className="at-bar-head">
          <span>{label}</span>
          <span className="at-num" style={{ fontWeight: 600 }}>{count} ({pct}%)</span>
        </div>
        <ProgressBar pct={pct} tone={tone} />
      </div>
    );
  };

  // What people order, Neckline & sleeve trends, Orders by step: hidden.
  const SHOW_MORE_INSIGHTS = false;
  return (
    <>
      <PageHeader
        title={t('analyticsPage.title', 'Business Analytics & Trends')}
        subtitle={t('analyticsPage.subtitle', 'Summary of revenues, style preferences, and operations workload.')}
      />

      <section className="at-stat-grid insights-stats" style={{ marginBottom: 'var(--space-5)' }}>
        <StatCard icon={Coins} tone="green" label={t('analyticsPage.collectedRevenue', 'Collected Revenue')}
                  value={<>{inr(paidRevenue)}<DeltaChip value={trends.paidChange} /></>}
                  sub={t('analyticsPage.fromPaidOrders', 'From paid customer orders')}
                  trailing={<Sparkline points={trends.paid} label={sparkLabel} />} />
        <StatCard icon={Receipt} tone="amber" label={t('analyticsPage.pendingInvoices', 'Pending Invoices')}
                  value={inr(pendingBill)} sub={t('analyticsPage.awaitingPayment', 'Awaiting full or partial payment')}
                  trailing={<Sparkline points={trends.waiting} tone="soft" label={sparkLabel} />} />
        <StatCard icon={BarChart2} tone="blue" label={t('analyticsPage.avgTicketSize', 'Average Ticket Size')}
                  value={<>{inr(aov)}<DeltaChip value={trends.avgChange} /></>}
                  sub={t('analyticsPage.perBespokeOrder', 'Per bespoke order')}
                  trailing={<Sparkline points={trends.avg} label={sparkLabel} />} />
        <StatCard icon={Users} tone="violet" label={t('analyticsPage.clientBase', 'Client Base')}
                  value={`${bookTotal} ${bookTotal === 1 ? t('analyticsPage.clientSingle', 'Client') : t('analyticsPage.clientPlural', 'Clients')}`}
                  sub={t('analyticsPage.totalDirectoryProfiles', 'Total boutique directory profiles')}
                  trailing={<Sparkline points={trends.customers} tone="soft" label="Customers ordering each week, last 12 weeks" />} />
      </section>

      {/* Customer tiers and Workshop load side by side, the same height.
          What people order, Neckline & sleeve trends and Orders by
          step are hidden, not removed: SHOW_MORE_INSIGHTS = true
          brings them back. */}
      <div className="at-grid-2 insights-grid">
        {SHOW_MORE_INSIGHTS && (
              <SectionCard icon={Shirt} tone="green" title={t('analyticsPage.popularGarmentTypes', 'Popular Garment Types')}
                           subtitle="Most ordered garment categories" action={() => setDashboardTab('orders')}>
                {topGarmentsList.length === 0 ? (
                  <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>No garments ordered yet.</div>
                ) : (
                  <div className="at-stack" style={{ gap: 'var(--space-3)' }}>
                    {topGarmentsList.map(([garment, count]) => bar(garment, count, garmentTotal, 'forest'))}
                  </div>
                )}
              </SectionCard>
        )}
          <SectionCard icon={Users} tone="violet" title={t('analyticsPage.customerSegmentation', 'Customer Segmentation')}
                       subtitle="Customers grouped by how much they spend" action={() => setDashboardTab('customers')}>
            <div className="ins-tiers">
              <div className="at-donut" style={{ background: segments.gradient }}>
                <div className="at-donut-label">
                  <span className="at-donut-value">{bookTotal}</span>
                  <span className="at-donut-sub">Customers</span>
                </div>
              </div>
              <div className="at-legend">
                {segments.rows.map(seg => (
                  <div key={seg.name} className={`at-legend-row ins-legend-row${seg.count > 0 && seg.count === segments.topCount ? ' ins-legend-row--top' : ''}`}>
                    <span className="at-legend-dot" style={{ background: seg.color }} />
                    <span className="ins-legend-name">{seg.name}</span>
                    <span className="at-num ins-legend-count">({seg.count}) / {seg.pct}%</span>
                  </div>
                ))}
              </div>
            </div>
          </SectionCard>
          <SectionCard icon={Scissors} tone="blue" title={t('analyticsPage.staffWorkloadOverview', 'Staff & Workload Overview')}
                       subtitle="Who is working, and who is free" action={() => setDashboardTab('staff')} actionLabel="Manage team">
            <div className="wl-tiles ins-tiles">
              <div className="at-pipeline-tile at-stat--blue ins-tile">
                <span className="at-pipeline-label ui-eyebrow">{t('analyticsPage.totalTailoringTeam', 'Total Tailoring Team')}</span>
                <span className="at-pipeline-value">{tailors.length}</span>
              </div>
              <div className="at-pipeline-tile at-stat--amber ins-tile ins-tile--working">
                <CircleDot size={15} className="ins-tile-mark" aria-hidden="true" />
                <span className="at-pipeline-label ui-eyebrow">{t('analyticsPage.busyAssignedTailors', 'Busy / Assigned Tailors')}</span>
                <span className="at-pipeline-value">{busyTailors}</span>
                <span className="ins-tile-sub">{busyTailors} working ({busyPct}%)</span>
                <span className="ins-tile-bar ins-tile-bar--working"><i style={{ width: `${busyPct}%` }} /></span>
              </div>
              <div className="at-pipeline-tile at-stat--green ins-tile">
                <span className="at-pipeline-label ui-eyebrow">{t('analyticsPage.availableStaffCapacity', 'Available Staff capacity')}</span>
                <span className="at-pipeline-value">{freeTailors}</span>
                <span className="ins-tile-sub">{freeTailors} free ({freePct}%)</span>
                <span className="ins-tile-bar ins-tile-bar--free"><i style={{ width: `${freePct}%` }} /></span>
              </div>
            </div>
            <div className="ins-capacity">
              <span className="ins-capacity-label">Capacity</span>
              <div className="ins-capacity-bar" role="img" aria-label={`${busyTailors} working, ${freeTailors} free`}>
                {busyTailors > 0 && <i className="ins-capacity-working" style={{ width: `${busyPct}%` }} />}
                {freeTailors > 0 && <i className="ins-capacity-free" style={{ flex: 1 }} />}
              </div>
              <div className="ins-capacity-key">
                <span>Working ({busyTailors})</span><i aria-hidden="true" /><span>Free ({freeTailors})</span>
              </div>
            </div>
          </SectionCard>
        {SHOW_MORE_INSIGHTS && (
              <SectionCard icon={PenTool} tone="amber" title={t('analyticsPage.necklineSleeveTrends', 'Neckline & Sleeve Trends')}
                           subtitle="What is being asked for at the counter">
                <div className="mobile-stack-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                  <div>
                    <div className="ui-eyebrow" style={{ marginBottom: '8px' }}>{t('analyticsPage.topNecklines', 'Top Necklines')}</div>
                    {topNecklinesList.length === 0 && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>None recorded yet.</div>}
                    {topNecklinesList.map(([style, count]) => (
                      <div key={style} style={{ fontSize: 'var(--text-sm)', display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                        <span>{style}</span>
                        <span className="at-num" style={{ fontWeight: 600 }}>{count}</span>
                      </div>
                    ))}
                  </div>
                  <div>
                    <div className="ui-eyebrow" style={{ marginBottom: '8px' }}>{t('analyticsPage.topSleeves', 'Top Sleeves')}</div>
                    {topSleevesList.length === 0 && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>None recorded yet.</div>}
                    {topSleevesList.map(([style, count]) => (
                      <div key={style} style={{ fontSize: 'var(--text-sm)', display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                        <span>{style}</span>
                        <span className="at-num" style={{ fontWeight: 600 }}>{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </SectionCard>
        )}
        {SHOW_MORE_INSIGHTS && (
              <SectionCard icon={FileText} tone="green" title={t('analyticsPage.orderStatusBreakdown', 'Order Status Breakdown')}
                           subtitle="Current order distribution" action={() => setDashboardTab('orders')}>
                <div className="at-stack" style={{ gap: 'var(--space-3)' }}>
                  {Object.entries(dashboardData?.stats?.status_distribution || {})
                    .sort((a, b) => b[1] - a[1])
                    .map(([status, count]) => bar(t(`status.${status}`, status), count, ordersList.length, 'forest'))}
                </div>
              </SectionCard>
        )}
      </div>
    </>
  );
}
