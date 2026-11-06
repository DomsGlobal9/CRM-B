import React, { useEffect, useRef, useState } from 'react';
import { CUSTOMER_PAGE_SIZES, NO_TIERS } from './customerBook';
import { EMPTY_CUSTOMER_FILTERS } from './filterRules';
import { useDebouncedValue } from './useCustomerLookup';
import { api } from '../../api';
import { imageFilesError } from '../../utils/validate';

/**
 * The Customers and Leads pages' own state: the directory's search, filters
 * and paging (one page from the server at a time), editing and deleting a
 * customer, marking a lead contacted, and starting an order for one.
 */
export default function useCustomerBook({ currentUser, dashboardTab, setSelectedDirectoryCustomer, selectedDirectoryCustomer, directoryVersion, fetchDashboardAndConfig, startService, setCustomerAddMode, setEditingCustomer, adminCan, isOwnerUser }) {
  const [styleNotesFor, setStyleNotesFor] = useState(null);

  const [alterationOrder, setAlterationOrder] = useState(null);

  const [expandedCustomerOrderId, setExpandedCustomerOrderId] = useState(null);

  const [approvingDesignId, setApprovingDesignId] = useState(null);

  const [searchQuery, setSearchQuery] = useState('');

  // Leads have their own sidebar item; it opens the customer book filtered to leads.
  const customerView = dashboardTab === 'leads' ? 'leads' : 'customers';

  const [customerPageAt, setCustomerPageAt] = useState({ key: '', page: 1 });

  const [customerPageSize, setCustomerPageSize] = useState(CUSTOMER_PAGE_SIZES[0]);

  const [customerFilters, setCustomerFilters] = useState(EMPTY_CUSTOMER_FILTERS);

  // The Customers page's current page, as the server answered it.
  const [customerDirectory, setCustomerDirectory] = useState({ key: '', forView: null, data: null, error: false });

  const directorySearch = useDebouncedValue(searchQuery);

  /** The Customers page's "Add Customer": the New customer form, on its own,
   *  with no order. A customer can still be added inside a new order too. */
  const handleStartNewCustomer = () => setCustomerAddMode('manual');

  const [deletingAllCustomers, setDeletingAllCustomers] = useState(false);

  const [customerActionId, setCustomerActionId] = useState(null);

  /** Open the edit form on the full record (a list row is a summary). */
  const startEditCustomer = async (row) => {
    if (customerActionId) return;
    setCustomerActionId(row.id);
    try {
      setEditingCustomer(await api.getCustomer(row.id));
    } catch (err) {
      alert(err.message);
    } finally {
      setCustomerActionId(null);
    }
  };

  const handleDeleteCustomer = async (row) => {
    if (customerActionId) return;
    const name = `${row.first_name || ''} ${row.last_name || ''}`.trim() || 'this customer';
    if (!window.confirm(`Delete ${name}?\n\nTheir measurements, appointments and saved designs are deleted too. This cannot be undone.`)) return;
    setCustomerActionId(row.id);
    try {
      await api.deleteCustomer(row.id);
      setSelectedDirectoryCustomer((current) => (current && current.id === row.id ? null : current));
      await fetchDashboardAndConfig();
    } catch (err) {
      alert(err.message);
    } finally {
      setCustomerActionId(null);
    }
  };

  const handleMarkLeadContacted = async (row) => {
    if (customerActionId) return;
    setCustomerActionId(row.id);
    try {
      await api.updateCustomer(row.id, { is_lead: false });
      await fetchDashboardAndConfig();
    } catch (err) {
      alert(err.message);
    } finally {
      setCustomerActionId(null);
    }
  };

  /** An order started from a customer's own page: ask what kind first, then
   *  open the wizard on that customer with their name and number fixed. `after`
   *  carries what the button adds on top (the last design, an old order's
   *  prices). */
  const [orderTypeFor, setOrderTypeFor] = useState(null); // { cust, after }

  const handleSelectExistingCustomer = (cust, after = null) => setOrderTypeFor({ cust, after });

  const beginOrderForCustomer = (kind) => {
    const { cust, after } = orderTypeFor;
    setOrderTypeFor(null);
    startService(kind, cust, { locked: true });
    after?.();
  };

  // A photo added straight from the customer's profile header.
  const [customerPhotoBusy, setCustomerPhotoBusy] = useState(false);

  const uploadDirectoryCustomerPhoto = async (cust, file) => {
    if (!file || customerPhotoBusy) return;
    const bad = imageFilesError([file]);
    if (bad) { alert(bad); return; }
    setCustomerPhotoBusy(true);
    try {
      const row = await api.uploadCustomerPhoto(cust.id, file);
      setSelectedDirectoryCustomer((current) =>
        current && current.id === cust.id ? { ...current, profile_photo: row.profile_photo } : current);
      // The page already loaded shows it too, without a reload.
      setCustomerDirectory((d) => (d.data ? {
        ...d,
        data: {
          ...d.data,
          results: d.data.results.map((x) => (x.id === cust.id ? { ...x, profile_photo: row.profile_photo } : x)),
        },
      } : d));
    } catch (err) {
      alert(err.message);
    } finally {
      setCustomerPhotoBusy(false);
    }
  };

  const handleApproveDesign = async (prefId, fallbackImage) => {
    if (!selectedDirectoryCustomer) return;
    setApprovingDesignId(prefId);
    try {
      await api.approveDesign(selectedDirectoryCustomer.id, prefId, fallbackImage);
      const full = await api.getCustomer(selectedDirectoryCustomer.id);
      setSelectedDirectoryCustomer(current =>
        current && current.id === full.id ? full : current
      );
    } catch (err) {
      alert(err.message || 'Could not approve this design.');
    } finally {
      setApprovingDesignId(null);
    }
  };

  // The Customers (or Leads) page: the server filters, sorts, counts and pages
  // the book (domains/customers/directory.py) and sends back one page with the
  // counts the stat cards, chips and filter menus show. Leads are portal
  // sign-ups nobody has contacted or taken an order for yet.
  const isLead = (c) => !!c.is_lead && !((c.order_count ?? c.orders?.length ?? 0) > 0);

  const customerPageKey = `${customerView}|${searchQuery}|${customerFilters.tier || ''}|${customerPageSize}|${JSON.stringify(customerFilters)}`;

  const customerPage = customerPageAt.key === customerPageKey ? customerPageAt.page : 1;

  const onCustomerBook = dashboardTab === 'customers' || dashboardTab === 'leads';

  const directoryParams = React.useMemo(() => ({
    view: customerView,
    search: directorySearch.trim(),
    tier: customerFilters.tier || '',
    ...customerFilters,
    page: customerPage,
    page_size: customerPageSize,
  }), [customerView, directorySearch, customerFilters, customerPage, customerPageSize]);

  // Which question the page on screen answers; a newer one makes it "loading".
  const directoryKey = `${JSON.stringify(directoryParams)}|${directoryVersion}`;

  // The page of the book last fetched, for this user: coming back to the
  // Customers page shows it again without asking for it again. A new search,
  // filter, page, or a change to the book (directoryVersion) is a new key.
  const fetchedDirectory = useRef(null);
  useEffect(() => {
    if (!onCustomerBook || !currentUser) return undefined;
    const fetchKey = `${currentUser.id || currentUser.email}|${directoryKey}`;
    if (fetchedDirectory.current === fetchKey) return undefined;
    let cancelled = false;
    api.getCustomerDirectory(directoryParams)
      .then((data) => {
        if (cancelled) return;
        fetchedDirectory.current = fetchKey;
        setCustomerDirectory({ key: directoryKey, forView: directoryParams.view, data, error: false });
      })
      .catch(() => { if (!cancelled) setCustomerDirectory((d) => ({ ...d, key: directoryKey, error: true })); });
    return () => { cancelled = true; };
  }, [onCustomerBook, currentUser, directoryParams, directoryKey]);

  const directoryLoading = onCustomerBook && customerDirectory.key !== directoryKey;

  // What another view (customers vs leads) answered is not shown for this one.
  const directoryData = customerDirectory.forView === customerView ? customerDirectory.data : null;

  const bookSummary = directoryData?.summary || { total: 0, with_orders: 0, new_this_month: 0, tiers: NO_TIERS };

  const directoryCount = directoryData?.count || 0;

  const pagedCustomers = directoryData?.results || [];

  const customerPageNow = directoryData?.page || 1;

  const customerPageCount = directoryData?.page_count || 1;

  const customerPageFrom = (customerPageNow - 1) * (directoryData?.page_size || customerPageSize);

  const goToCustomerPage = (n) => {
    setCustomerPageAt({ key: customerPageKey, page: n });
    document.querySelector('.customers-list-container')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };

  const canEditCustomer = isOwnerUser || adminCan('customers.edit');

  const canDeleteCustomer = isOwnerUser || adminCan('customers.delete');

  const canImportCustomers = isOwnerUser || adminCan('customers.import');

  return {
    styleNotesFor,
    setStyleNotesFor,
    alterationOrder,
    setAlterationOrder,
    expandedCustomerOrderId,
    setExpandedCustomerOrderId,
    approvingDesignId,
    setApprovingDesignId,
    searchQuery,
    setSearchQuery,
    customerView,
    customerPageAt,
    setCustomerPageAt,
    customerPageSize,
    setCustomerPageSize,
    customerFilters,
    setCustomerFilters,
    customerDirectory,
    setCustomerDirectory,
    directorySearch,
    handleStartNewCustomer,
    deletingAllCustomers,
    setDeletingAllCustomers,
    customerActionId,
    setCustomerActionId,
    startEditCustomer,
    handleDeleteCustomer,
    handleMarkLeadContacted,
    orderTypeFor,
    setOrderTypeFor,
    handleSelectExistingCustomer,
    beginOrderForCustomer,
    customerPhotoBusy,
    setCustomerPhotoBusy,
    uploadDirectoryCustomerPhoto,
    handleApproveDesign,
    isLead,
    customerPageKey,
    customerPage,
    onCustomerBook,
    directoryParams,
    directoryKey,
    directoryLoading,
    directoryData,
    bookSummary,
    directoryCount,
    pagedCustomers,
    customerPageNow,
    customerPageCount,
    customerPageFrom,
    goToCustomerPage,
    canEditCustomer,
    canDeleteCustomer,
    canImportCustomers,
  };
}
