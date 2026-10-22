/* Choose a customer by typing part of their name or mobile.

   Replaces the <select>s that listed every customer in the book: those needed
   the whole book in the browser, and a select of 1,500 names was no way to find
   one anyway. Matches come from the server (useCustomerLookup). `extraOptions`
   are fixed choices offered above the matches -- "+ New customer" and the
   like -- whose value the caller recognises. */
import { useState } from 'react';
import { X } from 'lucide-react';
import { formatMobile } from '../../services/format';
import { useCustomerById, useCustomerLookup } from './useCustomerLookup';

const nameOf = (c) => `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.mobile_number || 'Customer';

const LIST = {
  marginTop: 6, border: '1px solid var(--border-color, #e5e7eb)', borderRadius: 8,
  overflow: 'hidden', background: 'var(--surface-1, #fff)', maxHeight: 280, overflowY: 'auto',
};
const ROW = {
  display: 'flex', width: '100%', gap: 8, padding: '8px 12px', border: 0, background: 'none',
  cursor: 'pointer', textAlign: 'left', fontSize: 'var(--text-sm)', alignItems: 'baseline',
};
const NOTE = { margin: 0, padding: '10px 12px', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' };

export default function CustomerPicker({
  value, onChange, extraOptions = [], placeholder = 'Search by name or mobile', disabled = false,
  required = false, id, selectedLabel = '',
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const extra = extraOptions.find((o) => String(o.value) === String(value));
  const chosen = useCustomerById(value && !extra ? value : null);
  const { results, loading } = useCustomerLookup({ q: query, limit: 8, enabled: !value });

  const pick = (next, row = null) => { setQuery(''); setOpen(false); onChange(next, row); };

  if (value) {
    const label = extra ? extra.label
      : chosen ? `${nameOf(chosen)}${chosen.mobile_number ? ` · ${formatMobile(chosen.mobile_number)}` : ''}`
        : (selectedLabel || 'Loading…');
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 38 }}>
        <span className="form-control" style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
        </span>
        {!disabled && (
          <button type="button" className="btn-secondary at-btn-sm" aria-label="Choose a different customer"
                  onClick={() => pick('')}>
            <X size={14} /> Change
          </button>
        )}
      </div>
    );
  }

  const showList = open && (extraOptions.length > 0 || query.trim());
  return (
    <div style={{ position: 'relative' }}>
      <input id={id} type="text" className="form-control" value={query} autoComplete="off"
             disabled={disabled} placeholder={placeholder}
             onFocus={() => setOpen(true)}
             onBlur={() => setTimeout(() => setOpen(false), 150)}
             onChange={(e) => { setQuery(e.target.value); setOpen(true); }} />
      {/* The form's own "please choose" check, which a text box cannot give. */}
      {required && (
        <input tabIndex={-1} aria-hidden="true" required value={value || ''} onChange={() => {}}
               style={{ position: 'absolute', opacity: 0, height: 0, width: 0, bottom: 0, left: 16, pointerEvents: 'none' }} />
      )}
      {showList && (
        <div style={LIST} role="listbox">
          {extraOptions.map((o) => (
            <button key={o.value} type="button" className="at-row" style={ROW} role="option" aria-selected="false"
                    onMouseDown={(e) => e.preventDefault()} onClick={() => pick(o.value)}>
              <strong>{o.label}</strong>
            </button>
          ))}
          {query.trim() && (loading && results.length === 0 ? (
            <p style={NOTE}>Searching…</p>
          ) : results.length === 0 ? (
            <p style={NOTE}>No customer matches that.</p>
          ) : results.map((c) => (
            <button key={c.id} type="button" className="at-row" style={ROW} role="option" aria-selected="false"
                    onMouseDown={(e) => e.preventDefault()} onClick={() => pick(String(c.id), c)}>
              <strong>{nameOf(c)}</strong>
              <span style={{ color: 'var(--text-secondary)' }}>{formatMobile(c.mobile_number)}</span>
            </button>
          )))}
        </div>
      )}
    </div>
  );
}
