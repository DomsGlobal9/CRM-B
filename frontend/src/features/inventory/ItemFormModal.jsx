import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { api } from '../../services/api';
import { useLanguage } from '../../i18n/LanguageContext.jsx';
import { Dropzone, PhotoTile } from '../../components/ui/Atelier';
import { resolveMediaUrl } from '../../services/media';
import FabricPlacements from '../fabrics/FabricPlacements';
import { useFabricTaxonomy } from '../fabrics/taxonomy';
import { LIMITS, cleanAmount, amountError } from '../../services/validate';

/**
 * The inventory item form, shared by the inventory page ("New item", edit,
 * the catalogue's "Stock this") and the design library ("Add to inventory").
 * A draft may carry catalog_item or design_asset; saving links the item to
 * that row and leaves the item code to the server.
 */

const EMPTY_OPTIONS = { categories: [], units: [], default_unit_by_category: {} };

const errorBox = {
  fontSize: 'var(--text-sm)',
  color: 'var(--danger-color)',
  background: 'var(--danger-bg)',
  border: '1px solid var(--danger-color)',
  padding: '10px 12px',
  borderRadius: 'var(--radius-md)',
};

export function Modal({ title, onClose, children, width = '520px' }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 1200,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--surface-color)', borderRadius: 'var(--radius-xl)', width: '100%',
          maxWidth: width, maxHeight: '88vh', overflowY: 'auto', padding: 'var(--space-6)',
          border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-lg)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-5)' }}>
          <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--text-xl)', fontWeight: 500, margin: 0, color: 'var(--text-primary)' }}>{title}</h3>
          <button type="button" className="close-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function ItemFormModal({ item, options, suppliers, onClose, onSaved }) {
  const { t } = useLanguage();
  // The inventory page hands these in; anywhere else (the design library)
  // the form fetches them itself.
  const [loadedOptions, setLoadedOptions] = useState(null);
  const [loadedSuppliers, setLoadedSuppliers] = useState(null);
  useEffect(() => {
    if (!options) api.getInventoryOptions().then(setLoadedOptions).catch(() => setLoadedOptions(EMPTY_OPTIONS));
    if (!suppliers) api.getSuppliers().then(setLoadedSuppliers).catch(() => setLoadedSuppliers([]));
  }, [options, suppliers]);
  const opts = options || loadedOptions || EMPTY_OPTIONS;
  const sups = suppliers || loadedSuppliers || [];
  const isNew = !item.id;
  const [form, setForm] = useState({
    item_code: item.item_code || '',
    name: item.name || '',
    category: item.category || 'FABRIC',
    unit: item.unit || '',
    color: item.color || '',
    purchase_price: item.purchase_price || '',
    selling_price: item.selling_price || '',
    reorder_level: item.reorder_level || '',
    minimum_stock: item.minimum_stock || '',
    rack_location: item.rack_location || '',
    supplier: item.supplier || '',
    status: item.status || 'ACTIVE',
    sub_category: item.sub_category || '',
    catalog_item: item.catalog_item || '',
    design_asset: item.design_asset || '',
    // What the fabric catalogue used to record: the roll's own photographs,
    // its exact shade, what it is and where on which garment it goes.
    material_type: item.material_type || '',
    color_hex: item.color_hex || '',
    image_urls: item.image_urls || [],
    image_url: item.image_url || '',
    kind: item.kind || '',
    variant: item.variant || '',
    placements: (item.placements || []).map(({ garment, section, slot }) => ({ garment, section, slot })),
    // A roll that has just arrived is stocked in the same breath.
    opening_stock: '',
  });
  const taxonomy = useFabricTaxonomy();
  const [uploading, setUploading] = useState(false);
  const addPhotos = async (files) => {
    const picked = [...(files || [])];
    if (!picked.length) return;
    setUploading(true);
    try {
      const { image_urls: uploaded } = await api.uploadInventoryImages(picked);
      setForm((f) => ({
        ...f,
        image_urls: [...(f.image_urls || []), ...uploaded],
        image_url: f.image_url || uploaded[0] || '',
      }));
    } catch (err) {
      alert('Could not upload those photos: ' + err.message);
    } finally {
      setUploading(false);
    }
  };
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  // The unit follows the category until the user picks one themselves.
  const unitForCategory = opts.default_unit_by_category?.[form.category];
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  // Filed from the catalogue or the design library: the server issues the code.
  const linked = Boolean(form.catalog_item || form.design_asset);

  const submit = async (e) => {
    e.preventDefault();
    const problem = amountError(form.purchase_price, { label: 'Purchase price' })
      || amountError(form.selling_price, { label: 'Selling price' })
      || amountError(form.reorder_level, { label: 'Reorder level', max: LIMITS.quantity })
      || amountError(form.minimum_stock, { label: 'Minimum stock', max: LIMITS.quantity })
      || amountError(form.opening_stock, { label: 'Opening stock', max: LIMITS.quantity });
    if (problem) { setError(problem); return; }
    setError(null);
    setSaving(true);
    try {
      const { opening_stock: openingStock, ...payload } = {
        ...form,
        // 'ABC ' and 'ABC' must not become two codes.
        item_code: (form.item_code || '').trim().toUpperCase(),
        name: (form.name || '').trim(),
        unit: form.unit || unitForCategory || 'UNIT',
      };
      ['purchase_price', 'selling_price', 'reorder_level', 'minimum_stock'].forEach((k) => {
        payload[k] = payload[k] === '' ? 0 : payload[k];
      });
      ['supplier', 'sub_category', 'catalog_item', 'design_asset'].forEach((k) => { if (!payload[k]) delete payload[k]; });
      const saved = await api.saveInventoryItem(payload, item.id || null);
      // Through the ledger, like every other quantity: the item is created
      // empty and the opening figure arrives as a Stock In that names itself.
      if (isNew && Number(openingStock) > 0) {
        await api.moveStock(saved.id, 'stock-in', { quantity: openingStock, remarks: 'Opening stock' });
      }
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={isNew ? t('inventoryPage.newItemTitle', 'New inventory item') : `${t('inventoryPage.editTitle', 'Edit')} · ${item.name}`} onClose={onClose} width="760px">
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
          <Field label={t('inventoryPage.itemCode', 'Item code')} required={!linked} value={form.item_code} onChange={(v) => set('item_code', v)} maxLength={50}
            placeholder={linked ? t('inventoryPage.codeGenerated', 'Generated on save') : ''} />
          <Field label={t('inventoryPage.itemName', 'Name')} required value={form.name} onChange={(v) => set('name', v)} maxLength={200} />
          <SelectField label={t('inventoryPage.category', 'Category')} value={form.category} onChange={(v) => { set('category', v); set('unit', ''); }}
            options={opts.categories} />
          <SelectField
            label={t('inventoryPage.unit', 'Unit')}
            value={form.unit || unitForCategory || ''}
            onChange={(v) => set('unit', v)}
            options={opts.units}
            hint={!form.unit && unitForCategory ? t('inventoryPage.defaultForCategory', 'Default for this category') : ''}
          />
          <Field label={t('inventoryPage.colour', 'Colour')} value={form.color} onChange={(v) => set('color', v)} maxLength={50} />
          <Field label={t('inventoryPage.materialType', 'Material')} value={form.material_type} onChange={(v) => set('material_type', v)} maxLength={100} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600 }}>{t('inventoryPage.colourCode', 'Colour code')}</label>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input type="color" aria-label="Colour wheel" value={/^#[0-9a-fA-F]{6}$/.test(form.color_hex) ? form.color_hex : '#c8a97e'}
                     onChange={(e) => set('color_hex', e.target.value)}
                     style={{ width: '38px', height: '38px', padding: 0, border: '1px solid var(--border-color)', borderRadius: '8px', background: 'none' }} />
              <input className="form-control" placeholder="#c8a97e" maxLength={7} value={form.color_hex} style={{ fontFamily: 'monospace' }}
                     onChange={(e) => { const v = e.target.value.trim(); set('color_hex', v && !v.startsWith('#') ? `#${v}` : v); }} />
            </div>
          </div>
          <Field label={t('inventoryPage.rackLocation', 'Rack location')} value={form.rack_location} onChange={(v) => set('rack_location', v)} maxLength={100} />
          <Field label={t('inventoryPage.purchasePrice', 'Purchase price')} type="number" value={form.purchase_price} onChange={(v) => set('purchase_price', v)} />
          <Field label={t('inventoryPage.sellingPrice', 'Selling price')} type="number" value={form.selling_price} onChange={(v) => set('selling_price', v)} />
          <Field label={t('inventoryPage.reorderLevel', 'Reorder level')} type="number" decimals={3} max={LIMITS.quantity} value={form.reorder_level} onChange={(v) => set('reorder_level', v)} />
          <Field label={t('inventoryPage.minimumStock', 'Minimum stock')} type="number" decimals={3} max={LIMITS.quantity} value={form.minimum_stock} onChange={(v) => set('minimum_stock', v)} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600 }}>{t('inventoryPage.supplier', 'Supplier')}</label>
            <select className="form-control" value={form.supplier || ''} onChange={(e) => set('supplier', e.target.value)}>
              <option value="">—</option>
              {sups.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          {isNew && (
            <Field label={t('inventoryPage.openingStock', 'Opening stock (quantity on the shelf now)')} type="number" decimals={3} max={LIMITS.quantity}
                   value={form.opening_stock} onChange={(v) => set('opening_stock', v)} />
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: '12px', fontWeight: 600 }}>{t('inventoryPage.photos', 'Photos')}</label>
          <Dropzone compact multiple camera title="Drag & drop photos here" subtitle="or choose from your device"
                    chooseLabel="Add photos" onFiles={addPhotos} />
          {(form.image_urls || []).length > 0 && (
            <div className="at-photos" style={{ gap: '6px' }}>
              {form.image_urls.map((src, i) => (
                <PhotoTile key={src} src={resolveMediaUrl(src)} size={64}
                           onRemove={() => set('image_urls', form.image_urls.filter((_, idx) => idx !== i))} />
              ))}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: '12px', fontWeight: 600 }}>{t('inventoryPage.usedOn', 'Where is it used?')}</label>
          <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', margin: 0 }}>
            {t('inventoryPage.usedOnHint', 'File it under the garment parts it suits, or as an accessory, and the order wizard offers it there.')}
          </p>
          <FabricPlacements
            taxonomy={taxonomy}
            value={{ kind: form.kind, variant: form.variant, placements: form.placements }}
            onChange={(next) => setForm((f) => ({ ...f, kind: next.kind || '', variant: next.variant || '', placements: next.placements || [] }))}
          />
        </div>

        {!isNew && (
        <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', margin: 0 }}>
          {t('inventoryPage.stockNotSetHereHint', 'Stock quantities are not set here — they only change through recorded movements.')}
        </p>
        )}

        {error && (
          <div style={errorBox}>{error}</div>
        )}

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button type="button" className="btn-secondary" onClick={onClose}>{t('common.cancel', 'Cancel')}</button>
          <button type="submit" className="btn-primary" disabled={saving || uploading}>
            {uploading ? t('common.uploading', 'Uploading…') : saving ? t('common.saving', 'Saving…') : t('inventoryPage.saveItem', 'Save item')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * A labelled input. Every `type="number"` here is a price or a quantity, so it
 * is a decimal box that never holds a minus sign, a second dot or a value
 * over `max` (cleanAmount) -- one place, every inventory form.
 */
export function Field({ label, value, onChange, type = 'text', required = false, placeholder = '', max, decimals = 2, ...rest }) {
  const amount = type === 'number';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <label style={{ fontSize: '12px', fontWeight: 600 }}>{label}{required && ' *'}</label>
      <input
        type={amount ? 'text' : type} inputMode={amount ? 'decimal' : undefined} required={required} placeholder={placeholder}
        className="form-control" value={value}
        onChange={(e) => onChange(amount ? cleanAmount(e.target.value, { max, decimals }) : e.target.value)}
        {...rest}
      />
    </div>
  );
}

export function SelectField({ label, value, onChange, options, hint }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <label style={{ fontSize: '12px', fontWeight: 600 }}>{label}</label>
      <select className="form-control" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {hint && <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{hint}</span>}
    </div>
  );
}
