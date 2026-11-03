import { ArrowRight, Boxes, Calendar, CalendarDays, Check, CheckCircle2, ClipboardList, Clock, Package, PackageCheck, Plus, RotateCw, Scissors, ShieldCheck, Shirt, TrendingUp, Users, Wallet } from 'lucide-react';
import { IconTile, PageHeader, SectionCard, StatCard } from '../../components/ui/Atelier';
import { HeaderClock } from '../../components/ui/HeaderClock';
import { GuidedHighlight } from '../../components/ui/GuidedHighlight';
import { hasTask } from '../../components/ui/tourTasks';
import { formatDate as fmtDate, inr } from '../../services/format';
import { hasTierNames, tierName } from '../../services/tierNames';
import { TIERS } from '../customers/customerBook';
import { orderBucket, stageNow } from '../orders/stages';
import { isoDay, todayIso } from '../../services/dates';
import { APPOINTMENT_TYPE_LABELS } from '../../constants/appointments';
import { useLanguage } from '../../i18n/LanguageContext.jsx';
import { useApp } from '../../context/AppContext';

/**
 * The owner's Dashboard: the money first, then what is in the workroom,
 * then today's attendance and the appointments still to come. Figures come
 * from GET /dashboard/, the workroom tiles too (its `workroom` counts).
 */
export default function OverviewPanel({ appointments, blankAppointmentForm, bookTiers, currentUserName, dashboardData, guideOrders, justRegistered, loading, onboardingSteps, openAppointment, ordersList, setAppointmentForm, setEditingAppointment, setInvoiceFilter, setOnboardingDismissed, setOrdersFilterTab, setOrdersStageFilter, setShowAppointmentModal, setTaskGuide, setView, showOnboarding }) {
  const { t } = useLanguage();
  const { dashboardTab, refresh: fetchDashboardAndConfig, setDashboardTab } = useApp();
  return (
    <>
      <PageHeader
        title={justRegistered && dashboardTab === 'overview' && !ordersList.length && !dashboardData?.stats?.total_orders
          ? t('dashboard.welcomeNewUser', `Welcome ${currentUserName} to Scaleezy! 👋`, { name: currentUserName })
          : t('dashboard.welcomeBackUser', `Welcome back, ${currentUserName}! 👋`, { name: currentUserName })}
        subtitle={t('dashboard.subtitle')}
        meta={<HeaderClock />}
        actions={(
          <>
            <button
              type="button"
              className="btn-secondary"
              disabled={loading}
              onClick={() => fetchDashboardAndConfig()}
              style={{ padding: '10px 16px', fontSize: '13px' }}
              title="Refresh Dashboard Data"
            >
              {!loading && <RotateCw size={15} />}
              <span>{loading ? t('common.loading', 'Loading...') : t('common.refresh', 'Refresh')}</span>
            </button>
            {/* The dashboard's New order: highlighted, without the callout. */}
            <GuidedHighlight show={guideOrders}>
              <button className="btn-primary btn-gold" style={{ padding: '10px 18px' }} onClick={() => setView('order-selector')}>
                <Plus size={16} />
                {t('dashboard.newOrder')}
              </button>
            </GuidedHighlight>
          </>
        )}
      />

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

      {/* The money reads first, then what needs acting on, then today,
          then detail. All figures from /api/dashboard/ (dashboardData). */}
      {(() => {
        const s = dashboardData?.stats || {};
        const outstanding = Number(s.outstanding) || 0;
        const overdue = Number(s.overdue) || 0;
        return (
          <section className="at-stat-grid dash-stats" style={{ marginBottom: 'var(--space-5)' }}>
            <StatCard icon={TrendingUp} tone="green" label={t('dashboard.revenueThisMonth', 'Revenue this month')}
                      value={inr(s.revenue_month)} sub={t('dashboard.allTime', '{amount} all time', { amount: inr(s.revenue_total) })}
                      onClick={() => { setInvoiceFilter('All'); setDashboardTab('invoices'); }} />
            <StatCard icon={Wallet} tone="amber" label={t('dashboard.toCollect', 'To collect')} value={inr(outstanding)}
                      sub={outstanding > 0 ? t('dashboard.acrossActiveOrders', 'across active orders') : t('dashboard.allSettled', 'all settled')}
                      onClick={() => { setInvoiceFilter('Pending'); setDashboardTab('invoices'); }} />
            <StatCard icon={ClipboardList} tone="violet" label={t('dashboard.activeOrders', 'Active orders')} value={s.active_orders ?? 0}
                      sub={`${t('dashboard.dueThisWeek', '{n} due this week', { n: s.due_soon ?? 0 })}${overdue ? ` · ${t('dashboard.overdueCount', '{n} overdue', { n: overdue })}` : ''}`}
                      onClick={() => setDashboardTab('workshop')} />
            <StatCard icon={Users} tone="blue" label={t('dashboard.totalCustomers', 'Customers')} value={s.total_customers ?? 0}
                      sub={(() => { const c = bookTiers; return hasTierNames() ? TIERS.map((tier) => `${c[tier]} ${tierName(tier)}`).join(' · ') : t('dashboard.tierSummary', '{platinum} Platinum · {gold} Gold · {silver} Silver', { platinum: c.Platinum, gold: c.Gold, silver: c.Silver }); })()}
                      onClick={() => setDashboardTab('customers')} />
          </section>
        );
      })()}

      {/* Production pipeline: one tile per stage orders are standing
          on right now, in workroom order, plus the two piles either
          side of it. */}
      {(() => {
        // Counted by GET /dashboard/ (workroom), so the page need not download
        // every order; counted from the order list only by an older server.
        const workroom = dashboardData?.workroom;
        const dist = {};
        let fresh = workroom ? workroom.new : 0;
        if (workroom) {
          workroom.stages.forEach((s) => { dist[s.key] = { name: s.name, count: s.count, seq: s.sequence ?? 0 }; });
        } else ordersList.forEach((o) => {
          const b = orderBucket(o);
          if (b === 'new') fresh += 1;
          if (b !== 'workshop') return;
          const now = stageNow(o);
          if (!now) return;
          const k = now.current.stage_key;
          dist[k] = dist[k] || { name: now.name, count: 0, seq: now.current.sequence ?? 0 };
          dist[k].count += 1;
        });
        const entries = [
          ...(fresh ? [['new', { name: t('ordersPage.notSentYet', 'Not sent yet'), count: fresh, seq: -1 }]] : []),
          ...Object.entries(dist).sort((a, b) => a[1].seq - b[1].seq),
        ];
        const LOOK = { new: ['amber', Clock], pattern_cutting: ['rose', Scissors], fabric_cutting: ['rose', Scissors], alteration_work: ['rose', Scissors],
          stitching_in_progress: ['blue', Shirt], finishing: ['blue', Shirt], master_quality_check: ['violet', ShieldCheck],
          ready_for_delivery: ['green', PackageCheck], payment: ['amber', Wallet], delivered: ['green', CheckCircle2] };
        const jump = (key) => {
          if (key === 'new') { setOrdersFilterTab('new'); setDashboardTab('orders'); return; }
          setOrdersStageFilter(key); setDashboardTab('workshop');
        };
        return (
          <SectionCard icon={Boxes} tone="green" title={t('dashboard.inWorkroom', 'In the workroom')}
                       action={() => setDashboardTab('workshop')} actionLabel={t('dashboard.allOrders', 'All orders')}
                       style={{ marginBottom: 'var(--space-5)' }}>
            {entries.length === 0 ? (
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                {t('dashboard.noOrdersFloor', 'No orders yet. Create the first one to see it move through the floor.')}
              </div>
            ) : (
              <div className="at-pipeline">
                {entries.map(([key, { name, count }]) => {
                  const [tone, Icon] = LOOK[key] || ['neutral', Package];
                  return (
                    <button key={key} type="button" className={`at-pipeline-tile at-stat--${tone}`} onClick={() => jump(key)}>
                      <IconTile icon={Icon} tone={tone} size={34} iconSize={16} />
                      <span className="at-pipeline-value">{count}</span>
                      <span className="at-pipeline-label">{name}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </SectionCard>
        );
      })()}

      {/* Today's attendance | Appointments, side by side as two equal
          cards. The grid stretches both to one height. A list of
          appointments scrolls inside its card (contain: size keeps it
          from growing the row); an empty one sizes to its content, so
          the row stays as short as the attendance tiles. */}
      <div className="at-grid-2" style={{ marginBottom: 'var(--space-5)', alignItems: 'stretch' }}>
        <SectionCard icon={CalendarDays} tone="green" title={t('dashboard.today', 'Today')}
                     style={{ display: 'flex', flexDirection: 'column' }}>
          {(() => {
            const today = dashboardData?.today || {};
            return (
              <div style={{ display: 'flex', gap: 'var(--space-3)', flex: 1, alignItems: 'center' }}>
                <button type="button" className="at-pipeline-tile at-stat--green"
                        style={{ flex: 1 }}
                        onClick={() => setDashboardTab('staff')}>
                  <span className="at-pipeline-value" style={{ color: 'var(--tone-green-fg)' }}>{today.staff_working ?? 0}</span>
                  <span className="at-pipeline-label">{t('dashboard.onFloorNow', 'Working now')}</span>
                </button>
                <div className="at-pipeline-tile at-stat--neutral"
                     style={{ flex: 1, cursor: 'default' }}>
                  <span className="at-pipeline-value">{today.staff_present ?? 0}</span>
                  <span className="at-pipeline-label">{t('dashboard.presentToday', 'Present today')}</span>
                </div>
              </div>
            );
          })()}
        </SectionCard>
        {/* Book Appointment lives in the header, so it is there
            whether the list is empty or not. */}
        <SectionCard icon={Calendar} tone="green" className="dash-appointments"
                     style={{ display: 'flex', flexDirection: 'column' }}
                     title={t('dashboard.appointments', 'Appointments')}
                     subtitle={t('dashboard.appointmentsSub', 'Consultations, trials and deliveries still to come')}
                     action={() => { setEditingAppointment(null); setAppointmentForm(blankAppointmentForm); setShowAppointmentModal(true); }}
                     actionLabel={t('dashboard.bookAppointment', 'Book Appointment')}>
          <div style={appointments.length
            ? { flex: 1, minHeight: '120px', contain: 'size', overflowY: 'auto' }
            : { flex: 1, display: 'flex', alignItems: 'center' }}>
          {(() => {
            if (appointments.length === 0) {
              // The whole empty state books one: a + reads as "add the
              // first", and the target is far bigger than the header link.
              return (
                <button type="button"
                        onClick={() => { setEditingAppointment(null); setAppointmentForm(blankAppointmentForm); setShowAppointmentModal(true); }}
                        style={{
                          width: '100%', display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
                          padding: 'var(--space-3) var(--space-4)', cursor: 'pointer', font: 'inherit',
                          background: 'transparent', border: '1px dashed var(--border-strong, var(--border-color))',
                          borderRadius: 'var(--radius-md)', color: 'var(--text-secondary)', textAlign: 'left',
                        }}>
                  <IconTile icon={Plus} tone="green" size={36} iconSize={18} />
                  <span style={{ fontSize: 'var(--text-sm)' }}>
                    {t('dashboard.noAppointments', 'No appointments booked.')}
                  </span>
                </button>
              );
            }
            const today = todayIso();
            return (
              <div className="at-table-wrap">
                <table className="at-table at-table--fit">
                  <thead>
                    <tr>
                      <th>{t('dashboard.apptCustomer', 'Customer')}</th>
                      <th>{t('dashboard.apptReason', 'Reason')}</th>
                      <th>{t('dashboard.apptDate', 'Date')}</th>
                      <th>{t('dashboard.apptTime', 'Time')}</th>
                      <th>{t('dashboard.apptWith', 'With')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {appointments.map((a) => {
                      const when = new Date(a.scheduled_time);
                      const isToday = isoDay(when) === today;
                      const customer = a.customer_detail
                        ? `${a.customer_detail.first_name || ''} ${a.customer_detail.last_name || ''}`.trim()
                        : '';
                      return (
                        <tr key={a.id} className={`at-row--tap${isToday ? ' appt-today' : ''}`}
                            onClick={() => openAppointment(a)}>
                          <td data-label={t('dashboard.apptCustomer', 'Customer')}
                              style={{ fontWeight: 'var(--weight-semibold)' }}>
                            {customer || t('dashboard.customer', 'Customer')}
                          </td>
                          <td data-label={t('dashboard.apptReason', 'Reason')}>
                            {a.custom_type
                              || APPOINTMENT_TYPE_LABELS[a.appointment_type]
                              || a.appointment_type}
                          </td>
                          <td data-label={t('dashboard.apptDate', 'Date')} style={{ whiteSpace: 'nowrap' }}>
                            {isToday
                              ? <strong>{t('dashboard.apptToday', 'Today')}</strong>
                              : fmtDate(a.scheduled_time)}
                          </td>
                          <td data-label={t('dashboard.apptTime', 'Time')} style={{ whiteSpace: 'nowrap' }}>
                            {when.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                          </td>
                          <td data-label={t('dashboard.apptWith', 'With')}
                              style={{ color: 'var(--text-secondary)' }}>
                            {a.assigned_staff_detail?.name || t('dashboard.apptUnassigned', 'Unassigned')}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })()}
          </div>
        </SectionCard>
      </div>
    </>
  );
}
