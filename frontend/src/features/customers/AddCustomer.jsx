import React, { useRef, useState, useMemo } from 'react';
import { ArrowLeft, Contact, Ruler, Upload, User, Search, CheckCircle2 } from 'lucide-react';
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
    'collar_neck', 'front_shoulder', 'back_shoulder', 'upper_chest', 'bust', 'underbust', 'waist', 'armhole',
    'bicep_length', 'bicep_round', 'elbow_length', 'elbow_round', 'full_length', 'full_sleeves_round',
    'front_neck_depth', 'back_neck_depth', 'blouse_length', 'upper_arm', 'elbow', 'wrist', 'sleeve_length',
    'shoulder_to_bust', 'shoulder_to_waist',
  ],
  'Lower body (lehenga / skirt / churidar / trouser)': [
    'hip_round', 'bottom_full_length', 'knee_length', 'ankle_length', 'lehenga_length', 'lehenga_waist',
    'pant_waist', 'pant_length', 'high_round', 'inseam', 'ankle_round', 'crotch_length',
    'floor_length', 'height', 'high_waist', 'waist_to_hip', 'waist_to_floor', 'waist_to_ankle', 'heel_height',
    'total_ghera', 'hem_circumference', 'thigh', 'knee', 'calf', 'ankle', 'outseam', 'crotch',
  ],
};
const label = (key) => key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const MEASUREMENT_ZONES = [
  {
    id: 'core',
    label: 'Core Body Baseline',
    garments: 'General Baseline (All Garments)',
    keys: ['bust', 'waist', 'hips', 'shoulder', 'arm_length', 'neck', 'length']
  },
  {
    id: 'upper_body',
    label: 'Blouse, Kurti & Tops',
    garments: 'Blouse, Kurti, Suit, Shirt, Sherwani, Jacket',
    keys: [
      'collar_neck', 'front_shoulder', 'back_shoulder', 'front_neck_depth', 'back_neck_depth',
      'upper_chest', 'underbust', 'armhole', 'bicep_length', 'bicep_round',
      'elbow_length', 'elbow_round', 'full_sleeves_round', 'sleeve_opening',
      'wrist', 'upper_arm', 'elbow', 'sleeve_length', 'shoulder_to_bust', 'shoulder_to_waist',
      'blouse_length', 'neck_circumference', 'across_chest', 'across_back', 'full_length'
    ]
  },
  {
    id: 'lehenga_gown',
    label: 'Lehenga, Skirt & Gown',
    garments: 'Lehenga, Petticoat, Skirt, Anarkali, Gown',
    keys: [
      'lehenga_length', 'lehenga_waist', 'high_round', 'floor_length', 'height',
      'high_waist', 'waist_to_hip', 'waist_to_floor', 'waist_to_ankle', 'heel_height',
      'total_ghera', 'hem_circumference', 'bottom_full_length'
    ]
  },
  {
    id: 'pants_bottoms',
    label: 'Pants, Salwar & Trouser',
    garments: 'Pants, Churidar, Salwar, Sharara, Trouser, Jeans, Shorts',
    keys: [
      'hip_round', 'pant_waist', 'pant_length', 'knee_length', 'ankle_length',
      'inseam', 'ankle_round', 'crotch_length', 'outseam', 'crotch',
      'thigh', 'knee', 'calf', 'ankle'
    ]
  }
];



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
          <span className="wz-service-desc">An .xlsx or .csv of customers with their measurements, up to 100 at a time. Checked first, saved only after you confirm.</span>
        </button>
        <button type="button" className="wz-service" onClick={onManual}>
          <IconTile icon={Contact} tone="amber" size={48} iconSize={22} />
          <span className="wz-service-title">Enter manually</span>
          <span className="wz-service-desc">One customer, typed in: profile and measurements on a single page.</span>
        </button>
      </div>
      {imp?.preview && (
        <ImportCustomersDialog state={imp} onClose={() => { const done = !!imp.result; setImp(null); if (done) onBack(); }} onConfirm={confirm} />
      )}
    </div>
  );
}

// Inch boxes wrap to the width available; no .form-grid-4 exists outside the phone rules.
const INCH_GRID = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 };

const inch = (value) => (value === '' || value === undefined || value === null ? '' : value);

export function CustomerForm({ onBack, onSaved }) {
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [activeZone, setActiveZone] = useState('core');
  const [searchQuery, setSearchQuery] = useState('');

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const setInch = (key, value) => setForm((prev) => ({ ...prev, measurements: { ...prev.measurements, [key]: value } }));

  // Count total recorded measurements
  const filledCount = useMemo(() => {
    return Object.values(form.measurements).filter((v) => v !== '' && v !== null && v !== undefined).length;
  }, [form.measurements]);

  // Count per zone
  const zoneCounts = useMemo(() => {
    const counts = {};
    MEASUREMENT_ZONES.forEach((zone) => {
      counts[zone.id] = zone.keys.filter((key) => form.measurements[key] !== '' && form.measurements[key] !== null && form.measurements[key] !== undefined).length;
    });
    return counts;
  }, [form.measurements]);

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

  const inchInput = (key, name) => {
    const hasValue = form.measurements[key] !== '' && form.measurements[key] !== undefined && form.measurements[key] !== null;
    return (
      <div className="form-group" key={key} style={{
        background: hasValue ? 'var(--brand-surface, #f0fdf4)' : 'var(--surface-1, #ffffff)',
        padding: '10px 12px',
        borderRadius: '8px',
        border: hasValue ? '1px solid var(--brand-border, #86efac)' : '1px solid var(--border-color, #e5e7eb)',
        boxShadow: hasValue ? '0 1px 3px rgba(16, 185, 129, 0.08)' : 'none',
        transition: 'all 0.15s ease',
      }}>
        <label className="form-label" htmlFor={`cf-${key}`} style={{ fontSize: '12px', fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span>{name}</span>
          <span className="od-hint" style={{ color: hasValue ? 'var(--brand-primary, #047857)' : 'var(--text-tertiary, #9ca3af)', fontSize: '11px', fontWeight: 500 }}>in</span>
        </label>
        <input id={`cf-${key}`} type="number" className="form-control" min="0" max="120" step="0.25"
               style={{ fontSize: '14px', height: '36px', background: 'var(--surface-2, #f9fafb)' }}
               value={inch(form.measurements[key])} onChange={(e) => setInch(key, e.target.value)}
               placeholder="0.00" />
      </div>
    );
  };

  // Filtered keys when searching
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase().trim();
    const allKeys = new Set([
      ...CORE.map(([k]) => k),
      ...MORE['Upper body (blouse / kurta / shirt)'],
      ...MORE['Lower body (lehenga / skirt / churidar / trouser)'],
    ]);
    return Array.from(allKeys).filter((k) => label(k).toLowerCase().includes(q) || k.includes(q));
  }, [searchQuery]);

  const activeZoneObj = MEASUREMENT_ZONES.find((z) => z.id === activeZone) || MEASUREMENT_ZONES[0];

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

      {/* Boutique Tailoring Master Measurement Section */}
      <div className="content-card wz-card" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <IconTile icon={Ruler} tone="amber" size={36} iconSize={16} />
            <div>
              <strong style={{ fontSize: '15px' }}>Body & Tailoring Measurements</strong>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block' }}>All values in inches (in) · Step: 0.25 in</span>
            </div>
          </div>
          {filledCount > 0 && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px',
              borderRadius: '99px', background: 'var(--brand-surface, #ecfdf5)', color: 'var(--brand-primary, #047857)',
              fontSize: '12.5px', fontWeight: 600, border: '1px solid var(--brand-border, #a7f3d0)'
            }}>
              <CheckCircle2 size={14} /> {filledCount} value{filledCount === 1 ? '' : 's'} recorded
            </span>
          )}
        </div>

        {/* Quick Search Bar */}
        <div className="input-wrapper" style={{ marginBottom: 16, position: 'relative' }}>
          <Search className="input-icon-left" size={16} style={{ color: 'var(--text-tertiary, #9ca3af)', left: 12 }} />
          <input
            type="text"
            className="form-control"
            style={{ paddingLeft: 38, fontSize: '13.5px', height: '38px', borderRadius: '8px' }}
            placeholder="🔍 Search any measurement (e.g. Bicep, Crotch, Lehenga, Armhole)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              style={{
                position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 0, cursor: 'pointer', fontSize: '12px', color: 'var(--text-secondary)'
              }}
            >
              Clear
            </button>
          )}
        </div>

        {/* Render Search Results OR Zone Tabs */}
        {searchQuery.trim() ? (
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 12 }}>
              Found {searchResults.length} measurement{searchResults.length === 1 ? '' : 's'} matching &quot;{searchQuery}&quot;:
            </div>
            {searchResults.length > 0 ? (
              <div style={INCH_GRID}>
                {searchResults.map((key) => inchInput(key, label(key)))}
              </div>
            ) : (
              <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', fontStyle: 'italic', margin: '16px 0' }}>
                No measurement found matching &quot;{searchQuery}&quot;. Try searching for &quot;waist&quot;, &quot;shoulder&quot;, or &quot;length&quot;.
              </p>
            )}
          </div>
        ) : (
          <>
            {/* Garment-Aligned Measurement Grid Cards */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
              gap: 10,
              marginBottom: 16,
            }}>
              {MEASUREMENT_ZONES.map((zone) => {
                const isActive = activeZone === zone.id;
                const count = zoneCounts[zone.id] || 0;
                return (
                  <button
                    key={zone.id}
                    type="button"
                    onClick={() => setActiveZone(zone.id)}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4, padding: '10px 14px',
                      borderRadius: '10px', fontSize: '13px', fontWeight: isActive ? 700 : 600,
                      cursor: 'pointer', textAlign: 'left', width: '100%',
                      border: isActive ? '1.5px solid var(--brand-primary, #047857)' : '1px solid var(--border-color, #cbd5e1)',
                      background: isActive ? 'var(--brand-surface, #ecfdf5)' : 'var(--surface-1, #ffffff)',
                      color: isActive ? 'var(--brand-primary, #047857)' : '#0f172a',
                      boxShadow: isActive ? '0 2px 6px rgba(4, 120, 87, 0.15)' : '0 1px 2px rgba(0,0,0,0.03)',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, width: '100%' }}>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: isActive ? 'var(--brand-primary, #047857)' : '#0f172a' }}>
                        {zone.label}
                      </span>
                      {count > 0 && (
                        <span style={{
                          fontSize: '11px', fontWeight: 700, padding: '1px 6px', borderRadius: '10px',
                          background: isActive ? 'var(--brand-primary, #047857)' : '#e2e8f0',
                          color: isActive ? '#ffffff' : '#334155',
                          flexShrink: 0,
                        }}>
                          {count}
                        </span>
                      )}
                    </div>
                    <span style={{
                      fontSize: '11px',
                      fontWeight: 500,
                      color: isActive ? 'var(--brand-primary, #047857)' : '#475569',
                      lineHeight: '1.3',
                    }}>
                      {zone.garments}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Active Zone Garment Target Banner */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', marginBottom: 16,
              borderRadius: '8px', background: 'var(--surface-2, #f8fafc)', border: '1px solid var(--border-color, #e2e8f0)',
              fontSize: '12.5px', color: 'var(--text-secondary, #475569)'
            }}>
              <span style={{ fontSize: '14px' }}>🎯</span>
              <span><strong>Used for:</strong> {activeZoneObj.garments}</span>
            </div>

            {/* Active Zone Fields */}
            <div style={INCH_GRID}>
              {activeZoneObj.keys.map((key) => inchInput(key, label(key)))}
            </div>

          </>
        )}
      </div>

      {error && <p className="form-error" role="alert" style={{ marginTop: 12, color: 'var(--danger, #b42318)' }}>{error}</p>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
        <button type="button" className="btn-secondary" onClick={onBack} disabled={busy}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save customer'}</button>
      </div>
    </form>
  );
}
