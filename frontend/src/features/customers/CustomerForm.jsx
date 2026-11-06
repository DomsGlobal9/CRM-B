import { SearchBar } from '../../components/ui/SearchBar';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, ChevronDown, Ruler, Upload, User, X } from 'lucide-react';
import { api } from '../../api';
import { LIMITS, cleanEmail, cleanName, emailError, imageFilesError, nameError } from '../../utils/validate';
import { resolveMediaUrl } from '../../services/media';
import CountryPhoneInput from '../../components/ui/CountryPhoneInput';
import { DEFAULT_COUNTRY, composeMobile, phoneNumberError, splitStoredMobile } from '../../utils/phone';
import { CameraButton, IconTile } from '../../components/ui/Atelier';
import { tierName } from './tierNames';
import { ReferredByPicker } from './ReferredByPicker';
import { CORE, CORE_KEYS, EMPTY, MEASUREMENT_ZONES, MORE, MORE_KEYS, customerToForm, label, splitFullName } from './customerFormHelpers';

/** Adding or editing a customer: their details and measurements. */

// Inch boxes wrap to the width available; no .form-grid-4 exists outside the phone rules.
const INCH_GRID = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 };

const inch = (value) => (value === '' || value === undefined || value === null ? '' : value);

/** New customer, or -- given `customer` -- an existing one to edit (the
 *  Owner's; the server refuses an edit from any other role). An edit sends
 *  only what changed, so a value from before today's rules (a legacy source,
 *  an old mobile spelling) never blocks saving something else. */
export function CustomerForm({ customer = null, onBack, onSaved }) {
  const editing = Boolean(customer);
  const [initial] = useState(() => (customer ? customerToForm(customer) : EMPTY));
  const [form, setForm] = useState(initial);
  // The mobile's country; form.mobile_number holds the number without its code.
  const [initialCountry] = useState(() => (customer ? splitStoredMobile(customer.mobile_number).iso : DEFAULT_COUNTRY));
  const [phoneCountry, setPhoneCountry] = useState(initialCountry);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [activeZone, setActiveZone] = useState('core');
  // On a phone the sections are an accordion: a section's measurements open
  // under it, and tapping the open one folds it away. Wider screens keep the
  // section cards above one shared panel.
  const [isPhone, setIsPhone] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.('(max-width: 640px)').matches);
  const [zoneOpen, setZoneOpen] = useState(true);
  const zoneButtons = useRef({});
  useEffect(() => {
    const phone = window.matchMedia?.('(max-width: 640px)');
    if (!phone) return undefined;
    const onChange = (e) => setIsPhone(e.matches);
    phone.addEventListener('change', onChange);
    return () => phone.removeEventListener('change', onChange);
  }, []);
  const [searchQuery, setSearchQuery] = useState('');
  // Who referred them, for a new customer only. Edit Customer never shows
  // this: a referral already recorded is the Referrals card's to change.
  const [referredBy, setReferredBy] = useState(null);
  // A new photo picked here (a File); the saved one stays until it is replaced.
  const [photo, setPhoto] = useState(null);
  const photoPreview = useMemo(() => (photo ? URL.createObjectURL(photo) : ''), [photo]);
  const savedPhoto = customer?.profile_photo ? resolveMediaUrl(customer.profile_photo) : '';
  const pickPhoto = (file) => {
    const bad = file ? imageFilesError([file]) : '';
    setError(bad || null);
    setPhoto(bad ? null : (file || null));
  };

  // Body parts added under "Other" (stored by their own name in additional_measurements).
  const [customKeys, setCustomKeys] = useState(
    () => Object.keys(initial.measurements).filter((key) => !CORE_KEYS.has(key) && !MORE_KEYS.includes(key)));
  const [otherName, setOtherName] = useState('');
  const [otherError, setOtherError] = useState('');
  const addOther = () => {
    const key = otherName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
    if (!key) { setOtherError('Type the body part, e.g. Thigh.'); return; }
    setOtherError('');
    setOtherName('');
    // A name the form already knows just brings that box here.
    setCustomKeys((prev) => (prev.includes(key) || activeZoneObj.keys.includes(key) ? prev : [...prev, key]));
    setForm((prev) => ({ ...prev, measurements: { ...prev.measurements, [key]: prev.measurements[key] ?? '' } }));
  };
  const removeOther = (key) => {
    setCustomKeys((prev) => prev.filter((k) => k !== key));
    setForm((prev) => ({ ...prev, measurements: { ...prev.measurements, [key]: '' } }));
  };

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const setInch = (key, value) => setForm((prev) => ({ ...prev, measurements: { ...prev.measurements, [key]: value } }));

  const mobileChanged = !editing || phoneCountry !== initialCountry || form.mobile_number !== initial.mobile_number;

  /** Only the fields that moved, in the shape PATCH /customers/<id>/ takes. */
  const changes = () => {
    const out = {};
    Object.keys(EMPTY).forEach((key) => {
      if (key === 'measurements' || key === 'mobile_number' || form[key] === initial[key]) return;
      if (key === 'full_name') Object.assign(out, splitFullName(form.full_name));
      else if (key === 'date_of_birth') out[key] = form[key] || null;
      else out[key] = form[key];
    });
    if (mobileChanged) out.mobile_number = composeMobile(phoneCountry, form.mobile_number);
    const moved = (key) => (form.measurements[key] ?? '') !== (initial.measurements[key] ?? '');
    const core = {};
    CORE.forEach(([key]) => { if (moved(key)) core[key] = form.measurements[key] === '' ? null : Number(form.measurements[key]); });
    const extraKeys = [...MORE_KEYS, ...customKeys.filter((key) => !MORE_KEYS.includes(key) && !CORE_KEYS.has(key))];
    if (extraKeys.some(moved)) {
      // The whole extras object is replaced on save, so it starts from what
      // the customer already has -- keys this form does not show survive.
      const extras = { ...((customer.measurements || {}).additional_measurements || {}) };
      extraKeys.forEach((key) => {
        if ((form.measurements[key] ?? '') === '') delete extras[key];
        else extras[key] = Number(form.measurements[key]);
      });
      core.additional_measurements = extras;
    }
    if (Object.keys(core).length) out.measurements = core;
    return out;
  };

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
    const problem = nameError(form.full_name, { label: 'Full name' })
      || (mobileChanged ? phoneNumberError(phoneCountry, form.mobile_number) : '')
      || emailError(form.email_address);
    if (problem) { setError(problem); return; }
    if (editing) {
      const payload = changes();
      if (!Object.keys(payload).length && !photo) { onBack?.(); return; }
      setBusy(true);
      setError(null);
      try {
        let row = Object.keys(payload).length ? await api.updateCustomer(customer.id, payload) : customer;
        if (photo) row = await api.uploadCustomerPhoto(customer.id, photo);
        await onSaved?.(row);
      } catch (err) {
        setError(err.message);
        setBusy(false);
      }
      return;
    }
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
      ...Object.fromEntries(Object.entries(form).filter(([k, v]) => k !== 'measurements' && k !== 'full_name' && v !== '')),
      ...splitFullName(form.full_name),
      mobile_number: composeMobile(phoneCountry, form.mobile_number),
    };
    if (Object.keys(core).length || Object.keys(extras).length) payload.measurements = { ...core, additional_measurements: extras };
    if (referredBy) payload.referred_by = referredBy.id;
    try {
      let row = await api.createCustomer(payload);
      if (photo) {
        // The customer is saved by now; a failed photo must not lose them.
        try { row = await api.uploadCustomerPhoto(row.id, photo); } catch (err) {
          alert(`Customer saved, but the photo could not be uploaded (${err.message}). Add it again from Edit.`);
        }
      }
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
        <input id={`cf-${key}`} type="number" className="form-control no-spinners" min="0" max="120" step="0.25"
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

  // The open section's measurements: under the section cards on a wider
  // screen, under the tapped section itself on a phone.
  const zonePanel = (
    <>
      {/* Active Zone Garment Target Banner */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', marginBottom: 16,
        borderRadius: '8px', background: 'var(--surface-2, #f8fafc)', border: '1px solid var(--border-color, #e2e8f0)',
        fontSize: '12.5px', color: 'var(--text-secondary, #475569)'
      }}>
        <span style={{ fontSize: '14px' }}>🎯</span>
        <span><strong>Used for:</strong> {activeZoneObj.garments}</span>
      </div>

      {/* Active Zone Fields: in numbered steps where the zone has them. */}
      {activeZoneObj.steps?.map(([title, keys], i) => (
        <div key={title} style={{ marginBottom: 16 }}>
          <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
                        color: 'var(--brand-primary, #047857)', marginBottom: 8 }}>
            Step {i + 1} · {title}
          </div>
          <div style={INCH_GRID}>
            {keys.map((key) => inchInput(key, activeZoneObj.labels?.[key] || label(key)))}
          </div>
        </div>
      ))}
      <div style={INCH_GRID}>
        {!activeZoneObj.steps && activeZoneObj.keys.map((key) => inchInput(key, activeZoneObj.labels?.[key] || label(key)))}
        {activeZoneObj.other && customKeys.map((key) => (
          <div key={key} style={{ position: 'relative' }}>
            {inchInput(key, label(key))}
            <button type="button" onClick={() => removeOther(key)} aria-label={`Remove ${label(key)}`} title="Remove"
                    style={{ position: 'absolute', top: 6, right: 6, border: 'none', background: 'transparent',
                             cursor: 'pointer', color: 'var(--text-tertiary, #9ca3af)', padding: 2 }}>
              <X size={13} />
            </button>
          </div>
        ))}
      </div>
      {activeZoneObj.other && (
        <div style={{ marginTop: 12 }}>
          <label className="form-label" htmlFor="cf-other-part" style={{ fontSize: '12px', fontWeight: 600 }}>
            Other — add another body part
          </label>
          {customKeys.length > 0 && (
            <div style={{ fontSize: '11px', color: 'var(--text-tertiary, #9ca3af)', marginBottom: 6 }}>
              Other parts are kept for this customer and show in every section.
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input id="cf-other-part" type="text" className="form-control" maxLength={40} value={otherName}
                   placeholder="e.g. Thigh, Calf, Armhole" style={{ maxWidth: 260, height: 36 }}
                   onChange={(e) => setOtherName(e.target.value)}
                   onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addOther(); } }} />
            <button type="button" className="btn-secondary" onClick={addOther}>+ Other</button>
          </div>
          {otherError && <div role="alert" style={{ fontSize: '12px', color: 'var(--danger, #b42318)', marginTop: 4 }}>{otherError}</div>}
        </div>
      )}
    </>
  );

  return (
    <form className="selector-container" onSubmit={submit} noValidate>
      <div className="page-title-group">
        <p className="page-subtitle">
          {editing ? 'Change their details and measurements. Only what you change is saved.'
            : 'Their details and measurements. Only the name and mobile are needed to start.'}
        </p>
      </div>

      <div className="content-card wz-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <IconTile icon={User} tone="green" size={36} iconSize={16} />
          <strong>Profile</strong>
        </div>
        <div className="form-group">
          <span className="form-label">Customer photo</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
                          background: 'var(--surface-inset)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: 'var(--text-muted)' }}>
              {(photoPreview || savedPhoto)
                ? <img src={photoPreview || savedPhoto} alt="Customer photo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <User size={26} />}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <button type="button" className="btn-secondary at-btn-sm"
                      onClick={() => document.getElementById('cf-photo').click()}>
                <Upload size={14} /> {savedPhoto || photo ? 'Change photo' : 'Choose file'}
              </button>
              <CameraButton onFiles={([f]) => pickPhoto(f)} />
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                {photo ? photo.name : (savedPhoto ? 'Current photo' : 'No photo yet')}
              </span>
              <input id="cf-photo" type="file" accept="image/*" hidden aria-label="Customer photo"
                     onChange={(e) => { const file = e.target.files?.[0] || null; e.target.value = ''; pickPhoto(file); }} />
            </div>
          </div>
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="cf-name">Full name <span className="required">*</span></label>
          <input id="cf-name" type="text" className="form-control" value={form.full_name} maxLength={LIMITS.name} autoFocus
                 onChange={(e) => set('full_name', cleanName(e.target.value))} placeholder="e.g. Amara Singh" />
        </div>
        <div className="form-grid-2">
          <div className="form-group">
            <label className="form-label" htmlFor="cf-mobile">Mobile number <span className="required">*</span></label>
            <CountryPhoneInput id="cf-mobile" country={phoneCountry} onCountryChange={setPhoneCountry}
                               value={form.mobile_number} onChange={(value) => set('mobile_number', value)} />
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
              <option value="Silver">{tierName('Silver')}</option>
              <option value="Gold">{tierName('Gold')}</option>
              <option value="Platinum">{tierName('Platinum')}</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="cf-source">Source</label>
            <select id="cf-source" className="form-control" value={form.source}
                    onChange={(e) => { set('source', e.target.value); if (e.target.value !== 'Referral') setReferredBy(null); }}>
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
        {!editing && form.source === 'Referral' && (
          <ReferredByPicker value={referredBy}
                            onChange={(picked) => { setReferredBy(picked); if (picked) set('source', 'Referral'); }} />
        )}
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
        <SearchBar value={searchQuery} onChange={setSearchQuery} placeholder="Search any measurement (e.g. Bicep, Crotch, Lehenga, Armhole)..." style={{ marginBottom: 16, maxWidth: 'none' }} />

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
                const openHere = isPhone && isActive && zoneOpen;
                return (
                  <React.Fragment key={zone.id}>
                  <button
                    ref={(el) => { zoneButtons.current[zone.id] = el; }}
                    type="button"
                    aria-expanded={isPhone ? openHere : undefined}
                    onClick={() => {
                      if (!isPhone) { setActiveZone(zone.id); return; }
                      // A phone: tap the open section to fold it, any other to open it here.
                      if (isActive) { setZoneOpen((open) => !open); return; }
                      setActiveZone(zone.id);
                      setZoneOpen(true);
                      requestAnimationFrame(() => zoneButtons.current[zone.id]?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
                    }}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4, padding: '10px 14px',
                      borderRadius: '10px', fontSize: '13px', fontWeight: isActive ? 700 : 600,
                      cursor: 'pointer', textAlign: 'left', width: '100%',
                      border: isActive ? '1.5px solid var(--brand-primary, #047857)' : '1px solid var(--border-color, #cbd5e1)',
                      background: isActive ? 'var(--brand-surface, #ecfdf5)' : 'var(--surface-1, #ffffff)',
                      color: isActive ? 'var(--brand-primary, #047857)' : 'var(--text-primary)',
                      boxShadow: isActive ? '0 2px 6px rgba(4, 120, 87, 0.15)' : '0 1px 2px rgba(0,0,0,0.03)',
                      transition: 'all 0.15s ease',
                      // A tapped section scrolls to the top: clear of the phone's 66px header bar.
                      scrollMarginTop: 80,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, width: '100%' }}>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: isActive ? 'var(--brand-primary, #047857)' : 'var(--text-primary)' }}>
                        {zone.label}
                      </span>
                      {count > 0 && (
                        <span style={{
                          fontSize: '11px', fontWeight: 700, padding: '1px 6px', borderRadius: '10px',
                          background: isActive ? 'var(--brand-primary, #047857)' : 'var(--surface-inset)',
                          color: isActive ? 'var(--surface-color)' : 'var(--text-primary)',
                          flexShrink: 0,
                          marginLeft: isPhone ? 'auto' : undefined,
                        }}>
                          {count}
                        </span>
                      )}
                      {isPhone && (
                        <ChevronDown size={16} aria-hidden="true"
                                     style={{ flexShrink: 0, marginLeft: count > 0 ? 0 : 'auto', transition: 'transform .15s ease',
                                              transform: openHere ? 'rotate(180deg)' : 'none' }} />
                      )}
                    </div>
                    <span style={{
                      fontSize: '11px',
                      fontWeight: 500,
                      color: isActive ? 'var(--brand-primary, #047857)' : 'var(--text-secondary)',
                      lineHeight: '1.3',
                    }}>
                      {zone.garments}
                    </span>
                  </button>
                  {openHere && (
                    <div style={{ gridColumn: '1 / -1', padding: '4px 2px 8px' }}>
                      {zonePanel}
                    </div>
                  )}
                  </React.Fragment>
                );
              })}
            </div>

            {!isPhone && zonePanel}
          </>
        )}
      </div>

      {error && <p className="form-error" role="alert" style={{ marginTop: 12, color: 'var(--danger, #b42318)' }}>{error}</p>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
        <button type="button" className="btn-secondary" onClick={onBack} disabled={busy}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Save customer'}</button>
      </div>
    </form>
  );
}
