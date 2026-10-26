
import { useState } from 'react';

import { api } from '../../services/api';
import { LIMITS } from '../../services/validate';
import { forInput, nowForInput, timesError } from './attendanceTimes';

// Shared by Attendance and by Payroll, which corrects a draft week's sessions
// in place. Its own module so the two screens need not import each other.

function ErrorBanner({ text }) {
  return (
    <div style={{
      background: 'rgba(220,80,60,0.12)', border: '1px solid rgba(220,80,60,0.35)',
      color: 'var(--danger-color)', borderRadius: '8px', padding: '10px 12px',
      fontSize: '13px', marginBottom: '14px',
    }}>
      {text}
    </div>
  );
}

export function CorrectionForm({ session, onCancel, onSaved }) {

  const [checkIn, setCheckIn] = useState(() => forInput(session.check_in));
  const [checkOut, setCheckOut] = useState(() => forInput(session.check_out));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    const problem = timesError(checkIn, checkOut) || (!reason.trim() ? 'Give a reason for the change.' : '');
    if (problem) { setError(problem); return; }
    setBusy(true);
    setError(null);
    try {
      await api.correctAttendance(session.id, {
        check_in: checkIn || undefined,
        check_out: checkOut || undefined,
        reason,
      });
      onSaved();
    } catch (err) {
      setError(err.message || 'Could not save that correction.');
    } finally {
      setBusy(false);
    }
  };

  const label = { fontSize: '12px', color: 'var(--text-secondary)' };

  return (
    <form onSubmit={submit}>
      {error && <ErrorBanner text={error} />}
      <div
        className="mobile-stack-grid"
        style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <label style={label} htmlFor="corr-in">Check in</label>
          <input id="corr-in" type="datetime-local" value={checkIn} max={nowForInput()}
                 onChange={(e) => setCheckIn(e.target.value)} required />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <label style={label} htmlFor="corr-out">Check out</label>
          <input id="corr-out" type="datetime-local" value={checkOut} min={checkIn || undefined} max={nowForInput()}
                 onChange={(e) => setCheckOut(e.target.value)} />
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginTop: '14px' }}>
        <label style={label} htmlFor="corr-reason">Reason for the change</label>
        <input id="corr-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={LIMITS.reason}
               placeholder="Forgot to check in" required />
      </div>
      <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '12px' }}>
        The original times stay on the record, along with who changed them and why.
      </p>
      <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '18px' }}>
        <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save correction'}
        </button>
      </div>
    </form>
  );
}
