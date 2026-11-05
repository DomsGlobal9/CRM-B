import { useEffect, useState } from 'react';
import { Banknote, FileText, Receipt, Wallet } from 'lucide-react';
import { formatDate as fmtDate, formatMoney, orderRef } from '../../services/format';
import { AvatarInitials, Chips, PageHeader, ProgressBar, SearchBox, StatCard } from '../../components/ui/Atelier';
import { LIMITS, amountError, cleanAmount } from '../../services/validate';
import { api } from '../../services/api';
import { useLanguage } from '../../i18n/LanguageContext.jsx';
import { useApp } from '../../context/AppContext';
import { Pager } from '../../components/ui/Pager';
import Loader from '../../components/ui/Loader';

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
        <SearchBox value={invoiceSearch} onChange={setInvoiceSearch}
                   placeholder={t('invoicesPage.searchPlaceholder', 'Search Invoice ID or Client...')} />
      </div>
    </div>

    {paymentError && (
      <div role="alert" style={{ marginBottom: '16px', background: 'var(--danger-bg)', border: '1px solid var(--danger-color)', color: 'var(--danger-color)', borderRadius: 'var(--radius-md)', padding: '12px 14px', fontSize: 'var(--text-sm)', display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
        <span>{paymentError}</span>
        <button type="button" onClick={() => setPaymentError(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontWeight: 700 }}>Dismiss</button>
      </div>
    )}

    {/* Fixed column widths and one-line cells, so every row is the
        same height and the money columns line up down the page;
        below 1024px the rows stack into labelled cards. */}
    <div className="invoices-content at-table-wrap">
      <table className="at-table at-table--fit at-table--pairs" style={{ tableLayout: 'fixed' }}>
        <thead>
          <tr>
            <th style={{ width: '7%' }}>{t('invoicesPage.invoiceId', 'Invoice ID')}</th>
            <th style={{ width: '19%' }}>{t('invoicesPage.billingClient', 'Billing Client')}</th>
            <th style={{ width: '11%' }}>{t('common.date', 'Date')}</th>
            <th style={{ width: '10%', textAlign: 'right' }}>{t('invoicesPage.totalPrice', 'Total Price')}</th>
            <th style={{ width: '20%' }}>{t('invoicesPage.totalPaid', 'Total Paid')}</th>
            <th style={{ width: '10%', textAlign: 'right' }}>{t('invoicesPage.balanceDue', 'Balance Due')}</th>
            <th style={{ width: '12%' }}>{t('common.status', 'Payment Status')}</th>
            <th style={{ width: '11%', textAlign: 'right' }}>{t('common.actions', 'Action')}</th>
          </tr>
        </thead>
        <tbody>
          {!body && !loaded.error ? (
            <tr>
              <td colSpan="8" style={{ padding: '32px' }}><Loader label={t('invoicesPage.loading', 'Loading invoices…')} /></td>
            </tr>
          ) : loaded.error && !loading ? (
            <tr>
              <td colSpan="8" role="alert" style={{ padding: '32px', textAlign: 'center', color: 'var(--danger-color)' }}>
                {loaded.error}{' '}
                <button type="button" className="at-link" onClick={() => setVersion((n) => n + 1)}>{t('common.retry', 'Retry')}</button>
              </td>
            </tr>
          ) : invoices.length === 0 ? (
            <tr>
              <td colSpan="8" style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                {totalCount === 0
                  ? t('invoicesPage.emptyState', 'Invoices appear here once you have created an order.')
                  : t('invoicesPage.noMatchingInvoices', 'No invoices matching the criteria.')}
              </td>
            </tr>
          ) : invoices.map(order => {
            const total = Number(order.total_amount) || 0;
            const paid = Number(order.amount_paid || 0);
            const balance = Math.max(0, total - paid);
            const pct = total > 0 ? Math.round((paid / total) * 100) : 0;
            return (
              <tr key={order.id} className="bill-row">
                <td data-label={t('invoicesPage.invoiceId', 'Invoice ID')} style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{orderRef(order)}</td>
                <td data-label={t('invoicesPage.billingClient', 'Billing Client')} style={{ overflow: 'hidden' }}>
                  <span className="at-cell-person">
                    <AvatarInitials name={order.customer_name} size={32} />
                    <span style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={order.customer_name}>{order.customer_name}</span>
                  </span>
                </td>
                <td data-label={t('common.date', 'Date')} style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{fmtDate(order.order_date)}</td>
                <td data-label={t('invoicesPage.totalPrice', 'Total Price')} className="at-num" style={{ fontWeight: 600, textAlign: 'right', whiteSpace: 'nowrap' }}>{order.price_pending ? <span className="od-hint">Price pending</span> : formatMoney(order.total_amount)}</td>
                {/* Editable: the one place a part payment is recorded. The
                    backend derives the label, clamps to the total and caps
                    the advance -- only the input lives here. */}
                <td data-label={t('invoicesPage.totalPaid', 'Total Paid')}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', color: 'var(--success-text)', fontWeight: 600, height: '32px',
                                border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', padding: '0 0 0 8px', background: 'var(--surface-color)', flex: '0 1 120px', minWidth: '90px' }}>
                    <span>₹</span>
                    <input
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
                      style={{ width: '100%', minWidth: 0, minHeight: 0, height: '30px', padding: '0 6px', fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--success-text)', border: 'none', borderRadius: 'var(--radius-sm)', background: 'transparent' }}
                    />
                  </div>
                    <span className="at-num" style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}
                          title={Number(order.advance_paid) > 0 ? t('invoicesPage.ofWhichAdvance', '{amount} advance', { amount: formatMoney(order.advance_paid) }) : undefined}>
                      <strong style={{ color: pct >= 100 ? 'var(--success-text)' : 'var(--text-primary)' }}>{pct}%</strong>
                      {Number(order.advance_paid) > 0 && (
                        <span style={{ color: 'var(--text-muted)' }}> · {t('invoicesPage.ofWhichAdvance', '{amount} advance', { amount: formatMoney(order.advance_paid) })}</span>
                      )}
                    </span>
                  </div>
                  <div style={{ marginTop: '6px', maxWidth: '220px' }}><ProgressBar pct={pct} tone="green" /></div>
                </td>
                <td data-label={t('invoicesPage.balanceDue', 'Balance Due')} className="at-num" style={{ color: balance > 0 ? 'var(--danger-color)' : 'var(--text-secondary)', fontWeight: 600, textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {formatMoney(balance)}
                </td>
                <td data-label={t('common.status', 'Payment Status')} style={{ overflow: 'hidden' }}>
                  {/* Read-only: the status follows the amount in Paid so far (the
                      backend derives it), so it is shown as a badge, not a choice --
                      a bill paid in full cannot be set back to Unpaid by hand. */}
                  <span className={`ui-badge ui-badge--${statusTone(order.payment_status)}`}
                        title={t('invoicesPage.statusFromPayment', 'Set by the amount paid')}
                        style={{ display: 'inline-flex', alignItems: 'center', height: '30px', padding: '0 14px', fontSize: '12px', fontWeight: 600, maxWidth: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {order.payment_status === 'Paid' ? t('invoicesPage.paid', 'Paid')
                      : order.payment_status === 'Partially Paid' ? t('invoicesPage.partiallyPaid', 'Partially Paid')
                      : order.payment_status === 'Pending' ? t('invoicesPage.pending', 'Pending')
                      : order.payment_status}
                  </span>
                </td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <button className="btn-secondary at-btn-sm" title={t('invoicesPage.viewInvoice', 'View Invoice')} onClick={() => {
                    setConfirmedOrder(order);
                    setShowInvoiceModal(true);
                  }}>
                    <FileText size={12} /> {t('invoicesPage.viewInvoice', 'View Invoice')}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {/* On every list, even one page long, as on Orders and Workshop. */}
      {body && (
        <Pager page={body.page} pageCount={body.pages} pageSize={pageSize}
               sizes={INVOICE_PAGE_SIZES} onPage={(n) => setPageAt({ key: filterKey, page: n })} onSize={setPageSize}
               label={t('invoicesPage.perPage', 'Invoices per page')} />
      )}
    </div>
  </>
  );
}
