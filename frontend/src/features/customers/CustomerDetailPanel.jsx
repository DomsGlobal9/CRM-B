import { ArrowLeft, ArrowRight, CalendarDays, ChevronRight, Copy, Edit2, Heart, Image as ImageIcon, Mail, MapPin, Phone, Ruler, Scissors, Shirt, ShoppingBag, Sparkles, Trash2, Upload } from 'lucide-react';
import { formatMeasurementLabel, formatMeasurementValue, getVisibleMeasurementFields } from '../../services/measurements';
import { AvatarInitials, CameraButton, FormModal, IconTile, SectionCard } from '../../components/ui/Atelier';
import { resolveMediaUrl } from '../../services/media';
import { TierBadge } from './TierBadge';
import { customerTier } from './customerBook';
import { formatDate as fmtDate, formatDateTime as fmtDateTime, formatMobile, inr, orderGarmentLabel, orderRef } from '../../services/format';
import Loader from '../../components/ui/Loader';
import { StageTimeline } from '../orders/StageTimeline';
import { STEP_LABEL, STEP_STATE } from '../orders/stages';
import OrderAlterations, { RequestAlterationModal } from '../alterations/OrderAlterations';
import { StyleProfileCard } from './StyleProfileCard';
import CustomerReferrals from './CustomerReferrals';
import { useLanguage } from '../../i18n/LanguageContext.jsx';
import { useApp } from '../../context/AppContext';

/**
 * One customer (or lead) on its own page: contact details, measurements,
 * style profile, referrals and their orders, with the actions on them.
 */
export default function CustomerDetailPanel({ alterationOrder, approvingDesignId, beginOrderForCustomer, customerActionId, customerPhotoBusy, directoryDetailLoading, expandedCustomerOrderId, handleApproveDesign, handleDeleteCustomer, handleSelectExistingCustomer, isLead, openAlteration, openDirectoryCustomer, openStageReview, orderTypeFor, refreshCustomerBook, rememberAlteration, selectedDirectoryCustomer, setAlterationOrder, setDesignNotes, setExpandedCustomerOrderId, setOrderTypeFor, setQuotePrices, setSelectedDirectoryCustomer, setViewAllCustomerMeasurements, startEditCustomer, uploadDirectoryCustomerPhoto, viewAllCustomerMeasurements }) {
  const { t } = useLanguage();
  const { currentUser, adminCan, setDashboardTab } = useApp();
  const c = selectedDirectoryCustomer;
  const isOwner = !currentUser?.role || currentUser.role === 'Owner';
  const parts = c.measurements?.additional_measurements?.stitch_parts || [];
  const visible = c.measurements ? getVisibleMeasurementFields(parts) : [];
  const FIELDS = [['bust', 'Bust'], ['waist', 'Waist'], ['hips', 'Hips'], ['shoulder', 'Shoulder'],
                  ['arm_length', 'Arm Length'], ['neck', 'Neck'], ['length', 'Length']];
  const shown = FIELDS.filter(([k]) => visible.includes(k));
  const allCustomerMeasurements = (() => {
    if (!c?.measurements) return [];
    const rawCore = c.measurements || {};
    const rawExtra = c.measurements.additional_measurements || {};
    const merged = { ...rawCore, ...rawExtra };

    delete merged.additional_measurements;
    delete merged.stitch_parts;
    delete merged.id;
    delete merged.customer_id;
    delete merged.created_at;
    delete merged.updated_at;

    const result = [];
    const seenKeys = new Set();

    Object.entries(merged).forEach(([k, val]) => {
      if (seenKeys.has(k)) return;
      if (val !== undefined && val !== null && String(val).trim() !== '' && String(val).trim() !== '—') {
        seenKeys.add(k);
        result.push({
          key: k,
          label: formatMeasurementLabel(k),
          value: formatMeasurementValue(val)
        });
      }
    });

    return result;
  })();

  const displayedMeasurements = viewAllCustomerMeasurements
    ? allCustomerMeasurements
    : (allCustomerMeasurements.length > 0
        ? (shown.length > 0
            ? shown.map(([k]) => {
                const found = allCustomerMeasurements.find(m => m.key === k);
                return found || { key: k, label: formatMeasurementLabel(k), value: formatMeasurementValue(c.measurements[k]) };
              })
            : allCustomerMeasurements.slice(0, 8)
          )
        : []
      );

  const orders = c.orders || [];
  const orderCount = c.order_count ?? orders.length;

  const goExisting = () => handleSelectExistingCustomer(c, () => {
    if (c.design_preferences?.length > 0) {
      setDesignNotes(c.design_preferences[0].notes || '');
    }
  });
  const reorder = (order) => handleSelectExistingCustomer(c, () => {
    setQuotePrices({ packaging: order.packaging_handling, discount: order.discount || 0 });
  });
  const statusTone = (st) => st === 'Delivered' ? 'success' : st === 'Cancelled' ? 'neutral' : 'warning';

  return (
  <div className="customer-detail-view-container at-stack">
    {orderTypeFor && (
      <FormModal icon={ShoppingBag} tone="green" width="640px"
                 title={t('customersPage.orderTypeTitle', 'What kind of order?')}
                 subtitle={t('customersPage.orderTypeSub', 'For {name}. Their name, number and measurements come with it.',
                   { name: `${orderTypeFor.cust.first_name || ''} ${orderTypeFor.cust.last_name || ''}`.trim() })}
                 onClose={() => setOrderTypeFor(null)}>
        <div className="wz-services" style={{ marginTop: 0 }}>
          <button type="button" className="wz-service" onClick={() => beginOrderForCustomer('stitch')}>
            <IconTile icon={Scissors} tone="green" size={44} iconSize={20} />
            <span className="wz-service-title">{t('entry.serviceStitching', 'Stitching')}</span>
            <span className="wz-service-desc">{t('entry.serviceStitchingDescShort', 'Something new to stitch: from our catalogue, their photos, or a new design.')}</span>
          </button>
          <button type="button" className="wz-service" onClick={() => beginOrderForCustomer('alter')}
                  disabled={currentUser?.role === 'Designer'}
                  title={currentUser?.role === 'Designer' ? t('entry.serviceAlterNotYou', 'Alterations are raised at the counter.') : undefined}>
            <IconTile icon={Ruler} tone="amber" size={44} iconSize={20} />
            <span className="wz-service-title">{t('entry.serviceAlteration', 'Alteration')}</span>
            <span className="wz-service-desc">{t('entry.serviceAlterationDesc', 'Fix or adjust a garment \u2014 one we made, or one stitched elsewhere.')}</span>
          </button>
        </div>
      </FormModal>
    )}
    <div className="at-toolbar" style={{ margin: 0 }}>
      <button type="button" className="at-link" onClick={() => setSelectedDirectoryCustomer(null)}>
        <ArrowLeft size={16} /> {t('customersPage.backToCustomers', 'Back to Customers')}
      </button>
      {(isOwner || adminCan('customers.edit') || adminCan('customers.delete') || adminCan('orders.create')) && (
        <div className="at-toolbar-right">
          {/* A lead shows only New order: Edit, Delete and Go with Existing Design are for customers. */}
          {!isLead(c) && (isOwner || adminCan('customers.edit')) && (
            <button type="button" className="btn-secondary" disabled={customerActionId === c.id} onClick={() => startEditCustomer(c)}>
              <Edit2 size={16} /> Edit
            </button>
          )}
          {!isLead(c) && (isOwner || adminCan('customers.delete')) && (
            <button type="button" className="btn-secondary at-btn-danger" disabled={customerActionId === c.id} onClick={() => handleDeleteCustomer(c)}>
              <Trash2 size={16} /> Delete
            </button>
          )}
          {(isOwner || adminCan('orders.create')) && (
            <>
              {!isLead(c) && (
                <button className="btn-secondary" style={{ color: 'var(--accent-text)', borderColor: 'var(--accent-border)', background: 'var(--surface-color)' }} onClick={goExisting}>
                  <Copy size={16} /> {t('customersPage.goExistingDesign', 'Go with Existing Design')}
                </button>
              )}
              <button className="btn-primary" onClick={() => handleSelectExistingCustomer(c)}>
                <Sparkles size={16} /> {t('customersPage.newOrder', 'New order')}
              </button>
            </>
          )}
        </div>
      )}
    </div>

    <div className="ui-card at-profile-head">
      <div className="at-profile-id">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <AvatarInitials name={`${c.first_name} ${c.last_name}`} size={96} tone="rose"
                          src={c.profile_photo ? resolveMediaUrl(c.profile_photo) : ''} />
          {/* Same people as the Edit button. */}
          {!isLead(c) && (isOwner || adminCan('customers.edit')) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <button type="button" className="btn-secondary at-btn-sm" disabled={customerPhotoBusy}
                      onClick={() => document.getElementById('cust-profile-photo').click()}>
                <Upload size={12} /> {customerPhotoBusy ? 'Saving…' : (c.profile_photo ? 'Change photo' : 'Add photo')}
              </button>
              <CameraButton label="Take photo" disabled={customerPhotoBusy}
                            onFiles={([f]) => uploadDirectoryCustomerPhoto(c, f)} />
              <input id="cust-profile-photo" type="file" accept="image/*" hidden aria-label="Customer photo"
                     onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; uploadDirectoryCustomerPhoto(c, f); }} />
            </div>
          )}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <h2 className="at-page-title" style={{ fontSize: 'var(--text-2xl)' }}>{c.first_name} {c.last_name}</h2>
            <TierBadge tier={customerTier(c)} />
          </div>
          {c.source && <div className="at-page-sub">{c.source}</div>}
          <div className="at-contact" style={{ fontSize: 'var(--text-sm)', marginTop: '12px' }}>
            <span><Phone size={14} /> {formatMobile(c.mobile_number)}</span>
            {c.email_address && <span><Mail size={14} /> {c.email_address}</span>}
            {(c.address || c.city_region) && (
              <span><MapPin size={14} /> {[c.address, c.city_region].filter(Boolean).join(', ')}</span>
            )}
          </div>
        </div>
      </div>
      <div className="at-profile-stats">
        <div className="at-profile-stat">
          <IconTile icon={CalendarDays} tone="blue" size={36} iconSize={16} />
          <div><div className="at-measure-label">{t('customersPage.customerSince', 'Customer since')}</div><div className="at-measure-value">{fmtDate(c.created_at)}</div></div>
        </div>
        <div className="at-profile-stat">
          <IconTile icon={ShoppingBag} tone="amber" size={36} iconSize={16} />
          <div><div className="at-measure-label">{t('customersPage.totalOrders', 'Total orders')}</div><div className="at-measure-value">{orderCount}</div></div>
        </div>
        <div className="at-profile-stat">
          <IconTile icon={Heart} tone="rose" size={36} iconSize={16} />
          <div><div className="at-measure-label">{t('customersPage.preference', 'Preference')}</div><div className="at-measure-value">{c.occasion || c.garment_type || '—'}</div></div>
        </div>
      </div>
    </div>

    <div className="responsive-profile-grid">
      <div className="at-stack">
        <SectionCard icon={Ruler} tone="amber" title={t('customersPage.measurementsTitle', 'Measurements')}
                     subtitle={parts.length > 0 ? t('customersPage.stitchingParts', 'Stitching: {parts}', { parts: parts.join(', ') }) : undefined}
                     action={allCustomerMeasurements.length > 0 ? () => setViewAllCustomerMeasurements(!viewAllCustomerMeasurements) : undefined}
                     actionLabel={viewAllCustomerMeasurements ? 'View less' : 'View all'}>
          {c.measurements && allCustomerMeasurements.length > 0 ? (
            <>
              <div className="at-measure-cols">
                {displayedMeasurements.map((mItem) => (
                  <div key={mItem.key} className="at-measure-row">
                    <span>{mItem.label}</span>
                    <strong>{mItem.value}</strong>
                  </div>
                ))}
                {!viewAllCustomerMeasurements && (
                  <div className="at-measure-row">
                    <span>{t('customersPage.occasionLabel', 'Occasion')}</span>
                    <strong>{c.occasion || '—'}</strong>
                  </div>
                )}
              </div>

              {!viewAllCustomerMeasurements && allCustomerMeasurements.length > displayedMeasurements.length && (
                <div style={{ marginTop: '14px', textAlign: 'right' }}>
                  <button
                    type="button"
                    className="at-link"
                    style={{ fontSize: 'var(--text-xs)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                    onClick={() => setViewAllCustomerMeasurements(true)}
                  >
                    View all {allCustomerMeasurements.length} measurements <ArrowRight size={13} />
                  </button>
                </div>
              )}

              {viewAllCustomerMeasurements && (
                <div style={{ marginTop: '14px', textAlign: 'right' }}>
                  <button
                    type="button"
                    className="at-link"
                    style={{ fontSize: 'var(--text-xs)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                    onClick={() => setViewAllCustomerMeasurements(false)}
                  >
                    View less
                  </button>
                </div>
              )}

              {c.measurement_history && c.measurement_history.length > 0 && (
                <div style={{ marginTop: 'var(--space-4)' }}>
                  <div className="ui-eyebrow" style={{ color: 'var(--accent-text)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: 'var(--space-3)' }}>
                    <History size={13} /> {t('customersPage.sizingHistory', 'Measurement history')}
                  </div>
                  <div className="at-stack" style={{ gap: 'var(--space-2)', maxHeight: '300px', overflowY: 'auto', paddingRight: '4px' }}>
                    {[...c.measurement_history].reverse().map((hist, idx, arr) => (
                      <div key={hist.id || idx} className="at-version">
                        <div className="at-version-head">
                          <strong style={{ color: 'var(--text-primary)' }}>Version {arr.length - idx}</strong>
                          <span style={{ color: 'var(--text-secondary)' }}>{fmtDateTime(hist.changed_at)}</span>
                        </div>
                        <div className="at-version-grid">
                          {/* The extra measurements ride in a nested object; spread
                              them into the row instead of printing "[object Object]". */}
                          {Object.entries({ ...hist, ...(hist.additional_measurements || {}) })
                            .filter(([k, v]) => !['id', 'changed_at', 'customer_id', 'additional_measurements', 'stitch_parts'].includes(k)
                              && v !== null && v !== undefined && typeof v !== 'object'
                              && String(v).trim() !== '' && String(v).trim() !== '—')
                            .map(([k, v]) => (
                              <span key={k}>{formatMeasurementLabel(k).replace(' Length', '')} <strong>{formatMeasurementValue(v)}</strong></span>
                            ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <p style={{ color: 'var(--text-muted)', margin: 0 }}>No measurements saved yet.</p>
          )}
        </SectionCard>

        <SectionCard icon={ShoppingBag} tone="amber" title={t('customersPage.orderHistory', 'Order History')}
                     action={orders.length > 0 ? () => setDashboardTab('orders') : undefined} actionLabel="View All">
          {directoryDetailLoading && !c.orders ? (
            <Loader section label="Loading order history…" />
          ) : orders.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', margin: 0 }}>{t('customersPage.noOrdersYet', 'No orders yet.')}</p>
          ) : orders.map(order => {

            const isOpen = expandedCustomerOrderId === order.id;
            const stages = order.stages || [];
            const done = stages.filter(st => st.status === 'COMPLETED').length;
            const current = stages.find(st => st.status === 'IN_PROGRESS');
            const toggle = () => setExpandedCustomerOrderId(isOpen ? null : order.id);
            return (
              <div key={order.id} className={`at-order-row${isOpen ? ' at-order-row--open' : ''}`}>
                <div
                  role="button"
                  tabIndex={0}
                  className="at-order-row-head"
                  onClick={toggle}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } }}
                >
                  <div className="at-thumb at-tile--amber">
                    {order.completed_garment_image ? <img src={order.completed_garment_image} alt="" /> : <Shirt size={18} />}
                  </div>
                  <div className="at-row-main">
                    <div className="at-row-title">Order {orderRef(order)}</div>
                    <div className="at-row-sub">
                      {order.garment_label || orderGarmentLabel(order)} · {order.tailor_name || 'Tailor not assigned'}
                      {stages.length > 0 ? ` · ${done}/${stages.length} stages${current ? ` · ${current.stage_name}` : ''}` : ''}
                    </div>
                  </div>
                  {order.order_status === 'Delivered' && (
                    <button type="button" className="btn-secondary at-btn-sm"
                            onClick={(e) => { e.stopPropagation(); setAlterationOrder(order); }}>
                      <Scissors size={12} /> Alteration
                    </button>
                  )}
                  <span className={`ui-badge ui-badge--${statusTone(order.order_status)}`}>{order.order_status}</span>
                  <span className="at-row-sub" style={{ whiteSpace: 'nowrap' }}>{fmtDate(order.order_date)}</span>
                  <strong className="at-num" style={{ color: 'var(--accent-text)' }}>{inr(order.total_amount)}</strong>
                  <ChevronRight size={16} style={{ transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', color: 'var(--text-muted)' }} />
                </div>

                {isOpen && (
                  <div className="at-order-row-body">
                    <StageTimeline
                      stages={stages}
                      onSelectStage={(stage) => openStageReview(order, stage)}
                    />
                    {stages.length > 0 && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '8px', marginTop: '12px' }}>
                        {stages.map(stage => (
                          <div key={stage.id || stage.stage_key} style={{ fontSize: 'var(--text-2xs)', padding: '8px 10px', borderRadius: 'var(--radius-sm)', background: 'var(--surface-2)', border: '1px solid var(--border-color)' }}>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{stage.stage_name}{stage.garment_name ? ` · ${stage.garment_name}` : ''}</div>
                            <div style={{ color: 'var(--text-muted)', marginTop: '2px' }}>
                              {STEP_LABEL[STEP_STATE(stage.status)].toLowerCase()}
                              {stage.assigned_to_name ? ` · ${stage.assigned_to_name}` : ''}
                            </div>
                            {stage.completed_at && <div style={{ color: 'var(--text-muted)' }}>{fmtDate(stage.completed_at)}</div>}
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: '12px' }}>
                      <span>Payment: <strong style={{ color: 'var(--text-primary)' }}>{order.price_pending ? 'Price pending' : order.payment_status}</strong></span>
                      <span>Delivery: <strong style={{ color: 'var(--text-primary)' }}>{order.delivery_method}</strong></span>
                      {order.estimated_delivery && (
                        <span>Expected: <strong style={{ color: 'var(--text-primary)' }}>{fmtDate(order.estimated_delivery)}</strong></span>
                      )}
                    </div>
                    {isOwner && (
                      <button type="button" className="btn-secondary at-btn-sm"
                              style={{ marginTop: '12px', color: 'var(--accent-text)', borderColor: 'var(--accent-border)', background: 'var(--accent-color)' }}
                              onClick={(e) => { e.stopPropagation(); reorder(order); }}>
                        <Copy size={12} /> Reorder Style
                      </button>
                    )}
                    {/* Renders only once the order is Delivered: the
                        way to take a garment back for alteration. */}
                    <OrderAlterations
                      order={order}
                      customerId={c.id}
                      currentUser={currentUser}
                      onOpenAlteration={openAlteration}
                      compact
                    />
                  </div>
                )}
              </div>
            );
          })}
        </SectionCard>
        {alterationOrder && (
          <RequestAlterationModal
            order={alterationOrder}
            customerId={c.id}
            onClose={() => setAlterationOrder(null)}
            onCreated={(created) => { setAlterationOrder(null); rememberAlteration(created); openAlteration(created.id); }}
          />
        )}
      </div>

      <div className="at-stack">
        <StyleProfileCard customer={c} />

        <CustomerReferrals
          customer={c}
          canAdd={isOwner || adminCan('customers.edit')}
          onOpenCustomer={(id) => openDirectoryCustomer({ id })}
          onCustomerAdded={refreshCustomerBook}
        />

        <SectionCard icon={ImageIcon} tone="green" title="Saved Designs & Inspiration">
          {!c.design_preferences || c.design_preferences.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', margin: 0 }}>No saved designs or reference images.</p>
          ) : (
            <div className="at-stack">
              {c.design_preferences.map((pref, i) => (
                <div key={pref.id || i} className="at-form-section" style={{ borderColor: pref.is_approved ? 'var(--success-color)' : undefined, gap: 'var(--space-3)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span className="ui-eyebrow">{pref.source_display || 'Boutique catalogue'}</span>
                      {pref.is_approved && <span className="ui-badge ui-badge--success">Approved for production</span>}
                    </div>
                    {!pref.is_approved && pref.id && (
                      <button type="button" className="btn-secondary at-btn-sm"
                              disabled={approvingDesignId === pref.id}
                              onClick={() => handleApproveDesign(pref.id, pref.reference_images?.[0])}>
                        {approvingDesignId === pref.id ? 'Approving…' : 'Approve for production'}
                      </button>
                    )}
                  </div>
                  {pref.notes && <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', margin: 0 }}>{pref.notes}</p>}
                  {pref.reference_images?.length > 0 && (() => {

                    const photo = (url, j) => (
                      <span key={`${i}-${j}`} className="at-photo" style={{ width: 96, height: 120, borderColor: pref.approved_image === url ? 'var(--success-color)' : undefined, borderWidth: pref.approved_image === url ? 2 : 1 }}>
                        <img src={url} alt="Design reference" />
                      </span>
                    );
                    const groups = [];
                    pref.reference_images.forEach((url) => {
                      const label = pref.reference_parts?.[url]?.label || '';
                      const group = groups.find(g => g.label === label) || (groups.push({ label, urls: [] }), groups[groups.length - 1]);
                      group.urls.push(url);
                    });
                    if (groups.length === 1 && !groups[0].label) {
                      return <div className="at-photos">{pref.reference_images.map(photo)}</div>;
                    }
                    return groups.map(g => (
                      <div key={g.label || 'whole'}>
                        <div className="ui-eyebrow" style={{ marginBottom: '6px' }}>{g.label || 'Whole garment'} · {g.urls.length}</div>
                        <div className="at-photos">{g.urls.map(photo)}</div>
                      </div>
                    ));
                  })()}
                  {pref.reference_links?.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      {pref.reference_links.map((link, j) => (
                        <a key={j} href={link} target="_blank" rel="noreferrer" className="at-link" style={{ fontSize: 'var(--text-xs)', overflowWrap: 'anywhere', whiteSpace: 'normal' }}>
                          {link}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  </div>
  );
}
