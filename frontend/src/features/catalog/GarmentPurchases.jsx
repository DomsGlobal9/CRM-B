import { Plus, ShoppingCart, X } from 'lucide-react';
import { UNITS, purchaseError } from './materials';

/**
 * What must be bought for this one garment because the shelf does not have
 * it: the pink zari, the special border. Plain words, no inventory talk.
 * Each row becomes an inventory.OrderPurchase when the order is placed.
 */

/** The details of one thing to buy, after its name: how much, what it might
 *  cost, when it is needed, and a note. */
export function PurchaseDetails({ row, onChange }) {
  const set = (patch) => onChange({ ...row, ...patch });
  return (
    <>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <input className="form-control" type="number" min="0" step="0.001" placeholder="Quantity" aria-label="Quantity"
               style={{ maxWidth: '110px' }} value={row.quantity ?? ''}
               onChange={(e) => set({ quantity: e.target.value })} />
        <select className="form-control" style={{ maxWidth: '130px' }} aria-label="Unit" value={row.unit || 'METER'}
                onChange={(e) => set({ unit: e.target.value })}>
          {UNITS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
        <input className="form-control" type="number" min="0" step="1" placeholder="Estimated cost ₹" aria-label="Estimated purchase cost"
               style={{ maxWidth: '160px' }} value={row.estimated_cost ?? ''}
               onChange={(e) => set({ estimated_cost: e.target.value })} />
        <input className="form-control" type="date" title="Purchase needed by" aria-label="Purchase needed by"
               style={{ maxWidth: '170px' }} value={row.required_by || ''}
               onChange={(e) => set({ required_by: e.target.value })} />
      </div>
      <input className="form-control" type="text" placeholder="Notes, e.g. use on the pallu" aria-label="Notes"
             style={{ marginTop: '8px' }} value={row.notes || ''}
             onChange={(e) => set({ notes: e.target.value })} />
    </>
  );
}

/** Rows tied to a question above (a border chosen as "buy for this order")
 *  are edited there; this list holds the rest. */
export default function GarmentPurchases({ rows = [], onChange }) {
  const set = (i, patch) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const add = () => onChange([...rows, { name: '', quantity: '', unit: 'METER', estimated_cost: '', required_by: '', notes: '' }]);
  const remove = (i) => onChange(rows.filter((_, j) => j !== i));

  return (
    <div>
      {rows.map((row, i) => {
        if (row.field_key) return null;
        const err = purchaseError(row);
        return (
          <div key={i} style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '12px', marginBottom: '8px', background: 'var(--surface-2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <ShoppingCart size={14} style={{ color: 'var(--accent-text)', flexShrink: 0 }} />
              <input className="form-control" type="text" placeholder="What do you need? e.g. Pink zari maggam work"
                     aria-label="What needs to be bought" value={row.name || ''}
                     onChange={(e) => set(i, { name: e.target.value })} />
              <button type="button" className="btn-secondary at-btn-sm" onClick={() => remove(i)} title="Remove" aria-label="Remove">
                <X size={14} />
              </button>
            </div>
            <PurchaseDetails row={row} onChange={(next) => set(i, next)} />
            {err && <div style={{ fontSize: '12px', color: 'var(--danger-color)', marginTop: '4px' }}>{err}</div>}
          </div>
        );
      })}
      <button type="button" className="btn-secondary at-btn-sm" onClick={add}>
        <Plus size={14} /> Not in stock? Buy for this order
      </button>
      {rows.some((r) => !r.field_key) && (
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '6px' }}>
          Bought specially for this order. Nothing is taken from boutique stock.
        </div>
      )}
    </div>
  );
}
