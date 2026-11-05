import { useState } from 'react';
import { api } from '../../../api';
import { LIMITS } from '../../../utils/validate';
import { nowForInput, timesError } from '../attendanceTimes';
import { Banner } from './attendanceParts';

/** The owner entering attendance by hand. */

export default function RecordForm({ roster, onCancel, onSaved }) {
  const [staff, setStaff] = useState(roster[0]?.id || '');
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    const problem = timesError(checkIn, checkOut);
    if (problem) { setError(problem); return; }
    setBusy(true);
    setError(null);
    try {
      await api.recordAttendance({
        staff, check_in: checkIn, check_out: checkOut || undefined, note,
      });
      onSaved();
    } catch (err) {
      setError(err.message || 'Could not record that attendance.');
    } finally {
      setBusy(false);
    }
  };

  const label = { fontSize: '12px', color: 'var(--text-secondary)' };

  return (
    <form onSubmit={submit}>
      {error && <Banner text={error} />}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '14px' }}>
        <label style={label} htmlFor="rec-staff">Staff member</label>
        <select id="rec-staff" value={staff} onChange={(e) => setStaff(e.target.value)} required>
          {roster.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <div
        className="mobile-stack-grid"
        style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <label style={label} htmlFor="rec-in">Check in</label>
          <input id="rec-in" type="datetime-local" value={checkIn} max={nowForInput()}
                 onChange={(e) => setCheckIn(e.target.value)} required />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <label style={label} htmlFor="rec-out">Check out</label>
          <input id="rec-out" type="datetime-local" value={checkOut} min={checkIn || undefined} max={nowForInput()}
                 onChange={(e) => setCheckOut(e.target.value)} />
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginTop: '14px' }}>
        <label style={label} htmlFor="rec-note">Note</label>
        <input id="rec-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={LIMITS.note}
               placeholder="Manual entry" />
      </div>
      <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '12px' }}>
        Recorded as entered by you, so it stays distinguishable from a staff check-in.
      </p>
      <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '18px' }}>
        <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? 'Saving…' : 'Record attendance'}
        </button>
      </div>
    </form>
  );
}
