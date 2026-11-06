import { useState, useEffect } from 'react';
import { ArrowRight } from 'lucide-react';
import { SUPERVISOR_ROLES } from '../../constants/roles';
import { api } from '../../api';
import Loader from '../../components/ui/Loader';
import { AddPhotoButton } from '../../components/ui/Atelier';
import { imageFilesError } from '../../utils/validate';

export function MaterialsChecklist({ orderId, role, onActivity, handed = false }) {
  const [plan, setPlan] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [opened, setOpened] = useState(false);
  const [busyLineId, setBusyLineId] = useState(null);
  const canEdit = handed || role === 'Owner' || SUPERVISOR_ROLES.includes(role);

  const refresh = () => api.getMaterialChecklist(orderId)
    .then((data) => { setPlan(data.plan); setLoaded(true); })
    .catch(() => setLoaded(true));
  useEffect(() => { if (opened) refresh(); /* eslint-disable-next-line */ }, [opened, orderId]);

  if (!opened) {
    return (
      <button type="button" className="btn-secondary at-btn-sm" onClick={() => setOpened(true)}>
        Show materials <ArrowRight size={14} />
      </button>
    );
  }
  if (!loaded) return <div style={{ padding: '6px 0' }}><Loader inline label="Loading materials…" /></div>;
  if (!plan || !(plan.lines || []).length) {
    return <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '6px 0' }}>No materials were planned on this order.</div>;
  }
  const remaining = plan.lines.filter((l) => !l.gathered_at).length;

  const act = async (fn) => {
    try { await fn(); await refresh(); if (onActivity) onActivity(); }
    catch (err) { alert(err.message); }
    finally { setBusyLineId(null); }
  };

  return (
    <div style={{ marginTop: '8px' }}>
      <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '8px', color: remaining ? '#b45309' : 'var(--success-text)' }}>
        {remaining ? `⚠ ${remaining} of ${plan.lines.length} still to gather` : `✓ All ${plan.lines.length} materials gathered`}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {plan.lines.map((line) => (
          <div key={line.id} style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '8px 10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: canEdit ? 'pointer' : 'default', flex: '1 1 auto' }}>
                <input
                  type="checkbox"
                  checked={!!line.gathered_at}
                  disabled={!canEdit || busyLineId === line.id}
                  onChange={(e) => {
                    setBusyLineId(line.id);
                    act(() => api.gatherMaterialLine(plan.id, line.id, e.target.checked));
                  }}
                />
                <span style={{ textDecoration: line.gathered_at ? 'line-through' : 'none' }}>
                  {line.material_name} — {line.required_quantity} {line.unit_display || line.unit}
                  {line.is_customer_supplied ? ' (customer\u2019s own)' : ''}
                </span>
              </label>
              {canEdit && (
                <AddPhotoButton camera className="btn-secondary" style={{ fontSize: '11px', padding: '3px 8px' }} iconSize={12}
                                disabled={busyLineId === line.id}
                                onFiles={([f]) => {
                                  const bad = imageFilesError([f]);
                                  if (bad) { alert(bad); return; }
                                  setBusyLineId(line.id);
                                  act(() => api.addMaterialLinePhoto(plan.id, line.id, f));
                                }} />
              )}
            </div>
            {(line.gathered_at || Number(line.consumed_quantity) > 0 || (line.photos || []).length > 0) && (
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px', display: 'flex', flexWrap: 'wrap', gap: '4px 12px', alignItems: 'center' }}>
                {line.gathered_at && (
                  <span>Gathered by {line.gathered_by_name || 'staff'} · {new Date(line.gathered_at).toLocaleDateString()}</span>
                )}
                {Number(line.consumed_quantity) > 0 && (
                  <span>{line.consumed_quantity} {line.unit_display || line.unit} used in stitching</span>
                )}
                {(line.photos || []).map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noreferrer">
                    <img src={url} alt="material" style={{ width: '34px', height: '34px', objectFit: 'cover', borderRadius: '4px', border: '1px solid var(--border-color)' }} />
                  </a>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
