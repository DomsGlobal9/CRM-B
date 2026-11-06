import { useState, useEffect } from 'react';
import { api } from '../../api';
import Loader from '../../components/ui/Loader';
import { LIMITS, cleanAmount } from '../../utils/validate';

export function CuttingUsage({ orderId }) {
  const [plan, setPlan] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState({});
  const [busyLineId, setBusyLineId] = useState(null);

  const refresh = () => api.getMaterialChecklist(orderId)
    .then((data) => { setPlan(data.plan); setLoaded(true); })
    .catch(() => setLoaded(true));
  useEffect(() => { refresh(); }, [orderId]);

  if (!loaded) return <Loader inline label="Loading materials…" />;
  const lines = (plan?.lines || []).filter((l) => l.item && !l.is_customer_supplied);
  if (!lines.length) {
    return <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No stock material is planned on this order.</div>;
  }
  const unit = (line) => (line.unit_display || line.unit || '').toLowerCase();
  const record = async (line) => {
    const entry = draft[line.id] || {};
    const used = Number(entry.used || 0);
    const wasted = Number(entry.wasted || 0);
    if (!(used > 0 || wasted > 0)) { alert('Enter the quantity used, the waste, or both.'); return; }
    setBusyLineId(line.id);
    try {
      await api.consumePlanLine(plan.id, { line: line.id, used, wasted, stage_key: 'pattern_cutting' });
      setDraft((d) => ({ ...d, [line.id]: {} }));
      await refresh();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusyLineId(null);
    }
  };
  const num = { padding: '6px 8px', fontSize: '13px', width: '96px' };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {lines.map((line) => (
        <div key={line.id} style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px 12px',
                                    display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px' }}>
          <div style={{ flex: '1 1 220px', minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: '13.5px' }}>{line.material_name}</div>
            <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>
              {line.garment_name ? `${line.garment_name} · ` : ''}
              planned {line.required_quantity} {unit(line)} · reserved {line.reserved_quantity}
              {Number(line.consumed_quantity) > 0 ? ` · used ${line.consumed_quantity}` : ''}
              {Number(line.wasted_quantity) > 0 ? ` · waste ${line.wasted_quantity}` : ''}
              {line.available_stock !== undefined && line.available_stock !== null ? ` · ${line.available_stock} on the shelf` : ''}
            </div>
          </div>
          <input type="number" min="0" max={LIMITS.quantity} step="0.001" inputMode="decimal" className="form-control" style={num} placeholder={`Used (${unit(line)})`}
                 value={draft[line.id]?.used ?? ''}
                 onChange={(e) => { const used = cleanAmount(e.target.value, { max: LIMITS.quantity, decimals: 3 }); setDraft((d) => ({ ...d, [line.id]: { ...(d[line.id] || {}), used } })); }} />
          <input type="number" min="0" max={LIMITS.quantity} step="0.001" inputMode="decimal" className="form-control" style={num} placeholder="Waste"
                 value={draft[line.id]?.wasted ?? ''}
                 onChange={(e) => { const wasted = cleanAmount(e.target.value, { max: LIMITS.quantity, decimals: 3 }); setDraft((d) => ({ ...d, [line.id]: { ...(d[line.id] || {}), wasted } })); }} />
          <button type="button" className="btn-secondary" style={{ fontSize: '12px', padding: '6px 12px' }}
                  disabled={busyLineId === line.id} onClick={() => record(line)}>
            {busyLineId === line.id ? 'Recording…' : 'Record'}
          </button>
        </div>
      ))}
    </div>
  );
}
