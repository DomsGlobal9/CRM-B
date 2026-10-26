import { useMemo, useState } from 'react';
import { Check, Plus, Search, Shirt } from 'lucide-react';

/** The order the garments are listed in, by key -- the way a counter thinks of
 *  them, a saree beside its blouse and petticoat. A garment in none of these
 *  (one added to the catalogue later) follows at the end. */
const GARMENT_ORDER = [
  'saree', 'blouse', 'petticoat', 'lehenga', 'lehenga_blouse', 'dupatta',
  'kurti', 'anarkali', 'suit', 'bottom_wear', 'gown',
  'sherwani', 'kurta', 'indo_western', 'mens_bottom_wear',
  'shirt', 't_shirt', 'mens_suit', 'trouser', 'jeans', 'shorts', 'casual_wear',
  'jacket', 'coat',
];
const orderGarments = (templates) => {
  const rank = (tpl) => { const at = GARMENT_ORDER.indexOf(tpl.key); return at === -1 ? GARMENT_ORDER.length : at; };
  return [...templates].sort((a, b) => rank(a) - rank(b));
};

/**
 * DressesDropdown - picks the garments on an order, several at a time.
 *
 * Every garment type is a tick box; ticking a few and pressing "Add" puts them
 * all on the order at once (MOM, 2026-10-24: "select multiple garments at a
 * time"). Garments already on the order show as ticked and locked -- they are
 * removed from their own card, where their details are.
 */
export default function DressesDropdown({
  title = 'Garments in this order',
  subtitle = 'Tick every garment being made, then add them.',
  isRequired = false,
  garmentTemplates = [],
  garmentJobs = [],
  addingGarmentKey = null,
  garmentTemplatesError = null,
  loadGarmentTemplates = null,
  addGarments,
  compact = false,
}) {
  const [picked, setPicked] = useState([]);
  const [query, setQuery] = useState('');
  const onOrder = useMemo(
    () => new Set(garmentJobs.map((job) => job.template?.key || job.key)),
    [garmentJobs]);
  const term = query.trim().toLowerCase();
  const shown = orderGarments(garmentTemplates).filter((tpl) => !term || tpl.name.toLowerCase().includes(term));
  const busy = !!addingGarmentKey;

  const toggle = (key) => setPicked((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  const add = async () => {
    // Added in the order the list shows them.
    const keys = orderGarments(garmentTemplates).map((tpl) => tpl.key)
      .filter((k) => picked.includes(k) && !onOrder.has(k));
    if (!keys.length || busy) return;
    await addGarments?.(keys);
    setPicked([]);
    setQuery('');
  };

  return (
    <div className={`dd-picker${compact ? ' dd-picker--compact' : ''}`}>
      {!compact && (
        <div className="dd-picker-head">
          <div className="form-label dd-picker-title">
            <Shirt size={16} aria-hidden="true" />
            <span>{title}</span>
            {isRequired && <span className="required">*</span>}
          </div>
          {subtitle && <div className="dd-picker-sub">{subtitle}</div>}
        </div>
      )}

      {garmentTemplates.length > 8 && (
        <div className="input-wrapper dd-picker-search">
          <Search size={15} className="input-icon-left" aria-hidden="true" />
          <input type="search" className="form-control" value={query} placeholder="Search garments"
                 aria-label="Search garments" onChange={(e) => setQuery(e.target.value)} />
        </div>
      )}

      <div className="dd-picker-grid" role="group" aria-label={title}>
        {shown.map((tpl) => {
          const already = onOrder.has(tpl.key);
          const on = already || picked.includes(tpl.key);
          return (
            <button key={tpl.key} type="button" role="checkbox" aria-checked={on} disabled={already || busy}
                    className={`dd-chip${on ? ' dd-chip--on' : ''}`}
                    title={already ? `${tpl.name} is already on this order` : undefined}
                    onClick={() => toggle(tpl.key)}>
              <span className="dd-chip-box" aria-hidden="true">{on && <Check size={12} strokeWidth={3} />}</span>
              <span className="dd-chip-name">{tpl.name}</span>
            </button>
          );
        })}
        {garmentTemplates.length > 0 && shown.length === 0 && (
          <div className="dd-picker-sub">No garment matches “{query}”.</div>
        )}
      </div>

      <div className="dd-picker-foot">
        <button type="button" className="btn-primary" onClick={add} disabled={!picked.length || busy}>
          <Plus size={15} />
          {busy ? 'Adding…'
            : picked.length > 1 ? `Add ${picked.length} garments`
            : picked.length === 1 ? 'Add 1 garment'
            : 'Tick garments to add'}
        </button>
        {picked.length > 0 && !busy && (
          <button type="button" className="btn-secondary" onClick={() => setPicked([])}>Clear</button>
        )}
      </div>

      {garmentTemplates.length === 0 && garmentTemplatesError && (
        <div className="dd-picker-error">
          <span>The garment list could not be loaded — {garmentTemplatesError}</span>
          {loadGarmentTemplates && (
            <button type="button" className="btn-secondary" style={{ padding: '3px 8px', fontSize: '12px' }}
                    onClick={loadGarmentTemplates}>
              Retry
            </button>
          )}
        </div>
      )}
    </div>
  );
}
