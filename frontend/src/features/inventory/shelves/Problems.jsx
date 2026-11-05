import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../api';
import { Modal } from '../inventoryForm';
import Loader from '../../../components/ui/Loader';

/** Problems: shelf figures that need checking, and marking them fixed. */

export default function Problems({ location, canManage, onChange }) {
  const [status, setStatus] = useState('OPEN');
  const [rows, setRows] = useState(null);
  const [fixing, setFixing] = useState(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(() => api.getShelfIssues({ status, location: location.id })
    .then((d) => setRows(d?.results || []))
    .catch((err) => { setError(err.message); setRows([]); }), [status, location.id]);
  useEffect(() => { load(); }, [load]);

  const fix = async () => {
    try {
      await api.resolveShelfIssue(fixing.id, note);
      setFixing(null); setNote('');
      await Promise.all([load(), onChange()]);
    } catch (err) { setError(err.message); }
  };

  return (
    <div className="sh-panel">
      <div className="sh-title-row">
        <h3 className="sh-title">Problems</h3>
        <div className="at-seg" role="group" aria-label="Show">
          <button type="button" aria-pressed={status === 'OPEN'} onClick={() => { setRows(null); setStatus('OPEN'); }}>To check</button>
          <button type="button" aria-pressed={status === 'RESOLVED'} onClick={() => { setRows(null); setStatus('RESOLVED'); }}>Fixed</button>
        </div>
      </div>
      <p className="sh-muted">When the app had to guess which shelf stock came from, or a count did not match, it says so here. Fix it on the shelf (count it, move it), then mark it fixed.</p>
      {error && <div className="sh-error" role="alert">{error}</div>}
      {rows === null ? <Loader label="Loading…" /> : rows.length === 0 ? (
        <div className="sh-empty">{status === 'OPEN' ? 'Nothing to check. 🎉' : 'Nothing fixed yet.'}</div>
      ) : rows.map((r) => (
        <div key={r.id} className="sh-card sh-issue">
          <div className="sh-card-head">
            <span className={`ui-badge ui-badge--${r.status === 'OPEN' ? 'warning' : 'success'}`}>{r.kind_label}</span>
            <span className="sh-muted">{new Date(r.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
          </div>
          <p className="sh-issue-text">{r.message}</p>
          {r.status === 'RESOLVED' && (
            <div className="sh-muted">Fixed by {r.resolved_by || '—'}{r.resolution_note ? `: ${r.resolution_note}` : ''}</div>
          )}
          {r.status === 'OPEN' && canManage && (
            <div className="sh-actions"><button type="button" className="btn-secondary" onClick={() => { setFixing(r); setNote(''); }}>Mark fixed</button></div>
          )}
        </div>
      ))}
      {fixing && (
        <Modal title="Mark fixed" onClose={() => setFixing(null)}>
          <div className="sh-form">
            <p className="sh-issue-text">{fixing.message}</p>
            <label className="sh-field-label" htmlFor="sh-fix-note">What you found or did (optional)</label>
            <textarea id="sh-fix-note" className="form-control" rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
            <p className="sh-muted">Marking it fixed does not change any stock — a count or a move does.</p>
            <div className="sh-actions">
              <button type="button" className="btn-secondary" onClick={() => setFixing(null)}>Cancel</button>
              <button type="button" className="btn-primary" onClick={fix}>Mark fixed</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
