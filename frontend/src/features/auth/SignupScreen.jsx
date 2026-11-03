import { ArrowLeft, Check, ShieldCheck } from 'lucide-react';
import AuthShowcase from '../../components/auth/AuthShowcase';
import { LIMITS, cleanEmail, cleanName, tenDigits } from '../../services/validate';
import { legalLink } from '../../components/auth/legalLink';
import { FormModal } from '../../components/ui/Atelier';
import { PRIVACY_POLICY, TERMS_AND_CONDITIONS } from '../../constants/legal';

/**
 * Request access: the boutique and the person asking, the terms to accept, and
 * then the "under review" note. Nobody creates their own boutique here; the
 * platform team sets it up and emails the login.
 */
export default function SignupScreen({ auth, setView }) {
  const { signupStep, handleSignupSubmit, boutiqueName, setBoutiqueName, boutiqueAddress, setBoutiqueAddress, signupForm, setSignupForm, signupError, setLegalDoc, legalDoc, signupReady, signupBusy } = auth;
  return (
    <div className="auth-page auth-page--signup auth-split auth-split--wide" style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--shell-bg)' }}>
      <AuthShowcase kind="signup" />

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
      <div className="auth-logo-sub" style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '16px' }}>YOUR VISION. OUR CRAFT.</div>

      {/* One card, no steps. It used to be a two-tab wizard (owner on
          tab 1, boutique on tab 2) with a step tracker above it; owners
          lost their place between the tabs. Everything is on one screen
          now, sized to fit a laptop viewport without scrolling. */}
      {signupStep === 1 && <h2 className="auth-title auth-outside-title">Request access</h2>}
      <div className="auth-card auth-card--signup">
        {signupStep === 1 && (
          <form onSubmit={handleSignupSubmit} className="auth-form" style={{ gap: '10px' }}>
            <div>
              <p className="auth-subtitle" style={{ marginTop: '4px', marginBottom: 0 }}>Tell us about your boutique. Our team reviews every request and emails you your login details.</p>
            </div>

            <div className="signup-section-title"><span className="signup-section-num">1</span>Your boutique</div>
            <div className="form-grid-2 signup-grid">
              <div className="form-group">
                <label className="form-label">Boutique name</label>
                <input
                  type="text"
                  placeholder="e.g. Aditi's Atelier"
                  className="form-control"
                  value={boutiqueName}
                  maxLength={LIMITS.name}
                  onChange={(e) => setBoutiqueName(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label className="form-label">Boutique address</label>
                <input
                  type="text"
                  placeholder="Street, area, city, PIN"
                  className="form-control"
                  value={boutiqueAddress}
                  maxLength={LIMITS.address}
                  onChange={(e) => setBoutiqueAddress(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="signup-section-title"><span className="signup-section-num">2</span>About you (the owner)</div>
            <div className="form-grid-2 signup-grid">
              <div className="form-group">
                <label className="form-label">First name</label>
                <input
                  type="text"
                  placeholder="Enter first name"
                  value={signupForm.first_name}
                  maxLength={LIMITS.name}
                  onChange={(e) => setSignupForm({...signupForm, first_name: cleanName(e.target.value)})}
                  required
                  className="form-control"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Last name</label>
                <input
                  type="text"
                  placeholder="Enter last name"
                  value={signupForm.last_name}
                  maxLength={LIMITS.name}
                  onChange={(e) => setSignupForm({...signupForm, last_name: cleanName(e.target.value)})}
                  required
                  className="form-control"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Email address</label>
                <input
                  type="email"
                  placeholder="name@example.com"
                  value={signupForm.email_address}
                  maxLength={LIMITS.email}
                  onChange={(e) => setSignupForm({...signupForm, email_address: e.target.value})}
                  onBlur={(e) => setSignupForm({...signupForm, email_address: cleanEmail(e.target.value)})}
                  required
                  className="form-control"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Mobile number</label>
                <div className="input-wrapper">
                  <span className="input-icon-left" style={{ left: '12px', fontSize: '14px' }}>+91</span>
                  <input
                    type="tel"
                    inputMode="numeric"
                    placeholder="10-digit mobile number"
                    value={signupForm.mobile_number}
                    onChange={(e) => setSignupForm({...signupForm, mobile_number: tenDigits(e.target.value)})}
                    style={{ paddingLeft: '50px' }}
                    required
                  />
                </div>
              </div>
            </div>

            {signupError && (
              <div role="alert" style={{ background: '#fdf2f2', border: '1px solid #f5c6c6', color: '#8a2020', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', whiteSpace: 'pre-wrap' }}>
                {signupError}
              </div>
            )}

            <div className="mobile-stack-grid signup-footer">
              <label className="remember-me-checkbox" style={{ fontSize: '12.5px' }}>
                <input type="checkbox" checked={signupForm.terms} required onChange={(e) => setSignupForm({...signupForm, terms: e.target.checked})} />
                {/* Each document opens to be read; clicking its name does not tick the box. */}
                <span>
                  I agree to the{' '}
                  <button type="button" onClick={(e) => { e.preventDefault(); setLegalDoc('terms'); }} style={legalLink}>Terms & Conditions</button>
                  {' '}and{' '}
                  <button type="button" onClick={(e) => { e.preventDefault(); setLegalDoc('privacy'); }} style={legalLink}>Privacy Policy</button>
                </span>
              </label>
              {legalDoc && (
                <FormModal icon={ShieldCheck} tone="green" width="720px"
                           title={legalDoc === 'terms' ? 'Terms & Conditions' : 'Privacy Policy'}
                           onClose={() => setLegalDoc(null)}
                           footer={(
                             <>
                               <button type="button" className="btn-secondary" onClick={() => setLegalDoc(null)}>Close</button>
                               <button type="button" className="btn-primary"
                                       onClick={() => { setSignupForm((prev) => ({ ...prev, terms: true })); setLegalDoc(null); }}>
                                 <Check size={16} /> I agree
                               </button>
                             </>
                           )}>
                  {(() => {
                    const text = (legalDoc === 'terms' ? TERMS_AND_CONDITIONS : PRIVACY_POLICY).trim();
                    return text ? (
                      <div style={{ fontSize: '13.5px', lineHeight: 1.6, color: 'var(--text-secondary)', maxHeight: '60vh', overflowY: 'auto' }}>
                        {text.split(/\n\s*\n/).map((para, i) => (
                          // "3. Your data belongs to you" on a line of its own is a section heading.
                          /^\d+\.\s/.test(para) && !para.includes('\n')
                            ? <h4 key={i} style={{ margin: '18px 0 6px', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{para}</h4>
                            : <p key={i} style={{ margin: '0 0 12px', whiteSpace: 'pre-line' }}>{para}</p>
                        ))}
                      </div>
                    ) : (
                      <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', margin: 0 }}>
                        The full text will appear here.
                      </p>
                    );
                  })()}
                </FormModal>
              )}
              <button type="button" className="btn-secondary" style={{ justifyContent: 'center' }}
                      onClick={() => setView('login')}>
                Log in instead
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={!signupReady || signupBusy}
                title={signupReady ? undefined : (signupForm.terms ? 'Fill every box above to continue' : 'Fill every box above and accept the Terms & Conditions to continue')}
                style={{ justifyContent: 'center', opacity: signupReady ? 1 : 0.5, cursor: signupReady ? 'pointer' : 'not-allowed' }}
              >
                {signupBusy ? 'Sending your request…' : 'Request access'}
              </button>
            </div>
          </form>
        )}

        {signupStep === 2 && (
          <div style={{ textAlign: 'center', padding: '32px' }}>
            <div className="success-circle" style={{ margin: '0 auto 20px' }}><Check size={36} /></div>
            <h2 className="auth-title">Request received</h2>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Thank you{signupForm.first_name ? `, ${signupForm.first_name.trim()}` : ''}. Your request is under review.
              We&apos;ve sent a welcome email to <strong>{signupForm.email_address.trim()}</strong>, and we&apos;ll
              share your login credentials there very soon.
            </p>
            <button type="button" className="btn-secondary" style={{ marginTop: '12px', justifyContent: 'center' }}
                    onClick={() => { window.location.href = '/'; }}>
              Back to home
            </button>
          </div>
        )}

        {signupStep === 1 && (
          <div className="auth-card-footer" style={{ borderTop: '1px solid var(--border-color)', marginTop: '24px', paddingTop: '18px', textAlign: 'center', fontSize: '15px', color: 'var(--text-secondary)' }}>
            Already have a boutique?{' '}
            <a href="/app" style={{ color: 'var(--accent-text, #b07c40)', fontWeight: 700, fontSize: '16px', textDecoration: 'none' }}
               onClick={(e) => { e.preventDefault(); setView('login'); }}>
              Log in
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
