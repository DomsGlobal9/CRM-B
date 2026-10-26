import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Award, Check, ChevronRight, Clock, Edit2, Eye, Image as ImageIcon, LayoutGrid, Package, Plus, Search, ShoppingBag, SlidersHorizontal, Trash2, Users, X } from 'lucide-react';

import { api } from '../../services/api';
import { resolveMediaUrl } from '../../services/media';
import DesignUpload from './DesignUpload';
import GarmentPartTabs from './GarmentPartTabs';
import DesignCatalogueBrowser from './DesignCatalogueBrowser';
import ItemFormModal from '../inventory/ItemFormModal';
import { IconTile, SectionCard, StatCard } from '../../components/ui/Atelier';
import VoiceTextarea from '../../components/ui/VoiceTextarea';
import { LIMITS, cleanAmount } from '../../services/validate';
import Loader from '../../components/ui/Loader';


const CARD_IMAGE_FALLBACK =
  'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?w=400';

const STATUS_COLOURS = {
  ACTIVE: { bg: 'var(--success-bg)', fg: 'var(--success-color)' },
  PENDING: { bg: 'var(--warning-bg)', fg: 'var(--warning-color)' },
  DRAFT: { bg: 'var(--surface-inset)', fg: 'var(--text-secondary)' },
  ARCHIVED: { bg: 'var(--surface-inset)', fg: 'var(--text-secondary)' },
};

const EDITABLE_SOURCES = ['catalogue', 'suggestion'];

const inventoryDraft = (design) => ({
  name: design.title,
  category: 'DESIGN',
  unit: 'PIECE',
  sub_category: design.garment_type || '',
  selling_price: Number(design.estimated_price) > 0 ? design.estimated_price : '',
  image_url: design.image_url || '',
  image_urls: design.image_url ? [design.image_url] : [],
  design_asset: design.id,
});

const formatDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '';

function Filters({ value, onChange, designers, collections, parts = [] }) {
  const set = (key) => (e) => onChange({ ...value, [key]: e.target.value });
  // On a phone everything but the search folds behind one button (index.css);
  // a larger screen never shows the button and always shows every filter.
  const [open, setOpen] = useState(false);
  const applied = Object.entries(value).filter(([k, v]) => k !== 'search' && v).length;

  const select = (key, label, options) => (
    <label className="dl-filter-more" style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px', color: 'var(--text-secondary)' }}>
      {label}
      <select className="form-control" style={{ padding: '6px 8px', fontSize: '12px' }}
              value={value[key] || ''} onChange={set(key)}>
        <option value="">Any</option>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );

  return (
    <div className={`dl-filters${open ? ' dl-filters--open' : ''}`} style={{
      display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(140px, 100%), 1fr))',
      gap: '12px', padding: '16px', border: '1px solid var(--border-color)',
      borderRadius: '8px', marginBottom: '20px', alignItems: 'end',
    }}>
      <label className="dl-filter-search" style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px', color: 'var(--text-secondary)' }}>
        Search
        <span style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <Search size={13} style={{ position: 'absolute', left: '8px', color: 'var(--text-muted)' }} />
          <input className="form-control" style={{ padding: '6px 8px 6px 26px', fontSize: '12px' }}
                 value={value.search || ''} onChange={set('search')} placeholder="Design name" />
        </span>
      </label>
      <button type="button" className="btn-secondary dl-filter-toggle" aria-expanded={open}
              onClick={() => setOpen((o) => !o)}>
        <SlidersHorizontal size={14} /> {open ? 'Hide filters' : 'Filters'}{applied ? ` (${applied})` : ''}
      </button>

      {select('designer', 'Designer', designers.map(d => [d.id, `${d.name} (${d.design_count})`]))}
      {select('collection', 'Collection', collections.map(c => [c.id, `${c.name} (${c.design_count})`]))}
      {select('occasion', 'Occasion', [
        ['wedding', 'Wedding'], ['reception', 'Reception'], ['festive', 'Festive'],
        ['party', 'Party'], ['daily', 'Daily'],
      ])}
      {select('sleeve_length', 'Sleeve', [
        ['sleeveless', 'Sleeveless'], ['cap', 'Cap'], ['short', 'Short'],
        ['elbow', 'Elbow'], ['three_quarter', '3/4'], ['full', 'Full'],
      ])}
      {parts.length > 0 && select('part', 'Part', parts.map(p => [p.key, p.label]))}
      {select('status', 'Status', [
        ['ACTIVE', 'Active'], ['PENDING', 'Pending approval'],
        ['DRAFT', 'Draft'], ['ARCHIVED', 'Archived'],
      ])}
      {select('ordering', 'Sort by', [
        ['newest', 'Newest'], ['oldest', 'Oldest'], ['most_viewed', 'Most viewed'],
        ['most_ordered', 'Most ordered'], ['name', 'Name'],
      ])}

      <label className="dl-filter-more dl-filter-price" style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px', color: 'var(--text-secondary)' }}>
        Price
        <span style={{ display: 'flex', gap: '4px' }}>
          <input className="form-control" style={{ padding: '6px', fontSize: '12px', width: '50%' }}
                 inputMode="decimal" placeholder="min" value={value.price_min || ''}
                 onChange={(e) => set('price_min')({ target: { value: cleanAmount(e.target.value) } })} />
          <input className="form-control" style={{ padding: '6px', fontSize: '12px', width: '50%' }}
                 inputMode="decimal" placeholder="max" value={value.price_max || ''}
                 onChange={(e) => set('price_max')({ target: { value: cleanAmount(e.target.value) } })} />
        </span>
      </label>
    </div>
  );
}

function DesignDetail({ design, onClose, onEdit, onDelete, onReviewed, canReview, partLabels = {} }) {
  const editable = EDITABLE_SOURCES.includes(design.source);

  const byPart = useMemo(() => {
    const groups = new Map();
    (design.images || []).forEach((img) => {
      if (!groups.has(img.part)) groups.set(img.part, []);
      groups.get(img.part).push(img);
    });
    return [...groups.entries()];
  }, [design.images]);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [note, setNote] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const isPending = design.status === 'PENDING';
  const inFlight = useRef(false);

  useEffect(() => {
    setHistoryLoading(true);
    api.getDesignApprovalHistory(design.id)
      .then(setHistory)
      .catch(() => setHistory([]))
      .finally(() => setHistoryLoading(false));
  }, [design.id]);

  const decide = async (decision) => {
    if (inFlight.current) return;
    if (decision === 'CHANGES_REQUESTED' && !note.trim()) { window.alert('Tell the designer what to change.'); return; }
    inFlight.current = true;
    setReviewing(true);
    try {
      const updated = await api.reviewDesign(design.id, decision, note);
      onReviewed?.(updated);
    } catch (err) {
      window.alert(`Could not record that decision — ${err.message}`);
    } finally {
      inFlight.current = false;
      setReviewing(false);
    }
  };

  const row = (label, content) => content ? (
    <div>
      <span style={{ fontSize: '9px', textTransform: 'uppercase', color: 'var(--text-secondary)', display: 'block' }}>{label}</span>
      <span style={{ fontSize: '12.5px', fontWeight: 600 }}>{content}</span>
    </div>
  ) : null;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
    }} className="dl-detail" onClick={onClose}>
      <div className="content-card dl-detail-card" style={{ maxWidth: '860px', width: '100%', maxHeight: '90vh', overflowY: 'auto', margin: 0 }}
           onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
          <div>
            <h3 style={{ margin: 0, fontFamily: 'var(--font-serif)', fontSize: 'var(--text-xl)', fontWeight: 500, color: 'var(--text-primary)' }}>{design.title}</h3>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              {design.designer_name || 'No designer credited'} · added {formatDate(design.created_at)}
            </span>
          </div>
          <button className="btn-secondary" aria-label="Close" style={{ padding: '4px 10px' }} onClick={onClose}><X size={14} /></button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))', gap: '20px' }}>
          <img className="dl-detail-img" src={resolveMediaUrl(design.image_url, CARD_IMAGE_FALLBACK)} alt={design.title}
               style={{ width: '100%', borderRadius: '8px', objectFit: 'cover' }} />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(130px, 100%), 1fr))', gap: '12px', alignContent: 'start' }}>
            {row('Garment', design.garment_type)}
            {row('Occasion', design.occasion)}
            {row('Price', design.estimated_price > 0 ? `₹${Number(design.estimated_price).toLocaleString('en-IN')}` : null)}
            {row('Status', design.status)}
            {row('Source', design.source_display)}
            {row('Catalogue', design.catalogue?.path)}
            {row('Difficulty', design.difficulty)}
            {row('Stitch time', design.stitch_hours ? `${design.stitch_hours} h` : null)}
            {row('Views', design.view_count)}
            {row('Orders', design.order_count)}
            {Object.entries(design.spec_tags || {}).map(([k, v]) => (
              <div key={k}>
                <span style={{ fontSize: '9px', textTransform: 'uppercase', color: 'var(--text-secondary)', display: 'block' }}>
                  {k.replace(/_/g, ' ')}
                </span>
                <span style={{ fontSize: '12.5px', fontWeight: 600 }}>{String(v).replace(/_/g, ' ')}</span>
              </div>
            ))}
          </div>
        </div>

        {design.description && (
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '16px' }}>{design.description}</p>
        )}

        {/* A design is several photographs of one garment, each of a different
            part of it. Grouped under the part so the boutique can show a
            customer the pallu without hunting through an undifferentiated
            gallery. Labels come from the garment's own template where the
            design has one; the raw key is the honest fallback. */}
        {byPart.length > 0 && (
          <div style={{ marginTop: '20px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
            {byPart.map(([part, shots]) => (
              <div key={part} style={{ marginBottom: '14px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase',
                              color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  {partLabels[part] || part.replace(/_/g, ' ')} ({shots.length})
                </div>
                <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '4px' }}>
                  {shots.map((img) => (
                    <img key={img.id} src={resolveMediaUrl(img.image_url, CARD_IMAGE_FALLBACK)}
                         alt={img.caption || part}
                         style={{ width: '120px', height: '150px', objectFit: 'cover', borderRadius: '6px',
                                  flexShrink: 0, border: '1px solid var(--border-color)' }} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {canReview && isPending && (
          <div style={{ marginTop: '20px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '8px' }}>
              Awaiting your review
            </div>
            <VoiceTextarea className="form-control" rows={2} maxLength={LIMITS.note} placeholder="Note for the designer (needed when requesting changes)"
                      value={note} onChange={(e) => setNote(e.target.value)}
                      style={{ fontSize: '12.5px', marginBottom: '10px' }} />
            <div className="dl-detail-actions" style={{ display: 'flex', gap: '8px' }}>
              <button className="btn-primary" style={{ padding: '6px 14px', fontSize: '12px', opacity: reviewing ? 0.6 : 1 }}
                      disabled={reviewing} onClick={() => decide('APPROVED')}>
                <Check size={12} /> Approve
              </button>
              <button className="btn-secondary" style={{ padding: '6px 14px', fontSize: '12px' }}
                      disabled={reviewing} onClick={() => decide('CHANGES_REQUESTED')}>
                Request changes
              </button>
              <button className="btn-secondary" style={{ padding: '6px 14px', fontSize: '12px', color: 'var(--danger-color)', borderColor: 'var(--danger-color)' }}
                      disabled={reviewing} onClick={() => decide('REJECTED')}>
                Reject
              </button>
            </div>
          </div>
        )}

        {historyLoading && <Loader section label="Loading review history…" />}
        {!historyLoading && history.length > 0 && (
          <div style={{ marginTop: '16px', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Review history
            </div>
            {history.map((h) => (
              <div key={h.id} style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                <strong style={{ color: 'var(--text-primary)' }}>{h.decision.replace('_', ' ')}</strong>
                {h.reviewer_name ? ` by ${h.reviewer_name}` : ''} · {formatDate(h.created_at)}
                {h.note && <div style={{ marginTop: '2px' }}>&ldquo;{h.note}&rdquo;</div>}
              </div>
            ))}
          </div>
        )}

        {editable && !isPending && (
          <div className="dl-detail-actions" style={{ display: 'flex', gap: '8px', marginTop: '20px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
            <button className="btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }}
                    onClick={() => onEdit(design)}><Edit2 size={12} /> Edit</button>
            <button className="btn-secondary" style={{ padding: '6px 12px', fontSize: '12px', color: 'var(--danger-color)', borderColor: 'var(--danger-color)' }}
                    onClick={() => onDelete(design)}><Trash2 size={12} /> Delete</button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function DesignLibrary({ onEditDesign, onDeleteDesign, onUploaded, refreshToken, canReview = false, canStock = false, onOpenRequests = null, onOpenDesigners = null }) {
  const [stocking, setStocking] = useState(null);   
  const [categories, setCategories] = useState([]);
  const [total, setTotal] = useState(0);
  const [openCategory, setOpenCategory] = useState(null);  
  const [designs, setDesigns] = useState([]);
  const [designers, setDesigners] = useState([]);
  const [collections, setCollections] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [filters, setFilters] = useState({});
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [pendingCount, setPendingCount] = useState(0);
  
  const [partsByKey, setPartsByKey] = useState({});
  
  const [partTab, setPartTab] = useState(null);
  const [catalogueTab, setCatalogueTab] = useState(null);

  const PENDING_QUEUE = { key: '__pending__', name: 'Pending Approval' };
  const isPendingQueue = openCategory?.key === PENDING_QUEUE.key;

  const loadPendingCount = useCallback(() => {
    if (!canReview) return;
    api.getDesignLibrary({ status: 'PENDING' })
      .then((rows) => setPendingCount(rows.length))
      .catch(() => setPendingCount(0));
  }, [canReview]);

  const loadCategories = useCallback(async () => {
    try {
      const data = await api.getDesignCategories();
      setCategories(data.categories || []);
      setTotal(data.total || 0);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => { loadCategories(); }, [loadCategories, refreshToken]);
  useEffect(() => { loadPendingCount(); }, [loadPendingCount, refreshToken]);

  useEffect(() => {
    api.getDesigners({ active: 'true' }).then(setDesigners).catch(() => setDesigners([]));
    api.getCollections({ active: 'true' }).then(setCollections).catch(() => setCollections([]));
  }, [refreshToken]);

  const openKey = openCategory?.key;
  const needsParts = Boolean(openKey) && openKey !== PENDING_QUEUE.key
                     && partsByKey[openKey] === undefined;

  useEffect(() => {
    if (!needsParts) return;
    let cancelled = false;
    api.getGarmentTemplate(openKey)
      .then(t => { if (!cancelled) setPartsByKey(p => ({ ...p, [openKey]: t.design_parts || [] })); })
      .catch(() => { if (!cancelled) setPartsByKey(p => ({ ...p, [openKey]: [] })); });
    return () => { cancelled = true; };
  }, [needsParts, openKey]);

  const parts = partsByKey[openKey] || [];
  const partLabels = useMemo(
    () => Object.fromEntries(parts.map(p => [p.key, p.label])), [parts]);

  // A garment opens on All Designs (every design filed under it); a part tab
  // narrows it to that part's photos.
  const openPart = (partTab && openKey && partTab.garment === openKey) ? partTab.part : null;
  const cataloguePath = (catalogueTab && catalogueTab.garment === openKey) ? catalogueTab.value : {};

  const openDesign = (id, fallback = null) =>
    api.getDesignAsset(id).then(setSelected).catch(() => { if (fallback) setSelected(fallback); });

  useEffect(() => {
    if (openCategory === null) return;
    let cancelled = false;
    setLoading(true);
    const query = isPendingQueue
      ? { ...filters, status: 'PENDING', template: undefined }

      : { ...filters, template: openCategory.key || 'none',
          catalogue_category: cataloguePath.category,
          catalogue_subcategory: cataloguePath.subcategory,
          catalogue_option: cataloguePath.option };
    api.getDesignLibrary(query)
      .then((rows) => { if (!cancelled) { setDesigns(rows); setError(null); } })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [openCategory, filters, refreshToken, isPendingQueue,
      cataloguePath.category, cataloguePath.subcategory, cataloguePath.option]);

  const handleReviewed = (updated) => {
    setSelected(updated);
    setDesigns((prev) => (isPendingQueue
      ? prev.filter((d) => d.id !== updated.id)
      : prev.map((d) => (d.id === updated.id ? updated : d))));
    loadPendingCount();
    loadCategories();
  };

  if (error && !openCategory) {
    return (
      <div className="content-card" style={{ color: 'var(--danger-color)', fontSize: '13px' }}>
        The design library could not be loaded — {error}
        <button className="btn-secondary" style={{ marginLeft: '10px', padding: '4px 10px', fontSize: '12px' }}
                onClick={loadCategories}>Retry</button>
      </div>
    );
  }

  if (openCategory === null) {
    const uncategorised = categories.find((c) => !c.key);
    // Every card opens something: the garments the designs are filed under,
    // the designers' requests, a new design (where a collection is made), the
    // unfiled designs, the review queue.
    const toCategories = () => document.querySelector('.dl-cats-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return (
      <div className="at-stack dl-page">
        <div className="at-stat-grid dl-stats">
          <StatCard icon={ImageIcon} tone="green" label="Total Designs" value={total}
                    sub={`${total === 1 ? 'design' : 'designs'} in the library`}
                    onClick={toCategories} />
          {/* From the Overview tab, merged in here: the active designers and
              collections (the category count is the list of categories below). */}
          <StatCard icon={Users} tone="amber" label="Designers" value={(Array.isArray(designers) ? designers : designers?.results || []).length} sub="Active"
                    onClick={onOpenDesigners || onOpenRequests || toCategories} />
          <StatCard icon={Award} tone="violet" label="Collections" value={(Array.isArray(collections) ? collections : collections?.results || []).length}
                    sub={(Array.isArray(collections) ? collections : collections?.results || []).length ? 'Curated sets' : 'Create your first'}
                    onClick={() => setUploading(true)} />
          <StatCard icon={ImageIcon} tone="violet" label="Uncategorised" value={uncategorised?.count ?? 0}
                    sub={uncategorised?.count ? 'not yet filed under a garment' : 'everything is filed'}
                    onClick={uncategorised ? () => { setFilters({}); setOpenCategory(uncategorised); } : toCategories} />
          {canReview && (
            <StatCard icon={Clock} tone={pendingCount > 0 ? 'rose' : 'blue'} label="Awaiting review" value={pendingCount}
                      sub={pendingCount > 0 ? 'designs waiting on you' : 'all reviewed'}
                      onClick={() => { setFilters({}); setOpenCategory(PENDING_QUEUE); }} />
          )}
        </div>

        <SectionCard
          className="dl-cats-card"
          icon={LayoutGrid} tone="green" title="Design Categories"
          subtitle="Organise the library by garment"
          action={() => setUploading(true)} actionLabel="Upload design"
        >
          <div className="at-cat-grid dl-cats">
            {categories.map((category) => (
              <button
                key={category.key || 'uncategorised'}
                type="button"
                className="at-cat"
                onClick={() => { setFilters({}); setOpenCategory(category); }}
                style={{ opacity: category.count === 0 ? 0.6 : 1 }}
              >
                <IconTile icon={ImageIcon} tone={category.key ? (category.count ? 'green' : 'neutral') : 'amber'} size={44} iconSize={20} />
                <span style={{ minWidth: 0 }}>
                  <span className="at-cat-name" style={{ display: 'block' }}>{category.name}</span>
                  <span className="at-cat-count">{category.count} design{category.count === 1 ? '' : 's'}</span>
                </span>
                <ChevronRight size={18} className="at-cat-chevron" />
              </button>
            ))}
          </div>
        </SectionCard>

        {uploading && (
          <DesignUpload
            onClose={() => setUploading(false)}
            onUploaded={() => { setUploading(false); loadCategories(); onUploaded?.(); }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="content-card dl-page">
      <div className="dl-head" style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <button className="btn-secondary dl-back" style={{ padding: '6px 12px', fontSize: '12px' }}
                onClick={() => { setOpenCategory(null); setDesigns([]); }}>
          <ArrowLeft size={13} /> All categories
        </button>
        <h3 className="dl-title" style={{ margin: 0, fontFamily: 'var(--font-serif)', fontSize: 'var(--text-lg)', fontWeight: 500, color: 'var(--text-primary)' }}>{openCategory.name}</h3>
        {/* "N shown" counts the whole designs in the All Designs grid, so it
            shows only there; a part has its own count under the tabs. */}
        {!openPart && (
          <span className="dl-count" style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            {loading ? 'loading…' : `${designs.length} shown`}
          </span>
        )}
        <button className="btn-primary dl-upload" style={{ padding: '6px 12px', fontSize: '12px', marginLeft: 'auto' }}
                onClick={() => setUploading(true)}>
          <Plus size={13} /> Upload design
        </button>
      </div>

      {/* The garment's own parts, gathered across every design filed under it.
          The last tab is the whole-design grid this screen has always shown. */}
      {/* No "Next" here: in the library the parts are browsed, not filled in order. */}
      <GarmentPartTabs garmentKey={openCategory.key} parts={parts} active={openPart} showNext={false} allFirst
                       wholeDesignCount={loading ? 0 : designs.length}
                       onShowAll={() => setPartTab({ garment: openKey, part: null })}
                       onChange={(part) => setPartTab({ garment: openKey, part })}
                       onOpenDesign={(id) => openDesign(id)} />

      {/* The garment's design catalogue -- category, section, design option.
          Renders nothing for a garment that has no catalogue yet, so every
          other garment's library looks exactly as it did. */}
      {!openPart && !isPendingQueue && openKey && (
        <DesignCatalogueBrowser
          garmentKey={openKey}
          value={cataloguePath}
          onChange={(value) => setCatalogueTab({ garment: openKey, value })}
        />
      )}

      {!openPart && (
        <Filters value={filters} onChange={setFilters} designers={designers}
                 collections={collections} parts={parts} />
      )}

      {!openPart && !loading && designs.length === 0 && (
        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', padding: '24px 0', textAlign: 'center' }}>
          No designs match these filters.
        </div>
      )}

      <div className="dl-grid" style={{ display: openPart ? 'none' : 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(220px, 100%), 1fr))', gap: '16px' }}>
        {designs.map((design) => {
          const status = STATUS_COLOURS[design.status] || STATUS_COLOURS.DRAFT;
          return (
            <div key={design.id}
                 className="dl-card"
                 role="button"
                 tabIndex={0}
                 onClick={() => openDesign(design.id, design)}
                 onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDesign(design.id, design); } }}
                 style={{
                   border: '1px solid var(--border-color)', borderRadius: '10px',
                   overflow: 'hidden', cursor: 'pointer', background: 'var(--surface-color)',
                 }}>
              <div className="dl-card-img" style={{ height: '170px', background: 'var(--brand-dark)', position: 'relative' }}>
                <img src={resolveMediaUrl(design.image_url, CARD_IMAGE_FALLBACK)} alt={design.title}
                     style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <span className="dl-card-status" style={{
                  position: 'absolute', top: '10px', right: '10px', padding: '2px 8px',
                  borderRadius: '4px', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase',
                  background: status.bg, color: status.fg,
                }}>{design.status}</span>
              </div>
              <div className="dl-card-body" style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div className="dl-card-title" style={{ fontSize: '14px', fontWeight: 600 }}>{design.title}</div>
                <div className="dl-card-meta" style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                  {design.designer_name || 'Unattributed'} · {formatDate(design.created_at)}
                </div>
                <div className="dl-card-stats" style={{ display: 'flex', gap: '10px', fontSize: '11px', color: 'var(--text-muted)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                    <Eye size={11} /> {design.view_count}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                    <ShoppingBag size={11} /> {design.order_count}
                  </span>
                  {design.estimated_price > 0 && (
                    <span style={{ marginLeft: 'auto', fontWeight: 600, color: 'var(--accent-text, #b07c40)' }}>
                      ₹{Number(design.estimated_price).toLocaleString('en-IN')}
                    </span>
                  )}
                </div>
                {design.inventory_item_id ? (
                  <span className="dl-card-meta" style={{ fontSize: '11.5px', color: 'var(--success-color)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <Check size={13} /> In your inventory
                  </span>
                ) : canStock ? (
                  <button type="button" className="btn-secondary dl-card-stock"
                          style={{ fontSize: '11.5px', padding: '5px 11px', alignSelf: 'flex-start' }}
                          onClick={(e) => { e.stopPropagation(); setStocking(design); }}>
                    <Package size={12} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                    Add to inventory
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {stocking && (
        <ItemFormModal
          item={inventoryDraft(stocking)}
          onClose={() => setStocking(null)}
          onSaved={() => { setStocking(null); setFilters({ ...filters }); }}  
        />
      )}

      {uploading && (
        <DesignUpload
          initialGarmentKey={isPendingQueue ? '' : (openKey || '')}
          initialCatalogue={cataloguePath}
          onClose={() => setUploading(false)}
          onUploaded={() => {
            setUploading(false);
            loadCategories();
            setFilters({ ...filters });  
            onUploaded?.();
          }}
        />
      )}

      {selected && (
        <DesignDetail
          design={selected}
          onClose={() => setSelected(null)}
          onEdit={(design) => { setSelected(null); onEditDesign?.(design); }}
          onDelete={(design) => { setSelected(null); onDeleteDesign?.(design); }}
          onReviewed={handleReviewed}
          canReview={canReview}
          partLabels={partLabels}
        />
      )}
    </div>
  );
}
