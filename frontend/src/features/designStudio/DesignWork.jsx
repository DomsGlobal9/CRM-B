import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle, Calendar, Check, ChevronRight, ClipboardList, Clock, FileText, RotateCcw, Send, Shirt, User,
} from 'lucide-react';

import { api } from '../../api';
import { orderRef } from '../../utils/format';
import { resolveMediaUrl } from '../../services/media';
import { useLanguage } from '../../i18n/LanguageContext.jsx';
import { AvatarInitials, Field, FormModal, SearchBar, SectionCard, StatusBadge } from '../../components/ui/Atelier';
import { DataTable } from '../../components/ui/DataTable';
import { LIMITS, todayIso } from '../../utils/validate';
import { VoiceNotePlayer, VoiceRecorder } from '../../components/ui/VoiceTextarea';
import { voiceNoteList } from '../../components/ui/voiceNotes';
import { EXTRA_MEASUREMENTS, extraMeasurements } from '../catalog/templates';
import Loader from '../../components/ui/Loader';

const STATUS_STYLE = {
  ASSIGNED: { label: 'Assigned', tone: 'neutral', icon: ClipboardList },
  SUBMITTED: { label: 'Awaiting review', tone: 'info', icon: Clock },
  APPROVED: { label: 'Approved', tone: 'success', icon: Check },
  CHANGES_REQUESTED: { label: 'Changes requested', tone: 'warning', icon: RotateCcw },
};

function StatusPill({ status }) {
  const { t } = useLanguage();
  const style = STATUS_STYLE[status] || { label: status, tone: 'neutral', icon: ClipboardList };
  const keyMap = {
    ASSIGNED: 'assigned',
    SUBMITTED: 'awaitingReview',
    APPROVED: 'approved',
    CHANGES_REQUESTED: 'changesRequested'
  };
  const label = keyMap[status] ? t(`designWorkPage.${keyMap[status]}`, style.label) : style.label;
  const Icon = style.icon;
  return (
    <span className={`ui-badge ui-badge--${style.tone}`} style={{ gap: '5px', whiteSpace: 'nowrap' }}>
      <Icon size={12} /> {label}
    </span>
  );
}

function formatDate(value) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * The Design Request form, in its own popup: pick a garment and a designer, then
 * say what is wanted in words, by voice, or both. The voice notes reach the
 * designer with the brief.
 */
export function DesignRequestForm({ currentUser, onClose, onSent }) {
  const { t } = useLanguage();
  const [orders, setOrders] = useState([]);
  const [designers, setDesigners] = useState([]);
  const [jobId, setJobId] = useState('');
  const [designerId, setDesignerId] = useState('');
  const [brief, setBrief] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [voiceNotes, setVoiceNotes] = useState([]);
  // A clip being recorded, or recorded and not yet added, would be lost by sending.
  const [clipPending, setClipPending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getDesigners().then(d => setDesigners(d.results || d || [])).catch(() => {});
    api.getOrders().then(o => setOrders(o.results || o || [])).catch(() => {});
  }, []);

  const garmentOptions = orders.flatMap(order =>
    (order.garment_jobs || []).map(job => ({
      id: job.id,
      label: `${orderRef(order)} · ${job.display_name || job.template_name || 'Custom garment'}`,
    })));

  const addVoiceNote = async (blob) => {
    const url = await api.uploadVoiceNote(blob);
    const by = [currentUser?.first_name, currentUser?.last_name].filter(Boolean).join(' ') || currentUser?.name || currentUser?.email || '';
    setVoiceNotes((notes) => [...notes, { url, by, at: new Date().toISOString() }]);
  };

  const submit = async () => {
    if (!jobId || !designerId) return;
    if (dueDate && dueDate < todayIso()) { setError('The due date cannot be in the past.'); return; }
    setBusy(true);
    setError('');
    try {
      await api.assignDesignWork({
        garment_job: jobId,
        designer: designerId,
        brief,
        ...(dueDate ? { due_date: dueDate } : {}),
        ...(voiceNotes.length ? { voice_notes: voiceNotes } : {}),
      });
      onSent();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <FormModal
      icon={ClipboardList} tone="green" width="760px"
      title={t('designsPage.designRequestBtn', 'Design Request')}
      subtitle="Select a garment, assign a designer, set a due date and add any notes."
      onClose={onClose}
      footer={(
        <>
          {clipPending && (
            <span className="at-field-hint" style={{ marginRight: 'auto' }}>
              {t('designWorkPage.finishVoiceNote', 'Add or delete the voice note before sending.')}
            </span>
          )}
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            {t('common.cancel', 'Cancel')}
          </button>
          <button type="button" className="btn-primary" onClick={submit}
                  disabled={busy || clipPending || !jobId || !designerId}>
            <Send size={15} /> {busy ? t('designWorkPage.assigningBtn', 'Assigning…') : t('designWorkPage.assignBtn', 'Assign Work')}
          </button>
        </>
      )}
    >
      {error && (
        <div role="alert" style={{ color: 'var(--danger-color)', marginBottom: 'var(--space-3)' }}>
          <AlertCircle size={14} style={{ verticalAlign: '-2px' }} /> {error}
        </div>
      )}
      <div className="at-form-grid at-form-grid--3">
        <Field label={t('designWorkPage.garment', 'Garment')} required icon={Shirt}>
          <select className="form-input" value={jobId} required onChange={(e) => setJobId(e.target.value)}>
            <option value="">{t('designWorkPage.chooseGarment', 'Choose a garment…')}</option>
            {garmentOptions.map(option => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </Field>
        <Field label={t('designWorkPage.designer', 'Designer')} required icon={User}>
          <select className="form-input" value={designerId} required onChange={(e) => setDesignerId(e.target.value)}>
            <option value="">{t('designWorkPage.chooseDesigner', 'Choose a designer…')}</option>
            {designers.map(designer => (
              <option key={designer.id} value={designer.id}>{designer.name}</option>
            ))}
          </select>
        </Field>
        <Field label={t('designWorkPage.dueDate', 'Due date')} icon={Calendar}>
          <input type="date" className="form-input" min={todayIso()} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
      </div>
      <Field label={t('designWorkPage.briefOptional', 'Brief / Notes (optional)')} icon={FileText}>
        <textarea className="form-input" rows={3} value={brief} maxLength={LIMITS.note} style={{ minHeight: '88px' }}
                  placeholder={t('designWorkPage.briefPlaceholder', 'What are you asking for, beyond the spec?')}
                  onChange={(e) => setBrief(e.target.value)} />
      </Field>
      <div className="at-field-counter" style={{ marginTop: '-8px' }}>{brief.length} / {LIMITS.note} characters</div>
      <VoiceRecorder notes={voiceNotes} disabled={busy} sendLabel="Add" onPendingChange={setClipPending}
                     onSend={addVoiceNote}
                     onDelete={(index) => setVoiceNotes((notes) => notes.filter((_, i) => i !== index))} />
    </FormModal>
  );
}

/** The designer's end: choose one of your designs and hand it back. */
function SubmitPanel({ assignment, designs, onSubmitted, onError }) {
  const { t } = useLanguage();
  const [designId, setDesignId] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!designId) return;
    setBusy(true);
    try {
      await api.submitDesignAssignment(assignment.id, designId, note);
      onSubmitted();
    } catch (error) {
      onError(error.message);
    } finally {
      setBusy(false);
    }
  };

  if (!designs.length) {
    return (
      <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '10px' }}>
        {t('designWorkPage.uploadDesignFirst', 'Upload a design in the Design Studio first, then submit it here.')}
      </p>
    );
  }

  return (
    <div style={{ marginTop: '12px', display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'flex-end' }}>
      <label style={{ flex: '1 1 200px' }}>
        <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{t('designWorkPage.yourDesign', 'Your design')}</span>
        <select className="form-input" value={designId} onChange={(e) => setDesignId(e.target.value)}>
          <option value="">{t('designWorkPage.chooseDesign', 'Choose a design…')}</option>
          {designs.map(design => (
            <option key={design.id} value={design.id}>{design.title}</option>
          ))}
        </select>
      </label>
      <label style={{ flex: '2 1 240px' }}>
        <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{t('designWorkPage.noteOptional', 'Note (optional)')}</span>
        <input className="form-input" value={note} maxLength={LIMITS.reason} onChange={(e) => setNote(e.target.value)}
               placeholder={t('designWorkPage.notePlaceholderDesigner', 'Anything the owner should know')} />
      </label>
      <button className="btn-primary" disabled={busy || !designId} onClick={submit}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
        <Send size={14} /> {busy ? t('designWorkPage.submittingBtn', 'Submitting…') : t('designWorkPage.submitDesignBtn', 'Submit design')}
      </button>
    </div>
  );
}

/** A Designer handing an approved design to the workshop. The list comes from
 *  the server, which only offers people this Designer may assign (Master and
 *  the workers below), and the endpoint refuses anyone else regardless. */
function HandOverPanel({ assignment, onHandedOver, onError }) {
  const [staff, setStaff] = useState(null);
  const [master, setMaster] = useState('');
  const [worker, setWorker] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    api.getAssignableStaff().then(setStaff).catch((error) => onError(error.message));
  }, [onError]);

  const masters = (staff || []).filter((s) => s.role === 'Master');
  const workers = (staff || []).filter((s) => s.role !== 'Master');

  const handOver = async () => {
    if (!master && !worker) return;
    setBusy(true);
    try {
      await api.sendToWorkshop(assignment.order_pk, { master: master || null, tailor: worker || null });
      setDone(true);
      onHandedOver();
    } catch (error) {
      onError(error.message);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '10px' }}>
        Handed over. The Master starts it in the workshop.
      </p>
    );
  }

  return (
    <div style={{ marginTop: '12px', display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'flex-end' }}>
      <label style={{ flex: '1 1 180px' }}>
        <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Master in charge</span>
        <select className="form-input" value={master} onChange={(e) => setMaster(e.target.value)}>
          <option value="">Choose a Master…</option>
          {masters.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </label>
      <label style={{ flex: '1 1 180px' }}>
        <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Worker (optional)</span>
        <select className="form-input" value={worker} onChange={(e) => setWorker(e.target.value)}>
          <option value="">Choose a worker…</option>
          {workers.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.role}</option>)}
        </select>
      </label>
      <button className="btn-primary" disabled={busy || staff === null || (!master && !worker)} onClick={handOver}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
        <Send size={14} /> {busy ? 'Handing over…' : 'Hand over to workshop'}
      </button>
    </div>
  );
}

function AssignmentCard({ assignment, isSupervisor, canHandOver = false, designs, onChanged, onError, embedded = false }) {
  const { t } = useLanguage();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const design = assignment.design_detail;

  const review = async (decision) => {
    // A designer sent back with no reason cannot act on it.
    if (decision === 'changes' && !note.trim()) { onError('Say what needs changing before sending it back.'); return; }
    setBusy(true);
    try {
      await api.reviewDesignAssignment(assignment.id, decision, note);
      setNote('');
      onChanged();
    } catch (error) {
      onError(error.message);
    } finally {
      setBusy(false);
    }
  };

  const spec = assignment.spec || {};
  const measurements = assignment.measurements || {};

  return (
    <div className={embedded ? '' : 'ui-card'} style={embedded ? {} : { marginBottom: '12px', padding: 'var(--space-5)' }}>
      {!embedded && (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <h4 style={{ margin: 0, fontFamily: 'var(--font-serif)', fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--text-primary)' }}>{assignment.garment_name}</h4>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '3px' }}>
              {assignment.order_reference || assignment.order_id || assignment.order_ref}
              {isSupervisor && assignment.customer_name ? ` · ${assignment.customer_name}` : ''}
              {isSupervisor ? ` · ${assignment.designer_name}` : ''}
              {assignment.due_date ? ` · due ${formatDate(assignment.due_date)}` : ''}
            </div>
          </div>
          <StatusPill status={assignment.status} />
        </div>
      )}

      {assignment.brief && (
        <p style={{ fontSize: '13px', marginTop: '10px' }}>{assignment.brief}</p>
      )}
      {/* The brief as the counter spoke it, recorded with the order. */}
      {/* Up to ten of them (brief_voice_notes); an older brief has its one. */}
      {voiceNoteList(assignment.brief_voice_notes, assignment.brief_voice_note).map((note, i) => (
        <VoiceNotePlayer key={`${note.url}:${i}`} src={note.url} style={{ marginTop: '10px' }} />
      ))}

      {!isSupervisor && (Object.keys(spec).length > 0 || Object.keys(measurements).length > 0) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' }}>
          {[...Object.entries({ ...spec, ...measurements }).filter(([key]) => key !== EXTRA_MEASUREMENTS),
            ...extraMeasurements(measurements).map((row) => [String(row.label ?? '').trim(), `${String(row.value ?? '').trim()} in`])]
            .filter(([, value]) => !/^[0-9a-f]{8}-[0-9a-f]{4}/.test(String(value)))
            .map(([key, value]) => (
            <span key={key} style={{
              fontSize: '11px', padding: '2px 8px', borderRadius: 'var(--radius-sm)',
              background: 'var(--surface-inset)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)',
            }}>
              {key.replace(/_/g, ' ')}: {Array.isArray(value) && value.some((v) => v && v.url)
                ? `${value.length} voice note${value.length === 1 ? '' : 's'}` : String(value)}
            </span>
          ))}
        </div>
      )}

      {assignment.review_note && assignment.status === 'CHANGES_REQUESTED' && (
        <p style={{
          fontSize: '12px', marginTop: '10px', padding: '8px 10px', borderRadius: 'var(--radius-md)',
          background: 'var(--warning-bg)', color: 'var(--warning-text)',
        }}>
          <AlertCircle size={12} style={{ verticalAlign: '-2px' }} /> {assignment.review_note}
        </p>
      )}

      {design && (
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '12px' }}>
          {design.image_url && (
            <img src={resolveMediaUrl(design.image_url)} alt={design.title}
                 style={{ width: '56px', height: '56px', objectFit: 'cover', borderRadius: 'var(--radius-sm)' }} />
          )}
          <div>
            <div style={{ fontWeight: 600, fontSize: '13px' }}>{design.title}</div>
            {assignment.submission_note && (
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                {assignment.submission_note}
              </div>
            )}
          </div>
        </div>
      )}

      {/* A designer submits while the work is theirs to do -- assigned, or sent
          back for changes. Approved work is finished and offers no control. */}
      {!isSupervisor && ['ASSIGNED', 'CHANGES_REQUESTED', 'SUBMITTED'].includes(assignment.status) && (
        <SubmitPanel assignment={assignment} designs={designs}
                     onSubmitted={onChanged} onError={onError} />
      )}

      {isSupervisor && assignment.status === 'SUBMITTED' && (
        <div style={{ marginTop: '12px', display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'flex-end' }}>
          <label style={{ flex: '1 1 240px' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{t('designWorkPage.noteOptional', 'Note (optional)')}</span>
            <input className="form-input" value={note} maxLength={LIMITS.reason} onChange={(e) => setNote(e.target.value)}
                   placeholder={t('designWorkPage.notePlaceholderSupervisor', 'What needs changing?')} />
          </label>
          <button className="btn-primary" disabled={busy} onClick={() => review('approve')}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <Check size={14} /> {t('designWorkPage.approveBtn', 'Approve')}
          </button>
          <button className="btn-secondary" disabled={busy} onClick={() => review('changes')}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <RotateCcw size={14} /> {t('designWorkPage.requestChangesBtn', 'Request changes')}
          </button>
        </div>
      )}

      {canHandOver && assignment.status === 'APPROVED' && assignment.order_pk && (
        <HandOverPanel assignment={assignment} onHandedOver={onChanged} onError={onError} />
      )}
    </div>
  );
}

export default function DesignWork({ currentUser, refreshToken = 0, onWaiting }) {
  // A role the owner handed design assignment (core/admin_access.py) runs
  // this board as the owner does.
  const handedAssign = (currentUser?.admin_tasks || []).includes('design.assign');
  // Not the Master: a Designer's work is not shown below them, and the
  // server refuses the Master these assignments (design_studio permissions).
  const isSupervisor = currentUser?.role === 'Owner' || handedAssign;
  const isDesigner = currentUser?.role === 'Designer';
  const mayRead = isSupervisor || isDesigner;

  const [assignments, setAssignments] = useState([]);
  const [myDesigns, setMyDesigns] = useState([]);
  const [openOnly, setOpenOnly] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      // Nobody else may read them, so nobody else asks.
      const rows = mayRead ? await api.getDesignAssignments(openOnly ? { open: '1' } : {}) : [];
      setAssignments(rows.results || rows || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [openOnly, mayRead]);

  useEffect(() => { load(); }, [load, refreshToken]);

  const waiting = assignments.filter((a) => a.status === 'SUBMITTED').length;
  useEffect(() => { onWaiting?.(waiting); }, [waiting, onWaiting]);

  const myDesignerId = assignments[0]?.designer || null;
  useEffect(() => {
    if (isSupervisor || !myDesignerId) return;
    api.getDesignLibrary({ designer: myDesignerId })
      .then(d => setMyDesigns(d.results || d || []))
      .catch(() => {});
  }, [isSupervisor, myDesignerId]);

  const { t } = useLanguage();
  const [search, setSearch] = useState('');
  const [openRow, setOpenRow] = useState(null);

  const needle = search.trim().toLowerCase();
  const shown = needle
    ? assignments.filter((a) => [a.garment_name, a.designer_name, a.customer_name, a.order_reference, a.order_id]
        .some((v) => (v || '').toLowerCase().includes(needle)))
    : assignments;

  // The first design waiting for review opens by itself, so its Approve button
  // is on screen; '' means someone closed it.
  const firstWaitingId = shown.find((a) => a.status === 'SUBMITTED')?.id;
  const isOpen = (a) => openRow === a.id || (openRow === null && firstWaitingId === a.id);

  const openFilter = (
    <label className="at-check-pill">
      <Clock size={14} style={{ color: 'var(--text-secondary)' }} />
      <input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} />
      {t('designWorkPage.onlyOpen', 'Only work still open')}
    </label>
  );

  return (
    <div className="at-stack">
      {error && (
        <div className="ui-card" style={{ color: 'var(--danger-color)', padding: 'var(--space-3) var(--space-4)' }}>
          <AlertCircle size={14} style={{ verticalAlign: '-2px' }} /> {error}
        </div>
      )}

      {loading ? (
        <Loader section label={t('common.loading', 'Loading…')} />
      ) : isSupervisor ? (
        <SectionCard className="dl-requests" icon={ClipboardList} tone="green" title="Assigned Design Work"
                     subtitle="Track all design assignments and approve what designers submit."
                     actions={waiting > 0 && (
                       <StatusBadge tone="warning" dot>
                         {t('designsPage.requestsWaiting', '{count} to review', { count: waiting })}
                       </StatusBadge>
                     )}>
          <div className="at-toolbar" style={{ margin: '0 0 var(--space-3)' }}>
            <SearchBar value={search} onChange={setSearch} placeholder="Search by garment, designer or customer…" style={{ maxWidth: '420px' }} />
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
              {openFilter}
              <span className="at-row-sub">{shown.length} of {assignments.length}</span>
            </span>
          </div>
          <DataTable
            fit={false}
            rows={shown}
            rowKey="id"
            caption="Assigned design work"
            onRowClick={(assignment) => setOpenRow(isOpen(assignment) ? '' : assignment.id)}
            rowProps={(assignment) => ({ 'aria-expanded': isOpen(assignment) })}
            rowDetail={(assignment) => isOpen(assignment) && (
              <AssignmentCard assignment={assignment} isSupervisor designs={myDesigns}
                              onChanged={load} onError={setError} embedded />
            )}
            empty={{
              icon: ClipboardList,
              title: assignments.length === 0
                ? t('designWorkPage.noWorkSupervisor', 'No design work outstanding. Assign a garment above to get started.')
                : 'Nothing matches that search.',
            }}
            columns={[
              { key: 'order', header: '#', cellProps: () => ({ style: { fontWeight: 700 } }),
                render: (a) => a.order_reference || a.order_id || a.order_ref },
              { key: 'garment', header: 'Garment', render: (a) => (
                <span className="at-cell-person">
                  <span className="at-thumb at-tile--amber">
                    {a.design_detail?.image_url ? <img src={resolveMediaUrl(a.design_detail.image_url)} alt="" /> : <Shirt size={18} />}
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span className="at-row-title" style={{ display: 'block' }}>{a.garment_name}</span>
                    {a.customer_name && <span className="at-row-sub">Customer: {a.customer_name}</span>}
                  </span>
                </span>
              ) },
              { key: 'designer', header: 'Designer', render: (a) => (
                <span className="at-cell-person">
                  <AvatarInitials name={a.designer_name} size={32} />
                  <span>{a.designer_name}</span>
                </span>
              ) },
              { key: 'due', header: 'Due Date', cellProps: () => ({ style: { whiteSpace: 'nowrap' } }), render: (a) => (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <Calendar size={14} style={{ color: 'var(--text-secondary)' }} />
                  {a.due_date ? formatDate(a.due_date) : '—'}
                </span>
              ) },
              { key: 'status', header: 'Status', render: (a) => <StatusPill status={a.status} /> },
              { key: 'notes', header: 'Notes', cellProps: () => ({ style: { color: 'var(--text-secondary)', maxWidth: '260px' } }), render: (a) => (
                <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {a.brief || a.submission_note || (a.brief_voice_note ? 'Voice note' : '—')}
                </span>
              ) },
              { key: 'open', header: <span className="ld-sr">Open</span>, label: false, align: 'right', render: (a) => (
                <ChevronRight size={16} style={{ color: 'var(--text-muted)', transform: isOpen(a) ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }} />
              ) },
            ]}
          />
        </SectionCard>
      ) : (
        <SectionCard className="dl-requests" icon={ClipboardList} tone="green"
                     title={t('nav.designWork', 'Design requests')}
                     subtitle={t('designsPage.requestsSubDesigner', 'The designs assigned to you, to work on and submit.')}
                     actions={openFilter}>
          {assignments.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 'var(--space-6)' }}>
              <ClipboardList size={28} style={{ color: 'var(--text-secondary)' }} />
              <p style={{ marginTop: '10px', color: 'var(--text-secondary)' }}>
                {t('designWorkPage.noWorkDesigner', 'Nothing on your desk right now.')}
              </p>
            </div>
          ) : (
            assignments.map(assignment => (
              <AssignmentCard key={assignment.id} assignment={assignment}
                              isSupervisor={isSupervisor} canHandOver={isDesigner} designs={myDesigns}
                              onChanged={load} onError={setError} />
            ))
          )}
        </SectionCard>
      )}
    </div>
  );
}
