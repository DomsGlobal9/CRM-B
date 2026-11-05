import { SearchBar } from '../../../components/ui/SearchBar';
import { DataTable } from '../../../components/ui/DataTable';
import { useState, useEffect } from 'react';
import { api } from '../../../api';
import { localISO, panel } from './attendanceHelpers';
import { WhereTag } from './attendanceParts';

/** Monthly Attendance Log. */

export default function MonthlyAttendanceLogs({ reloadKey }) {
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

            <SearchBar value={filterText} onChange={setFilterText} placeholder="Search logs..." size="sm" style={{ flex: '0 0 220px', width: '220px', marginTop: '14px' }} />
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
                  background: 'var(--info-100)',
                  color: 'var(--info-700)',
                  border: '1px solid var(--info-200)',
                }}
              >
                <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--info-500)' }} />
                WFH: {wfhCount}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* att-log: on a phone each day stacks into a compact row (index.css). */}
      <DataTable
        fit={false}
        tableClassName="att-log"
        tableStyle={{ minWidth: 0 }}
        rows={loading ? [] : filteredLogs}
        loading={loading}
        labels={{ loading: 'Loading monthly logs…' }}
        empty={{ title: 'No logs found for this period.' }}
        rowClassName={() => 'att-row'}
        columns={[
          {
            key: 'date', header: 'Date', label: false, cellClassName: 'att-date',
            cellProps: () => ({ style: { fontWeight: 600 } }),
          },
          {
            key: 'status', header: 'Status', label: false, cellClassName: 'att-status',
            render: (row) => {
              const isPres = row.status === 'Present';
              const isWfh = row.status === 'WFH';
              const chipBg = isPres ? 'var(--success-100)' : isWfh ? 'var(--info-100)' : 'var(--danger-100)';
              const chipColor = isPres ? 'var(--success-700)' : isWfh ? 'var(--info-700)' : 'var(--danger-700)';
              const chipBorder = isPres ? 'var(--success-200)' : isWfh ? 'var(--info-200)' : 'var(--danger-200)';

              return (
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
                      background: isPres ? 'var(--success-500)' : isWfh ? 'var(--info-500)' : 'var(--danger-500)',
                    }}
                  />
                  {row.status}
                </span>
              );
            },
          },
          {
            key: 'entry', header: 'Entry time', label: false, cellClassName: 'att-in',
            cellProps: (row) => ({ style: { fontWeight: row.entry ? 600 : 400, color: row.entry ? 'var(--text-primary)' : 'var(--text-muted)' } }),
            render: (row) => row.entry || '—',
          },
          {
            key: 'exit', header: 'Exit time', label: false, cellClassName: 'att-out',
            cellProps: (row) => ({ style: { fontWeight: row.exit ? 600 : 400, color: row.exit ? 'var(--text-primary)' : 'var(--text-muted)' } }),
            render: (row) => row.exit || '—',
          },
          {
            key: 'remarks', header: 'Remarks', label: false, cellClassName: 'att-remarks',
            cellProps: () => ({ style: { color: 'var(--text-secondary)' } }),
            // Always a fragment: an empty cell stays :empty, which hides it on a phone.
            render: (row) => (
              <>
                {row.remarks || ''}
                {row.session && (row.remarks ? ' · ' : '')}
                {row.session && <WhereTag session={row.session} />}
              </>
            ),
          },
        ]}
      />
    </div>
  );
}
