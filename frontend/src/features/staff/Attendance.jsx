
import { useState, useEffect, useCallback } from 'react';
import { Clock, LogIn, LogOut, Pencil, Plus, X, Calendar, CalendarDays, Wallet, ArrowRight, MapPin } from 'lucide-react';

import { api } from '../../services/api';
import { LIMITS } from '../../services/validate';
import Loader from '../../components/ui/Loader';
import { currentLocationDetailed, locationProblem } from '../../services/location';
import { CorrectionForm } from './CorrectionForm';
import { nowForInput, timesError } from './attendanceTimes';
import Payroll from './Payroll';

const panel = {
  background: 'var(--surface-color)',
  boxShadow: 'var(--shadow-sm)',
  border: '1px solid var(--border-color)',
  borderRadius: '12px',
};

/** 565 -> "9h 25m". Minutes are the stored unit; hours are only ever display. */
const hoursText = (minutes) => {
  const total = Number(minutes || 0);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
};

const clockText = (iso) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';

const dayText = (iso) =>
  iso ? new Date(iso).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' }) : '—';

/** The Monday of the week a date falls in, as yyyy-mm-dd. */
const mondayOf = (value) => {
  const d = new Date(value);
  const shift = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - shift);
  return d.toISOString().slice(0, 10);
};

const todayISO = () => new Date().toISOString().slice(0, 10);

/** Local yyyy-mm-dd -- never toISOString(), which shifts to UTC and can land a
 *  day early in a timezone ahead of it. */
const localISO = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const PERIODS = [['day', 'Day'], ['week', 'Week'], ['month', 'Month']];
const PERIOD_LABEL = { day: 'Today', week: 'This week', month: 'This month' };

/** First and last day of the current month -- the muster grid spans the whole
 *  month, with future days shown blank. */
const monthGridBounds = () => {
  const now = new Date();
  return {
    since: localISO(new Date(now.getFullYear(), now.getMonth(), 1)),
    until: localISO(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  };
};

/** [since, until] for the chosen period, inclusive, ending today -- future days
 *  hold no attendance, so a period never reaches past today. */
const periodBounds = (period) => {
  const now = new Date();
  const until = localISO(now);
  if (period === 'week') {
    const d = new Date(now);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // back to Monday
    return { since: localISO(d), until };
  }
  if (period === 'month') {
    return { since: localISO(new Date(now.getFullYear(), now.getMonth(), 1)), until };
  }
  return { since: until, until };
};

function Banner({ text, tone = 'error' }) {
  const colours = tone === 'error'
    ? { bg: 'rgba(220,80,60,0.12)', border: 'rgba(220,80,60,0.35)', fg: 'var(--danger-color)' }
    : { bg: 'rgba(46,180,120,0.12)', border: 'rgba(46,180,120,0.35)', fg: '#1e8a5c' };
  return (
    <div style={{
      background: colours.bg, border: `1px solid ${colours.border}`, color: colours.fg,
      borderRadius: '8px', padding: '10px 12px', fontSize: '13px', marginBottom: '14px',
    }}>
      {text}
    </div>
  );
}

function Modal({ title, onClose, children, width = '520px' }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 1200,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--modal-bg, #fff)', borderRadius: '12px', width: '100%',
          maxWidth: width, maxHeight: '88vh', overflowY: 'auto', padding: '24px',
          border: '1px solid var(--border-color)',
        }}
      >
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: '18px',
        }}>
          <h3 style={{ fontSize: '18px', fontWeight: 600, margin: 0 }}>{title}</h3>
          <button type="button" className="close-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}


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

const metresText = (m) => (m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`);

/** Where a self check-in happened, for the owner's eye; null when there is nothing to say. */
function WhereTag({ session }) {
  if (session.source !== 'SELF') return null;
  const accuracy = session.check_in_accuracy_m != null ? ` (±${metresText(session.check_in_accuracy_m)})` : '';
  if (session.check_in_outside_shop) {
    return (
      <span style={{ color: '#dc2626', fontWeight: 600 }}
            title={`Checked in ${metresText(session.check_in_distance_m)} from the shop${accuracy}`}>
        Outside shop · {metresText(session.check_in_distance_m)}
      </span>
    );
  }
  if (session.check_in_outside_shop === false) {
    return <span title={`${metresText(session.check_in_distance_m)} from the shop${accuracy}`}>At shop</span>;
  }
  if (session.check_in_accuracy_m == null) {
    return <span style={{ color: 'var(--text-muted)' }}>No location</span>;
  }
  // A position, but the boutique has not pinned its shop yet, so there is
  // nothing to measure it against -- say it was recorded rather than leave
  // the line ending on a bare separator.
  return (
    <span title="Set the shop's location (My account › Shop location for staff check-in) to see At shop / Outside shop">
      Location saved{accuracy}
    </span>
  );
}

/**
 * The staff member's own card: one button, and what it did.
 *
 * The elapsed figure ticks locally off the server's check_in. It is a comfort
 * display -- the minutes that get paid are computed server-side at check-out
 * from two server stamps, and never from this number.
 */
function MyDay({ onChanged }) {
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
                             background: '#2ec4b6', display: 'inline-block' }} />
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
                  <span style={{ fontSize: '12.5px', color: 'var(--warning-color)', flex: '1 1 240px', minWidth: 0 }}>
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

function RecordForm({ roster, onCancel, onSaved }) {
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

/** The floor, today: who is in, who has gone home, who never arrived. */
function TodayOnTheFloor({ isOwner, roster, sessions, onCorrect, onRecord, loading, period }) {
  const ranged = period !== 'day';
  const byStaff = new Map();
  sessions.forEach((s) => {
    const list = byStaff.get(String(s.staff)) || [];
    list.push(s);
    byStaff.set(String(s.staff), list);
  });

  const rows = roster.map((person) => {
    const own = byStaff.get(String(person.id)) || [];
    const open = own.find((s) => s.is_open);
    const minutes = own.reduce((sum, s) => sum + Number(s.minutes || 0), 0);
    const days = new Set(own.map((s) => s.date)).size;
    let status = 'Not in';
    if (open) status = 'Working';
    else if (own.length) status = 'Checked out';
    return { person, own, open, minutes, days, status, latest: own[0] };
  });

  const working = rows.filter((r) => r.status === 'Working').length;
  const done = rows.filter((r) => r.status === 'Checked out').length;
  const absent = rows.filter((r) => r.own.length === 0).length;
  const withHours = rows.filter((r) => r.own.length > 0).length;
  const totalMinutes = rows.reduce((sum, r) => sum + r.minutes, 0);

  const tile = (label, value) => (
    <div style={{ ...panel, padding: '14px 16px', flex: '1 1 130px' }}>
      <div style={{ fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase',
                    color: 'var(--text-muted)' }}>{label}</div>
      <div style={{ fontSize: '22px', fontWeight: 600, marginTop: '4px' }}>{value}</div>
    </div>
  );

  const badgeTone = (status) =>
    status === 'Working' ? 'success' : status === 'Checked out' ? 'neutral' : 'warning';
  const sub = { fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' };

  return (
    <>
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
        {ranged ? (
          <>
            {tile('Working now', working)}
            {tile('With hours', withHours)}
            {tile('No hours', absent)}
            {tile('Total hours', totalMinutes ? hoursText(totalMinutes) : '0h')}
          </>
        ) : (
          <>
            {tile('Present today', working + done)}
            {tile('Working now', working)}
            {tile('Checked out', done)}
            {tile('Not in', absent)}
          </>
        )}
      </div>

      {isOwner && (
        <button type="button" className="btn-secondary" onClick={onRecord}
                style={{ marginBottom: '14px', display: 'inline-flex',
                         alignItems: 'center', gap: '6px' }}>
          <Plus size={14} /> Record attendance
        </button>
      )}

      {loading ? (
        <Loader section label="Loading attendance…" />
      ) : rows.length === 0 ? (
        <div style={{ ...panel, padding: '28px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          No staff on the roster yet.
        </div>
      ) : (
        // One row per person: a table reads down a column (who is late, who has
        // the fewest hours) in a way a wall of cards does not.
        <div className="at-table-wrap">
          <table className="at-table at-table--fit at-table--center">
            <thead>
              <tr>
                <th>Team member</th>
                <th>Status</th>
                {ranged ? (
                  <>
                    <th>Days</th>
                    <th>Sessions</th>
                  </>
                ) : (
                  <>
                    <th>Check in</th>
                    <th>Check out</th>
                  </>
                )}
                <th>{ranged ? 'Total hours' : 'Hours'}</th>
                {isOwner && <th>Action</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ person, open, minutes, days, own, status, latest }) => {
                const initials = (person.name || 'U')
                  .split(' ')
                  .map((n) => n[0])
                  .join('')
                  .toUpperCase()
                  .slice(0, 2);
                return (
                  <tr key={person.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                        <div style={{
                          width: '36px', height: '36px', borderRadius: '50%', flexShrink: 0,
                          background: 'linear-gradient(135deg, var(--surface-2, #F4F2EC) 0%, var(--border-color, #E2DFD8) 100%)',
                          color: 'var(--text-primary)', fontWeight: 700, fontSize: '13px',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {initials}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600 }}>{person.name}</div>
                          <div style={sub}>{person.role}</div>
                        </div>
                      </div>
                    </td>
                    <td data-label="Status">
                      <span className={`ui-badge ui-badge--${badgeTone(status)}`}>
                        ● {ranged
                          ? (status === 'Working' ? 'Working now' : own.length ? `${days} day${days === 1 ? '' : 's'}` : 'No hours')
                          : status}
                      </span>
                    </td>
                    {ranged ? (
                      <>
                        <td data-label="Days">{days || '—'}</td>
                        <td data-label="Sessions">{own.length || '—'}</td>
                      </>
                    ) : (
                      <>
                        <td data-label="Check in">
                          <div>{clockText(latest?.check_in)}</div>
                          {latest && <div style={sub}><WhereTag session={latest} /></div>}
                        </td>
                        <td data-label="Check out">{open ? '—' : clockText(latest?.check_out)}</td>
                      </>
                    )}
                    <td data-label={ranged ? 'Total hours' : 'Hours'} style={{ fontWeight: 600 }}>
                      {minutes ? hoursText(minutes) : '—'}
                    </td>
                    {isOwner && (
                      <td data-label="Action">
                        {latest && (
                          <button type="button" className="btn-secondary" onClick={() => onCorrect(latest)}
                                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px',
                                           minHeight: '34px', fontSize: '12.5px', whiteSpace: 'nowrap' }}>
                            <Pencil size={13} /> Correct entry
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/** One person's week. The week is the parent's, shared with Payroll, so moving
 *  between the two views stays on the same week. */
function Timesheet({ canSeeTeam, isOwner, roster, onCorrect, week, onWeekChange, reloadKey, onOpenPayroll }) {
  const [staff, setStaff] = useState('');
  const [sheet, setSheet] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [payrollRun, setPayrollRun] = useState(undefined);

  const selected = staff || String(roster[0]?.id || '');

  const load = useCallback(async () => {
    // The roster arrives after the first render; asking without a staff id
    // would fetch the owner's own sheet, which they may not have.
    if (canSeeTeam && !selected) return;
    setLoading(true);
    setError(null);
    try {
      setSheet(await api.getTimesheet({
        staff: canSeeTeam ? (selected || undefined) : undefined,
        week,
      }));
    } catch (err) {
      setError(err.message || 'Could not load that timesheet.');
      setSheet(null);
    } finally {
      setLoading(false);
    }
  }, [canSeeTeam, selected, week]);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load, reloadKey]);

  // Where this week's pay run stands, so a correction made here is seen
  // against it. undefined while loading, null when none is drafted.
  const linked = Boolean(onOpenPayroll);
  useEffect(() => {
    if (!linked) return undefined;
    let live = true;
    const t = setTimeout(async () => {
      setPayrollRun(undefined);
      const periods = await api.getPayrollPeriods().catch(() => []);
      if (live) setPayrollRun((Array.isArray(periods) ? periods : []).find((p) => p.period_start === week) || null);
    }, 0);
    return () => { live = false; clearTimeout(t); };
  }, [linked, week, reloadKey]);

  const label = { fontSize: '12px', color: 'var(--text-secondary)' };

  const runText = payrollRun === undefined ? 'Checking…'
    : !payrollRun ? 'Not drafted yet'
      : payrollRun.status === 'APPROVED'
        ? `Approved and locked${payrollRun.totals?.paid_count ? ` · ${payrollRun.totals.paid_count} of ${payrollRun.totals.staff_count} paid` : ''}`
        : 'Draft — corrections here are picked up when you recalculate';

  return (
    <div>
      {onOpenPayroll && (
        <div style={{ ...panel, padding: '12px 16px', marginBottom: '14px', display: 'flex',
                      alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ fontSize: '13px' }}>
            <span style={{ fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <Wallet size={14} /> Payroll for this week
            </span>
            <span style={{ color: 'var(--text-secondary)' }}> · {runText}</span>
          </div>
          <button type="button" className="btn-secondary" onClick={onOpenPayroll}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', minHeight: '36px' }}>
            Open payroll <ArrowRight size={14} />
          </button>
        </div>
      )}

      <div
        className="mobile-stack-grid"
        style={{ display: 'grid', gridTemplateColumns: canSeeTeam ? '1fr 1fr' : '1fr',
                 gap: '12px', marginBottom: '14px', maxWidth: '520px' }}
      >
        {canSeeTeam && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <label style={label} htmlFor="ts-staff">Staff member</label>
            <select id="ts-staff" value={selected} onChange={(e) => setStaff(e.target.value)}>
              {roster.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <label style={label} htmlFor="ts-week">Week of</label>
          <input id="ts-week" type="date" value={week}
                 onChange={(e) => onWeekChange(mondayOf(e.target.value))} />
        </div>
      </div>

      {error && <Banner text={error} />}

      {loading ? (
        <Loader section label="Loading timesheet…" />
      ) : !sheet ? null : (
        <>
          <div style={{ ...panel, padding: '14px 16px', marginBottom: '12px' }}>
            <div style={{ fontSize: '11px', letterSpacing: '0.08em',
                          textTransform: 'uppercase', color: 'var(--text-muted)' }}>
              {sheet.staff_name} · week total
            </div>
            <div style={{ fontSize: '24px', fontWeight: 600, marginTop: '4px' }}>
              {hoursText(sheet.total_minutes)}
            </div>
            {sheet.open_sessions > 0 && (
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                {sheet.open_sessions} session{sheet.open_sessions > 1 ? 's' : ''} still open —
                not counted until checked out.
              </div>
            )}
          </div>

          {sheet.sessions.length === 0 ? (
            <div style={{ ...panel, padding: '24px', textAlign: 'center',
                          color: 'var(--text-secondary)' }}>
              No attendance recorded for this week.
            </div>
          ) : (
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {sheet.sessions.map((s) => (
                <div key={s.id} style={{ ...panel, padding: '12px 14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between',
                                gap: '10px', flexWrap: 'wrap' }}>
                    <div style={{ fontWeight: 600, fontSize: '14px' }}>{dayText(s.check_in)}</div>
                    <div style={{ fontWeight: 600 }}>
                      {s.is_open ? 'In progress' : hoursText(s.minutes)}
                    </div>
                  </div>
                  <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    {clockText(s.check_in)} → {s.is_open ? '—' : clockText(s.check_out)}
                    {' · '}
                    {s.source === 'OWNER' ? 'Entered by owner' : s.source === 'WORK' ? 'From start of work' : 'Self'}
                    {s.was_corrected && ' · corrected'}
                  </div>
                  {isOwner && (
                    <button type="button" className="btn-secondary"
                            onClick={() => onCorrect(s)}
                            style={{ marginTop: '10px', display: 'inline-flex',
                                     alignItems: 'center', gap: '6px', minHeight: '38px' }}>
                      <Pencil size={13} /> Correct
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}


const STATUS_STYLE = {
  P: { bg: 'rgba(46,196,182,0.18)', fg: '#1e8a5c' },
  L: { bg: 'rgba(240,136,62,0.18)', fg: '#c0864b' },
  WO: { bg: 'rgba(120,120,140,0.18)', fg: 'var(--text-secondary)' },
  A: { bg: 'rgba(220,80,60,0.12)', fg: 'var(--danger-color)' },
  '': { bg: 'transparent', fg: 'var(--text-muted)' },
};

const eachDate = (since, until) => {
  const out = [];
  const [ys, ms, ds] = since.split('-').map(Number);
  const [yu, mu, du] = until.split('-').map(Number);
  const cur = new Date(ys, ms - 1, ds);
  const end = new Date(yu, mu - 1, du);
  while (cur <= end) {
    out.push({
      iso: localISO(cur),
      day: cur.getDate(),
      weekend: cur.getDay() === 0 || cur.getDay() === 6,
    });
    cur.setDate(cur.getDate() + 1);
  }
  return out;
};

function MusterGrid({ isOwner, roster, sessions, dayMarks, since, until, onChanged }) {
  const today = localISO(new Date());
  const dates = eachDate(since, until);

  const presentByStaff = new Map();
  sessions.forEach((s) => {
    const set = presentByStaff.get(String(s.staff)) || new Set();
    set.add(s.date);
    presentByStaff.set(String(s.staff), set);
  });

  const markByKey = new Map(); 
  dayMarks.forEach((m) => markByKey.set(`${m.staff}|${m.date}`, m));

  const statusFor = (staffId, iso) => {
    if (iso > today) return '';
    if (presentByStaff.get(String(staffId))?.has(iso)) return 'P';
    const mark = markByKey.get(`${staffId}|${iso}`);
    if (mark) return mark.kind === 'LEAVE' ? 'L' : 'WO';
    return 'A';
  };


  const cycle = async (staffId, iso, current, mark) => {
    if (!isOwner || current === 'P' || iso > today) return;
    try {
      if (current === 'A') {
        await api.createDayMark({ staff: staffId, date: iso, kind: 'LEAVE' });
      } else if (current === 'L') {
        await api.createDayMark({ staff: staffId, date: iso, kind: 'WEEKLY_OFF' });
      } else if (current === 'WO' && mark) {
        await api.deleteDayMark(mark.id);
      }
      onChanged();
    } catch { /* a failed mark just leaves the cell as it was */ }
  };

  const th = {
    position: 'sticky', top: 0, background: 'var(--surface-color, #fff)',
    padding: '6px 4px', fontSize: '11px', color: 'var(--text-muted)',
    fontWeight: 600, textAlign: 'center', zIndex: 1,
  };
  const nameCell = {
    position: 'sticky', left: 0, background: 'var(--surface-color, #fff)',
    padding: '8px 12px', fontSize: '13px', fontWeight: 600, whiteSpace: 'nowrap',
    borderRight: '1px solid var(--border-color, rgba(255,255,255,0.12))', zIndex: 1,
  };

  const legend = [['P', 'Present'], ['L', 'Leave'], ['WO', 'Weekly off'], ['A', 'Absent']];

  return (
    <div style={{ ...panel, padding: '14px' }}>
      <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginBottom: '10px' }}>
        {legend.map(([k, label]) => (
          <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px',
                                 fontSize: '12px', color: 'var(--text-secondary)' }}>
            <span style={{ width: '20px', height: '20px', borderRadius: '4px',
                           display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                           fontSize: '10px', fontWeight: 700,
                           background: STATUS_STYLE[k].bg, color: STATUS_STYLE[k].fg }}>{k}</span>
            {label}
          </span>
        ))}
        {isOwner && (
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: 'auto' }}>
            Tap a cell to mark leave or a weekly off.
          </span>
        )}
      </div>

      {roster.length === 0 ? (
        <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          No staff on the roster yet.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th style={{ ...nameCell, ...th, textAlign: 'left' }}>Staff</th>
                {dates.map((d) => (
                  <th key={d.iso} style={{ ...th, color: d.weekend ? 'var(--text-secondary)' : 'var(--text-muted)' }}
                      title={d.iso}>{d.day}</th>
                ))}
                <th style={{ ...th }}>P</th>
              </tr>
            </thead>
            <tbody>
              {roster.map((person) => {
                const present = presentByStaff.get(String(person.id))?.size || 0;
                return (
                  <tr key={person.id}>
                    <td style={nameCell}>
                      {person.name}
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 400 }}>
                        {person.role}
                      </div>
                    </td>
                    {dates.map((d) => {
                      const status = statusFor(person.id, d.iso);
                      const mark = markByKey.get(`${person.id}|${d.iso}`);
                      const clickable = isOwner && status !== 'P' && d.iso <= today;
                      return (
                        <td key={d.iso} style={{ padding: '2px', textAlign: 'center' }}>
                          <button type="button" disabled={!clickable}
                                  onClick={() => cycle(person.id, d.iso, status, mark)}
                                  title={`${person.name} · ${d.iso}`}
                                  style={{
                                    width: '26px', height: '26px', borderRadius: '4px', border: 'none',
                                    fontSize: '10px', fontWeight: 700,
                                    cursor: clickable ? 'pointer' : 'default',
                                    background: STATUS_STYLE[status].bg, color: STATUS_STYLE[status].fg,
                                  }}>
                            {status}
                          </button>
                        </td>
                      );
                    })}
                    <td style={{ textAlign: 'center', fontWeight: 600, fontSize: '13px' }}>{present}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function MonthlyAttendanceLogs({ reloadKey }) {
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [filterText, setFilterText] = useState('');
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    const fetchMonthData = async () => {
      setLoading(true);
      try {
        const [yearStr, monthStr] = selectedMonth.split('-');
        const year = parseInt(yearStr, 10);
        const month = parseInt(monthStr, 10);
        const since = `${yearStr}-${monthStr}-01`;
        const lastDay = new Date(year, month, 0).getDate();
        const until = `${yearStr}-${monthStr}-${String(lastDay).padStart(2, '0')}`;

        // Get signed-in user's own staff ID so Monthly Log shows own attendance
        const cur = await api.getCurrentAttendance().catch(() => null);
        const ownStaffId = cur?.staff;

        const query = { since, until };
        if (ownStaffId) query.staff = ownStaffId;

        const res = await api.getAttendance(query).catch(() => []);
        if (!active) return;

        let sessionsList = Array.isArray(res) ? res : (res?.results || []);
        if (ownStaffId) {
          sessionsList = sessionsList.filter((s) => String(s.staff) === String(ownStaffId));
        }
        
        const sessionsByDate = new Map();
        sessionsList.forEach((s) => {
          const dStr = s.date || (s.check_in ? s.check_in.slice(0, 10) : '');
          if (dStr) {
            const list = sessionsByDate.get(dStr) || [];
            list.push(s);
            sessionsByDate.set(dStr, list);
          }
        });

        const todayStr = localISO(new Date());
        const rows = [];

        for (let day = 1; day <= lastDay; day++) {
          const dayStr = String(day).padStart(2, '0');
          const isoDate = `${yearStr}-${monthStr}-${dayStr}`;
          if (isoDate > todayStr) break;

          const daySessions = sessionsByDate.get(isoDate) || [];
          const dateFormatted = `${dayStr}-${monthStr}-${yearStr}`;

          if (daySessions.length > 0) {
            daySessions.forEach((s) => {
              const formatTime = (iso) => {
                if (!iso) return '';
                const d = new Date(iso);
                return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
              };

              const checkInTime = formatTime(s.check_in);
              const checkOutTime = s.check_out ? formatTime(s.check_out) : '';
              const isWFH = (s.note && s.note.toLowerCase().includes('wfh')) || (s.reason && s.reason.toLowerCase().includes('wfh'));

              rows.push({
                id: s.id || `${isoDate}-${Math.random()}`,
                date: dateFormatted,
                isoDate,
                status: isWFH ? 'WFH' : 'Present',
                entry: checkInTime,
                exit: checkOutTime,
                remarks: s.note || (isWFH ? 'WFH (approved)' : ''),
                session: s,
              });
            });
          } else {
            const dObj = new Date(year, month - 1, day);
            const isWeekend = dObj.getDay() === 0 || dObj.getDay() === 6;
            if (!isWeekend) {
              rows.push({
                id: isoDate,
                date: dateFormatted,
                isoDate,
                status: 'Absent',
                entry: '',
                exit: '',
                remarks: '',
              });
            }
          }
        }

        setLogs(rows);
      } catch (err) {
        console.error('Failed to fetch month logs', err);
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchMonthData();
    return () => { active = false; };
  }, [selectedMonth, reloadKey]);

  const presentCount = logs.filter((l) => l.status === 'Present').length;
  const wfhCount = logs.filter((l) => l.status === 'WFH').length;

  const filteredLogs = logs.filter((l) => {
    if (!filterText.trim()) return true;
    const q = filterText.toLowerCase();
    return (
      l.date.toLowerCase().includes(q) ||
      l.status.toLowerCase().includes(q) ||
      l.entry.toLowerCase().includes(q) ||
      l.exit.toLowerCase().includes(q) ||
      l.remarks.toLowerCase().includes(q)
    );
  });

  return (
    <div style={{ marginTop: '32px' }}>
      {/* Monthly Section Header Box */}
      <div
        style={{
          ...panel,
          padding: '16px 20px',
          marginBottom: '16px',
          background: 'var(--surface-color)',
          borderRadius: '14px',
          border: '1px solid var(--border-color)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
          {/* Left Side: Section Label, Month Picker & Search */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '4px' }}>
                LOG MONTH
              </div>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                style={{
                  padding: '7px 14px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                  fontSize: '13.5px',
                  fontWeight: 600,
                  background: 'var(--surface-2, #F8F7F4)',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  outline: 'none',
                }}
              />
            </div>

            <div style={{ position: 'relative', width: '220px', marginTop: '14px' }}>
              <input
                type="text"
                placeholder="Search logs..."
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                style={{
                  width: '100%',
                  padding: '7px 12px 7px 32px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                  fontSize: '13px',
                  background: 'var(--surface-2, #F8F7F4)',
                  color: 'var(--text-primary)',
                  outline: 'none',
                }}
              />
              <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '12px', pointerEvents: 'none' }}>
                🔍
              </span>
              {filterText && (
                <button
                  type="button"
                  onClick={() => setFilterText('')}
                  style={{
                    position: 'absolute',
                    right: '8px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    fontSize: '12px',
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Right Side: Summary Chips */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                borderRadius: '20px',
                fontSize: '12.5px',
                fontWeight: 600,
                background: '#ecfdf5',
                color: '#047857',
                border: '1px solid #a7f3d0',
              }}
            >
              <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#10b981' }} />
              Present: {presentCount}
            </span>
            {wfhCount > 0 && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 14px',
                  borderRadius: '20px',
                  fontSize: '12.5px',
                  fontWeight: 600,
                  background: '#f3e8ff',
                  color: '#7e22ce',
                  border: '1px solid #e9d5ff',
                }}
              >
                <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#a855f7' }} />
                WFH: {wfhCount}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Table Container */}
      <div
        style={{
          ...panel,
          overflow: 'hidden',
          borderRadius: '14px',
          border: '1px solid var(--border-color)',
          boxShadow: '0 2px 10px rgba(0, 0, 0, 0.03)',
          padding: 0,
        }}
      >
        <div style={{ overflowX: 'auto' }}>
          {/* att-log: on a phone each day stacks into a compact row (index.css). */}
          <table className="att-log" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'var(--surface-2, #F8F7F4)', borderBottom: '1px solid var(--border-color)' }}>
                <th style={{ padding: '14px 18px', fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', color: 'var(--text-secondary)' }}>DATE</th>
                <th style={{ padding: '14px 18px', fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', color: 'var(--text-secondary)' }}>STATUS</th>
                <th style={{ padding: '14px 18px', fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', color: 'var(--text-secondary)' }}>ENTRY TIME</th>
                <th style={{ padding: '14px 18px', fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', color: 'var(--text-secondary)' }}>EXIT TIME</th>
                <th style={{ padding: '14px 18px', fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', color: 'var(--text-secondary)' }}>REMARKS</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    Loading monthly logs…
                  </td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    No logs found for this period.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((row, idx) => {
                  const isPres = row.status === 'Present';
                  const isWfh = row.status === 'WFH';
                  const chipBg = isPres ? '#ecfdf5' : isWfh ? '#f3e8ff' : '#fef2f2';
                  const chipColor = isPres ? '#047857' : isWfh ? '#7e22ce' : '#b91c1c';
                  const chipBorder = isPres ? '#a7f3d0' : isWfh ? '#e9d5ff' : '#fecaca';

                  return (
                    <tr
                      key={row.id}
                      className="att-row"
                      style={{
                        background: idx % 2 === 1 ? 'var(--surface-2, rgba(0,0,0,0.012))' : 'transparent',
                        borderBottom: '1px solid var(--border-color)',
                      }}
                    >
                      <td className="att-date" style={{ padding: '14px 18px', fontSize: '13.5px', fontWeight: 600, color: 'var(--text-primary)' }}>{row.date}</td>
                      <td className="att-status" style={{ padding: '14px 18px' }}>
                        <span
                          style={{
                            padding: '4px 12px',
                            borderRadius: '20px',
                            fontSize: '12px',
                            fontWeight: 600,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            background: chipBg,
                            color: chipColor,
                            border: `1px solid ${chipBorder}`,
                          }}
                        >
                          <span
                            style={{
                              width: '5px',
                              height: '5px',
                              borderRadius: '50%',
                              background: isPres ? '#10b981' : isWfh ? '#a855f7' : '#ef4444',
                            }}
                          />
                          {row.status}
                        </span>
                      </td>
                      <td className="att-in" style={{ padding: '14px 18px', fontSize: '13px', fontWeight: row.entry ? 600 : 400, color: row.entry ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                        {row.entry || '—'}
                      </td>
                      <td className="att-out" style={{ padding: '14px 18px', fontSize: '13px', fontWeight: row.exit ? 600 : 400, color: row.exit ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                        {row.exit || '—'}
                      </td>
                      <td className="att-remarks" style={{ padding: '14px 18px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                        {row.remarks || ''}
                        {row.session && (row.remarks ? ' · ' : '')}
                        {row.session && <WhereTag session={row.session} />}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const SUB_TABS = [
  { key: 'today', label: "Today's Status & Roster", icon: Clock },
  { key: 'timesheet', label: 'Weekly Timesheet', icon: CalendarDays },
  { key: 'monthly', label: 'Monthly Attendance Log', icon: Calendar },
  { key: 'payroll', label: 'Payroll', icon: Wallet },
];

export default function Attendance({ isOwner, canSeeTeam, showPayroll = false }) {
  const [roster, setRoster] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [dayMarks, setDayMarks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [correcting, setCorrecting] = useState(null);
  const [recording, setRecording] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [period, setPeriod] = useState('day');
  // The roster tab is only for the Owner and the Master; everyone else opens
  // straight onto their monthly log.
  const [activeTab, setActiveTab] = useState(canSeeTeam ? 'today' : 'monthly');
  // Payroll runs Monday to Sunday; the timesheet and the pay run share this
  // week so switching between them never loses your place.
  const [week, setWeek] = useState(() => mondayOf(todayISO()));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const bounds = period === 'month' ? monthGridBounds() : periodBounds(period);
      const [people, today, marks] = await Promise.all([
        canSeeTeam ? api.getTailors({ forAttendance: true }).catch(() => []) : Promise.resolve([]),
        canSeeTeam ? api.getAttendance(bounds).catch(() => []) : Promise.resolve([]),
        canSeeTeam && period === 'month'
          ? api.getDayMarks(bounds).catch(() => []) : Promise.resolve([]),
      ]);
      setRoster(Array.isArray(people) ? people : []);
      setSessions(Array.isArray(today) ? today : []);
      setDayMarks(Array.isArray(marks) ? marks : []);
    } finally {
      setLoading(false);
    }
  }, [canSeeTeam, period]);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load, reloadKey]);

  const refresh = () => setReloadKey((n) => n + 1);

  return (
    <>
      {/* Your own check-in card belongs with attendance, not with a pay run. */}
      {activeTab !== 'payroll' && <MyDay onChanged={refresh} />}

      <div className="at-scroll-tabs" style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', margin: '20px 0 18px', gap: '8px' }}>
        {SUB_TABS
          .filter(({ key }) => (key === 'monthly' || (key === 'payroll' ? showPayroll : canSeeTeam)))
          .map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              style={{
                padding: '10px 18px',
                fontSize: '14px',
                fontWeight: activeTab === key ? 600 : 500,
                color: activeTab === key ? 'var(--accent, #2ec4b6)' : 'var(--text-secondary)',
                borderBottom: activeTab === key ? '2px solid var(--accent, #2ec4b6)' : '2px solid transparent',
                background: 'none',
                borderLeft: 'none',
                borderRight: 'none',
                borderTop: 'none',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.15s ease',
              }}
            >
              <Icon size={16} /> {label}
            </button>
          ))}
      </div>

      {activeTab === 'today' && canSeeTeam && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px',
                        flexWrap: 'wrap', margin: '0 0 12px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 600, margin: 0,
                         display: 'flex', alignItems: 'center', gap: '7px' }}>
              <Clock size={15} /> On the floor · {PERIOD_LABEL[period]}
            </h3>
            <div role="group" aria-label="Attendance period"
                 style={{ display: 'inline-flex', borderRadius: '8px', overflow: 'hidden',
                          border: '1px solid var(--border-color, rgba(255,255,255,0.12))' }}>
              {PERIODS.map(([value, label]) => (
                <button key={value} type="button" onClick={() => setPeriod(value)}
                        aria-pressed={period === value}
                        style={{
                          padding: '6px 14px', fontSize: '13px', border: 'none', cursor: 'pointer',
                          background: period === value ? 'var(--accent, #2ec4b6)' : 'transparent',
                          color: period === value ? '#fff' : 'var(--text-secondary)',
                          fontWeight: period === value ? 600 : 400,
                        }}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          {period === 'month' ? (
            <MusterGrid
              isOwner={isOwner}
              roster={roster}
              sessions={sessions}
              dayMarks={dayMarks}
              since={monthGridBounds().since}
              until={monthGridBounds().until}
              onChanged={refresh}
            />
          ) : (
            <TodayOnTheFloor
              isOwner={isOwner}
              roster={roster}
              sessions={sessions}
              loading={loading}
              period={period}
              onCorrect={setCorrecting}
              onRecord={() => setRecording(true)}
            />
          )}
        </>
      )}

      {activeTab === 'timesheet' && canSeeTeam && (
        <Timesheet
          canSeeTeam={canSeeTeam}
          isOwner={isOwner}
          roster={roster}
          onCorrect={setCorrecting}
          week={week}
          onWeekChange={setWeek}
          reloadKey={reloadKey}
          onOpenPayroll={showPayroll ? () => setActiveTab('payroll') : undefined}
        />
      )}

      {activeTab === 'monthly' && (
        <MonthlyAttendanceLogs reloadKey={reloadKey} />
      )}

      {activeTab === 'payroll' && showPayroll && (
        <Payroll week={week} onWeekChange={setWeek} onChanged={refresh} />
      )}

      {correcting && (
        <Modal title="Correct attendance" onClose={() => setCorrecting(null)}>
          <CorrectionForm
            session={correcting}
            onCancel={() => setCorrecting(null)}
            onSaved={() => { setCorrecting(null); refresh(); }}
          />
        </Modal>
      )}

      {recording && (
        <Modal title="Record attendance" onClose={() => setRecording(false)}>
          <RecordForm
            roster={roster}
            onCancel={() => setRecording(false)}
            onSaved={() => { setRecording(false); refresh(); }}
          />
        </Modal>
      )}
    </>
  );
}
