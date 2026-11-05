import { useEffect, useState } from 'react';
import { AlertTriangle, Banknote, FileText, Receipt, Wallet } from 'lucide-react';
import { formatDate as fmtDate, formatMoney, orderRef } from '../../utils/format';
import { AvatarInitials, Button, Chips, ClampedText, InfoNote, PageHeader, ProgressBar, SearchBar, StatCard, StatusBadge } from '../../components/ui/Atelier';
import { LIMITS, amountError, cleanAmount } from '../../utils/validate';
import { api } from '../../api';
import { useLanguage } from '../../i18n/LanguageContext.jsx';
import { useApp } from '../../context/AppContext';
import { DataTable } from '../../components/ui/DataTable';

/** Rows per page; the server offers the same (OrderViewSet.INVOICE_PAGE_SIZES). */
const INVOICE_PAGE_SIZES = [20, 30, 40, 50];

/**
 * Invoices: every order's bill, what was paid and what is still due.
 * The Total paid box is the one place a part payment is recorded; the
 * payment status badge follows it (the backend derives it).
 *
 * The bills come a page at a time from GET /orders/invoices/, filtered and
 * searched there, with the totals above the table (of every bill) alongside.
 */
export default function InvoicesPanel({ invoiceFilter, invoiceSearch, paymentError, savingPaymentId, setConfirmedOrder, setInvoiceFilter, setInvoiceSearch, setPaymentError, setSavingPaymentId, setShowInvoiceModal }) {
  const { t } = useLanguage();
  const { currentUser, adminCan, refresh: fetchDashboardAndConfig } = useApp();

  const [pageSize, setPageSize] = useState(INVOICE_PAGE_SIZES[0]);
  // The page asked for, kept with what it was asked under: a new filter,
  // search or page size starts again at page 1.
  const search = invoiceSearch.trim();
  const filterKey = `${invoiceFilter}|${search}|${pageSize}`;
  const [pageAt, setPageAt] = useState({ key: filterKey, page: 1 });
  if (pageAt.key !== filterKey) setPageAt({ key: filterKey, page: 1 });
  const page = pageAt.key === filterKey ? pageAt.page : 1;
  // Bumped after a payment is recorded, to fetch the same page again.
  const [version, setVersion] = useState(0);
  const request = `${filterKey}|${page}|${version}`;
  // What came back, with the request it answers: loading until they match.
  const [loaded, setLoaded] = useState({ request: '', body: null, error: '' });

  useEffect(() => {
    let live = true;
    // Typing in the search box waits for a pause before asking.
    const timer = setTimeout(() => {
      api.getInvoices({ page, page_size: pageSize, status: invoiceFilter, search })
        .then((body) => { if (live) setLoaded({ request, body, error: '' }); })
        .catch((err) => { if (live) setLoaded((prev) => ({ request, body: prev.body, error: err.message || 'Could not load the invoices.' })); });
    }, search ? 250 : 0);
    return () => { live = false; clearTimeout(timer); };
  }, [request, page, pageSize, invoiceFilter, search]);

  const loading = loaded.request !== request;
  // While the next page loads, the last one stays on screen rather than flashing empty.
  const body = loaded.body;
  const invoices = body?.results || [];
  const summary = body?.summary || { count: 0, paid_count: 0, pending_count: 0, collected: 0, outstanding: 0, invoiced: 0 };
  const paidTotal = Number(summary.collected) || 0;
  const pendingTotal = Number(summary.outstanding) || 0;
  const grandTotal = Number(summary.invoiced) || 0;
  const paidCount = summary.paid_count;
  const pendingCount = summary.pending_count;
  const totalCount = summary.count;
  const statusTone = (st) => st === 'Paid' ? 'success' : st === 'Partially Paid' ? 'warning' : 'danger';

  // The eight columns stay in this order: the bill cards on smaller screens
  // place each cell by its position (.invoices-content in index.css).
  const columns = [
    {
      key: 'id', header: t('invoicesPage.invoiceId', 'Invoice ID'), width: '7%', cellClassName: 'bill-cell-id',
      render: (order) => orderRef(order),
    },
    {
      key: 'client', header: t('invoicesPage.billingClient', 'Billing Client'), width: '19%', cellClassName: 'bill-cell-clip',
      render: (order) => (
        <span className="at-cell-person">
          <AvatarInitials name={order.customer_name} size={32} />
          <ClampedText className="bill-client">{order.customer_name}</ClampedText>
        </span>
      ),
    },
    {
      key: 'date', header: t('common.date', 'Date'), width: '11%', cellClassName: 'bill-cell-date',
      render: (order) => fmtDate(order.order_date),
    },
    {
      key: 'total', header: t('invoicesPage.totalPrice', 'Total Price'), width: '10%', numeric: true, cellClassName: 'at-num bill-cell-money',
      render: (order) => (order.price_pending ? <span className="od-hint">Price pending</span> : formatMoney(order.total_amount)),
    },
    {
      key: 'paid', header: t('invoicesPage.totalPaid', 'Total Paid'), width: '20%',
      // Editable: the one place a part payment is recorded. The backend derives
      // the label, clamps to the total and caps the advance -- only the input
      // lives here.
      render: (order) => {
        const total = Number(order.total_amount) || 0;
        const paid = Number(order.amount_paid || 0);
        const pct = total > 0 ? Math.round((paid / total) * 100) : 0;
        return (
          <>
            <div className="bill-paid">
              <div className="bill-paid-box">
                <span>₹</span>
                <input
                  className="bill-paid-input"
                  type="number"
                  min="0"
                  step="0.01"
                  max={order.total_amount}
                  inputMode="decimal"
                  defaultValue={parseFloat(order.amount_paid || 0)}
                  disabled={savingPaymentId === order.id
                    || !(!currentUser?.role || currentUser.role === 'Owner' || adminCan('orders.edit'))}
                  aria-label={`Amount paid for invoice ${orderRef(order)}`}
                  onChange={(e) => { e.target.value = cleanAmount(e.target.value); }}
                  onBlur={async (e) => {
                    const next = parseFloat(e.target.value);
                    const current = parseFloat(order.amount_paid || 0);

                    if (isNaN(next) || next === current) {
                      e.target.value = current;
                      return;
                    }
                    const bad = amountError(next, { label: 'Amount paid', max: Number(order.total_amount) || LIMITS.amount });
                    if (bad) { alert(bad); e.target.value = current; return; }
                    setSavingPaymentId(order.id);
                    try {
                      await api.updateOrder(order.id, { amount_paid: next });
                      setVersion((n) => n + 1);
                      await fetchDashboardAndConfig();
                    } catch (err) {
                      e.target.value = current;
                      setPaymentError(`Could not record that payment for ${orderRef(order)} — ${err.message}`);
                    } finally {
                      setSavingPaymentId(null);
                    }
                  }}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
                />
              </div>
              <span className="at-num bill-paid-note"
                    title={Number(order.advance_paid) > 0 ? t('invoicesPage.ofWhichAdvance', '{amount} advance', { amount: formatMoney(order.advance_paid) }) : undefined}>
                <strong className={pct >= 100 ? 'bill-paid-pct--full' : 'bill-paid-pct'}>{pct}%</strong>
                {Number(order.advance_paid) > 0 && (
                  <span className="bill-paid-advance"> · {t('invoicesPage.ofWhichAdvance', '{amount} advance', { amount: formatMoney(order.advance_paid) })}</span>
                )}
              </span>
            </div>
            <div className="bill-paid-bar"><ProgressBar pct={pct} tone="green" /></div>
          </>
        );
      },
    },
    {
      key: 'balance', header: t('invoicesPage.balanceDue', 'Balance Due'), width: '10%', numeric: true,
      cellClassName: 'at-num bill-cell-money bill-cell-balance',
      render: (order) => {
        const balance = Math.max(0, (Number(order.total_amount) || 0) - Number(order.amount_paid || 0));
        return <span className={balance > 0 ? 'bill-balance--due' : undefined}>{formatMoney(balance)}</span>;
      },
    },
    {
      key: 'status', header: t('common.status', 'Payment Status'), width: '12%', cellClassName: 'bill-cell-clip',
      // Read-only: the status follows the amount in Paid so far (the backend
      // derives it), so it is shown as a badge, not a choice -- a bill paid in
      // full cannot be set back to Unpaid by hand.
      render: (order) => (
        <StatusBadge tone={statusTone(order.payment_status)} title={t('invoicesPage.statusFromPayment', 'Set by the amount paid')}>
          {order.payment_status === 'Paid' ? t('invoicesPage.paid', 'Paid')
            : order.payment_status === 'Partially Paid' ? t('invoicesPage.partiallyPaid', 'Partially Paid')
            : order.payment_status === 'Pending' ? t('invoicesPage.pending', 'Pending')
            : order.payment_status}
        </StatusBadge>
      ),
    },
    {
      key: 'action', header: t('common.actions', 'Action'), width: '11%', align: 'right', label: false, cellClassName: 'bill-cell-action',
      render: (order) => (
        <Button variant="secondary" size="sm" icon={FileText} title={t('invoicesPage.viewInvoice', 'View Invoice')} onClick={() => {
          setConfirmedOrder(order);
          setShowInvoiceModal(true);
        }}>
          {t('invoicesPage.viewInvoice', 'View Invoice')}
        </Button>
      ),
    },
  ];

  return (
  <>
    <PageHeader
      title={t('invoicesPage.title', 'Invoices & Billing')}
      subtitle={t('invoicesPage.subtitle', 'Manage invoices, verify billing payments, and print receipts.')}
    />

    <section className="at-stat-grid bill-stats">
      <StatCard icon={Banknote} tone="green" label={t('invoicesPage.totalCollectedRevenue', 'Total Collected Revenue')}
                value={formatMoney(paidTotal)} sub={`${paidCount} settled in full`} />
      <StatCard icon={Wallet} tone="amber" label={t('invoicesPage.outstandingBalance', 'Outstanding Balance')}
                value={formatMoney(pendingTotal)} sub={`across ${pendingCount} invoice${pendingCount === 1 ? '' : 's'}`} />
      <StatCard icon={Receipt} tone="blue" label={t('invoicesPage.totalInvoicedVolume', 'Total Invoiced Volume')}
                value={formatMoney(grandTotal)} sub={`${totalCount} invoice${totalCount === 1 ? '' : 's'}`} />
    </section>

    <div className="at-toolbar bill-toolbar">
      <Chips value={invoiceFilter} onChange={setInvoiceFilter} options={[
        { key: 'All', label: t('common.all', 'All'), count: totalCount },
        { key: 'Paid', label: t('invoicesPage.paid', 'Paid'), count: paidCount },
        { key: 'Pending', label: t('invoicesPage.pending', 'Pending'), count: pendingCount },
      ]} />
      <div className="at-toolbar-right">
        <SearchBar value={invoiceSearch} onChange={setInvoiceSearch}
                   placeholder={t('invoicesPage.searchPlaceholder', 'Search Invoice ID or Client...')} />
      </div>
    </div>

    {paymentError && (
      <div role="alert" className="bill-alert">
        <InfoNote icon={AlertTriangle} tone="danger" onDismiss={() => setPaymentError(null)}>{paymentError}</InfoNote>
      </div>
    )}

    {/* Fixed column widths and one-line cells, so every row is the same height
        and the money columns line up down the page; on smaller screens the rows
        become labelled cards. The server pages, filters and searches, so the
        list keeps its own order rather than sorting one page of it here. */}
    <DataTable
      caption={t('invoicesPage.title', 'Invoices & Billing')}
      columns={columns}
      rows={invoices}
      wrapClassName="invoices-content"
      tableClassName="at-table--pairs at-table--fixed"
      rowClassName={() => 'bill-row'}
      loading={loading}
      labels={{ loading: t('invoicesPage.loading', 'Loading invoices…') }}
      error={loaded.error && !loading ? loaded.error : undefined}
      errorAction={<button type="button" className="at-link" onClick={() => setVersion((n) => n + 1)}>{t('common.retry', 'Retry')}</button>}
      empty={{
        title: totalCount === 0
          ? t('invoicesPage.emptyState', 'Invoices appear here once you have created an order.')
          : t('invoicesPage.noMatchingInvoices', 'No invoices matching the criteria.'),
      }}
      // On every list, even one page long, as on Orders and Workshop.
      pager={body ? {
        page: body.page, pageCount: body.pages, pageSize, sizes: INVOICE_PAGE_SIZES,
        onPage: (n) => setPageAt({ key: filterKey, page: n }), onSize: setPageSize,
        label: t('invoicesPage.perPage', 'Invoices per page'), total: body.count,
        totalLabel: ({ from, to, total }) => t('invoicesPage.showing', 'Showing {from}–{to} of {total}', { from, to, total }),
      } : undefined}
    />
  </>
  );
}
