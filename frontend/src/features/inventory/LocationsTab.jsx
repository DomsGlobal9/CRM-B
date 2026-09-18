import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, MapPin, Plus, Trash2 } from 'lucide-react';

import { api } from '../../services/api';
import { LIMITS, cleanAmount, amountError } from '../../services/validate';
import { useLanguage } from '../../i18n/LanguageContext.jsx';
import { Field, Modal, SelectField } from './ItemFormModal';

/**
 * Where stock physically is, and moving it between places.
 *
 * The total on an item is authoritative; this is the breakdown of where that
 * total sits. A transfer never changes the total -- material stops being in one
 * place and starts being in another -- which is why the form asks for a source
 * as well as a destination and refuses to send material from somewhere that
 * does not hold it.
 */

const panel = {
  background: 'var(--surface-color)',
  border: '1px solid var(--border-color)',
  borderRadius: 'var(--radius-lg)',
  boxShadow: 'var(--shadow-sm)',
};

const qty = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 });

export default function LocationsTab({ items, isOwner, onMoved }) {
  const { t } = useLanguage();
  const [locations, setLocations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [held, setHeld] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [transferring, setTransferring] = useState(false);

  const [adding, setAdding] = useState(false);
  const loadLocations = useCallback((keep) => api.getStockLocations({ active: 'true' })
    .then((rows) => {
      setLocations(rows || []);
      setSelected((rows || []).find((l) => keep && l.id === keep) || (rows || []).find((l) => l.is_default) || (rows || [])[0] || null);
    })
    .catch((err) => setError(err.message))
    .finally(() => setLoading(false)), []);
  useEffect(() => { loadLocations(); }, [loadLocations]);

  // Only Main Store is seeded; the boutique names its own places. One that
  // still holds material, or is the default, cannot go -- the server says so.
  const remove = async (location) => {
    if (!window.confirm(`${t('inventoryPage.removeLocationConfirm', 'Remove this location?')} ${location.name}`)) return;
    try { await api.deleteStockLocation(location.id); setError(null); loadLocations(); }
    catch (err) { setError(err.message); }
  };

  const loadHeld = useCallback((location) => {
    if (!location) { setHeld([]); return; }
    api.getLocationStock(location.id)
      .then((rows) => setHeld(rows || []))
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => { loadHeld(selected); }, [selected, loadHeld]);

  return (
    <div style={{ marginTop: '20px' }}>
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '16px' }}>
        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', flex: '1 1 auto' }}>
          {t('inventoryPage.locationsSubtitle', 'Material moves between units as it is worked on. Every transfer is recorded.')}
        </div>
        {isOwner && (
          <button type="button" className="btn-secondary" style={{ fontSize: '13px' }} onClick={() => setAdding(true)}>
            <Plus size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
            {t('inventoryPage.addLocation', 'Add location')}
          </button>
        )}
        {isOwner && locations.length > 1 && (
          <button type="button" className="btn-primary" style={{ fontSize: '13px' }}
                  onClick={() => setTransferring(true)}>
            <ArrowRight size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
            {t('inventoryPage.transferStock', 'Transfer stock')}
          </button>
        )}
      </div>

      {error && (
        <div style={{ ...panel, padding: '12px 16px', marginBottom: '12px', borderColor: 'var(--danger-color)', color: 'var(--danger-color)', fontSize: '13px' }}>
          {error}
        </div>
      )}

      <div className="mobile-stack-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(190px, 100%), 1fr))', gap: '10px' }}>
        {locations.map((location) => (
          <button
            key={location.id}
            type="button"
            onClick={() => setSelected(location)}
            style={{
              ...panel, padding: '14px 16px', textAlign: 'left', cursor: 'pointer', color: 'inherit',
              borderColor: selected?.id === location.id ? 'var(--accent-text, #b07c40)' : 'var(--border-color)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13.5px', fontWeight: 600 }}>
              <MapPin size={13} /> {location.name}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{location.kind_display}{location.is_default ? ' · default' : ''}</span>
              {isOwner && !location.is_default && (
                <span role="button" tabIndex={0} title={t('inventoryPage.removeLocation', 'Remove location')}
                      aria-label={`${t('inventoryPage.removeLocation', 'Remove location')} ${location.name}`}
                      onClick={(e) => { e.stopPropagation(); remove(location); }}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); remove(location); } }}
                      style={{ display: 'inline-flex', cursor: 'pointer', color: 'var(--text-muted)' }}>
                  <Trash2 size={13} />
                </span>
              )}
            </div>
          </button>
        ))}
      </div>

      {adding && (
        <AddLocationModal onClose={() => setAdding(false)}
                          onSaved={(row) => { setAdding(false); loadLocations(row.id); }} />
      )}

      {selected && (
        <div style={{ ...panel, marginTop: '18px', overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-color)', fontSize: '13px', fontWeight: 600 }}>
            {selected.name}
            <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: '8px' }}>
              {held.length} {t('inventoryPage.tableItem', 'material')}
            </span>
          </div>
          {held.length === 0 ? (
            <div style={{ padding: '28px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
              {t('inventoryPage.nothingHere', 'Nothing is here at the moment.')}
            </div>
          ) : (
            <div className="responsive-table-wrapper">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    <th style={{ padding: '12px' }}>{t('inventoryPage.tableMaterial', 'Material')}</th>
                    <th style={{ padding: '12px', textAlign: 'right' }}>{t('inventoryPage.tableQuantity', 'Quantity')}</th>
                  </tr>
                </thead>
                <tbody>
                  {held.map((row) => (
                    <tr key={row.id} style={{ borderTop: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ fontWeight: 500 }}>{row.item_name}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{row.item_code}</div>
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {qty(row.quantity)} <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{row.unit_display}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {transferring && (
        <TransferModal
          items={items}
          locations={locations}
          onClose={() => setTransferring(false)}
          onDone={() => { setTransferring(false); loadHeld(selected); onMoved?.(); }}
        />
      )}
    </div>
  );
}

/** A place of the boutique's own: a name and what sort of place it is. */
const LOCATION_KINDS = [
  ['MAIN_STORE', 'Store / shop'], ['WAREHOUSE', 'Warehouse / godown'], ['WORKSHOP', 'Workshop'],
  ['CUTTING_UNIT', 'Cutting unit'], ['EMBROIDERY_UNIT', 'Embroidery unit'], ['TAILOR', 'Tailor / Master'],
  ['FINISHING_UNIT', 'Finishing unit'], ['SHOWROOM', 'Showroom'],
];

function AddLocationModal({ onClose, onSaved }) {
  const { t } = useLanguage();
  const [name, setName] = useState('');
  const [kind, setKind] = useState('MAIN_STORE');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    const clean = name.trim();
    if (!clean) { setError(t('inventoryPage.locationNameRequired', 'Give the place a name.')); return; }
    setSaving(true);
    try {
      const row = await api.createStockLocation({ name: clean, kind });
      onSaved(row);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal title={t('inventoryPage.addLocation', 'Add location')} onClose={onClose} width="440px">
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <Field label={t('inventoryPage.locationName', 'Name')} required value={name} onChange={setName} maxLength={120} autoFocus
               placeholder={t('inventoryPage.locationNamePlaceholder', 'e.g. Jubilee Hills shop, Godown 2')} />
        <SelectField label={t('inventoryPage.locationKind', 'What kind of place')} value={kind} onChange={setKind}
                     options={LOCATION_KINDS.map(([value, label]) => ({ value, label }))} />
        {error && <div style={{ color: 'var(--danger-color)', fontSize: '13px' }}>{error}</div>}
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button type="button" className="btn-secondary" onClick={onClose}>{t('common.cancel', 'Cancel')}</button>
          <button type="submit" className="btn-primary" disabled={saving}>{saving ? '…' : t('common.save', 'Save')}</button>
        </div>
      </form>
    </Modal>
  );
}

function TransferModal({ items, locations, onClose, onDone }) {
  const { t } = useLanguage();
  const [item, setItem] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [quantity, setQuantity] = useState('');
  const [breakdown, setBreakdown] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!item) { setBreakdown(null); return; }
    api.getItemLocations(item).then(setBreakdown).catch(() => setBreakdown(null));
  }, [item]);

  const submit = async () => {
    setError(null);
    if (!item || !from || !to || !quantity) {
      setError('Choose a material, both locations and a quantity.');
      return;
    }
    const problem = amountError(quantity, { label: 'Quantity', max: LIMITS.quantity, allowZero: false });
    if (problem) {
      setError(problem);
      return;
    }
    if (from === to) {
      setError('The source and the destination are the same place.');
      return;
    }
    setSaving(true);
    try {
      await api.transferStock(item, { quantity, from_location: from, to_location: to });
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
         onClick={onClose}>
      <div className="search-modal-card" style={{ ...panel, background: 'var(--surface-color)', width: '100%', maxWidth: '480px', padding: '22px' }}
           onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 16px', fontFamily: 'var(--font-serif)', fontSize: 'var(--text-xl)', fontWeight: 500, color: 'var(--text-primary)' }}>{t('inventoryPage.transferModalTitle', 'Transfer stock')}</h3>

        <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>{t('inventoryPage.tableMaterial', 'Material')}</label>
        <select className="form-control" value={item} onChange={(e) => setItem(e.target.value)} style={{ marginBottom: '12px' }}>
          <option value="">{t('inventoryPage.chooseMaterial', 'Choose a material…')}</option>
          {items.map((row) => (
            <option key={row.id} value={row.id}>{row.name} ({row.item_code})</option>
          ))}
        </select>

        {breakdown && breakdown.breakdown?.length > 0 && (
          <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginBottom: '12px' }}>
            Currently:{' '}
            {breakdown.breakdown.map((row) => `${row.quantity} at ${row.location}`).join(' · ')}
          </div>
        )}

        <div className="mobile-stack-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>{t('inventoryPage.fromSource', 'From')}</label>
            <select className="form-control" value={from} onChange={(e) => setFrom(e.target.value)}>
              <option value="">{t('inventoryPage.fromSource', 'Source…')}</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>{t('inventoryPage.toDestination', 'To')}</label>
            <select className="form-control" value={to} onChange={(e) => setTo(e.target.value)}>
              <option value="">{t('inventoryPage.toDestination', 'Destination…')}</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
        </div>

        <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>{t('inventoryPage.tableQuantity', 'Quantity')}</label>
        <input className="form-control" inputMode="decimal" value={quantity}
               onChange={(e) => setQuantity(cleanAmount(e.target.value, { max: LIMITS.quantity, decimals: 3 }))} placeholder="e.g. 12.5" />

        {error && <div style={{ color: 'var(--danger-color)', fontSize: '12.5px', marginTop: '12px' }}>{error}</div>}

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '20px' }}>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>{t('common.cancel', 'Cancel')}</button>
          <button type="button" className="btn-primary" onClick={submit} disabled={saving}>
            {saving ? t('inventoryPage.movingBtn', 'Moving…') : t('inventoryPage.transferBtn', 'Transfer')}
          </button>
        </div>
      </div>
    </div>
  );
}
