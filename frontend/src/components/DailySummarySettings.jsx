import { useEffect, useState } from 'react';
import { BellRing } from 'lucide-react';
import { api } from '../services/api.js';
import { useLanguage } from '../i18n/LanguageContext.jsx';
import { LoaderRows } from './ui/Loader';
import { DataTable } from './ui/DataTable';

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
          <div className="dss-wrap" style={{ marginTop: hideHeader ? '0' : '14px' }}>
            <DataTable
              fit={false}
              wrapClassName="settings-summary-wrap"
              tableClassName="settings-summary-table dss-table"
              tableStyle={{ minWidth: 0 }}
              rows={rows}
              rowKey="user_id"
              rowClassName={() => 'dss-row'}
              columns={[
                {
                  key: 'person', header: t('summarySettings.person', 'Person'), width: '32%', label: false, cellClassName: 'dss-person',
                  render: (row) => (
                    <>
                      <div className="dss-person-name">
                        {row.name}{row.role === 'Owner' ? ' (' + t('summarySettings.you', 'you') + ')' : ''}
                      </div>
                      <div className="dss-person-role">{row.role}</div>
                    </>
                  ),
                },
                {
                  key: 'receive', header: t('summarySettings.receive', 'Receive summary'), width: '22%', label: false, cellClassName: 'dss-receive',
                  render: (row) => (
                    <label className="dss-toggle-label">
                      <input
                        type="checkbox"
                        checked={row.enabled}
                        disabled={saving === row.user_id}
                        style={{ width: '16px', height: '16px', accentColor: 'var(--primary-color)', cursor: 'pointer' }}
                        onChange={(e) => save(row, { enabled: e.target.checked })}
                      />
                      <span className={'dss-status-badge ' + (row.enabled ? 'dss-status-badge--on' : 'dss-status-badge--off')}>
                        {row.enabled ? t('summarySettings.on', 'On') : t('summarySettings.off', 'Off')}
                      </span>
                    </label>
                  ),
                },
                {
                  key: 'language', header: t('summarySettings.language', 'Language'), width: '24%', cellClassName: 'dss-lang',
                  render: (row) => (
                    <select
                      className="form-control dss-lang-select"
                      value={row.language}
                      disabled={saving === row.user_id}
                      aria-label={t('summarySettings.language', 'Language') + ': ' + row.name}
                      onChange={(e) => save(row, { language: e.target.value })}
                    >
                      {LANGUAGES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
                    </select>
                  ),
                },
                {
                  key: 'channel', header: t('summarySettings.channel', 'Sent by'), width: '22%', cellClassName: 'dss-chan',
                  render: (row) => (
                    <span className="ui-badge dss-channel-badge">
                      {channel[row.channel]}
                    </span>
                  ),
                },
              ]}
            />
          </div>
        )}
      </div>
    </div>
  );
}
