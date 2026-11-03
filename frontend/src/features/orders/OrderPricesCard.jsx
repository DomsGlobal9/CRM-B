/**
 * The order page's Prices: for an order taken with "Price not decided yet",
 * where its prices are added later (and, while it is open, changed). Each
 * garment's price parts, packaging, discount and GST; the server works out
 * the total, the balance and the payment status (OrderViewSet.set_prices),
 * and the invoice is made from them. Owner and Master only.
 */
import { useState } from 'react';
import { IndianRupee } from 'lucide-react';
import { api } from '../../services/api';
import { cleanAmount, LIMITS } from '../../services/validate';
import { IconTile } from '../../components/ui/Atelier';

const PARTS = [
  ['base_price', 'Price'],
  ['fabric_price', 'Fabric'],
  ['embroidery_price', 'Embroidery'],
  ['customization_price', 'Customization'],
  ['tailoring_charges', 'Tailoring'],
];

const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};
const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const fromOrder = (order) => ({
  garments: (order.garment_jobs || []).map((job) => ({
    id: job.id,
    name: job.display_name || job.template_name || 'Garment',
    ...Object.fromEntries(PARTS.map(([key]) => [key, num(job[key]) ? String(num(job[key])) : ''])),
  })),
  packaging_handling: num(order.packaging_handling) ? String(num(order.packaging_handling)) : '',
  discount: num(order.discount) ? String(num(order.discount)) : '',
  gst_mode: order.gst_mode || 'percent',
  gst_value: num(order.gst_value) ? String(num(order.gst_value)) : '',
});

export default function OrderPricesCard({ order, onSaved }) {
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = Boolean(order.price_pending);
  const closed = ['Delivered', 'Cancelled'].includes(order.order_status);
  const paid = num(order.amount_paid);

  const setGarment = (index, key, value) => setForm((f) => ({
    ...f, garments: f.garments.map((g, i) => (i === index ? { ...g, [key]: cleanAmount(value) } : g)),
  }));
  const gstMax = form?.gst_mode === 'amount' ? LIMITS.amount : 100;

  // The same sums the server makes (domains/orders/pricing.py).
  const subtotal = form ? form.garments.reduce((sum, g) => sum + PARTS.reduce((s, [key]) => s + num(g[key]), 0), 0)
    + num(form.packaging_handling) - num(form.discount) : 0;
  const gst = !form || !(num(form.gst_value) > 0) ? 0
    : form.gst_mode === 'amount' ? num(form.gst_value) : (subtotal * num(form.gst_value)) / 100;
  const total = subtotal + gst;

  const save = async () => {
    if (num(form.discount) > subtotal + num(form.discount)) { setError('The discount cannot be more than the prices.'); return; }
    if (paid > total) { setError(`${inr(paid)} is already paid, which is more than these prices come to (${inr(total)}).`); return; }
    setBusy(true);
    setError('');
    try {
      const updated = await api.setOrderPrices(order.id, {
        garments: form.garments.map((g) => ({ id: g.id, ...Object.fromEntries(PARTS.map(([key]) => [key, num(g[key])])) })),
        packaging_handling: num(form.packaging_handling),
        discount: num(form.discount),
        gst_mode: form.gst_mode,
        gst_value: num(form.gst_value),
      });
      setForm(null);
      if (onSaved) onSaved(updated);
    } catch (err) {
      setError(err.message || 'Could not save the prices.');
    } finally {
      setBusy(false);
    }
  };

  const money = (id, label, value, onChange, extra = {}) => (
    <div className="wz-money-row" key={id}>
      <label htmlFor={id} className="wz-money-label">{label}</label>
      <div className="wz-money-input">
        {extra.prefix ?? <span>₹</span>}
        <input id={id} type="number" min="0" step="0.01" inputMode="decimal" className="form-control"
               value={value} placeholder="0" disabled={busy} onChange={(e) => onChange(e.target.value)} {...extra.input} />
      </div>
    </div>
  );

  return (
    <section className="at-section od-prices">
      <div className="od-section-head">
        <IconTile icon={IndianRupee} tone={pending ? 'amber' : 'green'} size={40} iconSize={18} />
        <div className="od-section-title od-section-title--stack">
          <h3>Prices</h3>
          <span className="od-section-sub">
            {pending ? 'Price not decided yet. Add the prices to make the invoice.' : 'What this order comes to.'}
          </span>
        </div>
        {!form && !closed && (
          <button type="button" className={pending ? 'btn-primary at-btn-sm' : 'btn-secondary at-btn-sm'}
                  onClick={() => { setError(''); setForm(fromOrder(order)); }}>
            {pending ? 'Add prices' : 'Edit prices'}
          </button>
        )}
      </div>

      {!form && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14 }}>
          {!pending && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Total</span><strong>{inr(order.total_amount)}</strong></div>}
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>{pending ? 'Advance received' : 'Paid'}</span><strong>{inr(paid)}</strong>
          </div>
          {!pending && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Balance</span><strong>{inr(Math.max(0, num(order.total_amount) - paid))}</strong>
            </div>
          )}
        </div>
      )}

      {form && (
        <div className="wz-money" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {form.garments.map((g, index) => (
            <div key={g.id} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {money(`op-${g.id}-base_price`, g.name, g.base_price, (v) => setGarment(index, 'base_price', v))}
              <details className="wz-more">
                <summary>Break this price down <span className="od-hint">(optional)</span></summary>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                  {PARTS.slice(1).map(([key, label]) => money(`op-${g.id}-${key}`, label, g[key], (v) => setGarment(index, key, v)))}
                </div>
              </details>
            </div>
          ))}
          {money('op-packaging', 'Packaging & handling', form.packaging_handling,
                 (v) => setForm((f) => ({ ...f, packaging_handling: cleanAmount(v) })))}
          {money('op-discount', 'Discount', form.discount,
                 (v) => setForm((f) => ({ ...f, discount: cleanAmount(v) })))}
          {money('op-gst', 'GST', form.gst_value,
                 (v) => setForm((f) => ({ ...f, gst_value: cleanAmount(v, { max: gstMax }) })), {
                   prefix: (
                     <select className="form-control" aria-label="GST as" style={{ width: '64px', textAlign: 'left' }}
                             value={form.gst_mode} disabled={busy}
                             onChange={(e) => setForm((f) => ({ ...f, gst_mode: e.target.value,
                               gst_value: cleanAmount(f.gst_value, { max: e.target.value === 'amount' ? LIMITS.amount : 100 }) }))}>
                       <option value="percent">%</option>
                       <option value="amount">₹</option>
                     </select>
                   ),
                   input: { max: gstMax },
                 })}
          <div className="wz-money-total">
            <div><span>{form.gst_mode !== 'amount' && num(form.gst_value) > 0 ? `GST ${num(form.gst_value)}%` : 'GST'}</span><strong>{inr(gst)}</strong></div>
            <div className="wz-money-grand"><span>Total</span><strong>{inr(total)}</strong></div>
          </div>
          <div className="od-hint" style={{ textAlign: 'right' }}>
            Paid {inr(paid)} · Balance {inr(Math.max(0, total - paid))}
          </div>
          {error && <div className="od-error" role="alert">{error}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <button type="button" className="btn-secondary" disabled={busy} onClick={() => { setForm(null); setError(''); }}>Cancel</button>
            <button type="button" className="btn-primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save prices'}</button>
          </div>
        </div>
      )}
    </section>
  );
}
