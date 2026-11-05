import { useEffect, useState } from 'react';
import { api } from '../../api';
import { orderRef } from '../../utils/format';
import { LIMITS, cleanAmount, amountError } from '../../utils/validate';
import { Modal } from './inventoryForm';
import ShelfPlace from './shelves/ShelfPlace';
import { placePlan, putOnShelves, shelfFailedText } from './shelves/shelfPlacing';
import Loader from '../../components/ui/Loader';
import { errorBox, qty } from './inventoryShared';

/** Recording a stock movement on one item. */

const MOVEMENTS = [
  { key: 'stock-in', label: 'Stock In', help: 'Goods received into the boutique.' },
  { key: 'reserve', label: 'Reserve', help: 'Spoken for by an order, still on the shelf.' },
  { key: 'release', label: 'Release', help: 'Cancel a reservation.' },
  { key: 'issue', label: 'Issue to production', help: 'Hand to the workroom. Leaves the shelf.' },
  { key: 'consume', label: 'Consume', help: 'Actually used up on a garment.' },
  { key: 'waste', label: 'Waste', help: 'Offcuts and loss during production.' },
  { key: 'return', label: 'Return', help: 'Unused material back from the workroom.' },
  { key: 'damage', label: 'Damage', help: 'Written off as damaged.' },
  { key: 'scrap', label: 'Scrap', help: 'Written off as scrap.' },
  { key: 'adjust', label: 'Stock count', help: 'Correct the book figure to a counted one.', field: 'counted_quantity' },
];

const STOCK_OUT = new Set(['issue', 'consume', 'waste', 'damage', 'scrap', 'reserve', 'adjust']);

const ORDER_LINKED = new Set(['issue', 'consume', 'waste', 'reserve', 'release', 'return']);

export default function MovementModal({ item, onClose, onDone }) {
  const [movement, setMovement] = useState('stock-in');
  const [amount, setAmount] = useState('');
  const [remarks, setRemarks] = useState('');
  const [stageKey, setStageKey] = useState('');
  const [orderId, setOrderId] = useState('');
  const [fromLocation, setFromLocation] = useState('');
  const [orders, setOrders] = useState([]);
 
  const [ordersState, setOrdersState] = useState('idle');
  const [locations, setLocations] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  // Stock In only: the shelves it goes on (ShelfPlace), and "saved, but a
  // shelf refused it" -- then only Done is left, so it is not stocked twice.
  const [places, setPlaces] = useState([]);
  const [shelfDone, setShelfDone] = useState(false);

  const chosen = MOVEMENTS.find((m) => m.key === movement);
  const wantsOrder = ORDER_LINKED.has(movement);

  useEffect(() => {
    setLocations(null);
    api.getItemLocations(item.id)
      .then((data) => setLocations(data?.breakdown || []))
      .catch(() => setLocations([]));
  }, [item.id]);


  useEffect(() => {
    if (!wantsOrder || ordersState !== 'idle') return;
    setOrdersState('loading');
    api.getOrders()
      .then((rows) => { setOrders(rows || []); setOrdersState('ready'); })
      .catch(() => setOrdersState('ready'));
  }, [wantsOrder, ordersState]);

  const submit = async (e) => {
    e.preventDefault();
    
    const shelving = movement === 'stock-in' ? placePlan(places, amount) : { lines: [] };
    const problem = amountError(amount, { label: 'Quantity', max: LIMITS.quantity, required: true, allowZero: movement === 'adjust' })
      || shelving.error;
    if (problem) { setError(problem); return; }
    setError(null);
    setSaving(true);
    try {
      const payload = { remarks };
      payload[chosen.field || 'quantity'] = amount;
      if (movement === 'issue' && stageKey) payload.stage_key = stageKey;
    
      if (orderId && ORDER_LINKED.has(movement)) payload.order_id = orderId;
      if (fromLocation && STOCK_OUT.has(movement)) payload.from_location = fromLocation;
      await api.moveStock(item.id, movement, payload);
      const failed = await putOnShelves(item.id, shelving.lines);
      if (failed.length) {
        setShelfDone(true);
        setError(shelfFailedText(item.name, failed));
        return;
      }
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={`Stock movement · ${item.name}`} onClose={onClose}>
      <div style={{ display: 'flex', gap: '18px', marginBottom: '16px', fontSize: '13px', flexWrap: 'wrap' }}>
        <span>In stock <strong>{qty(item.current_stock)}</strong></span>
        <span style={{ color: 'var(--text-muted)' }}>Reserved <strong>{qty(item.reserved_stock)}</strong></span>
        <span>Available <strong>{qty(item.available_stock)} {item.unit_display}</strong></span>
      </div>

      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '12px', fontWeight: 600 }}>Movement</label>
          <select className="form-control" value={movement} onChange={(e) => { setMovement(e.target.value); setError(null); }}>
            {MOVEMENTS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{chosen.help}</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '12px', fontWeight: 600 }}>
            {movement === 'adjust' ? `Counted total (${item.unit_display})` : `Quantity (${item.unit_display})`}
          </label>
          <input
            inputMode="decimal" required autoFocus
            className="form-control" value={amount}
            onChange={(e) => setAmount(cleanAmount(e.target.value, { max: LIMITS.quantity, decimals: 3 }))}
          />
        </div>

        {wantsOrder && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600 }}>Against order (optional)</label>
            <select className="form-control" value={orderId} onChange={(e) => setOrderId(e.target.value)}>
              <option value="">Not tied to an order</option>
              {orders.map((o) => (
                <option key={o.id} value={o.id}>{orderRef(o)} · {o.customer_name}</option>
              ))}
            </select>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              {ordersState === 'ready'
                ? 'Needed for the cost-per-order and consumption reports.'
                : <Loader inline label="Loading orders…" />}
            </span>
          </div>
        )}

        {STOCK_OUT.has(movement) && (locations || []).length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600 }}>From location</label>
            <select className="form-control" value={fromLocation} onChange={(e) => setFromLocation(e.target.value)}>
              <option value="">Default location</option>
              {locations.map((row) => (
                <option key={row.location_id} value={row.location_id}>
                  {row.location} · {qty(row.quantity)} {item.unit_display}
                </option>
              ))}
            </select>
          </div>
        )}

        {movement === 'issue' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600 }}>Production stage (optional)</label>
            <input
              type="text" className="form-control" placeholder="e.g. pattern_cutting" maxLength={100}
              value={stageKey} onChange={(e) => setStageKey(e.target.value)}
            />
          </div>
        )}

        {movement === 'stock-in' && (
          <ShelfPlace places={places} onChange={setPlaces} total={amount} unitLabel={item.unit_display} />
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '12px', fontWeight: 600 }}>Remarks</label>
          <input type="text" className="form-control" maxLength={LIMITS.note} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
        </div>

        {error && (
          <div style={errorBox}>
            {error}
          </div>
        )}

        {shelfDone ? (
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <button type="button" className="btn-primary" onClick={onDone}>Done</button>
          </div>
        ) : (
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Recording…' : 'Record movement'}</button>
        </div>
        )}
      </form>
    </Modal>
  );
}
