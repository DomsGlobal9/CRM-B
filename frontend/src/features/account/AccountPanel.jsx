import { Building2, Camera, Copy, Globe, Mail, MapPin, Phone, Save, Settings, ShieldCheck, Store, Upload } from 'lucide-react';
import { SetupProfileBanner } from '../staff/StaffFirstSetup';
import { Dropzone, Field, IconTile, InfoNote, PageHeader, SectionCard } from '../../components/ui/Atelier';
import { UserAvatar } from '../../components/ui/UserAvatar';
import { LIMITS, cleanEmail, imageFilesError } from '../../utils/validate';
import { api } from '../../api';
import MyDetails from '../staff/MyDetails';
import { ShopPin } from '../settings/ShopPin';
import { useLanguage } from '../../i18n/LanguageContext.jsx';
import { useApp } from '../../context/AppContext';
import { TENANT_ID_KEY } from '../../constants/storageKeys';
import { userIsOwner } from '../../constants/roles';

/**
 * My account: the signed-in person's photo and details and, for the owner
 * (or an Admin handed settings.edit), the boutique's profile form. The form's
 * autosave, logo and saving state live in App, which passes them in.
 */
export default function AccountPanel({ boutiqueAutosave, boutiqueFormError, boutiqueFormRef, finishStaffSetup, logoFile, pickLogo, saveBoutiqueForm, setBoutiqueSettings, setCurrentUser, setLogoFile, setSettingsSaving, settingsSaving, staffSetup }) {
  const { t } = useLanguage();
  const { currentUser, adminCan, boutiqueSettings } = useApp();
  const isOwner = userIsOwner(currentUser);
  // The address a customer or staff member opens: the shop's own
  // page, not the schema name (which is internal).
  const tenant = currentUser?.shop_slug
    ? `${window.location.origin}/${currentUser.shop_slug}`
    : (localStorage.getItem(TENANT_ID_KEY) || '--');
  const copyText = (text) => navigator.clipboard?.writeText(text);
  return (
  <>
    {staffSetup === 'profile' && <SetupProfileBanner onSkip={finishStaffSetup} onDone={finishStaffSetup} />}
    <PageHeader
      title={t('accountPage.title')}
      subtitle={t('accountPage.subtitle')}
    />

    <div className="account-settings-container at-account">
      <div className="ui-card at-account-card">
        <div className="at-cover" />
        <div className="at-account-avatar">
          <div className="at-account-avatar-ring">
            <UserAvatar user={currentUser} />
          </div>
          {/* Editable by any signed-in user -- the photo is stored
              per-user (UserAvatar), so the owner can set theirs too. */}
          <label className="at-account-camera" title="Change photo">
            <Camera size={16} />
            <input type="file" accept="image/*" capture="environment" hidden
                   onChange={async (e) => {
                     const f = e.target.files?.[0];
                     if (!f) return;
                     const bad = imageFilesError([f]);
                     if (bad) { alert(bad); return; }
                     try {
                       const updated = await api.updateMyPhoto(f);
                       setCurrentUser(updated);
                     } catch (err) {
                       alert(err.message || 'Could not update your photo.');
                     }
                   }} />
          </label>
        </div>
        <h3 className="at-account-name">{currentUser.first_name} {currentUser.last_name}</h3>
        {/* The signed-in role, not a hardcoded claim. */}
        <span className="ui-badge ui-badge--neutral">{currentUser.role || 'Boutique Owner'}</span>

        <div className="at-account-rows">
          <div className="at-account-row">
            <Globe size={16} />
            <div>
              <div className="at-measure-label">{t('accountPage.tenantDomain', 'Tenant Domain')}</div>
              <div className="at-measure-value" style={{ overflowWrap: 'anywhere' }}>{tenant}</div>
            </div>
            {tenant !== '--' && (
              <button type="button" className="at-modal-close" style={{ width: 30, height: 30 }} onClick={() => copyText(tenant)} aria-label="Copy boutique web address">
                <Copy size={13} />
              </button>
            )}
          </div>
          <div className="at-account-row">
            <Mail size={16} />
            <div>
              <div className="at-measure-label">{t('accountPage.atelierEmail', 'Atelier Email')}</div>
              <div className="at-measure-value" style={{ overflowWrap: 'anywhere' }}>{currentUser.email}</div>
            </div>
            {currentUser.email && (
              <button type="button" className="at-modal-close" style={{ width: 30, height: 30 }} onClick={() => copyText(currentUser.email)} aria-label="Copy email">
                <Copy size={13} />
              </button>
            )}
          </div>
          <div className="at-account-row">
            <ShieldCheck size={16} />
            <div>
              <div className="at-measure-label">Role</div>
              <div className="at-measure-value">{currentUser.role || 'Owner'}</div>
            </div>
          </div>
          {/* No "Member since": nothing in the API carries the
              tenant's created_on, and an absent fact beats a
              confident wrong one. */}
        </div>
      </div>

      {/* Right column: everyone's own details, then the owner's boutique profile. */}
      <div className="at-stack">
      <MyDetails key={currentUser.id} user={currentUser} onUser={setCurrentUser} />
      {/* Owner, or a role handed settings: submitting POSTs
          /boutique-settings/, which RolePermission refuses for every
          other role. A form that cannot succeed should not be drawn. */}
      {(isOwner || adminCan('settings.edit')) && (
        <SectionCard icon={Store} tone="green" title={t('accountPage.editProfile', 'Edit Boutique Profile')}
                     subtitle="Keep your boutique information up to date. This will be visible across the platform.">
          <form
            ref={boutiqueFormRef}
            className="at-stack"
            onReset={() => setLogoFile(null)}
            onSubmit={async (e) => {
              e.preventDefault();
              if (settingsSaving) return;
              const bad = boutiqueFormError(e.target);
              if (bad) { alert(bad); return; }
              setSettingsSaving(true);
              try {
                await saveBoutiqueForm(e.target);
                alert("Boutique settings updated successfully!");
              } catch (err) {
                console.error(err);
                alert("Failed to update boutique settings");
              } finally {
                setSettingsSaving(false);
              }
            }}
          >
            <Field label={t('accountPage.boutiqueName', 'Boutique Name')} required icon={Building2}>
              <input type="text" name="boutiqueName" className="form-control" maxLength={LIMITS.name}
                     defaultValue={boutiqueSettings?.name || ''} placeholder="e.g. Aditi's Atelier" required />
            </Field>
            <Field label={t('accountPage.boutiqueAddress', 'Boutique Address')} required icon={MapPin}>
              <textarea name="boutiqueAddress" className="form-control" rows={3} maxLength={LIMITS.address}
                        defaultValue={boutiqueSettings?.address || ''} placeholder="Street, area, city, PIN" required />
            </Field>

            <div className="at-field">
              <span className="at-field-label">Shop location for staff check-in</span>
              <ShopPin settings={boutiqueSettings} onSaved={setBoutiqueSettings} />
              <Field label="Check-in radius (metres)" icon={MapPin}>
                <input type="number" name="shopRadius" className="form-control" min={20} max={5000} step={10}
                       defaultValue={boutiqueSettings?.shop_radius_m ?? 150} required />
              </Field>
            </div>
            <div className="at-form-grid">
              <Field label={t('accountPage.boutiquePhone', 'Boutique Phone')} required icon={Phone}>
                {/* The store phone printed on invoices: often a landline, so no mobile rule. */}
                <input type="text" name="boutiquePhone" className="form-control" inputMode="tel" maxLength={50}
                       defaultValue={boutiqueSettings?.phone || ''} placeholder="044-2345 6789" required />
              </Field>
              <Field label={t('accountPage.boutiqueEmail', 'Boutique Email')} required icon={Mail}>
                <input type="email" name="boutiqueEmail" className="form-control" maxLength={LIMITS.email}
                       defaultValue={boutiqueSettings?.email || ''} placeholder="you@yourboutique.com" required
                       onBlur={(e) => { e.target.value = cleanEmail(e.target.value); }} />
              </Field>
            </div>

            <div className="at-field">
              <span className="at-field-label">{t('accountPage.boutiqueLogo', 'Boutique Logo')}</span>
              <div className="at-side-by-side acct-logo-grid">
                {(logoFile || boutiqueSettings?.logo) ? (
                  <div className="at-form-section acct-logo-current" style={{ flexDirection: 'row', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                    <img src={logoFile ? URL.createObjectURL(logoFile) : boutiqueSettings.logo} alt="Boutique logo"
                         style={{ width: 56, height: 56, objectFit: 'contain', borderRadius: '8px', background: 'var(--surface-inset)', border: '1px solid var(--border-color)' }} />
                    <div className="at-row-main">
                      <div className="at-row-title">{logoFile ? logoFile.name : 'Current logo'}</div>
                      <div className="at-row-sub">{logoFile ? 'Saved with the next autosave or Save Changes.' : 'Choose a file to replace it.'}</div>
                    </div>
                    <button type="button" className="btn-secondary at-btn-sm" onClick={() => document.getElementById('boutique-logo-file').click()}>
                      <Upload size={14} /> Choose file
                    </button>
                    {logoFile && (
                      <button type="button" className="btn-secondary at-btn-sm" onClick={() => setLogoFile(null)}>Remove</button>
                    )}
                    <input id="boutique-logo-file" type="file" accept="image/*" hidden
                           onChange={(e) => pickLogo(e.target.files?.[0] || null)} />
                  </div>
                ) : (
                  <Dropzone camera
                            title="Drag & drop your logo here" subtitle="or choose a file from your device"
                            chooseLabel="Choose file"
                            onFiles={(files) => pickLogo(files[0] || null)} />
                )}
                <InfoNote tone="green" icon={ShieldCheck} title="Logo Guidelines"
                          items={['Recommended size: 512 × 512 px', 'Formats: PNG, JPG (Max 2MB)', 'Square image works best', 'This logo will appear on invoices and customer communication.']} />
              </div>
            </div>

            {/* Off by default: a small team is usually the owner and
                one or two designers, and a queue with nobody to clear
                it is friction with no benefit. */}
            <label className="at-switch-row">
              <IconTile icon={Settings} tone="neutral" size={36} iconSize={16} />
              <span className="at-row-main">
                <span className="at-row-title">{t('accountPage.requireApproval', 'Require approval for new designs')}</span>
                <span className="at-row-sub" style={{ display: 'block' }}>
                  {t('accountPage.approvalHelp', 'When on, uploads from staff other than you wait for your review before appearing in the library.')}
                </span>
              </span>
              <span className="at-switch">
                <input type="checkbox" name="designApprovalRequired" defaultChecked={!!boutiqueSettings?.design_approval_required} />
                <i />
              </span>
            </label>

            <div className="at-form-foot">
              <button type="reset" className="btn-secondary">{t('common.cancel', 'Cancel')}</button>
              <button type="submit" className="btn-primary" disabled={settingsSaving}>
                <Save size={16} /> {settingsSaving ? t('common.saving', 'Saving…') : t('accountPage.saveChanges', 'Save Changes')}
              </button>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', alignSelf: 'center' }}>
                {boutiqueAutosave.saving ? t('common.saving', 'Saving…')
                  : boutiqueAutosave.lastSavedAt
                    ? `Autosaved ${boutiqueAutosave.lastSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                    : 'Autosaves every minute while you edit'}
              </span>
            </div>
          </form>
        </SectionCard>
      )}
      </div>
    </div>
  </>
  );
}
