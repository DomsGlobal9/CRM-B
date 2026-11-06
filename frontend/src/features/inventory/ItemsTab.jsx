import { SearchBar } from '../../components/ui/SearchBar';
import { useState } from 'react';
import { AlertTriangle, ArrowDownCircle, Eye, History, Pencil, X } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext.jsx';
import { inventoryImage } from './inventoryImages';
import Loader from '../../components/ui/Loader';
import { panel, qty } from './inventoryShared';

/** The stock list: its filters, the item cards and the large photo. */

const MATERIAL_GROUPS = [
  { key: 'all', label: 'All', categories: null },
  { key: 'fabrics', label: 'Fabrics', categories: ['FABRIC', 'LINING'] },
  { key: 'accessories', label: 'Accessories & Trims', categories: ['BORDER', 'EMBELLISHMENT', 'STITCHING', 'MAGGAM'] },
  // Hidden, not removed: packaging items are counted under Other instead.
  { key: 'packaging', label: 'Packaging', categories: ['PACKAGING'], hidden: true },
  { key: 'other', label: 'Other', categories: ['DESIGN', 'OTHER'] },
];

const NAMED_CATEGORIES = new Set(MATERIAL_GROUPS.filter((g) => !g.hidden).flatMap((g) => g.categories || []));

const inGroup = (item, group) => (
  group.categories === null
    ? true
    : group.key === 'other'
      ? group.categories.includes(item.category) || !NAMED_CATEGORIES.has(item.category)
      : group.categories.includes(item.category)
);

export default function ItemsTab({
  items, loading, search, setSearch, category, setCategory, reorderOnly, setReorderOnly,
  categories, categoryLabel, isOwner, onMove, onLedger, onEdit,
}) {
  const { t } = useLanguage();
  
  const [groupKey, setGroupKey] = useState('all');
  const [previewItem, setPreviewItem] = useState(null);
  const group = MATERIAL_GROUPS.find((g) => g.key === groupKey) || MATERIAL_GROUPS[0];
  const shown = items.filter((item) => inGroup(item, group));
  const groupCategories = group.categories === null
    ? categories
    : categories.filter((c) => inGroup({ category: c.value }, group));
  return (
    <>
      <div style={{ display: 'flex', gap: '8px', marginTop: '20px', flexWrap: 'wrap' }}>
        {MATERIAL_GROUPS.filter((g) => !g.hidden).map((g) => {
          const count = items.filter((item) => inGroup(item, g)).length;
          const active = g.key === groupKey;
          return (
            <button key={g.key} type="button"
                    className={active ? 'btn-primary' : 'btn-secondary'}
                    style={{ padding: '6px 14px', fontSize: '12.5px', borderRadius: '20px', fontWeight: 600 }}
                    onClick={() => {
                      setGroupKey(g.key);
                      // A category picked under one section means nothing under another.
                      if (category && !inGroup({ category }, g)) setCategory('');
                    }}>
              {g.label}{count > 0 && <span style={{ opacity: 0.7, marginLeft: '6px' }}>{count}</span>}
            </button>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: '12px', marginTop: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
        <SearchBar value={search} onChange={setSearch} placeholder={t('inventoryPage.searchPlaceholder', 'Search items…')} style={{ flex: '1 1 220px', maxWidth: 'none' }} />
        <select className="form-control" style={{ maxWidth: '200px' }} value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">{t('inventoryPage.allCategories', 'All categories')}</option>
          {groupCategories.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
          <input type="checkbox" checked={reorderOnly} onChange={(e) => setReorderOnly(e.target.checked)} />
          {t('inventoryPage.reorderDueOnly', 'Reorder due only')}
        </label>
      </div>

      {loading && items.length === 0 ? (
        <div style={{ ...panel, marginTop: '20px' }}><Loader page label={t('inventoryPage.loadingInventory', 'Loading inventory…')} /></div>
      ) : shown.length === 0 ? (
        <div style={{ ...panel, padding: '48px', textAlign: 'center', marginTop: '20px', color: 'var(--text-muted)' }}>
          {t('inventoryPage.noMatchingItems', 'No items match these filters.')}
        </div>
      ) : (
        <div className="inv-grid" style={{ marginTop: '20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '20px' }}>
          {shown.map((item) => {
            const availableColor = Number(item.available_stock) <= 0 ? 'var(--danger-color)' : item.needs_reorder ? 'var(--warning-text)' : 'var(--text-muted)';
            const pill = {
              position: 'absolute', top: 10, padding: '4px 10px', borderRadius: 6, fontSize: '10px', fontWeight: 700,
              letterSpacing: '0.06em', textTransform: 'uppercase', background: '#1a1a1a', color: '#fff', maxWidth: '55%',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            };
            const circleBtn = {
              width: 32, height: 32, borderRadius: '50%', border: '1px solid rgba(0,0,0,0.08)', background: 'rgba(255,255,255,0.95)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-secondary)', padding: 0,
            };
            return (
              <div key={item.id} className="inv-card" style={{ ...panel, overflow: 'hidden', display: 'flex', flexDirection: 'column', borderRadius: 12 }}>
                <div style={{ position: 'relative', aspectRatio: '4 / 5', background: 'var(--surface-inset, #f3f2ee)' }}>
                  <img src={inventoryImage(item)} alt="" loading="lazy"
                       style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                  <span className="inv-card-pill inv-card-pill--left" style={{ ...pill, left: 10 }} title={item.item_code}>{item.item_code}</span>
                  <span className="inv-card-pill inv-card-pill--right" style={{ ...pill, right: 10 }} title={categoryLabel[item.category] || item.category}>{categoryLabel[item.category] || item.category}</span>
                  <div className="inv-card-actions" style={{ position: 'absolute', right: 10, bottom: 10, display: 'flex', gap: 6 }}>
                    <button type="button" style={circleBtn} title={t('inventoryPage.view', 'View')} aria-label={t('inventoryPage.view', 'View')} onClick={() => setPreviewItem(item)}>
                      <Eye size={14} />
                    </button>
                    <button type="button" style={circleBtn} title={t('inventoryPage.history', 'History')} aria-label={t('inventoryPage.history', 'History')} onClick={() => onLedger(item)}>
                      <History size={14} />
                    </button>
                    {isOwner && (
                      <button type="button" style={circleBtn} title={t('inventoryPage.edit', 'Edit')} aria-label={t('inventoryPage.edit', 'Edit')} onClick={() => onEdit(item)}>
                        <Pencil size={14} />
                      </button>
                    )}
                  </div>
                </div>
                <div className="inv-card-body" style={{ padding: '14px 14px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div className="inv-card-name" style={{ fontWeight: 700, fontSize: '15px', display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.name}
                    {item.needs_reorder && (
                      <span title="At or below reorder level" style={{ display: 'inline-flex', color: 'var(--warning-text)', flexShrink: 0 }}>
                        <AlertTriangle size={13} />
                      </span>
                    )}
                  </div>
                  <div className="inv-card-meta" style={{ fontSize: '11.5px', color: availableColor, fontVariantNumeric: 'tabular-nums', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <b>{qty(item.available_stock)}</b> {item.unit_display} {t('inventoryPage.tableAvailable', 'Available').toLowerCase()}
                    {item.color ? ` · ${item.color}` : ''}
                    {item.rack_location ? ` · ${item.rack_location}` : ''}
                  </div>
                  <div className="inv-card-meta" style={{ fontSize: '11px', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                    {qty(item.current_stock)} {t('inventoryPage.tableInStock', 'In stock').toLowerCase()} · {qty(item.reserved_stock)} {t('inventoryPage.tableReserved', 'Reserved').toLowerCase()}
                  </div>
                  {onMove && <button type="button" className="inv-card-btn" onClick={() => onMove(item)} style={{
                    marginTop: 10, width: '100%', padding: '11px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
                    background: 'var(--primary-color)', color: 'var(--primary-foreground)', fontSize: '12px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}>
                    <ArrowDownCircle size={14} />{t('inventoryPage.move', 'Move')}
                  </button>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {previewItem && (
        <div onClick={() => setPreviewItem(null)} style={{
          position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,0.88)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
        }}>
          <figure onClick={(e) => e.stopPropagation()} style={{
            margin: 0, position: 'relative', display: 'flex', flexDirection: 'column', maxWidth: '92vw', maxHeight: '90vh',
            background: '#111', borderRadius: 14, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          }}>
            <button type="button" aria-label="Close" onClick={() => setPreviewItem(null)} style={{
              position: 'absolute', top: 12, right: 12, zIndex: 1, width: 36, height: 36, borderRadius: '50%', border: 'none',
              background: 'rgba(0,0,0,0.55)', color: '#fff', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <X size={18} />
            </button>
            <img src={inventoryImage(previewItem)} alt={previewItem.name}
                 style={{ display: 'block', maxWidth: '92vw', maxHeight: 'calc(90vh - 72px)', objectFit: 'contain' }} />
            <figcaption style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ background: '#fff', color: '#111', borderRadius: 999, padding: '6px 14px', fontSize: '15px', fontWeight: 700, lineHeight: 1.2 }}>
                {previewItem.name}
              </span>
              <span style={{ background: '#fff', color: '#333', borderRadius: 999, padding: '6px 14px', fontSize: '12px', fontWeight: 600, letterSpacing: '0.05em', lineHeight: 1.2 }}>
                {previewItem.item_code}{previewItem.color ? ` · ${previewItem.color}` : ''}
              </span>
            </figcaption>
          </figure>
        </div>
      )}
    </>
  );
}
