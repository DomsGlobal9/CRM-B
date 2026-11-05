import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { api } from '../../../api';
import { inventoryImage } from '../inventoryImages';
import { Field, Modal, SelectField } from '../inventoryForm';
import Loader from '../../../components/ui/Loader';
import { Breadcrumbs } from '../../../components/ui/Breadcrumbs';
import { KINDS } from './shelfKinds';

/** The dialogs on Set up racks: what is in a spot, adding one and editing one. */

/** Everything sitting in a spot -- on it, or on any shelf or box inside it. */
export function SpotView({ spot, onClose }) {
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
          <Breadcrumbs items={[
            { label: spot.address, onClick: () => setLooking(null) },
            { label: looking.row.item.name },
          ]} />
        )}
        {looking && (
          <div className="sh-look">
            <img className="sh-look-img" src={inventoryImage(looking.row.item)} alt={looking.row.item.name} />
            <div className="sh-look-text">
              <b>{looking.row.item.name}</b>
              <span className="sh-muted">{looking.row.item.item_code}{looking.row.item.color ? ` · ${looking.row.item.color}` : ''}</span>
              <span><b>{looking.row.quantity_text}</b> on <b className="sh-address">{looking.spot.address}</b>{looking.spot.name ? ` · ${looking.spot.name}` : ''}</span>
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

export function AddSpot({ location, parent, onClose, onDone }) {
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

export function EditSpot({ spot, parent, onClose, onDone }) {
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
