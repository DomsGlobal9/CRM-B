import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowDownCircle, BarChart3, BookOpen, ClipboardList, History, MapPin, Package, Plus, Scissors, Search, Truck, X } from 'lucide-react';
import { api } from '../../services/api';
import { orderRef } from '../../services/format';
import { useLanguage } from '../../i18n/LanguageContext.jsx';
import { PageHeader, StatCard } from '../../components/ui/Atelier';
import { resolveMediaUrl } from '../../services/media';
import CatalogBrowser from './CatalogBrowser';
import ItemFormModal, { Field, Modal } from './ItemFormModal';
import LocationsTab from './LocationsTab';
import RecipesTab from './RecipesTab';
import ReportsTab from './ReportsTab';


// Movement types the UI offers, in the order an item actually travels.
// `field` names the number the form asks for, because "adjust" asks for a
// counted total while everything else asks for a quantity moved.
const MOVEMENTS = [
  { key: 'stock-in', label: 'Stock In', help: 'Goods received into the boutique.' },
  { key: 'reserve', label: 'Reserve', help: 'Spoken for by an order, still on the shelf.' },
  { key: 'release', label: 'Release', help: 'Cancel a reservation.' },
  { key: 'issue', label: 'Issue to production', help: 'Hand to the workroom. Leaves the shelf.' },
  // Consumption and waste were missing from this list while the Reports tab
  // counted exactly them: reports.consumption reads CONSUMPTION and loss_rates
  // derives waste_percent from CONSUMPTION + WASTE. Both endpoints existed and
  // took the same payload as their neighbours, so the two panels were correct
  // and correctly reported nothing, for ever.
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

// One themed inline error, so every form and the load failure report the same
// way instead of each hardcoding var(--danger-color) on a red tint.
const errorBox = {
  fontSize: 'var(--text-sm)',
  color: 'var(--danger-color)',
  background: 'var(--danger-bg)',
  border: '1px solid var(--danger-color)',
  padding: '10px 12px',
  borderRadius: 'var(--radius-md)',
};

// `restockItem` is a roll handed in from elsewhere (the order wizard found it
// out of stock): the stock-in modal opens on it straight away, and closing
// that modal -- done or not -- calls `onRestockDone` so the caller can take
// the user back to where they were.
export default function InventoryPanel({ currentUser, restockItem = null, onRestockDone }) {
  const { t } = useLanguage();
  const [tab, setTab] = useState('items');

  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState(null);
  const [options, setOptions] = useState({ categories: [], units: [], default_unit_by_category: {} });
  const [suppliers, setSuppliers] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [reorderOnly, setReorderOnly] = useState(false);

  const [movementItem, setMovementItem] = useState(restockItem);
  const [ledgerItem, setLedgerItem] = useState(null);
  const [ledger, setLedger] = useState([]);
  const [editingItem, setEditingItem] = useState(null);
  const [catalogVersion, setCatalogVersion] = useState(0);
  const [receivingPo, setReceivingPo] = useState(null);
  const [showSupplierForm, setShowSupplierForm] = useState(false);

  const isOwner = currentUser?.role === 'Owner';

  // "Stock this" on a catalogue row is the "New item" form with the row's
  // details already in it; the row's id rides along so saving links the two.
  const stockFromCatalog = (row) => setEditingItem({
    name: row.name,
    category: row.legacy_category,
    unit: row.default_unit,
    sub_category: row.section_full_name,
    catalog_item: row.id,
  });

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [list, sum, opts, sup, pos] = await Promise.all([
        api.getInventoryItems({
          search: search || undefined,
          category: category || undefined,
          needs_reorder: reorderOnly ? 'true' : undefined,
        }),
        api.getInventorySummary(),
        api.getInventoryOptions(),
        api.getSuppliers(),
        api.getPurchaseOrders(),
      ]);
      setItems(list);
      setSummary(sum);
      setOptions(opts);
      setSuppliers(sup);
      setPurchaseOrders(pos);
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
    try {
      setLedger(await api.getItemMovements(item.id));
    } catch (err) {
      setLedger([]);
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
                    sub={`${summary.item_count} ${t('inventoryPage.itemsTracked', 'items tracked')}`} />
          <StatCard icon={AlertTriangle} tone="amber" label={t('inventoryPage.outOfStock')} value={summary.out_of_stock_count}
                    sub="Need buying again" onClick={() => { setTab('items'); setReorderOnly(true); }} />
          <StatCard icon={ArrowDownCircle} tone="blue" label={t('inventoryPage.reorderDue')} value={summary.needs_reorder_count}
                    sub="Below the reorder mark" onClick={() => { setTab('items'); setReorderOnly(true); }} />
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
          { key: 'purchase', label: t('inventoryPage.purchaseOrders'), icon: Truck },
          { key: 'suppliers', label: t('inventoryPage.suppliers'), icon: ClipboardList },
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

      {!loadError && tab === 'purchase' && (
        <PurchaseTab
          purchaseOrders={purchaseOrders}
          suppliers={suppliers}
          items={items}
          isOwner={isOwner}
          onReceive={setReceivingPo}
          onCreated={refresh}
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
          {ledger.length === 0 ? (
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

      {receivingPo && (
        <ReceiveModal
          purchaseOrder={receivingPo}
          onClose={() => setReceivingPo(null)}
          onDone={() => { setReceivingPo(null); refresh(); }}
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

// The Materials tab in sections, so a roll of silk is not listed between a
// packet of hooks and a gift box. Keyed by InventoryItem.category; a category
// not named here (a new one, say) lands under Other rather than vanishing.
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
  // Which section is open. Purely a view of the rows already loaded: the
  // search, category and reorder filters keep working exactly as before,
  // this only decides which of their results are shown.
  const [groupKey, setGroupKey] = useState('all');
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
        <div style={{ ...panel, padding: '48px', textAlign: 'center', marginTop: '20px', color: 'var(--text-muted)' }}>{t('inventoryPage.loadingInventory', 'Loading inventory…')}</div>
      ) : shown.length === 0 ? (
        <div style={{ ...panel, padding: '48px', textAlign: 'center', marginTop: '20px', color: 'var(--text-muted)' }}>
          {t('inventoryPage.noMatchingItems', 'No items match these filters.')}
        </div>
      ) : (
        <div style={{ ...panel, marginTop: '20px', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '780px' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                <th style={{ padding: '14px 12px' }}>{t('inventoryPage.tableItem', 'Item')}</th>
                <th style={{ padding: '14px 12px' }}>{t('inventoryPage.tableCategory', 'Category')}</th>
                <th style={{ padding: '14px 12px', textAlign: 'right' }}>{t('inventoryPage.tableInStock', 'In stock')}</th>
                <th style={{ padding: '14px 12px', textAlign: 'right' }}>{t('inventoryPage.tableReserved', 'Reserved')}</th>
                <th style={{ padding: '14px 12px', textAlign: 'right' }}>{t('inventoryPage.tableAvailable', 'Available')}</th>
                <th style={{ padding: '14px 12px' }}>{t('inventoryPage.tableLocation', 'Location')}</th>
                <th style={{ padding: '14px 12px' }}></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((item) => (
                <tr key={item.id} style={{ borderTop: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '12px' }}>
                    <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {item.image_url && (
                        <img src={resolveMediaUrl(item.image_url)} alt="" loading="lazy"
                             style={{ width: 28, height: 28, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
                      )}
                      {item.name}
                      {item.needs_reorder && (
                        <span title="At or below reorder level" style={{ display: 'inline-flex', color: 'var(--warning-color)' }}>
                          <AlertTriangle size={13} />
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {item.item_code}{item.color ? ` · ${item.color}` : ''}
                    </div>
                  </td>
                  <td style={{ padding: '12px', color: 'var(--text-secondary)' }}>{categoryLabel[item.category] || item.category}</td>
                  <td style={{ padding: '12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{qty(item.current_stock)}</td>
                  <td style={{ padding: '12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)' }}>{qty(item.reserved_stock)}</td>
                  <td style={{
                    padding: '12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600,
                    color: Number(item.available_stock) <= 0 ? 'var(--danger-color)' : item.needs_reorder ? 'var(--warning-color)' : 'var(--text-primary)',
                  }}>
                    {qty(item.available_stock)} <span style={{ fontSize: '11px', fontWeight: 400, color: 'var(--text-muted)' }}>{item.unit_display}</span>
                  </td>
                  <td style={{ padding: '12px', color: 'var(--text-muted)' }}>{item.rack_location || '—'}</td>
                  <td style={{ padding: '12px', whiteSpace: 'nowrap', textAlign: 'right' }}>
                    <button type="button" className="btn-secondary" style={{ fontSize: '11px', padding: '4px 10px', marginRight: '6px' }} onClick={() => onMove(item)}>
                      <ArrowDownCircle size={12} style={{ marginRight: '4px', verticalAlign: 'middle' }} />{t('inventoryPage.move', 'Move')}
                    </button>
                    <button type="button" className="btn-secondary" style={{ fontSize: '11px', padding: '4px 10px', marginRight: '6px' }} onClick={() => onLedger(item)}>
                      <History size={12} style={{ marginRight: '4px', verticalAlign: 'middle' }} />{t('inventoryPage.history', 'History')}
                    </button>
                    {isOwner && (
                      <button type="button" className="btn-secondary" style={{ fontSize: '11px', padding: '4px 10px' }} onClick={() => onEdit(item)}>{t('inventoryPage.edit', 'Edit')}</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// Movements that take material off a shelf, and therefore need to say which.
const STOCK_OUT = new Set(['issue', 'consume', 'waste', 'damage', 'scrap', 'reserve', 'adjust']);
// Movements that belong to a particular garment. cost_per_order reads
// OrderMaterialLine and the consumption report groups by order, so a movement
// recorded without one is invisible to both.
const ORDER_LINKED = new Set(['issue', 'consume', 'waste', 'reserve', 'release', 'return']);

function MovementModal({ item, onClose, onDone }) {
  const [movement, setMovement] = useState('stock-in');
  const [amount, setAmount] = useState('');
  const [remarks, setRemarks] = useState('');
  const [stageKey, setStageKey] = useState('');
  const [orderId, setOrderId] = useState('');
  const [fromLocation, setFromLocation] = useState('');
  const [orders, setOrders] = useState([]);
  const [locations, setLocations] = useState([]);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const chosen = MOVEMENTS.find((m) => m.key === movement);

  // Both lists are best-effort: the modal has to keep working for a boutique
  // that tracks neither orders nor multiple locations.
  useEffect(() => {
    api.getOrders().then((rows) => setOrders(rows || [])).catch(() => setOrders([]));
    api.getItemLocations(item.id)
      .then((data) => setLocations(data?.breakdown || []))
      .catch(() => setLocations([]));
  }, [item.id]);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const payload = { remarks };
      payload[chosen.field || 'quantity'] = amount;
      if (movement === 'issue' && stageKey) payload.stage_key = stageKey;
      // The backend has always read both of these; the form simply never sent
      // them. Without order_id every movement was written with order=None, so
      // the cost-per-order and consumption reports had nothing to group by;
      // without from_location, record_movement substituted the default
      // location, so any stock-out failed once material had been transferred
      // to the workshop and Main Store held zero.
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
            type="number" step="0.001" min="0" required autoFocus
            className="form-control" value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>

        {ORDER_LINKED.has(movement) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600 }}>Against order (optional)</label>
            <select className="form-control" value={orderId} onChange={(e) => setOrderId(e.target.value)}>
              <option value="">Not tied to an order</option>
              {orders.map((o) => (
                <option key={o.id} value={o.id}>{orderRef(o)} · {o.customer_name}</option>
              ))}
            </select>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              Needed for the cost-per-order and consumption reports.
            </span>
          </div>
        )}

        {STOCK_OUT.has(movement) && locations.length > 0 && (
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
              type="text" className="form-control" placeholder="e.g. pattern_cutting"
              value={stageKey} onChange={(e) => setStageKey(e.target.value)}
            />
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '12px', fontWeight: 600 }}>Remarks</label>
          <input type="text" className="form-control" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
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

function PurchaseTab({ purchaseOrders, suppliers, items, isOwner, onReceive, onCreated }) {
  const { t } = useLanguage();
  const [creating, setCreating] = useState(false);
  return (
    <>
      {isOwner && (
        <div style={{ marginTop: '20px' }}>
          <button type="button" className="btn-secondary" onClick={() => setCreating(true)}>
            <Plus size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />{t('inventoryPage.newPurchaseOrder', 'New purchase order')}
          </button>
        </div>
      )}

      {purchaseOrders.length === 0 ? (
        <div style={{ ...panel, padding: '48px', textAlign: 'center', marginTop: '16px', color: 'var(--text-muted)' }}>
          {t('inventoryPage.noPurchaseOrdersYet', 'No purchase orders yet.')}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '16px' }}>
          {purchaseOrders.map((po) => {
            const outstanding = (po.lines || []).some((l) => Number(l.quantity_outstanding) > 0);
            return (
              <div key={po.id} style={{ ...panel, padding: '16px 18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{po.po_number} · {po.supplier_name}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      {po.status_display} · {(po.lines || []).length} line(s) · {money(po.total)}
                    </div>
                  </div>
                  {isOwner && outstanding && (
                    <button type="button" className="btn-secondary" style={{ fontSize: '12px' }} onClick={() => onReceive(po)}>
                      {t('inventoryPage.receiveGoods', 'Receive goods')}
                    </button>
                  )}
                </div>
                {(po.lines || []).length > 0 && (
                  <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    {po.lines.map((l) => (
                      <div key={l.id}>
                        {l.item_name} — ordered {qty(l.quantity_ordered)}, received {qty(l.quantity_received)}
                        {Number(l.quantity_outstanding) > 0 && (
                          <span style={{ color: 'var(--warning-color)' }}> ({qty(l.quantity_outstanding)} outstanding)</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {creating && (
        <CreatePurchaseOrderModal
          suppliers={suppliers}
          items={items}
          onClose={() => setCreating(false)}
          onSaved={() => { setCreating(false); onCreated(); }}
        />
      )}
    </>
  );
}

function CreatePurchaseOrderModal({ suppliers, items, onClose, onSaved }) {
  const [poNumber, setPoNumber] = useState(`PO-${Date.now().toString().slice(-6)}`);
  const [supplier, setSupplier] = useState(suppliers[0]?.id || '');
  const [lines, setLines] = useState([{ item: items[0]?.id || '', quantity_ordered: '', unit_cost: '' }]);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const setLine = (i, key, value) => setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, [key]: value } : l)));

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await api.createPurchaseOrder({
        po_number: poNumber,
        supplier,
        lines: lines
          .filter((l) => l.item && l.quantity_ordered)
          .map((l) => ({ item: l.item, quantity_ordered: l.quantity_ordered, unit_cost: l.unit_cost || 0 })),
      });
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="New purchase order" onClose={onClose} width="640px">
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div className="mobile-stack-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
          <Field label="PO number" required value={poNumber} onChange={setPoNumber} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600 }}>Supplier *</label>
            <select className="form-control" required value={supplier} onChange={(e) => setSupplier(e.target.value)}>
              <option value="">Select…</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <label style={{ fontSize: '12px', fontWeight: 600 }}>Lines</label>
          {lines.map((line, i) => (
            <div key={i} className="po-line-row" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: '8px', alignItems: 'center' }}>
              <select className="form-control" aria-label={`Item for line ${i + 1}`} value={line.item} onChange={(e) => setLine(i, 'item', e.target.value)}>
                <option value="">Select item…</option>
                {items.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}
              </select>
              <input type="number" step="0.001" min="0" className="form-control" placeholder="Qty"
                value={line.quantity_ordered} onChange={(e) => setLine(i, 'quantity_ordered', e.target.value)} />
              <input type="number" step="0.01" min="0" className="form-control" placeholder="Unit cost"
                value={line.unit_cost} onChange={(e) => setLine(i, 'unit_cost', e.target.value)} />
              <button type="button" className="close-btn" onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))} aria-label="Remove line">
                <X size={15} />
              </button>
            </div>
          ))}
          <button type="button" className="btn-secondary" style={{ fontSize: '12px', alignSelf: 'flex-start' }}
            onClick={() => setLines((ls) => [...ls, { item: '', quantity_ordered: '', unit_cost: '' }])}>
            Add line
          </button>
        </div>

        {error && <div style={errorBox}>{error}</div>}

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Create order'}</button>
        </div>
      </form>
    </Modal>
  );
}

function ReceiveModal({ purchaseOrder, onClose, onDone }) {
  const [quantities, setQuantities] = useState(() => {
    const initial = {};
    (purchaseOrder.lines || []).forEach((l) => { initial[l.id] = l.quantity_outstanding; });
    return initial;
  });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const lines = Object.entries(quantities)
        .filter(([, v]) => v && Number(v) > 0)
        .map(([line_id, quantity]) => ({ line_id, quantity }));
      if (lines.length === 0) throw new Error('Enter at least one received quantity.');
      await api.receivePurchaseOrder(purchaseOrder.id, lines);
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={`Receive goods · ${purchaseOrder.po_number}`} onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {(purchaseOrder.lines || []).map((line) => (
          <div key={line.id} style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: '12px', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600 }}>{line.item_name}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {qty(line.quantity_outstanding)} outstanding of {qty(line.quantity_ordered)}
              </div>
            </div>
            <input
              type="number" step="0.001" min="0" max={line.quantity_outstanding} className="form-control"
              aria-label={`Received quantity for ${line.item_name}`}
              value={quantities[line.id] ?? ''}
              onChange={(e) => setQuantities((q) => ({ ...q, [line.id]: e.target.value }))}
            />
          </div>
        ))}

        {error && (
          <div style={errorBox}>{error}</div>
        )}

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Receiving…' : 'Receive into stock'}</button>
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
    setError(null);
    setSaving(true);
    try {
      await api.createSupplier(form);
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
        <Field label="Name" required value={form.name} onChange={(v) => set('name', v)} />
        <Field label="Contact person" value={form.contact_person} onChange={(v) => set('contact_person', v)} />
        <div className="mobile-stack-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
          <Field label="Phone" value={form.phone} onChange={(v) => set('phone', v)} />
          <Field label="Email" type="email" value={form.email} onChange={(v) => set('email', v)} />
        </div>
        <Field label="GST number" value={form.gst_number} onChange={(v) => set('gst_number', v)} />
        {error && <div style={errorBox}>{error}</div>}
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save supplier'}</button>
        </div>
      </form>
    </Modal>
  );
}
