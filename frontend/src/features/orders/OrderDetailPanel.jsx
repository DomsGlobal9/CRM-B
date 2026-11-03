import { AlertTriangle, ArrowLeft, ArrowRight, Calendar, Check, CheckCircle2, ChevronDown, ChevronRight, ClipboardList, Clock, Eye, IndianRupee, Layers, PenTool, Phone, Scissors, User, X } from 'lucide-react';
import React from 'react';
import { formatDate as fmtDate, inr, orderGarmentNames, orderRef } from '../../services/format';
import { orderBucket, stageNow, stageWho } from './stages';
import { api } from '../../services/api';
import CustomerMessageQueue from './CustomerMessageQueue';
import { hasMaterials, orderStatusTone } from './orderHelpers';
import { SUPERVISOR_ROLES, isProductionStaff } from '../../constants/roles';
import { IconTile } from '../../components/ui/Atelier';
import { LIMITS, displayMobile } from '../../services/validate';
import { OrderTaskTable } from './OrderTaskTable';
import { MaterialsChecklist } from './MaterialsChecklist';
import OrderAlterations from '../alterations/OrderAlterations';
import { SpeakButton } from '../../components/ui/VoiceTextarea';
import { maySignOff } from '../../services/signOff';
import { OrderNotesCard } from './OrderNotesCard';
import { OrderGarmentsCard } from './OrderGarmentsCard';
import OrderPricesCard from './OrderPricesCard';
import { GarmentGallery } from './GarmentGallery';
import { useLanguage } from '../../i18n/LanguageContext.jsx';
import { useApp } from '../../context/AppContext';

/**
 * One order on its own page, opened from Orders or Workshop: who it is for,
 * its garments and designs, the journey through the workroom, notes, prices,
 * photos, materials, payments and alterations.
 */
export default function OrderDetailPanel({ assignOrderDesigner, assigningWorkflowOrderId, completingAllOrderId, designerInCharge, designers, handleMarkMessageSent, handleRetryMessage, openAlteration, openDirectoryCustomer, openGarmentJob, openOrder, openSendToWorkshop, openStageReview, queuedMessages, savingVerificationOrderId, sendBusy, sendErrorsOrderId, setCompletingAllOrderId, setOpenGarmentJob, setOpenOrdersRowId, setReviewView, setSavingVerificationOrderId, setSendErrorsOrderId }) {
  const { t } = useLanguage();
  const { dashboardTab, currentUser, adminCan, refresh: fetchDashboardAndConfig, setDashboardTab } = useApp();
                const order = openOrder;
                const stages = order.stages || [];
                const focusJob = (order.garment_jobs || []).find(j => j.id === openGarmentJob) || null;
                const focusNo = focusJob ? order.garment_jobs.indexOf(focusJob) + 1 : 0;
                const designJobs = focusJob ? [focusJob] : (order.garment_jobs || []);
                const designerWho = designerInCharge(designJobs);
                const allDone = stages.length > 0 && stages.every(st => st.status === 'COMPLETED' || st.status === 'SKIPPED');
                const verification = order.master_verification || {};
                const verifyTotal = 6 + (orderGarmentNames(order).includes('Saree') ? 1 : 0);
                const verified = Object.values(verification).filter(Boolean).length;
                return (
                  <div className="od-page">
                    <div className="od-topbar">
                      <button type="button" className="btn-link od-back" onClick={() => { setOpenOrdersRowId(null); setOpenGarmentJob(null); }}>
                        <ArrowLeft size={16} /> {dashboardTab === 'workshop' ? t('ordersPage.backToWorkshop', 'Back to workshop') : t('ordersPage.backToOrders', 'Back to orders')}
                      </button>
                      {/* The one thing to do next lives up here: send it to the
                          workshop, or (the owner's shortcut) close every stage. */}
                      <div className="od-topbar-actions">
                        {/* Customer messages that need staff -- WhatsApp could not send
                            them, or nothing sends them automatically: opened up here
                            on a tap (they used to sit at the foot of the page). */}
                        {(() => {
                          const pending = queuedMessages.filter(m => m.order === order.id && (m.status === 'FAILED' || m.status === 'QUEUED'));
                          if (!pending.length) return null;
                          const allFailed = pending.every(m => m.status === 'FAILED');
                          const open = sendErrorsOrderId === order.id;
                          return (
                            <button type="button" className={`od-send-errors-btn${open ? ' is-open' : ''}${allFailed ? '' : ' od-send-errors-btn--queued'}`} aria-expanded={open}
                                    onClick={() => setSendErrorsOrderId(open ? null : order.id)}>
                              <AlertTriangle size={16} />
                              {allFailed
                                ? (pending.length === 1 ? t('ordersPage.oneNotSent', '1 WhatsApp message not sent') : t('ordersPage.manyNotSent', '{n} WhatsApp messages not sent', { n: pending.length }))
                                : (pending.length === 1 ? t('ordersPage.oneToSend', '1 customer message to send') : t('ordersPage.manyToSend', '{n} customer messages to send', { n: pending.length }))}
                              <ChevronDown size={16} className="od-send-errors-chevron" />
                            </button>
                          );
                        })()}
                        {orderBucket(order) === 'new' && (['Owner', 'Master'].includes(currentUser.role) || adminCan('workshop.assign') || adminCan('workshop.move')) && (
                          <button type="button" className="btn-primary od-send-btn" disabled={sendBusy}
                                  onClick={() => openSendToWorkshop(order)}>
                            <Scissors size={16} /> {t('ordersPage.sendToWorkshop', 'Send to workshop')}
                          </button>
                        )}
                        {currentUser.role === 'Owner' && stages.length > 0 && !allDone && orderBucket(order) !== 'new' && (
                          <button type="button" className="btn-primary"
                                  disabled={completingAllOrderId === order.id}
                                  onClick={async () => {
                                    if (!window.confirm((order.payment_status === 'Paid' ? '' : `Payment is not complete: ${inr(order.amount_paid)} of ${inr(order.total_amount)} received.

  `) + 'Complete every remaining stage and mark this order Delivered?')) return;
                                    setCompletingAllOrderId(order.id);
                                    try { await api.completeAllStages(order.id); await fetchDashboardAndConfig(); }
                                    catch (err) { alert(err.message); }
                                    finally { setCompletingAllOrderId(null); }
                                  }}>
                            <CheckCircle2 size={16} /> {completingAllOrderId === order.id ? t('ordersPage.completing', 'Completing…') : t('ordersPage.markComplete', 'Mark as complete')}
                          </button>
                        )}
                      </div>
                    </div>

                    {sendErrorsOrderId === order.id && queuedMessages.some(m => m.order === order.id && (m.status === 'FAILED' || m.status === 'QUEUED')) && (
                      <div className="od-send-errors">
                        <CustomerMessageQueue
                          messages={queuedMessages.filter(m => m.order === order.id)}
                          onMarkSent={handleMarkMessageSent}
                          onRetry={handleRetryMessage}
                        />
                      </div>
                    )}

                    <header className="od-head">
                      <div className="od-head-left">
                        <div className="od-title-row">
                          <h1 className="od-title">Order {orderRef(order)}{focusJob ? `-${focusNo} · ${focusJob.display_name || focusJob.template_name || t('ordersPage.garment', 'Garment')}` : ''}</h1>
                          {/* Where it stands, in the workroom's words: the stages
                              move the order along, so nothing to pick here. */}
                          {(() => {
                            const bucket = orderBucket(order);
                            const text = bucket === 'done' ? t(`status.${order.order_status}`, order.order_status)
                              : bucket === 'new' ? t('ordersPage.notSentYet', 'Not sent yet')
                              : (stageNow(order, focusJob?.id)?.name || t('ordersPage.tabInProgress', 'In progress'));
                            return (
                              <span className={`od-status od-status--${orderStatusTone(order.order_status)}`} style={{ padding: '0 14px', fontWeight: 600, fontSize: 'var(--text-sm)' }}>
                                {text}
                              </span>
                            );
                          })()}
                          {verified > 0 && (
                            <span className="ui-badge ui-badge--success">
                              👑 {t('ordersPage.masterVerified', 'Master Verified:')} {verified}/{verifyTotal} ({Math.round((verified / verifyTotal) * 100)}%)
                            </span>
                          )}
                          {order.flow && order.flow !== 'legacy' && (() => {
                            const canSwitch = order.flow !== 'alteration' && (currentUser?.role === 'Owner' || SUPERVISOR_ROLES.includes(currentUser?.role) || adminCan('workshop.move'))
                              && !(order.stages || []).some(st => st.stage_key !== 'created' && st.status !== 'NOT_STARTED');
                            const label = order.flow === 'alteration' ? t('ordersPage.flowAlteration', 'Alteration')
                              : order.flow === 'maggam' ? t('ordersPage.flowMaggam', 'Maggam order') : t('ordersPage.flowStitching', 'Stitching order');
                            return canSwitch ? (
                              <label className={`ui-badge ${order.flow === 'maggam' ? 'ui-badge--warning' : 'ui-badge--neutral'}`} style={{ cursor: 'pointer', gap: '4px' }} title="Change how this order is made">
                                <select value={order.flow} aria-label="Order path"
                                        style={{ background: 'transparent', border: 'none', font: 'inherit', color: 'inherit', cursor: 'pointer' }}
                                        onChange={async (e) => {
                                          try { await api.setOrderFlow(order.id, e.target.value); fetchDashboardAndConfig(); }
                                          catch (err) { alert(err.message); }
                                        }}>
                                  <option value="stitching">{t('ordersPage.flowStitching', 'Stitching order')}</option>
                                  <option value="maggam">{t('ordersPage.flowMaggam', 'Maggam order')}</option>
                                </select>
                              </label>
                            ) : (
                              <span className={`ui-badge ${order.flow === 'maggam' ? 'ui-badge--warning' : 'ui-badge--neutral'}`}>{label}</span>
                            );
                          })()}
                        </div>
                        <div className="od-meta">
                          <span><User size={14} />{t('ordersPage.client', 'Customer:')} <strong>{order.customer_name}</strong></span>
                          <span className="od-meta-sep" aria-hidden="true">·</span>
                          <span><Calendar size={14} />{t('ordersPage.created', 'Taken on:')} {fmtDate(order.order_date)}</span>
                          {order.flow === 'alteration' && (
                            <>
                              <span className="od-meta-sep" aria-hidden="true">·</span>
                              <span><Scissors size={14} />
                                {order.alteration_of ? (
                                  <>{t('ordersPage.alterationOf', 'Alteration of')} <button type="button" className="at-link" onClick={() => setOpenOrdersRowId(order.alteration_of)}>{order.alteration_of_reference}</button></>
                                ) : t('ordersPage.outsideGarment', 'Garment from outside')}
                                {order.alteration_garment_name ? ` · ${order.alteration_garment_name}` : ''}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <p className="od-quote">“From fabric to finesse, we keep you in the loop.”</p>
                    </header>

                    {/* The four facts to scan: who is on it, what it is worth, when it is due. */}
                    <section className="od-facts">
                      <div className="od-fact">
                        <IconTile icon={PenTool} tone="green" size={44} iconSize={20} />
                        <div>
                          <div className="od-fact-label">{t('ordersPage.designerInCharge', 'Designer in charge')}</div>
                          {(currentUser?.role === 'Owner' || adminCan('design.assign')) && designJobs.length > 0 ? (
                            <select className="od-fact-select" value={designerWho.id}
                                    aria-label={t('ordersPage.designerInCharge', 'Designer in charge')}
                                    disabled={assigningWorkflowOrderId === order.id}
                                    onChange={(e) => assignOrderDesigner(order, designJobs, e.target.value)}>
                              <option value="" disabled>
                                {designerWho.mixed ? t('ordersPage.severalDesigners', 'Several designers')
                                  : t('ordersPage.unassigned', 'Unassigned')}
                              </option>
                              {designerWho.id && !designers.some(d => String(d.id) === String(designerWho.id)) && (
                                <option value={designerWho.id}>{designerWho.name}</option>
                              )}
                              {designers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                            </select>
                          ) : (
                            <div className={`od-fact-value${designerWho.name || designerWho.mixed ? '' : ' od-fact-value--empty'}`}>
                              {designerWho.mixed ? t('ordersPage.severalDesigners', 'Several designers')
                                : (designerWho.name || t('ordersPage.unassigned', 'Unassigned'))}
                            </div>
                          )}
                        </div>
                      </div>
                      {!isProductionStaff(currentUser.role) && (
                        <div className="od-fact">
                          <IconTile icon={IndianRupee} tone="green" size={44} iconSize={20} />
                          <div>
                            <div className="od-fact-label">{t('ordersPage.totalValue', 'Total Value')}</div>
                            <div className="od-fact-value">{inr(order.total_amount)}</div>
                          </div>
                        </div>
                      )}
                      <div className="od-fact">
                        <IconTile icon={Calendar} tone="amber" size={44} iconSize={20} />
                        <div>
                          <div className="od-fact-label">{t('ordersPage.estDelivery', 'Est. Delivery')}</div>
                          <div className="od-fact-value">{order.estimated_delivery ? fmtDate(order.estimated_delivery) : t('ordersPage.tbd', 'TBD')}</div>
                        </div>
                      </div>
                      {/* Who the order is for: name and mobile, and the way to their page. */}
                      <div className="od-fact od-fact--customer">
                        <IconTile icon={User} tone="green" size={44} iconSize={20} />
                        <div className="od-fact-body">
                          <div className="od-fact-label">{t('ordersPage.customerDetails', 'Customer details')}</div>
                          <div className="od-fact-value" title={order.customer_name}>{order.customer_name}</div>
                          {order.customer_mobile && (
                            <div className="od-fact-sub"><Phone size={12} aria-hidden="true" /> {displayMobile(order.customer_mobile)}</div>
                          )}
                          <button type="button" className="btn-link od-fact-link"
                                  onClick={() => {
                                    setDashboardTab('customers');
                                    openDirectoryCustomer({ id: order.customer, first_name: order.customer_name, last_name: '' });
                                  }}>
                            {t('ordersPage.viewCustomer', 'View customer')} <ArrowRight size={13} />
                          </button>
                        </div>
                      </div>
                    </section>

                    {/* Where the order stands in the workroom; a step opens its panel. */}
                    {/* Previous / current / next, each a door into that stage. */}
                    {orderBucket(order) === 'workshop' && (() => {
                      const now = stageNow(order, focusJob?.id);
                      if (!now) return null;

                      const jobs = order.garment_jobs || [];
                      const gi = jobs.findIndex(j => j.id === now.current.garment_job);
                      const garmentTag = jobs.length > 1 && gi >= 0 ? `${gi + 1}. ${now.current.garment_name || jobs[gi].template_name || ''}` : '';
                      const cols = [
                        { key: 'prev', label: t('ordersPage.previousStage', 'Previous stage'), st: now.prev, Icon: Check,
                          sub: now.prev?.completed_at ? `${t('ordersPage.completedOn', 'Completed on')} ${fmtDate(now.prev.completed_at)}` : '' },
                        { key: 'now', label: t('ordersPage.currentStage', 'Current stage'), st: now.current, Icon: Scissors,
                          sub: [garmentTag, now.current.started_at && `${t('ordersPage.startedOn', 'Started on')} ${fmtDate(now.current.started_at)}`,
                                stageWho(now.current), now.current.status === 'PENDING_VERIFICATION' && t('ordersPage.waitingForCheck', 'waiting for check')]
                            .filter(Boolean).join(' · ') },
                        { key: 'next', label: t('ordersPage.nextStage', 'Next stage'), st: now.next, Icon: Clock,
                          sub: now.next ? t('ordersPage.startsAfter', 'Starts after {stage}', { stage: now.name.toLowerCase() }) : '' },
                      ];
                      return (
                        <section className="at-section od-strip" aria-label={t('ordersPage.whereItStands', 'Where it stands')}>
                          {cols.map(({ key, label, st, Icon, sub }, idx) => (
                            <React.Fragment key={key}>
                              {idx > 0 && <span className="od-strip-arrow" aria-hidden="true"><ChevronRight size={18} /></span>}
                              <div className={`od-strip-col od-strip-col--${key}`}>
                                <span className="ui-eyebrow">{label}</span>
                                <button type="button" className="od-strip-pill" disabled={!st} onClick={() => st && openStageReview(order, st)}>
                                  <span className="od-strip-icon"><Icon size={16} /></span>
                                  <span className="od-strip-name">{st ? st.stage_name : '—'}</span>
                                </button>
                                {sub && <span className="od-strip-sub">{sub}</span>}
                              </div>
                            </React.Fragment>
                          ))}
                        </section>
                      );
                    })()}

                    <div className="od-columns">
                      <div className="od-main">
                    <section className="at-section od-journey">
                          <div className="od-section-head">
                            <IconTile icon={ClipboardList} tone="amber" size={40} iconSize={18} />
                            <div className="od-section-title od-section-title--stack">
                              <h3>{t('ordersPage.orderJourney', 'Order journey & tasks')}</h3>
                              <span className="od-section-sub">{t('ordersPage.orderJourneySub', 'Track and manage tasks for this order')}</span>
                            </div>
                          </div>
                          <OrderTaskTable key={`${order.id}-${focusJob?.id || ''}`} focus={focusJob?.id} stages={stages} jobs={order.garment_jobs || []} onSelectStage={(stage) => openStageReview(order, stage)} />
                        </section>

                        {/* Raw materials checklist; nothing to gather, no section. */}
                        {hasMaterials(order) && (
                        <section className="at-section od-materials">
                          <div className="od-section-head">
                            <IconTile icon={Layers} tone="neutral" size={40} iconSize={18} />
                            <div className="od-section-title od-section-title--stack">
                              <h3>{t('ordersPage.rawMaterials', 'Raw materials checklist')}</h3>
                              <span className="od-section-sub">{t('ordersPage.rawMaterialsSub', 'Track the materials used for this order.')}</span>
                            </div>
                          </div>
                          {(order.purchases || []).filter(pu => pu.status !== 'CANCELLED').length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
                              {(order.purchases || []).filter(pu => pu.status !== 'CANCELLED').map(pu => (
                                <div key={pu.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', padding: '8px 12px', borderRadius: 'var(--radius-md)', background: 'var(--surface-2)', fontSize: '13px' }}>
                                  <span>🛒 <strong>{pu.name}</strong>{pu.garment_name ? ` · ${pu.garment_name}` : ''}</span>
                                  <span style={{ color: 'var(--text-secondary)' }}>
                                    {Number(pu.quantity)} {pu.unit_display} · {pu.actual_cost != null ? `${inr(pu.actual_cost)} paid` : `${inr(pu.estimated_cost)} estimated`}
                                  </span>
                                  <span className={`ui-badge ui-badge--${{ TO_PURCHASE: 'warning', PURCHASED: 'info', RECEIVED: 'success' }[pu.status] || 'neutral'}`} style={{ marginLeft: 'auto' }}>
                                    {pu.status === 'TO_PURCHASE' ? 'Need to buy' : pu.status_display}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                          <MaterialsChecklist orderId={order.id} role={currentUser.role} handed={adminCan('workshop.materials')} />
                        </section>
                        )}

                        <div className="od-extra">
                            {/* Post-delivery alterations. Shown only once the
                                order is Delivered -- before that a fitting
                                problem is production's to fix, not a new job. */}
                            <OrderAlterations
                              order={order}
                              customerId={order.customer}
                              currentUser={currentUser}
                              onOpenAlteration={openAlteration}
                            />

                            {/* Tailor completion report */}
                            {(order.tailor_comments || order.completed_garment_image) && (
                              <div style={{ background: 'var(--accent-color)', border: '1px solid var(--accent-border)',
                                   borderRadius: 'var(--radius-md)', padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                                <div className="ui-eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', color: 'var(--accent-text)' }}>
                                  <Scissors size={13} /> Stitching completion report
                                </div>
                                {order.tailor_comments && (
                                  <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', margin: 0, fontStyle: 'italic' }}>
                                    "{order.tailor_comments}"<SpeakButton text={order.tailor_comments} />
                                  </p>
                                )}
                                {(() => {
                                  const stitching = (order.stages || []).find(st => st.stage_key === 'stitching_in_progress');
                                  const photos = stitching?.attachments?.length ? stitching.attachments
                                    : (order.completed_garment_image ? [order.completed_garment_image] : []);
                                  const reviews = stitching?.attachment_reviews || {};
                                  const canReview = ((currentUser?.role === 'Owner' || SUPERVISOR_ROLES.includes(currentUser?.role))
                                    && (stitching?.status !== 'PENDING_VERIFICATION' || maySignOff(currentUser?.role, stitching)))
                                    || adminCan('workshop.review');
                                  const items = photos.map((u, i) => ({ image_url: u, label: `Photo ${i + 1}` }));
                                  const reject = async (url) => {
                                    const remark = window.prompt('What is wrong with this photo? The tailor reads this.');
                                    if (remark === null) return;
                                    if (!remark.trim()) { alert('A remark is required to reject a photo.'); return; }
                                    try { await api.reviewStagePhoto(order.id, 'stitching_in_progress', url, remark.trim().slice(0, LIMITS.reason), 'REJECTED', stitching?.garment_job || null); fetchDashboardAndConfig(); }
                                    catch (err) { alert(err.message); }
                                  };
                                  const clear = async (url) => {
                                    try { await api.reviewStagePhoto(order.id, 'stitching_in_progress', url, '', 'CLEAR', stitching?.garment_job || null); fetchDashboardAndConfig(); }
                                    catch (err) { alert(err.message); }
                                  };
                                  return photos.length > 0 && (
                                    <div style={{ marginTop: '4px' }}>
                                      <span className="ui-eyebrow" style={{ display: 'block', marginBottom: '6px' }}>
                                        Garment photo{photos.length === 1 ? '' : 's'} · {photos.length}
                                      </span>
                                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                                        {photos.map((url, i) => {
                                          const verdict = reviews[url];
                                          return (
                                            <div key={url} style={{ width: '120px' }}>
                                              <div style={{ position: 'relative' }}>
                                                <img src={url} alt="" style={{ width: '120px', height: '120px', objectFit: 'cover', borderRadius: 'var(--radius-md)', display: 'block',
                                                                                border: verdict ? '2px solid var(--danger-color)' : '1px solid var(--border-color)',
                                                                                opacity: verdict ? 0.7 : 1 }} />
                                                <button type="button" className="btn-secondary at-btn-sm" title="View"
                                                        style={{ position: 'absolute', top: '6px', right: '6px', minHeight: '26px', padding: '0 8px' }}
                                                        onClick={() => setReviewView({ items, index: i })}>
                                                  <Eye size={12} /> View
                                                </button>
                                                {verdict && (
                                                  <span style={{ position: 'absolute', left: '6px', bottom: '6px', fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '10px',
                                                                 background: 'var(--danger-color)', color: '#fff' }}>Rejected</span>
                                                )}
                                              </div>
                                              {verdict && (
                                                <div style={{ fontSize: '11px', color: 'var(--danger-color)', marginTop: '4px', lineHeight: 1.3 }}>{verdict.remark}</div>
                                              )}
                                              {canReview && (
                                                verdict
                                                  ? <button type="button" className="btn-link" style={{ fontSize: '11px', padding: 0, minHeight: '24px' }} onClick={() => clear(url)}>Undo rejection</button>
                                                  : <button type="button" className="btn-link" style={{ fontSize: '11px', padding: 0, minHeight: '24px', color: 'var(--danger-color)' }} onClick={() => reject(url)}>
                                                      <X size={11} /> Reject photo
                                                    </button>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  );
                                })()}
                              </div>
                            )}
                        </div>
                        {/* Special instructions: at the foot of the main column. */}
                        <OrderNotesCard key={order.id} order={order} canEdit={!isProductionStaff(currentUser.role)} onSaved={fetchDashboardAndConfig} />
                      </div>

                      <aside className="od-side">
                        <OrderGarmentsCard order={order} focus={focusJob?.id} onSelectStage={(stage) => openStageReview(order, stage)} />
                        {(!currentUser?.role || ['Owner', 'Master'].includes(currentUser.role))
                          && order.kind !== 'internal' && order.flow !== 'alteration' && (order.garment_jobs || []).length > 0 && (
                          <OrderPricesCard key={`${order.id}-${order.total_amount}-${order.price_pending}`} order={order} onSaved={fetchDashboardAndConfig} />
                        )}
                        <GarmentGallery order={order} onChanged={fetchDashboardAndConfig} role={currentUser?.role} />
                        {/* The Master's checklist, the handover and the tip sit under the
                            notes in the side column, so the two columns share the page. */}
                        <div className="od-side-extra">
                          {/* Master verification checklist */}
                          {currentUser.role === 'Master' && (
                            <div style={{ padding: 'var(--space-4)', background: 'var(--accent-color)',
                                 border: '1px solid var(--accent-border)', borderRadius: 'var(--radius-md)', textAlign: 'left' }}>
                              <div className="ui-eyebrow" style={{ marginBottom: 'var(--space-3)', color: 'var(--accent-text)' }}>👑 Master production verification</div>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-2) var(--space-4)' }}>
                                {[
                                  { key: 'dress_cutting', label: 'Dress & Pattern Cutting' },
                                  { key: 'thread', label: 'Matching Thread & Accents' },
                                  { key: 'hemming', label: 'Hemming & Seam Finishes' },
                                  ...(order.customer_garment_type === 'Saree' ? [{ key: 'fall_pico', label: 'Fall & Pico / Peack' }] : []),
                                  { key: 'hook_buttons', label: 'Hook or Buttons Closure' },
                                  { key: 'pressing', label: 'Garment Steam Pressing' },
                                  { key: 'dispatch_trial', label: 'Dispatch or Fit Trial Ready' }
                                ].map(item => {
                                  const isChecked = order.master_verification?.[item.key] || false;
                                  return (
                                    <label key={item.key} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--text-sm)', cursor: 'pointer' }}>
                                      <input
                                        type="checkbox"
                                        checked={isChecked}
                                        disabled={savingVerificationOrderId === order.id}
                                        onChange={async (e) => {
                                          if (savingVerificationOrderId) return;
                                          const updatedVerification = { ...(order.master_verification || {}), [item.key]: e.target.checked };
                                          setSavingVerificationOrderId(order.id);
                                          try {
                                            await api.saveMasterVerification(order.id, updatedVerification);
                                            fetchDashboardAndConfig();
                                          } catch (err) {
                                            alert("Failed to update verification check: " + err.message);
                                          } finally {
                                            setSavingVerificationOrderId(null);
                                          }
                                        }}
                                      />
                                      <span style={{ textDecoration: isChecked ? 'line-through' : 'none', color: isChecked ? 'var(--text-muted)' : 'var(--text-primary)' }}>
                                        {item.label}
                                      </span>
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                        </div>
                      </aside>
                    </div>
                  </div>
                );
}
