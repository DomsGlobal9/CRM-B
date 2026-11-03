import { useState } from 'react';
import { Crown, RotateCcw, Save } from 'lucide-react';
import { api } from '../services/api.js';

/* Settings > Customer tiers: the owner's own names for Silver, Gold and
   Platinum. Only the names shown change -- every customer keeps the tier
   they are filed under, so filters, counts and reports are untouched. */
const TIERS = ['Silver', 'Gold', 'Platinum'];
const MAX = 30;
// The tier dot colours (TIER_COLORS in App.jsx), so the preview matches the badges.
const DOT = { Silver: '#94a3b8', Gold: '#f59e0b', Platinum: '#8b5cf6' };

export default function TierNamesSettings({ iconChip, tierNames, onSaved, hideHeader = false }) {
  const [names, setNames] = useState(() => Object.fromEntries(TIERS.map((tier) => [tier, tierNames?.[tier] || ''])));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const clean = (value) => value.split(/\s+/).filter(Boolean).join(' ');
  const shown = TIERS.map((tier) => (clean(names[tier]) || tier).toLowerCase());
  const duplicate = new Set(shown).size !== shown.length;

  const save = async (next) => {
    if (saving) return;
    setSaving(true); setError(''); setSaved(false);
    try {
      const res = await api.saveTierNames(Object.fromEntries(TIERS.map((tier) => [tier, clean(next[tier])])));
      const stored = res?.tier_names || {};
      setNames(Object.fromEntries(TIERS.map((tier) => [tier, stored[tier] || ''])));
      onSaved?.(stored);
      setSaved(true);
    } catch (err) {
      setError(err?.message || 'Could not save the tier names.');
    } finally {
      setSaving(false);
    }
  };

  const cardStyle = hideHeader ? {
    backgroundColor: 'transparent',
    border: 'none',
    padding: 0,
    boxShadow: 'none',
    borderRadius: 0,
  } : undefined;

  return (
    <div className={`settings-card tier-names-card${hideHeader ? ' tier-names-card--embedded' : ' ui-card'}`} style={cardStyle}>
      <div>
        {!hideHeader && (
          <div className="settings-card-head">
            <div className="settings-card-title-group">
              <div className="settings-icon-chip">
                <Crown size={18} />
              </div>
              <div>
                <h2 className="settings-card-title">Customer Tiers</h2>
                <p className="settings-card-subtitle">Give customer tiers boutique-custom names. Leave empty for default.</p>
              </div>
            </div>
          </div>
        )}

        <form className="tier-names-form" onSubmit={(e) => { e.preventDefault(); if (!duplicate) save(names); }} style={{ marginTop: hideHeader ? '0' : '14px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {TIERS.map((tier) => (
              <label key={tier} className="tier-names-row" style={{ margin: 0 }}>
                <span className="tier-names-default"><i style={{ background: DOT[tier] }} />{tier}</span>
                <input className="form-control" value={names[tier]} maxLength={MAX} placeholder={tier}
                       style={{ height: '40px', borderRadius: 'var(--radius-md)', fontSize: '13.5px' }}
                       aria-label={`Name for the ${tier} tier`}
                       onChange={(e) => { setNames({ ...names, [tier]: e.target.value }); setSaved(false); }} />
              </label>
            ))}
          </div>

          {/* How the names will read across the app. */}
          <div className="tier-names-preview" aria-label="Preview" style={{ marginTop: '16px', padding: '14px 16px', borderRadius: 'var(--radius-md)', background: 'var(--surface-inset)', border: '1px solid var(--border-color)' }}>
            <span className="tier-names-preview-label" style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-secondary)', display: 'block', marginBottom: '8px' }}>
              Preview Badges
            </span>
            <div className="tier-names-chips" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {[...TIERS].reverse().map((tier) => (
                <span key={tier} className="tier-names-chip" style={{ fontSize: '12px', padding: '5px 12px', borderRadius: '20px', background: 'var(--surface-color)', border: '1px solid var(--border-color)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <i style={{ background: DOT[tier], width: '8px', height: '8px', borderRadius: '50%', display: 'inline-block' }} />
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{clean(names[tier]) || tier}</span>
                </span>
              ))}
            </div>
          </div>

          {duplicate && <div role="alert" className="tier-names-msg tier-names-msg--error" style={{ marginTop: '12px', fontSize: '12px', color: 'var(--danger-color)' }}>Each tier needs a different name.</div>}
          {error && <div role="alert" className="tier-names-msg tier-names-msg--error" style={{ marginTop: '12px', fontSize: '12px', color: 'var(--danger-color)' }}>{error}</div>}
          {saved && !error && <div className="tier-names-msg" style={{ marginTop: '12px', fontSize: '12px', color: 'var(--success-color)' }}>Saved. The new names show everywhere a tier appears.</div>}

          <div className="tier-names-foot" style={{ marginTop: '18px', display: 'flex', justifyContent: 'flex-end', gap: '10px', flexWrap: 'wrap' }}>
            <button type="button" className="btn-secondary" disabled={saving}
                    style={{ fontSize: '13px', padding: '8px 14px', borderRadius: 'var(--radius-md)' }}
                    onClick={() => save(Object.fromEntries(TIERS.map((tier) => [tier, ''])))}>
              <RotateCcw size={14} /> Reset
            </button>
            <button type="submit" className="btn-primary" disabled={saving || duplicate}
                    style={{ fontSize: '13px', padding: '8px 18px', borderRadius: 'var(--radius-md)' }}>
              <Save size={14} /> {saving ? 'Saving…' : 'Save names'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
