import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowDownCircle, BarChart3, BookOpen, ClipboardList, Factory, History, Layers, MapPin, Package, Plus, Scissors, ShoppingCart } from 'lucide-react';
import { api } from '../../api';
import { useLanguage } from '../../i18n/LanguageContext.jsx';
import { PageHeader, StatCard, Tabs } from '../../components/ui/Atelier';
import CatalogBrowser from './CatalogBrowser';
import ItemFormModal from './ItemFormModal';
import { Modal } from './inventoryForm';
import StockItemSheet from './StockItemSheet';
import LocationsTab from './LocationsTab';
import RecipesTab from './RecipesTab';
import ReportsTab from './ReportsTab';
import OrderPurchasesTab from './OrderPurchasesTab';
import InHouseTab from './InHouseTab';
import ShelvesTab from './shelves/ShelvesTab';
import { NotShelvedReminder } from './shelves/ShelfPlace';
import Loader from '../../components/ui/Loader';
import { Crumbs } from '../../components/ui/Breadcrumbs';
import { DataTable } from '../../components/ui/DataTable';
import ItemsTab from './ItemsTab';
import MovementModal from './MovementModal';
import { SupplierFormModal, SuppliersTab } from './Suppliers';
import { panel, qty, money } from './inventoryShared';
import { SHELVES_LOCATION_KEY, SHELVES_VIEW_KEY } from '../../constants/storageKeys';

const MOVEMENT_TONE = {
  PURCHASE: 'var(--success-text)', STOCK_IN: 'var(--success-text)', RETURN: 'var(--success-text)',
  ISSUE: 'var(--warning-text)', CONSUMPTION: 'var(--warning-text)',
  RESERVATION: 'var(--info-color)', RELEASE: 'var(--info-color)',
  DAMAGE: 'var(--danger-color)', SCRAP: 'var(--danger-color)',
  ADJUSTMENT: 'var(--info-500)', TRANSFER: 'var(--text-muted)',
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
  
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  
  const [stocking, setStocking] = useState(null);
  const [catalogVersion, setCatalogVersion] = useState(0);
  const [showSupplierForm, setShowSupplierForm] = useState(false);

  const isOwner = currentUser?.role === 'Owner';
  // The owner, or a role the owner handed this inventory task
  // (core/admin_access.py). The server enforces the same split.
  const handed = currentUser?.admin_tasks || [];
  const can = (task) => isOwner || handed.includes(task);
  const canItems = can('inventory.items');
  const canStock = can('inventory.stock');
  const canTransfer = can('inventory.transfer');
  const canSuppliers = can('inventory.suppliers');

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
        // Suppliers are their own task; without it there is nothing to read.
        canSuppliers ? api.getSuppliers() : Promise.resolve([]),
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
  }, [search, category, reorderOnly, canSuppliers]);

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


  // Five tabs shown: Inventory, In-house (garments made for the boutique's own
  // stock), Materials library (the catalogue of materials, by category, to add
  // to stock), Shelves & racks and Inventory history (the purchase list).
  // Material requirements, Suppliers and Reports are hidden, not removed:
  // `hidden: true`.
  const inventoryTabs = [
    { key: 'items', label: t('inventoryPage.items'), icon: Package },
    { key: 'inhouse', label: t('inventoryPage.inHouse', 'In-house'), icon: Factory },
    { key: 'catalog', label: t('inventoryPage.materialsLibrary', 'Materials library'), icon: BookOpen },
    { key: 'locations', label: t('inventoryPage.locations'), icon: MapPin },
    // Where inside a location the stock sits: racks, shelves, boxes (ShelvesTab).
    { key: 'shelves', label: t('inventoryPage.racksShelves', 'Racks & shelves'), icon: Layers },
    { key: 'recipes', label: t('inventoryPage.recipes'), icon: Scissors, hidden: true },
    { key: 'suppliers', label: t('inventoryPage.suppliers'), icon: ClipboardList, hidden: true },
    { key: 'purchases', label: t('inventoryPage.inventoryHistory', 'Inventory history'), icon: ShoppingCart },
    { key: 'reports', label: t('inventoryPage.reports'), icon: BarChart3, hidden: true },
  ].filter((tabItem) => !tabItem.hidden);
  // The tab's crumb opens it afresh: a section of the materials library or
  // a shelf's item closes, as a sidebar item does for a page.
  const [tabVisit, setTabVisit] = useState(0);

  return (
    <>
      <PageHeader
        title={t('inventoryPage.title')}
        subtitle={t('inventoryPage.subtitle')}
        actions={canItems && tab !== 'shelves' && (
          <button type="button" className="btn-primary" style={{ padding: '10px 18px' }} onClick={() => setEditingItem({})}>
            <Plus size={16} />
            {t('inventoryPage.newItem')}
          </button>
        )}
      />

      {/* The four stock cards belong to the stock list: not shown on the
          Materials library, Shelves & racks or Inventory history tabs. */}
      {summary && !['catalog', 'locations', 'purchases', 'inhouse', 'shelves'].includes(tab) && (
        // Just the label and the number on each card (no line under it).
        <div className="at-stat-grid inv-stats inv-stats--plain">
          <StatCard icon={Package} tone="green" label={t('inventoryPage.stockValue')} value={money(summary.inventory_value)}
                    onClick={() => { setTab('items'); setReorderOnly(false); }} />
          <StatCard icon={AlertTriangle} tone="amber" label={t('inventoryPage.outOfStock')} value={summary.out_of_stock_count}
                    onClick={() => { setTab('items'); setReorderOnly(true); }} />
          <StatCard icon={ArrowDownCircle} tone="blue" label={t('inventoryPage.reorderDue')} value={summary.needs_reorder_count}
                    onClick={() => { setTab('items'); setReorderOnly(true); }} />
          <StatCard icon={History} tone="rose" label={t('inventoryPage.deadStock')} value={summary.dead_stock_count}
                    onClick={() => setTab('reports')} />
        </div>
      )}

      {/* Tab strip, not pill buttons: these switch a view, so an underline on
          the active one reads as navigation rather than seven call-to-actions. */}
      <Crumbs level={1} items={[{
        label: inventoryTabs.find((tabItem) => tabItem.key === tab)?.label || '',
        onClick: () => setTabVisit((n) => n + 1),
      }]} />
      {/* Racks & shelves: Add material above the tabs. */}
      {tab === 'shelves' && canItems && (
        <div className="sh-page-row">
          <button type="button" className="btn-primary sh-page-add" style={{ padding: '10px 18px' }} onClick={() => setEditingItem({})}>
            <Plus size={16} />
            {t('inventoryPage.newItem')}
          </button>
        </div>
      )}
      <Tabs ariaLabel={t('nav.inventory', 'Inventory')} tabs={inventoryTabs} value={tab} onChange={setTab}
            style={{ marginTop: 'var(--space-5)' }} />


      {!loadError && tab === 'items' && (canStock || canTransfer) && (
        <NotShelvedReminder version={items} onOpen={(location) => {
          // Opens Racks & shelves straight on Put away for that location.
          try {
            localStorage.setItem(SHELVES_VIEW_KEY, 'putaway');
            localStorage.setItem(SHELVES_LOCATION_KEY, String(location.id));
          } catch { /* private mode */ }
          setTab('shelves');
        }} />
      )}

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
          isOwner={canItems}
          onMove={canStock ? setMovementItem : null}
          onLedger={openLedger}
          onEdit={setEditingItem}
        />
      )}

      {!loadError && tab === 'suppliers' && (
        <SuppliersTab suppliers={suppliers} isOwner={canSuppliers} onAdd={() => setShowSupplierForm(true)} />
      )}

      {!loadError && tab === 'catalog' && (
        <CatalogBrowser key={tabVisit} isOwner={canItems} onStock={stockFromCatalog} version={catalogVersion} />
      )}

      {!loadError && tab === 'locations' && (
        <LocationsTab items={items} isOwner={canTransfer} onMoved={refresh} />
      )}

      {!loadError && tab === 'recipes' && (
        <RecipesTab items={items} isOwner={canItems} />
      )}

      {!loadError && tab === 'purchases' && <OrderPurchasesTab suppliers={suppliers} isOwner={canStock} />}

      {!loadError && tab === 'inhouse' && <InHouseTab />}

      {!loadError && tab === 'shelves' && <ShelvesTab key={tabVisit} canMove={canStock || canTransfer} canManage={canItems} />}

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
            <DataTable
              fit={false}
              tableStyle={{ minWidth: '560px' }}
              rows={ledger}
              columns={[
                {
                  key: 'when', header: 'When', cellProps: () => ({ style: { whiteSpace: 'nowrap' } }),
                  render: (m) => new Date(m.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
                },
                {
                  key: 'movement', header: 'Movement',
                  render: (m) => (
                    <>
                      <span style={{ color: MOVEMENT_TONE[m.movement_type] || 'var(--text-primary)', fontWeight: 600 }}>
                        {m.movement_type_display}
                      </span>
                      {m.order_reference && (
                        <span style={{ color: 'var(--text-muted)' }}> · {m.order_reference}</span>
                      )}
                    </>
                  ),
                },
                { key: 'qty', header: 'Qty', numeric: true, render: (m) => qty(m.quantity) },
                {
                  key: 'balance', header: 'Balance', numeric: true,
                  render: (m) => <>{qty(m.previous_stock)} → <strong>{qty(m.new_stock)}</strong></>,
                },
                {
                  key: 'by', header: 'By', cellProps: () => ({ style: { color: 'var(--text-muted)' } }),
                  render: (m) => m.user_name_snapshot || 'System',
                },
              ]}
            />
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
