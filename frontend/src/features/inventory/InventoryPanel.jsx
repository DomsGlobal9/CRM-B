import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowDownCircle, BarChart3, BookOpen, ClipboardList, Eye, History, MapPin, Package, Pencil, Plus, Scissors, Search, ShoppingCart, X } from 'lucide-react';
import { api } from '../../services/api';
import { orderRef } from '../../services/format';
import { useLanguage } from '../../i18n/LanguageContext.jsx';
import { PageHeader, StatCard } from '../../components/ui/Atelier';
import { inventoryImage } from '../../services/inventoryImages';
import {
  LIMITS, cleanAmount, amountError, phoneError, emailError, cleanUpper, isGstin,
} from '../../services/validate';
import CatalogBrowser from './CatalogBrowser';
import ItemFormModal, { Field, Modal } from './ItemFormModal';
import StockItemSheet from './StockItemSheet';
import LocationsTab from './LocationsTab';
import RecipesTab from './RecipesTab';
import ReportsTab from './ReportsTab';
import OrderPurchasesTab from './OrderPurchasesTab';
import Loader from '../../components/ui/Loader';

const MOVEMENTS = [
  { key: 'stock-in', label: 'Stock In', help: 'Goods received into the boutique.' },
  { key: 'reserve', label: 'Reserve', help: 'Spoken for by an order, still on the shelf.' },
  { key: 'release', label: 'Release', help: 'Cancel a reservation.' },
  { key: 'issue', label: 'Issue to production', help: 'Hand to the workroom. Leaves the shelf.' },
  { key: 'consume', label: 'Consume', help: 'Actually used up on a garment.' },
  { key: 'waste', label: 'Waste', help: 'Offcuts and loss during production.' },
  { key: 'return', label: 'Return', help: 'Unused material back from the workroom.' },
  { key: 'damage', label: 'Damage', help: 'Written off as damaged.' },
  { key: 'scrap', label: 'Scrap', help: 'Written off as scrap.' },
  { key: 'adjust', label: 'Stock count', help: 'Correct the book figure to a counted one.', field: 'counted_quantity' },
];

const MOVEMENT_TONE = {
  PURCHASE: 'var(--success-color)', STOCK_IN: 'var(--success-color)', RETURN: 'var(--success-color)',
  ISSUE: 'var(--warning-color)', CONSUMPTION: 'var(--warning-color)',
  RESERVATION: 'var(--info-color)', RELEASE: 'var(--info-color)',
  DAMAGE: 'var(--danger-color)', SCRAP: 'var(--danger-color)',
  ADJUSTMENT: '#7a4fb0', TRANSFER: 'var(--text-muted)',
};

const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const qty = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 });

const panel = {
  background: 'var(--surface-color)',
  border: '1px solid var(--border-color)',
  borderRadius: 'var(--radius-lg)',
  boxShadow: 'var(--shadow-sm)',
};

const errorBox = {
  fontSize: 'var(--text-sm)',
  color: 'var(--danger-color)',
  background: 'var(--danger-bg)',
  border: '1px solid var(--danger-color)',
  padding: '10px 12px',
  borderRadius: 'var(--radius-md)',
};

export default function InventoryPanel({ currentUser, restockItem = null, onRestockDone }) {
  const { t } = useLanguage();
  const [tab, setTab] = useState('items');

  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState(null);
  const [options, setOptions] = useState({ categories: [], units: [], default_unit_by_category: {} });
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [reorderOnly, setReorderOnly] = useState(false);

  const [movementItem, setMovementItem] = useState(restockItem);
  const [ledgerItem, setLedgerItem] = useState(null);
  const [ledger, setLedger] = useState([]);
  // The history dialog opened on an empty list, which the render below reads
  // as "no movements recorded yet" -- so an item WITH a history announced it
  // had none for as long as the request took. Loading is its own state.
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  
  const [stocking, setStocking] = useState(null);
  const [catalogVersion, setCatalogVersion] = useState(0);
  const [showSupplierForm, setShowSupplierForm] = useState(false);

  const isOwner = currentUser?.role === 'Owner';

  // "Stock this" on a catalogue row opens the full item form pre-filled.
  const stockFromCatalog = (row) => setEditingItem({
    name: row.name,
    catalog_item: row.id,
    sub_category: row.section_full_name,
    category: row.legacy_category || 'FABRIC',
    unit: row.default_unit || '',
  });

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [list, sum, opts, sup] = await Promise.all([
        api.getInventoryItems({
          search: search || undefined,
          category: category || undefined,
          needs_reorder: reorderOnly ? 'true' : undefined,
        }),
        api.getInventorySummary(),
        api.getInventoryOptions(),
        api.getSuppliers(),
      ]);
      setItems(list);
      setSummary(sum);
      setOptions(opts);
      setSuppliers(sup);
    } catch (err) {
      console.error('Inventory load failed', err);
      setLoadError(err.message || 'Could not load inventory.');
    } finally {
      setLoading(false);
    }
  }, [search, category, reorderOnly]);

  useEffect(() => {
    const t = setTimeout(refresh, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [refresh, search]);

  const openLedger = async (item) => {
    setLedgerItem(item);
    setLedger([]);
    setLedgerLoading(true);
    try {
      setLedger(await api.getItemMovements(item.id));
    } catch (err) {
      setLedger([]);
    } finally {
      setLedgerLoading(false);
    }
  };

  const categoryLabel = useMemo(() => {
    const map = {};
    options.categories.forEach((c) => { map[c.value] = c.label; });
    return map;
  }, [options.categories]);

  return (
    <>
      <PageHeader
        title={t('inventoryPage.title')}
        subtitle={t('inventoryPage.subtitle')}
        actions={isOwner && (
          <button type="button" className="btn-primary" style={{ padding: '10px 18px' }} onClick={() => setEditingItem({})}>
            <Plus size={16} />
            {t('inventoryPage.newItem')}
          </button>
        )}
      />

      {summary && (
        <div className="at-stat-grid">
          <StatCard icon={Package} tone="green" label={t('inventoryPage.stockValue')} value={money(summary.inventory_value)}
                    sub={`${summary.item_count} ${summary.item_count === 1 ? t('inventoryPage.itemsTrackedOne', 'item in stock') : t('inventoryPage.itemsTracked', 'items in stock')}`} />
          <StatCard icon={AlertTriangle} tone="amber" label={t('inventoryPage.outOfStock')} value={summary.out_of_stock_count}
                    sub={t('inventoryPage.outOfStockSub', 'To reorder')} onClick={() => { setTab('items'); setReorderOnly(true); }} />
          <StatCard icon={ArrowDownCircle} tone="blue" label={t('inventoryPage.reorderDue')} value={summary.needs_reorder_count}
                    sub={t('inventoryPage.reorderDueSub', 'Below reorder level')} onClick={() => { setTab('items'); setReorderOnly(true); }} />
          <StatCard icon={History} tone="rose" label={t('inventoryPage.deadStock')} value={summary.dead_stock_count}
                    sub={t('inventoryPage.noMovement90Days', 'No movement in 90 days')} onClick={() => setTab('reports')} />
        </div>
      )}

      {/* Tab strip, not pill buttons: these switch a view, so an underline on
          the active one reads as navigation rather than seven call-to-actions. */}
      <div style={{ display: 'flex', gap: 'var(--space-1)', marginTop: 'var(--space-5)', borderBottom: '1px solid var(--border-color)', flexWrap: 'wrap' }}>
        {[
          { key: 'items', label: t('inventoryPage.items'), icon: Package },
          { key: 'catalog', label: t('inventoryPage.catalog'), icon: BookOpen },
          { key: 'locations', label: t('inventoryPage.locations'), icon: MapPin },
          { key: 'recipes', label: t('inventoryPage.recipes'), icon: Scissors },
          { key: 'suppliers', label: t('inventoryPage.suppliers'), icon: ClipboardList },
          { key: 'purchases', label: t('inventoryPage.orderPurchases', 'Purchase list'), icon: ShoppingCart },
          { key: 'reports', label: t('inventoryPage.reports'), icon: BarChart3 },
        ].map(({ key, label, icon: Icon }) => {
          const active = tab === key;
          return (
            <button
              key={key}
              type="button"
              aria-current={active ? 'page' : undefined}
              onClick={() => setTab(key)}
              style={{
                padding: '10px 14px', marginBottom: '-1px',
                fontSize: 'var(--text-base)', fontWeight: active ? 'var(--weight-semibold)' : 'var(--weight-medium)',
                background: 'none', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '6px',
                color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                borderBottom: `2px solid ${active ? 'var(--primary-color)' : 'transparent'}`,
              }}
            >
              <Icon size={15} /> {label}
            </button>
          );
        })}
      </div>


      {loadError && (
        <div style={{ ...panel, padding: '32px', textAlign: 'center', marginTop: '20px', borderColor: 'var(--danger-color)' }}>
          <div style={{ color: 'var(--danger-color)', marginBottom: '12px' }}>{loadError}</div>
          <button type="button" className="btn-secondary" onClick={refresh}>Retry</button>
        </div>
      )}

      {!loadError && tab === 'items' && (
        <ItemsTab
          items={items}
          loading={loading}
          search={search}
          setSearch={setSearch}
          category={category}
          setCategory={setCategory}
          reorderOnly={reorderOnly}
          setReorderOnly={setReorderOnly}
          categories={options.categories}
          categoryLabel={categoryLabel}
          isOwner={isOwner}
          onMove={setMovementItem}
          onLedger={openLedger}
          onEdit={setEditingItem}
        />
      )}

      {!loadError && tab === 'suppliers' && (
        <SuppliersTab suppliers={suppliers} isOwner={isOwner} onAdd={() => setShowSupplierForm(true)} />
      )}

      {!loadError && tab === 'catalog' && (
        <CatalogBrowser isOwner={isOwner} onStock={stockFromCatalog} version={catalogVersion} />
      )}

      {!loadError && tab === 'locations' && (
        <LocationsTab items={items} isOwner={isOwner} onMoved={refresh} />
      )}

      {!loadError && tab === 'recipes' && (
        <RecipesTab items={items} isOwner={isOwner} />
      )}

      {!loadError && tab === 'purchases' && <OrderPurchasesTab suppliers={suppliers} isOwner={isOwner} />}

      {!loadError && tab === 'reports' && <ReportsTab />}

      {movementItem && (
        <MovementModal
          item={movementItem}
          onClose={() => { setMovementItem(null); if (restockItem) onRestockDone?.(false); }}
          onDone={() => { setMovementItem(null); refresh(); if (restockItem) onRestockDone?.(true); }}
        />
      )}

      {ledgerItem && (
        <Modal title={`Stock history · ${ledgerItem.name}`} onClose={() => setLedgerItem(null)} width="720px">
          {ledgerLoading ? (
            <Loader modal label="Loading stock history…" />
          ) : ledger.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No movements recorded yet.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', minWidth: '560px' }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '6px 10px 6px 0' }}>When</th>
                    <th style={{ padding: '6px 10px 6px 0' }}>Movement</th>
                    <th style={{ padding: '6px 10px 6px 0', textAlign: 'right' }}>Qty</th>
                    <th style={{ padding: '6px 10px 6px 0', textAlign: 'right' }}>Balance</th>
                    <th style={{ padding: '6px 0' }}>By</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.map((m) => (
                    <tr key={m.id} style={{ borderTop: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '8px 10px 8px 0', whiteSpace: 'nowrap' }}>
                        {new Date(m.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                      </td>
                      <td style={{ padding: '8px 10px 8px 0' }}>
                        <span style={{ color: MOVEMENT_TONE[m.movement_type] || 'var(--text-primary)', fontWeight: 600 }}>
                          {m.movement_type_display}
                        </span>
                        {m.order_reference && (
                          <span style={{ color: 'var(--text-muted)' }}> · {m.order_reference}</span>
                        )}
                      </td>
                      <td style={{ padding: '8px 10px 8px 0', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{qty(m.quantity)}</td>
                      <td style={{ padding: '8px 10px 8px 0', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {qty(m.previous_stock)} → <strong>{qty(m.new_stock)}</strong>
                      </td>
                      <td style={{ padding: '8px 0', color: 'var(--text-muted)' }}>{m.user_name_snapshot || 'System'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Modal>
      )}

      {editingItem && (
        <ItemFormModal
          item={editingItem}
          options={options}
          suppliers={suppliers}
          onClose={() => setEditingItem(null)}
          onSaved={() => { setEditingItem(null); setCatalogVersion((v) => v + 1); refresh(); }}
        />
      )}

      {stocking && (
        <StockItemSheet
          catalogItem={stocking.catalogItem}
          options={options}
          suppliers={suppliers}
          onClose={() => setStocking(null)}
          onSaved={(another) => { if (!another) setStocking(null); setCatalogVersion((v) => v + 1); refresh(); }}
        />
      )}

      {showSupplierForm && (
        <SupplierFormModal
          onClose={() => setShowSupplierForm(false)}
          onSaved={() => { setShowSupplierForm(false); refresh(); }}
        />
      )}
    </>
  );
}


const MATERIAL_GROUPS = [
  { key: 'all', label: 'All', categories: null },
  { key: 'fabrics', label: 'Fabrics', categories: ['FABRIC', 'LINING'] },
  { key: 'accessories', label: 'Accessories & Trims', categories: ['BORDER', 'EMBELLISHMENT', 'STITCHING', 'MAGGAM'] },
  { key: 'packaging', label: 'Packaging', categories: ['PACKAGING'] },
  { key: 'other', label: 'Other', categories: ['DESIGN', 'OTHER'] },
];
const NAMED_CATEGORIES = new Set(MATERIAL_GROUPS.flatMap((g) => g.categories || []));
const inGroup = (item, group) => (
  group.categories === null
    ? true
    : group.key === 'other'
      ? group.categories.includes(item.category) || !NAMED_CATEGORIES.has(item.category)
      : group.categories.includes(item.category)
);

function ItemsTab({
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
        {MATERIAL_GROUPS.map((g) => {
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
        <div className="search-input-wrapper" style={{ margin: 0, flex: '1 1 220px' }}>
          <Search size={18} />
          <input
            type="text"
            className="form-control"
            placeholder={t('inventoryPage.searchPlaceholder', 'Search items…')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
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
        <div style={{ marginTop: '20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '20px' }}>
          {shown.map((item) => {
            const availableColor = Number(item.available_stock) <= 0 ? 'var(--danger-color)' : item.needs_reorder ? 'var(--warning-color)' : 'var(--text-muted)';
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
              <div key={item.id} style={{ ...panel, overflow: 'hidden', display: 'flex', flexDirection: 'column', borderRadius: 12 }}>
                <div style={{ position: 'relative', aspectRatio: '4 / 5', background: 'var(--surface-inset, #f3f2ee)' }}>
                  <img src={inventoryImage(item)} alt="" loading="lazy"
                       style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                  <span style={{ ...pill, left: 10 }} title={item.item_code}>{item.item_code}</span>
                  <span style={{ ...pill, right: 10 }} title={categoryLabel[item.category] || item.category}>{categoryLabel[item.category] || item.category}</span>
                  <div style={{ position: 'absolute', right: 10, bottom: 10, display: 'flex', gap: 6 }}>
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
                <div style={{ padding: '14px 14px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ fontWeight: 700, fontSize: '15px', display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.name}
                    {item.needs_reorder && (
                      <span title="At or below reorder level" style={{ display: 'inline-flex', color: 'var(--warning-color)', flexShrink: 0 }}>
                        <AlertTriangle size={13} />
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '11.5px', color: availableColor, fontVariantNumeric: 'tabular-nums', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <b>{qty(item.available_stock)}</b> {item.unit_display} {t('inventoryPage.tableAvailable', 'Available').toLowerCase()}
                    {item.color ? ` · ${item.color}` : ''}
                    {item.rack_location ? ` · ${item.rack_location}` : ''}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                    {qty(item.current_stock)} {t('inventoryPage.tableInStock', 'In stock').toLowerCase()} · {qty(item.reserved_stock)} {t('inventoryPage.tableReserved', 'Reserved').toLowerCase()}
                  </div>
                  <button type="button" onClick={() => onMove(item)} style={{
                    marginTop: 10, width: '100%', padding: '11px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
                    background: '#1a1a1a', color: '#fff', fontSize: '12px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}>
                    <ArrowDownCircle size={14} />{t('inventoryPage.move', 'Move')}
                  </button>
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

const STOCK_OUT = new Set(['issue', 'consume', 'waste', 'damage', 'scrap', 'reserve', 'adjust']);

const ORDER_LINKED = new Set(['issue', 'consume', 'waste', 'reserve', 'release', 'return']);

function MovementModal({ item, onClose, onDone }) {
  const [movement, setMovement] = useState('stock-in');
  const [amount, setAmount] = useState('');
  const [remarks, setRemarks] = useState('');
  const [stageKey, setStageKey] = useState('');
  const [orderId, setOrderId] = useState('');
  const [fromLocation, setFromLocation] = useState('');
  const [orders, setOrders] = useState([]);
  // idle -> loading -> ready. A separate flag rather than "orders is empty",
  // so a boutique with no orders is not mistaken for a request still running.
  const [ordersState, setOrdersState] = useState('idle');
  const [locations, setLocations] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const chosen = MOVEMENTS.find((m) => m.key === movement);
  const wantsOrder = ORDER_LINKED.has(movement);

  useEffect(() => {
    setLocations(null);
    api.getItemLocations(item.id)
      .then((data) => setLocations(data?.breakdown || []))
      .catch(() => setLocations([]));
  }, [item.id]);

  // The order list is the heaviest list in the app and the select that uses it
  // is hidden unless the movement is tied to an order -- and the default
  // movement is not. So it is fetched the first time it is actually needed
  // rather than on every open of this dialog, and once per dialog: `orders`
  // stays non-null afterwards, so switching movement back and forth does not
  // re-request it.
  useEffect(() => {
    if (!wantsOrder || ordersState !== 'idle') return;
    setOrdersState('loading');
    api.getOrders()
      .then((rows) => { setOrders(rows || []); setOrdersState('ready'); })
      .catch(() => setOrdersState('ready'));
  }, [wantsOrder, ordersState]);

  const submit = async (e) => {
    e.preventDefault();
    
    const problem = amountError(amount, { label: 'Quantity', max: LIMITS.quantity, required: true, allowZero: movement === 'adjust' });
    if (problem) { setError(problem); return; }
    setError(null);
    setSaving(true);
    try {
      const payload = { remarks };
      payload[chosen.field || 'quantity'] = amount;
      if (movement === 'issue' && stageKey) payload.stage_key = stageKey;
    
      if (orderId && ORDER_LINKED.has(movement)) payload.order_id = orderId;
      if (fromLocation && STOCK_OUT.has(movement)) payload.from_location = fromLocation;
      await api.moveStock(item.id, movement, payload);
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={`Stock movement · ${item.name}`} onClose={onClose}>
      <div style={{ display: 'flex', gap: '18px', marginBottom: '16px', fontSize: '13px', flexWrap: 'wrap' }}>
        <span>In stock <strong>{qty(item.current_stock)}</strong></span>
        <span style={{ color: 'var(--text-muted)' }}>Reserved <strong>{qty(item.reserved_stock)}</strong></span>
        <span>Available <strong>{qty(item.available_stock)} {item.unit_display}</strong></span>
      </div>

      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '12px', fontWeight: 600 }}>Movement</label>
          <select className="form-control" value={movement} onChange={(e) => { setMovement(e.target.value); setError(null); }}>
            {MOVEMENTS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{chosen.help}</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '12px', fontWeight: 600 }}>
            {movement === 'adjust' ? `Counted total (${item.unit_display})` : `Quantity (${item.unit_display})`}
          </label>
          <input
            inputMode="decimal" required autoFocus
            className="form-control" value={amount}
            onChange={(e) => setAmount(cleanAmount(e.target.value, { max: LIMITS.quantity, decimals: 3 }))}
          />
        </div>

        {wantsOrder && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600 }}>Against order (optional)</label>
            <select className="form-control" value={orderId} onChange={(e) => setOrderId(e.target.value)}>
              <option value="">Not tied to an order</option>
              {orders.map((o) => (
                <option key={o.id} value={o.id}>{orderRef(o)} · {o.customer_name}</option>
              ))}
            </select>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              {ordersState === 'ready'
                ? 'Needed for the cost-per-order and consumption reports.'
                : <Loader inline label="Loading orders…" />}
            </span>
          </div>
        )}

        {STOCK_OUT.has(movement) && (locations || []).length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600 }}>From location</label>
            <select className="form-control" value={fromLocation} onChange={(e) => setFromLocation(e.target.value)}>
              <option value="">Default location</option>
              {locations.map((row) => (
                <option key={row.location_id} value={row.location_id}>
                  {row.location} · {qty(row.quantity)} {item.unit_display}
                </option>
              ))}
            </select>
          </div>
        )}

        {movement === 'issue' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600 }}>Production stage (optional)</label>
            <input
              type="text" className="form-control" placeholder="e.g. pattern_cutting" maxLength={100}
              value={stageKey} onChange={(e) => setStageKey(e.target.value)}
            />
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '12px', fontWeight: 600 }}>Remarks</label>
          <input type="text" className="form-control" maxLength={LIMITS.note} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
        </div>

        {error && (
          <div style={errorBox}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Recording…' : 'Record movement'}</button>
        </div>
      </form>
    </Modal>
  );
}

function SuppliersTab({ suppliers, isOwner, onAdd }) {
  const { t } = useLanguage();
  return (
    <>
      {isOwner && (
        <div style={{ marginTop: '20px' }}>
          <button type="button" className="btn-secondary" onClick={onAdd}>
            <Plus size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />{t('inventoryPage.newSupplier', 'New supplier')}
          </button>
        </div>
      )}
      {suppliers.length === 0 ? (
        <div style={{ ...panel, padding: '48px', textAlign: 'center', marginTop: '16px', color: 'var(--text-muted)' }}>
          {t('inventoryPage.noSuppliersYet', 'No suppliers yet.')}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '12px', marginTop: '16px' }}>
          {suppliers.map((s) => (
            <div key={s.id} style={{ ...panel, padding: '16px' }}>
              <div style={{ fontWeight: 600 }}>{s.name}</div>
              {s.contact_person && <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{s.contact_person}</div>}
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>
                {s.phone && <div>📞 {s.phone}</div>}
                {s.email && <div>✉️ {s.email}</div>}
                {s.gst_number && <div>GST {s.gst_number}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function SupplierFormModal({ onClose, onSaved }) {
  const [form, setForm] = useState({ name: '', contact_person: '', phone: '', email: '', gst_number: '' });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    const problem = (!form.name.trim() ? 'Enter the supplier name.' : '')
      || phoneError(form.phone)
      || emailError(form.email)
      || (form.gst_number && !isGstin(form.gst_number) ? 'Enter a 15-character GSTIN like 29ABCDE1234F1Z5.' : '');
    if (problem) { setError(problem); return; }
    setError(null);
    setSaving(true);
    try {
      await api.createSupplier({ ...form, name: form.name.trim(), contact_person: form.contact_person.trim() });
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="New supplier" onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <Field label="Name" required value={form.name} onChange={(v) => set('name', v)} maxLength={150} />
        <Field label="Contact person" value={form.contact_person} onChange={(v) => set('contact_person', v)} maxLength={150} />
        <div className="mobile-stack-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
          {/* A supplier's phone is often a landline or an office board, so no mobile rule. */}
          <Field label="Phone" type="tel" inputMode="tel" placeholder="044-2345 6789" value={form.phone} onChange={(v) => set('phone', v)} maxLength={30} />
          <Field label="Email" type="email" value={form.email} onChange={(v) => set('email', v)} maxLength={LIMITS.email} />
        </div>
        <Field label="GST number" placeholder="29ABCDE1234F1Z5" value={form.gst_number} onChange={(v) => set('gst_number', cleanUpper(v).slice(0, 15))} />
        {error && <div style={errorBox}>{error}</div>}
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save supplier'}</button>
        </div>
      </form>
    </Modal>
  );
}
