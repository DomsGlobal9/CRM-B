import { useCallback, useEffect, useState } from 'react';
import { ShoppingCart } from 'lucide-react';
import { api } from '../../services/api';
import { Field, Modal, SelectField } from './ItemFormModal';

/**
 * Things to buy for particular orders: the pink zari a customer asked for
 * that the shelf does not hold. Not stock -- each row is one order's, from
 * "to buy" through bought, in hand, and used up on that garment.
 */

const TONE = { TO_PURCHASE: 'warning', PURCHASED: 'info', RECEIVED: 'success', USED: 'neutral', CANCELLED: 'neutral' };
const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const qty = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 });
const panel = {
  background: 'var(--surface-color)', border: '1px solid var(--border-color)',
  borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)',
};

export default function OrderPurchasesTab({ suppliers = [], isOwner }) {
  const [rows, setRows] = useState([]);
  const [showDone, setShowDone] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState(null); // { row, kind: 'purchased' | 'received' | 'use' }

  const refresh = useCallback(() => {
    api.getOrderPurchases(showDone ? {} : { open: 1 })
      .then((data) => { setRows(Array.isArray(data) ? data : (data?.results || [])); setError(''); })
      .catch((e) => setError(e.message || 'Could not load purchases.'));
  }, [showDone]);
  useEffect(() => { refresh(); }, [refresh]);

  const cancel = async (row) => {
    if (!window.confirm(`Cancel buying "${row.name}" for ${row.order_reference}?`)) return;
    try { await api.stepOrderPurchase(row.id, 'cancel'); refresh(); }
    catch (e) { alert(e.message); }
  };

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '20px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
          Bought specially for one order. Nothing here touches boutique stock.
        </span>
        <label style={{ marginLeft: 'auto', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
          <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> Show used and cancelled
        </label>
      </div>

      {error && <div style={{ ...panel, padding: '16px', marginTop: '16px', color: 'var(--danger-color)' }}>{error}</div>}

      {!error && rows.length === 0 ? (
        <div style={{ ...panel, padding: '48px', textAlign: 'center', marginTop: '16px', color: 'var(--text-muted)' }}>
          <ShoppingCart size={22} style={{ marginBottom: '8px' }} />
          <div>Nothing to buy for orders right now.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '12px', marginTop: '16px' }}>
          {rows.map((row) => (
            <div key={row.id} style={{ ...panel, padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>🛒 {row.name}</div>
                  <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                    Order {row.order_reference} · {row.customer_name}{row.garment_name ? ` · ${row.garment_name}` : ''}
                  </div>
                </div>
                <span className={`ui-badge ui-badge--${TONE[row.status] || 'neutral'}`}>{row.status_display}</span>
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 12px' }}>
                <span>{qty(row.quantity)} {row.unit_display}</span>
                <span>{row.actual_cost != null ? `${inr(row.actual_cost)} paid` : `${inr(row.estimated_cost)} estimated`}</span>
                {row.required_by && <span>Needed by {new Date(row.required_by).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>}
                {row.supplier_name && <span>From {row.supplier_name}</span>}
                {row.status === 'RECEIVED' && (
                  <span style={{ gridColumn: '1 / -1' }}>
                    Received {qty(row.received_quantity)} · used {qty(row.used_quantity)} · {qty(row.remaining_quantity)} {row.unit_display} left
                  </span>
                )}
                {row.status === 'USED' && <span style={{ gridColumn: '1 / -1' }}>Used {qty(row.used_quantity)} {row.unit_display}</span>}
                {row.notes && <span style={{ gridColumn: '1 / -1', fontStyle: 'italic' }}>{row.notes}</span>}
              </div>
              {isOwner && (
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
                  {row.status === 'TO_PURCHASE' && (
                    <>
                      <button type="button" className="btn-primary at-btn-sm" onClick={() => setStep({ row, kind: 'purchased' })}>Mark as purchased</button>
                      <button type="button" className="btn-secondary at-btn-sm" onClick={() => setStep({ row, kind: 'received' })}>Received</button>
                      <button type="button" className="btn-secondary at-btn-sm" onClick={() => cancel(row)}>Cancel</button>
                    </>
                  )}
                  {row.status === 'PURCHASED' && (
                    <button type="button" className="btn-primary at-btn-sm" onClick={() => setStep({ row, kind: 'received' })}>Mark as received</button>
                  )}
                  {row.status === 'RECEIVED' && (
                    <button type="button" className="btn-primary at-btn-sm" onClick={() => setStep({ row, kind: 'use' })}>Record used</button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {step && (
        <StepModal step={step} suppliers={suppliers} onClose={() => setStep(null)}
                   onDone={() => { setStep(null); refresh(); }} />
      )}
    </>
  );
}

function StepModal({ step, suppliers, onClose, onDone }) {
  const { row, kind } = step;
  const [cost, setCost] = useState(row.estimated_cost != null ? String(row.estimated_cost) : '');
  const [supplier, setSupplier] = useState('');
  const [date, setDate] = useState('');
  const [ref, setRef] = useState('');
  const [quantity, setQuantity] = useState(kind === 'received' ? String(row.quantity) : String(row.remaining_quantity || row.quantity));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const titles = { purchased: `Bought: ${row.name}`, received: `Received: ${row.name}`, use: `Used on ${row.garment_name || 'the garment'}: ${row.name}` };

  const save = async () => {
    setBusy(true); setError('');
    try {
      if (kind === 'purchased') {
        await api.stepOrderPurchase(row.id, 'purchased', {
          actual_cost: cost || 0, supplier: supplier || null, purchased_at: date || null, invoice_reference: ref,
        });
      } else {
        await api.stepOrderPurchase(row.id, kind, { quantity });
      }
      onDone();
    } catch (e) { setError(e.message || 'Could not save.'); }
    finally { setBusy(false); }
  };

  return (
    <Modal title={titles[kind]} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {kind === 'purchased' ? (
          <>
            <Field label="What it actually cost (₹)" type="number" value={cost} onChange={setCost} required />
            {suppliers.length > 0 && (
              <SelectField label="Bought from" value={supplier} onChange={setSupplier}
                           options={[{ value: '', label: 'Not recorded' }, ...suppliers.map((s) => ({ value: s.id, label: s.name }))]} />
            )}
            <Field label="Purchase date" type="date" value={date} onChange={setDate} />
            <Field label="Bill / reference" value={ref} onChange={setRef} placeholder="Optional" />
          </>
        ) : (
          <Field label={kind === 'received' ? `Quantity received (${row.unit_display})` : `Quantity used (${row.unit_display})`}
                 type="number" decimals={3} value={quantity} onChange={setQuantity} required />
        )}
        {error && <div style={{ color: 'var(--danger-color)', fontSize: '13px' }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </Modal>
  );
}
