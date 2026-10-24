import { useState } from 'react';
import { Check, X, Shirt, Plus } from 'lucide-react';

/** The tick grid's groups, by garment key, each in the order a counter thinks
 *  of them -- a saree beside its blouse and petticoat. A garment in none of
 *  them (one added to the catalogue later) goes under "Other". */
const GARMENT_GROUPS = [
  { label: 'Sarees & Lehengas', keys: ['saree', 'blouse', 'petticoat', 'lehenga', 'lehenga_blouse', 'dupatta'] },
  { label: 'Suits, Kurtis & Gowns', keys: ['kurti', 'anarkali', 'suit', 'bottom_wear', 'gown'] },
  { label: "Men's ethnic", keys: ['sherwani', 'kurta', 'indo_western', 'mens_bottom_wear'] },
  { label: "Men's western", keys: ['shirt', 't_shirt', 'mens_suit', 'trouser', 'jeans', 'shorts', 'casual_wear'] },
  { label: 'Jackets & coats', keys: ['jacket', 'coat'] },
];

/** `templates` in the groups above, empty groups left out. */
function groupGarments(templates) {
  const byKey = new Map(templates.map((t) => [t.key, t]));
  const grouped = GARMENT_GROUPS
    .map((group) => ({ label: group.label, items: group.keys.map((key) => byKey.get(key)).filter(Boolean) }))
    .filter((group) => group.items.length);
  const known = new Set(GARMENT_GROUPS.flatMap((group) => group.keys));
  const other = templates.filter((t) => !known.has(t.key));
  return other.length ? [...grouped, { label: 'Other', items: other }] : grouped;
}

/**
 * DressesDropdown - a native select for adding garments to the order, with the
 * chosen ones shown as removable pills above it. An order holds several
 * dresses, so picking one adds it and the select resets to ask for the next.
 *
 * With `onAddMany`, the select is a grid of garments to tick instead: several
 * are chosen together and added with one button, `onAddMany(keys)`.
 */
export default function DressesDropdown({
  title = "Dresses in this Order",
  subtitle = "Pick every garment being stitched. Each one opens its own design parts below.",
  isRequired = false,
  garmentTemplates = [],
  garmentJobs = [],
  addingGarmentKey = null,
  garmentTemplatesError = null,
  loadGarmentTemplates = null,
  addGarment,
  removeGarment,
  onAddMany = null,
}) {
  const chosenKeys = new Set(garmentJobs.map((job) => job.key));
  const available = garmentTemplates.filter((t) => !chosenKeys.has(t.key));
  // The garments ticked in the grid, in the order they appear in it.
  const [ticked, setTicked] = useState([]);
  const toggle = (key) => setTicked((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  const addTicked = () => {
    // In the order the grid shows them, group by group.
    const keys = groupGarments(available).flatMap((group) => group.items.map((t) => t.key))
      .filter((key) => ticked.includes(key));
    if (!keys.length || addingGarmentKey) return;
    onAddMany(keys);
    setTicked([]);
  };

  return (
    <div
      style={{
        background: 'var(--surface-color, #ffffff)',
        border: '1px solid var(--border-color, #e5e1d7)',
        borderRadius: '12px',
        padding: '16px 18px',
        marginBottom: '20px',
        textAlign: 'left',
        boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
      }}
    >
      {/* Section Header */}
      <div style={{ marginBottom: '12px' }}>
        <label
          className="form-label"
          style={{
            fontWeight: 700,
            fontSize: '14.5px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            margin: 0,
            color: 'var(--text-primary, #1e293b)',
          }}
        >
          <Shirt size={16} style={{ color: 'var(--accent-text, #18181b)' }} />
          <span>{title}</span>
          {isRequired && <span className="required" style={{ color: 'var(--danger-color)' }}>*</span>}
        </label>
        {subtitle && (
          <div style={{ fontSize: '12.5px', color: 'var(--text-secondary, #64748b)', marginTop: '4px' }}>
            {subtitle}
          </div>
        )}
      </div>

      {/* Chosen garments */}
      {garmentJobs.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center', marginBottom: '10px' }}>
          {garmentJobs.map((job) => {
            const name = job.template?.name || job.key;
            return (
              <span
                key={job.key}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '4px 10px',
                  borderRadius: '20px',
                  fontSize: '12.5px',
                  fontWeight: 600,
                  background: '#18181b',
                  color: '#ffffff',
                  boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
                }}
              >
                <Check size={12} style={{ color: '#4ade80' }} />
                {name}
                <button
                  type="button"
                  onClick={() => removeGarment?.(job.key)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'rgba(255,255,255,0.7)',
                    cursor: 'pointer',
                    padding: '0 2px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '50%',
                    marginLeft: '2px',
                  }}
                  title={`Remove ${name}`}
                >
                  <X size={12} />
                </button>
              </span>
            );
          })}
        </div>
      )}

      {onAddMany ? (
        /* Garment grid: tick everything being made, then add them together. */
        <>
          {/* One grid, in the groups' order -- garments that go together side
              by side -- without a heading over each group. */}
          <div className="dd-grid" role="group" aria-label={title}>
            {groupGarments(available).flatMap((group) => group.items).map((template) => {
              const on = ticked.includes(template.key);
              return (
                <button key={template.key} type="button" aria-pressed={on} disabled={!!addingGarmentKey}
                        className={`dd-tile${on ? ' dd-tile--on' : ''}`} onClick={() => toggle(template.key)}>
                  <span className="dd-tile-box" aria-hidden="true">{on && <Check size={13} strokeWidth={3} />}</span>
                  <span className="dd-tile-name">{template.name}</span>
                </button>
              );
            })}
          </div>
          {available.length > 0 && (
            <div className="dd-foot">
              <span className="dd-foot-hint">
                {ticked.length
                  ? `${ticked.length} selected${ticked.length > 1 ? ' — they are filled in one after another' : ''}`
                  : 'Tick every garment being made.'}
              </span>
              <button type="button" className="btn-primary" disabled={!ticked.length || !!addingGarmentKey} onClick={addTicked}>
                <Plus size={16} />
                {addingGarmentKey ? 'Adding…' : ticked.length > 1 ? `Add ${ticked.length} garments` : 'Add garment'}
              </button>
            </div>
          )}
        </>
      ) : (
      /* Garment picker. Value is pinned to '' so every pick re-arms it. */
      <select
        className="form-control"
        value=""
        disabled={!!addingGarmentKey || available.length === 0}
        onChange={(e) => { if (e.target.value) addGarment?.(e.target.value); }}
      >
        <option value="">
          {addingGarmentKey
            ? 'Loading…'
            : available.length === 0 && garmentTemplates.length > 0
              ? 'All garments added'
              : 'Select Garment'}
        </option>
        {available.map((template) => (
          <option key={template.key} value={template.key}>{template.name}</option>
        ))}
      </select>
      )}

      {/* Error state if templates fail to load */}
      {garmentTemplates.length === 0 && garmentTemplatesError && (
        <div style={{ fontSize: '12.5px', color: 'var(--danger-color)', marginTop: '8px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span>The garment list could not be loaded — {garmentTemplatesError}</span>
          {loadGarmentTemplates && (
            <button
              type="button"
              className="btn-secondary"
              style={{ padding: '3px 8px', fontSize: '12px' }}
              onClick={loadGarmentTemplates}
            >
              Retry
            </button>
          )}
        </div>
      )}
    </div>
  );
}
