import { AlertTriangle, Calendar, Check, CheckCircle2, Clock, Eye, FileText, History, Layers, MessageSquare, PackageCheck, Play, RefreshCw, Scissors, Shirt, Trash2, User, X } from 'lucide-react';
import React from 'react';
import { SUPERVISOR_ROLES, isProductionStaff, userIsOwner } from '../../constants/roles';
import { maySignOff, submitsForSignOff, submittedByMaster } from './signOff';
import { formatDate as fmtDate, formatDateTime as fmtDateTime, inr, orderGarmentLabel, orderRef } from '../../utils/format';
import { api } from '../../api';
import { STEP_LABEL, STEP_STATE, STEP_TONE } from './stages';
import { Dropzone, Field, FormModal, FormSection, InfoNote, PhotoTile } from '../../components/ui/Atelier';
import { LIMITS, imageFilesError } from '../../utils/validate';
import OrderGarmentBrief from '../catalog/OrderGarmentBrief';
import { SpeakButton, VoiceNotePlayer, VoiceRecorder } from '../../components/ui/VoiceTextarea';
import { voiceNoteList } from '../../components/ui/voiceNotes';
import GarmentSelectionsReview from '../catalog/GarmentSelectionsReview';
import { CuttingUsage } from './CuttingUsage';
import { DeliveryCard } from './DeliveryCard';
import StageParts from './StageParts';
import { useLanguage } from '../../i18n/LanguageContext.jsx';
import { useApp } from '../../context/AppContext';

// A Tailor stitches -- new garments and alterations; Hemming & finishing is
// the Hemming & Pressing Staff's (crm_api 0083_tailor_off_finishing).
const TAILOR_STEPS = ['stitching_in_progress', 'alteration_work'];

/**
 * One stage of one order, opened from its journey: what the stage is for,
 * what is being made, the materials cut, the photos and voice notes, and the
 * actions that move it on (start, hand over, submit, approve, send back).
 */
export default function StageReviewModal({ activeReviewOrder, activeReviewStage, assigningStageKey, eligibleStaffForStage, fabricTaxonomy, handleAssignStage, openGarmentJob, reversalBusy, selectedStageObj, setActiveReviewOrder, setActiveReviewStage, setReversalPrompt, setReversalReason, setReviewView, setSelectedStageObj, setStageReviewComments, setStageReviewImages, setStageReviewRecording, setStageTransitionBusy, stageReviewComments, stageReviewImages, stageReviewRecording, stageTransitionBusy }) {
  const { t } = useLanguage();
  const { currentUser, boutiqueSettings, refresh: fetchDashboardAndConfig } = useApp();
          const stage = selectedStageObj;
          const closeStage = () => {
            setActiveReviewStage(null);
            setActiveReviewOrder(null);
            setSelectedStageObj(null);
          };
          const isSupervisor = userIsOwner(currentUser)
            || SUPERVISOR_ROLES.includes(currentUser.role);
          // Whose work this is decides whether Done completes it or sends it
          // for checking (features/orders/signOff.js; the server holds the same rule).
          // A supervisor's Done is recorded for the stage's assignee, below.
          const stageRoles = (boutiqueSettings?.workflow_config || []).find((s) => s.key === stage?.stage_key)?.roles || [];
          const workerRole = isSupervisor && stage?.assigned_to ? stage.assigned_to_role : currentUser.role;
          const submits = !!stage && submitsForSignOff(currentUser.role, workerRole, stage.stage_key, stageRoles);
          const canSignOff = !!stage && maySignOff(currentUser.role, stage);
          const checkers = stage && submittedByMaster(stage) ? 'The Owner or Designer' : 'The owner or Master';
          const transition = async (status, okMessage, comments = stageReviewComments, sentVoiceNote = null, clearVoiceNote = false) => {
            if (stageTransitionBusy) return;
            if (status === 'COMPLETED' && stage.stage_key === 'payment' && activeReviewOrder.payment_status !== 'Paid') {
              const paid = Number(activeReviewOrder.amount_paid || 0), total = Number(activeReviewOrder.total_amount || 0);
              if (!window.confirm(`Payment is not complete: ${inr(paid)} of ${inr(total)} received (${inr(total - paid)} outstanding).

  Complete the Payment stage with this partial payment?`)) return;
            }
            if (stageReviewRecording) { alert(t('ordersPage.stopRecordingFirst', 'Stop the recording first, then save.')); return; }
            setStageTransitionBusy(true);
            try {
              const voiceNote = sentVoiceNote;
              await api.transitionStage(
                activeReviewOrder.id,
                stage.stage_key,
                status,
                comments,
                stageReviewImages,
                // Whoever holds the stage is who did it; no assignee, the server records the caller.
                stage.assigned_to || null,
                voiceNote,
                clearVoiceNote,
                stage.garment_job || null
              );
              alert(okMessage);
              closeStage();
              fetchDashboardAndConfig();
            } catch (err) {
              alert("Failed to transition: " + err.message);
            } finally {
              setStageTransitionBusy(false);
            }
          };
          const tone = STEP_TONE[STEP_STATE(stage?.status)];
          const allJobs = activeReviewOrder.garment_jobs || [];
          const onlyJob = stage?.garment_job || openGarmentJob;
          const jobs = allJobs.some(j => j.id === onlyJob) ? allJobs.filter(j => j.id === onlyJob) : allJobs;
          const single = allJobs.length > 1 && jobs.length === 1 ? jobs[0] : null;
          const answered = (obj) => Object.values(obj || {}).filter(v => v !== '' && v !== null && v !== undefined).length;
          const detailCount = jobs.reduce((n, j) => n + answered(j.spec) + answered(j.measurements), 0);
          const mins = Math.floor((stage?.duration_seconds || 0) / 60);
          const hrs = Math.floor(mins / 60);
          const duration = hrs > 0 ? `${hrs}h ${mins % 60}m` : `${mins}m`;
          const settled = stage && (stage.status === 'COMPLETED' || stage.status === 'SKIPPED');
          return (
            <FormModal
              icon={Scissors} tone="green" width="1000px" zIndex={1100}
              title={stage ? `Production Stage: ${stage.stage_name}${stage.garment_name ? ` · ${stage.garment_name}` : ''}` : `Stage Review: ${activeReviewStage}`}
              subtitle={`Order ID: ${orderRef(activeReviewOrder)}${single ? `-${allJobs.indexOf(single) + 1}` : ''}${activeReviewOrder.customer_name ? ` · ${activeReviewOrder.customer_name}` : ''}`}
              onClose={closeStage}
              footer={stage && (
                <>
                  {stageReviewComments.trim() && (
                    <button className="btn-secondary" disabled={stageTransitionBusy}
                            title={t('ordersPage.saveNoteHint', 'Leave this note on the stage without changing its status')}
                            onClick={() => transition(stage.status, t('ordersPage.noteSaved', 'Note saved.'))}>
                      <MessageSquare size={16} /> {t('ordersPage.saveNote', 'Save note')}
                    </button>
                  )}
                  {(stage.status === 'NOT_STARTED' || stage.status === 'PAUSED') && (
                    <button className="btn-primary" disabled={stageTransitionBusy}
                            onClick={() => transition('IN_PROGRESS', 'Step started.')}>
                      <Play size={16} /> {stage.status === 'PAUSED' ? 'Resume' : 'Start'}
                    </button>
                  )}
                  {/* A step is started, then completed. A worker marks it done
                      with a photo and the owner or Master confirms; the server
                      holds the same rule. No pause: a step is in progress until
                      it is complete. */}
                  {stage.status === 'IN_PROGRESS' && (!submits ? (
                    <button className="btn-primary" disabled={stageTransitionBusy}
                            onClick={() => transition('COMPLETED', 'Step completed.')}>
                      <Check size={16} /> Mark completed
                    </button>
                  ) : (
                    <button className="btn-primary" disabled={stageTransitionBusy || stageReviewImages.length === 0}
                            title={stageReviewImages.length ? '' : 'Upload a photo of the work first'}
                            onClick={() => transition('PENDING_VERIFICATION', `Sent for verification. ${isSupervisor ? 'The Owner or Designer' : 'The owner or Master'} will confirm it.`)}>
                      <Check size={16} /> Submit for verification
                    </button>
                  ))}
                  {stage.status === 'PENDING_VERIFICATION' && (canSignOff ? (
                    <>
                      <button className="btn-secondary at-btn-warn" disabled={stageTransitionBusy}
                              onClick={() => {
                                const note = window.prompt('What needs to be redone? The worker will see this note.');
                                if (note && note.trim()) transition('IN_PROGRESS', 'Sent back to the worker.', note.trim().slice(0, LIMITS.reason));
                              }}>
                        <X size={16} /> Send Back
                      </button>
                      <button className="btn-primary" disabled={stageTransitionBusy}
                              onClick={() => transition('COMPLETED', 'Confirmed. Step completed.')}>
                        <Check size={16} /> Confirm completed
                      </button>
                    </>
                  ) : (
                    <span style={{ fontSize: '13px', color: 'var(--text-secondary)', alignSelf: 'center' }}>
                      Marked done. {checkers} will confirm it.
                    </span>
                  ))}
                  {/* Reversals. Forward-only is the rule; these are the two
                      audited exceptions, supervisors only, reason required.
                      The server enforces all of it -- these buttons only appear
                      where they could succeed. */}
                  {settled && (currentUser?.role === 'Owner' || currentUser?.role === 'Master') && (
                    <button className="btn-secondary at-btn-warn" disabled={reversalBusy}
                            onClick={() => { setReversalReason(''); setReversalPrompt({ type: 'reopen' }); }}>
                      Reopen Stage…
                    </button>
                  )}
                  {stage.stage_key === 'master_quality_check' && stage.status !== 'COMPLETED'
                    && ['Owner', 'Master', 'QC Staff'].includes(currentUser?.role) && (
                    <button className="btn-secondary at-btn-danger" disabled={reversalBusy}
                            onClick={() => { setReversalReason(''); setReversalPrompt({ type: 'failqc' }); }}>
                      Fail QC — Send for Rework…
                    </button>
                  )}
                </>
              )}
            >
              {/* What this stage is for, and where it stands. */}
              <div className="at-stage-summary">
                <div className="at-form-section" style={{ flexDirection: 'row', alignItems: 'center', gap: 'var(--space-4)' }}>
                  <div className="kanban-thumb at-tile--green" style={{ width: 72, height: 90 }}>
                    {activeReviewOrder.completed_garment_image
                      ? <img src={activeReviewOrder.completed_garment_image} alt="" />
                      : <Shirt size={28} />}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span className="at-section-title" style={{ fontSize: 'var(--text-xl)' }}>{single ? `${allJobs.indexOf(single) + 1}. ${single.display_name || single.template_name || 'Garment'}` : orderGarmentLabel(activeReviewOrder)}</span>
                      {detailCount > 0 && <span className="ui-badge ui-badge--neutral">{detailCount} details</span>}
                    </div>
                    <div className="at-section-sub" style={{ fontSize: 'var(--text-sm)', marginTop: '4px' }}>
                      {activeReviewOrder.customer_name}
                      {jobs.length > 1 ? ` · ${jobs.length} garments` : ''}
                      {activeReviewOrder.estimated_delivery ? ` · Delivery ${fmtDate(activeReviewOrder.estimated_delivery)}` : ''}
                    </div>
                    {activeReviewOrder.garment_label && jobs.length > 1 && (
                      <div className="at-section-sub">{activeReviewOrder.garment_label}</div>
                    )}
                  </div>
                </div>
                {stage && (
                  <div className="at-form-section at-stat--green" style={{ gap: 'var(--space-3)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                      <span className="ui-eyebrow" style={{ color: 'var(--text-primary)' }}>Status</span>
                      <span className={`ui-badge ui-badge--${tone}`}>● {STEP_LABEL[STEP_STATE(stage.status)]}</span>
                    </div>
                    {/* One row per fact: icon and label on the left, the value on the right,
                        a rule between rows -- lines up however many facts there are. */}
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      {[
                        ['Started', Calendar, stage.started_at ? fmtDateTime(stage.started_at) : '—'],
                        ['SLA / target', Clock, `${stage.sla_hours} hours`],
                        stage.completed_at && ['Completed', CheckCircle2, fmtDateTime(stage.completed_at)],
                        stage.duration_seconds > 0 && ['Actual duration', History, duration],
                        stage.performed_by_name && ['Performed by', User, stage.performed_by_name],
                      ].filter(Boolean).map(([label, Icon, value], i) => (
                        <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)',
                                                  padding: '10px 0', borderTop: i ? '1px solid var(--border-color)' : 'none' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: 'var(--text-sm)',
                                         color: 'var(--text-secondary)', flexShrink: 0 }}>
                            <Icon size={15} style={{ flexShrink: 0 }} /> {label}
                          </span>
                          <span className="stage-meta-value" style={{ margin: 0, textAlign: 'right', minWidth: 0, overflowWrap: 'anywhere' }}>{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* What is actually being made: the garments as the template
                  groups them -- measurements, style, materials -- with the
                  labels the order form used. Nested on the order payload, so it
                  needs no fetch beyond the template itself. */}
              {jobs.length > 0 && (

                <div className="at-stage-brief">
                  <OrderGarmentBrief
                    jobs={jobs}
                    specialInstructions={activeReviewOrder.special_instructions}
                    voiceNote={activeReviewOrder.instructions_voice_note}
                    voiceNoteBy={activeReviewOrder.instructions_voice_note_by}
                    voiceNoteAt={activeReviewOrder.instructions_voice_note_at}
                    voiceNotes={activeReviewOrder.instructions_voice_notes}
                  />
                </div>
              )}
              {/* An order with no garment lines still carries its instructions;
                  without the brief they had nowhere to show, so the person doing
                  the work never saw or heard them. */}
              {jobs.length === 0 && (activeReviewOrder.special_instructions || activeReviewOrder.instructions_voice_note) && (
                <InfoNote icon={FileText} tone="warning" title="Special instructions">
                  {activeReviewOrder.special_instructions && (
                    <>&ldquo;{activeReviewOrder.special_instructions}&rdquo;<SpeakButton text={activeReviewOrder.special_instructions} /></>
                  )}
                  <VoiceNotePlayer src={activeReviewOrder.instructions_voice_note} />
                  {activeReviewOrder.instructions_voice_note && (
                    <div className="od-hint" style={{ marginTop: '4px' }}>
                      Voice note from <strong>{activeReviewOrder.instructions_voice_note_by || t('ordersPage.someone', 'Someone')}</strong>
                    </div>
                  )}
                  {/* The rest of its voice notes (the first is the one above). */}
                  {voiceNoteList(activeReviewOrder.instructions_voice_notes).slice(1).map((note, i) => (
                    <React.Fragment key={`${note.url}:${i}`}>
                      <VoiceNotePlayer src={note.url} />
                      <div className="od-hint" style={{ marginTop: '4px' }}>
                        Voice note from <strong>{note.by || t('ordersPage.someone', 'Someone')}</strong>
                      </div>
                    </React.Fragment>
                  ))}
                </InfoNote>
              )}

              {/* The designs, fabrics and accessories chosen for each garment,
                  read back exactly as the order's review step showed them. Off
                  the job's own `selections` snapshot: the floor roles have no
                  inventory module, so nothing here asks /api/inventory/. Orders
                  placed before the snapshot existed have nothing to show. */}
              {jobs.some((j) => Object.keys(j.selections || {}).length > 0) && (
                <FormSection icon={Layers} tone="green" title="Designs &amp; fabrics"
                             subtitle="What was chosen for every garment when the order was placed.">
                  <GarmentSelectionsReview
                    jobs={jobs.map((j) => ({
                      key: j.id,
                      template: { key: j.template_key, name: j.display_name || j.template_name },
                      design: j.selections?.design,
                      fabrics: j.selections?.fabrics,
                      slot_labels: j.selections?.slot_labels,
                      fabric_qty: j.selections?.fabric_qty,
                      accessories: j.selections?.accessories,
                    }))}
                    fabrics={jobs.flatMap((j) => j.selections?.fabric_items || [])}
                    taxonomy={fabricTaxonomy}
                  />
                </FormSection>
              )}

              {/* What the cutting table actually took from each roll. Recorded
                  here, at the stage it happens, by the people standing at it;
                  Stitching Completed only mops up lines nobody recorded. */}
              {(stage?.stage_key === 'pattern_cutting' || stage?.stage_key === 'fabric_cutting')
                && (currentUser?.role === 'Owner' || SUPERVISOR_ROLES.includes(currentUser?.role)) && (
                <FormSection icon={Scissors} tone="green" title="Fabric used at cutting"
                             subtitle="Metres cut from each roll, and the offcuts. Stock and the order's material cost follow from this.">
                  <CuttingUsage orderId={activeReviewOrder.id} />
                </FormSection>
              )}

              {stage && stage.verification_note && stage.status !== 'COMPLETED' && (
                <InfoNote icon={AlertTriangle} tone="warning" title="Sent back for rework">
                  &ldquo;{stage.verification_note}&rdquo;
                </InfoNote>
              )}
              {stage && stage.status === 'PENDING_VERIFICATION' && (
                <InfoNote icon={Clock} tone="warning" title="Pending verification">
                  {stage.performed_by_name || 'The worker'} has submitted this stage. Check the photos below
                  {canSignOff ? ', then verify it or send it back.' : `. ${checkers} will verify it.`}
                  {stage.verification_seen_at && (
                    <div className="od-hint" style={{ marginTop: '6px' }}>
                      <Eye size={12} style={{ verticalAlign: '-2px', marginRight: '4px' }} />
                      Seen by {stage.verification_seen_by || 'the verifier'} · {new Date(stage.verification_seen_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
                    </div>
                  )}
                </InfoNote>
              )}
              {stage && (stage.comments || stage.voice_note) && (
                <InfoNote icon={FileText} tone="neutral" title={t('ordersPage.latestNote', 'Latest note')}>
                  {stage.comments && <>&ldquo;{stage.comments}&rdquo;<SpeakButton text={stage.comments} /></>}
                  <VoiceNotePlayer src={stage.voice_note} />
                  {stage.voice_note && (
                    <div className="od-hint" style={{ marginTop: '4px' }}>
                      Voice note from <strong>{stage.voice_note_by || t('ordersPage.someone', 'Someone')}</strong>
                      {stage.voice_note_at ? ` · ${new Date(stage.voice_note_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}` : ''}
                    </div>
                  )}
                </InfoNote>
              )}
              {stage && (() => {
                // The thread the tailor and the owner talk through on this stage.
                const notes = (activeReviewOrder.activities || [])
                  .filter((a) => (a.event_type === 'STAGE_TRANSITION' || a.event_type === 'STAGE_NOTE') && a.metadata?.stage_key === stage.stage_key
                    && (a.metadata.comments || a.metadata.voice_note))
                  .slice(0, 20);
                if (!notes.length) return null;
                return (
                  <div className="at-field">
                    <span className="at-field-label">{t('ordersPage.stageNotesThread', 'Notes on this stage')}</span>
                    {notes.map((a, i) => (
                      <div key={a.id || i} style={{ padding: '6px 0', fontSize: '13px',
                                                     borderTop: i ? '1px solid var(--border-color)' : 'none' }}>
                        <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                          {a.user_name || t('ordersPage.someone', 'Someone')}
                          {' · '}
                          {new Date(a.timestamp).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </div>
                        {a.metadata.comments && <div>{a.metadata.comments}</div>}
                        {a.metadata.voice_note && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <VoiceNotePlayer src={a.metadata.voice_note} style={{ flex: '1 1 200px', marginTop: 0 }} />
                            {/* The browser's own ⋮ on the player cannot be added
                                to, so Delete sits beside it -- the same button the
                                recorder above draws for the stage's note. */}
                            {a.id && (
                              <button type="button" className="btn-secondary"
                                      style={{ padding: '4px 10px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                                      disabled={stageTransitionBusy}
                                      title={t('ordersPage.deleteVoiceNote', 'Delete this voice note')}
                                      onClick={async () => {
                                        if (!window.confirm(t('ordersPage.deleteVoiceNoteConfirm', 'Delete this voice note?'))) return;
                                        setStageTransitionBusy(true);
                                        try {
                                          await api.deleteStageNoteVoice(activeReviewOrder.id, a.id);

                                          setActiveReviewOrder((prev) => prev && ({
                                            ...prev,
                                            activities: (prev.activities || []).flatMap((row) => {
                                              if (row.id !== a.id) return [row];
                                              const { voice_note, voice_note_by, voice_note_at, ...rest } = row.metadata || {}; // eslint-disable-line no-unused-vars
                                              return row.event_type === 'STAGE_NOTE' && !rest.comments ? [] : [{ ...row, metadata: rest }];
                                            }),
                                          }));
                                          fetchDashboardAndConfig();
                                        } catch (err) {
                                          alert(err.message || t('ordersPage.voiceNoteDeleteFailed', 'Could not delete the voice note.'));
                                        } finally {
                                          setStageTransitionBusy(false);
                                        }
                                      }}>
                                <Trash2 size={13} /> {t('common.delete', 'Delete')}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })()}

              {stage && stage.attachments && stage.attachments.length > 0 && (
                <div className="at-field">
                  <span className="at-field-label">Progress photos ({stage.attachments.length})</span>
                  <div className="at-photos">
                    {stage.attachments.map((url, i) => {
                      const verdict = stage.attachment_reviews?.[url];
                      const items = stage.attachments.map((u, n) => ({ image_url: u, label: `Photo ${n + 1}` }));
                      return (
                        <div key={url} style={{ position: 'relative', width: '96px' }}>
                          <div style={{ position: 'relative' }}>
                            <PhotoTile src={url} alt={`attachment-${i}`} size={96} />
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
                          {verdict && <div style={{ fontSize: '11px', color: 'var(--danger-color)', marginTop: '4px', lineHeight: 1.3 }}>{verdict.remark}</div>}
                          {canSignOff && stage.status === 'PENDING_VERIFICATION' && (
                            verdict
                              ? <button type="button" className="btn-link" style={{ fontSize: '11px', padding: 0, minHeight: '24px' }}
                                        onClick={async () => {
                                          try { const o = await api.reviewStagePhoto(activeReviewOrder.id, stage.stage_key, url, '', 'CLEAR', stage.garment_job || null); setActiveReviewOrder(o); setSelectedStageObj(o.stages.find(st => st.id === stage.id)); fetchDashboardAndConfig(); }
                                          catch (err) { alert(err.message); }
                                        }}>Undo rejection</button>
                              : <button type="button" className="btn-link" style={{ fontSize: '11px', padding: 0, minHeight: '24px', color: 'var(--danger-color)' }}
                                        onClick={async () => {
                                          const remark = window.prompt('What is wrong with this photo? The tailor reads this.');
                                          if (remark === null) return;
                                          if (!remark.trim()) { alert('A remark is required to reject a photo.'); return; }
                                          try { const o = await api.reviewStagePhoto(activeReviewOrder.id, stage.stage_key, url, remark.trim().slice(0, LIMITS.reason), 'REJECTED', stage.garment_job || null); setActiveReviewOrder(o); setSelectedStageObj(o.stages.find(st => st.id === stage.id)); fetchDashboardAndConfig(); }
                                          catch (err) { alert(err.message); }
                                        }}><X size={11} /> Reject photo</button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Delivery prep: how the garment leaves the boutique (pickup or courier). */}
              {stage && stage.stage_key === 'ready_for_delivery' && (
                <FormSection icon={PackageCheck} tone="green" title={t('ordersPage.handover', 'Handover')}>
                  <DeliveryCard key={`${activeReviewOrder.id}-${activeReviewOrder.delivery_method}-${activeReviewOrder.tracking_number}`}
                                order={activeReviewOrder} canEdit={!isProductionStaff(currentUser.role)}
                                onSaved={(saved) => {
                                  if (saved?.id) setActiveReviewOrder((prev) => (prev ? { ...prev, ...saved } : prev));
                                  fetchDashboardAndConfig();
                                }} />
                </FormSection>
              )}

              {/* Split between several people (features/orders/StageParts.jsx):
                  who has which part, sending one part back, or the way to split. */}
              {stage && isSupervisor && (
                <StageParts order={activeReviewOrder} stage={stage} workflowConfig={boutiqueSettings?.workflow_config || []}
                            onChanged={(fresh) => {
                              if (fresh?.stages) {
                                setActiveReviewOrder(fresh);
                                setSelectedStageObj(fresh.stages.find((st) => st.id === stage.id) || stage);
                              }
                              fetchDashboardAndConfig();
                            }} />
              )}

              {/* Hand this stage to someone, say who did the work, note what
                  happened, photograph it. assign_stage and the performer field
                  are supervisor calls; the API refuses them from anyone else. */}
              <FormSection icon={RefreshCw} tone="green" title="Manage Stage Transition">
                <div className="at-form-grid">
                  {/* A split step is handed out part by part, above. */}
                  {stage && isSupervisor && !(stage.parts || []).length && (
                    <Field label="Assign this stage to" icon={User}>
                      <select
                        className="form-control"
                        value={stage.assigned_to || ''}
                        disabled={assigningStageKey === stage.stage_key}
                        onChange={(e) => handleAssignStage(activeReviewOrder.id, stage.stage_key, e.target.value, stage.garment_job || null)}
                      >
                        {/* No one set on this step: it is the order's stitching tailor's
                            (stitching, alteration) or master's, as My work already treats it. */}
                        <option value="">{(() => {
                          const tailorStep = TAILOR_STEPS.includes(stage.stage_key);
                          const name = tailorStep ? activeReviewOrder.tailor_name : activeReviewOrder.master_name;
                          return name ? `${name} (order's ${tailorStep ? 'stitching tailor' : 'master'})` : 'Unassigned';
                        })()}</option>
                        {eligibleStaffForStage(stage.stage_key).map(t => (
                          <option key={t.id} value={t.id}>{t.name} · {t.role}</option>
                        ))}
                      </select>
                    </Field>
                  )}
                  {/* One grid cell: the notes box, and under it the voice
                      note. The recorder sits outside the bordered control --
                      Field lays its children out in a row for icon + input,
                      which squeezed the textarea to a few characters wide. */}
                  <div className="at-field">
                  <Field label="Comments / Fitting Logs">
                    <textarea
                      className="form-control"
                      placeholder="Enter notes, alterations details, or comments..."
                      maxLength={LIMITS.note}
                      value={stageReviewComments}
                      onChange={(e) => setStageReviewComments(e.target.value)}
                    />
                  </Field>
                    {/* The voice note proper: recorded on its own (nothing is
                        transcribed into the box), heard back, then Send saves
                        it on the stage under the sender's name -- with whatever
                        text is in the box -- or Delete throws it away. */}
                    <VoiceRecorder
                      disabled={stageTransitionBusy}
                      onRecordingChange={setStageReviewRecording}
                      sent={stage.voice_note ? { url: stage.voice_note, by: stage.voice_note_by, at: stage.voice_note_at } : null}
                      onSend={async (blob) => {
                        const url = await api.uploadVoiceNote(blob);
                        await transition(stage.status, t('ordersPage.voiceNoteSent', 'Voice note sent.'), stageReviewComments, url);
                      }}
                      onDelete={() => transition(stage.status, t('ordersPage.voiceNoteDeleted', 'Voice note deleted.'), stageReviewComments, null, true)}
                    />
                  </div>
                  <div className="at-field">
                    <span className="at-field-label">
                      Upload Progress Photos <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(up to 5)</span>
                    </span>
                    {stageReviewImages.length > 0 && (
                      <div className="at-photos" style={{ marginBottom: '8px' }}>
                        {stageReviewImages.map((file, i) => (
                          <PhotoTile key={`${file.name}-${i}`} src={URL.createObjectURL(file)} size={88}
                                     onRemove={() => setStageReviewImages(prev => prev.filter((_, n) => n !== i))} />
                        ))}
                      </div>
                    )}
                    {stageReviewImages.length < 5 && (
                      <Dropzone compact multiple camera
                                title="Drag & drop images here" subtitle="or choose from your device — several at once"
                                chooseLabel={stageReviewImages.length ? 'Add more' : 'Add photos'}
                                onFiles={(files) => {
                                  const bad = imageFilesError(files);
                                  if (bad) { alert(bad); return; }
                                  setStageReviewImages(prev => {
                                    const room = 5 - prev.length;
                                    if (files.length > room) alert(`Up to 5 photos. Only ${room} more ${room === 1 ? 'was' : 'were'} added.`);
                                    return [...prev, ...files.slice(0, room)];
                                  });
                                }} />
                    )}
                  </div>
                </div>
              </FormSection>
            </FormModal>
          );
}
