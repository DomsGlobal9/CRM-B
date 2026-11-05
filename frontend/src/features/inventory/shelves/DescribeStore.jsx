import { useState } from 'react';
import { api } from '../../../api';
import { Field, Modal, SelectField } from '../inventoryForm';
import { HOLDERS } from './shelfKinds';

/** Describe your store: making a whole set of racks and shelves in one go. */

export default function DescribeStore({ location, onClose, onDone }) {
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
