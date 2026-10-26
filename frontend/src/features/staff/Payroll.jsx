
import { useState, useEffect, useCallback, useMemo } from 'react';
import { AlertTriangle, Check, ChevronLeft, CheckCircle2, Lock, Pencil, RefreshCw, X } from 'lucide-react';

import { api } from '../../services/api';
import { LIMITS } from '../../services/validate';
import Loader from '../../components/ui/Loader';
import { CorrectionForm } from './CorrectionForm';

const panel = {
  background: 'var(--surface-color)',
  boxShadow: 'var(--shadow-sm)',
  border: '1px solid var(--border-color)',
  borderRadius: 'var(--radius-lg)',
};

/** Rupees, grouped the Indian way, from a server-sent string. Never computed here. */
const money = (value) =>
  value === null || value === undefined
    ? '—'
    : `₹${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const hoursText = (minutes) => {
  const total = Number(minutes || 0);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
};

const dayText = (iso) =>
  iso ? new Date(iso).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' }) : '—';

const clockText = (iso) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';

const mondayOf = (value) => {
  const d = new Date(value);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};

const weekLabel = (start, end) => {
  if (!start) return '';
  const fmt = (s) => new Date(s).toLocaleDateString([], { day: 'numeric', month: 'short' });
  return `${fmt(start)} – ${fmt(end)}`;
};

function Banner({ text, tone = 'error', icon: Icon }) {
  const c = tone === 'error'
    ? { bg: 'rgba(220,80,60,0.12)', bd: 'rgba(220,80,60,0.35)', fg: 'var(--danger-color)' }
    : tone === 'warn'
      ? { bg: 'rgba(200,140,50,0.12)', bd: 'rgba(200,140,50,0.35)', fg: '#a0691f' }
      : { bg: 'rgba(46,180,120,0.12)', bd: 'rgba(46,180,120,0.35)', fg: '#1e8a5c' };
  return (
    <div style={{
      background: c.bg, border: `1px solid ${c.bd}`, color: c.fg, borderRadius: '8px',
      padding: '10px 12px', fontSize: '13px', marginBottom: '14px',
      display: 'flex', gap: '8px', alignItems: 'flex-start',
    }}>
      {Icon && <Icon size={15} style={{ flexShrink: 0, marginTop: '1px' }} />}
      <span>{text}</span>
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
        <div style={{ display: 'flex', justifyContent: 'space-between',
                      alignItems: 'center', marginBottom: '18px' }}>
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

function StatusPill({ status }) {
  const tone = status === 'PAID'
    ? { bg: 'rgba(47,74,122,0.15)', fg: '#2f4a7a', label: 'Paid', Icon: CheckCircle2 }
    : status === 'APPROVED'
      ? { bg: 'rgba(46,180,120,0.15)', fg: '#1e8a5c', label: 'Approved', Icon: Lock }
      : { bg: 'rgba(140,140,140,0.15)', fg: 'var(--text-secondary)', label: 'Draft', Icon: null };
  return (
    <span style={{
      fontSize: '11px', fontWeight: 600, letterSpacing: '0.04em',
      textTransform: 'uppercase', padding: '3px 8px', borderRadius: '4px',
      background: tone.bg, color: tone.fg,
      display: 'inline-flex', alignItems: 'center', gap: '4px',
    }}>
      {tone.Icon && <tone.Icon size={10} />} {tone.label}
    </span>
  );
}

/** The payout dialog. No amount field on purpose -- the server pays the approved net. */
function PayoutDialog({ record, busy, error, onCancel, onConfirm }) {
  const [method, setMethod] = useState('CASH');
  const [reference, setReference] = useState('');
  return (
    <Modal title="Record payment" onClose={busy ? () => {} : onCancel}>
      {error && <Banner text={error} />}
      <p style={{ fontSize: '14px', marginTop: 0 }}>
        Record that <strong>{record.staff_name_snapshot}</strong> has been paid
        <strong> {money(record.net_payable)}</strong> for this week?
      </p>
      <div className="mobile-stack-grid"
           style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', margin: '14px 0' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }} htmlFor="po-method">
            How it was paid
          </label>
          <select id="po-method" value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="CASH">Cash</option>
            <option value="BANK_TRANSFER">Bank transfer</option>
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }} htmlFor="po-ref">
            Reference
          </label>
          <input id="po-ref" value={reference} maxLength={LIMITS.reference} onChange={(e) => setReference(e.target.value)}
                 placeholder={method === 'CASH' ? 'Voucher number' : 'UTR'} />
        </div>
      </div>
      <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
        This records the payment you have made; it does not move money. The
        amount is the approved net and cannot be changed here. Once recorded,
        this payslip is locked.
      </p>
      <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '18px' }}>
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="button" className="btn-primary" disabled={busy}
                onClick={() => onConfirm({ method, reference })}>
          {busy ? 'Recording…' : 'Record payment'}
        </button>
      </div>
    </Modal>
  );
}


/** Ids of completed sessions that share an instant with another -- the same
 *  test the server's _overlaps applies, so the rows it blames can be marked. */
const overlappingIds = (sessions) => {
  const ids = new Set();
  const done = sessions.filter((s) => s.check_out).sort((a, b) => a.check_in.localeCompare(b.check_in));
  done.forEach((earlier, i) => {
    const later = done[i + 1];
    if (later && new Date(earlier.check_out) > new Date(later.check_in)) {
      ids.add(earlier.id);
      ids.add(later.id);
    }
  });
  return ids;
};

/**
 * A draft week's attendance as it stands now, correctable in place.
 *
 * Read live from the timesheet rather than from the record's frozen breakdown,
 * because the breakdown leaves out exactly the sessions that need fixing (the
 * open ones). Saving a correction recalculates the draft, so a blocked row can
 * be cleared without leaving payroll.
 */
function LiveSessions({ record, week, onRecalculate }) {
  const [sheet, setSheet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [correcting, setCorrecting] = useState(null);
  const [recalculating, setRecalculating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSheet(await api.getTimesheet({ staff: record.staff, week }));
    } catch (err) {
      setError(err.message || 'Could not load this week’s attendance.');
      setSheet(null);
    } finally {
      setLoading(false);
    }
  }, [record.staff, week]);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  const overlaps = useMemo(() => overlappingIds(sheet?.sessions || []), [sheet]);

  const saved = async () => {
    setCorrecting(null);
    setRecalculating(true);
    setError(null);
    try {
      await onRecalculate();
      await load();
    } catch (err) {
      setError(err.message || 'The correction was saved, but the draft could not be recalculated. Use Recalculate.');
    } finally {
      setRecalculating(false);
    }
  };

  return (
    <>
      <h4 style={{ fontSize: '13px', fontWeight: 600, margin: '0 0 4px' }}>
        Attendance behind this total
      </h4>
      <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 10px' }}>
        Live from attendance. Correct a session here and this draft recalculates.
      </p>

      {error && <Banner text={error} />}

      {loading || recalculating ? (
        <Loader section label={recalculating ? 'Recalculating…' : 'Loading attendance…'} />
      ) : !sheet || sheet.sessions.length === 0 ? (
        <div style={{ ...panel, padding: '20px', textAlign: 'center',
                      color: 'var(--text-secondary)', fontSize: '13px' }}>
          No attendance in this week.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {sheet.sessions.map((s) => {
            const overlap = overlaps.has(s.id);
            return (
              <div key={s.id} style={{
                ...panel, padding: '11px 14px',
                ...(overlap ? { borderColor: 'rgba(220,80,60,0.5)' }
                  : s.is_open ? { borderColor: 'rgba(200,140,50,0.5)' } : {}),
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between',
                              gap: '10px', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600, fontSize: '14px' }}>{dayText(s.check_in)}</span>
                  <span style={{ fontWeight: 600 }}>{s.is_open ? 'Still open' : hoursText(s.minutes)}</span>
                </div>
                <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginTop: '3px' }}>
                  {clockText(s.check_in)} → {s.is_open ? '—' : clockText(s.check_out)}
                  {' · '}{s.source === 'OWNER' ? 'Entered by owner' : s.source === 'WORK' ? 'From start of work' : 'Self'}
                  {s.was_corrected && ' · corrected'}
                </div>
                {(overlap || s.is_open) && (
                  <div style={{ fontSize: '12px', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '5px',
                                color: overlap ? 'var(--danger-color)' : '#a0691f' }}>
                    <AlertTriangle size={13} />
                    {overlap ? 'Overlaps another session, so this time would be paid twice'
                      : 'No check-out, so these hours are not paid in this run'}
                  </div>
                )}
                <button type="button" className="btn-secondary" onClick={() => setCorrecting(s)}
                        style={{ marginTop: '10px', display: 'inline-flex',
                                 alignItems: 'center', gap: '6px', minHeight: '36px' }}>
                  <Pencil size={13} /> {s.is_open ? 'Add check-out' : 'Correct'}
                </button>
              </div>
            );
          })}
          <div style={{ ...panel, padding: '11px 14px', display: 'flex',
                        justifyContent: 'space-between', fontWeight: 600 }}>
            <span>Paid in this draft</span>
            <span>{hoursText(record.worked_minutes)}</span>
          </div>
        </div>
      )}

      {correcting && (
        <Modal title="Correct attendance" onClose={() => setCorrecting(null)}>
          <CorrectionForm session={correcting} onCancel={() => setCorrecting(null)} onSaved={saved} />
        </Modal>
      )}
    </>
  );
}

function RecordDetail({ record, week, onBack, onPaid, onRecalculate }) {
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
      <button type="button" className="btn-secondary" onClick={onBack}
              style={{ marginBottom: '14px', display: 'inline-flex',
                       alignItems: 'center', gap: '6px', minHeight: '38px' }}>
        <ChevronLeft size={15} /> Back to payroll
      </button>

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
                        color: '#2f4a7a' }}>
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

function ApproveDialog({ period, busy, error, onCancel, onConfirm }) {
  const t = period.totals;
  return (
    <Modal title="Approve payroll" onClose={busy ? () => {} : onCancel}>
      {error && <Banner text={error} />}
      <p style={{ fontSize: '14px', marginTop: 0 }}>
        Approve payroll for <strong>{weekLabel(period.period_start, period.period_end)}</strong>?
      </p>
      <div style={{ ...panel, padding: '14px 16px', margin: '14px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
          <span style={{ color: 'var(--text-secondary)' }}>Staff</span>
          <strong>{t.staff_count}</strong>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--text-secondary)' }}>Total gross</span>
          <strong>{money(t.total_gross)}</strong>
        </div>
      </div>
      <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
        After approval this payroll is locked. Later changes to attendance or to
        anyone&rsquo;s hourly rate will not alter it.
      </p>
      <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '18px' }}>
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="button" className="btn-primary" onClick={onConfirm} disabled={busy}>
          {busy ? 'Approving…' : 'Approve payroll'}
        </button>
      </div>
    </Modal>
  );
}

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
          onBack={() => setOpenRecord(null)}
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
                    <div style={{ fontSize: '12px', color: '#2f4a7a', marginTop: '8px',
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
