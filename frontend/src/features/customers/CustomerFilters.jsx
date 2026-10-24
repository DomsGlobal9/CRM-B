/* The filter bar over the customer list: sort always in view, the rest
   (orders, measurements, source, gender, city) behind "More filters". Country
   code, the A–Z strip and the date-added and birthday filters were removed
   (MOM, 2026-10-24); the server still accepts them. The server applies the filters and counts
   the options (`facets`, from the directory response); this only draws them. */
import { useMemo, useState } from 'react';
import { ChevronDown, SlidersHorizontal, X } from 'lucide-react';
import {
  EMPTY_CUSTOMER_FILTERS, MEASUREMENT_OPTIONS, ORDER_OPTIONS, SORT_OPTIONS, activeFilterCount,
} from './filterRules';

const ROW = { display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 12 };
const FIELD = { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 150, flex: '1 1 150px', maxWidth: 240 };

function Select({ label, value, onChange, options, allLabel }) {
  const on = value !== '';
  return (
    <label className="cf-field" style={FIELD}>
      <span className="cf-label">{label}</span>
      <select className={`form-control cf-select${on ? ' cf-select--on' : ''}`} value={value}
              onChange={(e) => onChange(e.target.value)}>
        {allLabel !== undefined && <option value="">{allLabel}</option>}
        {options.map((o) => (Array.isArray(o)
          ? <option key={o[0]} value={o[0]}>{o[1]}</option>
          : <option key={o.key} value={o.key}>{o.label} ({o.count})</option>))}
      </select>
    </label>
  );
}

export default function CustomerFilters({ facets, filters, onChange, leading = null, trailing = null }) {
  const [more, setMore] = useState(false);
  const set = (key) => (value) => onChange({ ...filters, [key]: value });

  const lists = useMemo(() => ({
    sources: facets?.sources || [],
    genders: facets?.genders || [],
    cities: facets?.cities || [],
  }), [facets]);

  const active = activeFilterCount(filters);
  const hiddenActive = ['orders', 'measurements', 'source', 'gender', 'city'].filter((k) => filters[k] !== '').length;
  const showMore = more || hiddenActive > 0;

  return (
    <div className="cf-bar" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* One row: the tier chips (`leading`) on the left, sort and filters on
          the right, so the page has a single toolbar instead of three rows. */}
      <div className="cf-top">
        {leading}
        <div className="cf-top-end">
          <label className="cf-inline">
            <span className="cf-label">Sort</span>
            <select className={`form-control cf-select${filters.sort ? ' cf-select--on' : ''}`} value={filters.sort}
                    onChange={(e) => set('sort')(e.target.value)}>
              {SORT_OPTIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </label>
          <button type="button" className="btn-secondary cf-btn" aria-expanded={showMore}
                  onClick={() => setMore(!showMore)} disabled={hiddenActive > 0}>
            <SlidersHorizontal size={15} /> More filters
            {hiddenActive > 0 && <span className="cf-count">{hiddenActive}</span>}
            <ChevronDown size={15} style={{ transform: showMore ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
          </button>
          {(active > 0 || filters.sort) && (
            <button type="button" className="btn-secondary cf-btn" onClick={() => onChange(EMPTY_CUSTOMER_FILTERS)}>
              <X size={15} /> Clear{active > 0 ? ` (${active})` : ''}
            </button>
          )}
        </div>
      </div>
      {trailing}

      {showMore && (
        <div style={ROW}>
          <Select label="Orders" value={filters.orders} onChange={set('orders')} options={ORDER_OPTIONS} />
          <Select label="Measurements" value={filters.measurements} onChange={set('measurements')} options={MEASUREMENT_OPTIONS} />
          <Select label="Source" value={filters.source} onChange={set('source')} allLabel="Any source" options={lists.sources} />
          <Select label="Gender" value={filters.gender} onChange={set('gender')} allLabel="Any" options={lists.genders} />
          <Select label="City / region" value={filters.city} onChange={set('city')} allLabel="Any city" options={lists.cities} />
        </div>
      )}
    </div>
  );
}
