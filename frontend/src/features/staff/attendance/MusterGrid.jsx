import { DataTable } from '../../../components/ui/DataTable';
import { api } from '../../../api';
import { localISO, panel } from './attendanceHelpers';

/** The month grid: one column per day. */

const STATUS_STYLE = {
  P: { bg: 'var(--success-100)', fg: 'var(--success-700)' },
  L: { bg: 'var(--warning-100)', fg: 'var(--warning-700)' },
  WO: { bg: 'var(--surface-inset)', fg: 'var(--text-secondary)' },
  A: { bg: 'var(--danger-100)', fg: 'var(--danger-color)' },
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

export default function MusterGrid({ isOwner, roster, sessions, dayMarks, since, until, onChanged }) {
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
        <DataTable
          fit={false}
          tableClassName="att-muster"
          rows={roster}
          columns={[
            {
              key: 'name', header: 'Staff', label: false, className: 'att-muster-name',
              cellProps: () => ({ style: { fontWeight: 600, whiteSpace: 'nowrap' } }),
              render: (person) => (
                <>
                  {person.name}
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 400 }}>
                    {person.role}
                  </div>
                </>
              ),
            },
            ...dates.map((d) => ({
              key: d.iso,
              label: false,
              align: 'center',
              header: d.day,
              headerProps: { title: d.iso, style: { color: d.weekend ? 'var(--text-secondary)' : 'var(--text-muted)' } },
              render: (person) => {
                const status = statusFor(person.id, d.iso);
                const mark = markByKey.get(`${person.id}|${d.iso}`);
                const clickable = isOwner && status !== 'P' && d.iso <= today;
                return (
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
                );
              },
            })),
            {
              key: 'present', header: 'P', label: false, align: 'center',
              cellProps: () => ({ style: { fontWeight: 600 } }),
              render: (person) => presentByStaff.get(String(person.id))?.size || 0,
            },
          ]}
        />
      )}
    </div>
  );
}
