import AuthShowcase from './AuthShowcase';

/**
 * Ask for a password reset link by email. Reached from the login screen.
 */
export default function ForgotPasswordScreen({ auth, setView }) {
  const { resetSent, resetEmail, setResetSent, handleForgotSubmit, setResetEmail, authError, authBusy, setAuthError } = auth;
  return (
    <div className="auth-page auth-split" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--shell-bg)', padding: '88px 16px 40px' }}>
      <AuthShowcase kind="help" />
      <div className="auth-card" style={{ background: 'var(--surface-color)', border: '1px solid var(--border-color)', borderRadius: '14px', padding: 'clamp(20px, 6vw, 36px)', width: '100%', maxWidth: '420px', boxShadow: '0 4px 20px rgba(0,0,0,0.04)' }}>
        <h2 style={{ margin: '0 0 8px 0', fontSize: '22px' }}>Reset your password</h2>

        {resetSent ? (
          <>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: 1.6 }}>
              If <strong>{resetEmail}</strong> has an account, a reset link is on its way.
              It stops working in an hour. Check your spam folder if it has not arrived
              in a few minutes.
            </p>
            <button type="button" className="btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '13px', borderRadius: '8px', fontWeight: 600 }} onClick={() => { setResetSent(false); setView('login'); }}>
              Back to sign in
            </button>
          </>
        ) : (
          <form onSubmit={handleForgotSubmit}>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: 1.6, marginTop: 0 }}>
              Enter the email address you sign in with and we will send you a link to
              choose a new password.
            </p>
            <input
              type="email"
              autoFocus
              value={resetEmail}
              onChange={(e) => setResetEmail(e.target.value)}
              placeholder="you@yourboutique.com"
              style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '14px', marginBottom: '12px', boxSizing: 'border-box' }}
            />
            {authError && (
              <div role="alert" style={{ background: '#fdf2f2', border: '1px solid #f5c6c6', color: '#8a2020', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', marginBottom: '12px' }}>
                {authError}
              </div>
            )}
            <button type="submit" className="btn-primary" disabled={authBusy} style={{ width: '100%', justifyContent: 'center', padding: '13px', borderRadius: '8px', fontWeight: 600, opacity: authBusy ? 0.6 : 1, cursor: authBusy ? 'wait' : 'pointer' }}>
              {authBusy ? 'Sending…' : 'Send reset link'}
            </button>
            <button type="button" onClick={() => { setAuthError(null); setView('login'); }} style={{ width: '100%', marginTop: '10px', background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '13px', cursor: 'pointer' }}>
              Back to sign in
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
