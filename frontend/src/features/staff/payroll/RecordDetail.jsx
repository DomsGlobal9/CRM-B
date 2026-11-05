import { useState } from 'react';
import { AlertTriangle, Check, CheckCircle2 } from 'lucide-react';
import { api } from '../../../api';
import { Crumbs } from '../../../components/ui/Breadcrumbs';
import LiveSessions from './LiveSessions';
import { PayoutDialog } from './PayrollDialogs';
import { clockText, dayText, hoursText, money, panel } from './payrollHelpers';
import { Banner, StatusPill } from './payrollParts';

/** One person's payroll for the week. */

export default function RecordDetail({ record, week, onPaid, onRecalculate }) {
  const [paying, setPaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const confirmPayout = async ({ method, reference }) => {
    setBusy(true);
    setError(null);
    try {
      const updated = await api.recordPayout(record.id, { method, reference });
      setPaying(false);
      onPaid?.(updated);
    } catch (err) {
      setError(err.message || 'Could not record that payment.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Crumbs level={3} items={[{ label: record.staff_name_snapshot }]} />

      <div style={{ ...panel, padding: '18px', marginBottom: '14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between',
                      gap: '10px', flexWrap: 'wrap', marginBottom: '14px' }}>
          <div>
            <div style={{ fontSize: '18px', fontWeight: 600 }}>{record.staff_name_snapshot}</div>
            <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
              {record.staff_role_snapshot}
            </div>
          </div>
          <StatusPill status={record.status} />
        </div>

        <div
          className="mobile-stack-grid"
          style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px',
            paddingTop: '14px',
            borderTop: '1px solid var(--border-color, rgba(255,255,255,0.08))',
          }}
        >
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Hours worked</div>
            <div style={{ fontSize: '17px', fontWeight: 600 }}>{hoursText(record.worked_minutes)}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              {record.worked_minutes} minutes
            </div>
          </div>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Rate used</div>
            <div style={{ fontSize: '17px', fontWeight: 600 }}>
              {record.hourly_rate_snapshot === null ? '—' : `${money(record.hourly_rate_snapshot)}/hr`}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              as at generation
            </div>
          </div>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Gross earnings</div>
            <div style={{ fontSize: '17px', fontWeight: 600 }}>{money(record.gross_earnings)}</div>
          </div>
        </div>
      </div>

      {Number(record.deposit_scheduled) > 0 && (
        <div style={{ ...panel, padding: '16px 18px', marginBottom: '14px' }}>
          <div style={{ fontSize: '11px', letterSpacing: '0.08em',
                        textTransform: 'uppercase', color: 'var(--text-muted)',
                        marginBottom: '10px' }}>
            Security deposit
          </div>
          {[
            ['Scheduled this week', money(record.deposit_scheduled)],
            ['Actually recovered', `−${money(record.deposit_recovered)}`],
            ...(Number(record.deposit_unrecovered) > 0
              ? [['Could not be recovered', money(record.deposit_unrecovered)]] : []),
            ['Owed before', money(record.deposit_balance_before)],
            ['Owed after', money(record.deposit_balance_after)],
          ].map(([label, value]) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between',
                                      fontSize: '13px', marginBottom: '4px' }}>
              <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
              <span style={{ fontWeight: 600 }}>{value}</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between',
                        fontSize: '14px', fontWeight: 600, marginTop: '10px',
                        paddingTop: '10px',
                        borderTop: '1px solid var(--border-color, rgba(255,255,255,0.08))' }}>
            <span>Net before other deductions</span>
            <span>{money(record.net_before_other_deductions)}</span>
          </div>
          {Number(record.deposit_unrecovered) > 0 && (
            <div style={{ fontSize: '12px', color: '#a0691f', marginTop: '8px' }}>
              This week&rsquo;s earnings could not cover the full scheduled
              recovery. The remainder stays outstanding.
            </div>
          )}
        </div>
      )}

      {Number(record.advance_scheduled) > 0 && (
        <div style={{ ...panel, padding: '16px 18px', marginBottom: '14px' }}>
          <div style={{ fontSize: '11px', letterSpacing: '0.08em',
                        textTransform: 'uppercase', color: 'var(--text-muted)',
                        marginBottom: '10px' }}>
            Advance recovery
          </div>
          {[
            ['Scheduled this week', money(record.advance_scheduled)],
            ['Actually recovered', `−${money(record.advance_recovered)}`],
            ...(Number(record.advance_unrecovered) > 0
              ? [['Could not be recovered', money(record.advance_unrecovered)]] : []),
            ['Advance owed before', money(record.advance_balance_before)],
            ['Advance owed after', money(record.advance_balance_after)],
          ].map(([label, value]) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between',
                                      fontSize: '13px', marginBottom: '4px' }}>
              <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
              <span style={{ fontWeight: 600 }}>{value}</span>
            </div>
          ))}
          {Number(record.advance_unrecovered) > 0 && (
            <div style={{ fontSize: '12px', color: '#a0691f', marginTop: '8px' }}>
              After the security deposit, this week could not cover the full
              scheduled advance recovery. The remainder stays outstanding.
            </div>
          )}
        </div>
      )}

      <div style={{ ...panel, padding: '16px 18px', marginBottom: '14px' }}>
        {[
          ['Gross earnings', money(record.gross_earnings)],
          ['Less security deposit', `−${money(record.deposit_recovered)}`],
          ['Less advance recovery', `−${money(record.advance_recovered)}`],
        ].map(([label, value]) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between',
                                    fontSize: '13px', marginBottom: '4px' }}>
            <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
            <span>{value}</span>
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between',
                      fontSize: '16px', fontWeight: 600, marginTop: '10px',
                      paddingTop: '10px',
                      borderTop: '1px solid var(--border-color, rgba(255,255,255,0.08))' }}>
          <span>Net payable</span>
          <span>{money(record.net_payable)}</span>
        </div>

        {record.status === 'PAID' && record.payout && (
          <div style={{ marginTop: '12px', paddingTop: '12px', fontSize: '13px',
                        borderTop: '1px solid var(--border-color, rgba(255,255,255,0.08))',
                        color: 'var(--info-700)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
              <CheckCircle2 size={14} /> Payment recorded
            </div>
            <div style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
              {money(record.payout.amount)} · {record.payout.method_display}
              {record.payout.reference && ` · ${record.payout.reference}`}
              {' · '}{dayText(record.payout.paid_at)}
            </div>
          </div>
        )}
        {record.status === 'APPROVED' && (
          <button type="button" className="btn-primary" disabled={busy}
                  onClick={() => { setError(null); setPaying(true); }}
                  style={{ marginTop: '14px', minHeight: '42px', display: 'inline-flex',
                           alignItems: 'center', gap: '6px' }}>
            <Check size={14} /> Record payment
          </button>
        )}
      </div>

      {record.rate_missing && (
        <Banner icon={AlertTriangle}
                text={`No hourly rate is set for ${record.staff_name_snapshot}. Set one on the Team tab and recalculate — payroll cannot be approved until then.`} />
      )}
      {record.has_overlap && (
        <Banner icon={AlertTriangle}
                text="Two attendance sessions overlap in this week, so the same time would be paid twice. Correct one of the sessions marked below." />
      )}
      {record.open_session_count > 0 && (
        <Banner tone="warn" icon={AlertTriangle}
                text={`${record.open_session_count} attendance session${record.open_session_count > 1 ? 's are' : ' is'} still open and not included in this payroll. Add a check-out below to include those hours.`} />
      )}

      {/* A draft is still open to correction; an approved or paid record shows
          the frozen evidence it was approved on. */}
      {record.status === 'DRAFT' && record.staff ? (
        <LiveSessions record={record} week={week} onRecalculate={onRecalculate} />
      ) : (
      <>
      <h4 style={{ fontSize: '13px', fontWeight: 600, margin: '0 0 10px' }}>
        Attendance behind this total
      </h4>
      {record.session_breakdown.length === 0 ? (
        <div style={{ ...panel, padding: '20px', textAlign: 'center',
                      color: 'var(--text-secondary)', fontSize: '13px' }}>
          No completed attendance in this week.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {record.session_breakdown.map((s) => (
            <div key={s.id} style={{ ...panel, padding: '11px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between',
                            gap: '10px', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 600, fontSize: '14px' }}>{dayText(s.check_in)}</span>
                <span style={{ fontWeight: 600 }}>{hoursText(s.minutes)}</span>
              </div>
              <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginTop: '3px' }}>
                {clockText(s.check_in)} → {clockText(s.check_out)}
                {' · '}{s.source === 'OWNER' ? 'Entered by owner' : 'Self'}
                {s.was_corrected && ' · corrected'}
              </div>
            </div>
          ))}
          <div style={{ ...panel, padding: '11px 14px', display: 'flex',
                        justifyContent: 'space-between', fontWeight: 600 }}>
            <span>Total</span>
            <span>{hoursText(record.worked_minutes)}</span>
          </div>
        </div>
      )}
      </>
      )}

      {paying && (
        <PayoutDialog record={record} busy={busy} error={error}
                      onCancel={() => setPaying(false)} onConfirm={confirmPayout} />
      )}
    </>
  );
}
