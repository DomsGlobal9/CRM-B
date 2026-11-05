import { useState } from 'react';
import { X } from 'lucide-react';
import { formatMobile } from '../../utils/format';
import { useCustomerLookup } from './useCustomerLookup';

/** Choosing who referred a new customer. */

const customerLabel = (c) => `${c?.first_name || ''} ${c?.last_name || ''}`.trim();

/** Who referred a new customer: an existing customer, searched by name or
 *  mobile and picked from the list. The referrer must already be in the book,
 *  so a number that matches nobody cannot be entered as one. The search is the
 *  server's (/customers/lookup/): the whole book is not held in the browser. */
export function ReferredByPicker({ value, onChange }) {
  const [query, setQuery] = useState('');
  const { results: matches, loading } = useCustomerLookup({ q: query, limit: 8, enabled: !value });

  if (value) {
    return (
      <div className="form-group">
        <label className="form-label">Referred by <span className="od-hint">(optional)</span></label>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                      borderRadius: 99, background: 'var(--brand-surface, #ecfdf5)',
                      border: '1px solid var(--brand-border, #a7f3d0)', fontSize: 'var(--text-sm)' }}>
          <span><strong>{value.name}</strong> · {formatMobile(value.mobile)}</span>
          <button type="button" aria-label={`Remove ${value.name} as the referrer`}
                  onClick={() => { setQuery(''); onChange(null); }}
                  style={{ display: 'inline-flex', background: 'none', border: 0, padding: 0,
                           cursor: 'pointer', color: 'var(--text-secondary)' }}>
            <X size={14} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="form-group">
      <label className="form-label" htmlFor="cf-referrer">Referred by <span className="od-hint">(optional)</span></label>
      <input id="cf-referrer" type="text" className="form-control" value={query} autoComplete="off"
             onChange={(e) => setQuery(e.target.value)}
             placeholder="Search an existing customer by name or mobile" />
      {query.trim() && (
        <div style={{ marginTop: 6, border: '1px solid var(--border-color, #e5e7eb)', borderRadius: 8,
                      overflow: 'hidden', background: 'var(--surface-1, #fff)' }}>
          {matches.length === 0 ? (
            <p style={{ margin: 0, padding: '10px 12px', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
              {loading ? 'Searching…'
                : 'No customer matches that. The referrer has to be someone already in the customer book.'}
            </p>
          ) : matches.map((c) => (
            <button key={c.id} type="button" className="at-row"
                    onClick={() => { setQuery(''); onChange({ id: c.id, name: customerLabel(c), mobile: c.mobile_number }); }}
                    style={{ display: 'flex', width: '100%', gap: 8, padding: '8px 12px', border: 0,
                             background: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 'var(--text-sm)' }}>
              <strong>{customerLabel(c)}</strong>
              <span style={{ color: 'var(--text-secondary)' }}>{formatMobile(c.mobile_number)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
