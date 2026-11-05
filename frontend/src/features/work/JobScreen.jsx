import { useEffect, useState } from 'react';
import { AlertTriangle, X as CloseIcon } from 'lucide-react';
import { api } from '../../api';
import { formatDateTime } from '../../utils/format';
import { resolveMediaUrl } from '../../services/media';
import { useLanguage } from '../../i18n/LanguageContext.jsx';
import StageParts from '../orders/StageParts';
import { VoiceNotePlayer, SpeakButton } from '../../components/ui/VoiceTextarea';
import { voiceNoteList } from '../../components/ui/voiceNotes';
import { PhotoTile, InfoNote } from '../../components/ui/Atelier';
import GarmentSelectionsReview from '../catalog/GarmentSelectionsReview';
import { Lightbox } from '../designStudio/GarmentPartPicker';
import AssignTo from './AssignTo';
import { CheckForm, NoteForm, StartForm, SubmitForm } from './JobForms';
import { entries, garmentLabel, humanise, jobTitle, measureEntries, noteThread, stageRef, workerNote } from './workHelpers';

/** One job opened: what to make, the work so far, and what can be done next. */

const Listen = ({ text }) => <span className="wk-listen"><SpeakButton text={text} /></span>;

export default function JobScreen({ order, stage: step, part = null, workflowConfig = [], mode, isSupervisor, submits, me, stageRoles, fabricTaxonomy, onClose, onDone, onSaved }) {
  // One person's part of a split step: the step as they work it -- their
  // status, their photos, what was sent back to them.
  const stage = part
    ? { ...step, status: part.status, verification_note: part.verification_note, attachments: part.attachments || [], attachment_reviews: {} }
    : step;
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [view, setView] = useState(null); // lightbox { items, index }

  // Escape and the phone's Back both close the sheet. Back also pops the app's
  // own tab history, which is left alone: nothing is pushed here, so the
  // app's guard on the first screen keeps working as it does.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !view) onClose(); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('popstate', onClose);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('popstate', onClose); };
  }, [view, onClose]);

  // `clearVoice` throws the stage's saved voice note away, as the stage
  // review's Delete does.
  // `keepOpen`: a voice note sent or deleted -- the job stays open, so photos
  // picked and not yet sent stay with it; a failure goes back to the recorder.
  const save = async (status, text, files, blob, okMsg, clearVoice = false, keepOpen = false) => {
    setBusy(true); setError('');
    try {
      const voiceUrl = blob ? await api.uploadVoiceNote(blob) : null;
      if (part && status !== part.status) {
        await api.transitionPart(order.id, part.id, status, text || '', files || [], voiceUrl);
      } else {
        // A note (the status kept) goes on the step, where its thread is read
        // -- for a part too.
        await api.transitionStage(order.id, step.stage_key, part ? step.status : status, text || '', files || [], null, voiceUrl, clearVoice, step.garment_job || null);
      }
      if (keepOpen) onSaved?.(okMsg); else onDone(okMsg);
    } catch (e) {
      if (keepOpen) throw e;
      setError(e?.message || t('workPage.saveFailed', 'Could not save. Please try again.'));
    } finally { setBusy(false); }
  };

  // A per-garment step shows only its own garment; an order-level one shows them all.
  const allJobs = order.garment_jobs || [];
  const ownJobs = stage.garment_job ? allJobs.filter((j) => j.id === stage.garment_job) : [];
  const jobs = ownJobs.length ? ownJobs : allJobs;
  const attachments = (stage.attachments || []).map((u) => resolveMediaUrl(u));
  const lightboxItems = attachments.map((u, i) => ({ image_url: u, label: `${t('workPage.photo', 'Photo')} ${i + 1}` }));
  const rejected = Object.entries(stage.attachment_reviews || {}).filter(([, r]) => r?.status === 'REJECTED');
  const note = workerNote(order, stage);
  const thread = noteThread(order, stage);
  const rest = thread.filter((a) => a !== note);

  const noteBlock = note && (note.metadata.comments || note.metadata.voice_note) && (
    <div className="wk-text">
      {note.metadata.comments && <>&ldquo;{note.metadata.comments}&rdquo;<Listen text={note.metadata.comments} /></>}
      <VoiceNotePlayer src={resolveMediaUrl(note.metadata.voice_note)} />
    </div>
  );
  const threadNotes = rest.map((a, i) => (
    <div key={a.id || i} className="wk-note">
      <div className="wk-note-who">{a.user_name || t('workPage.someone', 'Someone')} · {formatDateTime(a.timestamp)}</div>
      {a.metadata.comments && <div>{a.metadata.comments}</div>}
      <VoiceNotePlayer src={resolveMediaUrl(a.metadata.voice_note)} />
    </div>
  ));

  const whatToMake = (
    <>
      <section className="wk-section">
        <h3 className="wk-section-title">{order.flow === 'alteration' ? t('workPage.whatToChange', 'What to change') : t('workPage.whatToMake', 'What to make')}</h3>
        <div className="wk-text wk-strong">{(ownJobs.length && stage.garment_name) || garmentLabel(order, t)}{order.flow === 'alteration' && order.alteration_of_reference ? ` · ${t('workPage.fromOrder', 'from order')} ${order.alteration_of_reference}` : ''}</div>
        {jobs.some((j) => Object.keys(j.selections || {}).length > 0) && (
          <div className="wk-gap">
            <GarmentSelectionsReview
              jobs={jobs.map((j) => ({ key: j.id, template: { key: j.template_key, name: j.display_name || j.template_name },
                design: j.selections?.design, fabrics: j.selections?.fabrics, slot_labels: j.selections?.slot_labels, fabric_qty: j.selections?.fabric_qty,
                accessories: j.selections?.accessories }))}
              fabrics={jobs.flatMap((j) => j.selections?.fabric_items || [])}
              taxonomy={fabricTaxonomy} />
          </div>
        )}
        {(order.special_instructions || order.instructions_voice_note) && (
          <div className="wk-text wk-gap">
            {order.special_instructions && <>{order.special_instructions}<Listen text={order.special_instructions} /></>}
            {/* Every voice note left on the instructions (up to ten). */}
            {voiceNoteList(order.instructions_voice_notes, order.instructions_voice_note).map((note, i) => (
              <VoiceNotePlayer key={`${note.url}:${i}`} src={resolveMediaUrl(note.url)} />
            ))}
          </div>
        )}
      </section>
      <section className="wk-section">
        <h3 className="wk-section-title">{t('workPage.measurements', 'Measurements')}</h3>
        {jobs.length === 0 && (() => {
          // No garment jobs: the customer's measurements on file, as the older orders carry them.
          const on = entries(order.customer_measurements).filter(([k]) => k !== 'id');
          const extra = entries(order.customer_measurements?.additional_measurements);
          const all = [...on, ...extra];
          if (!all.length) return <div className="wk-quiet">{t('workPage.noMeasurements', 'No measurements recorded.')}</div>;
          return (
            <details className="wk-details" open>
              <summary>{garmentLabel(order, t)}</summary>
              <div className="wk-details-body">
                {all.map(([k, v]) => <div key={k} className="wk-kv"><span>{humanise(k)}</span><span>{String(v)}{Number.isFinite(Number(v)) ? ` ${t('workPage.inch', 'Inches')}` : ''}</span></div>)}
              </div>
            </details>
          );
        })()}
        {jobs.map((j) => {
          const m = measureEntries(j.measurements);
          const s = entries(j.spec);
          return (
            <details key={j.id} className="wk-details">
              <summary>{j.display_name || j.template_name || t('workPage.customGarment', 'Custom garment')}</summary>
              <div className="wk-details-body">
                {m.length === 0 && s.length === 0 && <div className="wk-quiet">{t('workPage.noMeasurements', 'No measurements recorded.')}</div>}
                {/* Bold headings over the two lists: Measurement, then Specification. */}
                {m.length > 0 && <div className="wk-sub wk-sub--head">{t('workPage.measurementHead', 'Measurement')}</div>}
                {m.map(([k, v]) => <div key={k} className="wk-kv"><span>{humanise(k)}</span><span>{String(v)}{Number.isFinite(Number(v)) ? ` ${t('workPage.inch', 'Inches')}` : ''}</span></div>)}
                {s.length > 0 && <div className="wk-sub wk-sub--head">{t('workPage.specification', 'Specification')}</div>}
                {s.map(([k, v]) => <div key={k} className="wk-kv"><span>{humanise(k)}</span><span>{String(v)}</span></div>)}
              </div>
            </details>
          );
        })}
      </section>
    </>
  );

  const workSoFar = (attachments.length > 0 || thread.length > 0) && (
    <section className="wk-section">
      <h3 className="wk-section-title">{t('workPage.yourWorkSoFar', 'Your work so far')}</h3>
      {attachments.length > 0 && (
        <div className="wk-photos">
          {attachments.map((u, i) => (
            <span key={u} role="button" tabIndex={0} onClick={() => setView({ items: lightboxItems, index: i })}
                  onKeyDown={(e) => e.key === 'Enter' && setView({ items: lightboxItems, index: i })}>
              <PhotoTile src={u} size={80} />
            </span>
          ))}
        </div>
      )}
      {noteBlock}
      {threadNotes}
    </section>
  );

  // Photos kept on the earlier steps of this garment (and the order's own
  // steps): what was cut, worked or stitched before this one reached me.
  const earlier = (order.stages || [])
    .filter((o) => o.id !== stage.id && o.sequence < stage.sequence && (o.attachments || []).length > 0
      && !(o.garment_job && stage.garment_job && o.garment_job !== stage.garment_job))
    .sort((a, b) => a.sequence - b.sequence);
  const earlierItems = earlier.flatMap((o) => o.attachments.map((u, i) => ({
    image_url: resolveMediaUrl(u), label: `${o.stage_name || humanise(o.stage_key)} · ${t('workPage.photo', 'Photo')} ${i + 1}`,
  })));
  const earlierPhotos = earlierItems.length > 0 && (
    <section className="wk-section">
      <h3 className="wk-section-title">{t('workPage.earlierPhotos', 'Photos from earlier steps')}</h3>
      {earlier.map((o) => (
        <div key={o.id} className="wk-gap">
          <div className="wk-sub">{o.stage_name || humanise(o.stage_key)}{o.performed_by_name ? ` · ${o.performed_by_name}` : ''}</div>
          <div className="wk-photos">
            {o.attachments.map((u) => {
              const index = earlierItems.findIndex((it) => it.image_url === resolveMediaUrl(u));
              return (
                <span key={u} role="button" tabIndex={0} onClick={() => setView({ items: earlierItems, index })}
                      onKeyDown={(e) => e.key === 'Enter' && setView({ items: earlierItems, index })}>
                  <PhotoTile src={resolveMediaUrl(u)} size={80} />
                </span>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );

  let head = null;
  if (mode === 'work' && stage.verification_note && stage.status === 'IN_PROGRESS') {
    head = (
      <div className="wk-sentback">
      <InfoNote icon={AlertTriangle} tone="amber" title={t('workPage.sentBackByMaster', 'Sent back by the master')}>
        <div className="wk-text">{stage.verification_note}<Listen text={stage.verification_note} /></div>
        {rejected.map(([url, r]) => (
          <div key={url} className="wk-reject">
            <PhotoTile src={resolveMediaUrl(url)} size={56} />
            <span>{r.remark || t('workPage.notThisOne', 'Not this one')}</span>
          </div>
        ))}
      </InfoNote>
      </div>
    );
  }

  let actions = null;
  if (mode === 'work') {
    if (['NOT_STARTED', 'PAUSED'].includes(stage.status)) {
      actions = <StartForm stage={stage} busy={busy} error={error} save={save} />;
    } else if (stage.status === 'IN_PROGRESS') {
      actions = <SubmitForm stage={stage} busy={busy} error={error} submits={submits} toLeads={isSupervisor} save={save} />;
    } else if (stage.status === 'PENDING_VERIFICATION') {
      actions = <NoteForm busy={busy} error={error} stage={stage} save={save} />;
    }
  } else if (mode === 'check' && stage.status === 'PENDING_VERIFICATION') {
    actions = <CheckForm stage={stage} busy={busy} error={error} save={save} />;
  }

  const title = `${jobTitle(order, stage, t)}${part ? ` · ${part.label}` : ''}`;
  // Where this job came from and where it goes. From: who handed this step
  // to its worker -- the latest Assign on it in the order's log (the server
  // records who pressed it); a step given out with the order or by Send to
  // workshop has no such entry, and the order's Master gave it out. Send
  // to: a worker's finished work goes to the order's Master to check first
  // (a Master or Designer marks it done themselves), then the next step.
  const route = (order.stages || [])
    .filter((o) => o.id !== stage.id && !(o.garment_job && stage.garment_job && o.garment_job !== stage.garment_job))
    .sort((a, b) => a.sequence - b.sequence);
  const nextStep = route.find((o) => o.sequence > stage.sequence && o.status !== 'SKIPPED');
  const stepName = (o) => o.stage_name || humanise(o.stage_key);
  const handedBy = (order.activities || [])
    .filter((a) => a.event_type === 'ASSIGNMENT' && a.metadata?.stage_key === stage.stage_key
      && String(a.metadata?.garment_job || '') === String(stage.garment_job || '')
      && (!stage.assigned_to || String(a.metadata?.assigned_to_id) === String(stage.assigned_to)))
    .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)))[0];
  const fromName = handedBy?.user_name || order.master_name || '';
  const fromRole = !handedBy || fromName === order.master_name ? t('workPage.master', 'Master') : '';
  return (
    <>
      <div className="wk-backdrop" onClick={onClose} />
      <div className="wk-sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="wk-sheet-head">
          <button type="button" className="wk-icon-btn" onClick={onClose} aria-label={t('common.close', 'Close')}><CloseIcon size={22} /></button>
          <div className="wk-sheet-title">{title}<small>{stageRef(order, stage)} · {order.customer_name}</small>
            {/* Who holds this step now -- the same words as the job's card. */}
            <small className="wk-sheet-assignee">
              {t('workPage.assigned', 'Assigned')}:{' '}
              <b>{(part ? part.assigned_to_name : stage.assigned_to_name)
                ? `${part ? part.assigned_to_name : stage.assigned_to_name}${(part ? part.assigned_to_role : stage.assigned_to_role) ? ` · ${part ? part.assigned_to_role : stage.assigned_to_role}` : ''}`
                : t('workPage.notAssigned', 'Not assigned yet')}</b>
            </small>
            {/* From: who handed it over. Send to: who checks it, then the next step. */}
            <small className="wk-sheet-assignee wk-sheet-route">
              {t('workPage.from', 'From')}:{' '}
              <b>{fromName ? `${fromName}${fromRole ? ` · ${fromRole}` : ''}` : t('workPage.theMaster', 'the Master')}</b>
            </small>
            {/* Send to: only for whoever sends the step for checking -- a
                worker to the Master, a Master's own work to the Owner or
                Designer. Work marked done outright gets none. */}
            {mode === 'work' && submits && (
              <small className="wk-sheet-assignee wk-sheet-route">
                {t('workPage.sendTo', 'Send to')}:{' '}
                <b>{order.master_name || t('workPage.theMaster', 'the Master')} · {t('workPage.master', 'Master')}</b> {t('workPage.toCheck', 'to check')}{nextStep ? ' · ' : ''}
                {nextStep && <>{t('workPage.next', 'next')}: <b>{stepName(nextStep)}</b></>}
              </small>
            )}
          </div>
        </div>
        <div className="wk-sheet-body">
          {head}
          {mode === 'work' && isSupervisor && stage.status !== 'PENDING_VERIFICATION' && !(stage.parts || []).length && (
            <AssignTo order={order} stage={stage} me={me} stageRoles={stageRoles} onDone={onDone} />
          )}
          {/* Split between several people: who has which part, and the way to split. */}
          {isSupervisor && !part && (mode === 'work' || mode === 'check') && (
            <StageParts order={order} stage={stage} workflowConfig={workflowConfig}
                        onChanged={() => onDone(t('workPage.saved', 'Saved.'))} />
          )}
          {mode === 'check' ? (
            <>
              {attachments.length > 0 && (
                <section className="wk-section">
                  <div className="wk-strip">
                    {attachments.map((u, i) => (
                      <button type="button" key={u} onClick={() => setView({ items: lightboxItems, index: i })} aria-label={`${t('workPage.photo', 'Photo')} ${i + 1}`}>
                        <img src={u} alt="" />
                      </button>
                    ))}
                  </div>
                  {attachments.length > 1 && <div className="wk-strip-hint">{t('workPage.swipeHint', 'Swipe for more · tap to enlarge')} ({attachments.length})</div>}
                </section>
              )}
              <section className="wk-section">
                <h3 className="wk-section-title">{t('workPage.workerNote', 'From {who}', { who: stage.performed_by_name || stage.assigned_to_name || t('workPage.theWorker', 'the worker') })}</h3>
                {noteBlock || <div className="wk-quiet">{t('workPage.noNote', 'No note.')}</div>}
                {threadNotes}
              </section>
              <details className="wk-details">
                <summary>{t('workPage.whatWasAsked', 'What was asked')}</summary>
                <div className="wk-details-body wk-gap">{whatToMake}</div>
              </details>
              {earlierPhotos}
            </>
          ) : (
            <>
              {/* Sent back for rework: the work and the master's notes on it
                  come first, then the rest as usual. */}
              {mode === 'work' && stage.verification_note && stage.status === 'IN_PROGRESS' && workSoFar}
              {/* The photos the earlier steps uploaded come first, so the
                  next step sees what was done before it. */}
              {earlierPhotos}
              {whatToMake}
              {!(mode === 'work' && stage.verification_note && stage.status === 'IN_PROGRESS') && workSoFar}
            </>
          )}
          {actions}
        </div>
      </div>
      {view && <Lightbox items={view.items} index={view.index} onIndexChange={(i) => setView({ ...view, index: i })} onClose={() => setView(null)} />}
    </>
  );
}
