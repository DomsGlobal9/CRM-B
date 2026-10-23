import { useState } from 'react';
import { Lock, Save, Upload, User } from 'lucide-react';

import { api } from '../../services/api';
import { LIMITS, cleanName, imageFilesError, nameError } from '../../services/validate';
import { CameraButton, Field, SectionCard } from '../../components/ui/Atelier';

/* My Profile -> My details: the signed-in person's own photo, name and
   password. Every save goes to /auth/me/ or /auth/change-password/, which only
   ever touch the caller's own account. `onUser` takes the updated user object. */

const MIN_PASSWORD = 8; // the server's validators decide; this only catches the obvious early

function Notice({ tone, children }) {
  if (!children) return null;
  return (
    <div role={tone === 'error' ? 'alert' : 'status'}
         style={{ fontSize: 'var(--text-sm)', color: tone === 'error' ? 'var(--danger-color, #dc2626)' : 'var(--success-color, #16a34a)' }}>
      {children}
    </div>
  );
}

export default function MyDetails({ user, onUser }) {
  // Photo
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoMsg, setPhotoMsg] = useState({ tone: '', text: '' });
  const uploadPhoto = async (file) => {
    if (!file) return;
    const bad = imageFilesError([file]);
    if (bad) { setPhotoMsg({ tone: 'error', text: bad }); return; }
    setPhotoBusy(true);
    setPhotoMsg({ tone: '', text: '' });
    try {
      onUser(await api.updateMyPhoto(file));
      setPhotoMsg({ tone: 'ok', text: 'Photo updated.' });
    } catch (err) {
      setPhotoMsg({ tone: 'error', text: err.message || 'Could not update your photo.' });
    } finally {
      setPhotoBusy(false);
    }
  };

  // Name
  const [first, setFirst] = useState(user?.first_name || '');
  const [last, setLast] = useState(user?.last_name || '');
  const [nameBusy, setNameBusy] = useState(false);
  const [nameMsg, setNameMsg] = useState({ tone: '', text: '' });
  const nameChanged = first.trim() !== (user?.first_name || '') || last.trim() !== (user?.last_name || '');
  const saveName = async (e) => {
    e.preventDefault();
    const problem = nameError(first, { label: 'First name' });
    if (problem) { setNameMsg({ tone: 'error', text: problem }); return; }
    setNameBusy(true);
    setNameMsg({ tone: '', text: '' });
    try {
      const updated = await api.updateMyName(first.trim(), last.trim());
      onUser(updated);
      setFirst(updated.first_name || '');
      setLast(updated.last_name || '');
      setNameMsg({ tone: 'ok', text: 'Name updated.' });
    } catch (err) {
      setNameMsg({ tone: 'error', text: err.message || 'Could not update your name.' });
    } finally {
      setNameBusy(false);
    }
  };

  // Password
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState({ tone: '', text: '' });
  const setPwField = (key) => (e) => setPw((prev) => ({ ...prev, [key]: e.target.value }));
  const changePassword = async (e) => {
    e.preventDefault();
    const problem = !pw.current ? 'Enter your current password.'
      : pw.next.length < MIN_PASSWORD ? `The new password needs at least ${MIN_PASSWORD} characters.`
        : pw.next !== pw.confirm ? 'The new passwords do not match.' : '';
    if (problem) { setPwMsg({ tone: 'error', text: problem }); return; }
    setPwBusy(true);
    setPwMsg({ tone: '', text: '' });
    try {
      await api.changeMyPassword(pw.current, pw.next);
      setPw({ current: '', next: '', confirm: '' });
      setPwMsg({ tone: 'ok', text: 'Password changed. Other devices have been signed out.' });
    } catch (err) {
      setPwMsg({ tone: 'error', text: err.message || 'Could not change your password.' });
    } finally {
      setPwBusy(false);
    }
  };

  return (
    <SectionCard icon={User} tone="green" title="My details"
                 subtitle="Your own photo, name and password.">
      <div className="at-stack">
        <div className="at-field">
          <span className="at-field-label">Profile photo</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <button type="button" className="btn-secondary at-btn-sm" disabled={photoBusy}
                    onClick={() => document.getElementById('my-details-photo').click()}>
              <Upload size={14} /> {photoBusy ? 'Saving…' : 'Change photo'}
            </button>
            <CameraButton disabled={photoBusy} onFiles={([f]) => uploadPhoto(f)} />
            <input id="my-details-photo" type="file" accept="image/*" hidden aria-label="Profile photo"
                   onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; uploadPhoto(f); }} />
          </div>
          <Notice tone={photoMsg.tone}>{photoMsg.text}</Notice>
        </div>

        <form className="at-stack" onSubmit={saveName} noValidate
              style={{ borderTop: '1px solid var(--border-color)', paddingTop: 'var(--space-4)' }}>
          <div className="at-form-grid">
            <Field label="First name" required htmlFor="my-first-name">
              <input id="my-first-name" type="text" className="form-control" autoComplete="given-name"
                     maxLength={LIMITS.name} value={first} onChange={(e) => setFirst(cleanName(e.target.value))} />
            </Field>
            <Field label="Last name" optional htmlFor="my-last-name">
              <input id="my-last-name" type="text" className="form-control" autoComplete="family-name"
                     maxLength={LIMITS.name} value={last} onChange={(e) => setLast(cleanName(e.target.value))} />
            </Field>
          </div>
          <Notice tone={nameMsg.tone}>{nameMsg.text}</Notice>
          <div>
            <button type="submit" className="btn-primary" disabled={nameBusy || !nameChanged}>
              <Save size={16} /> {nameBusy ? 'Saving…' : 'Save name'}
            </button>
          </div>
        </form>

        <form className="at-stack" onSubmit={changePassword} noValidate
              style={{ borderTop: '1px solid var(--border-color)', paddingTop: 'var(--space-4)' }}>
          <Field label="Current password" required icon={Lock} htmlFor="my-current-password">
            <input id="my-current-password" type="password" className="form-control" autoComplete="current-password"
                   value={pw.current} onChange={setPwField('current')} />
          </Field>
          <div className="at-form-grid">
            <Field label="New password" required htmlFor="my-new-password" hint={`At least ${MIN_PASSWORD} characters`}>
              <input id="my-new-password" type="password" className="form-control" autoComplete="new-password"
                     value={pw.next} onChange={setPwField('next')} />
            </Field>
            <Field label="Confirm new password" required htmlFor="my-confirm-password">
              <input id="my-confirm-password" type="password" className="form-control" autoComplete="new-password"
                     value={pw.confirm} onChange={setPwField('confirm')} />
            </Field>
          </div>
          <Notice tone={pwMsg.tone}>{pwMsg.text}</Notice>
          <div>
            <button type="submit" className="btn-primary" disabled={pwBusy}>
              <Lock size={16} /> {pwBusy ? 'Changing…' : 'Change password'}
            </button>
          </div>
        </form>
      </div>
    </SectionCard>
  );
}
