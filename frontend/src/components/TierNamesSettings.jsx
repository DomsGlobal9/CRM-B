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

export default function TierNamesSettings({ iconChip, tierNames, onSaved }) {
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

  return (
    <div className="settings-card ui-card tier-names-card">
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        <div style={iconChip}><Crown size={18} /></div>
        <div>
          <h2 className="ui-section-title">Customer tiers</h2>
          <p className="ui-section-sub">Give the three customer tiers your boutique's own names. Leave a box empty to keep the default.</p>
        </div>
      </div>

      <form className="tier-names-form" onSubmit={(e) => { e.preventDefault(); if (!duplicate) save(names); }}>
        {TIERS.map((tier) => (
          <label key={tier} className="tier-names-row">
            <span className="tier-names-default"><i style={{ background: DOT[tier] }} />{tier}</span>
            <input className="form-control" value={names[tier]} maxLength={MAX} placeholder={tier}
                   aria-label={`Name for the ${tier} tier`}
                   onChange={(e) => { setNames({ ...names, [tier]: e.target.value }); setSaved(false); }} />
          </label>
        ))}

        {/* How the names will read across the app. */}
        <div className="tier-names-preview" aria-label="Preview">
          <span className="tier-names-preview-label">Preview</span>
          <div className="tier-names-chips">
            {[...TIERS].reverse().map((tier) => (
              <span key={tier} className="tier-names-chip">
                <i style={{ background: DOT[tier] }} />{clean(names[tier]) || tier}
              </span>
            ))}
          </div>
        </div>

        {duplicate && <div role="alert" className="tier-names-msg tier-names-msg--error">Each tier needs a different name.</div>}
        {error && <div role="alert" className="tier-names-msg tier-names-msg--error">{error}</div>}
        {saved && !error && <div className="tier-names-msg">Saved. The new names show everywhere a tier appears.</div>}

        <div className="tier-names-foot">
          <button type="button" className="btn-secondary" disabled={saving}
                  onClick={() => save(Object.fromEntries(TIERS.map((tier) => [tier, ''])))}>
            <RotateCcw size={15} /> Reset to default
          </button>
          <button type="submit" className="btn-primary" disabled={saving || duplicate}>
            <Save size={15} /> {saving ? 'Saving…' : 'Save names'}
          </button>
        </div>
      </form>
    </div>
  );
}
