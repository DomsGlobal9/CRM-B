import { useState } from 'react';
import { Camera, Check, Copy, Pencil, RotateCw } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext.jsx';
import { UserAvatar } from '../../components/ui/UserAvatar.jsx';
import { api } from '../../api';
import { imageFilesError } from '../../utils/validate.js';

/** The banner at the top of Settings: who is signed in, their photo, and the boutique. */
export default function ProfileBanner({ currentUser, boutiqueSettings, onUserUpdated, mode, copied, handleCopyUrl, setActiveModal }) {
  const { t } = useLanguage();
  // The address a customer or staff member opens, as the My profile page shows it.
  const webAddress = currentUser?.shop_slug
    ? `${window.location.origin}/${currentUser.shop_slug}`
    : (localStorage.getItem('tenant_id') || '--');
  const [copiedField, setCopiedField] = useState('');
  const [photoBusy, setPhotoBusy] = useState(false);

  const copyField = async (key, text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(key);
      setTimeout(() => setCopiedField(''), 2000);
    } catch {
      /* clipboard write failed */
    }
  };

  // The signed-in person's own photo, saved the way the My profile page saves it.
  const handlePhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const bad = imageFilesError([file]);
    if (bad) { alert(bad); return; }
    setPhotoBusy(true);
    try {
      onUserUpdated(await api.updateMyPhoto(file));
    } catch (err) {
      alert(err.message || 'Could not update your photo.');
    } finally {
      setPhotoBusy(false);
    }
  };

  return (
    <div className="settings-profile-banner">
      {/* Left Green Block */}
      <div className="settings-profile-left">
        <div className="settings-profile-header">
          <div className="settings-profile-photo">
            <div className="settings-profile-photo-ring">
              <UserAvatar user={currentUser} size={72} />
            </div>
            {onUserUpdated && (
              <label className="settings-profile-camera" title="Change photo">
                {photoBusy ? <RotateCw size={14} className="spin" /> : <Camera size={14} />}
                <input type="file" accept="image/*" capture="environment" hidden aria-label="Change photo"
                       disabled={photoBusy} onChange={handlePhoto} />
              </label>
            )}
          </div>
          <div className="settings-profile-info">
            <span className="settings-profile-name">
              {currentUser?.first_name ? currentUser.first_name + ' ' + (currentUser.last_name || '') : (currentUser?.email || 'Boutique Owner')}
              {onUserUpdated && (
                <button type="button" className="settings-profile-edit" onClick={() => setActiveModal('name')}
                        title={t('settingsPage.editNameTitle', 'Edit name')} aria-label={t('settingsPage.editNameTitle', 'Edit name')}>
                  <Pencil size={13} />
                </button>
              )}
            </span>
            <span className="settings-profile-role">
              {currentUser?.role || 'Owner'}
            </span>
          </div>
        </div>

        <div className="settings-profile-meta">
          <div className="settings-profile-meta-item">
            <span className="settings-profile-meta-label">Boutique</span>
            <span className="settings-profile-meta-value">
              {boutiqueSettings?.name || 'Scaleezy Atelier'}
            </span>
          </div>

          <div className="settings-profile-meta-item">
            <span className="settings-profile-meta-label">Shop ID</span>
            <span className="settings-profile-meta-value">
              <span>{currentUser?.shop_slug || 'scaleezy'}</span>
              <button
                type="button"
                onClick={handleCopyUrl}
                title="Copy boutique URL"
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--brand-link, #166534)', display: 'inline-flex', alignItems: 'center' }}
              >
                {copied ? <Check size={14} color="var(--success-color)" /> : <Copy size={14} />}
              </button>
            </span>
          </div>
        </div>
      </div>

      {/* Right Details Block */}
      <div className="settings-profile-right">
        <div className="settings-profile-details-grid">
          <div className="settings-profile-field">
            <span className="settings-profile-field-label">{t('accountPage.tenantDomain', 'Boutique web address')}</span>
            <span className="settings-profile-field-value">
              <span>{webAddress}</span>
              {webAddress !== '--' && (
                <button type="button" className="settings-profile-copy" onClick={() => copyField('address', webAddress)} aria-label="Copy boutique web address">
                  {copiedField === 'address' ? <Check size={14} color="var(--success-color)" /> : <Copy size={14} />}
                </button>
              )}
            </span>
          </div>

          <div className="settings-profile-field">
            <span className="settings-profile-field-label">Login email</span>
            <span className="settings-profile-field-value">
              <span>{currentUser?.email || 'owner@scaleezy.com'}</span>
              {currentUser?.email && (
                <button type="button" className="settings-profile-copy" onClick={() => copyField('email', currentUser.email)} aria-label="Copy email">
                  {copiedField === 'email' ? <Check size={14} color="var(--success-color)" /> : <Copy size={14} />}
                </button>
              )}
            </span>
          </div>

          <div className="settings-profile-field">
            <span className="settings-profile-field-label">Timezone</span>
            <span className="settings-profile-field-value">{boutiqueSettings?.timezone || 'Asia/Kolkata (IST)'}</span>
          </div>

          <div className="settings-profile-field">
            <span className="settings-profile-field-label">Active look</span>
            <span className="settings-profile-field-value">
              <span style={{ textTransform: 'capitalize' }}>{mode}</span>
              <button
                type="button"
                onClick={() => setActiveModal('appearance')}
                style={{ background: 'none', border: 'none', padding: 0, color: 'var(--brand-link, #166534)', fontWeight: 600, fontSize: '12px', cursor: 'pointer', textDecoration: 'underline' }}
              >
                Change
              </button>
            </span>
          </div>

          <div className="settings-profile-field">
            <span className="settings-profile-field-label">Signed in as</span>
            <span className="settings-profile-field-value">
              <span className="ui-badge" style={{ background: 'var(--accent-color)', color: 'var(--text-primary)', border: '1px solid var(--accent-border)' }}>
                {currentUser?.role || 'Owner'}
              </span>
            </span>
          </div>

          {onUserUpdated && (
            <div className="settings-profile-field">
              <span className="settings-profile-field-label">{t('settingsPage.passwordLabel', 'Password')}</span>
              <span className="settings-profile-field-value">
                <span aria-hidden="true">••••••••</span>
                <button
                  type="button"
                  onClick={() => setActiveModal('password')}
                  aria-label={t('settingsPage.changePasswordTitle', 'Change password')}
                  style={{ background: 'none', border: 'none', padding: 0, color: 'var(--brand-link, #166534)', fontWeight: 600, fontSize: '12px', cursor: 'pointer', textDecoration: 'underline' }}
                >
                  Change
                </button>
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
