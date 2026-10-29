/* "Where are you keeping it?" -- the shelf picker inside the forms that bring
   stock in (Stock an item, New inventory item, Stock In). New stock lands in
   the default location (InventoryService.default_location), so the picker
   offers that location's shelves: a recent place in one tap, a scanned label,
   or tapping down Area -> Cupboard -> Shelf. Optional: left empty, the stock
   saves exactly as before and waits as "Not shelved" for Put away. With no
   racks set up the picker renders nothing and the form is unchanged. */
import { useEffect, useMemo, useState } from 'react';
import { Camera, ChevronRight, MapPin, PackagePlus, Plus, X } from 'lucide-react';
import { api } from '../../services/api';
import { cleanAmount, LIMITS } from '../../services/validate';
import { recentIds } from './shelfPlacing';
import { CameraScan } from './ShelvesTab';
import './shelves.css';

/** The default location and its shelves; null while loading or when there are none. */
function useDefaultShelves() {
  const [state, setState] = useState(null);
  useEffect(() => {
    let current = true;
    api.getStockLocations({ active: 'true' })
      .then((rows) => {
        const location = (rows || []).find((l) => l.is_default) || (rows || [])[0];
        if (!location) return null;
        return api.getShelfTree(location.id).then((tree) => {
          if (current && (tree || []).length) setState({ location, tree: tree.filter((s) => s.active) });
        });
      })
      .catch(() => { /* no shelf access: the form stays as it was */ });
    return () => { current = false; };
  }, []);
  return state;
}

/** A shelf label scanned or an address typed. No <form> of its own: it sits
 *  inside the stock form, so Enter looks the shelf up instead of saving. */
function PlaceScan({ location, onSpot }) {
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
      const spot = await api.scanShelf(text, location.id);
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
      <div className="sh-scan-row">
        <label className="sh-search">
          <MapPin size={15} aria-hidden="true" />
          <input className="form-control" value={value} onChange={(e) => setValue(e.target.value)}
                 onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); resolve(value); } }}
                 placeholder="Scan the shelf label, or type its address" aria-label="Shelf label or address" />
        </label>
        <button type="button" className="btn-secondary" disabled={busy || !value.trim()} onClick={() => resolve(value)}>{busy ? 'Finding…' : 'Go'}</button>
        {canCamera && (
          <button type="button" className="btn-secondary sh-icon-btn" onClick={() => setCamera(true)} aria-label="Scan with the camera" title="Scan with the camera">
            <Camera size={16} />
          </button>
        )}
      </div>
      {error && <div className="sh-error" role="alert">{error}</div>}
      {camera && <CameraScan onCode={(code) => { setCamera(false); resolve(code); }} onClose={() => setCamera(false)} />}
    </div>
  );
}

export default function ShelfPlace({ places, onChange, total = '', unitLabel = '' }) {
  const shelves = useDefaultShelves();
  const [open, setOpen] = useState(false);
  const [path, setPath] = useState([]);
  const [error, setError] = useState('');

  const byId = useMemo(() => new Map((shelves?.tree || []).map((s) => [s.id, s])), [shelves]);
  if (!shelves) return null;

  const { location, tree } = shelves;
  const chosen = new Set(places.map((p) => p.spot.id));
  const recent = recentIds().map((id) => byId.get(id)).filter((s) => s && s.is_leaf && !chosen.has(s.id));
  const here = path.length ? path[path.length - 1] : null;
  const children = tree.filter((s) => (s.parent || null) === here);

  const add = (spot) => {
    setError('');
    onChange([...places, { spot, quantity: '' }]);
    setOpen(false);
    setPath([]);
  };
  const tap = (spot) => {
    if (spot.is_leaf) { if (!chosen.has(spot.id)) add(spot); return; }
    setPath([...path, spot.id]);
  };
  const scanned = (spot) => {
    const known = byId.get(String(spot.id));
    if (!known) { setError(`${spot.address} is in ${spot.location_name || 'another location'}; new stock goes into ${location.name}.`); return; }
    if (chosen.has(known.id)) { setError(`${known.address} is already chosen.`); return; }
    if (known.is_leaf) { add(known); return; }
    // A rack or cupboard label: open it and let them tap the shelf.
    const trail = [];
    for (let node = known; node; node = node.parent ? byId.get(node.parent) : null) trail.unshift(node.id);
    setError('');
    setPath(trail);
  };
  const setQuantity = (i, v) => onChange(places.map((p, idx) => (idx === i ? { ...p, quantity: v } : p)));
  const remove = (i) => onChange(places.filter((_, idx) => idx !== i));

  const single = places.length === 1;
  const totalText = total ? `${total}${unitLabel ? ` ${unitLabel}` : ''}` : '';

  return (
    <div className="sp">
      <div className="sp-head">
        <span className="sp-title"><MapPin size={15} aria-hidden="true" /> Where are you keeping it?</span>
        <span className="sp-optional">Optional · {location.name}</span>
      </div>

      {places.length > 0 && (
        <div className="sp-places">
          {places.map((p, i) => (
            <div key={p.spot.id} className="sp-place">
              <span className="sp-place-name">
                <b className="sh-address">{p.spot.address}</b>
                {p.spot.name && <small>{p.spot.name}</small>}
              </span>
              {single ? (
                <span className="sp-all">{totalText ? `All ${totalText}` : 'All of it'}</span>
              ) : (
                <input className="form-control sp-qty" inputMode="decimal" value={p.quantity}
                       aria-label={`How much goes on ${p.spot.address}`}
                       placeholder={i === places.length - 1 ? 'The rest' : 'How much'}
                       onChange={(e) => setQuantity(i, cleanAmount(e.target.value, { max: LIMITS.quantity, decimals: 3 }))} />
              )}
              <button type="button" className="sh-mini" onClick={() => remove(i)} aria-label={`Remove ${p.spot.address}`} title="Remove">
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {!open && (
        <div className="sp-quick">
          {recent.map((s) => (
            <button key={s.id} type="button" className="sh-chip sp-recent" onClick={() => add(s)} title={s.name || s.address}>
              <PackagePlus size={13} aria-hidden="true" /> {s.address}
            </button>
          ))}
          <button type="button" className="sp-link" onClick={() => { setOpen(true); setError(''); }}>
            <Plus size={13} aria-hidden="true" /> {places.length ? 'Another place' : recent.length ? 'Another shelf' : 'Choose a shelf'}
          </button>
        </div>
      )}

      {open && (
        <div className="sp-chooser">
          <PlaceScan location={location} onSpot={scanned} />
          <div className="sp-crumbs">
            <button type="button" className={path.length ? 'sp-crumb' : 'sp-crumb is-here'} onClick={() => setPath([])}>{location.name}</button>
            {path.map((id, i) => (
              <span key={id} className="sp-crumb-wrap">
                <ChevronRight size={13} aria-hidden="true" />
                <button type="button" className={i === path.length - 1 ? 'sp-crumb is-here' : 'sp-crumb'} onClick={() => setPath(path.slice(0, i + 1))}>
                  {byId.get(id)?.code || byId.get(id)?.address}
                </button>
              </span>
            ))}
          </div>
          <div className="sp-grid">
            {children.map((s) => (
              <button key={s.id} type="button" className={`sp-tile${s.is_leaf ? ' is-leaf' : ''}`}
                      disabled={s.is_leaf && chosen.has(s.id)} onClick={() => tap(s)}>
                <span className="sp-tile-kind">{s.kind_label}</span>
                <b>{s.code}</b>
                {s.name && <small>{s.name}</small>}
                <small>{s.is_leaf ? (s.item_count ? `${s.item_count} item${s.item_count === 1 ? '' : 's'}` : 'Empty') : 'Open ›'}</small>
              </button>
            ))}
            {children.length === 0 && <span className="sh-muted">Nothing inside.</span>}
          </div>
          <div className="sp-quick">
            <button type="button" className="sp-link" onClick={() => { setOpen(false); setPath([]); setError(''); }}>Close</button>
          </div>
        </div>
      )}

      {error && <div className="sh-error" role="alert">{error}</div>}
      {!single && places.length > 1 && <span className="sh-muted">The last place takes whatever is left.</span>}
      {places.length === 0 && !open && (
        <span className="sh-muted">Skip it and the stock waits under Not shelved for Put away.</span>
      )}
    </div>
  );
}

/** Inventory page line: items in stock that are on no shelf yet (only once racks exist). */
export function NotShelvedReminder({ version, onOpen }) {
  const [state, setState] = useState(null);
  useEffect(() => {
    let current = true;
    api.getStockLocations({ active: 'true' })
      .then((rows) => {
        const location = (rows || []).find((l) => l.is_default) || (rows || [])[0];
        if (!location) return null;
        return api.getShelfTree(location.id).then((tree) => {
          if (!(tree || []).length) return null;
          return api.getNotShelved(location.id).then((list) => {
            if (current) setState({ location, count: (list || []).length });
          });
        });
      })
      .catch(() => { /* no shelf access: nothing to remind */ });
    return () => { current = false; };
  }, [version]);
  if (!state?.count) return null;
  return (
    <button type="button" className="sp-reminder" onClick={() => onOpen(state.location)}>
      <PackagePlus size={15} aria-hidden="true" />
      <span>
        <b>{state.count} item{state.count === 1 ? '' : 's'}</b> in {state.location.name} {state.count === 1 ? 'is' : 'are'} not on a shelf yet.
      </span>
      <span className="sp-reminder-go">Put away ›</span>
    </button>
  );
}
