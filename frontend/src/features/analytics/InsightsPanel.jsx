import { BarChart2, Coins, FileText, PenTool, Receipt, Scissors, Shirt, Users } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext.jsx';
import { useApp } from '../../context/AppContext';
import { PageHeader, ProgressBar, SectionCard, StatCard } from '../../components/ui/Atelier';
import { inr, orderGarmentNames } from '../../services/format';
import { tierName } from '../../services/tierNames';
import { TIERS } from '../customers/customerBook';
import { humaniseSpecKey } from '../orders/orderHelpers';

/**
 * Insights (the analytics tab): revenue, the customer book's tiers and the
 * team's workload. Shown under the Reports switch, which App draws above it.
 * Everything here is worked out from data App has already loaded.
 */
export default function InsightsPanel({ ordersList, tailors, bookTotal, bookTiers, dashboardData }) {
  const { t } = useLanguage();
  const { setDashboardTab } = useApp();
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

  const segments = (() => {
    const total = bookTotal || 1;
    const counts = bookTiers;
    const colors = { Platinum: 'var(--primary-color)', Gold: 'var(--warning-color)', Silver: 'var(--border-strong)' };
    const rows = TIERS.map(tier => ({
      name: tierName(tier, t(`wizard.${tier.toLowerCase()}`, tier)), count: counts[tier], color: colors[tier],
    })).map(r => ({ ...r, pct: Math.round((r.count / total) * 100) }));
    let acc = 0;
    const stops = [];
    for (const r of rows) { const from = acc; acc += (r.count / total) * 100; stops.push(`${r.color} ${from}% ${acc}%`); }
    return { rows, gradient: `conic-gradient(${stops.join(', ')}${acc < 100 ? `, var(--surface-inset) ${acc}% 100%` : ''})` };
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
                  value={inr(paidRevenue)} sub={t('analyticsPage.fromPaidOrders', 'From paid customer orders')} />
        <StatCard icon={Receipt} tone="amber" label={t('analyticsPage.pendingInvoices', 'Pending Invoices')}
                  value={inr(pendingBill)} sub={t('analyticsPage.awaitingPayment', 'Awaiting full or partial payment')} />
        <StatCard icon={BarChart2} tone="blue" label={t('analyticsPage.avgTicketSize', 'Average Ticket Size')}
                  value={inr(aov)} sub={t('analyticsPage.perBespokeOrder', 'Per bespoke order')} />
        <StatCard icon={Users} tone="violet" label={t('analyticsPage.clientBase', 'Client Base')}
                  value={`${bookTotal} ${bookTotal === 1 ? t('analyticsPage.clientSingle', 'Client') : t('analyticsPage.clientPlural', 'Clients')}`}
                  sub={t('analyticsPage.totalDirectoryProfiles', 'Total boutique directory profiles')} />
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
            <div style={{ display: 'flex', gap: 'var(--space-6)', alignItems: 'center', flexWrap: 'wrap' }}>
              <div className="at-donut" style={{ background: segments.gradient }}>
                <div className="at-donut-label">
                  <span className="at-donut-value">{bookTotal}</span>
                  <span className="at-donut-sub">Customers</span>
                </div>
              </div>
              <div className="at-legend">
                {segments.rows.map(seg => (
                  <div key={seg.name} className="at-legend-row">
                    <span className="at-legend-dot" style={{ background: seg.color }} />
                    <span style={{ flex: 1 }}>{seg.name}</span>
                    <span className="at-num" style={{ fontWeight: 600 }}>{seg.count} ({seg.pct}%)</span>
                  </div>
                ))}
              </div>
            </div>
          </SectionCard>
          <SectionCard icon={Scissors} tone="blue" title={t('analyticsPage.staffWorkloadOverview', 'Staff & Workload Overview')}
                       subtitle="Who is working, and who is free" action={() => setDashboardTab('staff')} actionLabel="Manage team">
            <div className="wl-tiles" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 'var(--space-3)' }}>
              <div className="at-pipeline-tile at-stat--blue" style={{ cursor: 'default' }}>
                <span className="at-pipeline-label ui-eyebrow">{t('analyticsPage.totalTailoringTeam', 'Total Tailoring Team')}</span>
                <span className="at-pipeline-value">{tailors.length}</span>
              </div>
              <div className="at-pipeline-tile at-stat--amber" style={{ cursor: 'default' }}>
                <span className="at-pipeline-label ui-eyebrow">{t('analyticsPage.busyAssignedTailors', 'Busy / Assigned Tailors')}</span>
                <span className="at-pipeline-value" style={{ color: 'var(--tone-amber-fg)' }}>{busyTailors}</span>
              </div>
              <div className="at-pipeline-tile at-stat--green" style={{ cursor: 'default' }}>
                <span className="at-pipeline-label ui-eyebrow">{t('analyticsPage.availableStaffCapacity', 'Available Staff capacity')}</span>
                <span className="at-pipeline-value" style={{ color: 'var(--tone-green-fg)' }}>{tailors.length - busyTailors}</span>
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
