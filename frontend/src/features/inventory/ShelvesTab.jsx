/* Inventory > Racks & shelves: where inside a location the stock sits
   (apps/inventory/shelves.py). Area -> rack / cupboard -> shelf -> box, each
   with an address (FLOOR-C2-1) and a QR label. The location keeps the one
   official quantity; shelves only say where some of it is, and the rest is
   "Not shelved". Every screen is phone-first and scan-first: a shelf label's
   QR (camera or a USB / Bluetooth scanner typing into the box) or a typed
   address ("c2 1"). Who sees which view follows the inventory work the owner
   handed the role (move: stock or transfer; set up: items). */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Camera, CheckCircle2, ClipboardCheck, Eye, Layers,
  MapPin, Minus, Move, PackagePlus, Pencil, Plus, Printer, Search, Trash2, X,
} from 'lucide-react';
import QRCode from 'qrcode';
import { api } from '../../services/api';
import { cleanAmount } from '../../services/validate';
import { inventoryImage } from '../../services/inventoryImages';
import { Field, Modal, SelectField } from './ItemFormModal';
import Loader from '../../components/ui/Loader';
import './shelves.css';

const VIEW_KEY = 'inventory-shelves-view';
const LOCATION_KEY = 'inventory-shelves-location';
const KINDS = [
  ['AREA', 'Area'], ['RACK', 'Rack'], ['CUPBOARD', 'Cupboard'], ['SHELF', 'Shelf'], ['BOX', 'Box'],
  ['RAIL', 'Rail'], ['STACK', 'Stack'], ['COUNTER', 'Counter'], ['DRAWER', 'Drawer'],
  ['DISPLAY', 'Display'], ['TRUNK', 'Trunk'], ['OTHER', 'Other'],
];
const HOLDERS = KINDS.filter(([k]) => ['RACK', 'CUPBOARD', 'RAIL', 'STACK', 'COUNTER', 'TRUNK', 'DISPLAY'].includes(k));

const remember = (key, value) => { try { localStorage.setItem(key, value); } catch { /* private mode */ } };
const recall = (key) => { try { return localStorage.getItem(key) || ''; } catch { return ''; } };

const ago = (iso) => {
  if (!iso) return 'Never counted';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return days <= 0 ? 'Counted today' : days === 1 ? 'Counted yesterday' : `Counted ${days} days ago`;
};

/** A shelf label scanned (camera, scanner) or an address typed: resolves to the spot. */
function ScanBox({ location, onSpot, placeholder = 'Scan a shelf label, or type its address (c2 1)', autoFocus = false }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [camera, setCamera] = useState(false);
  const canCamera = typeof window !== 'undefined' && 'BarcodeDetector' in window && !!navigator.mediaDevices?.getUserMedia;

  const resolve = async (code) => {
    const text = String(code || '').trim();
    if (!text) return;
    setBusy(true); setError('');
    try {
      const spot = await api.scanShelf(text, location?.id);
      setValue('');
      onSpot(spot);
    } catch (err) {
      setError(err.message || 'No shelf matches that.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sh-scan">
      <form className="sh-scan-row" onSubmit={(e) => { e.preventDefault(); resolve(value); }}>
        <label className="sh-search">
          <MapPin size={15} aria-hidden="true" />
          <input className="form-control" value={value} onChange={(e) => setValue(e.target.value)}
                 placeholder={placeholder} aria-label="Shelf label or address" autoFocus={autoFocus} />
        </label>
        <button type="submit" className="btn-secondary" disabled={busy || !value.trim()}>{busy ? 'Finding…' : 'Go'}</button>
        {canCamera && (
          <button type="button" className="btn-secondary sh-icon-btn" onClick={() => setCamera(true)} aria-label="Scan with the camera" title="Scan with the camera">
            <Camera size={16} />
          </button>
        )}
      </form>
      {error && <div className="sh-error" role="alert">{error}</div>}
      {camera && <CameraScan onCode={(code) => { setCamera(false); resolve(code); }} onClose={() => setCamera(false)} />}
    </div>
  );
}

/** The phone's camera reading a shelf QR (the browser's own BarcodeDetector). */
export function CameraScan({ onCode, onClose }) {
  const videoRef = useRef(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let stream; let timer; let stopped = false;
    const detector = new window.BarcodeDetector({ formats: ['qr_code', 'code_128', 'ean_13'] });
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      .then((s) => {
        stream = s;
        if (stopped || !videoRef.current) return;
        videoRef.current.srcObject = s;
        videoRef.current.play().catch(() => {});
        timer = setInterval(async () => {
          try {
            const found = await detector.detect(videoRef.current);
            if (found?.[0]?.rawValue) { clearInterval(timer); onCode(found[0].rawValue); }
          } catch { /* the next frame */ }
        }, 300);
      })
      .catch(() => setError('The camera could not be opened. Allow it in the browser, or type the address.'));
    return () => { stopped = true; clearInterval(timer); stream?.getTracks().forEach((t) => t.stop()); };
  }, [onCode]);
  return (
    <Modal title="Scan a shelf label" onClose={onClose} width="440px">
      {error ? <div className="sh-error">{error}</div> : <video ref={videoRef} className="sh-camera" muted playsInline />}
      <p className="sh-muted">Point the camera at the QR code on the shelf.</p>
    </Modal>
  );
}

/** One shelf's contents as compact chips. */
function Contents({ rows }) {
  if (!rows?.length) return <div className="sh-muted">Empty</div>;
  return (
    <div className="sh-chips">
      {rows.map((r) => <span key={r.item.id} className="sh-chip"><b>{r.item.name}</b> · {r.quantity_text}</span>)}
    </div>
  );
}

/** Choose a shelf (a leaf) from the tree: suggested ones first. */
function ShelfSelect({ label = 'Shelf', leaves, value, onChange, suggested = [], exclude, allowNone }) {
  const order = useMemo(() => {
    const first = leaves.filter((l) => suggested.includes(l.id));
    const rest = leaves.filter((l) => !suggested.includes(l.id));
    return [...first, ...rest].filter((l) => l.id !== exclude && l.active);
  }, [leaves, suggested, exclude]);
  return (
    <SelectField label={label} value={value} onChange={onChange}
                 options={[
                   { value: '', label: allowNone ? 'Back to Not shelved' : 'Choose a shelf…' },
                   ...order.map((l) => ({
                     value: l.id,
                     label: `${l.address}${l.name ? ` — ${l.name}` : ''}${suggested.includes(l.id) ? ' (already has it)' : l.item_count ? '' : ' (empty)'}`,
                   })),
                 ]} />
  );
}

export default function ShelvesTab({ canMove = false, canManage = false, onBack }) {
  const [locations, setLocations] = useState(null);
  const [locationId, setLocationId] = useState(recall(LOCATION_KEY));
  const [tree, setTree] = useState(null);
  const [error, setError] = useState('');
  const [openIssues, setOpenIssues] = useState(0);
  const views = useMemo(() => [
    { key: 'where', label: 'Where is it?', icon: Search },
    canMove && { key: 'putaway', label: 'Put away', icon: PackagePlus },
    canMove && { key: 'move', label: 'Move', icon: Move },
    canMove && { key: 'count', label: 'Count a shelf', icon: ClipboardCheck },
    { key: 'problems', label: 'Problems', icon: AlertTriangle },
    canManage && { key: 'setup', label: 'Set up racks', icon: Layers },
  ].filter(Boolean), [canMove, canManage]);
  const [viewPick, setViewPick] = useState(recall(VIEW_KEY));
  const view = views.some((v) => v.key === viewPick) ? viewPick : 'where';
  const setView = (key) => { setViewPick(key); remember(VIEW_KEY, key); };

  useEffect(() => {
    api.getStockLocations({ active: 'true' })
      .then((rows) => setLocations(rows || []))
      .catch((err) => { setError(err.message || 'Could not load the locations.'); setLocations([]); });
  }, []);
  const location = (locations || []).find((l) => String(l.id) === String(locationId))
    || (locations || []).find((l) => l.is_default) || (locations || [])[0] || null;

  const reload = useCallback(() => {
    if (!location) return Promise.resolve();
    return Promise.all([
      api.getShelfTree(location.id).then(setTree),
      api.getShelfIssues({ status: 'OPEN', location: location.id }).then((d) => setOpenIssues(d?.open_count || 0)),
    ]).catch((err) => setError(err.message || 'Could not load the shelves.'));
  }, [location]);
  useEffect(() => { reload(); }, [reload]);

  if (locations === null) return <Loader page label="Loading shelves…" />;
  if (!location) {
    return <div className="sh-empty">Add a location (a store or a godown) first, on the Locations tab.</div>;
  }
  const leaves = (tree || []).filter((s) => s.is_leaf);

  return (
    <div className="sh">
      <div className="sh-top">
        <div className="sh-top-left">
          {onBack && (
            <button type="button" className="btn-secondary sh-back" onClick={onBack} aria-label="Back to Inventory" title="Back to Inventory">
              <ArrowLeft size={15} /> <span>Back</span>
            </button>
          )}
          <label className="sh-location">
            <span className="sh-location-label">Location</span>
            <MapPin size={15} aria-hidden="true" className="sh-location-icon" />
            <select className="form-control" value={location.id} aria-label="Location"
                    onChange={(e) => { setLocationId(e.target.value); remember(LOCATION_KEY, e.target.value); setTree(null); }}>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </label>
        </div>
        <div className="sh-views" role="tablist" aria-label="Racks & shelves">
          {views.map(({ key, label, icon: Icon }) => (
            <button key={key} type="button" role="tab" aria-selected={view === key}
                    className={`sh-view${view === key ? ' is-on' : ''}`} onClick={() => setView(key)}>
              <Icon size={15} /> {label}
              {key === 'problems' && openIssues > 0 && <span className="sh-badge">{openIssues}</span>}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="sh-error" role="alert">{error}</div>}
      {tree === null ? <Loader label="Loading shelves…" /> : (
        <>
          {tree.length === 0 && view !== 'setup' && (
            <div className="sh-empty">
              No racks or shelves at {location.name} yet.
              {canManage
                ? <> <button type="button" className="at-link" onClick={() => setView('setup')}>Set up racks</button> to start.</>
                : ' The owner can set them up.'}
            </div>
          )}
          {view === 'where' && <WhereIsIt location={location} />}
          {view === 'putaway' && tree.length > 0 && <PutAway location={location} leaves={leaves} onDone={reload} />}
          {view === 'move' && tree.length > 0 && <MoveStock location={location} leaves={leaves} onDone={reload} />}
          {view === 'count' && tree.length > 0 && <CountShelf location={location} leaves={leaves} onDone={reload} />}
          {view === 'problems' && <Problems location={location} canManage={canManage} onChange={reload} />}
          {view === 'setup' && <RackSetup location={location} tree={tree} onDone={reload} />}
        </>
      )}
    </div>
  );
}

/* ---- Where is it? ------------------------------------------------------- */
function WhereIsIt({ location }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [spot, setSpot] = useState(null);

  const search = async (e) => {
    e?.preventDefault();
    if (!q.trim()) return;
    setBusy(true); setError(''); setSpot(null);
    try { setResults(await api.findOnShelves(q.trim(), location.id)); }
    catch (err) { setError(err.message || 'Search failed.'); }
    finally { setBusy(false); }
  };

  return (
    <div className="sh-panel">
      <form className="sh-scan-row" onSubmit={search}>
        <label className="sh-search">
          <Search size={15} aria-hidden="true" />
          <input className="form-control" value={q} onChange={(e) => setQ(e.target.value)}
                 placeholder="Type a name, code or colour — e.g. red silk" aria-label="Search an item" />
        </label>
        <button type="submit" className="btn-primary" disabled={busy || !q.trim()}>{busy ? 'Looking…' : 'Find'}</button>
      </form>
      <div className="sh-or">or see what is on a shelf</div>
      <ScanBox location={location} onSpot={(s) => { setSpot(s); setResults(null); }} />
      {error && <div className="sh-error" role="alert">{error}</div>}

      {spot && (
        <div className="sh-card">
          <div className="sh-card-head"><b className="sh-address">{spot.address}</b>{spot.name && <span className="sh-muted"> · {spot.name}</span>}</div>
          <Contents rows={spot.contents} />
        </div>
      )}
      {results && results.length === 0 && <div className="sh-empty">Nothing matches “{q}”.</div>}
      {results && results.map((r) => (
        <div key={r.item.id} className="sh-card">
          <div className="sh-card-head"><b>{r.item.name}</b><span className="sh-muted">{r.item.item_code}{r.item.color ? ` · ${r.item.color}` : ''}</span></div>
          {r.locations.length === 0 && <div className="sh-muted">Not in stock anywhere.</div>}
          {r.locations.map((l) => (
            <div key={l.location.id} className="sh-where">
              <div className="sh-where-loc">{l.location.name} · <b>{l.total_text}</b> in all</div>
              <div className="sh-chips">
                {l.shelves.map((s) => (
                  <span key={s.spot.id} className="sh-chip sh-chip--shelf"><b className="sh-address">{s.spot.address}</b> · {s.quantity_text}</span>
                ))}
                {Number(l.not_shelved) > 0 && <span className="sh-chip sh-chip--loose">Not shelved · {l.not_shelved_text}</span>}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/* ---- Put away ---------------------------------------------------------- */
function PutAway({ location, leaves, onDone }) {
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

/* ---- Move -------------------------------------------------------------- */
function MoveStock({ location, leaves, onDone }) {
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

/* ---- Count / record a shelf -------------------------------------------- */
function CountShelf({ location, leaves, onDone }) {
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
            <label className="sh-search">
              <Search size={15} aria-hidden="true" />
              <input className="form-control" value={adding} onChange={(e) => setAdding(e.target.value)} placeholder="Add an item found here — name or code" aria-label="Add an item" />
            </label>
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

/* ---- Problems ---------------------------------------------------------- */
function Problems({ location, canManage, onChange }) {
  const [status, setStatus] = useState('OPEN');
  const [rows, setRows] = useState(null);
  const [fixing, setFixing] = useState(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(() => api.getShelfIssues({ status, location: location.id })
    .then((d) => setRows(d?.results || []))
    .catch((err) => { setError(err.message); setRows([]); }), [status, location.id]);
  useEffect(() => { load(); }, [load]);

  const fix = async () => {
    try {
      await api.resolveShelfIssue(fixing.id, note);
      setFixing(null); setNote('');
      await Promise.all([load(), onChange()]);
    } catch (err) { setError(err.message); }
  };

  return (
    <div className="sh-panel">
      <div className="sh-title-row">
        <h3 className="sh-title">Problems</h3>
        <div className="at-seg" role="group" aria-label="Show">
          <button type="button" aria-pressed={status === 'OPEN'} onClick={() => { setRows(null); setStatus('OPEN'); }}>To check</button>
          <button type="button" aria-pressed={status === 'RESOLVED'} onClick={() => { setRows(null); setStatus('RESOLVED'); }}>Fixed</button>
        </div>
      </div>
      <p className="sh-muted">When the app had to guess which shelf stock came from, or a count did not match, it says so here. Fix it on the shelf (count it, move it), then mark it fixed.</p>
      {error && <div className="sh-error" role="alert">{error}</div>}
      {rows === null ? <Loader label="Loading…" /> : rows.length === 0 ? (
        <div className="sh-empty">{status === 'OPEN' ? 'Nothing to check. 🎉' : 'Nothing fixed yet.'}</div>
      ) : rows.map((r) => (
        <div key={r.id} className="sh-card sh-issue">
          <div className="sh-card-head">
            <span className={`ui-badge ui-badge--${r.status === 'OPEN' ? 'warning' : 'success'}`}>{r.kind_label}</span>
            <span className="sh-muted">{new Date(r.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
          </div>
          <p className="sh-issue-text">{r.message}</p>
          {r.status === 'RESOLVED' && (
            <div className="sh-muted">Fixed by {r.resolved_by || '—'}{r.resolution_note ? `: ${r.resolution_note}` : ''}</div>
          )}
          {r.status === 'OPEN' && canManage && (
            <div className="sh-actions"><button type="button" className="btn-secondary" onClick={() => { setFixing(r); setNote(''); }}>Mark fixed</button></div>
          )}
        </div>
      ))}
      {fixing && (
        <Modal title="Mark fixed" onClose={() => setFixing(null)}>
          <div className="sh-form">
            <p className="sh-issue-text">{fixing.message}</p>
            <label className="sh-field-label" htmlFor="sh-fix-note">What you found or did (optional)</label>
            <textarea id="sh-fix-note" className="form-control" rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
            <p className="sh-muted">Marking it fixed does not change any stock — a count or a move does.</p>
            <div className="sh-actions">
              <button type="button" className="btn-secondary" onClick={() => setFixing(null)}>Cancel</button>
              <button type="button" className="btn-primary" onClick={fix}>Mark fixed</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ---- Set up racks ------------------------------------------------------ */
async function printLabels(location, spots) {
  const win = window.open('', '_blank');
  if (!win) { window.alert('Allow pop-ups to print the labels.'); return; }
  win.document.write('<p style="font-family:sans-serif">Preparing labels…</p>');
  try {
    const rows = await api.getShelfLabels(location.id, spots?.map((s) => s.id).join(','));
    const leaves = rows.filter((r) => !spots || spots.some((s) => s.id === r.id));
    const cards = await Promise.all(leaves.map(async (r) => {
      const qr = await QRCode.toDataURL(r.qr, { margin: 1, width: 240 });
      const esc = (t) => String(t || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
      return `<div class="l"><img src="${qr}" alt=""/><div><div class="a">${esc(r.address)}</div><div class="n">${esc(r.name || r.kind_label)}</div><div class="s">${esc(r.location_name)}</div></div></div>`;
    }));
    win.document.open();
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Shelf labels — ${location.name}</title>
<style>body{font-family:Arial,sans-serif;margin:12mm}.g{display:grid;grid-template-columns:repeat(2,1fr);gap:6mm}
.l{display:flex;align-items:center;gap:4mm;border:1px dashed #999;border-radius:3mm;padding:4mm;break-inside:avoid}
.l img{width:30mm;height:30mm}.a{font-size:20pt;font-weight:700;letter-spacing:.5pt}.n{font-size:10pt;margin-top:1mm}.s{font-size:8pt;color:#666;margin-top:1mm}
@media print{body{margin:8mm}}</style></head><body><div class="g">${cards.join('')}</div>
<script>window.onload=function(){setTimeout(function(){window.print()},200)}</${'script'}></body></html>`);
    win.document.close();
  } catch (err) {
    win.document.body.innerText = err.message || 'Could not prepare the labels.';
  }
}

function RackSetup({ location, tree, onDone }) {
  const [describing, setDescribing] = useState(false);
  const [adding, setAdding] = useState(null); // { parent } or {} for a new area
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [error, setError] = useState('');
  const byId = useMemo(() => Object.fromEntries(tree.map((s) => [s.id, s])), [tree]);

  const reorder = async (spot, dir) => {
    const siblings = tree.filter((s) => s.parent === spot.parent);
    const index = siblings.findIndex((s) => s.id === spot.id);
    const other = siblings[index + dir];
    if (!other) return;
    setError('');
    try {
      await api.updateShelfSpot(spot.id, { walk_order: other.walk_order });
      await api.updateShelfSpot(other.id, { walk_order: spot.walk_order === other.walk_order ? spot.walk_order + dir : spot.walk_order });
      await onDone();
    } catch (err) { setError(err.message); }
  };
  const remove = async (spot) => {
    if (!window.confirm(`Delete ${spot.address}?`)) return;
    setError('');
    try { await api.deleteShelfSpot(spot.id); await onDone(); } catch (err) { setError(err.message); }
  };

  return (
    <div className="sh-panel">
      <div className="sh-title-row">
        <h3 className="sh-title">Racks & shelves at {location.name}</h3>
        <div className="sh-actions sh-actions--top">
          <button type="button" className="btn-secondary" onClick={() => setAdding({})}><Plus size={15} /> Add an area</button>
          {tree.length > 0 && (
            <button type="button" className="btn-secondary" onClick={() => printLabels(location, tree.filter((s) => s.is_leaf))}>
              <Printer size={15} /> Print shelf labels
            </button>
          )}
          <button type="button" className="btn-primary" onClick={() => setDescribing(true)}><Layers size={15} /> Describe your store</button>
        </div>
      </div>
      <p className="sh-muted">An area (shop floor, back room, godown) holds racks or cupboards; they hold shelves, and a shelf can hold boxes. Stock sits on the last level.</p>
      {error && <div className="sh-error" role="alert">{error}</div>}
      {tree.length === 0 && <div className="sh-empty">Nothing yet. <b>Describe your store</b> makes it in one go.</div>}
      <div className="sh-tree">
        {tree.map((s) => {
          const siblings = tree.filter((x) => x.parent === s.parent);
          const index = siblings.findIndex((x) => x.id === s.id);
          return (
            <div key={s.id} className={`sh-node${s.active ? '' : ' is-off'}`} style={{ '--depth': s.depth - 1 }}>
              <div className="sh-node-main">
                <b className="sh-address">{s.address}</b>
                <span className="sh-muted">{s.kind_label}{s.name ? ` · ${s.name}` : ''}</span>
                {s.depth === 1 && <span className={`ui-badge ui-badge--${s.is_shop_floor ? 'success' : 'neutral'}`}>{s.is_shop_floor ? 'Shop floor' : 'Back room'}</span>}
                {!s.active && <span className="ui-badge ui-badge--neutral">Not in use</span>}
                <span className="sh-node-count">{s.item_count ? `${s.item_count} item(s)` : 'empty'}</span>
              </div>
              <div className="sh-node-actions">
                <button type="button" className="sh-mini sh-mini--view" onClick={() => setViewing(s)} aria-label={`See what is in ${s.address}`} title="See what is here">
                  <Eye size={14} /> <span>View</span>
                </button>
                <button type="button" className="sh-mini" disabled={index <= 0} onClick={() => reorder(s, -1)} aria-label="Earlier in the walk" title="Earlier in the walk"><ArrowUp size={14} /></button>
                <button type="button" className="sh-mini" disabled={index >= siblings.length - 1} onClick={() => reorder(s, 1)} aria-label="Later in the walk" title="Later in the walk"><ArrowDown size={14} /></button>
                {s.depth < 4 && !(s.is_leaf && s.item_count) && (
                  <button type="button" className="sh-mini" onClick={() => setAdding({ parent: s })} aria-label={`Add inside ${s.address}`} title="Add inside"><Plus size={14} /></button>
                )}
                <button type="button" className="sh-mini" onClick={() => setEditing(s)} aria-label={`Edit ${s.address}`} title="Edit"><Pencil size={14} /></button>
                {s.is_leaf && !s.item_count && (
                  <button type="button" className="sh-mini sh-mini--danger" onClick={() => remove(s)} aria-label={`Delete ${s.address}`} title="Delete"><Trash2 size={14} /></button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {describing && <DescribeStore location={location} onClose={() => setDescribing(false)} onDone={async () => { setDescribing(false); await onDone(); }} />}
      {adding && <AddSpot location={location} parent={adding.parent} onClose={() => setAdding(null)} onDone={async () => { setAdding(null); await onDone(); }} />}
      {editing && <EditSpot spot={editing} parent={byId[editing.parent]} onClose={() => setEditing(null)} onDone={async () => { setEditing(null); await onDone(); }} />}
      {viewing && <SpotView spot={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

/** Everything sitting in a spot -- on it, or on any shelf or box inside it. */
function SpotView({ spot, onClose }) {
  const [inside, setInside] = useState(null);
  const [error, setError] = useState('');
  // A material tapped: its picture large, with where it sits and how much.
  const [looking, setLooking] = useState(null);
  useEffect(() => {
    let current = true;
    api.getShelfSpot(spot.id)
      .then((d) => { if (current) setInside(d?.inside || []); })
      .catch((err) => { if (current) { setError(err.message || 'Could not load what is here.'); setInside([]); } });
    return () => { current = false; };
  }, [spot.id]);
  const items = (inside || []).reduce((n, group) => n + group.contents.length, 0);
  return (
    <Modal title={`What is in ${spot.address}`} onClose={onClose} width="560px">
      <div className="sh-form">
        <p className="sh-muted">
          {spot.kind_label}{spot.name ? ` · ${spot.name}` : ''}
          {inside && inside.length > 0 && ` · ${items} item${items === 1 ? '' : 's'} on ${inside.length} shel${inside.length === 1 ? 'f' : 'ves'}`}
        </p>
        {error && <div className="sh-error" role="alert">{error}</div>}
        {inside === null && <Loader label="Loading…" />}
        {inside && inside.length === 0 && !error && <div className="sh-empty">Nothing here yet.</div>}
        {looking && (
          <div className="sh-look">
            <img className="sh-look-img" src={inventoryImage(looking.row.item)} alt={looking.row.item.name} />
            <div className="sh-look-text">
              <b>{looking.row.item.name}</b>
              <span className="sh-muted">{looking.row.item.item_code}{looking.row.item.color ? ` · ${looking.row.item.color}` : ''}</span>
              <span><b>{looking.row.quantity_text}</b> on <b className="sh-address">{looking.spot.address}</b>{looking.spot.name ? ` · ${looking.spot.name}` : ''}</span>
            </div>
            <div className="sh-actions sh-actions--top">
              <button type="button" className="btn-secondary" onClick={() => setLooking(null)}><ArrowLeft size={15} /> Back to the list</button>
            </div>
          </div>
        )}
        {!looking && (inside || []).map((group) => (
          <div key={group.spot.id} className="sh-card">
            <div className="sh-card-head">
              <b className="sh-address">{group.spot.address}</b>
              {group.spot.name && <span className="sh-muted">{group.spot.name}</span>}
            </div>
            <div className="sh-list">
              {group.contents.map((row) => (
                <div key={row.item.id} className="sh-view-row">
                  <button type="button" className="sh-thumb" onClick={() => setLooking({ row, spot: group.spot })}
                          aria-label={`See ${row.item.name}`} title="See the material">
                    <img src={inventoryImage(row.item)} alt="" loading="lazy" />
                  </button>
                  <span className="sh-row-main sh-view-main">
                    <b>{row.item.name}</b>
                    <span className="sh-muted">{row.item.item_code}{row.item.color ? ` · ${row.item.color}` : ''}</span>
                  </span>
                  <span className="sh-row-qty">{row.quantity_text}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
        <div className="sh-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </Modal>
  );
}

function DescribeStore({ location, onClose, onDone }) {
  const [area, setArea] = useState('FLOOR');
  const [shopFloor, setShopFloor] = useState(true);
  const [holderKind, setHolderKind] = useState('CUPBOARD');
  const [holders, setHolders] = useState('2');
  const [prefix, setPrefix] = useState('C');
  const [shelves, setShelves] = useState('5');
  const [boxes, setBoxes] = useState('0');
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const levels = () => {
    const perHolder = shelves.split(/[ ,]+/).map((n) => n.trim()).filter(Boolean);
    const out = [
      { kind: 'AREA', codes: [area] },
      { kind: holderKind, prefix, count: Number(holders) || 0 },
      perHolder.length > 1 ? { kind: 'SHELF', counts: perHolder.map(Number) } : { kind: 'SHELF', count: Number(perHolder[0]) || 0 },
    ];
    if (Number(boxes) > 0) out.push({ kind: 'BOX', prefix: 'B', count: Number(boxes) });
    return out;
  };
  const payload = () => ({ location: location.id, is_shop_floor: shopFloor, levels: levels() });
  const check = async () => {
    setBusy(true); setError('');
    try { setPreview(await api.previewShelfSetup(payload())); } catch (err) { setError(err.message); setPreview(null); }
    finally { setBusy(false); }
  };
  const save = async () => {
    setBusy(true); setError('');
    try { await api.saveShelfSetup(payload()); await onDone(); } catch (err) { setError(err.message); setBusy(false); }
  };
  const dirty = () => setPreview(null);

  return (
    <Modal title="Describe your store" onClose={onClose} width="620px">
      <div className="sh-form">
        <div className="sh-grid">
          <Field label="Area code (e.g. FLOOR, BACK, GODOWN)" value={area} onChange={(v) => { setArea(v.toUpperCase()); dirty(); }} maxLength={12} />
          <SelectField label="Is this area the shop floor?" value={shopFloor ? 'yes' : 'no'} onChange={(v) => { setShopFloor(v === 'yes'); dirty(); }}
                       options={[{ value: 'yes', label: 'Yes — the shop floor' }, { value: 'no', label: 'No — back room / godown' }]} />
          <SelectField label="What holds the stock there?" value={holderKind} onChange={(v) => { setHolderKind(v); dirty(); }}
                       options={HOLDERS.map(([value, label]) => ({ value, label: `${label}s` }))} />
          <Field label="How many?" type="number" decimals={0} value={holders} onChange={(v) => { setHolders(v); dirty(); }} />
          <Field label="Their code starts with (C → C1, C2…)" value={prefix} onChange={(v) => { setPrefix(v.toUpperCase()); dirty(); }} maxLength={4} />
          <Field label="Shelves in each (or one per: 6, 4)" value={shelves} onChange={(v) => { setShelves(v.replace(/[^0-9, ]/g, '')); dirty(); }} />
          <Field label="Boxes on each shelf (0 for none)" type="number" decimals={0} value={boxes} onChange={(v) => { setBoxes(v); dirty(); }} />
        </div>
        {error && <div className="sh-error" role="alert">{error}</div>}
        {preview && (
          <div className="sh-preview">
            <div className="sh-preview-head">This is what will be made: <b>{preview.new}</b> new{preview.kept ? `, ${preview.kept} already there` : ''}.</div>
            <div className="sh-chips">
              {preview.spots.slice(0, 120).map((p) => (
                <span key={p.address + (p.skip || '')} className={`sh-chip${p.exists ? ' sh-chip--loose' : p.skip ? ' sh-chip--warn' : ' sh-chip--shelf'}`}>
                  {p.address}{p.exists ? ' (already there)' : p.skip ? ` (skipped: ${p.skip})` : ''}
                </span>
              ))}
              {preview.spots.length > 120 && <span className="sh-muted">…and {preview.spots.length - 120} more</span>}
            </div>
            <p className="sh-muted">Answering again later only adds what is missing; nothing is renamed or deleted.</p>
          </div>
        )}
        <div className="sh-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          {!preview
            ? <button type="button" className="btn-primary" disabled={busy || !area.trim()} onClick={check}>{busy ? 'Checking…' : 'Preview'}</button>
            : <button type="button" className="btn-primary" disabled={busy || preview.new === 0} onClick={save}>{busy ? 'Making…' : `Make ${preview.new}`}</button>}
        </div>
      </div>
    </Modal>
  );
}

function AddSpot({ location, parent, onClose, onDone }) {
  const [kind, setKind] = useState(parent ? (parent.depth === 1 ? 'RACK' : 'SHELF') : 'AREA');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [shopFloor, setShopFloor] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    setBusy(true); setError('');
    try {
      await api.createShelfSpot({ location: location.id, parent: parent?.id || null, kind, code, name, is_shop_floor: shopFloor });
      await onDone();
    } catch (err) { setError(err.message); setBusy(false); }
  };
  return (
    <Modal title={parent ? `Add inside ${parent.address}` : 'Add an area'} onClose={onClose}>
      <div className="sh-form">
        <SelectField label="What is it?" value={kind} onChange={setKind} options={KINDS.map(([value, label]) => ({ value, label }))} />
        <Field label={`Code${parent ? ` (the address becomes ${parent.address}-…)` : ' (e.g. FLOOR)'}`} value={code} onChange={(v) => setCode(v.toUpperCase())} maxLength={12} />
        <Field label="Name (optional, e.g. Silk sarees)" value={name} onChange={setName} maxLength={80} />
        {!parent && (
          <SelectField label="Shop floor?" value={shopFloor ? 'yes' : 'no'} onChange={(v) => setShopFloor(v === 'yes')}
                       options={[{ value: 'yes', label: 'Yes — the shop floor' }, { value: 'no', label: 'No — back room / godown' }]} />
        )}
        {error && <div className="sh-error" role="alert">{error}</div>}
        <div className="sh-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary" disabled={busy || !code.trim()} onClick={save}>{busy ? 'Adding…' : 'Add'}</button>
        </div>
      </div>
    </Modal>
  );
}

function EditSpot({ spot, parent, onClose, onDone }) {
  const [code, setCode] = useState(spot.code);
  const [name, setName] = useState(spot.name || '');
  const [kind, setKind] = useState(spot.kind);
  const [capacity, setCapacity] = useState(spot.capacity || '');
  const [active, setActive] = useState(spot.active);
  const [shopFloor, setShopFloor] = useState(spot.is_shop_floor);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    setBusy(true); setError('');
    try {
      await api.updateShelfSpot(spot.id, {
        code, name, kind, capacity, active, ...(spot.depth === 1 ? { is_shop_floor: shopFloor } : {}),
      });
      await onDone();
    } catch (err) { setError(err.message); setBusy(false); }
  };
  return (
    <Modal title={`Edit ${spot.address}`} onClose={onClose}>
      <div className="sh-form">
        <Field label={`Code${parent ? ` (under ${parent.address})` : ''}`} value={code} onChange={(v) => setCode(v.toUpperCase())} maxLength={12} />
        <Field label="Name (optional)" value={name} onChange={setName} maxLength={80} />
        <SelectField label="What is it?" value={kind} onChange={setKind} options={KINDS.map(([value, label]) => ({ value, label }))} />
        {spot.is_leaf && <Field label="Holds about (optional, a warning only)" type="number" decimals={3} value={capacity} onChange={setCapacity} />}
        {spot.depth === 1 && (
          <SelectField label="Shop floor?" value={shopFloor ? 'yes' : 'no'} onChange={(v) => setShopFloor(v === 'yes')}
                       options={[{ value: 'yes', label: 'Yes — the shop floor' }, { value: 'no', label: 'No — back room / godown' }]} />
        )}
        <label className="sh-check">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          In use (a shelf not in use cannot receive stock)
        </label>
        <p className="sh-muted">Renaming keeps the printed labels working — the QR code never changes.</p>
        {error && <div className="sh-error" role="alert">{error}</div>}
        <div className="sh-actions">
          <button type="button" className="btn-secondary" onClick={onClose}><X size={15} /> Cancel</button>
          <button type="button" className="btn-primary" disabled={busy || !code.trim()} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </Modal>
  );
}
