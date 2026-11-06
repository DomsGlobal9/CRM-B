import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Building2, Circle, Image as ImageIcon, LocateFixed, Mail, MapPin, Pencil, Phone, Save, ShieldCheck, X } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext.jsx';
import { api } from '../../api';
import { LIMITS, cleanEmail, emailError, imageFilesError, phoneError } from '../../utils/validate.js';
import { Dropzone, Field } from '../../components/ui/Atelier.jsx';
import { ShopPin } from './ShopPin.jsx';

const MIN_RADIUS = 20;
const MAX_RADIUS = 5000;

/**
 * Settings > Your shop: the boutique's profile as lines of that card's list,
 * each opening its own small edit dialog. A save posts only that line to /boutique-settings/, which
 * leaves every field it is not sent alone. The shop location saves itself
 * (ShopPin): reading the GPS is its own deliberate act.
 */
export default function BoutiqueDetailsList({ settings, onSaved }) {
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
    { key: 'name', icon: Building2, label: 'Boutique name', title: t('accountPage.boutiqueName', 'Boutique Name'), value: settings?.name || empty, initial: settings?.name || '' },
    { key: 'address', icon: MapPin, label: 'Boutique address', title: t('accountPage.boutiqueAddress', 'Boutique Address'), value: settings?.address || empty, initial: settings?.address || '' },
    { key: 'phone', icon: Phone, label: 'Boutique phone', title: t('accountPage.boutiquePhone', 'Boutique Phone'), value: settings?.phone || empty, initial: settings?.phone || '' },
    { key: 'email', icon: Mail, label: 'Boutique email', title: t('accountPage.boutiqueEmail', 'Boutique Email'), value: settings?.email || empty, initial: settings?.email || '' },
    { key: 'logo', icon: ImageIcon, label: 'Boutique logo', title: t('accountPage.boutiqueLogo', 'Boutique Logo'), value: settings?.logo ? 'Added' : empty, initial: '' },
    { key: 'location', icon: LocateFixed, label: 'Shop location', title: 'Shop location for staff check-in', value: pinned ? 'Set' : 'Not set', initial: '' },
    { key: 'radius', icon: Circle, label: 'Check-in radius', title: 'Check-in radius (metres)', value: `${radius} m`, initial: String(radius) },
    { key: 'approval', icon: ShieldCheck, label: 'Design approval', title: requireApproval, value: settings?.design_approval_required ? 'On' : 'Off', initial: !!settings?.design_approval_required },
  ];
  const row = rows.find((r) => r.key === editing);

  const open = (r) => {
    setDraft(r.initial);
    setLogoFile(null);
    setError('');
    setEditing(r.key);
  };
  const close = () => {
    if (saving) return;
    setLogoFile(null);
    setEditing(null);
  };

  const pickLogo = (file) => {
    const bad = file ? imageFilesError([file]) : '';
    if (bad) { setError(bad); return; }
    setError('');
    setLogoFile(file || null);
  };

  // The one field this dialog edits, checked as the My profile form checks it.
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
    <Field label={row.title} required icon={row.icon} htmlFor="boutique-detail-input">
      <input id="boutique-detail-input" type={type} className="form-control" maxLength={maxLength} autoFocus
             value={draft} onChange={(e) => setDraft(e.target.value)} {...extra} />
    </Field>
  );

  return (
    <>
      {rows.map((r) => (
        <button key={r.key} type="button" className="settings-cat-item" onClick={() => open(r)} aria-label={`Edit ${r.title}`}>
          <span className="settings-cat-item-text">
            <span className="settings-boutique-item">
              <span>{r.label}</span>
              <span className="settings-boutique-item-value" title={r.value}>{r.value}</span>
            </span>
            <Pencil size={13} color="var(--text-secondary)" style={{ flexShrink: 0 }} />
          </span>
        </button>
      ))}

      {row && createPortal(
        <div className="settings-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
          <div className="settings-modal-dialog" style={{ maxWidth: '520px' }} role="dialog" aria-modal="true" aria-label={row.title}>
            <div className="settings-modal-header">
              <div className="settings-modal-header-left">
                <div className="settings-icon-chip"><row.icon size={18} /></div>
                <div>
                  <h3 className="settings-modal-title">{row.title}</h3>
                  <p className="settings-modal-subtitle">{t('settingsPage.yourShop', 'Your shop')}</p>
                </div>
              </div>
              <button type="button" className="settings-modal-close-btn" onClick={close} aria-label="Close dialog"><X size={16} /></button>
            </div>

            <form onSubmit={save} noValidate>
              <div className="settings-modal-content">
                <div className="at-stack">
                  {editing === 'name' && textField('text', LIMITS.name)}
                  {editing === 'address' && (
                    <Field label={row.title} required icon={row.icon} htmlFor="boutique-detail-input">
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
                  {editing === 'location' && <ShopPin settings={settings} onSaved={onSaved} />}
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
                </div>
              </div>

              <div className="settings-modal-footer">
                {editing === 'location' ? (
                  <button type="button" className="btn-secondary" onClick={close}>Done</button>
                ) : (
                  <>
                    <button type="button" className="btn-secondary" onClick={close} disabled={saving}>{t('common.cancel', 'Cancel')}</button>
                    <button type="submit" className="btn-primary" disabled={saving}>
                      <Save size={16} /> {saving ? t('common.saving', 'Saving…') : t('common.save', 'Save')}
                    </button>
                  </>
                )}
              </div>
            </form>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
