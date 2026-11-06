import { SearchBar } from '../../../components/ui/SearchBar';
import { useMemo, useState } from 'react';
import { CheckCircle2, Minus, Plus } from 'lucide-react';
import { api } from '../../../api';
import { cleanAmount } from '../../../utils/validate';
import { ScanBox } from './shelfParts';

/** Count a shelf: recording what is really on it. */

const ago = (iso) => {
  if (!iso) return 'Never counted';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return days <= 0 ? 'Counted today' : days === 1 ? 'Counted yesterday' : `Counted ${days} days ago`;
};

export default function CountShelf({ location, leaves, onDone }) {
  const [spot, setSpot] = useState(null);
  const [lines, setLines] = useState([]);
  const [complete, setComplete] = useState(false);
  const [adding, setAdding] = useState('');
  const [found, setFound] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const queue = useMemo(() => [...leaves].filter((l) => l.active)
    .sort((a, b) => String(a.last_counted_at || '').localeCompare(String(b.last_counted_at || ''))), [leaves]);

  const open = async (spotOrId) => {
    setMessage(null); setComplete(false); setFound([]); setAdding('');
    try {
      const s = typeof spotOrId === 'string' ? await api.getShelfSpot(spotOrId) : spotOrId;
      setSpot(s);
      setLines((s.contents || []).map((c) => ({ item: c.item, recorded: c.quantity, counted: c.quantity })));
    } catch (err) { setMessage({ error: err.message }); }
  };
  const setCounted = (id, value) => setLines((ls) => ls.map((l) => (l.item.id === id ? { ...l, counted: value } : l)));
  const bump = (id, by) => setLines((ls) => ls.map((l) => (l.item.id === id
    ? { ...l, counted: String(Math.max(0, Math.round((Number(l.counted || 0) + by) * 1000) / 1000)) } : l)));
  const search = async (e) => {
    e?.preventDefault();
    if (!adding.trim()) return;
    try { setFound(await api.findOnShelves(adding.trim(), location.id)); } catch { setFound([]); }
  };
  const add = (item) => {
    if (!lines.some((l) => l.item.id === item.id)) setLines((ls) => [...ls, { item, recorded: '0', counted: '' }]);
    setFound([]); setAdding('');
  };
  const save = async () => {
    if (complete && !window.confirm('You ticked "I counted the whole shelf": anything not listed will be treated as missing from it. Save the count?')) return;
    setBusy(true); setMessage(null);
    try {
      const res = await api.countShelf(spot.id, {
        complete,
        counts: lines.filter((l) => l.counted !== '').map((l) => ({ item: l.item.id, quantity: l.counted })),
      });
      const changed = (res.lines || []).filter((l) => l.change !== '0').length;
      await open(spot.id);
      await onDone();
      setMessage({ ok: `${res.spot} counted.${changed ? ` ${changed} item(s) changed — see Problems for anything to check.` : ' Everything matched.'}` });
    } catch (err) { setMessage({ error: err.message }); }
    finally { setBusy(false); }
  };

  return (
    <div className="sh-panel">
      <h3 className="sh-title">Count or record a shelf</h3>
      <p className="sh-muted">Count what is really on a shelf. Recording a shelf for the first time works the same way: what you add comes from “Not shelved”.</p>
      <ScanBox location={location} onSpot={(s) => open(s)} />
      {!spot && (
        <div className="sh-list">
          {queue.slice(0, 30).map((l) => (
            <button key={l.id} type="button" className="sh-row" onClick={() => open(l.id)}>
              <span className="sh-row-main"><b className="sh-address">{l.address}</b><span className="sh-muted">{ago(l.last_counted_at)}</span></span>
              <span className="sh-row-qty">{l.item_count ? `${l.item_count} item(s)` : 'Empty'}</span>
            </button>
          ))}
        </div>
      )}
      {message?.ok && <div className="sh-ok" role="status"><CheckCircle2 size={15} /> {message.ok}</div>}
      {message?.error && <div className="sh-error" role="alert">{message.error}</div>}
      {spot && (
        <div className="sh-card">
          <div className="sh-card-head">
            <b className="sh-address">{spot.address}</b>
            <button type="button" className="at-link" onClick={() => { setSpot(null); setMessage(null); }}>Choose another shelf</button>
          </div>
          {lines.length === 0 && <div className="sh-muted">Nothing recorded here yet. Add what you find below.</div>}
          {lines.map((l) => (
            <div key={l.item.id} className="sh-count-line">
              <span className="sh-row-main"><b>{l.item.name}</b><span className="sh-muted">Recorded: {l.recorded}</span></span>
              <span className="sh-stepper">
                <button type="button" className="btn-secondary sh-icon-btn" onClick={() => bump(l.item.id, -1)} aria-label={`One less ${l.item.name}`}><Minus size={14} /></button>
                <input className="form-control" inputMode="decimal" value={l.counted} aria-label={`Counted ${l.item.name}`}
                       onChange={(e) => setCounted(l.item.id, cleanAmount(e.target.value, { decimals: 3 }))} />
                <button type="button" className="btn-secondary sh-icon-btn" onClick={() => bump(l.item.id, 1)} aria-label={`One more ${l.item.name}`}><Plus size={14} /></button>
              </span>
            </div>
          ))}
          <form className="sh-scan-row" onSubmit={search}>
            <SearchBar value={adding} onChange={setAdding} placeholder="Add an item found here — name or code" ariaLabel="Add an item" style={{ flex: '1 1 auto', maxWidth: 'none' }} />
            <button type="submit" className="btn-secondary" disabled={!adding.trim()}>Find</button>
          </form>
          {found.length > 0 && (
            <div className="sh-list">
              {found.map((r) => (
                <button key={r.item.id} type="button" className="sh-row" onClick={() => add(r.item)}>
                  <span className="sh-row-main"><b>{r.item.name}</b><span className="sh-muted">{r.item.item_code}</span></span>
                  <Plus size={15} />
                </button>
              ))}
            </div>
          )}
          <label className="sh-check">
            <input type="checkbox" checked={complete} onChange={(e) => setComplete(e.target.checked)} />
            I counted the whole shelf (anything not listed is missing)
          </label>
          <div className="sh-actions">
            <button type="button" className="btn-primary" disabled={busy || (lines.length === 0 && !complete)} onClick={save}>
              {busy ? 'Saving…' : 'Save the count'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
