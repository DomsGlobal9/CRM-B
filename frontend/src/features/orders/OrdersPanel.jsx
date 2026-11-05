import { CheckCircle2, Clock, Eye, Filter, LayoutGrid, List, Plus, Ruler, Scissors, ShoppingCart, User, Zap } from 'lucide-react';
import React from 'react';
import { RequestAlterationModal } from '../alterations/OrderAlterations';
import { PageHeader, SearchBox, Segmented, StatCard } from '../../components/ui/Atelier';
import { GuidedHighlight } from '../../components/ui/GuidedHighlight';
import { Pager } from '../../components/ui/Pager';
import { Crumbs } from '../../components/ui/Breadcrumbs';
import { ORDER_PAGE_SIZES } from './useOrdersPage';
import { getStageBadgeStyle, orderBucket, sinceLabel, stageNow, stageWho } from './stages';
import { TIERS } from '../customers/customerBook';
import { tierName } from '../../services/tierNames';
import { formatDate as fmtDate, inr, orderGarmentNames, orderRef } from '../../services/format';
import OrderKanban from './OrderKanban';
import FailedMessagesMenu from './FailedMessagesMenu';
import { todayIso } from '../../services/dates';
import { expressLabel, isExpressJob, isExpressOrder } from './express';
import { useLanguage } from '../../i18n/LanguageContext.jsx';
import { useApp } from '../../context/AppContext';

/**
 * Orders and Workshop: the order book as a list or (Workshop) a kanban, with
 * the filters by tab, type, tier, garment and stage. Opening a row shows that
 * order on its own page (OrderDetailPanel). Both are split into a Stitching
 * and an Alteration tab, and the list is shown a page at a time.
 */
export default function OrdersPanel({ guideOrders, openAlteration, openSendToWorkshop, openStageReview, orderMatchesFilters, ordersAlterationOrder, ordersFilterTab, ordersGarmentFilter, ordersList, ordersSearch, ordersStageFilter, ordersTierFilter, ordersTypeFilter, ordersView, ordersKind, setOrdersKind, ordersPageSize, setOrdersPageSize, ordersListPage, goToOrdersPage, queuedMessages, rememberAlteration, sendBusy, setOpenGarmentJob, setOpenOrdersRowId, setOrdersAlterationOrder, setOrdersFilterTab, setOrdersGarmentFilter, setOrdersSearch, setOrdersStageFilter, setOrdersTierFilter, setOrdersTypeFilter, setOrdersView, setView }) {
  const { t } = useLanguage();
  const { dashboardTab, currentUser, adminCan, boutiqueSettings, refresh: fetchDashboardAndConfig, setDashboardTab } = useApp();
  // Each tab names how many of its orders are in the pile on show.
  const inPile = ordersList.filter(o => orderBucket(o) === ordersFilterTab);
  const alterations = inPile.filter(o => o.flow === 'alteration').length;
  const kindTabs = (
    <div className="orders-kind-tabs">
      <Segmented ariaLabel={t('ordersPage.orderKind', 'Order type')} value={ordersKind} onChange={setOrdersKind} options={[
        { key: 'stitching', label: `${t('ordersPage.typeStitching', 'Stitching')} (${inPile.length - alterations})`, icon: Scissors },
        { key: 'alteration', label: `${t('ordersPage.typeAlteration', 'Alterations')} (${alterations})`, icon: Ruler },
      ]} />
    </div>
  );
  // Customer messages WhatsApp gave up on. On Workshop, only the orders being made.
  const failedOrders = [...new Set(queuedMessages.filter(m => m.status === 'FAILED').map(m => m.order))]
    .map(id => ordersList.find(o => o.id === id))
    .filter(o => o && (dashboardTab !== 'workshop' || orderBucket(o) === 'workshop'));
  const failedMenu = <FailedMessagesMenu orders={failedOrders} onOpenOrder={setOpenOrdersRowId} />;
  return (
    <>
      {ordersAlterationOrder && (
        <RequestAlterationModal
          order={ordersAlterationOrder}
          customerId={ordersAlterationOrder.customer}
          onClose={() => setOrdersAlterationOrder(null)}
          onCreated={(created) => { setOrdersAlterationOrder(null); rememberAlteration(created); openAlteration(created.id); }}
        />
      )}
      <PageHeader
        title={dashboardTab === 'workshop' ? t('ordersPage.workshopTitle', 'Workshop') : t('ordersPage.title')}
        subtitle={dashboardTab === 'workshop' ? t('ordersPage.workshopSubtitle', 'Every order being made, who has it, and what comes next.') : t('ordersPage.subtitle')}
        meta={dashboardTab === 'workshop' ? null : kindTabs}
        aside={dashboardTab === 'workshop' ? null : <><SearchBox value={ordersSearch} onChange={setOrdersSearch} placeholder={t('ordersPage.searchPlaceholder')} />{failedMenu}</>}
        actions={dashboardTab === 'workshop' ? null : (
          <>
            {(!currentUser?.role || currentUser.role === 'Owner' || adminCan('orders.create')) && (
              <GuidedHighlight show={guideOrders}>
                <button className="btn-primary btn-gold" style={{ padding: '10px 18px' }} onClick={() => setView('order-selector')}>
                  <Plus size={16} /> {t('ordersPage.newOrder')}
                </button>
              </GuidedHighlight>
            )}
          </>
        )}
      />

      {(() => {
        const isAlteration = (o) => o.flow === 'alteration';
        const ofKind = ordersList.filter(o => isAlteration(o) === (ordersKind === 'alteration'));
        // Three piles: still on the counter, being made, out the door.
        const fresh = ofKind.filter(o => orderBucket(o) === 'new').length;
        const making = ofKind.filter(o => orderBucket(o) === 'workshop').length;
        const done = ofKind.filter(o => orderBucket(o) === 'done').length;
        return (
          <>
            <Crumbs level={1} items={[{ label: ordersKind === 'alteration' ? t('ordersPage.typeAlteration', 'Alterations') : t('ordersPage.typeStitching', 'Stitching') }]} />
            {dashboardTab === 'workshop' && <div style={{ marginBottom: 'var(--space-4)' }}>{kindTabs}</div>}
            {dashboardTab === 'orders' && (
              <section className="at-stat-grid orders-stats">
                {/* The three cards are the New / In progress / Closed switch
                    (the chips that repeated them under the cards are gone):
                    the open one is drawn as selected. */}
                <StatCard icon={ShoppingCart} tone="amber" label={t('ordersPage.tabNew', 'New')} value={fresh} sub={t('ordersPage.tabNewSub', 'waiting to be sent')}
                          onClick={() => setOrdersFilterTab('new')} active={ordersFilterTab === 'new'} />
                <StatCard icon={Scissors} tone="blue" label={t('ordersPage.tabInProgress', 'In progress')} value={making} sub={t('ordersPage.tabWorkshopSub', 'being made')}
                          onClick={() => setOrdersFilterTab('workshop')} active={ordersFilterTab === 'workshop'} />
                <StatCard icon={CheckCircle2} tone="green" label={t('ordersPage.tabDone', 'Closed')} value={done} sub={t('ordersPage.tabDoneSub', 'delivered or cancelled')}
                          onClick={() => setOrdersFilterTab('done')} active={ordersFilterTab === 'done'} />
              </section>
            )}
            <div className={`at-toolbar ${dashboardTab === 'workshop' ? 'workshop-toolbar' : ''}`}>
              {dashboardTab === 'workshop' && (
                <div className="workshop-view-switch">
                  <Segmented ariaLabel="Orders view" value={ordersView} onChange={setOrdersView} options={[
                    { key: 'kanban', label: 'Board', icon: LayoutGrid },
                    { key: 'list', label: 'List', icon: List },
                  ]} />
                </div>
              )}
              {dashboardTab === 'workshop' && (
                <div className="at-toolbar-right workshop-search-wrap">
                  <SearchBox
                    value={ordersSearch}
                    onChange={setOrdersSearch}
                    placeholder={t('ordersPage.workshopSearchPlaceholder', 'Search by order, customer, status, or worker...')}
                  />
                  {failedMenu}
                </div>
              )}
              {/* Narrow by who it is for, what it is, and where it stands;
                  the list and the board read the same filter. */}
              <details className="at-toolbar-filters at-filters-fold">
                <summary className="at-phone-only"><Filter size={14} /> {t('common.filters', 'Filters')}</summary>
                {ordersKind === 'stitching' && (
                  <select className="form-control at-filter" value={ordersTypeFilter} aria-label="Order type"
                          onChange={(e) => setOrdersTypeFilter(e.target.value)}>
                    <option value="All">{t('ordersPage.allTypes', 'All types')}</option>
                    <option value="Stitching">{t('ordersPage.typeStitching', 'Stitching')}</option>
                    <option value="Maggam">{t('ordersPage.typeMaggam', 'Maggam')}</option>
                  </select>
                )}
                <select className="form-control at-filter" value={ordersTierFilter} aria-label="Customer type"
                        onChange={(e) => setOrdersTierFilter(e.target.value)}>
                  <option value="All">{t('ordersPage.allCustomerTypes', 'All customer types')}</option>
                  {TIERS.map(tier => <option key={tier} value={tier}>{tierName(tier, t(`wizard.${tier.toLowerCase()}`, tier))}</option>)}
                </select>
                <select className="form-control at-filter" value={ordersGarmentFilter} aria-label="Garment"
                        onChange={(e) => setOrdersGarmentFilter(e.target.value)}>
                  <option value="All">{t('ordersPage.allGarments', 'All garments')}</option>
                  {[...new Set(ordersList.flatMap(orderGarmentNames))].sort().map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
                <select className="form-control at-filter" value={ordersStageFilter} aria-label="Workroom step"
                        onChange={(e) => setOrdersStageFilter(e.target.value)}>
                  <option value="All">{t('ordersPage.allStages', 'All stages')}</option>
                  {(boutiqueSettings?.workflow_config?.length
                    ? boutiqueSettings.workflow_config.map(c => [c.key, c.name])
                    : [...new Map(ordersList.flatMap(o => (o.stages || []).map(st => [st.stage_key, st.stage_name]))).entries()]
                  ).map(([key, name]) => <option key={key} value={key}>{name}</option>)}
                </select>
              </details>
            </div>
          </>
        );
      })()}

      <div className="orders-registry-content" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {ordersView === 'kanban' && dashboardTab === 'workshop' ? (
          <OrderKanban
            orders={ordersList.filter(orderMatchesFilters)}
            workflow={boutiqueSettings?.workflow_config}
            onOpen={(order, stage) => openStageReview(order, stage)}
            onChanged={fetchDashboardAndConfig}
          />
        ) : (
        /* Orders list */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {(() => {
            const statusTone = (st) =>
              st === 'Delivered' ? 'success'
                : st === 'Cancelled' ? 'neutral'
                : (st === 'Shipped' || st === 'Ready for Dispatch') ? 'info'
                : 'warning';
            const filtered = ordersList.filter(orderMatchesFilters);
            const workshopRows = filtered.flatMap(order => {
              // In the workshop an order of several garments is a row
              // per garment, "#15-1", "#15-2", each on its own path.
              const jobs = order.garment_jobs || [];
              const lanes = jobs.filter(j => (order.stages || []).some(st => st.garment_job === j.id));
              return dashboardTab === 'workshop' && orderBucket(order) === 'workshop' && lanes.length > 1
                ? lanes.map(job => ({ order, job, n: jobs.indexOf(job) + 1 }))
                : [{ order, job: null, n: 0 }];
            }).filter(({ order, job, n }) => {
              if (dashboardTab !== 'workshop') return true;
              const isDelivered = order.order_status === 'Delivered';
              const isCancelled = order.order_status === 'Cancelled';
              const bucket = orderBucket(order);
              const stage = bucket === 'workshop' ? stageNow(order, job?.id) : null;
              const isGarmentDelivered = bucket === 'workshop' && job && !stage;
              const isRowDelivered = isDelivered || (bucket === 'done' && !isCancelled) || isGarmentDelivered;

              let rowStatusName = '';
              if (isCancelled) {
                rowStatusName = 'Cancelled';
              } else if (isRowDelivered) {
                rowStatusName = 'Delivered';
              } else if (bucket === 'new' && !stage) {
                rowStatusName = 'Not sent yet';
              } else if (stage?.current) {
                rowStatusName = stage.current.stage_name || stage.current.stage_key || '';
              } else {
                rowStatusName = order.order_status || '';
              }

              const worker = stage && stageWho(stage.current) ? stageWho(stage.current) : (order.tailor_name || order.master_name || '');

              if (ordersSearch.trim()) {
                const query = ordersSearch.toLowerCase().trim();
                const ref = (orderRef(order) + (job ? `-${n}` : '')).toLowerCase();
                const matchesId = ref.includes(query) || (order.order_id || '').toLowerCase().includes(query) || orderRef(order).toLowerCase().includes(query);
                const matchesClient = (order.customer_name || '').toLowerCase().includes(query);
                const matchesPhone = (order.customer_phone || '').toLowerCase().includes(query);
                const garmentName = (job?.display_name || job?.template_name || '').toLowerCase();
                const matchesGarment = garmentName.includes(query) || orderGarmentNames(order).some(g => (g || '').toLowerCase().includes(query));
                const matchesStatus = rowStatusName.toLowerCase().includes(query);
                const matchesWorker = worker.toLowerCase().includes(query) || (query === 'unassigned' && !worker.trim());

                if (!(matchesId || matchesClient || matchesPhone || matchesGarment || matchesStatus || matchesWorker)) {
                  return false;
                }
              }

              return true;
            });

            if (filtered.length === 0 || workshopRows.length === 0) {
              return (
                <div className="ui-card" style={{ padding: 'var(--space-10)', textAlign: 'center', color: 'var(--text-muted)' }}>
                  {ordersList.length === 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', alignItems: 'center' }}>
                      <div style={{ fontWeight: 'var(--weight-semibold)', color: 'var(--text-primary)', fontSize: 'var(--text-md)' }}>{t('ordersPage.noOrdersYet', 'No orders yet')}</div>
                      <div style={{ fontSize: 'var(--text-sm)', maxWidth: '44ch', lineHeight: 'var(--leading-normal)' }}>
                        {t('ordersPage.noOrdersYetDesc', 'Orders you create will appear here, with their production stage and who is working on them.')}
                      </div>
                      <button className="btn-primary" onClick={() => setView('order-selector')}>
                        {t('ordersPage.createFirstOrder', 'Create your first order')}
                      </button>
                    </div>
                  ) : !ordersList.some(o => (o.flow === 'alteration') === (ordersKind === 'alteration'))
                    ? (ordersKind === 'alteration'
                      ? t('ordersPage.noAlterationsYet', 'No alteration orders yet.')
                      : t('ordersPage.noStitchingYet', 'No stitching orders yet.'))
                    : t('ordersPage.noOrdersMatching', 'No orders found matching the criteria.')}
                </div>
              );
            }

            const today = todayIso();
            const pageCount = Math.max(1, Math.ceil(workshopRows.length / ordersPageSize));
            const page = Math.min(ordersListPage, pageCount);
            const pageRows = workshopRows.slice((page - 1) * ordersPageSize, page * ordersPageSize);

            return (
            <div className="at-table-wrap">
            <table className="at-table at-table--fit orders-book">
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>Type</th>
                  <th>Customer Name</th>
                  <th>Est. Delivery Date</th>
                  <th>Status</th>
                  <th>{t('ordersPage.assignedTo', 'Assigned to')}</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
            {pageRows.map(({ order, job, n }) => {
              const isDelivered = order.order_status === 'Delivered';
              const isCancelled = order.order_status === 'Cancelled';
              const bucket = orderBucket(order);
              const stage = bucket === 'workshop' ? stageNow(order, job?.id) : null;
              const jobMaggam = job && (order.stages || []).some(st => st.garment_job === job.id && st.stage_key.startsWith('maggam'));
              const late = bucket === 'workshop' && order.estimated_delivery && order.estimated_delivery < today;
              // Delivered on: when the last step closed, else the promised day.
              const deliveredOn = isDelivered
                ? ((order.stages || []).filter(st => st.completed_at).map(st => st.completed_at).sort().pop() || order.estimated_delivery)
                : null;
              // How many days it has been on the step it is on, shown
              // under the order number; more than ten marks the row.
              const stepDays = stage?.current?.started_at
                ? Math.max(0, Math.floor((Date.now() - new Date(stage.current.started_at).getTime()) / 864e5)) : null;
              const stuck = stepDays !== null && stepDays > 10;
              const rowClass = [
                (job ? isExpressJob(job) : isExpressOrder(order)) && !isDelivered && !isCancelled ? 'gh-express' : '',
                stuck ? 'at-row-stuck' : '',
                // Past its delivery date and still in work: the whole row.
                late ? 'at-row-late' : '',
              ].filter(Boolean).join(' ') || undefined;

              const isGarmentDelivered = bucket === 'workshop' && job && !stage;
              const isRowDelivered = isDelivered || (bucket === 'done' && !isCancelled) || isGarmentDelivered;
              let rowStatusKey = '';
              let rowStatusName = '';
              if (isCancelled) {
                rowStatusKey = 'cancelled';
                rowStatusName = 'Cancelled';
              } else if (isRowDelivered) {
                rowStatusKey = 'delivered';
                rowStatusName = 'Delivered';
              } else if (bucket === 'new' && !stage) {
                rowStatusKey = 'new';
                rowStatusName = 'Not sent yet';
              } else if (stage?.current) {
                rowStatusKey = stage.current.stage_key || '';
                rowStatusName = stage.current.stage_name || '';
              } else {
                rowStatusKey = (order.order_status || '').toLowerCase();
                rowStatusName = order.order_status || '';
              }
              const rowStyle = getStageBadgeStyle(rowStatusKey, rowStatusName);

              return (
              <React.Fragment key={job ? `${order.id}-${job.id}` : order.id}>
              <tr className={rowClass}
                  data-status={rowStatusKey}
                  style={{
                    backgroundColor: rowStyle.rowBg,
                    '--row-status-bg': rowStyle.rowBg,
                    ...(isCancelled ? { opacity: 0.55 } : {}),
                  }}>
                <td className="order-id-cell">
                  <div className="order-id-content">
                    <div className="order-id-header">
                      <span className="order-id-ref">{orderRef(order)}{job ? `-${n}` : ''}</span>
                      {(job ? isExpressJob(job) : isExpressOrder(order)) && !isDelivered && !isCancelled && (
                        <span className="gh-express-tag" title={expressLabel(order)}><Zap size={11} /> EXPRESS</span>
                      )}
                    </div>
                    {job && (
                      <span className="order-id-garment">
                        {job.display_name || job.template_name || t('ordersPage.garment', 'Garment')}
                      </span>
                    )}
                    {stepDays !== null && (
                      <span className={`at-step-days${stuck ? ' at-step-days--stuck' : ''}`}
                            title={`${stage.current.stage_name} · ${sinceLabel(stage.current.started_at)} (${t('ordersPage.since', 'since')} ${fmtDate(stage.current.started_at)})`}>
                        <Clock size={12} aria-hidden="true" />
                        {stepDays === 0 ? t('ordersPage.today', 'Today') : `${stepDays} ${stepDays === 1 ? t('ordersPage.day', 'day') : t('ordersPage.days', 'days')}`}
                      </span>
                    )}
                    <span className="at-phone-only at-phone-line" style={{ fontWeight: 'var(--weight-regular)', color: 'var(--text-secondary)' }}>
                      <User size={12} aria-hidden="true" /> {order.customer_name}
                    </span>
                  </div>
                </td>
                <td className="at-desk-only">{job ? (jobMaggam ? 'Maggam' : 'Stitching') : order.flow === 'alteration' ? 'Alteration' : order.flow === 'maggam' ? 'Maggam' : 'Stitching'}</td>
                <td className="at-desk-only">
                  {order.customer_name}
                  {order.kind === 'internal' && (
                    <span className="ui-badge ui-badge--neutral" style={{ marginLeft: 6 }}>Boutique stock</span>
                  )}
                </td>
                <td data-label={t('ordersPage.estDelivery', 'Delivery')}>{order.estimated_delivery ? fmtDate(order.estimated_delivery) : '—'}</td>
                <td data-label={t('ordersPage.whereItStands', 'Where it stands')}>
                  {bucket === 'done' && (
                    <div className="at-stage-strip">
                      <span className={`ui-badge ui-badge--${statusTone(order.order_status)}`}>{isDelivered ? 'Delivered' : 'Cancelled'}</span>
                      {deliveredOn && <span className="at-stage-strip-muted">{fmtDate(deliveredOn)}</span>}
                      <span className="at-stage-strip-muted">{inr(order.total_amount)}</span>
                    </div>
                  )}
                  {bucket === 'new' && (
                    <span className="ui-badge ui-badge--warning">{t('ordersPage.notSentYet', 'Not sent yet')}</span>
                  )}
                  {/* A garment handed over while others on the order are still in work. */}
                  {bucket === 'workshop' && job && !stage && (
                    <span className="ui-badge ui-badge--success">{t('ordersPage.garmentDelivered', 'Delivered')}</span>
                  )}
                  {/* Where it stands: the step it is on (who has it is
                      the next column; how long, under the order number). */}
                  {stage && (() => {
                    const badgeStyle = getStageBadgeStyle(stage.current.stage_key, stage.current.stage_name);
                    return (
                      <div className="at-stage-strip">
                        <span
                          className="ui-badge stage-step-badge"
                          style={{
                            backgroundColor: badgeStyle.bg,
                            borderColor: badgeStyle.border,
                            color: badgeStyle.text,
                          }}
                        >
                          {stage.current.stage_name}
                        </span>
                        {late && <span className="ui-badge ui-badge--danger">{t('ordersPage.late', 'Late')}</span>}
                      </div>
                    );
                  })()}
                </td>
                {/* Who has the step it is on. */}
                <td data-label={t('ordersPage.assignedTo', 'Assigned to')} className="at-assignee-cell">
                  {stage && stageWho(stage.current)
                    ? <span className="at-assignee"><User size={13} aria-hidden="true" /> {stageWho(stage.current)}</span>
                    : <span className="at-assignee-none">—</span>}
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
                    {bucket === 'new' && (!currentUser?.role || ['Owner', 'Master'].includes(currentUser.role)
                      || adminCan('workshop.assign') || adminCan('workshop.move')) && (
                      <button type="button" className="btn-primary at-btn-sm" disabled={sendBusy}
                              onClick={() => openSendToWorkshop(order)}>
                        <Scissors size={12} /> {t('ordersPage.sendToWorkshop', 'Send to workshop')}
                      </button>
                    )}
                    {/* A delivered garment can come back: the same
                        request form the order card and the customer
                        profile open, one click from the row, for
                        the roles that run the counter. */}
                    {isDelivered && order.flow !== 'alteration' && (!currentUser?.role || ['Owner', 'Master'].includes(currentUser.role)
                      || adminCan('workshop.alterations')) && (
                      <button type="button" className="btn-secondary at-btn-sm"
                              style={{ color: 'var(--accent-text)', borderColor: 'var(--accent-border)', background: 'var(--accent-color)' }}
                              onClick={() => setOrdersAlterationOrder(order)}>
                        <Scissors size={12} /> Alteration
                      </button>
                    )}
                    {/* An order being made is read in the Workshop room. */}
                    {/* The eye alone (named for screen readers and on hover), so
                        the row's buttons fit beside "Send to workshop". */}
                    <button type="button" className="btn-secondary at-btn-sm at-btn-icon-view"
                            title="View order" aria-label={`View order ${orderRef(order)}${job ? `-${n}` : ''}`}
                            onClick={() => { if (bucket === 'workshop') setDashboardTab('workshop'); setOpenGarmentJob(job?.id || null); setOpenOrdersRowId(order.id); }}>
                      <Eye size={16} />
                    </button>
                  </div>
                </td>
              </tr>
              </React.Fragment>
              );
            })}
              </tbody>
            </table>
            {/* On every tab, even a short list, so each one reads the same. */}
            <Pager page={page} pageCount={pageCount} pageSize={ordersPageSize}
                   sizes={ORDER_PAGE_SIZES} onPage={goToOrdersPage} onSize={setOrdersPageSize}
                   label={t('ordersPage.perPage', 'Orders per page')} />
            </div>
            );
          })()}
        </div>
        )}
      </div>
    </>
  );
}
