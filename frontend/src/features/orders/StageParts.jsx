/* "Split into parts": one step shared between several people of the same
   kind of work (a rush blouse's Stitching: Front, Back, Sleeve to three
   tailors). Shown to whoever hands work out -- the Owner in the stage panel,
   a Master or Designer on the job sheet. Parts go only to staff (never a
   Master or Designer), only of the roles the step allows; one person may
   hold several. The split can be changed or undone until a part starts
   (domains/orders/stage_parts.py). */
import { useEffect, useState } from 'react';
import { Plus, Scissors, X } from 'lucide-react';

import { api } from '../../services/api';
import { resolveMediaUrl } from '../../services/media';
import { ASSIGN_ONLY_TO } from '../../constants/roles';

const NOT_A_PART_HOLDER = ['Owner', 'Master', 'Designer'];
const SPLITTABLE = ['NOT_STARTED', 'IN_PROGRESS', 'PAUSED'];
const MAX_PARTS = 10;

const UPPER = ['Front', 'Back', 'Sleeve', 'Neck'];
/** Part names offered first for a garment (its template key); anything can be typed too. */
const SUGGESTIONS = {
  blouse: ['Front', 'Back', 'Neck', 'Sleeve'], lehenga_blouse: ['Front', 'Back', 'Neck', 'Sleeve'],
  saree: ['Pallu', 'Border', 'Body', 'Pleat'],
  lehenga: ['Front panel', 'Back panel', 'Waistband', 'Border', 'Lining'],
  trouser: ['Left leg', 'Right leg', 'Waistband'], jeans: ['Left leg', 'Right leg', 'Waistband'],
  shorts: ['Left leg', 'Right leg', 'Waistband'], salwar: ['Left leg', 'Right leg', 'Waistband'],
  churidar: ['Left leg', 'Right leg', 'Waistband'], palazzo: ['Left leg', 'Right leg', 'Waistband'],
  sharara: ['Left leg', 'Right leg', 'Waistband'], bottom_wear: ['Left leg', 'Right leg', 'Waistband'],
  mens_bottom_wear: ['Left leg', 'Right leg', 'Waistband'],
  dupatta: ['Border', 'Body', 'Edges'],
};

const STATUS = {
  NOT_STARTED: ['Not started', 'neutral'], IN_PROGRESS: ['In progress', 'warning'],
  PENDING_VERIFICATION: ['Sent for checking', 'info'], COMPLETED: ['Done', 'success'],
};

/** The roles a part of this step may go to (stage_parts.part_roles). */
const partRolesFor = (stageKey, workflowConfig = []) => {
  const roles = (workflowConfig.find((s) => s.key === stageKey)?.roles || []).filter((r) => !NOT_A_PART_HOLDER.includes(r));
  const only = ASSIGN_ONLY_TO[stageKey];
  return only ? roles.filter((r) => only.includes(r)) : roles;
};

export default function StageParts({ order, stage, workflowConfig = [], onChanged }) {
  const roles = partRolesFor(stage.stage_key, workflowConfig);
  const parts = stage.parts || [];
  const [staff, setStaff] = useState(null);
  const [editing, setEditing] = useState(null); // [{ label, tailor_id }] while the split is being written
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [back, setBack] = useState(null); // { id, note } while a part is being sent back

  useEffect(() => {
    if (!roles.length) return;
    api.getAssignableStaff().then(setStaff).catch(() => setStaff([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage.stage_key]);

  if (!roles.length) return null; // an Owner/Master-only step does not split
  if (!parts.length && !SPLITTABLE.includes(stage.status)) return null;

  const people = (staff || []).filter((s) => roles.includes(s.role));
  const templateKey = (order.garment_jobs || []).find((j) => j.id === stage.garment_job)?.template_key
    || (order.garment_jobs || [])[0]?.template_key;
  const suggestions = SUGGESTIONS[templateKey] || UPPER;
  const untouched = parts.every((p) => p.status === 'NOT_STARTED');
  const run = async (work) => {
    setBusy(true); setError('');
    // onChanged gets the order as the server now has it.
    try { const fresh = await work(); onChanged?.(fresh); return true; } catch (e) { setError(e?.message || 'Could not save. Please try again.'); return false; } finally { setBusy(false); }
  };

  // Writing (or rewriting) the split.
  if (editing) {
    const used = new Set(editing.map((r) => r.label.trim().toLowerCase()));
    const set = (i, patch) => setEditing(editing.map((r, n) => (n === i ? { ...r, ...patch } : r)));
    const save = () => run(() => api.splitStage(order.id, stage.stage_key,
      editing.map((r) => ({ label: r.label.trim(), tailor_id: r.tailor_id ? Number(r.tailor_id) : null })), stage.garment_job || null))
      .then((ok) => { if (ok) setEditing(null); });
    return (
      <section className="sp">
        <div className="sp-head">
          <span className="sp-title"><Scissors size={16} /> Split {stage.stage_name} into parts</span>
          <span className="sp-sub">Each part goes to one person; they work at the same time. One person can take more than one part.</span>
        </div>
        <div className="sp-chips" aria-label="Suggested parts">
          {suggestions.filter((s) => !used.has(s.toLowerCase())).map((s) => (
            <button key={s} type="button" className="sp-chip" disabled={editing.length >= MAX_PARTS}
                    onClick={() => setEditing([...editing.filter((r) => r.label.trim() || r.tailor_id), { label: s, tailor_id: '' }])}>
              <Plus size={13} /> {s}
            </button>
          ))}
        </div>
        <div className="sp-rows">
          {editing.map((row, i) => (
            <div className="sp-row" key={i}>
              <input className="form-control" type="text" maxLength={60} value={row.label} placeholder="Part (e.g. Front)"
                     aria-label={`Part ${i + 1} name`} onChange={(e) => set(i, { label: e.target.value })} />
              <select className="form-control" value={row.tailor_id} aria-label={`Who does part ${i + 1}`}
                      onChange={(e) => set(i, { tailor_id: e.target.value })} disabled={!staff}>
                <option value="">{staff ? 'Choose who' : 'Loading…'}</option>
                {people.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.role}</option>)}
              </select>
              <button type="button" className="sp-remove" aria-label={`Remove part ${i + 1}`}
                      onClick={() => setEditing(editing.filter((_, n) => n !== i))}><X size={16} /></button>
            </div>
          ))}
        </div>
        {staff && people.length === 0 && (
          <div className="sp-note">No {roles.join(' or ')} on the team to give a part to.</div>
        )}
        {error && <div className="sp-error" role="alert">{error}</div>}
        <div className="sp-actions">
          <button type="button" className="btn-secondary at-btn-sm" disabled={busy || editing.length >= MAX_PARTS}
                  onClick={() => setEditing([...editing, { label: '', tailor_id: '' }])}><Plus size={15} /> Add part</button>
          <span className="sp-actions-end">
            <button type="button" className="btn-secondary at-btn-sm" disabled={busy} onClick={() => { setEditing(null); setError(''); }}>Cancel</button>
            <button type="button" className="btn-primary at-btn-sm" disabled={busy || editing.length < 2} onClick={save}>
              {busy ? 'Saving…' : 'Save split'}
            </button>
          </span>
        </div>
      </section>
    );
  }

  // Not split: the way in.
  if (!parts.length) {
    return (
      <section className="sp sp--closed">
        <button type="button" className="btn-secondary at-btn-sm sp-open"
                onClick={() => setEditing([{ label: suggestions[0] || '', tailor_id: '' }, { label: suggestions[1] || '', tailor_id: '' }])}>
          <Scissors size={15} /> Split into parts
        </button>
        <span className="sp-sub">Several {roles.join(' / ')} on this step at once (Front, Back, Sleeve…).</span>
      </section>
    );
  }

  // Split: who has what, and how far each has got. A part sent (or marked
  // done) can be sent back on its own while its step is not yet approved.
  const done = parts.filter((p) => p.status === 'PENDING_VERIFICATION' || p.status === 'COMPLETED').length;
  const settled = stage.status === 'COMPLETED' || stage.status === 'SKIPPED';
  const sendBack = () => run(() => api.transitionPart(order.id, back.id, 'IN_PROGRESS', back.note.trim()))
    .then((ok) => { if (ok) setBack(null); });
  return (
    <section className="sp">
      <div className="sp-head">
        <span className="sp-title"><Scissors size={16} /> Split into {parts.length} parts</span>
        <span className="sp-sub">{done} of {parts.length} sent. The step goes for checking when every part is sent.</span>
      </div>
      <div className="sp-list">
        {parts.map((p) => {
          const [label, tone] = STATUS[p.status] || [p.status, 'neutral'];
          const sent = p.status === 'PENDING_VERIFICATION' || p.status === 'COMPLETED';
          return (
            <div className="sp-item" key={p.id}>
              <span className="sp-item-name">{p.label}</span>
              {sent || !staff ? (
                <span className="sp-item-who">{p.assigned_to_name || '—'}</span>
              ) : (
                <select className="form-control sp-item-select" value={p.assigned_to || ''} disabled={busy}
                        aria-label={`Who does ${p.label}`}
                        onChange={(e) => e.target.value && run(() => api.assignPart(order.id, p.id, Number(e.target.value)))}>
                  {!p.assigned_to && <option value="">Choose who</option>}
                  {people.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.role}</option>)}
                </select>
              )}
              <span className={`ui-badge ui-badge--${tone}`}>{label}</span>
              {(p.attachments || []).length > 0 && (
                <span className="sp-thumbs">
                  {p.attachments.slice(-3).map((u) => (
                    <a key={u} href={resolveMediaUrl(u)} target="_blank" rel="noreferrer"><img src={resolveMediaUrl(u)} alt={`${p.label} photo`} /></a>
                  ))}
                </span>
              )}
              {sent && !settled && back?.id !== p.id && (
                <button type="button" className="sp-back" disabled={busy} onClick={() => setBack({ id: p.id, note: '' })}>Send back</button>
              )}
              {back?.id === p.id && (
                <div className="sp-back-box">
                  <textarea className="form-control" rows={2} autoFocus value={back.note} maxLength={2000}
                            placeholder={`What should ${p.assigned_to_name || 'they'} redo on the ${p.label.toLowerCase()}?`}
                            onChange={(e) => setBack({ ...back, note: e.target.value })} />
                  <span className="sp-actions-end">
                    <button type="button" className="btn-secondary at-btn-sm" disabled={busy} onClick={() => setBack(null)}>Cancel</button>
                    <button type="button" className="btn-primary at-btn-sm" disabled={busy || !back.note.trim()} onClick={sendBack}>
                      {busy ? 'Sending…' : `Send ${p.label} back`}
                    </button>
                  </span>
                </div>
              )}
              {p.status === 'IN_PROGRESS' && p.verification_note && (
                <div className="sp-item-note">Sent back: {p.verification_note}</div>
              )}
            </div>
          );
        })}
      </div>
      {error && <div className="sp-error" role="alert">{error}</div>}
      {untouched && (
        <div className="sp-actions">
          <button type="button" className="btn-secondary at-btn-sm" disabled={busy}
                  onClick={() => setEditing(parts.map((p) => ({ label: p.label, tailor_id: p.assigned_to || '' })))}>Change split</button>
          <button type="button" className="btn-secondary at-btn-sm" disabled={busy}
                  onClick={() => run(() => api.unsplitStage(order.id, stage.stage_key, stage.garment_job || null))}>Undo split</button>
        </div>
      )}
    </section>
  );
}
