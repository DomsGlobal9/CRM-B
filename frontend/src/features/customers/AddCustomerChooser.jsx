import { useRef, useState } from 'react';
import { Contact, Upload } from 'lucide-react';
import { api } from '../../api';
import { IconTile } from '../../components/ui/Atelier';
import { ImportCustomersDialog, ImportProgress } from './ImportCustomers';

/* Customers -> Add Customer: two doors, the spreadsheet or the form. Same
   card design as the order chooser (.wz-services), rendered inside the
   Customers tab so the sidebar and header stay put. */

/* The sample sheet the upload card offers: the columns the import reads, with
   a row showing what each holds. `referred_by_mobile` is the MOBILE NUMBER of
   the customer who referred that row -- Priya below is referred by someone
   already in the book, Anita by Rahul, who is added by this same sheet. */
const SAMPLE_COLUMNS = ['mobile', 'full_name', 'email', 'gender', 'city', 'address', 'source',
                        'tier', 'date_of_birth', 'notes', 'referred_by_mobile',
                        'bust', 'waist', 'hips', 'shoulder', 'arm_length', 'neck', 'length'];

const SAMPLE_ROWS = [
  ['9876543210', 'Rahul Menon', 'rahul@example.com', 'Male', 'Kochi', '12 Marine Drive', 'Walk In',
   'Silver', '1990-04-18', '', '', '', '32', '', '17', '24', '15', '40'],
  ['9123456789', 'Priya Sharma', '', 'Female', 'Pune', '', 'Referral',
   'Gold', '', 'Referred by an existing customer', '9000000001', '36', '30', '38', '15', '22', '14', '42'],
  ['9988776655', 'Anita Rao', '', 'Female', 'Kochi', '', 'Referral',
   'Silver', '', 'Referred by Rahul, who is added by this same sheet', '9876543210', '', '', '', '', '', '', ''],
];

/** The sample sheet, built here rather than shipped as a file so it can never
 *  drift from the columns the import actually reads. */
function downloadSampleSheet() {
  const quote = (cell) => (/[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell);
  const csv = [SAMPLE_COLUMNS, ...SAMPLE_ROWS].map((row) => row.map(quote).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'customers-sample.csv';
  link.click();
  URL.revokeObjectURL(url);
}

export function AddCustomerChooser({ onBack, onManual, onImported }) {
  const fileRef = useRef(null);
  const [imp, setImp] = useState(null); // { file, preview?, result?, busy }
  const [over, setOver] = useState(false); // a file is being dragged over the drop area

  const preview = async (file) => {
    if (!file) return;
    setImp({ file, busy: true });
    try {
      setImp({ file, preview: await api.importCustomers(file), busy: false });
    } catch (err) {
      setImp(null);
      alert(err.message);
    }
  };
  const confirm = async () => {
    setImp((prev) => ({ ...prev, busy: true }));
    try {
      const result = await api.importCustomers(imp.file, { commit: true });
      setImp((prev) => ({ ...prev, result, busy: false }));
      await onImported?.();
    } catch (err) {
      setImp((prev) => ({ ...prev, busy: false }));
      alert(err.message);
    }
  };

  return (
    <div className="selector-container">
      <div className="selector-header">
        {onManual && <h1 className="selector-title" style={{ fontFamily: 'var(--font-serif)', fontSize: '32px' }}>Add customer</h1>}
        <p className="selector-subtitle" style={{ color: 'var(--text-secondary)' }}>
          {onManual ? 'How would you like to add them?' : 'Bring an existing customer list in from a spreadsheet. A single new customer is added when you take their order.'}
        </p>
      </div>
      <input ref={fileRef} type="file" accept=".xlsx,.csv" style={{ display: 'none' }}
             onChange={(e) => { preview(e.target.files?.[0]); e.target.value = ''; }} />
      {/* Import only: one wide drop area, the way a file upload looks. */}
      {!onManual && (
        <div
          role="button" tabIndex={0} aria-disabled={imp?.busy || undefined}
          className={`cu-import-drop${over ? ' cu-import-drop--over' : ''}`}
          onClick={() => { if (!imp?.busy) fileRef.current?.click(); }}
          onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !imp?.busy) { e.preventDefault(); fileRef.current?.click(); } }}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); if (!imp?.busy) preview(e.dataTransfer.files?.[0]); }}
        >
          <span className="cu-import-drop-icon"><Upload size={26} /></span>
          <span className="cu-import-drop-title">Drag &amp; drop your Excel sheet here</span>
          <span className="cu-import-drop-sub">or</span>
          <span className="btn-primary cu-import-drop-btn"><Upload size={16} /> Choose file</span>
          <span className="cu-import-drop-hint">.xlsx or .csv · up to 2,000 customers with their measurements · checked first, saved only after you confirm</span>
        </div>
      )}
      {onManual && <div className="wz-services">
        <button type="button" className="wz-service" onClick={() => fileRef.current?.click()} disabled={imp?.busy}>
          <IconTile icon={Upload} tone="green" size={48} iconSize={22} />
          <span className="wz-service-title">Upload Excel sheet</span>
          <span className="wz-service-desc">An .xlsx or .csv of customers with their measurements, up to 2000 at a time. Checked first, saved only after you confirm.</span>
        </button>
        <button type="button" className="wz-service" onClick={onManual}>
          <IconTile icon={Contact} tone="amber" size={48} iconSize={22} />
          <span className="wz-service-title">Enter manually</span>
          <span className="wz-service-desc">One customer, typed in: profile and measurements on a single page.</span>
        </button>
      </div>}
      <p style={{ margin: '14px 0 0', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', textAlign: 'center' }}>
        Not sure of the columns?{' '}
        <button type="button" className="at-link" onClick={downloadSampleSheet}
                style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', font: 'inherit',
                         fontWeight: 600, color: 'var(--brand-link)' }}>
          Download a sample sheet
        </button>
        . To record who referred a customer, put the referrer&apos;s mobile number in{' '}
        <code>referred_by_mobile</code>; they must already be a customer, or be added by the same sheet.
      </p>
      {imp?.busy && (
        <ImportProgress phase={imp.preview ? 'saving' : 'checking'} file={imp.file} count={imp.preview?.valid.length} />
      )}
      {imp?.preview && !imp.busy && (
        <ImportCustomersDialog state={imp} onClose={() => { const done = !!imp.result; setImp(null); if (done) onBack(); }} onConfirm={confirm} />
      )}
    </div>
  );
}
