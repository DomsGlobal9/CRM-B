import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { MAX_LINES, MAX_LINE_LENGTH } from './adjustments';
import { DataTable } from '../../components/ui/DataTable';

/**
 * Measurement changes as a table: one row per measurement, a column for the
 * change. Reads and writes the same "key: value" lines the textarea held, so
 * parseAdjustments / formatAdjustments and everything that stores or shows
 * the adjustments are untouched -- only the way they are typed changed.
 *
 * Rows live here as state while they are being edited (an empty row must be
 * able to exist on screen); the text handed up is only the complete ones, in
 * order. A line typed without a colon before this existed ("sleeves feel
 * tight") still round-trips: it arrives as a row with an empty measurement
 * and goes back out as the bare sentence.
 */

const toRows = (text) => (text || '').split('\n').map((line) => line.trim()).filter(Boolean)
  .map((line) => {
    const at = line.indexOf(':');
    return at > 0
      ? { measurement: line.slice(0, at).trim(), change: line.slice(at + 1).trim() }
      : { measurement: '', change: line };
  });

const toText = (rows) => rows
  .filter((r) => r.measurement.trim() || r.change.trim())
  .map((r) => (r.measurement.trim() ? `${r.measurement.trim()}: ${r.change.trim()}` : r.change.trim()))
  .join('\n');

const BLANK = { measurement: '', change: '' };

export default function AdjustmentsTable({ value, onChange, measurementPlaceholder = 'e.g. waist', changePlaceholder = 'e.g. +1 inch' }) {
  const [rows, setRows] = useState(() => { const r = toRows(value); return r.length ? r : [{ ...BLANK }]; });

  const update = (next) => { setRows(next); onChange(toText(next)); };
  const edit = (i, key) => (e) => update(rows.map((r, j) => (j === i ? { ...r, [key]: e.target.value } : r)));
  const remove = (i) => update(rows.length === 1 ? [{ ...BLANK }] : rows.filter((_, j) => j !== i));
  const add = () => { if (rows.length < MAX_LINES) update([...rows, { ...BLANK }]); };

  const input = { width: '100%', margin: 0, padding: '7px 10px', fontSize: '13px', minHeight: 0 };

  return (
    <div>
      {/* Rows have no id of their own, so each is keyed by its place, as it was. */}
      <DataTable
        fit={false}
        tableStyle={{ minWidth: 0 }}
        rows={rows}
        rowKey={(row) => rows.indexOf(row)}
        columns={[
          {
            key: 'measurement', header: 'Measurement', width: '38%',
            render: (row, i) => (
              <input className="form-control" style={input} placeholder={measurementPlaceholder} maxLength={60}
                     value={row.measurement} onChange={edit(i, 'measurement')} aria-label={`Measurement ${i + 1}`} />
            ),
          },
          {
            key: 'change', header: 'Change',
            render: (row, i) => (
              <input className="form-control" style={input} placeholder={changePlaceholder} maxLength={MAX_LINE_LENGTH}
                     value={row.change} onChange={edit(i, 'change')} aria-label={`Change ${i + 1}`}
                     onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (i === rows.length - 1) add(); } }} />
            ),
          },
          {
            key: 'remove', header: <span className="ld-sr">Remove</span>, width: '32px', align: 'right', label: false,
            render: (row, i) => (
              <button type="button" onClick={() => remove(i)} title="Remove row" aria-label={`Remove row ${i + 1}`}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px' }}>
                <Trash2 size={14} />
              </button>
            ),
          },
        ]}
      />
      <button type="button" onClick={add} disabled={rows.length >= MAX_LINES}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: '4px', padding: '4px 8px',
                       fontSize: '12px', fontWeight: 600, color: 'var(--primary-color, #107c41)', background: 'none',
                       border: 'none', cursor: 'pointer' }}>
        <Plus size={13} /> Add measurement
      </button>
    </div>
  );
}
