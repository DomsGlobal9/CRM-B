import { SearchBar } from '../../../components/ui/SearchBar';
import { useState } from 'react';
import { api } from '../../../api';
import { Contents, ScanBox } from './shelfParts';

/** Where is it?: finding an item by name, or seeing what is on a shelf. */

export default function WhereIsIt({ location }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [spot, setSpot] = useState(null);

  const search = async (e) => {
    e?.preventDefault();
    if (!q.trim()) return;
    setBusy(true); setError(''); setSpot(null);
    try { setResults(await api.findOnShelves(q.trim(), location.id)); }
    catch (err) { setError(err.message || 'Search failed.'); }
    finally { setBusy(false); }
  };

  return (
    <div className="sh-panel">
      <form className="sh-scan-row" onSubmit={search}>
        <SearchBar value={q} onChange={setQ} placeholder="Type a name, code or colour — e.g. red silk" ariaLabel="Search an item" style={{ flex: '1 1 auto', maxWidth: 'none' }} />
        <button type="submit" className="btn-primary" disabled={busy || !q.trim()}>{busy ? 'Looking…' : 'Find'}</button>
      </form>
      <div className="sh-or">or see what is on a shelf</div>
      <ScanBox location={location} onSpot={(s) => { setSpot(s); setResults(null); }} />
      {error && <div className="sh-error" role="alert">{error}</div>}

      {spot && (
        <div className="sh-card">
          <div className="sh-card-head"><b className="sh-address">{spot.address}</b>{spot.name && <span className="sh-muted"> · {spot.name}</span>}</div>
          <Contents rows={spot.contents} />
        </div>
      )}
      {results && results.length === 0 && <div className="sh-empty">Nothing matches “{q}”.</div>}
      {results && results.map((r) => (
        <div key={r.item.id} className="sh-card">
          <div className="sh-card-head"><b>{r.item.name}</b><span className="sh-muted">{r.item.item_code}{r.item.color ? ` · ${r.item.color}` : ''}</span></div>
          {r.locations.length === 0 && <div className="sh-muted">Not in stock anywhere.</div>}
          {r.locations.map((l) => (
            <div key={l.location.id} className="sh-where">
              <div className="sh-where-loc">{l.location.name} · <b>{l.total_text}</b> in all</div>
              <div className="sh-chips">
                {l.shelves.map((s) => (
                  <span key={s.spot.id} className="sh-chip sh-chip--shelf"><b className="sh-address">{s.spot.address}</b> · {s.quantity_text}</span>
                ))}
                {Number(l.not_shelved) > 0 && <span className="sh-chip sh-chip--loose">Not shelved · {l.not_shelved_text}</span>}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
