import { useEffect, useState } from 'react';
import { Check, FileSpreadsheet, Upload } from 'lucide-react';
import { displayMobile } from '../../utils/validate';
import { FormModal, InfoNote } from '../../components/ui/Atelier';
import { DataTable } from '../../components/ui/DataTable';
import { plural } from './customerFormHelpers';

/** Importing a spreadsheet of customers: the preview and the progress while it runs. */

// The bulk-import preview. Bare tables in the dialog: --lines takes off the frame.
const IMPORT_ERROR_COLUMNS = [
  { key: 'row', header: 'Row', width: 70, label: false },
  { key: 'error', header: 'Problem', label: false, cellProps: () => ({ style: { color: 'var(--danger-color)' } }) },
];

const IMPORT_VALID_COLUMNS = [
  { key: 'rows', header: 'Row', width: 70, label: false, render: (v) => v.rows.join(', ') },
  { key: 'name', header: 'Customer', label: false },
  { key: 'mobile', header: 'Mobile', label: false, render: (v) => displayMobile(v.mobile) },
  {
    key: 'action', header: '', label: false,
    cellProps: () => ({ style: { fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' } }),
    render: (v) => `${v.action === 'update' ? 'Existing: blanks filled in' : 'New'}${v.notes.length ? ` · ${v.notes.join(' ')}` : ''}`,
  },
];

export function ImportCustomersDialog({ state, onClose, onConfirm }) {
  const { preview, result, busy } = state;
  const valid = preview.valid.length;
  const bad = preview.errors.length;
  return (
    <FormModal icon={Upload} tone="green" onClose={busy ? undefined : onClose}
      title={result ? 'Import complete' : 'Import customers?'}
      subtitle={result
        ? `${result.created} added, ${result.updated} updated${bad ? `, ${bad} skipped` : ''}.`
        : bad
          ? `${plural(valid, 'customer')} ${valid === 1 ? 'is' : 'are'} valid and ${bad} ${bad === 1 ? 'has' : 'have'} errors. Do you want to import the ${valid} valid customer${valid === 1 ? '' : 's'}?`
          : `${plural(valid, 'customer')} ready to import.`}
      footer={result ? (
        <button className="btn-primary" onClick={onClose}>Done</button>
      ) : (
        <>
          <button className="btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn-primary" onClick={onConfirm} disabled={busy || valid === 0}>
            {busy ? 'Importing…' : `Import ${valid} valid customer${valid === 1 ? '' : 's'}`}
          </button>
        </>
      )}>
      {preview.ignored_columns.length > 0 && (
        <InfoNote>Ignored columns: {preview.ignored_columns.join(', ')}</InfoNote>
      )}
      {bad > 0 && (
        <DataTable columns={IMPORT_ERROR_COLUMNS} rows={preview.errors} rowKey="row"
                   wrapClassName="at-table-wrap--lines" tableStyle={{ marginBottom: 16 }} />
      )}
      {valid > 0 && (
        <DataTable columns={IMPORT_VALID_COLUMNS} rows={preview.valid} rowKey="mobile"
                   wrapClassName="at-table-wrap--lines" />
      )}
    </FormModal>
  );
}

/* While the sheet is on its way: a moving picture, the steps it goes through
   and the seconds so far, so a big file never looks like a frozen screen.
   The server answers in one go, so the steps follow the clock -- the last one
   stays live until the answer lands. */
const IMPORT_STEPS = {
  checking: [[0, 'Uploading the file'], [2, 'Reading the rows'], [5, 'Checking each customer']],
  saving: [[0, 'Sending the confirmed rows'], [3, 'Saving customers and measurements']],
};

export function ImportProgress({ phase, file, count }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const id = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 500);
    return () => clearInterval(id);
  }, [phase]);
  const steps = IMPORT_STEPS[phase];
  const current = steps.reduce((at, [from], i) => (seconds >= from ? i : at), 0);
  const size = file?.size ? ` · ${file.size < 1048576 ? `${Math.max(1, Math.round(file.size / 1024))} KB` : `${(file.size / 1048576).toFixed(1)} MB`}` : '';
  return (
    <FormModal icon={FileSpreadsheet} tone="green"
      title={phase === 'saving' ? 'Saving customers…' : 'Checking your sheet…'}
      subtitle={phase === 'saving' ? `Adding ${plural(count || 0, 'customer')}. Please keep this page open.` : `${file?.name || 'Spreadsheet'}${size}`}>
      <div className="imp-progress" role="status" aria-live="polite" aria-busy="true">
        <div className="imp-sheet" aria-hidden="true">
          <FileSpreadsheet size={40} strokeWidth={1.5} />
          <span className="imp-scan" />
        </div>
        <div className="imp-bar" aria-hidden="true"><span /></div>
        <ol className="imp-steps">
          {steps.map(([, text], i) => (
            <li key={text} className={i < current ? 'imp-step--done' : i === current ? 'imp-step--live' : ''}>
              <span className="imp-step-mark">{i < current ? <Check size={12} /> : null}</span>
              {text}
            </li>
          ))}
        </ol>
        <div className="imp-time">
          {seconds}s{seconds >= 10 ? ' · Large sheets can take a minute or two.' : ''}
        </div>
      </div>
    </FormModal>
  );
}
