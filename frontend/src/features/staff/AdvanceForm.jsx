import { useState } from 'react';
import { api } from '../../api';
import { cleanAmount, amountError, todayIso } from '../../utils/validate';
import { cleaned, errorBox } from './staffShared';

/** Issuing an advance to a team member. */

export default function AdvanceForm({ member, onCancel, onSaved }) {
  const [form, setForm] = useState({
    amount: '', weekly_recovery: '',
    issued_on: new Date().toISOString().slice(0, 10), reason: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    const problem = amountError(form.amount, { label: 'Amount', allowZero: false, required: true })
      || amountError(form.weekly_recovery, { label: 'Weekly recovery' })
      || (Number(form.weekly_recovery || 0) > Number(form.amount) ? 'Weekly recovery cannot be more than the advance.' : '')
      || (form.issued_on > todayIso() ? 'The advance date cannot be in the future.' : '');
    if (problem) { setError(problem); return; }
    setSaving(true);
    setError(null);
    try {
      await api.issueAdvance({ ...cleaned(form), staff: member.id });
      onSaved();
    } catch (err) {
      setError(err.message || 'Could not issue this advance.');
    } finally {
      setSaving(false);
    }
  };

  const field = { display: 'flex', flexDirection: 'column', gap: '5px' };
  const label = { fontSize: '12px', color: 'var(--text-secondary)' };
  return (
    <form onSubmit={submit}>
      {error && (
        <div style={errorBox}>{error}</div>
      )}
      <div className="mobile-stack-grid"
           style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
        <div style={field}>
          <label style={label} htmlFor="adv-amount">Amount (₹)</label>
          <input id="adv-amount" inputMode="decimal" required
                 value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: cleanAmount(e.target.value) }))} placeholder="0.00" />
        </div>
        <div style={field}>
          <label style={label} htmlFor="adv-weekly">Recover per week (₹)</label>
          <input id="adv-weekly" inputMode="decimal"
                 value={form.weekly_recovery} onChange={(e) => setForm((f) => ({ ...f, weekly_recovery: cleanAmount(e.target.value) }))} placeholder="0.00" />
        </div>
        <div style={field}>
          <label style={label} htmlFor="adv-date">Given on</label>
          <input id="adv-date" type="date" required max={todayIso()} value={form.issued_on} onChange={set('issued_on')} />
        </div>
        <div style={field}>
          <label style={label} htmlFor="adv-reason">Reason</label>
          <input id="adv-reason" value={form.reason} maxLength={255} onChange={set('reason')}
                 placeholder="Emergency advance" />
        </div>
      </div>
      <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '14px' }}>
        Recovery is taken from payroll each week, after the security deposit and
        never more than the week earned. Oldest advance first.
      </p>
      <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '18px' }}>
        <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? 'Saving…' : 'Issue advance'}
        </button>
      </div>
    </form>
  );
}
