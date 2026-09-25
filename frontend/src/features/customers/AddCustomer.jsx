import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, Contact, FileSpreadsheet, Ruler, Upload, User } from 'lucide-react';
import { api } from '../../services/api';
import { LIMITS, cleanEmail, cleanMobile, cleanName, displayMobile, emailError, mobileError, nameError } from '../../services/validate';
import { FormModal, IconTile, InfoNote } from '../../components/ui/Atelier';

/* Customers -> Add Customer: two doors, the spreadsheet or the form. Same
   card design as the order chooser (.wz-services), rendered inside the
   Customers tab so the sidebar and header stay put. */

const CORE = [['bust', 'Bust'], ['waist', 'Waist'], ['hips', 'Hips'], ['shoulder', 'Shoulder'],
              ['arm_length', 'Arm Length'], ['neck', 'Neck'], ['length', 'Length']];
// The template keys the spreadsheet import accepts, grouped as the sample sheet groups them.
const MORE = {
  'Upper body (blouse / kurta / shirt)': [
    'blouse_length', 'upper_chest', 'underbust', 'armhole', 'upper_arm', 'elbow', 'wrist', 'sleeve_length',
    'shoulder_to_bust', 'shoulder_to_waist', 'front_neck_depth', 'back_neck_depth', 'full_length',
  ],
  'Lower body (lehenga / skirt / churidar / trouser)': [
    'floor_length', 'height', 'high_waist', 'waist_to_hip', 'waist_to_floor', 'waist_to_ankle', 'heel_height',
    'total_ghera', 'hem_circumference', 'thigh', 'knee', 'calf', 'ankle', 'inseam', 'outseam', 'crotch',
  ],
};
const label = (key) => key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const EMPTY = {
  first_name: '', last_name: '', mobile_number: '', email_address: '', gender: '', address: '', city_region: '',
  source: 'Walk In', customer_type: 'Silver', date_of_birth: '', notes: '', measurements: {},
};

// A bare green link at the top-left, not a stretched button.
const BACK = { alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6, padding: 0, marginTop: -16,
               background: 'none', border: 0, cursor: 'pointer', font: 'inherit', fontSize: 14, fontWeight: 600, color: 'var(--brand-link)' };

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

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
        <table className="at-table at-table--fit" style={{ marginBottom: 16 }}>
          <thead><tr><th style={{ width: 70 }}>Row</th><th>Problem</th></tr></thead>
          <tbody>
            {preview.errors.map((e) => (
              <tr key={e.row}><td>{e.row}</td><td style={{ color: 'var(--danger, #b42318)' }}>{e.error}</td></tr>
            ))}
          </tbody>
        </table>
      )}
      {valid > 0 && (
        <table className="at-table at-table--fit">
          <thead><tr><th style={{ width: 70 }}>Row</th><th>Customer</th><th>Mobile</th><th></th></tr></thead>
          <tbody>
            {preview.valid.map((v) => (
              <tr key={v.mobile}>
                <td>{v.rows.join(', ')}</td>
                <td>{v.name}</td>
                <td>{displayMobile(v.mobile)}</td>
                <td style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                  {v.action === 'update' ? 'Existing: blanks filled in' : 'New'}{v.notes.length ? ` · ${v.notes.join(' ')}` : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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

function ImportProgress({ phase, file, count }) {
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

export function AddCustomerChooser({ onBack, onManual, onImported }) {
  const fileRef = useRef(null);
  const [imp, setImp] = useState(null); // { file, preview?, result?, busy }

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
      <button type="button" onClick={onBack} style={BACK}>
        <ArrowLeft size={16} /> Customers
      </button>
      <div className="selector-header">
        <h1 className="selector-title" style={{ fontFamily: 'var(--font-serif)', fontSize: '32px' }}>Add customer</h1>
        <p className="selector-subtitle" style={{ color: 'var(--text-secondary)' }}>How would you like to add them?</p>
      </div>
      <input ref={fileRef} type="file" accept=".xlsx,.csv" style={{ display: 'none' }}
             onChange={(e) => { preview(e.target.files?.[0]); e.target.value = ''; }} />
      <div className="wz-services">
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
      </div>
      {imp?.busy && (
        <ImportProgress phase={imp.preview ? 'saving' : 'checking'} file={imp.file} count={imp.preview?.valid.length} />
      )}
      {imp?.preview && !imp.busy && (
        <ImportCustomersDialog state={imp} onClose={() => { const done = !!imp.result; setImp(null); if (done) onBack(); }} onConfirm={confirm} />
      )}
    </div>
  );
}

// Inch boxes wrap to the width available; no .form-grid-4 exists outside the phone rules.
const INCH_GRID = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 16 };

const inch = (value) => (value === '' || value === undefined || value === null ? '' : value);

export function CustomerForm({ onBack, onSaved }) {
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const setInch = (key, value) => setForm((prev) => ({ ...prev, measurements: { ...prev.measurements, [key]: value } }));

  const submit = async (e) => {
    e.preventDefault();
    const problem = nameError(form.first_name, { label: 'First name' })
      || nameError(form.last_name, { label: 'Last name', required: false, min: 1 })
      || mobileError(form.mobile_number)
      || emailError(form.email_address);
    if (problem) { setError(problem); return; }
    setBusy(true);
    setError(null);
    // Inches typed go on the sheet's own columns; template keys ride in
    // additional_measurements under their own name, as the import stores them.
    const core = {}; const extras = {};
    Object.entries(form.measurements).forEach(([key, value]) => {
      if (value === '') return;
      (CORE.some(([k]) => k === key) ? core : extras)[key] = Number(value);
    });
    const payload = {
      ...Object.fromEntries(Object.entries(form).filter(([k, v]) => k !== 'measurements' && v !== '')),
      first_name: cleanName(form.first_name).trim(),
      last_name: cleanName(form.last_name).trim(),
      mobile_number: cleanMobile(form.mobile_number),
    };
    if (Object.keys(core).length || Object.keys(extras).length) payload.measurements = { ...core, additional_measurements: extras };
    try {
      const row = await api.createCustomer(payload);
      await onSaved?.(row);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const inchInput = (key, name) => (
    <div className="form-group" key={key}>
      <label className="form-label" htmlFor={`cf-${key}`}>{name} <span className="od-hint">(in)</span></label>
      <input id={`cf-${key}`} type="number" className="form-control" min="0" max="120" step="0.25"
             value={inch(form.measurements[key])} onChange={(e) => setInch(key, e.target.value)} />
    </div>
  );

  return (
    <form className="selector-container" onSubmit={submit} noValidate>
      <button type="button" onClick={onBack} style={BACK}>
        <ArrowLeft size={16} /> Add customer
      </button>
      <div className="page-title-group">
        <h1 className="page-title">New customer</h1>
        <p className="page-subtitle">Their details and measurements. Only the name and mobile are needed to start.</p>
      </div>

      <div className="content-card wz-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <IconTile icon={User} tone="green" size={36} iconSize={16} />
          <strong>Profile</strong>
        </div>
        <div className="form-grid-2">
          <div className="form-group">
            <label className="form-label" htmlFor="cf-first">First name <span className="required">*</span></label>
            <input id="cf-first" type="text" className="form-control" value={form.first_name} maxLength={LIMITS.name} autoFocus
                   onChange={(e) => set('first_name', cleanName(e.target.value))} placeholder="e.g. Amara" />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="cf-last">Last name</label>
            <input id="cf-last" type="text" className="form-control" value={form.last_name} maxLength={LIMITS.name}
                   onChange={(e) => set('last_name', cleanName(e.target.value))} placeholder="e.g. Singh" />
          </div>
        </div>
        <div className="form-grid-2">
          <div className="form-group">
            <label className="form-label" htmlFor="cf-mobile">Mobile number <span className="required">*</span></label>
            <div className="input-wrapper">
              <span className="input-icon-left" style={{ fontSize: '14px', left: '12px' }}>🇮🇳 +91</span>
              <input id="cf-mobile" type="tel" inputMode="numeric" value={form.mobile_number}
                     onChange={(e) => set('mobile_number', cleanMobile(e.target.value))}
                     style={{ paddingLeft: '65px' }} placeholder="98765 43210" />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="cf-gender">Gender</label>
            <select id="cf-gender" className="form-control" value={form.gender} onChange={(e) => set('gender', e.target.value)}>
              <option value="">Select Gender</option>
              <option value="Female">Female</option>
              <option value="Male">Male</option>
              <option value="Other">Other</option>
            </select>
          </div>
        </div>
        <div className="form-grid-2">
          <div className="form-group">
            <label className="form-label" htmlFor="cf-email">Email address</label>
            <input id="cf-email" type="email" className="form-control" value={form.email_address} maxLength={LIMITS.email}
                   onChange={(e) => set('email_address', e.target.value)} onBlur={(e) => set('email_address', cleanEmail(e.target.value))}
                   placeholder="e.g. amara.s@example.com" />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="cf-city">City / Region</label>
            <input id="cf-city" type="text" className="form-control" value={form.city_region} maxLength={LIMITS.name}
                   onChange={(e) => set('city_region', e.target.value)} placeholder="e.g. Hyderabad" />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="cf-address">Address</label>
          <input id="cf-address" type="text" className="form-control" value={form.address} maxLength={LIMITS.address}
                 onChange={(e) => set('address', e.target.value)} placeholder="Street name, Apartment, City, State, PIN code" />
        </div>
        <div className="form-grid-3">
          <div className="form-group">
            <label className="form-label" htmlFor="cf-tier">Customer tier</label>
            <select id="cf-tier" className="form-control" value={form.customer_type} onChange={(e) => set('customer_type', e.target.value)}>
              <option value="Silver">Silver</option>
              <option value="Gold">Gold</option>
              <option value="Platinum">Platinum</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="cf-source">Source</label>
            <select id="cf-source" className="form-control" value={form.source} onChange={(e) => set('source', e.target.value)}>
              <option value="Walk In">Walk In</option>
              <option value="Instagram">Instagram</option>
              <option value="Referral">Referral</option>
              <option value="Website">Website</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="cf-dob">Date of birth</label>
            <input id="cf-dob" type="date" className="form-control" value={form.date_of_birth} onChange={(e) => set('date_of_birth', e.target.value)} />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="cf-notes">Notes</label>
          <textarea id="cf-notes" className="form-control" rows={2} value={form.notes} maxLength={LIMITS.note}
                    onChange={(e) => set('notes', e.target.value)} placeholder="Anything worth remembering about them" />
        </div>
      </div>

      <div className="content-card wz-card" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <IconTile icon={Ruler} tone="amber" size={36} iconSize={16} />
          <strong>Measurements</strong> <span className="od-hint">(optional, inches)</span>
        </div>
        <div style={INCH_GRID}>{CORE.map(([key, name]) => inchInput(key, name))}</div>
        <details className="wz-more">
          <summary>More measurements <span className="od-hint">(what the Excel import also accepts)</span></summary>
          {Object.entries(MORE).map(([group, keys]) => (
            <div key={group} style={{ marginTop: 12 }}>
              <div className="form-label" style={{ marginBottom: 8 }}>{group}</div>
              <div style={INCH_GRID}>{keys.map((key) => inchInput(key, label(key)))}</div>
            </div>
          ))}
        </details>
      </div>

      {error && <p className="form-error" role="alert" style={{ marginTop: 12, color: 'var(--danger, #b42318)' }}>{error}</p>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
        <button type="button" className="btn-secondary" onClick={onBack} disabled={busy}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save customer'}</button>
      </div>
    </form>
  );
}
