import AuthShowcase from './AuthShowcase';

/**
 * Choose a new password, reached only from the emailed reset link (?reset=).
 */
export default function ResetPasswordScreen({ auth, setView }) {
  const { resetDone, setResetDone, setResetToken, handleResetSubmit, resetPassword, setResetPassword, resetConfirm, setResetConfirm, authError, authBusy, setAuthError } = auth;
  return (
    <div className="auth-page auth-split" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--shell-bg)', padding: '88px 16px 40px' }}>
      <AuthShowcase kind="help" />
      <div className="auth-card" style={{ background: 'var(--surface-color)', border: '1px solid var(--border-color)', borderRadius: '14px', padding: 'clamp(20px, 6vw, 36px)', width: '100%', maxWidth: '420px', boxShadow: '0 4px 20px rgba(0,0,0,0.04)' }}>
        <h2 style={{ margin: '0 0 8px 0', fontSize: '22px' }}>Choose a new password</h2>

        {resetDone ? (
          <>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: 1.6 }}>
              Your password has been changed, and every device that was signed in to
              this account has been signed out.
            </p>
            <button type="button" className="btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '13px', borderRadius: '8px', fontWeight: 600 }} onClick={() => { setResetDone(false); setResetToken(null); setView('login'); }}>
              Sign in
            </button>
          </>
        ) : (
          <form onSubmit={handleResetSubmit}>
            <input
              type="password"
              autoFocus
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
              minLength={8}
              placeholder="New password (min 8 characters)"
              style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '14px', marginBottom: '10px', boxSizing: 'border-box' }}
            />
            <input
              type="password"
              value={resetConfirm}
              onChange={(e) => setResetConfirm(e.target.value)}
              placeholder="Repeat new password"
              style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '14px', marginBottom: '12px', boxSizing: 'border-box' }}
            />
            {authError && (
              <div role="alert" style={{ background: '#fdf2f2', border: '1px solid #f5c6c6', color: '#8a2020', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', marginBottom: '12px', whiteSpace: 'pre-wrap' }}>
                {authError}
              </div>
            )}
            <button type="submit" className="btn-primary" disabled={authBusy} style={{ width: '100%', justifyContent: 'center', padding: '13px', borderRadius: '8px', fontWeight: 600, opacity: authBusy ? 0.6 : 1, cursor: authBusy ? 'wait' : 'pointer' }}>
              {authBusy ? 'Saving…' : 'Change password'}
            </button>
            <button type="button" onClick={() => { setAuthError(null); setResetToken(null); setView('login'); }} style={{ width: '100%', marginTop: '10px', background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '13px', cursor: 'pointer' }}>
              Back to sign in
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
