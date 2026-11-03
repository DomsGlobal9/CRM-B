import { useEffect, useState } from 'react';
import { BellRing } from 'lucide-react';
import { api } from '../services/api.js';
import { useLanguage } from '../i18n/LanguageContext.jsx';
import { LoaderRows } from './ui/Loader';

// The languages the 11 PM summary is written in (apps/daily_summary/text.py).
const LANGUAGES = [['en', 'English'], ['hi', 'हिंदी (Hindi)'], ['te', 'తెలుగు (Telugu)']];

/** Owner only: who gets the daily summary, and in which language. Each change saves at once. */
export default function DailySummarySettings({ iconChip, hideHeader = false }) {
  const { t } = useLanguage();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(null);

  useEffect(() => {
    api.getSummarySettings().then(setRows).catch((err) => setError(err.message));
  }, []);

  const save = async (row, changes) => {
    setSaving(row.user_id);
    setError(null);
    try {
      const saved = await api.updateSummarySetting(row.user_id, changes);
      setRows((list) => list.map((r) => (r.user_id === row.user_id ? saved : r)));
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(null);
    }
  };

  const channel = {
    whatsapp: t('summarySettings.channelWhatsApp', 'WhatsApp (email fallback)'),
    email: t('summarySettings.channelEmail', 'Email'),
    none: t('summarySettings.channelNone', 'No mobile or email on file'),
  };

  const cardStyle = hideHeader ? {
    backgroundColor: 'transparent',
    border: 'none',
    padding: 0,
    boxShadow: 'none',
    borderRadius: 0,
  } : undefined;

  return (
    <div className={`settings-card${hideHeader ? ' dss-card--embedded' : ' ui-card'}`} style={cardStyle}>
      <div>
        {!hideHeader && (
          <div className="settings-card-head">
            <div className="settings-card-title-group">
              <div className="settings-icon-chip">
                <BellRing size={18} />
              </div>
              <div>
                <h2 className="settings-card-title">{t('summarySettings.title', 'Daily Summary Notifications')}</h2>
                <p className="settings-card-subtitle">
                  {t('summarySettings.subtitle', 'Each person gets a summary of their work at 11 PM. Choose who receives it.')}
                </p>
              </div>
            </div>
          </div>
        )}

        {error && <div role="alert" style={{ marginBottom: '12px', color: 'var(--danger-color)', fontSize: 'var(--text-sm)', background: 'var(--danger-bg)', padding: '8px 12px', borderRadius: 'var(--radius-md)' }}>{error}</div>}
        {!rows && !error && <LoaderRows rows={3} />}

        {rows && (
          <div className="settings-summary-wrap dss-wrap" style={{ marginTop: hideHeader ? '0' : '14px' }}>
            <table className="settings-summary-table dss-table">
              <thead>
                <tr>
                  <th>{t('summarySettings.person', 'Person')}</th>
                  <th>{t('summarySettings.receive', 'Receive summary')}</th>
                  <th>{t('summarySettings.language', 'Language')}</th>
                  <th>{t('summarySettings.channel', 'Sent by')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.user_id} className="dss-row">
                    <td className="dss-person">
                      <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>
                        {row.name}{row.role === 'Owner' ? ` (${t('summarySettings.you', 'you')})` : ''}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{row.role}</div>
                    </td>
                    <td className="dss-receive">
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
                        <input type="checkbox" checked={row.enabled} disabled={saving === row.user_id}
                               style={{ width: '16px', height: '16px', accentColor: 'var(--primary-color)', cursor: 'pointer' }}
                               onChange={(e) => save(row, { enabled: e.target.checked })} />
                        <span>{row.enabled ? t('summarySettings.on', 'On') : t('summarySettings.off', 'Off')}</span>
                      </label>
                    </td>
                    <td className="dss-lang">
                      <select className="form-control" value={row.language} disabled={saving === row.user_id}
                              aria-label={`${t('summarySettings.language', 'Language')}: ${row.name}`}
                              style={{ height: '36px', padding: '4px 10px', fontSize: '13px', borderRadius: 'var(--radius-md)', background: 'var(--surface-color)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                              onChange={(e) => save(row, { language: e.target.value })}>
                        {LANGUAGES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
                      </select>
                    </td>
                    <td className="dss-chan" data-label={t('summarySettings.channel', 'Sent by')} style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      <span className="ui-badge" style={{ background: 'var(--surface-inset)', border: '1px solid var(--border-color)', fontSize: '11.5px', fontWeight: 500, padding: '3px 10px' }}>
                        {channel[row.channel]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
