import { ArrowLeft } from 'lucide-react';
import AuthShowcase from './AuthShowcase';

/**
 * Find your boutique: type its name or the address you sign in at, and go there.
 */
export default function FindBoutiqueScreen({ auth, setView }) {
  const { setFindError, handleFindSubmit, findSlug, setFindSlug, slugFromTyped, findError, findBusy } = auth;
  return (
    <div className="auth-page auth-split" style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--shell-bg)', padding: '88px 16px 40px' }}>
      <AuthShowcase kind="find" />
      <button
        onClick={() => { setFindError(null); setView('signup'); }}
        style={{ position: 'absolute', top: '30px', left: '5%', display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--surface-color)', border: '1px solid var(--border-color)', padding: '10px 18px', borderRadius: '99px', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: '600', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}
      >
        <ArrowLeft size={16} />
        Back
      </button>

      <img className="portal-wordmark portal-wordmark--auth" src="/scaleezy-wordmark-dark.webp" alt="Scaleezy" />
      <div className="auth-logo-sub" style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '32px' }}>YOUR VISION. OUR CRAFT.</div>

      <div className="auth-card" style={{ maxWidth: '420px', width: '100%', background: 'var(--surface-color)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: 'clamp(20px, 6vw, 40px)', boxShadow: '0 8px 30px rgba(0,0,0,0.02)' }}>
        <h2 className="auth-title" style={{ fontSize: '24px', color: 'var(--text-primary)', fontWeight: 600, margin: '0 0 8px 0' }}>Find your boutique</h2>
        <p className="auth-subtitle" style={{ fontSize: '13.5px', color: 'var(--text-secondary)', margin: '0 0 28px 0' }}>Every boutique signs in at its own address. Type your boutique's name and we will take you there.</p>

        <form onSubmit={handleFindSubmit} className="auth-form" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label className="form-label" style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Boutique name or address</label>
            <div className="auth-slug-box" style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden' }}>
              <span style={{ padding: '12px 0 12px 14px', fontSize: '14px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{window.location.host}/</span>
              <input
                type="text"
                placeholder="saralaboutique"
                value={findSlug}
                onChange={(e) => { setFindSlug(e.target.value); setFindError(null); }}
                onBlur={() => setFindSlug((raw) => slugFromTyped(raw) || raw)}
                style={{ flex: 1, minWidth: 0, padding: '12px 14px 12px 2px', fontSize: '14px', border: 'none', outline: 'none', background: 'transparent', color: 'var(--text-primary)' }}
                autoFocus
                required
              />
            </div>
            {findSlug.trim() && slugFromTyped(findSlug) && (
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Goes to {window.location.host}/{slugFromTyped(findSlug)}
              </span>
            )}
          </div>

          {findError && (
            <div role="alert" style={{ fontSize: '13px', color: '#b42318', background: 'rgba(180,35,24,0.07)', padding: '10px 12px', borderRadius: '8px' }}>
              {findError}
            </div>
          )}

          <button type="submit" className="btn-primary" disabled={findBusy} style={{ width: '100%' }}>
            {findBusy ? 'Checking…' : 'Go to my boutique'}
          </button>
        </form>

        <div className="auth-card-footer" style={{ borderTop: '1px solid var(--border-color)', marginTop: '32px', paddingTop: '20px', textAlign: 'center', fontSize: '13.5px', color: 'var(--text-secondary)' }}>
          Don't have a boutique yet?{' '}
          <a href="#" style={{ color: 'var(--accent-text, #b07c40)', fontWeight: 600, textDecoration: 'none' }}
             onClick={(e) => { e.preventDefault(); setFindError(null); setView('signup'); }}>
            Request access
          </a>
        </div>
      </div>
    </div>
  );
}
