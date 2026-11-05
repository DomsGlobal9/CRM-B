import { CalendarDays, CheckCircle2, ChevronRight, Crown, Edit2, Eye, Mail, MessageSquare, Phone, Plus, ShoppingBag, Trash2, Upload, Users } from 'lucide-react';
import { AvatarInitials, PageHeader, SearchBar, StatCard } from '../../components/ui/Atelier';
import { GuidedHighlight } from '../../components/ui/GuidedHighlight';
import { tierName } from './tierNames';
import CustomerFilters from './CustomerFilters';
import { LoaderRows } from '../../components/ui/Loader';
import { EMPTY_CUSTOMER_FILTERS, activeFilterCount } from './filterRules';
import { getVisibleMeasurementFields } from '../catalog/measurements';
import { formatDate as fmtDate, formatMobile, inr } from '../../utils/format';
import { resolveMediaUrl } from '../../services/media';
import { TierBadge } from './TierBadge';
import { CUSTOMER_PAGE_SIZES, customerTier } from './customerBook';
import { telLink, waLink } from '../../utils/phone';
import RowMenu from '../../components/ui/RowMenu';
import { DataTable } from '../../components/ui/DataTable';
import { useLanguage } from '../../i18n/LanguageContext.jsx';

const FIELDS = [['bust', 'Bust'], ['waist', 'Waist'], ['hips', 'Hips'], ['shoulder', 'Shoulder'],
                ['arm_length', 'Arm'], ['neck', 'Neck'], ['length', 'Length']];
// One line, cut with an ellipsis; the full text is the tooltip.
const line = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
const sub = { ...line, fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: '2px' };
const measure = (v) => (v === null || v === undefined || v === '' ? '—' : Number(v) || v);

/**
 * The customer book (and Leads): totals by tier, search and filters, and one
 * page of customers at a time from GET /customers/directory/.
 */
export default function CustomersPanel({ bookSummary, bookTotal, canAddCustomer, canDeleteCustomer, canEditCustomer, canImportCustomers, customerActionId, customerDirectory, customerFilters, customerPageCount, customerPageNow, customerPageSize, customerView, directoryCount, directoryData, directoryLoading, goToCustomerPage, guideCustomers, handleDeleteCustomer, handleMarkLeadContacted, handleStartNewCustomer, openDirectoryCustomer, pagedCustomers, searchQuery, setCustomerAddMode, setCustomerFilters, setCustomerPageSize, setDeletingAllCustomers, setDirectoryVersion, setSearchQuery, startEditCustomer }) {
  const { t } = useLanguage();
  const garmentTags = (cust) => {
    const parts = cust.measurements?.additional_measurements?.stitch_parts || [];
    return [
      `${cust.garment_type || ''}${parts.length ? ` (${parts.join(', ')})` : ''}`.trim(),
      cust.neckline_style && `Neck: ${cust.neckline_style}`,
      cust.sleeve_style && `Sleeve: ${cust.sleeve_style}`,
      cust.silhouette && `Silhouette: ${cust.silhouette}`,
      cust.occasion && `${t('customersPage.occasion')} ${cust.occasion}`,
    ].filter(Boolean);
  };
  const columns = [
    {
      key: 'customer', label: 'Customer', width: '30%',
      header: <span style={{ display: 'inline-block', transform: 'translateX(-28px)' }}>Customer</span>,
      cellProps: () => ({ style: { overflow: 'hidden' } }),
      render: (cust) => {
        const contact = [formatMobile(cust.mobile_number), cust.email_address, cust.city_region || cust.address].filter(Boolean);
        return (
          <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', minWidth: 0 }}>
            <AvatarInitials name={`${cust.first_name} ${cust.last_name}`} size={36}
                            src={cust.profile_photo ? resolveMediaUrl(cust.profile_photo) : ''} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                <span style={{ ...line, fontWeight: 'var(--weight-semibold)', color: 'var(--text-primary)' }}
                      title={`${cust.first_name} ${cust.last_name}`}>
                  {cust.first_name} {cust.last_name}
                </span>
                <span style={{ flexShrink: 0 }}><TierBadge tier={customerTier(cust)} /></span>
              </div>
              <div style={sub} title={contact.join(' · ')}>
                {cust.mobile_number
                  ? <Phone size={11} style={{ verticalAlign: '-1px', marginRight: '4px' }} />
                  : cust.email_address && <Mail size={11} style={{ verticalAlign: '-1px', marginRight: '4px' }} />}
                {contact.join(' · ')}
              </div>
            </div>
            <ChevronRight size={18} className="cust-phone" aria-hidden="true" style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          </div>
        );
      },
    },
    {
      key: 'measurements', label: 'Body measurements', width: '24%', cellClassName: 'cust-measure',
      header: <span style={{ display: 'inline-block', transform: 'translateX(-28px)', whiteSpace: 'nowrap' }}>Body measurements</span>,
      cellProps: () => ({ style: { textAlign: 'left', overflow: 'hidden', whiteSpace: 'nowrap' } }),
      render: (cust) => {
        const m = cust.measurements;
        const parts = m?.additional_measurements?.stitch_parts || [];
        const visible = m ? getVisibleMeasurementFields(parts) : [];
        // Only columns holding a number: a row of dashes says nothing.
        const shown = FIELDS.filter(([k]) => visible.includes(k) && m?.[k]).slice(0, 4);
        const hasMeasurements = Boolean(
          (m && shown.length > 0) ||
          (m && FIELDS.some(([k]) => m[k] !== null && m[k] !== undefined && String(m[k]).trim() !== '' && String(m[k]).trim() !== '—')) ||
          (m?.additional_measurements && Object.entries(m.additional_measurements).some(([k, v]) => k !== 'stitch_parts' && v !== null && v !== undefined && String(v).trim() !== '' && String(v).trim() !== '—'))
        );
        return hasMeasurements ? (
          <span
            style={{ fontSize: 'var(--text-xs)', color: 'var(--text-primary)', fontWeight: 600 }}
            title={shown.length > 0 ? shown.map(([k, label]) => `${label} ${measure(m[k])}`).join(' · ') : t('customersPage.recorded', 'Recorded')}
          >
            {t('customersPage.recorded', 'Recorded')}
          </span>
        ) : (
          <span
            style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}
            title={t('customersPage.notRecorded', 'Not recorded')}
          >
            {t('customersPage.notRecorded', 'Not recorded')}
          </span>
        );
      },
    },
    {
      // .cust-list centres every heading, ahead of .at-cell--right: the block span sets this one's side.
      key: 'garment', label: 'Garment', width: '16%',
      header: <span style={{ display: 'block', textAlign: 'left' }}>Garment</span>,
      cellProps: (cust) => ({
        className: garmentTags(cust).length || cust.custom_requirements ? undefined : 'cust-empty',
        style: { overflow: 'hidden' },
      }),
      render: (cust) => {
        const tags = garmentTags(cust);
        return (
          <>
            <div className="at-tags" style={{ flexWrap: 'nowrap', overflow: 'hidden' }} title={tags.join(' · ')}>
              {tags.map(tag => <span key={tag} className="at-tag" style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>{tag}</span>)}
            </div>
            {cust.custom_requirements && (
              <div style={sub} title={cust.custom_requirements}>{cust.custom_requirements}</div>
            )}
          </>
        );
      },
    },
    {
      key: 'orders', label: 'Orders', width: '20%', cellClassName: 'cust-orders',
      header: <span style={{ display: 'inline-block', transform: 'translateX(-28px)' }}>Orders</span>,
      cellProps: () => ({ style: { textAlign: 'center', overflow: 'hidden' } }),
      render: (cust) => {
        const orders = cust.order_count ?? cust.orders?.length ?? 0;
        return (
          <>
            <div className="cust-desk" style={{ display: 'inline-block', textAlign: 'center', transform: 'translateX(-28px)' }}>
              <div style={{ fontWeight: 700 }}>{orders}</div>
              <div style={sub} title={`${inr(cust.total_spend)} spent · ${t('customersPage.registered')} ${fmtDate(cust.created_at)}`}>
                {inr(cust.total_spend)} · {fmtDate(cust.created_at)}
              </div>
            </div>
            <dl className="cust-stats">
              <div><dt>{orders === 1 ? 'Order' : 'Orders'}</dt><dd>{orders}</dd></div>
              <div><dt>Spent</dt><dd>{inr(cust.total_spend)}</dd></div>
              <div><dt>Since</dt><dd>{fmtDate(cust.created_at)}</dd></div>
            </dl>
          </>
        );
      },
    },
    {
      // A plain column, not DataTable's `actions`: .cust-actions lays these buttons out itself on the phone.
      key: 'actions', label: false, width: '80px', cellClassName: 'cust-actions',
      header: <span style={{ display: 'block', textAlign: 'right' }}>Actions</span>,
      cellProps: () => ({ style: { textAlign: 'right', whiteSpace: 'nowrap' }, onClick: (e) => e.stopPropagation() }),
      render: (cust) => (
        <>
          {cust.mobile_number && (
            <span className="cust-contact" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
              <a className="btn-secondary at-btn-sm" href={telLink(cust.mobile_number)}
                 aria-label={`Call ${cust.first_name} ${cust.last_name}`}>
                <Phone size={14} /> Call
              </a>
              <a className="btn-secondary at-btn-sm" href={waLink(cust.mobile_number)} target="_blank" rel="noreferrer"
                 aria-label={`WhatsApp ${cust.first_name} ${cust.last_name}`}>
                <MessageSquare size={14} /> WhatsApp
              </a>
            </span>
          )}
          <RowMenu
            label={`Actions for ${cust.first_name || ''} ${cust.last_name || ''}`.trim() || 'Customer actions'}
            items={[
              {
                label: 'View profile',
                icon: <Eye size={15} />,
                onClick: () => openDirectoryCustomer(cust),
              },
              ...(customerView === 'leads' ? [{
                label: 'Mark as contacted',
                icon: <CheckCircle2 size={15} />,
                disabled: customerActionId === cust.id,
                onClick: () => handleMarkLeadContacted(cust),
              }] : []),
              ...(canEditCustomer ? [{
                label: 'Edit customer',
                icon: <Edit2 size={15} />,
                disabled: customerActionId === cust.id,
                onClick: () => startEditCustomer(cust),
              }] : []),
              ...(cust.mobile_number ? [
                {
                  label: 'WhatsApp',
                  icon: <MessageSquare size={15} />,
                  onClick: () => { window.open(waLink(cust.mobile_number), '_blank', 'noopener,noreferrer'); },
                },
              ] : []),
              ...(canDeleteCustomer ? [{
                label: 'Delete customer',
                icon: <Trash2 size={15} />,
                danger: true,
                disabled: customerActionId === cust.id,
                onClick: () => handleDeleteCustomer(cust),
              }] : []),
            ]}
          />
        </>
      ),
    },
  ];
  return (
    <>
      <PageHeader
        title={customerView === 'leads' ? t('nav.leads', 'Leads') : t('customersPage.title')}
        subtitle={t('customersPage.subtitle')}
        aside={(
          <>
            <SearchBar value={searchQuery} onChange={setSearchQuery} placeholder={t('customersPage.searchPlaceholder')} />
          </>
        )}
        actions={(canAddCustomer || canDeleteCustomer || canImportCustomers) && (
          <>
            {bookTotal > 0 && canDeleteCustomer && (
              <button type="button" className="btn-secondary at-btn-danger" style={{ padding: '10px 18px' }}
                      onClick={() => setDeletingAllCustomers(true)}>
                <Trash2 size={16} /> Delete all
              </button>
            )}
            {/* Leads come in through the lead API, not the counter: no Add or import here. */}
            {customerView !== 'leads' && (
              <>
                {canImportCustomers && (
                  <button type="button" className="btn-secondary" style={{ padding: '10px 18px' }}
                          onClick={() => setCustomerAddMode('import')}>
                    <Upload size={16} /> {t('customersPage.importExcel', 'Import from Excel')}
                  </button>
                )}
                {canAddCustomer && (
                  <GuidedHighlight show={guideCustomers}>
                    <button className="btn-primary" style={{ padding: '10px 18px' }} onClick={handleStartNewCustomer}>
                      <Plus size={16} /> Add Customer
                    </button>
                  </GuidedHighlight>
                )}
              </>
            )}
          </>
        )}
      />

      {(() => {
        const thisMonth = bookSummary.new_this_month;
        const tiers = bookSummary.tiers;
        const withOrders = bookSummary.with_orders;
        return (
          <>
            <section className="at-stat-grid">
              <StatCard icon={Users} tone="green" label={customerView === 'leads' ? 'Total Leads' : 'Total Customers'} value={bookSummary.total}
                        sub={t('customersPage.withOrdersCount', '{n} with orders', { n: withOrders })} />
              <StatCard icon={Crown} tone="amber" label={`${tierName('Platinum')} customers`} value={tiers.Platinum}
                        sub={`${tiers.Gold} ${tierName('Gold')} · ${tiers.Silver} ${tierName('Silver')}`} />
              <StatCard icon={CalendarDays} tone="violet" label="New This Month" value={thisMonth} sub="registered" />
              <StatCard icon={ShoppingBag} tone="blue" label="With Orders" value={withOrders} sub="at least one order" />
            </section>
            {(() => {
              const showing = (
                <span className="cf-showing">
                  {directoryCount
                    ? `${directoryCount} customer${directoryCount === 1 ? '' : 's'}`
                    : 'No customers'}
                  {directoryCount !== bookSummary.total ? ` (${bookSummary.total} in total)` : ''}
                </span>
              );
              return bookSummary.total > 0 ? (
                <div style={{ marginTop: 'var(--space-5)' }}>
                  <CustomerFilters facets={directoryData.facets} filters={customerFilters} onChange={setCustomerFilters}
                                   tierCounts={tiers} leading={showing} />
                </div>
              ) : (
                <div className="at-toolbar">{showing}</div>
              );
            })()}
          </>
        );
      })()}

      <div className="customers-list-container at-stack">
        {!directoryData && !customerDirectory.error ? (
          <div className="ui-card" style={{ padding: 'var(--space-4)' }}>
            <LoaderRows rows={6} />
          </div>
        ) : customerDirectory.error && !directoryData ? (
          <div style={{ padding: '48px', textAlign: 'center', background: 'var(--danger-bg)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--danger-color)' }}>
            <div style={{ color: 'var(--danger-color)', marginBottom: '12px' }}>Could not load the customer directory.</div>
            <button type="button" className="btn-secondary" onClick={() => setDirectoryVersion((v) => v + 1)}>Retry</button>
          </div>
        ) : directoryCount === 0 ? (
          <div className="ui-card" style={{ padding: '48px', textAlign: 'center' }}>
            {bookSummary.total === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center' }}>
                <div style={{ fontWeight: 'var(--weight-semibold)', color: 'var(--text-primary)' }}>{t('customersPage.noCustomersYet')}</div>
                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', maxWidth: '44ch', lineHeight: 'var(--leading-normal)' }}>
                  Everyone you take an order for is kept here, with their measurements, past orders and preferences.
                </div>
                {customerView !== 'leads' && (
                  <button className="btn-primary" onClick={handleStartNewCustomer}>
                    {t('customersPage.addFirstCustomer')}
                  </button>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center' }}>
                <span style={{ color: 'var(--text-muted)' }}>{t('customersPage.noMatchingCustomers')}</span>
                {activeFilterCount(customerFilters) > 0 && (
                  <button type="button" className="btn-secondary" onClick={() => setCustomerFilters(EMPTY_CUSTOMER_FILTERS)}>
                    Clear filters
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (

          <>
          {/* cust-list: below 1024px each row becomes its own card
              (index.css), with call/WhatsApp buttons for the phone.
              at-stack keeps the gap between the table and its pager. */}
          <DataTable
            className="at-stack"
            wrapClassName="cust-list"
            tableStyle={{ tableLayout: 'fixed', transition: 'opacity .15s' }}
            columns={columns}
            rows={pagedCustomers}
            loading={directoryLoading}
            rowClassName={() => 'cust-row'}
            onRowClick={openDirectoryCustomer}
            rowProps={(cust) => ({
              role: 'button',
              // DataTable opens a row on Enter; these rows open on Space as well.
              onKeyDownCapture: (e) => {
                if (e.key === ' ' && e.target === e.currentTarget) { e.preventDefault(); openDirectoryCustomer(cust); }
              },
            })}
            pager={directoryCount > CUSTOMER_PAGE_SIZES[0] ? {
              page: customerPageNow, pageCount: customerPageCount, pageSize: customerPageSize,
              sizes: CUSTOMER_PAGE_SIZES, onPage: goToCustomerPage, onSize: setCustomerPageSize,
              label: 'Customers per page', total: directoryCount,
            } : undefined}
          />
          </>
        )}
      </div>
    </>
  );
}
