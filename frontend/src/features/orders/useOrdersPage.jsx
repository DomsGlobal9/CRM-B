import { useEffect, useState } from 'react';
import { orderBucket, orderStageKey, stageNow, stageWho } from './stages';
import { customerTier } from '../customers/customerBook';
import { orderGarmentNames, orderRef } from '../../services/format';
import { api } from '../../services/api';

export const ORDER_PAGE_SIZES = [20, 30, 40, 50];

/**
 * The Orders and Workshop pages' own state: the filters, search and list or
 * kanban view, going back from Workshop, and the per-order actions in progress
 * (sending, verifying, assigning, completing, the designer in charge).
 */
export default function useOrdersPage({ lastTabRef, t, navSections, dashboardTab, ordersTabPick, ordersStageFilter, fetchDashboardAndConfig }) {
  const [previousDashboardTab, setPreviousDashboardTab] = useState('overview');

  useEffect(() => {
    if (dashboardTab && dashboardTab !== lastTabRef.current) {
      setPreviousDashboardTab(lastTabRef.current);
      lastTabRef.current = dashboardTab;
    }
  // lastTabRef is App's useRef: the same object on every render.
  }, [dashboardTab, lastTabRef]);

  const getTabLabel = (tabKey) => {
    for (const section of navSections) {
      const found = section.items?.find((item) => item.tab === tabKey);
      if (found) return found.label;
    }
    if (tabKey === 'overview') return t('nav.overview', 'Overview');
    if (tabKey === 'workshop') return t('nav.workshop', 'Workshop');
    if (tabKey === 'orders') return t('nav.orders', 'Orders');
    return tabKey;
  };

  const [ordersAlterationOrder, setOrdersAlterationOrder] = useState(null);

  // The order page's "not sent on WhatsApp" panel, opened from its top button (an order id).
  const [sendErrorsOrderId, setSendErrorsOrderId] = useState(null);

  const [completingAllOrderId, setCompletingAllOrderId] = useState(null);

  const [ordersSearch, setOrdersSearch] = useState('');

  const ordersFilterTab = dashboardTab === 'workshop' ? 'workshop' : (ordersTabPick || 'new');

  const [ordersTierFilter, setOrdersTierFilter] = useState('All');

  const [ordersTypeFilter, setOrdersTypeFilter] = useState('All');

  const [ordersGarmentFilter, setOrdersGarmentFilter] = useState('All');

  const [ordersView, setOrdersView] = useState('list');

  // Both pages are split into two tabs, stitching (Maggam included: it is
  // stitched with embroidery on top) and alterations. The type filter only
  // narrows the stitching tab, so leaving it clears it.
  const [ordersKind, setKind] = useState('stitching');
  const setOrdersKind = (kind) => {
    setKind(kind);
    setOrdersPageAt({ key: '', page: 1 });
    if (kind === 'alteration') setOrdersTypeFilter('All');
  };

  // The list's page. Any change to what is listed starts it again at page 1;
  // it is kept here rather than in the list, so coming back from an order
  // returns to the page it was opened from.
  const [ordersPageSize, setOrdersPageSize] = useState(ORDER_PAGE_SIZES[0]);
  const ordersPageKey = [dashboardTab, ordersKind, ordersFilterTab, ordersTypeFilter, ordersTierFilter,
    ordersGarmentFilter, ordersStageFilter, ordersSearch, ordersPageSize].join('|');
  const [ordersPageAt, setOrdersPageAt] = useState({ key: '', page: 1 });
  const ordersListPage = ordersPageAt.key === ordersPageKey ? ordersPageAt.page : 1;
  const goToOrdersPage = (page) => setOrdersPageAt({ key: ordersPageKey, page });

  const orderMatchesFilters = (order) => {
    if ((order.flow === 'alteration') !== (ordersKind === 'alteration')) return false;
    if (ordersTypeFilter === 'Alteration' && order.flow !== 'alteration') return false;
    if (ordersTypeFilter === 'Maggam' && order.flow !== 'maggam') return false;
    if (ordersTypeFilter === 'Stitching' && order.flow !== 'stitching' && order.flow !== 'legacy') return false;
    if (orderBucket(order) !== ordersFilterTab) return false;
    if (ordersTierFilter !== 'All' && customerTier(order) !== ordersTierFilter) return false;
    if (ordersGarmentFilter !== 'All' && !orderGarmentNames(order).includes(ordersGarmentFilter)) return false;
    if (ordersStageFilter !== 'All' && orderStageKey(order) !== ordersStageFilter) return false;

    if (ordersSearch.trim()) {
      const query = ordersSearch.toLowerCase().trim();
      const matchesId = (order.order_id || '').toLowerCase().includes(query)
        || orderRef(order).toLowerCase().includes(query);
      const matchesClient = (order.customer_name || '').toLowerCase().includes(query);
      const matchesPhone = (order.customer_phone || '').toLowerCase().includes(query);
      const matchesGarment = orderGarmentNames(order).some(g => (g || '').toLowerCase().includes(query))
        || (order.garment_jobs || []).some(j => (j.display_name || j.template_name || '').toLowerCase().includes(query));
      const matchesStage = (order.stages || []).some(st => (st.stage_name || st.stage_key || '').toLowerCase().includes(query))
        || (order.order_status || '').toLowerCase().includes(query)
        || ((order.order_status === 'Delivered' || orderBucket(order) === 'done') && 'delivered'.includes(query))
        || (order.order_status === 'Cancelled' && 'cancelled'.includes(query));
      const matchesWorker = (order.stages || []).some(st => stageWho(st).toLowerCase().includes(query))
        || (order.tailor_name || '').toLowerCase().includes(query)
        || (order.master_name || '').toLowerCase().includes(query)
        || (query === 'unassigned' && !(order.tailor_name || order.master_name || (order.stages || []).some(st => stageWho(st))));

      const matchesJobInfo = (order.garment_jobs || []).some(job => {
        const st = stageNow(order, job?.id);
        const w = st && stageWho(st.current) ? stageWho(st.current) : '';
        const sn = st?.current?.stage_name || st?.current?.stage_key || (job && !st ? 'delivered' : '');
        return w.toLowerCase().includes(query) || sn.toLowerCase().includes(query);
      });

      if (!(matchesId || matchesClient || matchesPhone || matchesGarment || matchesStage || matchesWorker || matchesJobInfo)) {
        return false;
      }
    }
    return true;
  };

  const [savingVerificationOrderId, setSavingVerificationOrderId] = useState(null);

  const [assigningWorkflowOrderId, setAssigningWorkflowOrderId] = useState(null);

  // Designer in charge. The garment's DesignAssignment is the one record the
  // Design Work screen, the designer's desk and the Design Studio all read, so
  // writing it here is what makes the choice show up everywhere.
  const designerInCharge = (jobs) => {
    const held = jobs.map(j => j.design_assignment).filter(Boolean);
    if (!held.length) return { id: '', name: '' };
    const ids = [...new Set(held.map(a => a.designer))];
    if (ids.length > 1) return { id: '', name: '', mixed: true };
    return { id: held[0].designer, name: held[0].designer_name };
  };

  const assignOrderDesigner = async (order, jobs, designerId) => {
    if (!designerId || assigningWorkflowOrderId) return;
    const approved = jobs.filter(j => j.design_assignment?.status === 'APPROVED'
      && j.design_assignment.designer !== designerId);
    const todo = jobs.filter(j => !approved.includes(j) && j.design_assignment?.designer !== designerId);
    setAssigningWorkflowOrderId(order.id);
    try {
      for (const job of todo) await api.assignDesignWork({ garment_job: job.id, designer: designerId });
      if (approved.length) {
        alert(`${approved.length === 1 ? 'One garment keeps its designer' : `${approved.length} garments keep their designer`}: `
          + 'the design is already approved. Request changes on it in Design Work before reassigning.');
      }
    } catch (err) {
      alert('Failed to update the designer: ' + err.message);
    } finally {
      setAssigningWorkflowOrderId(null);
      fetchDashboardAndConfig();
    }
  };

  return {
    previousDashboardTab,
    setPreviousDashboardTab,
    getTabLabel,
    ordersAlterationOrder,
    setOrdersAlterationOrder,
    sendErrorsOrderId,
    setSendErrorsOrderId,
    completingAllOrderId,
    setCompletingAllOrderId,
    ordersSearch,
    setOrdersSearch,
    ordersFilterTab,
    ordersTierFilter,
    setOrdersTierFilter,
    ordersTypeFilter,
    setOrdersTypeFilter,
    ordersGarmentFilter,
    setOrdersGarmentFilter,
    ordersView,
    setOrdersView,
    ordersKind,
    setOrdersKind,
    ordersPageSize,
    setOrdersPageSize,
    ordersListPage,
    goToOrdersPage,
    orderMatchesFilters,
    savingVerificationOrderId,
    setSavingVerificationOrderId,
    assigningWorkflowOrderId,
    setAssigningWorkflowOrderId,
    designerInCharge,
    assignOrderDesigner,
  };
}
