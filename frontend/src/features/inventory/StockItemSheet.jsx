import { useEffect, useRef, useState } from 'react';
import { api } from '../../services/api';
import { useLanguage } from '../../i18n/LanguageContext.jsx';
import { inventoryImage } from '../../services/inventoryImages';
import { LIMITS, amountError, imageFilesError } from '../../services/validate';
import { Field, Modal, SelectField } from './ItemFormModal';

/**
 * The fast way to put stock on the shelf: what it is (a catalogue row, or a
 * name and a category), a picture, three numbers, save. Creation only --
 * editing an existing item stays with ItemFormModal.
 */

// The next roll usually comes from the same supplier onto the same rack.
let lastSupplier = '';
let lastRack = '';

const errorBox = {
  fontSize: 'var(--text-sm)', color: 'var(--danger-color)', background: 'var(--danger-bg)',
  border: '1px solid var(--danger-color)', padding: '10px 12px', borderRadius: 'var(--radius-md)',
};
const linkBtn = { background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--primary-color)', fontSize: '12px', textDecoration: 'underline' };

const blank = () => ({
  name: '', category: 'FABRIC', quantity: '', purchase_price: '', selling_price: '',
  color: '', color_hex: '', material_type: '', rack_location: lastRack, supplier: lastSupplier, gst_percent: '', image_url: '',
});

export default function StockItemSheet({ catalogItem = null, options, suppliers, onClose, onSaved }) {
  const { t } = useLanguage();
  const docLabel = { MAGGAM: t('inventoryPage.maggamSection', 'Maggam · Aari · Zardosi'), APPAREL: t('inventoryPage.apparelSection', 'Apparel ecosystem') };
  const alreadyStocked = t('inventoryPage.alreadyInStock', 'Already in stock');

  const [picked, setPicked] = useState(catalogItem);
  // crumb: breadcrumb · choose: group + item selects · search: catalogue search · custom: name + category
  const [mode, setMode] = useState(catalogItem ? 'crumb' : 'search');
  const [form, setForm] = useState(blank);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const [sections, setSections] = useState([]);
  const [sectionId, setSectionId] = useState(catalogItem?.section || '');
  const [groupItems, setGroupItems] = useState([]);
  const [saves, setSaves] = useState(0);
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState([]);

  useEffect(() => { api.getCatalogSections().then((rows) => setSections(rows || [])).catch(() => {}); }, []);
  useEffect(() => {
    if (mode !== 'choose' || !sectionId) return;
    api.getCatalogItems({ section: sectionId, stockable: 'true' }).then((rows) => setGroupItems(rows || [])).catch((err) => setError(err.message));
  }, [mode, sectionId, saves]);
  useEffect(() => {
    const term = query.trim();
    const timer = setTimeout(() => {
      if (!term) { setMatches([]); return; }
      api.getCatalogItems({ search: term, stockable: 'true' }).then((rows) => setMatches(rows || [])).catch((err) => setError(err.message));
    }, term ? 250 : 0);
    return () => clearTimeout(timer);
  }, [query, saves]);

  const pick = (item) => {
    if (!item) return;
    if (item.stocked_item_id) { setError(`${item.name}: ${alreadyStocked.toLowerCase()}.`); return; }
    setError(null);
    setPicked(item);
    setSectionId(item.section);
    setMode('crumb');
  };

  // Category and unit follow the picked catalogue item; otherwise the chosen category.
  const category = picked ? picked.legacy_category : form.category;
  const unit = picked?.default_unit || options.default_unit_by_category?.[category] || 'UNIT';
  const unitLabel = options.units.find((u) => u.value === unit)?.label || unit;
  const name = picked ? picked.name : form.name;
  const subCategory = picked?.section_full_name || '';
  const withUnit = (label, per) => `${label} ${per ? '/' : '·'} ${unitLabel}`;

  const addPhoto = async (files) => {
    const problem = imageFilesError(files, { max: 1 });
    if (problem) { setError(problem); return; }
    setUploading(true);
    try {
      const { image_urls: uploaded } = await api.uploadInventoryImages([...files]);
      set('image_url', uploaded[0] || '');
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const save = async (another) => {
    const problem = (mode !== 'custom' && !picked ? t('inventoryPage.pickItemFirst', 'Pick the item being stocked first.') : '')
      || (!picked && !form.name.trim() ? t('inventoryPage.nameRequired', 'Type a name for the item.') : '')
      || amountError(form.quantity, { label: t('inventoryPage.quantityOnShelf', 'Quantity on shelf'), max: LIMITS.quantity, allowZero: false, required: true })
      || amountError(form.purchase_price, { label: t('inventoryPage.purchasePricePerUnit', 'Purchase price'), allowZero: false, required: true })
      || amountError(form.selling_price, { label: t('inventoryPage.sellingPricePerUnit', 'Selling price'), allowZero: false, required: true })
      || amountError(form.gst_percent, { label: 'GST %', max: 100 });
    if (problem) { setError(problem); return; }
    setError(null);
    setSaving(true);
    try {
      const payload = {
        name: name.trim(), category, unit,
        purchase_price: form.purchase_price, selling_price: form.selling_price,
        color: form.color, color_hex: form.color_hex, material_type: form.material_type,
        rack_location: form.rack_location, gst_percent: form.gst_percent || 0,
        image_url: form.image_url, image_urls: form.image_url ? [form.image_url] : [],
      };
      if (picked) { payload.catalog_item = picked.id; payload.sub_category = subCategory; }
      if (form.supplier) payload.supplier = form.supplier;
      const saved = await api.saveInventoryItem(payload, null);
      try {
        await api.moveStock(saved.id, 'stock-in', { quantity: form.quantity, remarks: 'Opening stock' });
      } catch (err) {
        // The row exists at zero stock; a second Save would only duplicate
        // or be refused. Refresh so it shows, and say where the quantity goes.
        onSaved(false);
        throw new Error(t('inventoryPage.openingStockFailed', 'The item was saved but the opening stock was not: use Stock in on the item.') + ` (${err.message})`, { cause: err });
      }
      lastSupplier = form.supplier;
      lastRack = form.rack_location;
      onSaved(another);
      if (another) {
        setPicked(null);
        setForm(blank());
        setQuery('');
        setSaves((n) => n + 1);
        setMode(sectionId ? 'choose' : 'search');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const itemRow = (item) => (
    <span>
      {item.name}
      <span style={{ color: 'var(--text-muted)', marginLeft: '6px', fontSize: '11px' }}>
        {item.section_full_name}{item.stocked_item_id ? ` · ${alreadyStocked.toLowerCase()}` : ''}
      </span>
    </span>
  );

  return (
    <Modal title={t('inventoryPage.stockItemTitle', 'Stock an item')} onClose={onClose} width="560px">
      <form onSubmit={(e) => { e.preventDefault(); save(false); }} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {/* What is being stocked */}
        <div className="at-field">
          <span className="ui-eyebrow">{t('inventoryPage.whatIsStocked', 'What is being stocked')}</span>
          {mode === 'crumb' && picked && (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'baseline', flexWrap: 'wrap', fontSize: '13.5px' }}>
              <span>
                <span style={{ color: 'var(--text-muted)' }}>{docLabel[picked.doc] || picked.doc} › {subCategory} › </span>
                <strong>{picked.name}</strong>
              </span>
              <button type="button" style={linkBtn} onClick={() => { setPicked(null); setMode('choose'); }}>{t('inventoryPage.change', 'Change')}</button>
            </div>
          )}
          {mode === 'choose' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div className="at-field">
                <label className="at-field-label">{t('inventoryPage.group', 'Group')}</label>
                <select className="form-control" value={sectionId} onChange={(e) => { setSectionId(e.target.value); setGroupItems([]); setPicked(null); }}>
                  <option value="">—</option>
                  {['MAGGAM', 'APPAREL'].map((doc) => (
                    <optgroup key={doc} label={docLabel[doc]}>
                      {sections.filter((s) => s.doc === doc).map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div className="at-field">
                <label className="at-field-label">{t('inventoryPage.item', 'Item')}</label>
                <select className="form-control" value={picked && String(picked.section) === String(sectionId) ? picked.id : ''}
                        onChange={(e) => pick(groupItems.find((i) => String(i.id) === e.target.value))}>
                  <option value="">—</option>
                  {groupItems.map((i) => (
                    <option key={i.id} value={i.id}>{i.name}{i.stocked_item_id ? ` · ${alreadyStocked.toLowerCase()}` : ''}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
          {mode === 'search' && (
            <>
              <input className="form-control" autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
                     onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
                     placeholder={t('inventoryPage.searchCatalogue', 'Search the catalogue…')} />
              {matches.length > 0 && (
                <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }}>
                  {matches.map((item) => (
                    <button key={item.id} type="button" onClick={() => pick(item)}
                            style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', borderTop: '1px solid var(--border-color)', padding: '8px 10px', cursor: 'pointer', fontSize: '13px', color: item.stocked_item_id ? 'var(--text-muted)' : 'var(--text-primary)' }}>
                      {itemRow(item)}
                    </button>
                  ))}
                </div>
              )}
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                {t('inventoryPage.notInCatalogue', 'Not in the catalogue?')}{' '}
                <button type="button" style={linkBtn} onClick={() => { setPicked(null); setMode('custom'); }}>
                  {t('inventoryPage.typeNameChooseCategory', 'Type a name and choose a category')}
                </button>
              </span>
            </>
          )}
          {mode === 'custom' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <Field label={t('inventoryPage.itemName', 'Name')} required value={form.name} onChange={(v) => set('name', v)} maxLength={200} autoFocus />
              <SelectField label={t('inventoryPage.category', 'Category')} value={form.category} onChange={(v) => set('category', v)} options={options.categories} />
              <span style={{ gridColumn: '1 / -1' }}>
                <button type="button" style={linkBtn} onClick={() => setMode('search')}>{t('inventoryPage.backToSearch', 'Back to the catalogue search')}</button>
              </span>
            </div>
          )}
        </div>

        {/* Picture */}
        <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
          <img src={inventoryImage({ category, name, sub_category: subCategory, color_hex: form.color_hex, image_url: form.image_url })} alt=""
               style={{ width: 88, height: 88, objectFit: 'cover', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-start' }}>
            <button type="button" className="btn-secondary at-btn-sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
              {uploading ? t('common.uploading', 'Uploading…') : t('inventoryPage.changePhoto', 'Change photo')}
            </button>
            {form.image_url && (
              <button type="button" style={linkBtn} onClick={() => set('image_url', '')}>{t('inventoryPage.useDefaultPicture', 'Use default')}</button>
            )}
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { addPhoto(e.target.files); e.target.value = ''; }} />
          </div>
        </div>

        {/* The three numbers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' }}>
          <Field label={withUnit(t('inventoryPage.quantityOnShelf', 'Quantity on shelf'))} required type="number" decimals={3} max={LIMITS.quantity}
                 value={form.quantity} onChange={(v) => set('quantity', v)} autoFocus={mode === 'crumb'} />
          <Field label={withUnit(t('inventoryPage.purchasePricePerUnit', 'Purchase price'), true)} required type="number"
                 value={form.purchase_price} onChange={(v) => set('purchase_price', v)} />
          <Field label={withUnit(t('inventoryPage.sellingPricePerUnit', 'Selling price'), true)} required type="number"
                 value={form.selling_price} onChange={(v) => set('selling_price', v)} />
        </div>

        <details>
          <summary style={{ cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}>{t('inventoryPage.moreDetails', 'More details')}</summary>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', marginTop: '10px' }}>
            <Field label={t('inventoryPage.colour', 'Colour')} value={form.color} onChange={(v) => set('color', v)} maxLength={50} />
            <div className="at-field" style={{ gap: '4px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600 }}>{t('inventoryPage.colourCode', 'Colour code')}</label>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input type="color" aria-label="Colour wheel" value={/^#[0-9a-fA-F]{6}$/.test(form.color_hex) ? form.color_hex : '#c8a97e'}
                       onChange={(e) => set('color_hex', e.target.value)}
                       style={{ width: '38px', height: '38px', padding: 0, border: '1px solid var(--border-color)', borderRadius: '8px', background: 'none' }} />
                <input className="form-control" placeholder="#c8a97e" maxLength={7} value={form.color_hex} style={{ fontFamily: 'monospace' }}
                       onChange={(e) => { const v = e.target.value.trim(); set('color_hex', v && !v.startsWith('#') ? `#${v}` : v); }} />
              </div>
            </div>
            <Field label={t('inventoryPage.materialType', 'Material')} value={form.material_type} onChange={(v) => set('material_type', v)} maxLength={100} />
            <Field label={t('inventoryPage.rackLocation', 'Rack location')} value={form.rack_location} onChange={(v) => set('rack_location', v)} maxLength={100} />
            <div className="at-field" style={{ gap: '4px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600 }}>{t('inventoryPage.supplier', 'Supplier')}</label>
              <select className="form-control" value={form.supplier || ''} onChange={(e) => set('supplier', e.target.value)}>
                <option value="">—</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <Field label={t('inventoryPage.gstPercent', 'GST %')} type="number" max={100} value={form.gst_percent} onChange={(v) => set('gst_percent', v)} />
          </div>
        </details>

        {error && <div style={errorBox}>{error}</div>}

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button type="button" className="btn-secondary" onClick={onClose}>{t('common.cancel', 'Cancel')}</button>
          <button type="button" className="btn-secondary" disabled={saving || uploading} onClick={() => save(true)}>
            {t('inventoryPage.saveAndStockAnother', 'Save & stock another')}
          </button>
          <button type="submit" className="btn-primary" disabled={saving || uploading}>
            {saving ? t('common.saving', 'Saving…') : t('common.save', 'Save')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
