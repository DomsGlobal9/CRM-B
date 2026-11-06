import { useState } from 'react';
import { Check, Trash2, KeyRound } from 'lucide-react';
import { api } from '../../api';
import { FormModal } from '../../components/ui/Atelier';
import { errorBox, panel } from './staffShared';
import { WHATSAPP_URL } from '../../constants/links';

/** The dialog frame used across Staff, and the sign-in details and delete dialogs. */

export function Modal({ title, subtitle, icon, tone = 'green', onClose, children, width = '560px', footer }) {
  return (
    <FormModal icon={icon} tone={tone} title={title} subtitle={subtitle} onClose={onClose} width={width} footer={footer}>
      {children}
    </FormModal>
  );
}

/* Credentials for one team member: shows the address they sign in with and
   lets the owner generate a new password when they have forgotten theirs.
   Passwords are stored hashed, so the old one cannot be shown -- a new one is
   issued instead and displayed once, with the same Copy / WhatsApp handover
   as the "Account created" screen. */
export function CredentialsDialog({ member, onClose, portalUrl = window.location.origin }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [issued, setIssued] = useState(null);
  const [copied, setCopied] = useState(null);

  const hasLogin = member.isDesigner ? Boolean(member.has_login) : Boolean(member.user);
  const email = issued?.email || member.email || '';

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      setIssued(await api.resetStaffPassword(member.id, { isDesigner: member.isDesigner }));
    } catch (err) {
      setError(err.message || 'Could not generate a new password.');
    } finally {
      setBusy(false);
    }
  };

  const roleLine = (member.role || (member.isDesigner ? 'Designer' : '')) ? `\nRole: ${member.role || 'Designer'}` : '';
  const message = issued
    ? `Hello ${member.name},\nHere are your Atelier login credentials:\nPortal: ${portalUrl}${roleLine}\nEmail: ${email}\nPassword: ${issued.bootstrap_password}`
    : '';

  return (
    <Modal
      icon={KeyRound}
      title={`Credentials — ${member.name}`}
      subtitle={member.isDesigner ? 'Designer' : member.role}
      onClose={onClose}
      width="480px"
      footer={(
        <>
          {issued && (
            <>
              <button
                type="button"
                className="btn-secondary"
                style={copied === 'done' ? { color: 'var(--success-text)', borderColor: 'var(--success-color)' } : undefined}
                onClick={async () => {
                  const text = `Atelier Staff Login Credentials:\nPortal: ${portalUrl}${roleLine}\nEmail: ${email}\nPassword: ${issued.bootstrap_password}`;
                  try {
                    await navigator.clipboard.writeText(text);
                    setCopied('done');
                  } catch {
                    setCopied('failed');
                  }
                  setTimeout(() => setCopied(null), 2500);
                }}
              >{copied === 'done' ? <><Check size={14} /> Copied!</> : copied === 'failed' ? 'Could not copy — select the text' : 'Copy'}</button>
              <a
                className="btn-secondary"
                style={{ textDecoration: 'none' }}
                target="_blank"
                rel="noreferrer"
                href={`${WHATSAPP_URL}/?text=${encodeURIComponent(message)}`}
              >Share on WhatsApp</a>
            </>
          )}
          {!issued && hasLogin && (
            <button type="button" className="btn-secondary" onClick={generate} disabled={busy}>
              <KeyRound size={16} /> {busy ? 'Generating…' : 'Generate password'}
            </button>
          )}
          <button type="button" className="btn-primary" onClick={onClose}>Done</button>
        </>
      )}
    >
      {error && <div style={errorBox} role="alert">{error}</div>}
      {!hasLogin ? (
        <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          {member.name} has no login yet. Add an email address with Edit and a
          password is generated for them.
        </p>
      ) : (
        <>
          <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            {issued
              ? `${member.name} can now sign in with the details below. This password is shown once -- their old password no longer works and they are signed out of other devices.`
              : `If ${member.name} has forgotten their password, generate a new one. Their old password stops working straight away.`}
          </p>
          <div style={{ ...panel, padding: '14px 16px', marginTop: '12px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Email</div>
            <div style={{ fontWeight: 600, marginBottom: '10px' }}>{email || '—'}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Password</div>
            <div style={{ fontWeight: 600, fontFamily: 'var(--font-mono)', fontSize: '15px' }}>
              {issued ? issued.bootstrap_password : '••••••••'}
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}

export function DeleteMemberDialog({ state, onCancel, onConfirm }) {
  const { member, busy, error } = state;
  return (
    <Modal
      icon={Trash2}
      tone="rose"
      title={`Delete ${member.name}?`}
      subtitle={member.isDesigner ? 'Designer' : member.role}
      onClose={onCancel}
      width="480px"
      footer={(
        <>
          <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="button" className="btn-secondary at-btn-danger" onClick={onConfirm} disabled={busy}>
            <Trash2 size={16} /> {busy ? 'Deleting…' : 'Delete'}
          </button>
        </>
      )}
    >
      {error && <div style={errorBox} role="alert">{error}</div>}
      <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
        {member.isDesigner
          ? `${member.name} is removed from the team and their sign-in stops working straight away. `
          : `${member.name} is removed from the team, their sign-in stops working straight away, and their employment details and documents are deleted. `}
        Orders, attendance and pay records they appear on are kept. This cannot be undone.
      </p>
    </Modal>
  );
}

// `onlyDesigners`: opened from the Design library's Designers card -- the
// team list shows the designers alone until `onShowAll` clears it.
