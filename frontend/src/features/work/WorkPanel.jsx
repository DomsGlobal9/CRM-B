import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Image as ImageIcon, AlertTriangle, CheckCircle2, X as CloseIcon } from 'lucide-react';

import { api } from '../../services/api';
import { orderRef, formatDate, formatDateTime } from '../../services/format';
import { resolveMediaUrl } from '../../services/media';
import { imageFilesError } from '../../services/validate';
import { useLanguage } from '../../i18n/LanguageContext.jsx';
import VoiceTextarea, { VoiceClipPreview, VoiceNotePlayer, SpeakButton } from '../../components/ui/VoiceTextarea';
import { PhotoTile, CameraButton, InfoNote } from '../../components/ui/Atelier';
import GarmentSelectionsReview from '../catalog/GarmentSelectionsReview';
import { Lightbox } from '../designStudio/GarmentPartPicker';
import './work.css';

/**
 * The floor's three screens: My work, Done, To check. One job = one stage of
 * one order that is mine. Everything reads off the orders the app already
 * fetched; every save goes through api.transitionStage and then onChanged().
 */

const CLOSED = ['Delivered', 'Cancelled'];
const FINISHED = ['COMPLETED', 'SKIPPED'];
const MAX_PHOTOS = 5;
const STATUS_LABELS = {
  NOT_STARTED: ['workPage.statusTodo', 'To do'],
  IN_PROGRESS: ['workPage.statusInProgress', 'In progress'],
  PENDING_VERIFICATION: ['workPage.statusSent', 'Sent for checking'],
  COMPLETED: ['workPage.statusDone', 'Done'],
  SKIPPED: ['workPage.statusSkipped', 'Skipped'],
  PAUSED: ['workPage.statusPaused', 'Paused'],
};

const isOpenOrder = (o) => !CLOSED.includes(o.order_status);
const humanise = (key) => String(key || '').replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
const statusLabel = (status, t) => { const [k, d] = STATUS_LABELS[status] || []; return k ? t(k, d) : String(status || ''); };
// Orders written before garment jobs existed name their garment on the order.
const garmentLabel = (order, t) =>
  (order.garment_jobs || []).map((j) => j.template_name).filter(Boolean).join(', ')
  || order.customer_garment_type || t('workPage.customGarment', 'Custom garment');
// A per-garment stage names its garment; an order-level one names them all.
const jobTitle = (order, stage, t) => `${stage.garment_name || garmentLabel(order, t)} · ${stage.stage_name || humanise(stage.stage_key)}`;

// '5 min' / '2 h' / '3 d' since a timestamp.
function ago(ts, t) {
  if (!ts) return '';
  const mins = Math.max(0, Math.round((Date.now() - new Date(ts).getTime()) / 60000));
  if (mins < 60) return t('workPage.agoMin', '{n} min', { n: mins });
  if (mins < 48 * 60) return t('workPage.agoHour', '{n} h', { n: Math.round(mins / 60) });
  return t('workPage.agoDay', '{n} d', { n: Math.round(mins / 1440) });
}

// Activities arrive newest first.
// This row's own: on a per-garment stage, the activity names the garment.
const stageActivities = (order, stage) =>
  (order.activities || []).filter((a) => a.metadata?.stage_key === stage.stage_key
    && (!stage.garment_job || !a.metadata?.garment_job || a.metadata.garment_job === stage.garment_job));
const submittedAt = (order, stage) =>
  stageActivities(order, stage).find((a) => a.metadata?.new_status === 'PENDING_VERIFICATION')?.timestamp
  || stageActivities(order, stage)[0]?.timestamp || stage.started_at;
const sentBackCount = (order, stage) =>
  stageActivities(order, stage).filter((a) => a.metadata?.old_status === 'PENDING_VERIFICATION' && a.metadata?.new_status === 'IN_PROGRESS').length;
const approvedBy = (order, stage) =>
  stageActivities(order, stage).find((a) => a.event_type === 'STAGE_TRANSITION' && a.metadata?.new_status === 'COMPLETED')?.user_name;
// The worker's latest word. stage.comments holds whoever wrote last, the
// master's send-back reason included, so it cannot be shown as the worker's.
// ponytail: activities carry no role, so a master's plain note on a waiting stage would pass too; add a role to the activity if that ever bites.
const workerNote = (order, stage) =>
  stageActivities(order, stage).find((a) => a.metadata?.new_status === 'PENDING_VERIFICATION');
const noteThread = (order, stage) =>
  stageActivities(order, stage).filter((a) =>
    (a.event_type === 'STAGE_TRANSITION' || a.event_type === 'STAGE_NOTE') && (a.metadata.comments || a.metadata.voice_note)).slice(0, 20);

const entries = (obj) => Object.entries(obj || {}).filter(([, v]) => v !== '' && v != null && typeof v !== 'object');

const Listen = ({ text }) => <span className="wk-listen"><SpeakButton text={text} /></span>;

export default function WorkPanel({ view, orders = [], currentUser, workflowConfig = [], tailors, fabricTaxonomy, onChanged }) {
  const { t } = useLanguage();
  const me = currentUser?.tailor_id;
  const isSupervisor = currentUser?.role === 'Master';
  const [open, setOpen] = useState(null); // { orderId, stageKey }
  const [seen, setSeen] = useState(() => new Set()); // 'orderId:stageKey' ticked this session
  const [toast, setToast] = useState('');

  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(''), 3000);
    return () => clearTimeout(id);
  }, [toast]);

  // A supervisor opening a submitted stage leaves the "seen" tick.
  useEffect(() => {
    if (view !== 'check' || !open) return;
    const key = `${open.orderId}:${open.stageId}`;
    api.markStageSeen(open.orderId, open.stageKey, open.garmentJob || null).then(() => setSeen((s) => new Set(s).add(key))).catch(() => {});
  }, [view, open]);

  const rolesFor = (key) => workflowConfig.find((s) => s.key === key)?.roles || [];
  const isMine = (order, s) => s.assigned_to === me
    || (rolesFor(s.stage_key).includes(currentUser?.role) && s.assigned_to == null
        && (order.tailor === me || order.master === me || currentUser?.role !== 'Tailor'));
  // Earlier work on this garment (and the order-level stages) must be finished.
  const isReady = (order, s) => (order.stages || []).every((o) => o.sequence >= s.sequence || FINISHED.includes(o.status)
    || (o.garment_job && s.garment_job && o.garment_job !== s.garment_job));

  // Every (order, stage) pair this view lists, already sorted.
  const { items, later } = useMemo(() => {
    const out = [];
    let notReady = 0;
    orders.forEach((order) => {
      (order.stages || []).forEach((stage) => {
        if (view === 'check') {
          if (isOpenOrder(order) && stage.status === 'PENDING_VERIFICATION') out.push({ order, stage, at: submittedAt(order, stage) });
          return;
        }
        if (!isMine(order, stage)) return;
        const finished = FINISHED.includes(stage.status);
        if (view === 'done') { if (finished) out.push({ order, stage, at: stage.completed_at || stage.started_at }); return; }
        if (finished || !isOpenOrder(order)) return;
        if (stage.status === 'IN_PROGRESS') out.push({ order, stage, group: 'now' });
        else if (stage.status === 'PENDING_VERIFICATION') { if (!isSupervisor) out.push({ order, stage, group: 'waiting' }); }
        else if (isReady(order, stage)) out.push({ order, stage, group: 'next' });
        else notReady += 1;
      });
    });
    if (view !== 'open') out.sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));
    return { items: out, later: notReady };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, view, me, currentUser?.role, workflowConfig]);

  // The open job re-reads from the fresh orders after each refetch.
  const current = open && (() => {
    const order = orders.find((o) => o.id === open.orderId);
    const stage = order?.stages?.find((s) => s.id === open.stageId);
    return order && stage ? { order, stage } : null;
  })();

  const done = (msg) => { setOpen(null); setToast(msg); onChanged?.(); };

  const card = ({ order, stage }, extra) => (
    <button type="button" key={`${order.id}-${stage.id}`} className="wk-card" onClick={() => setOpen({ orderId: order.id, stageId: stage.id, stageKey: stage.stage_key, garmentJob: stage.garment_job || null })}>
      <div className="wk-card-head">
        <div className="wk-card-title">{jobTitle(order, stage, t)}</div>
        {extra.chip}
      </div>
      <div className="wk-card-sub">{orderRef(order)} · {order.customer_name}</div>
      {extra.meta && <div className="wk-card-meta">{extra.meta}</div>}
      {extra.body}
    </button>
  );

  let body;
  if (view === 'open') {
    const groups = [
      ['now', t('workPage.doNow', 'Do now')],
      ['next', t('workPage.next', 'Next')],
      ['waiting', t('workPage.waitingForMaster', 'Waiting for the master')],
    ];
    body = items.length === 0
      ? (
        <div className="wk-empty">
          {later
            ? t('workPage.emptyLater', 'Nothing to do right now. {n} job(s) are waiting for earlier steps to finish.', { n: later })
            : t('workPage.emptyOpen', 'Nothing to do right now — the master will assign you work.')}
        </div>
      )
      : (
        <>
          {groups.map(([key, label]) => {
            const list = items.filter((i) => i.group === key);
            if (!list.length) return null;
            return (
              <section key={key} className="wk-group">
                <h3 className="wk-group-title">{label} <span className="wk-count">{list.length}</span></h3>
                {list.map((it) => {
                  const sentBack = key === 'now' && it.stage.verification_note;
                  const chip = key === 'now'
                    ? <span className={`ui-badge ui-badge--${sentBack ? 'danger' : 'warning'}`}>{sentBack ? t('workPage.sentBack', 'Sent back') : t('workPage.inProgress', 'In progress')}</span>
                    : key === 'next'
                      ? <span className="ui-badge ui-badge--neutral">{t('workPage.ready', 'Ready')}</span>
                      : <span className="ui-badge ui-badge--info">{t('workPage.waiting', 'Waiting')}</span>;
                  const due = it.order.estimated_delivery && <span>{t('workPage.due', 'Due')} {formatDate(it.order.estimated_delivery)}</span>;
                  const sent = key === 'waiting' && <span>· {t('workPage.sentAgo', 'sent {n} ago', { n: ago(submittedAt(it.order, it.stage), t) })}</span>;
                  return card(it, {
                    chip, meta: (due || sent) && <>{due}{sent}</>,
                    body: sentBack && <div className="wk-card-note">{String(it.stage.verification_note).split('\n')[0]}</div>,
                  });
                })}
              </section>
            );
          })}
          {later > 0 && <div className="wk-quiet">{t('workPage.moreLater', '{n} more later', { n: later })}</div>}
        </>
      );
  } else if (view === 'done') {
    body = items.length === 0
      ? <div className="wk-empty">{t('workPage.emptyDone', 'Nothing finished yet.')}</div>
      : items.map((it) => {
        const back = sentBackCount(it.order, it.stage);
        const who = approvedBy(it.order, it.stage);
        return card(it, {
          chip: it.stage.status === 'COMPLETED'
            ? <span className="ui-badge ui-badge--success">✓ {who ? t('workPage.checkedBy', 'Checked by {who}', { who }) : t('workPage.checked', 'Checked')}</span>
            : <span className="ui-badge ui-badge--neutral">{statusLabel(it.stage.status, t)}</span>,
          meta: <>{it.at && <span>{formatDate(it.at)}</span>}{back > 0 && <span>· {back === 1 ? t('workPage.sentBackOnce', 'sent back once') : t('workPage.sentBackTimes', 'sent back {n} times', { n: back })}</span>}</>,
          body: <Thumbs urls={it.stage.attachments} />,
        });
      });
  } else {
    body = items.length === 0
      ? <div className="wk-empty">{t('workPage.emptyCheck', 'Nothing waiting for a check.')}</div>
      : items.map((it) => card(it, {
        chip: !it.stage.verification_seen_at && !seen.has(`${it.order.id}:${it.stage.id}`)
          && <span className="wk-dot" aria-label={t('workPage.new', 'new')} />,
        meta: <>
          <span>{it.stage.performed_by_name || it.stage.assigned_to_name || t('workPage.someone', 'Someone')}</span>
          <span>· {t('workPage.waitingAgo', 'waiting {n}', { n: ago(it.at, t) })}</span>
        </>,
        body: <Thumbs urls={it.stage.attachments} />,
      }));
  }

  return (
    <div className="wk">
      {body}
      {current && (
        <JobScreen key={`${current.order.id}-${current.stage.stage_key}`} order={current.order} stage={current.stage}
                   mode={view === 'check' ? 'check' : view === 'done' ? 'read' : 'work'}
                   isSupervisor={isSupervisor} tailors={tailors} fabricTaxonomy={fabricTaxonomy}
                   onClose={() => setOpen(null)} onDone={done} />
      )}
      {toast && <div className="wk-toast" role="status">{toast}</div>}
    </div>
  );
}

function Thumbs({ urls }) {
  const list = (urls || []).slice(0, 3);
  if (!list.length) return null;
  return <div className="wk-thumbs">{list.map((u) => <img key={u} src={resolveMediaUrl(u)} alt="" loading="lazy" />)}</div>;
}

/* The sticky row at the foot of the sheet: the one thing to do, and why it can't be done yet. */
function ActionBar({ error, children }) {
  return (
    <div className="wk-actions">
      {error && <div className="wk-error" role="alert">{error}</div>}
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function JobScreen({ order, stage, mode, isSupervisor, fabricTaxonomy, onClose, onDone }) {
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

  const save = async (status, text, files, blob, okMsg) => {
    setBusy(true); setError('');
    try {
      const voiceUrl = blob ? await api.uploadVoiceNote(blob) : null;
      await api.transitionStage(order.id, stage.stage_key, status, text || '', files || [], null, voiceUrl, false, stage.garment_job || null);
      onDone(okMsg);
    } catch (e) {
      setError(e?.message || t('workPage.saveFailed', 'Could not save. Please try again.'));
    } finally { setBusy(false); }
  };

  const jobs = order.garment_jobs || [];
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
        <h3 className="wk-section-title">{t('workPage.whatToMake', 'What to make')}</h3>
        <div className="wk-text wk-strong">{garmentLabel(order, t)}</div>
        {jobs.some((j) => Object.keys(j.selections || {}).length > 0) && (
          <div className="wk-gap">
            <GarmentSelectionsReview
              jobs={jobs.map((j) => ({ key: j.id, template: { key: j.template_key, name: j.template_name },
                design: j.selections?.design, fabrics: j.selections?.fabrics, slot_labels: j.selections?.slot_labels, fabric_qty: j.selections?.fabric_qty }))}
              fabrics={jobs.flatMap((j) => j.selections?.fabric_items || [])}
              taxonomy={fabricTaxonomy} />
          </div>
        )}
        {(order.special_instructions || order.instructions_voice_note) && (
          <div className="wk-text wk-gap">
            {order.special_instructions && <>{order.special_instructions}<Listen text={order.special_instructions} /></>}
            <VoiceNotePlayer src={resolveMediaUrl(order.instructions_voice_note)} />
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
          const m = entries(j.measurements);
          const s = entries(j.spec);
          return (
            <details key={j.id} className="wk-details">
              <summary>{j.template_name || t('workPage.customGarment', 'Custom garment')}</summary>
              <div className="wk-details-body">
                {m.length === 0 && s.length === 0 && <div className="wk-quiet">{t('workPage.noMeasurements', 'No measurements recorded.')}</div>}
                {m.map(([k, v]) => <div key={k} className="wk-kv"><span>{humanise(k)}</span><span>{String(v)}{Number.isFinite(Number(v)) ? ` ${t('workPage.inch', 'Inches')}` : ''}</span></div>)}
                {s.length > 0 && <div className="wk-sub">{t('workPage.style', 'Style')}</div>}
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
      actions = (
        <ActionBar error={error}>
          <button type="button" className="btn-primary" disabled={busy}
                  onClick={() => save('IN_PROGRESS', '', [], null, t('workPage.started', 'Started. Good luck!'))}>
            {t('workPage.start', 'Start')}
          </button>
        </ActionBar>
      );
    } else if (stage.status === 'IN_PROGRESS') {
      actions = <SubmitForm stage={stage} busy={busy} error={error} isSupervisor={isSupervisor} save={save} />;
    } else if (stage.status === 'PENDING_VERIFICATION') {
      actions = <NoteForm busy={busy} error={error} stage={stage} save={save} />;
    }
  } else if (mode === 'check' && stage.status === 'PENDING_VERIFICATION') {
    actions = <CheckForm stage={stage} busy={busy} error={error} save={save} />;
  }

  const title = jobTitle(order, stage, t);
  return (
    <>
      <div className="wk-backdrop" onClick={onClose} />
      <div className="wk-sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="wk-sheet-head">
          <button type="button" className="wk-icon-btn" onClick={onClose} aria-label={t('workPage.back', 'Back')}><ArrowLeft size={22} /></button>
          <div className="wk-sheet-title">{title}<small>{orderRef(order)} · {order.customer_name}</small></div>
        </div>
        <div className="wk-sheet-body">
          {head}
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
            </>
          ) : (
            <>
              {whatToMake}
              {workSoFar}
            </>
          )}
          {actions}
        </div>
      </div>
      {view && <Lightbox items={view.items} index={view.index} onIndexChange={(i) => setView({ ...view, index: i })} onClose={() => setView(null)} />}
    </>
  );
}

/* Photos + optional note, then "Send for checking" (worker) or "Mark done" (supervisor). */
function SubmitForm({ stage, busy, error, isSupervisor, save }) {
  const { t } = useLanguage();
  const [photos, setPhotos] = useState([]); // File[]
  const [text, setText] = useState('');
  const [clip, setClip] = useState(null);
  const [recording, setRecording] = useState(false);
  const [problem, setProblem] = useState('');
  const galleryRef = useRef(null);

  const addFiles = (files) => {
    const all = [...photos, ...files];
    const err = imageFilesError(all, { max: MAX_PHOTOS });
    setProblem(err);
    if (!err) setPhotos(all);
  };

  const needPhoto = !isSupervisor && photos.length === 0;
  const label = isSupervisor ? t('workPage.markDone', 'Mark done')
    : stage.verification_note ? t('workPage.fixAndSend', 'Fix & send again') : t('workPage.sendForChecking', 'Send for checking');

  const submit = () => {
    if (recording) { setProblem(t('workPage.stopRecording', 'Stop the recording first.')); return; }
    save('COMPLETED', text, photos, clip,
      isSupervisor ? t('workPage.doneToast', 'Marked done.') : t('workPage.sentToast', 'Sent for checking.'));
  };

  return (
    <>
      <div className="wk-form">
        <div className="wk-pickers">
          <CameraButton onFiles={addFiles} className="btn-secondary" label={t('workPage.takePhoto', 'Take photo')} disabled={busy || photos.length >= MAX_PHOTOS} />
          <button type="button" className="btn-secondary" disabled={busy || photos.length >= MAX_PHOTOS} onClick={() => galleryRef.current?.click()}>
            <ImageIcon size={18} /> {t('workPage.addFromGallery', 'Add from gallery')}
          </button>
          <input ref={galleryRef} type="file" accept="image/*" multiple hidden
                 onChange={(e) => { const files = [...(e.target.files || [])]; e.target.value = ''; if (files.length) addFiles(files); }} />
        </div>
        {photos.length > 0 && (
          <div className="wk-photos wk-tiles">
            {photos.map((file, i) => <FilePreview key={`${file.name}-${file.lastModified}-${i}`} file={file} onRemove={() => setPhotos(photos.filter((_, n) => n !== i))} />)}
          </div>
        )}
        {problem && <div className="wk-error" role="alert">{problem}</div>}
        <div className="wk-note-box">
          <VoiceTextarea className="form-control" rows={2} value={text} onChange={(e) => setText(e.target.value)}
                         placeholder={t('workPage.notePlaceholder', 'Anything the master should know (optional)')}
                         onRecording={setClip} onRecordingChange={setRecording} />
        </div>
        {clip && <VoiceClipPreview blob={clip} onRemove={() => setClip(null)} />}
      </div>
      <ActionBar error={error}>
        {needPhoto && <div className="wk-hint">{t('workPage.addPhotoFirst', 'Add a photo of the finished work first')}</div>}
        <button type="button" className="btn-primary" disabled={busy || needPhoto || recording} onClick={submit}>
          <CheckCircle2 size={18} /> {busy ? t('workPage.saving', 'Saving…') : label}
        </button>
      </ActionBar>
    </>
  );
}

/* A picked file as a tile. Revoked on unmount only, which under StrictMode's
   mount-cleanup-mount would kill a live URL, so the cleanup is skipped in dev
   (at most 5 small blobs, freed on page unload). */
function FilePreview({ file, onRemove }) {
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => { if (!import.meta.env.DEV) URL.revokeObjectURL(url); }, [url]);
  return <PhotoTile src={url} size={80} onRemove={onRemove} />;
}

/* Waiting for the master: a calm note and an optional extra note. */
function NoteForm({ stage, busy, error, save }) {
  const { t } = useLanguage();
  const [openNote, setOpenNote] = useState(false);
  const [text, setText] = useState('');
  const [clip, setClip] = useState(null);
  const [recording, setRecording] = useState(false);
  return (
    <>
      <div className="wk-form">
        <div className="wk-calm">{t('workPage.sentForChecking', 'Sent for checking. The master will look at it.')}</div>
        {openNote && (
          <>
            <div className="wk-note-box">
              <VoiceTextarea className="form-control" rows={2} value={text} onChange={(e) => setText(e.target.value)}
                             placeholder={t('workPage.notePlaceholder', 'Anything the master should know (optional)')}
                             onRecording={setClip} onRecordingChange={setRecording} autoFocus />
            </div>
            {clip && <VoiceClipPreview blob={clip} onRemove={() => setClip(null)} />}
          </>
        )}
      </div>
      <ActionBar error={error}>
        {!openNote
          ? <button type="button" className="btn-secondary" onClick={() => setOpenNote(true)}>{t('workPage.addNote', 'Add a note')}</button>
          : (
            <button type="button" className="btn-primary" disabled={busy || recording || (!text.trim() && !clip)}
                    onClick={() => save(stage.status, text, [], clip, t('workPage.noteSaved', 'Note saved.'))}>
              {busy ? t('workPage.saving', 'Saving…') : t('workPage.saveNote', 'Save note')}
            </button>
          )}
      </ActionBar>
    </>
  );
}

/* Approve, or send back with a reason. */
function CheckForm({ stage, busy, error, save }) {
  const { t } = useLanguage();
  const [sending, setSending] = useState(false);
  const [reason, setReason] = useState('');
  const [clip, setClip] = useState(null);
  const [recording, setRecording] = useState(false);
  const boxRef = useRef(null);
  const who = stage.performed_by_name || stage.assigned_to_name || t('workPage.theWorker', 'the worker');
  const ready = reason.trim().length > 0 || clip;

  useEffect(() => { if (sending) boxRef.current?.scrollIntoView({ block: 'nearest' }); }, [sending]);

  return (
    <>
      {sending && (
        <div className="wk-form" ref={boxRef}>
          <div className="wk-note-box">
            <VoiceTextarea className="form-control" rows={3} value={reason} onChange={(e) => setReason(e.target.value)}
                           placeholder={t('workPage.sendBackReason', 'Say what needs to be redone')}
                           onRecording={setClip} onRecordingChange={setRecording} autoFocus />
          </div>
          {clip && <VoiceClipPreview blob={clip} onRemove={() => setClip(null)} />}
        </div>
      )}
      <ActionBar error={error}>
        {sending ? (
          <>
            {!ready && <div className="wk-hint">{t('workPage.reasonRequired', 'A reason is needed so the worker knows what to fix')}</div>}
            <button type="button" className="btn-primary" disabled={busy || recording || !ready}
                    onClick={() => save('IN_PROGRESS', reason.trim() || t('workPage.seeVoiceNote', 'See voice note'), [], clip,
                      t('workPage.sentBackToast', 'Sent back to {who}.', { who }))}>
              {busy ? t('workPage.saving', 'Saving…') : t('workPage.sendBackTo', 'Send back to {who}', { who })}
            </button>
            <button type="button" className="btn-secondary" disabled={busy} onClick={() => setSending(false)}>
              <CloseIcon size={16} /> {t('workPage.cancel', 'Cancel')}
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn-primary" disabled={busy}
                    onClick={() => save('COMPLETED', '', [], null, t('workPage.approved', 'Approved.'))}>
              <CheckCircle2 size={18} /> {busy ? t('workPage.saving', 'Saving…') : t('workPage.approve', 'Approve')}
            </button>
            <button type="button" className="btn-secondary" disabled={busy} onClick={() => setSending(true)}>
              {t('workPage.sendBack', 'Send back')}
            </button>
          </>
        )}
      </ActionBar>
    </>
  );
}
