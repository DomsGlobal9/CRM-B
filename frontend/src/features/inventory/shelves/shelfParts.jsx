import { useMemo, useState } from 'react';
import { Camera, MapPin } from 'lucide-react';
import { api } from '../../../api';
import { SelectField } from '../inventoryForm';
import { CameraScan } from './CameraScan';

/** Small pieces the shelf screens share: the scan box, a shelf's contents, and choosing a shelf. */

/** A shelf label scanned (camera, scanner) or an address typed: resolves to the spot. */
export function ScanBox({ location, onSpot, placeholder = 'Scan a shelf label, or type its address (c2 1)', autoFocus = false }) {
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

/** One shelf's contents as compact chips. */
export function Contents({ rows }) {
  if (!rows?.length) return <div className="sh-muted">Empty</div>;
  return (
    <div className="sh-chips">
      {rows.map((r) => <span key={r.item.id} className="sh-chip"><b>{r.item.name}</b> · {r.quantity_text}</span>)}
    </div>
  );
}

/** Choose a shelf (a leaf) from the tree: suggested ones first. */
export function ShelfSelect({ label = 'Shelf', leaves, value, onChange, suggested = [], exclude, allowNone }) {
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
