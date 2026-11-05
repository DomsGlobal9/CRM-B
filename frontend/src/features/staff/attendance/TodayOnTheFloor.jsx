import { DataTable } from '../../../components/ui/DataTable';
import { Pencil, Plus } from 'lucide-react';
import Loader from '../../../components/ui/Loader';
import { clockText, hoursText, panel } from './attendanceHelpers';
import { WhereTag } from './attendanceParts';

/** Today's Status & Roster: who is in, for the day or week. */

/** The floor, today: who is in, who has gone home, who never arrived. */
export default function TodayOnTheFloor({ isOwner, roster, sessions, onCorrect, onRecord, loading, period }) {
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
        <DataTable
          tableClassName="at-table--center"
          rows={rows}
          rowKey={(row) => row.person.id}
          columns={[
            {
              key: 'person', header: 'Team member', label: false,
              render: ({ person }) => {
                const initials = (person.name || 'U')
                  .split(' ')
                  .map((n) => n[0])
                  .join('')
                  .toUpperCase()
                  .slice(0, 2);
                return (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                    <div style={{
                      width: '36px', height: '36px', borderRadius: '50%', flexShrink: 0,
                      background: 'linear-gradient(135deg, var(--surface-2) 0%, var(--border-color) 100%)',
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
                );
              },
            },
            {
              key: 'status', header: 'Status',
              render: ({ status, own, days }) => (
                <span className={`ui-badge ui-badge--${badgeTone(status)}`}>
                  ● {ranged
                    ? (status === 'Working' ? 'Working now' : own.length ? `${days} day${days === 1 ? '' : 's'}` : 'No hours')
                    : status}
                </span>
              ),
            },
            ranged && { key: 'days', header: 'Days', render: ({ days }) => days || '—' },
            ranged && { key: 'sessions', header: 'Sessions', render: ({ own }) => own.length || '—' },
            !ranged && {
              key: 'checkIn', header: 'Check in',
              render: ({ latest }) => (
                <>
                  <div>{clockText(latest?.check_in)}</div>
                  {latest && <div style={sub}><WhereTag session={latest} /></div>}
                </>
              ),
            },
            !ranged && {
              key: 'checkOut', header: 'Check out',
              render: ({ open, latest }) => (open ? '—' : clockText(latest?.check_out)),
            },
            {
              key: 'hours', header: ranged ? 'Total hours' : 'Hours',
              cellProps: () => ({ style: { fontWeight: 600 } }),
              render: ({ minutes }) => (minutes ? hoursText(minutes) : '—'),
            },
            isOwner && {
              key: 'action', header: 'Action',
              // '' keeps the cell blank for someone with no entry; null would draw a dash.
              render: ({ latest }) => (latest ? (
                <button type="button" className="btn-secondary" onClick={() => onCorrect(latest)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px',
                                 minHeight: '34px', fontSize: '12.5px', whiteSpace: 'nowrap' }}>
                  <Pencil size={13} /> Correct entry
                </button>
              ) : ''),
            },
          ]}
        />
      )}
    </>
  );
}
