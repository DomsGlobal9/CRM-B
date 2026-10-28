import { useState } from 'react';
import { ChevronDown, ChevronRight, Search, X } from 'lucide-react';

import { describePath, useDesignCatalogue } from './designCatalogue';
import { visibleCategories } from './catalogueVisibility';

/**
 * Walking a garment's design catalogue: category, then sub-category where the
 * category has them, then design option. Each level is a row of chips; the
 * chosen path is what the library filters by and what an upload is filed
 * under.
 *
 * The tree comes from the server, the same one the serializer validates
 * against, so the browser can never offer a position an upload would be
 * refused at. A garment with no catalogue yet renders nothing at all, which is
 * how every garment other than the saree looks today.
 *
 * `value` is {category, subcategory, option}; every key optional. Changing a
 * level clears the levels beneath it -- a Cotton option makes no sense under
 * Silk / Pattu.
 *
 * Layout: Category reads as the main choice (filled pills; one sideways
 * strip on a phone). Design options are the long list -- up to ~35 under one
 * category -- so they are lighter, smaller chips, folded to the first
 * OPTIONS_FOLDED with "Show all", and searchable once there are more than
 * that. The foot says what is showing and clears it in one tap.
 */

// How many design options show before "Show all".
const OPTIONS_FOLDED = 12;

function Chip({ active, onClick, children, title, kind = 'category' }) {
  return (
    <button type="button" onClick={onClick} title={title} aria-pressed={active}
            className={`dcb-chip dcb-chip--${kind}${active ? ' dcb-chip--on' : ''}`}>
      {children}
    </button>
  );
}

function Level({ label, extra = null, scroll = false, children }) {
  return (
    <div className="dcb-level">
      <div className="dcb-level-label">
        <span>{label}</span>
        {extra}
      </div>
      <div className={`dcb-chips${scroll ? ' dcb-chips--scroll' : ''}`}>{children}</div>
    </div>
  );
}

/** The design options under the chosen category (or section): folded, and
 *  searchable when there are many. Keyed by its category by the caller, so
 *  opening another category starts folded with an empty search. */
function DesignOptions({ options, selected, onPick }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const many = options.length > OPTIONS_FOLDED;
  const needle = query.trim().toLowerCase();
  const matching = needle ? options.filter((o) => o.label.toLowerCase().includes(needle)) : options;
  // Folded: the first few, plus the chosen one wherever it sits in the list.
  const shown = open || needle || !many
    ? matching
    : matching.filter((o, i) => i < OPTIONS_FOLDED || o.key === selected);
  const hidden = matching.length - shown.length;

  return (
    <Level
      label="Design"
      extra={<span className="dcb-level-count">{options.length} {options.length === 1 ? 'style' : 'styles'}</span>}
    >
      {many && (
        <label className="dcb-search">
          <Search size={15} aria-hidden="true" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a style…"
                 aria-label="Find a design style" />
          {query && (
            <button type="button" className="dcb-search-clear" aria-label="Clear search" onClick={() => setQuery('')}>
              <X size={14} />
            </button>
          )}
        </label>
      )}
      {shown.map((o) => (
        <Chip key={o.key} kind="option" active={selected === o.key} onClick={() => onPick(o.key)}>
          {o.label}
        </Chip>
      ))}
      {needle && matching.length === 0 && <span className="dcb-none">No style matches &ldquo;{query.trim()}&rdquo;.</span>}
      {many && !needle && (hidden > 0 || open) && (
        <button type="button" className="dcb-more" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? 'Show fewer' : `Show all ${options.length}`}
          <ChevronDown size={14} style={{ transform: open ? 'rotate(180deg)' : 'none' }} />
        </button>
      )}
    </Level>
  );
}


export default function DesignCatalogueBrowser({ garmentKey, value = {}, onChange, allLabel = 'All designs' }) {
  const tree = useDesignCatalogue(garmentKey);
  // Catalogue categories not offered in the library's browser (still on the
  // catalogue itself, so a design already filed under one keeps its place).
  // (which ones: catalogueVisibility.js, shared with the upload forms).
  const categories = visibleCategories(garmentKey, tree?.categories);
  if (categories.length === 0) return null;

  const category = categories.find((c) => c.key === value.category) || null;
  const subcategory = (category?.subcategories || []).find((s) => s.key === value.subcategory) || null;
  const options = category
    ? (category.subcategories ? (subcategory?.options || []) : (category.options || []))
    : [];

  return (
    <div className="dcb-panel dcb-panel--v2">
      <Level label="Category" scroll>
        <Chip active={!category} onClick={() => onChange({})}>{allLabel}</Chip>
        {categories.map((c) => (
          <Chip key={c.key} active={category?.key === c.key} title={c.label}
                onClick={() => onChange({ category: c.key })}>
            {c.short || c.label}
          </Chip>
        ))}
      </Level>

      {category?.subcategories && (
        <Level label="Section">
          {category.subcategories.map((s) => (
            <Chip key={s.key} kind="section" active={subcategory?.key === s.key}
                  onClick={() => onChange({ category: category.key, subcategory: s.key })}>
              {s.label}
            </Chip>
          ))}
        </Level>
      )}

      {category && (!category.subcategories || subcategory) && (
        options.length > 0 ? (
          <DesignOptions
            key={`${category.key}/${subcategory?.key || ''}`}
            options={options}
            selected={value.option}
            onPick={(key) => onChange({ category: category.key, subcategory: subcategory?.key,
                                        option: value.option === key ? undefined : key })}
          />
        ) : (
          <div className="dcb-note">{category.note || 'No design options are listed here yet.'}</div>
        )
      )}

      {category && (
        <div className="dcb-foot">
          <div className="dcb-path">
            <span className="dcb-path-label">Showing</span>
            <span className="dcb-path-root">{tree.label}</span>
            <ChevronRight size={13} aria-hidden="true" />
            <span>{describePath(tree, value)}</span>
          </div>
          {category.note && !category.subcategories && options.length > 0 && (
            <span className="dcb-path-note">{category.note}</span>
          )}
          <button type="button" className="dcb-clear" onClick={() => onChange({})}>
            <X size={14} /> Clear
          </button>
        </div>
      )}
    </div>
  );
}
