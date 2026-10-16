import { useEffect, useState } from 'react';
import { BellRing } from 'lucide-react';
import { api } from '../services/api.js';
import { useLanguage } from '../i18n/LanguageContext.jsx';

// The languages the 11 PM summary is written in (apps/daily_summary/text.py).
const LANGUAGES = [['en', 'English'], ['hi', 'हिंदी (Hindi)'], ['te', 'తెలుగు (Telugu)']];

/** Owner only: who gets the daily summary, and in which language. Each change saves at once. */
export default function DailySummarySettings({ iconChip }) {
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
    whatsapp: t('summarySettings.channelWhatsApp', 'WhatsApp (email if WhatsApp is not available)'),
    email: t('summarySettings.channelEmail', 'Email'),
    none: t('summarySettings.channelNone', 'No mobile or email on file'),
  };

  return (
    <div className="settings-card ui-card" style={{ gridColumn: '1 / -1' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        <div style={iconChip}><BellRing size={18} /></div>
        <div>
          <h2 className="ui-section-title">{t('summarySettings.title', 'Daily Summary Notifications')}</h2>
          <p className="ui-section-sub">
            {t('summarySettings.subtitle', 'Each person gets a summary of their own work at 11 PM. Choose who receives it and in which language.')}
          </p>
        </div>
      </div>

      {error && <div role="alert" style={{ marginBottom: '12px', color: 'var(--danger-color)', fontSize: 'var(--text-sm)' }}>{error}</div>}
      {!rows && !error && <p className="ui-section-sub">{t('summarySettings.loading', 'Loading…')}</p>}

      {rows && (
        <div className="at-table-wrap">
          <table className="at-table" style={{ minWidth: '560px' }}>
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
                <tr key={row.user_id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>
                      {row.name}{row.role === 'Owner' ? ` (${t('summarySettings.you', 'you')})` : ''}
                    </div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{row.role}</div>
                  </td>
                  <td>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={row.enabled} disabled={saving === row.user_id}
                             onChange={(e) => save(row, { enabled: e.target.checked })} />
                      {row.enabled ? t('summarySettings.on', 'On') : t('summarySettings.off', 'Off')}
                    </label>
                  </td>
                  <td>
                    <select className="form-control" value={row.language} disabled={saving === row.user_id}
                            aria-label={`${t('summarySettings.language', 'Language')}: ${row.name}`}
                            onChange={(e) => save(row, { language: e.target.value })}>
                      {LANGUAGES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
                    </select>
                  </td>
                  <td style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>{channel[row.channel]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
