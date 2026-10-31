/* "Add other measurement": measurements a garment's template does not ask for,
   named and measured at the counter. Kept as [{ label, value }] under one key
   of the garment's values (EXTRA_MEASUREMENTS, services/templates.js), in
   inches like the template's own. A row is typed in, then Done files it as a
   compact line that can be opened again (pencil) or removed. */
import { useState } from 'react';
import { Check, Pencil, Plus, X } from 'lucide-react';

import { cleanAmount } from '../../services/validate';
import { EXTRA_LABEL_MAX, EXTRA_MEASUREMENTS, EXTRA_MEASUREMENTS_MAX } from '../../services/templates';

const filled = (row) => Boolean(String(row?.label ?? '').trim() && String(row?.value ?? '').trim());

/** Why a row cannot be filed yet, or ''. The same rule the server applies. */
const rowProblem = (row) => {
  const label = String(row?.label ?? '').trim();
  const value = String(row?.value ?? '').trim();
  if (!label) return 'Give this measurement a name.';
  if (!value) return `Enter a value for ${label}.`;
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0 || number > 999.99) return `${label} must be more than 0 and at most 999.99.`;
  return '';
};

export default function ExtraMeasurements({ values, error, onChange }) {
  const rows = Array.isArray(values?.[EXTRA_MEASUREMENTS]) ? values[EXTRA_MEASUREMENTS] : [];
  // Rows being typed in, by position. A draft reopened shows its filled rows
  // filed and any half-typed one still open.
  const [open, setOpen] = useState(() => new Set(rows.map((row, i) => (filled(row) ? null : i)).filter((i) => i !== null)));
  const [problems, setProblems] = useState({});

  const save = (next) => onChange({ ...values, [EXTRA_MEASUREMENTS]: next });
  const edit = (i, patch) => {
    save(rows.map((row, n) => (n === i ? { ...row, ...patch } : row)));
    if (problems[i]) setProblems((p) => ({ ...p, [i]: '' }));
  };
  const add = () => {
    setOpen((s) => new Set(s).add(rows.length));
    save([...rows, { label: '', value: '' }]);
  };
  const done = (i) => {
    const problem = rowProblem(rows[i]);
    if (problem) { setProblems((p) => ({ ...p, [i]: problem })); return; }
    setOpen((s) => { const next = new Set(s); next.delete(i); return next; });
  };
  const reopen = (i) => setOpen((s) => new Set(s).add(i));
  const remove = (i) => {
    // Positions after the removed row move up one.
    setOpen((s) => new Set([...s].filter((n) => n !== i).map((n) => (n > i ? n - 1 : n))));
    setProblems({});
    save(rows.filter((_, n) => n !== i));
  };

  const filed = rows.map((row, i) => ({ row, i })).filter(({ i }) => !open.has(i));
  const editing = rows.map((row, i) => ({ row, i })).filter(({ i }) => open.has(i));

  return (
    <div className="xm">
      {filed.length > 0 && (
        <div className="xm-filed">
          {filed.map(({ row, i }) => (
            <div className="xm-chip" key={i}>
              <span className="xm-chip-name">{String(row.label ?? '').trim() || 'Unnamed'}</span>
              <span className="xm-chip-value">{String(row.value ?? '').trim() || '—'} in</span>
              <button type="button" className="xm-chip-btn" aria-label={`Edit ${row.label || 'this measurement'}`} onClick={() => reopen(i)}>
                <Pencil size={14} />
              </button>
              <button type="button" className="xm-chip-btn" aria-label={`Remove ${row.label || 'this measurement'}`} onClick={() => remove(i)}>
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
      {editing.map(({ row, i }) => (
        <div className="xm-edit" key={i}>
          <div className="xm-row">
            <label className="form-group xm-name">
              <span className="form-label">Measurement name</span>
              <input className="form-control" type="text" value={row.label || ''} maxLength={EXTRA_LABEL_MAX}
                     placeholder="e.g. Bicep round" autoFocus={!row.label && !row.value}
                     onChange={(e) => edit(i, { label: e.target.value })}
                     onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); done(i); } }} />
            </label>
            <label className="form-group xm-value">
              <span className="form-label">Measurement</span>
              <div className="tf-unit-input">
                <input className="form-control" type="text" inputMode="decimal" value={row.value ?? ''} placeholder="—"
                       onChange={(e) => edit(i, { value: cleanAmount(e.target.value, { max: 999.99, decimals: 2 }) })}
                       onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); done(i); } }} />
                <span className="tf-unit" aria-hidden="true">in</span>
              </div>
            </label>
            <div className="xm-actions">
              <button type="button" className="btn-primary xm-done" onClick={() => done(i)}>
                <Check size={16} /> Done
              </button>
              <button type="button" className="xm-remove" aria-label={`Remove ${row.label || 'this measurement'}`}
                      onClick={() => remove(i)}>
                <X size={16} />
              </button>
            </div>
          </div>
          {problems[i] && <div className="xm-error" role="alert">{problems[i]}</div>}
        </div>
      ))}
      {error && <div className="xm-error" role="alert">{error}</div>}
      {rows.length < EXTRA_MEASUREMENTS_MAX && (
        <button type="button" className="btn-secondary xm-add" onClick={add}>
          <Plus size={16} /> Add other measurement
        </button>
      )}
    </div>
  );
}
