import { Building, Check, Clock, Copy, Globe, Link2, Monitor, Moon, Sun, User } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext.jsx';
import { setColorMode } from '../../styles/theme.js';

/** The smaller settings popups: language, appearance and workspace details. */

const LANGUAGES_DATA = [
  { code: 'en', native: 'English', english: 'English' },
  { code: 'hi', native: 'हिंदी', english: 'Hindi' },
  { code: 'te', native: 'తెలుగు', english: 'Telugu' },
  { code: 'mr', native: 'मराठी', english: 'Marathi' },
  { code: 'ar', native: 'العربية', english: 'Arabic' },
  { code: 'gu', native: 'ગુજરાતી', english: 'Gujarati' },
  { code: 'ml', native: 'മലയാളം', english: 'Malayalam' },
  { code: 'ta', native: 'தமிழ்', english: 'Tamil' },
  { code: 'kn', native: 'ಕನ್ನಡ', english: 'Kannada' },
  { code: 'es', native: 'Español', english: 'Spanish' },
  { code: 'de', native: 'Deutsch', english: 'German' },
];

export function LanguagePanel() {
  const { language, setLanguage } = useLanguage();
  return (
    <div>
      <div className="settings-lang-grid">
        {LANGUAGES_DATA.map((langItem) => {
          const isCurrent = language === langItem.code;
          return (
            <div
              key={langItem.code}
              className={`settings-lang-card${isCurrent ? ' settings-lang-card--active' : ''}`}
              onClick={() => setLanguage(langItem.code)}
              role="button"
              tabIndex={0}
            >
              <div>
                <div className="settings-lang-native">{langItem.native}</div>
                <div className="settings-lang-english">{langItem.english} ({langItem.code.toUpperCase()})</div>
              </div>
              {isCurrent && (
                <Check size={18} color="var(--primary-color)" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function AppearancePanel({ mode, setMode }) {
  const { t } = useLanguage();
  const modes = [
    ['light', t('settingsPage.modeLight', 'Light'), Sun, 'Clean, high-visibility bright layout'],
    ['dark', t('settingsPage.modeDark', 'Dark'), Moon, 'Deep contrast, comfortable in low light'],
    ['system', t('settingsPage.modeDefault', 'Default'), Monitor, 'Follows your device OS appearance'],
  ];
  return (
    <div>
      <div className="ui-eyebrow" style={{ marginBottom: '14px' }}>
        Choose Workspace Look
      </div>
      <div className="settings-theme-cards-grid">
        {modes.map(([key, label, Icon, desc]) => {
          const isSelected = mode === key;
          return (
            <div
              key={key}
              className={`settings-theme-card${isSelected ? ' settings-theme-card--active' : ''}`}
              onClick={() => { setColorMode(key); setMode(key); }}
              role="button"
              tabIndex={0}
            >
              <div className={`settings-theme-preview settings-theme-preview--${key}`}>
                <div className="settings-theme-preview-header">
                  <span className="settings-theme-preview-dot" />
                  <span className="settings-theme-preview-dot" />
                  <span className="settings-theme-preview-dot" />
                </div>
                <div className="settings-theme-preview-body">
                  <div className="settings-theme-preview-line settings-theme-preview-line--title" />
                  <div className="settings-theme-preview-line settings-theme-preview-line--sub" />
                </div>
              </div>
              <div className="settings-theme-info">
                <div className="settings-theme-name">
                  <Icon size={16} />
                  <span>{label}</span>
                  {isSelected && <Check size={16} color="var(--primary-color)" style={{ marginLeft: 'auto' }} />}
                </div>
                <div className="settings-theme-desc">{desc}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function WorkspacePanel({ currentUser, boutiqueSettings, copied, handleCopyUrl }) {
  const { t } = useLanguage();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div className="settings-info-list">
        <div className="settings-info-item">
          <div className="settings-info-label">
            <User size={16} />
            <span>{t('settingsPage.activeUser', 'Signed in as')}</span>
          </div>
          <div className="settings-info-value">
            <span className="ui-badge" style={{ background: 'var(--accent-color)', color: 'var(--text-primary)', border: '1px solid var(--accent-border)', fontWeight: 600, padding: '4px 10px', borderRadius: '12px', fontSize: '12.5px' }}>
              {currentUser?.role || 'Owner'} {currentUser?.first_name ? '(' + currentUser.first_name + ')' : (currentUser?.email ? '(' + currentUser.email.split('@')[0] + ')' : '')}
            </span>
          </div>
        </div>

        <div className="settings-info-item">
          <div className="settings-info-label">
            <Building size={16} />
            <span>{t('settingsPage.boutiqueName', 'Boutique Name')}</span>
          </div>
          <div className="settings-info-value">
            {boutiqueSettings?.name || 'Scaleezy Atelier'}
          </div>
        </div>

        <div className="settings-info-item">
          <div className="settings-info-label">
            <Clock size={16} />
            <span>{t('settingsPage.timezone', 'Time zone & currency')}</span>
          </div>
          <div className="settings-info-value">
            {boutiqueSettings?.timezone || 'Asia/Kolkata (IST)'}
          </div>
        </div>

        <div className="settings-info-item">
          <div className="settings-info-label">
            <Globe size={16} />
            <span>Login email</span>
          </div>
          <div className="settings-info-value">
            {currentUser?.email || '--'}
          </div>
        </div>
      </div>

      {currentUser?.shop_slug && (
        <div style={{ padding: '16px', background: 'var(--surface-inset)', borderRadius: 'var(--radius-lg, 12px)', border: '1px solid var(--border-color)' }}>
          <div className="ui-eyebrow" style={{ marginBottom: '8px' }}>Boutique Sign-In Address</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--surface-color)', padding: '10px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
            <Link2 size={16} color="var(--brand-link, #166534)" flexShrink={0} />
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', flex: 1, overflowWrap: 'anywhere' }}>
              {window.location.origin + '/' + currentUser.shop_slug}
            </span>
            <button
              type="button"
              onClick={handleCopyUrl}
              className="btn-secondary"
              style={{ fontSize: '12px', padding: '6px 14px', flexShrink: 0, borderRadius: 'var(--radius-md)' }}
            >
              {copied ? (
                <>
                  <Check size={14} color="var(--success-color)" /> Copied
                </>
              ) : (
                <>
                  <Copy size={14} /> Copy
                </>
              )}
            </button>
          </div>
          <p style={{ margin: '8px 0 0', fontSize: '11.5px', color: 'var(--text-secondary)' }}>
            Staff and customers can use this URL to directly reach your boutique portal.
          </p>
        </div>
      )}
    </div>
  );
}
