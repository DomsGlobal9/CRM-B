import AuthShowcase from './AuthShowcase';
import { useApp } from '../../context/AppContext';

/**
 * First sign-in on a boutique the platform team created: replace the temporary
 * password from the welcome email before the workspace opens.
 */
export default function ChangePasswordScreen({ auth, handleChangePasswordSubmit, handleLogout, logoutBusy }) {
  const { currentUser } = useApp();
  const { changeCurrent, setChangeCurrent, changeNew, setChangeNew, changeConfirm, setChangeConfirm, authError, authBusy, setAuthError } = auth;
  return (
    <div className="auth-page auth-split" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--shell-bg)', padding: '88px 16px 40px' }}>
      <AuthShowcase kind="password" />
      <img className="portal-wordmark portal-wordmark--auth" src="/scaleezy-wordmark-dark.webp" alt="Scaleezy" />
      <div className="auth-card" style={{ width: '100%', maxWidth: '440px', marginTop: '24px' }}>
        <form onSubmit={handleChangePasswordSubmit} className="auth-form" style={{ gap: '12px' }}>
          <div>
            <h2 className="auth-title" style={{ fontSize: '22px' }}>Choose your password</h2>
            <p className="auth-subtitle" style={{ marginTop: '4px', marginBottom: 0 }}>
              Welcome{currentUser.first_name ? `, ${currentUser.first_name}` : ''}. You signed in with a temporary
              password. Choose your own to continue; the temporary one stops working once you save.
            </p>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="change-current">Temporary password</label>
            <input id="change-current" type="password" className="form-control" autoComplete="current-password"
                   value={changeCurrent} onChange={(e) => setChangeCurrent(e.target.value)}
                   placeholder="From your login email" />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="change-new">New password</label>
            <input id="change-new" type="password" className="form-control" autoComplete="new-password" autoFocus
                   value={changeNew} minLength={8} onChange={(e) => setChangeNew(e.target.value)}
                   placeholder="At least 8 characters, not all numbers" />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="change-confirm">Type it again</label>
            <input id="change-confirm" type="password" className="form-control" autoComplete="new-password"
                   value={changeConfirm} onChange={(e) => setChangeConfirm(e.target.value)} />
          </div>
          {authError && (
            <div role="alert" style={{ background: '#fdf2f2', border: '1px solid #f5c6c6', color: '#8a2020', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', whiteSpace: 'pre-wrap' }}>
              {authError}
            </div>
          )}
          <button type="submit" className="btn-primary" disabled={authBusy || !changeCurrent || !changeNew || !changeConfirm}
                  style={{ justifyContent: 'center' }}>
            {authBusy ? 'Saving…' : 'Save and continue'}
          </button>
          <button type="button" className="btn-secondary" disabled={logoutBusy}
                  onClick={() => { setAuthError(null); handleLogout(); }} style={{ justifyContent: 'center' }}>
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
