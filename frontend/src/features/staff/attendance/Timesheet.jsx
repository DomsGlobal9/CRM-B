import { useState, useEffect, useCallback } from 'react';
import { Pencil, Wallet, ArrowRight } from 'lucide-react';
import { api } from '../../../api';
import Loader from '../../../components/ui/Loader';
import { clockText, dayText, hoursText, mondayOf, panel } from './attendanceHelpers';
import { Banner } from './attendanceParts';

/** Weekly Timesheet. */

/** One person's week. The week is the parent's, shared with Payroll, so moving
 *  between the two views stays on the same week. */
export default function Timesheet({ canSeeTeam, isOwner, roster, onCorrect, week, onWeekChange, reloadKey, onOpenPayroll }) {
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
