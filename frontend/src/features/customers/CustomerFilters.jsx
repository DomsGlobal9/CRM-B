/* The filter bar over the customer list: country code, orders, measurements
   and sort always in view, the rest behind "More filters", and the A–Z strip
   for the first letter of the name. The rules live in filterRules.js. */
import { useMemo, useState } from 'react';
import { ChevronDown, SlidersHorizontal, X } from 'lucide-react';
import {
  ADDED_OPTIONS, BIRTHDAY_OPTIONS, EMPTY_CUSTOMER_FILTERS, LETTERS, MEASUREMENT_OPTIONS, ORDER_OPTIONS, SORT_OPTIONS,
  activeFilterCount, cityOptions, countryOptions, genderOptions, letterCounts, sourceOptions,
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

export default function CustomerFilters({ customers, filters, onChange }) {
  const [more, setMore] = useState(false);
  const set = (key) => (value) => onChange({ ...filters, [key]: value });

  const lists = useMemo(() => ({
    countries: countryOptions(customers),
    sources: sourceOptions(customers),
    genders: genderOptions(customers),
    cities: cityOptions(customers),
    letters: letterCounts(customers),
  }), [customers]);

  const active = activeFilterCount(filters);
  const hiddenActive = ['added', 'birthday', 'source', 'gender', 'city'].filter((k) => filters[k] !== '').length;
  const showMore = more || hiddenActive > 0;

  return (
    <div className="cf-bar" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={ROW}>
        <Select label="Country code" value={filters.country} onChange={set('country')}
                allLabel="All countries" options={lists.countries} />
        <Select label="Orders" value={filters.orders} onChange={set('orders')} options={ORDER_OPTIONS} />
        <Select label="Measurements" value={filters.measurements} onChange={set('measurements')} options={MEASUREMENT_OPTIONS} />
        <Select label="Sort by" value={filters.sort} onChange={set('sort')} options={SORT_OPTIONS} />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 'auto' }}>
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

      {showMore && (
        <div style={ROW}>
          <Select label="Added" value={filters.added} onChange={set('added')} options={ADDED_OPTIONS} />
          <Select label="Birthday" value={filters.birthday} onChange={set('birthday')} options={BIRTHDAY_OPTIONS} />
          <Select label="Source" value={filters.source} onChange={set('source')} allLabel="Any source" options={lists.sources} />
          <Select label="Gender" value={filters.gender} onChange={set('gender')} allLabel="Any" options={lists.genders} />
          <Select label="City / region" value={filters.city} onChange={set('city')} allLabel="Any city" options={lists.cities} />
        </div>
      )}

      <div className="cf-letters" role="group" aria-label="Name starts with"
           style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4 }}>
        <span className="cf-label" style={{ marginRight: 6 }}>Name starts with</span>
        <button type="button" className={`cf-letter${filters.letter === '' ? ' cf-letter--on' : ''}`}
                aria-pressed={filters.letter === ''} onClick={() => set('letter')('')}>All</button>
        {LETTERS.map((l) => {
          const n = lists.letters[l];
          const on = filters.letter === l;
          return (
            <button key={l} type="button" className={`cf-letter${on ? ' cf-letter--on' : ''}`}
                    aria-pressed={on} disabled={!n && !on}
                    title={l === '#' ? `Other characters: ${n}` : `${l}: ${n} customer${n === 1 ? '' : 's'}`}
                    onClick={() => set('letter')(on ? '' : l)}>
              {l}
            </button>
          );
        })}
      </div>
    </div>
  );
}
