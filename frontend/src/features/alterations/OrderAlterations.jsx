import { useState } from 'react';
import { AlertTriangle, Scissors, X } from 'lucide-react';
import { api } from '../../services/api';
import { formatDate as fmtDate, formatMoney } from '../../services/format';
import VoiceTextarea from '../../components/ui/VoiceTextarea';
import { LIMITS, cleanAmount, amountError } from '../../services/validate';

/**
 * A delivered garment back for changes. An alteration is an order on the
 * short alteration path, numbered under this one (#12-A1), so once it is
 * taken in it lives in Orders and the Workshop like everything else. This is
 * the door from the order it came from: what has come back, and the intake.
 *
 * "Request alteration" only appears on a Delivered order, and only for the
 * roles that run the counter. The server enforces both again.
 */

const canRaise = (user) => !user?.role || ['Owner', 'Master'].includes(user.role);

const money = (value) => formatMoney(Number(value || 0));

export function RequestAlterationModal({ order, onClose, onCreated }) {
  const garments = order.garment_jobs || [];
  const [form, setForm] = useState({
    garment_job: garments.length === 1 ? garments[0].id : '',
    paid: true,
    issue: '',
    charge: '',
    paid_now: '',
    promised_by: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));

  const submit = async () => {
    if (!form.issue.trim()) { setError('Say what needs changing.'); return; }
    const charge = form.paid ? parseFloat(form.charge || 0) : 0;
    const bad = form.paid
      ? (amountError(form.charge, { label: 'Charge' }) || amountError(form.paid_now, { label: 'Paid now', max: charge }))
      : '';
    const dateBad = form.promised_by && form.promised_by < new Date().toISOString().slice(0, 10) ? 'Promised by cannot be in the past.' : '';
    if (bad || dateBad) { setError(bad || dateBad); return; }
    setBusy(true);
    setError(null);
    try {
      const created = await api.createAlterationOrder(order.id, {
        garment_job: form.garment_job || null,
        issue: form.issue.trim(),
        charge: form.paid && form.charge ? form.charge : '0',
        paid_now: form.paid && form.paid_now ? form.paid_now : '0',
        promised_by: form.promised_by || null,
      });
      onCreated(created);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const field = { width: '100%', marginBottom: '10px' };
  const label = { fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' };

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog" aria-label="Take a garment back for alteration"
        style={{ background: 'var(--surface-color, #17181a)', border: '1px solid var(--border-color)', borderRadius: '12px', width: '100%', maxWidth: '640px', maxHeight: '92vh', overflowY: 'auto', padding: '20px' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>Take a garment back for alteration</h3>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={18} /></button>
        </div>
        <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginTop: 0, marginBottom: '16px', lineHeight: 1.5 }}>
          Order {order.order_reference || order.order_id} stays as it is. This opens alteration {order.order_reference || ''}-A{(order.alterations || []).length + 1}, which goes through the workshop like any order.
        </p>

        {error && (
          <div style={{ display: 'flex', gap: '8px', padding: '10px 12px', borderRadius: '8px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', color: 'var(--danger-color)', fontSize: '13px', marginBottom: '12px', whiteSpace: 'pre-line' }}>
            <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: '1px' }} />
            <span>{error}</span>
          </div>
        )}

        <div style={field}>
          <label style={label}>Which garment came back?</label>
          {garments.length === 0 ? (
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>The whole order.</div>
          ) : (
            <select className="form-control" value={form.garment_job} onChange={set('garment_job')}>
              <option value="">Choose the garment…</option>
              {garments.map((garment) => (
                <option key={garment.id} value={garment.id}>
                  {garment.template_name || garment.template?.name || 'Garment'}
                </option>
              ))}
            </select>
          )}
        </div>

        <div style={field}>
          <label style={label}>Who is paying for it?</label>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {[
              [false, 'Free — our fault', 'Wrong measurement, stitching or fit on our side.'],
              [true, 'Paid — customer request', 'They have changed their mind or want something different.'],
            ].map(([paid, text, hint]) => (
              <button
                key={String(paid)}
                type="button"
                onClick={() => setForm((prev) => ({ ...prev, paid, charge: paid ? prev.charge : '', paid_now: paid ? prev.paid_now : '' }))}
                className={form.paid === paid ? 'btn-primary' : 'btn-secondary'}
                style={{ flex: '1 1 180px', textAlign: 'left', padding: '10px 12px', fontSize: '12.5px' }}
                title={hint}
              >
                {text}
              </button>
            ))}
          </div>
        </div>

        <div style={field}>
          <label style={label}>What needs changing?</label>
          <VoiceTextarea className="form-control" rows={3} maxLength={LIMITS.note} placeholder="The waist is loose, let out 1 inch…" value={form.issue} onChange={set('issue')} />
        </div>

        <div className="form-grid-2" style={{ gap: '12px' }}>
          {form.paid && (
            <>
              <div style={field}>
                <label style={label}>Charge</label>
                <input className="form-control" inputMode="decimal" value={form.charge}
                       onChange={(e) => setForm((prev) => ({ ...prev, charge: cleanAmount(e.target.value) }))} />
              </div>
              <div style={field}>
                <label style={label}>Paid now</label>
                <input className="form-control" inputMode="decimal" value={form.paid_now}
                       onChange={(e) => setForm((prev) => ({ ...prev, paid_now: cleanAmount(e.target.value) }))} />
              </div>
            </>
          )}
          <div style={field}>
            <label style={label}>Promised by</label>
            <input className="form-control" type="date" value={form.promised_by} onChange={set('promised_by')} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '6px' }}>
          <button type="button" className="btn-secondary" onClick={onClose}>Close</button>
          <button type="button" className="btn-primary" disabled={busy || (garments.length > 0 && !form.garment_job)} onClick={submit}>
            <Scissors size={14} /> {busy ? 'Taking it in…' : 'Take it in'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** The alterations raised on a delivered order, and the button to raise one. */
export default function OrderAlterations({ order, currentUser, onOpenAlteration, compact = false }) {
  const [open, setOpen] = useState(false);
  const rows = order.alterations || [];
  const delivered = order.order_status === 'Delivered';
  if (!delivered || order.flow === 'alteration') return null;
  if (rows.length === 0 && !canRaise(currentUser)) return null;

  return (
    <section className={compact ? '' : 'at-section od-alterations'} style={compact ? { marginTop: '8px' } : undefined}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: rows.length ? '10px' : 0 }}>
        <strong style={{ fontSize: compact ? '13px' : '15px' }}>Alterations{rows.length ? ` (${rows.length})` : ''}</strong>
        {canRaise(currentUser) && (
          <button type="button" className="btn-secondary at-btn-sm" style={{ marginLeft: 'auto' }} onClick={(e) => { e.stopPropagation(); setOpen(true); }}>
            <Scissors size={12} /> Request alteration
          </button>
        )}
      </div>
      {rows.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {rows.map((row) => (
            <button key={row.id} type="button"
                    onClick={(e) => { e.stopPropagation(); if (onOpenAlteration) onOpenAlteration(row.id); }}
                    style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', padding: '8px 12px', borderRadius: 'var(--radius-md)',
                             background: 'var(--surface-2)', border: '1px solid var(--border-color)', font: 'inherit', fontSize: '13px', color: 'var(--text-primary)',
                             textAlign: 'left', cursor: onOpenAlteration ? 'pointer' : 'default', minHeight: '36px' }}>
              <strong>{row.order_reference}</strong>
              <span style={{ color: 'var(--text-secondary)' }}>{row.garment_label || 'Garment'}</span>
              <span style={{ color: 'var(--text-secondary)' }}>{fmtDate(row.order_date)}</span>
              <span className={`ui-badge ui-badge--${row.order_status === 'Delivered' ? 'success' : row.order_status === 'Cancelled' ? 'neutral' : 'info'}`} style={{ marginLeft: 'auto' }}>
                {row.order_status === 'Delivered' ? 'Delivered' : row.order_status === 'Cancelled' ? 'Cancelled' : 'In the workshop'}
              </span>
              {Number(row.total_amount) > 0 && <span style={{ color: 'var(--text-secondary)' }}>{money(row.total_amount)}</span>}
            </button>
          ))}
        </div>
      )}
      {open && (
        <RequestAlterationModal
          order={order}
          onClose={() => setOpen(false)}
          onCreated={(created) => { setOpen(false); if (onOpenAlteration && created?.id) onOpenAlteration(created.id); }}
        />
      )}
    </section>
  );
}
