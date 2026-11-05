import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { api } from '../../../api';
import { Field, Modal } from '../inventoryForm';
import Loader from '../../../components/ui/Loader';
import { ScanBox, ShelfSelect } from './shelfParts';

/** Put away: stock that is on no shelf yet, and choosing its shelf. */

export default function PutAway({ location, leaves, onDone }) {
  const [waiting, setWaiting] = useState(null);
  const [picked, setPicked] = useState(null);
  const [qty, setQty] = useState('');
  const [spotId, setSpotId] = useState('');
  const [suggested, setSuggested] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const load = useCallback(() => api.getNotShelved(location.id)
    .then((rows) => setWaiting(rows || []))
    .catch((err) => { setMessage({ error: err.message }); setWaiting([]); }), [location.id]);
  useEffect(() => { load(); }, [load]);

  const pick = (row) => {
    setPicked(row); setQty(row.quantity); setSpotId(''); setMessage(null); setSuggested([]);
    api.getItemShelves(row.item.id, location.id)
      .then((d) => setSuggested((d?.locations?.[0]?.shelves || []).map((s) => s.spot.id)))
      .catch(() => {});
  };
  const save = async () => {
    if (!picked || !spotId) return;
    setBusy(true); setMessage(null);
    try {
      const res = await api.putAwayOnShelf({ location: location.id, item: picked.item.id, spot: spotId, quantity: qty });
      setMessage({ ok: `Put away ${res.moved_text || res.moved} onto ${res.spot}.${res.warning ? ` ${res.warning}` : ''}` });
      setPicked(null);
      await Promise.all([load(), onDone()]);
    } catch (err) {
      setMessage({ error: err.message });
    } finally {
      setBusy(false);
    }
  };

  if (waiting === null) return <Loader label="Loading…" />;
  return (
    <div className="sh-panel">
      <h3 className="sh-title">Waiting to be put away <span className="sh-count">{waiting.length}</span></h3>
      <p className="sh-muted">Stock at {location.name} that is on no shelf yet. Tap one, then choose its shelf.</p>
      {message?.ok && <div className="sh-ok" role="status"><CheckCircle2 size={15} /> {message.ok}</div>}
      {message?.error && <div className="sh-error" role="alert">{message.error}</div>}
      {waiting.length === 0 && <div className="sh-empty">Everything here is on a shelf.</div>}
      <div className="sh-list">
        {waiting.map((row) => (
          <button key={row.item.id} type="button" className={`sh-row${picked?.item.id === row.item.id ? ' is-on' : ''}`} onClick={() => pick(row)}>
            <span className="sh-row-main"><b>{row.item.name}</b><span className="sh-muted">{row.item.item_code}</span></span>
            <span className="sh-row-qty">{row.quantity_text}</span>
          </button>
        ))}
      </div>
      {picked && (
        <Modal title={`Put away ${picked.item.name}`} onClose={() => setPicked(null)}>
          <div className="sh-form">
            <Field label={`How much (up to ${picked.quantity_text})`} type="number" decimals={3} value={qty} onChange={setQty} />
            <ScanBox location={location} onSpot={(s) => setSpotId(s.id)} placeholder="Scan the shelf label" />
            <ShelfSelect leaves={leaves} value={spotId} onChange={setSpotId} suggested={suggested} />
            {message?.error && <div className="sh-error" role="alert">{message.error}</div>}
            <div className="sh-actions">
              <button type="button" className="btn-secondary" onClick={() => setPicked(null)}>Cancel</button>
              <button type="button" className="btn-primary" disabled={busy || !spotId || !Number(qty)} onClick={save}>
                {busy ? 'Saving…' : 'Put away'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
