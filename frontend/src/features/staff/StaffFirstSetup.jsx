/* A newly added staff member's first sign-in (App.jsx): two short, skippable
   steps before the workspace -- their own password in place of the one the
   boutique gave them, then their profile (the My profile page, with a banner
   over it). Nothing is required: Skip moves on, and both can be done any time
   later from My profile. Shown only when the server says this is the
   account's first sign-in at the boutique (auth/login first_sign_in), so
   staff already using the app never see it. */
import { useState } from 'react';
import { ArrowRight, Eye, EyeOff, KeyRound, UserRound } from 'lucide-react';
import { api } from '../../services/api';
import './firstSetup.css';

const MIN = 8;

/** Step 1: the new password, over the workspace. */
export function SetupPasswordStep({ user, knownCurrent = '', onDone, onSkip }) {
  const [current, setCurrent] = useState(knownCurrent);
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const name = user?.first_name || '';

  const save = async (e) => {
    e.preventDefault();
    if (busy) return;
    const problem = !current ? 'Enter the password you signed in with.'
      : next.length < MIN ? `The new password needs at least ${MIN} characters.`
      : next !== again ? 'Those two passwords do not match.'
      : next === current ? 'Choose a password different from the one you signed in with.'
      : '';
    if (problem) { setError(problem); return; }
    setBusy(true); setError('');
    try {
      const res = await api.changeMyPassword(current, next);
      onDone(res?.user || null);
    } catch (err) {
      setError(err.message || 'Could not change your password.');
    } finally {
      setBusy(false);
    }
  };

  const type = show ? 'text' : 'password';
  return (
    <div className="fs" role="presentation">
      <form className="fs-card" onSubmit={save} role="dialog" aria-modal="true" aria-labelledby="fs-title">
        <span className="fs-step">Welcome{name ? `, ${name}` : ''} · Step 1 of 2</span>
        <span className="fs-icon"><KeyRound size={20} /></span>
        <h2 id="fs-title" className="fs-title">Set your own password</h2>
        <p className="fs-text">You signed in with a password your boutique gave you.</p>
        <p className="fs-text">Choose one that only you know. You can also do this later, from My profile.</p>

        {!knownCurrent && (
          <label className="fs-field">
            <span>Password you signed in with</span>
            <input className="form-control" type={type} value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
          </label>
        )}
        <label className="fs-field">
          <span>New password</span>
          <input className="form-control" type={type} value={next} onChange={(e) => setNext(e.target.value)}
                 autoComplete="new-password" placeholder={`At least ${MIN} characters`} autoFocus />
        </label>
        <label className="fs-field">
          <span>Type it again</span>
          <input className="form-control" type={type} value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" />
        </label>
        <button type="button" className="fs-show" onClick={() => setShow((v) => !v)}>
          {show ? <EyeOff size={14} /> : <Eye size={14} />} {show ? 'Hide passwords' : 'Show passwords'}
        </button>

        {error && <div className="fs-error" role="alert">{error}</div>}

        <div className="fs-actions">
          <button type="button" className="fs-skip" onClick={onSkip} disabled={busy}>Skip for now</button>
          <button type="submit" className="btn-primary fs-go" disabled={busy}>
            {busy ? 'Saving…' : 'Save password'} {!busy && <ArrowRight size={15} />}
          </button>
        </div>
      </form>
    </div>
  );
}

/** Step 2: a banner over the My profile page. */
export function SetupProfileBanner({ onSkip, onDone }) {
  return (
    <div className="fs-banner" role="region" aria-label="First-time setup, step 2 of 2">
      <span className="fs-banner-icon"><UserRound size={18} /></span>
      <div className="fs-banner-text">
        <span className="fs-step">Step 2 of 2</span>
        <b>Your profile</b>
        <span>Add your phone, photo and details below, so the team knows you. Everything is optional.</span>
      </div>
      <div className="fs-banner-actions">
        <button type="button" className="fs-skip" onClick={onSkip}>Skip</button>
        <button type="button" className="btn-primary fs-go" onClick={onDone}>Done, go to my work <ArrowRight size={15} /></button>
      </div>
    </div>
  );
}
