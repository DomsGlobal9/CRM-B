/**
 * Tasks: every workroom step on the team's plate, person by person.
 *
 * Read from the orders themselves. An OrderStage names who it is assigned to,
 * who performed it and when it started and finished, and it is the record the
 * Performance tab counts, so this tab and that one can never disagree. The
 * day's attendance comes from the same list the Attendance tab draws.
 *
 * Narrowed by member, day and state. A day is decided the way Performance
 * decides it: by when the step finished, else when it started. Steps nobody
 * has started yet carry no day and show only when no day is chosen.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, CheckCircle2, ClipboardList, Clock, Star } from 'lucide-react';

import { api } from '../../services/api';
import { fmtDate, orderRef, orderGarmentNames } from '../../services/format';
import { AvatarInitials, StatCard } from '../../components/ui/Atelier';
import Loader from '../../components/ui/Loader';

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const localDay = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const clock = (iso) => (iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '');
const hoursText = (minutes) => {
  const m = Math.max(0, Math.round(minutes || 0));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
};

// Not started, in progress, completed: the only three states a step shows.
const STATE = {
  NOT_STARTED: ['neutral', 'Not started'],
  IN_PROGRESS: ['info', 'In progress'],
  PAUSED: ['info', 'In progress'],
  PENDING_VERIFICATION: ['info', 'In progress'],
  COMPLETED: ['success', 'Completed'],
  SKIPPED: ['success', 'Completed'],
};
const STATE_FILTERS = [
  ['all', 'All'], ['todo', 'Not started'], ['active', 'In progress'], ['done', 'Completed'],
];
const inState = (status, key) =>
  key === 'all'
  || (key === 'todo' && status === 'NOT_STARTED')
  || (key === 'active' && ['IN_PROGRESS', 'PAUSED', 'PENDING_VERIFICATION'].includes(status))
  || (key === 'done' && (status === 'COMPLETED' || status === 'SKIPPED'));

export default function TeamTasks({ currentUser, canSeeTeam }) {
  const me = currentUser?.tailor_id || null;
  const [people, setPeople] = useState([]);
  const [orders, setOrders] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [member, setMember] = useState(canSeeTeam ? 'all' : String(me || ''));
  const [day, setDay] = useState(todayIso());
  const [state, setState] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [roster, rows] = await Promise.all([
        canSeeTeam ? api.getTailors().catch(() => []) : Promise.resolve([]),
        api.getOrders(),
      ]);
      setPeople(canSeeTeam
        ? (Array.isArray(roster) ? roster : [])
        : (me ? [{ id: me, name: currentUser.first_name || currentUser.email, role: currentUser.role }] : []));
      setOrders(Array.isArray(rows) ? rows : []);
    } catch (err) {
      setError(err.message || 'Could not load the team’s work.');
    } finally {
      setLoading(false);
    }
  }, [canSeeTeam, me, currentUser]);
  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  // The chosen day's attendance, for everyone shown. Tailors are only ever
  // handed their own sessions by the server, whatever they ask for.
  useEffect(() => {
    let cancelled = false;
    const params = member === 'all' ? { date: day } : { date: day, staff: member };
    // Without a day there is nothing to ask for; the answer is still set from
    // the promise so no render sets state from inside the effect itself.
    (day ? api.getAttendance(params) : Promise.resolve([]))
      .then((rows) => { if (!cancelled) setAttendance(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (!cancelled) setAttendance([]); });
    return () => { cancelled = true; };
  }, [day, member]);

  const attendanceByStaff = useMemo(() => {
    const map = new Map();
    attendance.forEach((s) => map.set(String(s.staff), [...(map.get(String(s.staff)) || []), s]));
    return map;
  }, [attendance]);

  // Every step, with its order beside it, then narrowed.
  const steps = useMemo(() => orders.flatMap((order) =>
    (order.stages || []).map((stage) => ({
      key: `${order.id}-${stage.id || stage.stage_key}`,
      order, stage,
      owner: stage.assigned_to || stage.performed_by || null,
      day: localDay(stage.completed_at || stage.started_at),
    }))
  ), [orders]);

  const shown = useMemo(() => steps.filter((s) =>
    s.owner
    && (member === 'all' || String(s.owner) === String(member) || String(s.stage.performed_by || '') === String(member))
    && (!day || s.day === day)
    && inState(s.stage.status, state)
  ), [steps, member, day, state]);

  const groups = useMemo(() => {
    const byPerson = new Map();
    shown.forEach((s) => {
      const id = String(s.owner);
      byPerson.set(id, [...(byPerson.get(id) || []), s]);
    });
    const listed = member === 'all' ? people : people.filter((p) => String(p.id) === String(member));
    return listed
      .map((p) => ({ person: p, rows: byPerson.get(String(p.id)) || [] }))
      .filter((g) => g.rows.length > 0 || member !== 'all');
  }, [shown, people, member]);

  const done = shown.filter((s) => ['COMPLETED', 'SKIPPED'].includes(s.stage.status)).length;
  const active = shown.filter((s) => ['IN_PROGRESS', 'PAUSED', 'PENDING_VERIFICATION'].includes(s.stage.status)).length;
  const minutesOnFloor = attendance
    .filter((s) => member === 'all' || String(s.staff) === String(member))
    .reduce((sum, s) => sum + (Number(s.minutes) || 0), 0);

  return (
    <div className="tt">
      <section className="at-stat-grid">
        <StatCard icon={ClipboardList} tone="green" label="Steps" value={shown.length}
                  sub={day ? `on ${fmtDate(day)}` : 'all days'} />
        <StatCard icon={Clock} tone="amber" label="In progress" value={active} sub="steps under way" />
        <StatCard icon={CheckCircle2} tone="blue" label="Completed" value={done} sub="finished steps" />
        <StatCard icon={CalendarDays} tone="violet" label="On the floor" value={day ? hoursText(minutesOnFloor) : '—'}
                  sub={day ? 'hours clocked that day' : 'pick a day'} />
      </section>

      {/* Who, which day, and what state. */}
      <div className="at-toolbar tt-toolbar">
        <div className="at-toolbar-filters" style={{ order: 0, flex: '0 0 auto' }}>
          {canSeeTeam && (
            <select className="form-control at-filter" value={member} aria-label="Team member"
                    onChange={(e) => setMember(e.target.value)}>
              <option value="all">Everyone</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          <input type="date" className="form-control at-filter" value={day} aria-label="Work day"
                 onChange={(e) => setDay(e.target.value)} />
          {day ? (
            <button type="button" className="btn-secondary at-btn-sm" onClick={() => setDay('')}>All days</button>
          ) : (
            <button type="button" className="btn-secondary at-btn-sm" onClick={() => setDay(todayIso())}>Today</button>
          )}
        </div>
        <div className="at-seg" role="group" aria-label="State" style={{ marginLeft: 'auto' }}>
          {STATE_FILTERS.map(([key, label]) => (
            <button key={key} type="button" aria-pressed={state === key} onClick={() => setState(key)}>{label}</button>
          ))}
        </div>
      </div>

      {error && <div className="od-error">{error}</div>}
      {loading && <Loader section label="Loading the team’s work…" />}

      {!loading && groups.length === 0 && (
        <div className="ui-card od-empty" style={{ padding: 'var(--space-8)' }}>
          {day ? 'No steps on this day for this filter. Try All days.' : 'No steps match this filter.'}
        </div>
      )}

      {groups.map(({ person, rows }) => {
        const sessions = attendanceByStaff.get(String(person.id)) || [];
        const minutes = sessions.reduce((sum, s) => sum + (Number(s.minutes) || 0), 0);
        const first = sessions[0];
        return (
          <section key={person.id} className="ui-card tt-person">
            {/* The person: who they are, and their day. */}
            <header className="tt-person-head">
              <AvatarInitials name={person.name} size={44} />
              <div className="tt-person-id">
                <div className="tt-person-name">{person.name}</div>
                <div className="tt-person-sub">
                  {[person.role, person.specialty].filter(Boolean).join(' · ')}
                  {person.rating != null && <span className="tt-rating"><Star size={12} /> {Number(person.rating).toFixed(1)}</span>}
                  {person.status && <span className={`ui-badge ui-badge--${person.status === 'Busy' ? 'warning' : 'success'}`}>{person.status}</span>}
                </div>
              </div>
              <div className="tt-person-day">
                {day ? (
                  first ? (
                    <>
                      <div className="tt-day-hours">{hoursText(minutes)}</div>
                      <div className="od-hint">
                        {clock(first.check_in)}{first.check_out ? ` → ${clock(sessions[sessions.length - 1].check_out)}` : ' → still in'}
                        {sessions.length > 1 ? ` · ${sessions.length} sessions` : ''}
                      </div>
                    </>
                  ) : <div className="od-hint">Not clocked in</div>
                ) : null}
                <div className="od-hint">{rows.length} step{rows.length === 1 ? '' : 's'} · {rows.filter((r) => ['COMPLETED', 'SKIPPED'].includes(r.stage.status)).length} completed</div>
              </div>
            </header>

            {rows.length > 0 && (
              <div className="at-table-wrap tt-table-wrap">
                <table className="at-table tt-table">
                  <thead>
                    <tr>
                      <th>Step</th><th>Order</th><th>Garment</th><th>State</th><th>Started</th><th>Finished</th><th>Time spent</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(({ key, order, stage }) => {
                      const [tone, label] = STATE[stage.status] || ['neutral', stage.status];
                      const performedByOther = stage.performed_by && String(stage.performed_by) !== String(person.id);
                      return (
                        <tr key={key}>
                          <td>
                            <div className="tt-step">{stage.stage_name}</div>
                            {performedByOther && <div className="od-hint">done by {stage.performed_by_name}</div>}
                          </td>
                          <td>
                            <div className="tt-step">{orderRef(order)}</div>
                            <div className="od-hint">{order.customer_name}</div>
                          </td>
                          <td>{orderGarmentNames(order).join(', ') || order.customer_garment_type || '—'}</td>
                          <td><span className={`ui-badge ui-badge--${tone}`}>{label}</span></td>
                          <td>{stage.started_at ? `${fmtDate(stage.started_at)} ${clock(stage.started_at)}` : '—'}</td>
                          <td>{stage.completed_at ? `${fmtDate(stage.completed_at)} ${clock(stage.completed_at)}` : '—'}</td>
                          <td>{stage.duration_seconds ? hoursText(stage.duration_seconds / 60) : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
