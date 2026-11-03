import { ArrowLeft, Eye, EyeOff, Lock, Mail } from 'lucide-react';
import AuthShowcase from '../../components/auth/AuthShowcase';

/**
 * Sign in to the boutique this address belongs to (/<shop slug>), or to the
 * one being looked for. The boxes stay read-only until touched, so a browser
 * does not fill in a saved login on a shared computer by itself.
 */
export default function LoginScreen({ auth, handleLoginSubmit, justRegistered, setView }) {
  const { loginEmail, loginUnlocked, unlockLogin, setLoginEmail, showLoginPassword, loginPassword, setLoginPassword, setShowLoginPassword, setResetEmail, setResetSent, setAuthError, authError, authBusy } = auth;
  return (
    <div className="auth-page auth-split" style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--shell-bg)', padding: '76px 16px 20px' }}>
      <AuthShowcase kind="login" />

      {/* Back to Home Button */}
      <button 
        onClick={() => { window.location.href = '/'; }}
        style={{
          position: 'absolute',
          top: '30px',
          left: '5%',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: 'var(--surface-color)',
          border: '1px solid var(--border-color)',
          padding: '10px 18px',
          borderRadius: '99px',
          cursor: 'pointer',
          color: 'var(--text-secondary)',
          fontSize: '13px',
          fontWeight: '600',
          boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
          transition: 'all 0.2s ease'
        }}
        onMouseOver={(e) => { e.currentTarget.style.borderColor = 'var(--accent-text, #b07c40)'; e.currentTarget.style.color = 'var(--accent-text, #b07c40)'; }}
        onMouseOut={(e) => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
      >
        <ArrowLeft size={16} />
        Back to Home
      </button>

      <img className="portal-wordmark portal-wordmark--auth" src="/scaleezy-wordmark-dark.webp" alt="Scaleezy" />
      <div className="auth-logo-sub" style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '18px' }}>YOUR VISION. OUR CRAFT.</div>

      <div className="auth-card" style={{ maxWidth: '420px', width: '100%', background: 'var(--surface-color)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: 'clamp(20px, 5vw, 32px)', gap: '16px', boxShadow: '0 8px 30px rgba(0,0,0,0.02)' }}>
        <h2 className="auth-title" style={{ fontSize: '24px', color: 'var(--text-primary)', fontWeight: 600, margin: 0 }}>{justRegistered ? 'Your boutique is ready 🎉' : 'Welcome back 👋'}</h2>
        <p className="auth-subtitle" style={{ fontSize: '13.5px', color: 'var(--text-secondary)', margin: '-8px 0 8px 0' }}>{justRegistered ? 'Sign in with the email and password you just created.' : 'Log in to your workspace.'}</p>

        <form onSubmit={handleLoginSubmit} className="auth-form" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label className="form-label" style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Email</label>
            <div className="input-wrapper" style={{ position: 'relative' }}>
              <Mail size={16} className="input-icon-left" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input 
                type="text" 
                placeholder="Enter your email"
                value={loginEmail}
                readOnly={!loginUnlocked}
                onPointerDown={unlockLogin}
                onFocus={unlockLogin}
                onChange={(e) => setLoginEmail(e.target.value)}
                style={{ width: '100%', padding: '12px 14px 12px 42px', fontSize: '14px', borderRadius: '8px', border: '1px solid var(--border-color)', outline: 'none' }}
                required
              />
            </div>
          </div>

          <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label className="form-label" style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Password</label>
            <div className="input-wrapper" style={{ position: 'relative' }}>
              <Lock size={16} className="input-icon-left" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input 
                type={showLoginPassword ? "text" : "password"} 
                placeholder="Enter your password"
                value={loginPassword}
                readOnly={!loginUnlocked}
                onPointerDown={unlockLogin}
                onFocus={unlockLogin}
                onChange={(e) => setLoginPassword(e.target.value)}
                style={{ width: '100%', padding: '12px 40px 12px 42px', fontSize: '14px', borderRadius: '8px', border: '1px solid var(--border-color)', outline: 'none' }}
                required
              />
              <button 
                type="button"
                style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
                onClick={() => setShowLoginPassword(!showLoginPassword)}
              >
                {showLoginPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div className="auth-remember-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', margin: '6px 0 10px 0' }}>
            <span />
            <button
              type="button"
              className="forgot-password-link"
              onClick={() => { setResetEmail(loginEmail); setResetSent(false); setAuthError(null); setView('forgot'); }}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--accent-text, #b07c40)', fontWeight: 600, fontSize: '13px', whiteSpace: 'nowrap' }}
            >
              Forgot password?
            </button>
          </div>

          {authError && (
            <div role="alert" style={{ background: '#fdf2f2', border: '1px solid #f5c6c6', color: '#8a2020', borderRadius: '8px', padding: '10px 12px', fontSize: '13px' }}>
              {authError}
            </div>
          )}

          <button type="submit" className="btn-primary" disabled={authBusy} style={{ justifyContent: 'center', padding: '14px', borderRadius: '8px', fontWeight: 600, fontSize: '14px', opacity: authBusy ? 0.6 : 1, cursor: authBusy ? 'wait' : 'pointer' }}>
            {authBusy ? 'Signing in…' : 'Login to Workspace'}
          </button>
        </form>

        <div className="auth-card-footer" style={{ borderTop: '1px solid var(--border-color)', marginTop: '4px', paddingTop: '16px', textAlign: 'center', fontSize: '13.5px', color: 'var(--text-secondary)' }}>
          Don't have a boutique account?{' '}
          <a href="/app?register" style={{ color: 'var(--accent-text, #b07c40)', fontWeight: 600, textDecoration: 'none' }}>
            Request access
          </a>
        </div>
      </div>
    </div>
  );
}
