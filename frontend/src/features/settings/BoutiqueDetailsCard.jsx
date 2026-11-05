import { useEffect, useMemo, useState } from 'react';
import { Building2, Circle, Image as ImageIcon, LocateFixed, Mail, MapPin, Pencil, Phone, Save, ShieldCheck, Store, X } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext.jsx';
import { api } from '../../api';
import { LIMITS, cleanEmail, emailError, imageFilesError, phoneError } from '../../utils/validate.js';
import { Dropzone, Field } from '../../components/ui/Atelier.jsx';
import { ShopPin } from './ShopPin.jsx';

const MIN_RADIUS = 20;
const MAX_RADIUS = 5000;

/**
 * Settings > Your shop > Boutique details: a popup listing the boutique's
 * profile, each line with its own Edit, which opens in place with Save and
 * Cancel. A save posts only that line to /boutique-settings/, which leaves every
 * field it is not sent alone. The shop location saves itself (ShopPin): reading
 * the GPS is its own deliberate act.
 */
export default function BoutiqueDetailsCard({ settings, onSaved, onClose }) {
  const { t } = useLanguage();
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState('');
  const [logoFile, setLogoFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const logoPreview = useMemo(() => (logoFile ? URL.createObjectURL(logoFile) : ''), [logoFile]);
  useEffect(() => () => { if (logoPreview) URL.revokeObjectURL(logoPreview); }, [logoPreview]);

  const radius = settings?.shop_radius_m ?? 150;
  const pinned = settings?.shop_latitude != null;
  const empty = t('settingsPage.notAdded', 'Not added');
  const requireApproval = t('accountPage.requireApproval', 'Require approval for new designs');

  const rows = [
    { key: 'name', icon: Building2, label: t('accountPage.boutiqueName', 'Boutique Name'), value: settings?.name || empty, initial: settings?.name || '' },
    { key: 'address', icon: MapPin, label: t('accountPage.boutiqueAddress', 'Boutique Address'), value: settings?.address || empty, initial: settings?.address || '' },
    { key: 'phone', icon: Phone, label: t('accountPage.boutiquePhone', 'Boutique Phone'), value: settings?.phone || empty, initial: settings?.phone || '' },
    { key: 'email', icon: Mail, label: t('accountPage.boutiqueEmail', 'Boutique Email'), value: settings?.email || empty, initial: settings?.email || '' },
    { key: 'logo', icon: ImageIcon, label: t('accountPage.boutiqueLogo', 'Boutique Logo'), value: settings?.logo ? null : empty, initial: '' },
    { key: 'location', icon: LocateFixed, label: 'Shop location for staff check-in', value: pinned ? 'Set' : 'Not set', initial: '' },
    { key: 'radius', icon: Circle, label: 'Check-in radius (metres)', value: `${radius} m`, initial: String(radius) },
    { key: 'approval', icon: ShieldCheck, label: requireApproval, value: settings?.design_approval_required ? 'On' : 'Off', initial: !!settings?.design_approval_required },
  ];
  const row = rows.find((r) => r.key === editing);

  // Typed but not saved: leaving it asks first, so a change is never lost quietly.
  const mayLeaveEdit = () => {
    if (saving) return false;
    const changed = row && (logoFile || draft !== row.initial);
    return !changed || window.confirm('Discard the change you have not saved?');
  };

  const open = (r) => {
    if (!mayLeaveEdit()) return;
    setDraft(r.initial);
    setLogoFile(null);
    setError('');
    setEditing(r.key);
  };
  const stopEditing = () => {
    if (saving) return;
    setLogoFile(null);
    setError('');
    setEditing(null);
  };
  const closePopup = () => {
    if (mayLeaveEdit()) onClose();
  };

  const pickLogo = (file) => {
    const bad = file ? imageFilesError([file]) : '';
    if (bad) { setError(bad); return; }
    setError('');
    setLogoFile(file || null);
  };

  // The one field being edited, checked as the My profile form checks it.
  const fieldToSave = () => {
    const text = String(draft).trim();
    switch (editing) {
      case 'name':
        return text ? ['name', text] : { problem: 'Enter the boutique name.' };
      case 'address':
        return text ? ['address', text] : { problem: 'Enter the boutique address.' };
      case 'phone': {
        if (!text) return { problem: 'Enter the boutique phone number.' };
        const bad = phoneError(text);
        return bad ? { problem: bad } : ['phone', text];
      }
      case 'email': {
        const bad = emailError(text, { required: true });
        return bad ? { problem: bad } : ['email', cleanEmail(text)];
      }
      case 'logo':
        return logoFile ? ['logo', logoFile] : { problem: 'Choose a logo first.' };
      case 'radius': {
        const metres = Number(text);
        return text && Number.isFinite(metres) && metres >= MIN_RADIUS && metres <= MAX_RADIUS
          ? ['shop_radius_m', text]
          : { problem: `Enter a radius from ${MIN_RADIUS} to ${MAX_RADIUS} metres.` };
      }
      case 'approval':
        return ['design_approval_required', draft];
      default:
        return { problem: '' };
    }
  };

  const save = async (e) => {
    e.preventDefault();
    if (saving) return;
    const field = fieldToSave();
    if (!Array.isArray(field)) { setError(field.problem); return; }
    setSaving(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append(field[0], field[1]);
      onSaved(await api.updateBoutiqueSettings(formData));
      setLogoFile(null);
      setEditing(null);
    } catch (err) {
      setError(err.message || 'Could not save this change.');
    } finally {
      setSaving(false);
    }
  };

  const textField = (type, maxLength, extra = {}) => (
    <Field label={row.label} required icon={row.icon} htmlFor="boutique-detail-input">
      <input id="boutique-detail-input" type={type} className="form-control" maxLength={maxLength} autoFocus
             value={draft} onChange={(e) => setDraft(e.target.value)} {...extra} />
    </Field>
  );

  const editor = () => (
    <form className="at-stack" onSubmit={save} noValidate>
      {editing === 'name' && textField('text', LIMITS.name)}
      {editing === 'address' && (
        <Field label={row.label} required icon={row.icon} htmlFor="boutique-detail-input">
          <textarea id="boutique-detail-input" className="form-control" rows={3} maxLength={LIMITS.address} autoFocus
                    value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Street, area, city, PIN" />
        </Field>
      )}
      {editing === 'phone' && textField('text', 50, { inputMode: 'tel' })}
      {editing === 'email' && textField('email', LIMITS.email)}
      {editing === 'radius' && textField('number', undefined, { min: MIN_RADIUS, max: MAX_RADIUS, step: 10 })}
      {editing === 'logo' && (
        <>
          {(logoPreview || settings?.logo) && (
            <div className="at-form-section" style={{ flexDirection: 'row', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
              <img src={logoPreview || settings.logo} alt="" className="settings-boutique-logo settings-boutique-logo--large" />
              <div className="at-row-main">
                <div className="at-row-title">{logoFile ? logoFile.name : 'Current logo'}</div>
                <div className="at-row-sub">{logoFile ? 'Save to use this logo.' : 'Choose a file to replace it.'}</div>
              </div>
              {logoFile && (
                <button type="button" className="btn-secondary at-btn-sm" onClick={() => setLogoFile(null)}>Remove</button>
              )}
            </div>
          )}
          <Dropzone camera compact title="Drag & drop your logo here" subtitle="PNG or JPG, max 2MB. A square image works best."
                    chooseLabel="Choose file" onFiles={(files) => pickLogo(files[0] || null)} />
        </>
      )}
      {editing === 'location' && (
        <>
          <span className="settings-boutique-row-label">{row.label}</span>
          <ShopPin settings={settings} onSaved={onSaved} />
        </>
      )}
      {editing === 'approval' && (
        <label className="at-switch-row">
          <span className="at-row-main">
            <span className="at-row-title">{requireApproval}</span>
            <span className="at-row-sub" style={{ display: 'block' }}>
              {t('accountPage.approvalHelp', 'When on, uploads from staff other than you wait for your review before appearing in the library.')}
            </span>
          </span>
          <span className="at-switch">
            <input type="checkbox" checked={!!draft} onChange={(e) => setDraft(e.target.checked)} />
            <i />
          </span>
        </label>
      )}
      {error && <div role="alert" className="settings-boutique-error">{error}</div>}
      <div className="settings-boutique-row-actions">
        {editing === 'location' ? (
          <button type="button" className="btn-secondary at-btn-sm" onClick={stopEditing}>Done</button>
        ) : (
          <>
            <button type="button" className="btn-secondary at-btn-sm" onClick={stopEditing} disabled={saving}>{t('common.cancel', 'Cancel')}</button>
            <button type="submit" className="btn-primary at-btn-sm" disabled={saving}>
              <Save size={14} /> {saving ? t('common.saving', 'Saving…') : t('common.save', 'Save')}
            </button>
          </>
        )}
      </div>
    </form>
  );

  return (
    <div className="settings-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) closePopup(); }}>
      <div className="settings-modal-dialog" style={{ maxWidth: '640px' }} role="dialog" aria-modal="true" aria-labelledby="settings-boutique-title">
        <div className="settings-modal-header">
          <div className="settings-modal-header-left">
            <div className="settings-icon-chip"><Store size={18} /></div>
            <div>
              <h3 id="settings-boutique-title" className="settings-modal-title">{t('settingsPage.boutiqueDetailsTitle', 'Boutique details')}</h3>
              <p className="settings-modal-subtitle">{t('settingsPage.boutiqueDetailsDesc', 'Edit any detail and save the change.')}</p>
            </div>
          </div>
          <button type="button" className="settings-modal-close-btn" onClick={closePopup} aria-label="Close dialog"><X size={16} /></button>
        </div>

        <div className="settings-modal-content">
          <ul className="settings-boutique-list">
            {rows.map((r) => (r.key === editing ? (
              <li key={r.key} className="settings-boutique-row settings-boutique-row--editing">{editor()}</li>
            ) : (
              <li key={r.key} className="settings-boutique-row">
                <r.icon size={16} className="settings-boutique-row-icon" />
                <div className="settings-boutique-row-text">
                  <span className="settings-boutique-row-label">{r.label}</span>
                  <span className="settings-boutique-row-value">
                    {r.value ?? <img src={settings.logo} alt={t('accountPage.boutiqueLogo', 'Boutique Logo')} className="settings-boutique-logo" />}
                  </span>
                </div>
                <button type="button" className="settings-boutique-edit" onClick={() => open(r)} aria-label={`Edit ${r.label}`}>
                  <Pencil size={13} /> {t('common.edit', 'Edit')}
                </button>
              </li>
            )))}
          </ul>
        </div>

        <div className="settings-modal-footer">
          <button type="button" className="btn-secondary" onClick={closePopup} disabled={saving}
                  style={{ fontSize: '13px', padding: '8px 20px', borderRadius: 'var(--radius-md)', fontWeight: 600 }}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
