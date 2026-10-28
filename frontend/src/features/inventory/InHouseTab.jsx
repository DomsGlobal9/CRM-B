/* Inventory > In-house: every garment the boutique has set the workroom to
   make for its own stock (New order > In-house), one card per run -- what it
   is, how many, how far the workroom has got, and whether it has reached the
   shelf. A run ends in stock by itself when its last step is signed off
   (apps/inventory/finished_goods.py), so "In stock" here is that. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, CheckCircle2, Factory, Search, UserRound } from 'lucide-react';
import { api } from '../../services/api';
import { resolveMediaUrl } from '../../services/media';
import Loader from '../../components/ui/Loader';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'making', label: 'In production' },
  { key: 'stocked', label: 'In stock' },
];

const fmtDate = (value) => {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

/** Where a run stands: in stock, cancelled, or the step it is on. */
const stateOf = (run) => {
  if (run.order_status === 'Cancelled') return { key: 'cancelled', label: 'Cancelled' };
  if (run.production_status === 'COMPLETED') return { key: 'stocked', label: 'In stock' };
  const stages = run.stages || [];
  const current = stages.find((s) => s.status === 'IN_PROGRESS' || s.status === 'PAUSED' || s.status === 'PENDING_VERIFICATION')
    || stages.find((s) => s.status !== 'COMPLETED' && s.status !== 'SKIPPED');
  return { key: 'making', label: current?.stage_name || 'In production' };
};

export default function InHouseTab() {
  const [runs, setRuns] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  const load = useCallback(() => api.getInternalProduction()
    .then((rows) => { setError(null); setRuns(Array.isArray(rows) ? rows : (rows?.results || [])); })
    .catch((err) => { setError(err.message || 'Could not load the in-house garments.'); setRuns([]); }), []);
  useEffect(() => { load(); }, [load]);
  const retry = () => { setError(null); setRuns(null); load(); };

  const counts = useMemo(() => {
    const c = { all: 0, making: 0, stocked: 0 };
    (runs || []).forEach((run) => {
      const s = stateOf(run).key;
      c.all += 1;
      if (s === 'making' || s === 'stocked') c[s] += 1;
    });
    return c;
  }, [runs]);

  const needle = search.trim().toLowerCase();
  const shown = (runs || []).filter((run) => {
    if (filter !== 'all' && stateOf(run).key !== filter) return false;
    if (!needle) return true;
    return `${run.order_reference || ''} ${run.garment_label || ''} ${(run.garment_jobs || []).map((j) => j.display_name).join(' ')}`
      .toLowerCase().includes(needle);
  });

  if (runs === null) return <Loader section label="Loading in-house garments…" />;

  return (
    <div className="ih-tab">
      <div className="ih-filters" role="group" aria-label="Show">
        {FILTERS.map((f) => (
          <button key={f.key} type="button" aria-pressed={filter === f.key}
                  className={`ih-chip${filter === f.key ? ' ih-chip--on' : ''}`} onClick={() => setFilter(f.key)}>
            {f.label} <span className="ih-chip-count">{counts[f.key]}</span>
          </button>
        ))}
      </div>

      <label className="ih-search">
        <Search size={18} />
        <input className="form-control" value={search} onChange={(e) => setSearch(e.target.value)}
               placeholder="Search by garment or run number…" aria-label="Search in-house garments" />
      </label>

      {error && (
        <div className="ih-empty ih-empty--error">
          {error} <button type="button" className="btn-secondary at-btn-sm" onClick={retry}>Retry</button>
        </div>
      )}

      {!error && shown.length === 0 && (
        <div className="ih-empty">
          <Factory size={28} />
          <div className="ih-empty-title">{(runs || []).length === 0 ? 'No in-house garments yet' : 'Nothing matches'}</div>
          <div className="ih-empty-sub">
            {(runs || []).length === 0
              ? 'Garments made for the boutique’s own stock show here. Start one from New order › In-house.'
              : 'Try another filter or search.'}
          </div>
        </div>
      )}

      {shown.length > 0 && (
        <div className="ih-grid">
          {shown.map((run) => {
            const state = stateOf(run);
            const stages = run.stages || [];
            const done = stages.filter((s) => s.status === 'COMPLETED' || s.status === 'SKIPPED').length;
            const pieces = (run.garment_jobs || []).length;
            const photo = run.completed_garment_image || run.garment_images?.[0]?.image || run.garment_images?.[0]?.image_url;
            const who = run.master_name || run.tailor_name;
            return (
              <article key={run.id} className="ih-card">
                <div className="ih-card-img">
                  {photo
                    ? <img src={resolveMediaUrl(photo)} alt={run.garment_label || 'In-house garment'} />
                    : <Factory size={34} aria-hidden="true" />}
                  <span className="ih-badge ih-badge--ref">{run.order_reference}</span>
                  <span className={`ih-badge ih-badge--${state.key}`}>
                    {state.key === 'stocked' && <CheckCircle2 size={12} />} {state.key === 'making' ? 'In production' : state.label}
                  </span>
                </div>
                <div className="ih-card-body">
                  <div className="ih-card-title">{run.garment_label || 'Garment'}</div>
                  <div className="ih-card-sub">
                    {pieces} {pieces === 1 ? 'piece' : 'pieces'}{state.key === 'making' ? ` · ${state.label}` : ''}
                  </div>
                  {stages.length > 0 && state.key !== 'cancelled' && (
                    <div className="ih-progress" aria-label={`${done} of ${stages.length} steps done`}>
                      <span style={{ width: `${Math.round((done / stages.length) * 100)}%` }} />
                    </div>
                  )}
                  <div className="ih-card-meta">
                    <span><CalendarDays size={13} /> Started {fmtDate(run.order_date) || '—'}</span>
                    {run.estimated_delivery && state.key === 'making' && <span>Ready by {fmtDate(run.estimated_delivery)}</span>}
                    {who && <span><UserRound size={13} /> {who}</span>}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
