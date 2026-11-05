import { useState } from 'react';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { api } from '../../../api';
import { Field, SelectField } from '../inventoryForm';
import { ScanBox, ShelfSelect } from './shelfParts';

/** Move: moving stock from one shelf to another. */

export default function MoveStock({ location, leaves, onDone }) {
  const [from, setFrom] = useState(null);
  const [itemId, setItemId] = useState('');
  const [qty, setQty] = useState('');
  const [toId, setToId] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const openFrom = async (spotOrId) => {
    setMessage(null); setItemId(''); setQty(''); setToId('');
    try {
      const spot = typeof spotOrId === 'string' ? await api.getShelfSpot(spotOrId) : spotOrId;
      setFrom(spot);
    } catch (err) { setMessage({ error: err.message }); }
  };
  const line = (from?.contents || []).find((c) => c.item.id === itemId);

  const move = async () => {
    setBusy(true); setMessage(null);
    try {
      const res = await api.moveOnShelves({ location: location.id, item: itemId, quantity: qty, from_spot: from.id, to_spot: toId || null });
      await openFrom(from.id);
      await onDone();
      setMessage({ ok: `Moved ${res.moved_text || res.moved} from ${res.from} ${res.to ? `to ${res.to}` : 'back to Not shelved'}.${res.warning ? ` ${res.warning}` : ''}` });
    } catch (err) { setMessage({ error: err.message }); }
    finally { setBusy(false); }
  };
  const moveAll = async () => {
    if (!toId) { setMessage({ error: 'Choose the shelf everything goes to.' }); return; }
    const target = leaves.find((l) => l.id === toId);
    if (!window.confirm(`Move everything on ${from.address} to ${target?.address}?`)) return;
    setBusy(true); setMessage(null);
    try {
      const res = await api.moveWholeShelf({ from_spot: from.id, to_spot: toId });
      await openFrom(from.id);
      await onDone();
      setMessage({ ok: `Moved ${res.items} item(s) from ${res.from} to ${res.to}.` });
    } catch (err) { setMessage({ error: err.message }); }
    finally { setBusy(false); }
  };

  return (
    <div className="sh-panel">
      <h3 className="sh-title">Move between shelves</h3>
      <p className="sh-muted">First the shelf the stock is on.</p>
      <ScanBox location={location} onSpot={(s) => openFrom(s)} />
      <ShelfSelect label="Or choose it" leaves={leaves.filter((l) => l.item_count > 0)} value={from?.id || ''} onChange={(id) => id && openFrom(id)} />
      {message?.ok && <div className="sh-ok" role="status"><CheckCircle2 size={15} /> {message.ok}</div>}
      {message?.error && <div className="sh-error" role="alert">{message.error}</div>}
      {from && (
        <div className="sh-card">
          <div className="sh-card-head"><b className="sh-address">{from.address}</b><span className="sh-muted">{from.contents?.length || 0} item(s)</span></div>
          {!(from.contents || []).length ? <div className="sh-muted">This shelf is empty.</div> : (
            <div className="sh-form">
              <SelectField label="What to move" value={itemId}
                           onChange={(id) => { setItemId(id); setQty((from.contents.find((c) => c.item.id === id) || {}).quantity || ''); }}
                           options={[{ value: '', label: 'Choose an item…' }, ...from.contents.map((c) => ({ value: c.item.id, label: `${c.item.name} · ${c.quantity_text}` }))]} />
              {line && <Field label={`How much (up to ${line.quantity_text})`} type="number" decimals={3} value={qty} onChange={setQty} />}
              <ShelfSelect label="To" leaves={leaves} value={toId} onChange={setToId} exclude={from.id} allowNone />
              <div className="sh-actions">
                <button type="button" className="btn-secondary" disabled={busy} onClick={moveAll}>Move everything</button>
                <button type="button" className="btn-primary" disabled={busy || !itemId || !Number(qty)} onClick={move}>
                  <ArrowRight size={15} /> {busy ? 'Moving…' : 'Move'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
