import { useState } from 'react';
import { LIMITS } from '../../../utils/validate';
import { money, panel, weekLabel } from './payrollHelpers';
import { Banner, Modal } from './payrollParts';

/** Confirming a payroll: recording a payment and approving the week. */

/** The payout dialog. No amount field on purpose -- the server pays the approved net. */
export function PayoutDialog({ record, busy, error, onCancel, onConfirm }) {
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

export function ApproveDialog({ period, busy, error, onCancel, onConfirm }) {
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
