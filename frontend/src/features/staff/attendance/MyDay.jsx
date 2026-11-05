import { useState, useEffect, useCallback } from 'react';
import { LogIn, LogOut, MapPin } from 'lucide-react';
import { api } from '../../../api';
import { currentLocationDetailed, locationProblem } from '../location';
import { clockText, hoursText, panel } from './attendanceHelpers';
import { Banner, WhereTag } from './attendanceParts';

/** A person's own check-in card. */

// Checks in with the device's position when it gives one; resolves to why it
// did not (null when it did), so the card can say what to do about it.
const checkInHere = async () => {
  const { location, reason } = await currentLocationDetailed();
  await api.checkIn(location ? { location } : undefined);
  return location ? null : reason;
};

// How long after checking in "Add my location" is offered (the server's
// ADD_LOCATION_WITHIN in apps/staff/attendance.py says the same).
const ADD_LOCATION_MINUTES = 30;

/**
 * The staff member's own card: one button, and what it did.
 *
 * The elapsed figure ticks locally off the server's check_in. It is a comfort
 * display -- the minutes that get paid are computed server-side at check-out
 * from two server stamps, and never from this number.
 */
export default function MyDay({ onChanged }) {
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  // Why the last check-in went without a position, in words, or ''.
  const [locNote, setLocNote] = useState('');

  const load = useCallback(async () => {
    try {
      setState(await api.getCurrentAttendance());
    } catch (err) {
      setError(err.message || 'Could not load your attendance.');
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);


  useEffect(() => {
    if (state?.state !== 'WORKING') return undefined;
    const id = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(id);
  }, [state?.state]);

  const act = async (fn) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
      onChanged?.();
    } catch (err) {
      setError(err.message || 'That did not work. Please try again.');
      // The server may have moved on regardless (an old check-in closed by the
      // 12-hour rule): show where things stand now, with the message above it.
      load();
    } finally {
      setBusy(false);
    }
  };

  // A failed load says so: hiding the card left staff with no way to check in and no reason why.
  if (!state) return error ? <div style={{ marginBottom: '18px' }}><Banner text={error} /></div> : null;
  if (state.state === 'NOT_STAFF') return null;

  const session = state.session;
  const elapsed = session && state.state === 'WORKING'
    ? Math.max(0, Math.floor((now - new Date(session.check_in).getTime()) / 60000))
    : 0;

  return (
    <div style={{ ...panel, padding: '20px', marginBottom: '18px' }}>
      {error && <Banner text={error} />}

      <div style={{
        fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase',
        color: 'var(--text-muted)', marginBottom: '12px',
      }}>
        Today
      </div>

      {state.state === 'NOT_CHECKED_IN' && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '18px', fontWeight: 600, marginBottom: '4px' }}>
              Not checked in
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              Click to record your attendance for today
            </div>
          </div>
          <button
            type="button" className="btn-primary" disabled={busy}
            onClick={() => act(async () => { setLocNote(locationProblem(await checkInHere())); })}
            style={{
              padding: '9px 20px', fontSize: '14px', fontWeight: 600,
              borderRadius: '8px', cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: '8px'
            }}
          >
            <LogIn size={16} /> {busy ? 'Checking in…' : 'Check in'}
          </button>
        </div>
      )}

      {state.state === 'WORKING' && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span style={{ width: '9px', height: '9px', borderRadius: '50%',
                             background: 'var(--success-color)', display: 'inline-block' }} />
              <span style={{ fontSize: '18px', fontWeight: 600 }}>You&rsquo;re checked in</span>
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              Since {clockText(session.check_in)} · {hoursText(elapsed)} so far
              {session.source === 'SELF' && <> · <WhereTag session={session} /></>}
            </div>
            {/* Checked in without a position: why, and -- shortly after
                checking in -- a way to add it now. */}
            {session.source === 'SELF' && session.check_in_accuracy_m == null && (() => {
              const canAdd = (now - new Date(session.check_in).getTime()) / 60000 < ADD_LOCATION_MINUTES;
              if (!canAdd && !locNote) return null;
              return (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginTop: '10px' }}>
                  <span style={{ fontSize: '12.5px', color: 'var(--warning-text)', flex: '1 1 240px', minWidth: 0 }}>
                    {locNote || 'Your check-in has no location yet.'}
                  </span>
                  {canAdd && (
                    <button type="button" className="btn-secondary" disabled={busy}
                            onClick={() => act(async () => {
                              const { location, reason } = await currentLocationDetailed();
                              if (!location) { setLocNote(locationProblem(reason)); return; }
                              await api.addCheckInLocation(location);
                              setLocNote('');
                            })}
                            style={{ padding: '6px 12px', fontSize: '13px', borderRadius: '8px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      <MapPin size={14} /> {busy ? 'Finding you…' : 'Add my location'}
                    </button>
                  )}
                </div>
              );
            })()}
          </div>
          <button
            type="button" className="btn-primary" disabled={busy}
            onClick={() => act(() => api.checkOut())}
            style={{
              padding: '9px 20px', fontSize: '14px', fontWeight: 600,
              borderRadius: '8px', cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              backgroundColor: '#dc2626', borderColor: '#dc2626', color: '#ffffff',
              boxShadow: '0 2px 6px rgba(220, 38, 38, 0.25)',
              border: '1px solid #dc2626'
            }}
          >
            <LogOut size={16} /> {busy ? 'Checking out…' : 'Check out'}
          </button>
        </div>
      )}

      {state.state === 'CHECKED_OUT' && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '18px', fontWeight: 600, marginBottom: '4px' }}>
              {clockText(session.check_in)} → {clockText(session.check_out)}
            </div>
            {session.source === 'SELF' && (
              <div style={{ fontSize: '13px', marginBottom: '2px' }}><WhereTag session={session} /></div>
            )}
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              {hoursText(state.today_minutes)} today
            </div>
          </div>
          <button
            type="button" className="btn-secondary" disabled={busy}
            onClick={() => act(async () => { setLocNote(locationProblem(await checkInHere())); })}
            style={{
              padding: '9px 20px', fontSize: '14px', fontWeight: 600,
              borderRadius: '8px', cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: '8px'
            }}
          >
            <LogIn size={16} /> Start another session
          </button>
        </div>
      )}
    </div>
  );
}
