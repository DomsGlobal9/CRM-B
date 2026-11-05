import AuthShowcase from './AuthShowcase';

/**
 * The address names no active boutique: say so, and offer to find the right one.
 */
export default function BoutiqueNotFound({ auth, portalSlug, setView }) {
  const { setFindSlug, setFindError } = auth;
  return (
    <div className="auth-page auth-split" style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--shell-bg)', padding: '88px 16px 40px' }}>
      <AuthShowcase kind="notfound" />
      <img className="portal-wordmark portal-wordmark--auth" src="/scaleezy-wordmark-dark.webp" alt="Scaleezy" />
      <div className="auth-logo-sub" style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '32px' }}>YOUR VISION. OUR CRAFT.</div>

      <div className="auth-card" style={{ maxWidth: '420px', width: '100%', background: 'var(--surface-color)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: 'clamp(20px, 6vw, 40px)', boxShadow: '0 8px 30px rgba(0,0,0,0.02)', textAlign: 'center' }}>
        <h2 className="auth-title" style={{ fontSize: '24px', color: 'var(--text-primary)', fontWeight: 600, margin: '0 0 8px 0' }}>Boutique not found</h2>
        <p className="auth-subtitle" style={{ fontSize: '13.5px', color: 'var(--text-secondary)', margin: '0 0 28px 0' }}>
          No active boutique uses the address <strong>/{portalSlug}</strong>. Check the spelling with your boutique, or create a new one.
        </p>
        <button type="button" className="btn-primary" style={{ width: '100%' }}
                onClick={() => { setFindSlug(portalSlug); setFindError(null); setView('find'); }}>
          Try another address
        </button>
        <div className="auth-card-footer" style={{ borderTop: '1px solid var(--border-color)', marginTop: '28px', paddingTop: '20px', fontSize: '13.5px', color: 'var(--text-secondary)' }}>
          <a href="/app?register" style={{ color: 'var(--accent-text, #b07c40)', fontWeight: 600, textDecoration: 'none' }}>Request access</a>
          {' · '}
          <a href="/" style={{ color: 'var(--accent-text, #b07c40)', fontWeight: 600, textDecoration: 'none' }}>Back to Home</a>
        </div>
      </div>
    </div>
  );
}
