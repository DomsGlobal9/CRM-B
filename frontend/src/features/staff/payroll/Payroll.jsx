import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, Check, CheckCircle2, Lock, RefreshCw } from 'lucide-react';
import { api } from '../../../api';
import Loader from '../../../components/ui/Loader';
import { ApproveDialog } from './PayrollDialogs';
import RecordDetail from './RecordDetail';
import { hoursText, mondayOf, money, panel, weekLabel } from './payrollHelpers';
import { Banner, StatusPill } from './payrollParts';

/** Payroll: one week's totals and everyone on it. */

/** The week is owned by the Attendance & Payroll tab, shared with the timesheet. */
export default function Payroll({ week, onWeekChange, onChanged }) {
  const [period, setPeriod] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [approveError, setApproveError] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [openRecord, setOpenRecord] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const periods = await api.getPayrollPeriods();
      const match = (Array.isArray(periods) ? periods : []).find(
        (p) => p.period_start === week);
      setPeriod(match ? await api.getPayrollPeriod(match.id) : null);
    } catch (err) {
      setError(err.message || 'Could not load payroll.');
      setPeriod(null);
    } finally {
      setLoading(false);
    }
  }, [week]);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  const run = async (fn) => {
    setBusy(true);
    setError(null);
    try {
      setPeriod(await fn());
      setOpenRecord(null);
    } catch (err) {
      setError(err.message || 'That did not work.');
    } finally {
      setBusy(false);
    }
  };

  // A correction made from a person's detail: recalculate the draft but stay
  // on that person, since their record id survives regeneration.
  const recalculate = async () => {
    setPeriod(await api.generatePayroll(week));
    onChanged?.();
  };

  const approve = async () => {
    setBusy(true);
    setApproveError(null);
    try {
      const updated = await api.approvePayroll(period.id);
      setPeriod(updated);
      setConfirming(false);
    } catch (err) {
      setApproveError(err.message || 'Could not approve this payroll.');
    } finally {
      setBusy(false);
    }
  };

  if (openRecord) {
    const live = period?.records.find((r) => r.id === openRecord) || null;
    if (live) {
      return (
        <RecordDetail
          record={live}
          week={period.period_start}
          onRecalculate={recalculate}
          onPaid={(updated) => setPeriod((p) => p && ({
            ...p,
            records: p.records.map((r) => (r.id === updated.id ? updated : r)),
            totals: { ...p.totals,
                      paid_count: (p.totals.paid_count || 0) + 1 },
          }))}
        />
      );
    }
  }

  const approved = period?.status === 'APPROVED';
  const blocked = period?.totals?.blocked_count > 0;

  return (
    <>
      <div
        className="mobile-stack-grid"
        style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px',
                 maxWidth: '460px', marginBottom: '16px' }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }} htmlFor="pr-week">
            Payroll week
          </label>
          <input id="pr-week" type="date" value={week}
                 onChange={(e) => onWeekChange(mondayOf(e.target.value))} />
        </div>
      </div>

      {error && <Banner text={error} />}

      {loading ? (
        <Loader page label="Loading payroll…" />
      ) : !period ? (
        <div style={{ ...panel, padding: '32px', textAlign: 'center' }}>
          <p style={{ fontSize: '14px', margin: '0 0 6px' }}>
            No payroll drafted for {weekLabel(week, new Date(new Date(week).getTime() + 6 * 86400000).toISOString().slice(0, 10))}.
          </p>
          <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', margin: '0 0 16px' }}>
            Drafting reads the completed attendance for this week and each
            person&rsquo;s current hourly rate. Nothing is paid or locked until
            you approve it.
          </p>
          <button type="button" className="btn-primary" disabled={busy}
                  onClick={() => run(() => api.generatePayroll(week))}
                  style={{ minHeight: '44px' }}>
            {busy ? 'Drafting…' : 'Draft payroll for this week'}
          </button>
        </div>
      ) : (
        <>
          <div style={{ ...panel, padding: '16px 18px', marginBottom: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between',
                          alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: '11px', letterSpacing: '0.08em',
                              textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                  {weekLabel(period.period_start, period.period_end)}
                </div>
                <div style={{ fontSize: '26px', fontWeight: 600, marginTop: '4px' }}>
                  {money(period.totals.total_gross)}
                </div>
                <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                  {period.totals.staff_count} staff · {hoursText(period.totals.total_minutes)}
                </div>
                {(Number(period.totals.total_deposit_recovered) > 0
                  || Number(period.totals.total_advance_recovered) > 0
                  || period.totals.paid_count > 0) && (
                  <div style={{ marginTop: '10px', paddingTop: '10px',
                                borderTop: '1px solid var(--border-color, rgba(255,255,255,0.08))',
                                fontSize: '13px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between',
                                  gap: '20px' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>
                        Less security deposit
                      </span>
                      <span>−{money(period.totals.total_deposit_recovered)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between',
                                  gap: '20px' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>
                        Less advance recovery
                      </span>
                      <span>−{money(period.totals.total_advance_recovered)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between',
                                  gap: '20px', fontWeight: 600, marginTop: '3px' }}>
                      <span>Net payable</span>
                      <span>{money(period.totals.total_net_payable)}</span>
                    </div>
                    {period.totals.paid_count > 0 && (
                      <div style={{ fontSize: '11.5px', color: 'var(--text-muted)',
                                    marginTop: '5px' }}>
                        {period.totals.paid_count} of {period.totals.staff_count} paid.
                      </div>
                    )}
                  </div>
                )}
              </div>
              <StatusPill status={period.status} />
            </div>
          </div>

          {approved && (
            <Banner tone="ok" icon={Lock}
                    text="This payroll is approved and locked. Open a person to record their payment." />
          )}
          {!approved && blocked && (
            <Banner icon={AlertTriangle}
                    text={`${period.totals.blocked_count} staff member${period.totals.blocked_count > 1 ? 's have' : ' has'} a problem that must be fixed before this payroll can be approved. Open the row to see what.`} />
          )}
          {!approved && period.totals.open_session_count > 0 && (
            <Banner tone="warn" icon={AlertTriangle}
                    text={`${period.totals.open_session_count} attendance session${period.totals.open_session_count > 1 ? 's are' : ' is'} still open and not included. Those hours are not paid in this run.`} />
          )}

          {!approved && (
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px' }}>
              <button type="button" className="btn-secondary" disabled={busy}
                      onClick={() => run(() => api.generatePayroll(week))}
                      style={{ display: 'inline-flex', alignItems: 'center',
                               gap: '6px', minHeight: '42px' }}>
                <RefreshCw size={14} /> {busy ? 'Recalculating…' : 'Recalculate'}
              </button>
              <button type="button" className="btn-primary" disabled={busy || blocked}
                      onClick={() => { setApproveError(null); setConfirming(true); }}
                      style={{ display: 'inline-flex', alignItems: 'center',
                               gap: '6px', minHeight: '42px' }}>
                <Check size={14} /> Approve payroll
              </button>
            </div>
          )}

          {period.records.length === 0 ? (
            <div style={{ ...panel, padding: '28px', textAlign: 'center',
                          color: 'var(--text-secondary)' }}>
              No staff had completed attendance in this week.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {period.records.map((r) => (
                <div
                  key={r.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setOpenRecord(r.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setOpenRecord(r.id); }}
                  style={{ ...panel, padding: '14px 16px', cursor: 'pointer' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between',
                                alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '15px' }}>
                        {r.staff_name_snapshot}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)',
                                    marginTop: '2px' }}>
                        {r.staff_role_snapshot}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 600, fontSize: '16px' }}>
                        {money(r.net_payable ?? r.gross_earnings)}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        net · gross {money(r.gross_earnings)}
                      </div>
                      <StatusPill status={r.status} />
                    </div>
                  </div>

                  <div
                    className="mobile-stack-grid"
                    style={{
                      display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px',
                      marginTop: '12px', paddingTop: '12px',
                      borderTop: '1px solid var(--border-color, rgba(255,255,255,0.08))',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Hours</div>
                      <div style={{ fontWeight: 600 }}>{hoursText(r.worked_minutes)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Rate</div>
                      <div style={{ fontWeight: 600 }}>
                        {r.hourly_rate_snapshot === null ? '—' : `${money(r.hourly_rate_snapshot)}/hr`}
                      </div>
                    </div>
                  </div>

                  {Number(r.deposit_recovered) > 0 && (
                    <div style={{
                      display: 'flex', justifyContent: 'space-between',
                      fontSize: '12.5px', marginTop: '10px', paddingTop: '10px',
                      borderTop: '1px solid var(--border-color, rgba(255,255,255,0.08))',
                    }}>
                      <span style={{ color: 'var(--text-secondary)' }}>
                        Less security deposit
                      </span>
                      <span>−{money(r.deposit_recovered)}</span>
                    </div>
                  )}
                  {Number(r.advance_recovered) > 0 && (
                    <div style={{
                      display: 'flex', justifyContent: 'space-between',
                      fontSize: '12.5px', marginTop: '4px',
                    }}>
                      <span style={{ color: 'var(--text-secondary)' }}>
                        Less advance recovery
                      </span>
                      <span>−{money(r.advance_recovered)}</span>
                    </div>
                  )}
                  {(Number(r.deposit_recovered) > 0 || Number(r.advance_recovered) > 0) && (
                    <div style={{ display: 'flex', justifyContent: 'space-between',
                                  fontSize: '13px', fontWeight: 600, marginTop: '4px' }}>
                      <span>Net payable</span>
                      <span>{money(r.net_payable)}</span>
                    </div>
                  )}
                  {r.status === 'PAID' && r.payout && (
                    <div style={{ fontSize: '12px', color: 'var(--info-700)', marginTop: '8px',
                                  display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <CheckCircle2 size={13} />
                      Paid {money(r.payout.amount)} · {r.payout.method_display}
                    </div>
                  )}

                  {r.blocks_approval && (
                    <div style={{ fontSize: '12px', color: 'var(--danger-color)', marginTop: '10px',
                                  display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <AlertTriangle size={13} />
                      {r.rate_missing ? 'No hourly rate set' : 'Overlapping attendance'}
                    </div>
                  )}
                  {!r.blocks_approval && r.open_session_count > 0 && (
                    <div style={{ fontSize: '12px', color: '#a0691f', marginTop: '10px',
                                  display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <AlertTriangle size={13} />
                      {r.open_session_count} open session not included
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {confirming && period && (
        <ApproveDialog
          period={period}
          busy={busy}
          error={approveError}
          onCancel={() => setConfirming(false)}
          onConfirm={approve}
        />
      )}
    </>
  );
}
