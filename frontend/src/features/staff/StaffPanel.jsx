
import { Fragment, useState, useEffect, useCallback, useMemo } from 'react';
import { Check,
  Plus, Clock, Wallet, TrendingUp, Users, FileText, ClipboardList, Trash2, Phone, Calendar, Briefcase, UserCheck,
  User, UserPlus, Smartphone, Mail, Sparkles, Scissors, Shield, Coins, MapPin, Hash, Tag, FilePlus, Upload, Eye, IndianRupee, Pencil, ChevronDown, ChevronUp,
} from 'lucide-react';

import { api } from '../../services/api';
import {
  AvatarInitials, PageHeader, SearchBox, StatCard, FormModal, Field, Dropzone, InfoNote, FormSection, IconTile, CameraButton,
} from '../../components/ui/Atelier';
import { ASSIGNABLE_ROLES, DOCUMENT_KINDS } from '../../constants/roles';
import Attendance from './Attendance';
import Payroll from './Payroll';
import Performance from './Performance';
import TeamTasks from './TeamTasks';
import VoiceTextarea from '../../components/ui/VoiceTextarea';
import {
  LIMITS, tenDigits, mobileError, emailError, nameError, cleanAmount, amountError,
  cleanDocumentNumber, documentNumberError, todayIso, imageFilesError,
} from '../../services/validate';

const panel = {
  background: 'var(--surface-color)',
  border: '1px solid var(--border-color)',
  borderRadius: 'var(--radius-lg)',
  boxShadow: 'var(--shadow-sm)',
};

const errorBox = {
  background: 'var(--danger-bg)',
  border: '1px solid var(--danger-color)',
  color: 'var(--danger-color)',
  borderRadius: 'var(--radius-md)',
  padding: '10px 12px',
  fontSize: 'var(--text-sm)',
  marginBottom: 'var(--space-3)',
};

const money = (n) =>
  `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;


const showsPay = (terms) => terms?.hourly_rate !== undefined;

const EMPLOYMENT_TYPES = [
  ['FULL_TIME', 'Full time'],
  ['PART_TIME', 'Part time'],
  ['CONTRACT', 'Contract'],
  ['APPRENTICE', 'Apprentice'],
];

const employmentLabel = (value) =>
  (EMPLOYMENT_TYPES.find(([key]) => key === value) || [null, '—'])[1];

function Modal({ title, subtitle, icon, tone = 'green', onClose, children, width = '560px', footer }) {
  return (
    <FormModal icon={icon} tone={tone} title={title} subtitle={subtitle} onClose={onClose} width={width} footer={footer}>
      {children}
    </FormModal>
  );
}

/** A tab whose domain arrives in a later phase. Says so, rather than showing nothing. */
function NotBuiltYet({ title, blurb }) {
  return (
    <div className="ui-card" style={{ padding: 'var(--space-10) var(--space-6)', textAlign: 'center' }}>
      <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--text-lg)', fontWeight: 500,
                   margin: '0 0 var(--space-2)', color: 'var(--text-primary)' }}>{title}</h3>
      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', margin: 0,
                  lineHeight: 'var(--leading-normal)' }}>
        {blurb}
      </p>
    </div>
  );
}

const EMPTY_FORM = {
  employment_type: 'FULL_TIME',
  joined_at: '',
  exit_date: '',
  hourly_rate: '',
  weekly_hours: '',
  deposit_total: '',
  deposit_weekly: '',
  phone: '',
  emergency_contact: '',
  address: '',
  notes: '',
};

// Sanity ceilings for employment terms; the server only refuses negatives.
const MAX_HOURLY_RATE = 10000;
const MAX_WEEKLY_HOURS = 168;

/** The cross-field rules for employment terms; '' when they pass. */
const termsError = (form) => {
  const rate = amountError(form.hourly_rate, { label: 'Hourly rate', max: MAX_HOURLY_RATE });
  if (rate) return rate;
  const hours = amountError(form.weekly_hours, { label: 'Weekly hours', max: MAX_WEEKLY_HOURS });
  if (hours) return hours;
  const total = amountError(form.deposit_total, { label: 'Security deposit' });
  if (total) return total;
  const weekly = amountError(form.deposit_weekly, { label: 'Weekly deduction' });
  if (weekly) return weekly;
  if (form.deposit_weekly && Number(form.deposit_weekly) > Number(form.deposit_total || 0)) {
    return 'The weekly deduction cannot be more than the security deposit.';
  }
  if (form.exit_date && form.joined_at && form.exit_date < form.joined_at) return 'The leaving date cannot be before the joining date.';
  return '';
};

/** Blank strings are not zero. Sending '' for a Decimal is a 400. */
const cleaned = (form) => {
  const payload = {};
  Object.entries(form).forEach(([key, value]) => {
    if (value !== '' && value !== null && value !== undefined) payload[key] = value;
  });
  return payload;
};

/** The employment fields, shared by the add and edit form. `form` is EMPTY_FORM-shaped. */
function TermsFields({ form, setForm, memberName }) {
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const setAmount = (key, opts) => (e) => setForm((f) => ({ ...f, [key]: cleanAmount(e.target.value, opts) }));
  return (
    <>
      <div className="at-form-grid">
        <Field label="Employment type" icon={Briefcase} htmlFor="sp-type">
          <select id="sp-type" value={form.employment_type} onChange={set('employment_type')}>
            {EMPLOYMENT_TYPES.map(([value, text]) => (
              <option key={value} value={value}>{text}</option>
            ))}
          </select>
        </Field>
        <Field label="Hourly rate (₹)" icon={IndianRupee} htmlFor="sp-rate"
               hint={`Set the hourly rate for ${memberName}.`}>
          <input id="sp-rate" inputMode="decimal"
                 value={form.hourly_rate} onChange={setAmount('hourly_rate', { max: MAX_HOURLY_RATE })} placeholder="0.00" />
        </Field>

        <Field label="Joined on" icon={Calendar} htmlFor="sp-joined">
          <input id="sp-joined" type="date" value={form.joined_at} onChange={set('joined_at')} />
        </Field>
        <Field label="Left on" icon={Calendar} htmlFor="sp-exit" hint="Leave blank if currently active.">
          <input id="sp-exit" type="date" min={form.joined_at || undefined} value={form.exit_date} onChange={set('exit_date')} />
        </Field>

        <Field label="Expected hours a week" icon={Clock} htmlFor="sp-hours" hint="Planned working hours per week.">
          <input id="sp-hours" inputMode="decimal"
                 value={form.weekly_hours} onChange={setAmount('weekly_hours', { max: MAX_WEEKLY_HOURS, decimals: 1 })} placeholder="48" />
        </Field>
        <Field label="Security deposit (₹)" icon={Shield} htmlFor="sp-dep-total">
          <input id="sp-dep-total" inputMode="decimal"
                 value={form.deposit_total} onChange={setAmount('deposit_total')} placeholder="0.00" />
        </Field>
        <Field label="Weekly deduction (₹)" icon={Coins} htmlFor="sp-dep-weekly">
          <input id="sp-dep-weekly" inputMode="decimal"
                 value={form.deposit_weekly} onChange={setAmount('deposit_weekly')} placeholder="0.00" />
        </Field>
      </div>

      <Field label="Emergency contact" icon={User} htmlFor="sp-emergency">
        <input id="sp-emergency" value={form.emergency_contact} placeholder="Name and phone number" maxLength={150}
               onChange={set('emergency_contact')} />
      </Field>
      <Field label="Address" icon={MapPin} htmlFor="sp-address">
        <textarea id="sp-address" rows={2} maxLength={LIMITS.address} value={form.address} onChange={set('address')} placeholder="Enter full address" />
      </Field>
      <Field label="Notes" icon={FileText} htmlFor="sp-notes">
        <VoiceTextarea id="sp-notes" rows={2} maxLength={LIMITS.note} value={form.notes} onChange={set('notes')} placeholder="Add any additional notes…" />
      </Field>

      <InfoNote tone="amber" icon={Shield}>
        <strong>Note:</strong> The weekly deduction is recovered from payroll once that is switched on, and never
        takes more than the deposit still outstanding or that week's earnings.
      </InfoNote>
    </>
  );
}

function AdvanceForm({ member, onCancel, onSaved }) {
  const [form, setForm] = useState({
    amount: '', weekly_recovery: '',
    issued_on: new Date().toISOString().slice(0, 10), reason: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    const problem = amountError(form.amount, { label: 'Amount', allowZero: false, required: true })
      || amountError(form.weekly_recovery, { label: 'Weekly recovery' })
      || (Number(form.weekly_recovery || 0) > Number(form.amount) ? 'Weekly recovery cannot be more than the advance.' : '')
      || (form.issued_on > todayIso() ? 'The advance date cannot be in the future.' : '');
    if (problem) { setError(problem); return; }
    setSaving(true);
    setError(null);
    try {
      await api.issueAdvance({ ...cleaned(form), staff: member.id });
      onSaved();
    } catch (err) {
      setError(err.message || 'Could not issue this advance.');
    } finally {
      setSaving(false);
    }
  };

  const field = { display: 'flex', flexDirection: 'column', gap: '5px' };
  const label = { fontSize: '12px', color: 'var(--text-secondary)' };
  return (
    <form onSubmit={submit}>
      {error && (
        <div style={errorBox}>{error}</div>
      )}
      <div className="mobile-stack-grid"
           style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
        <div style={field}>
          <label style={label} htmlFor="adv-amount">Amount (₹)</label>
          <input id="adv-amount" inputMode="decimal" required
                 value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: cleanAmount(e.target.value) }))} placeholder="0.00" />
        </div>
        <div style={field}>
          <label style={label} htmlFor="adv-weekly">Recover per week (₹)</label>
          <input id="adv-weekly" inputMode="decimal"
                 value={form.weekly_recovery} onChange={(e) => setForm((f) => ({ ...f, weekly_recovery: cleanAmount(e.target.value) }))} placeholder="0.00" />
        </div>
        <div style={field}>
          <label style={label} htmlFor="adv-date">Given on</label>
          <input id="adv-date" type="date" required max={todayIso()} value={form.issued_on} onChange={set('issued_on')} />
        </div>
        <div style={field}>
          <label style={label} htmlFor="adv-reason">Reason</label>
          <input id="adv-reason" value={form.reason} maxLength={255} onChange={set('reason')}
                 placeholder="Emergency advance" />
        </div>
      </div>
      <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '14px' }}>
        Recovery is taken from payroll each week, after the security deposit and
        never more than the week earned. Oldest advance first.
      </p>
      <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '18px' }}>
        <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? 'Saving…' : 'Issue advance'}
        </button>
      </div>
    </form>
  );
}

/**
 * Onboarding: one form for the roster row, the login, the employment record
 * and the documents.
 *
 * This used to be two screens, then three buttons: Manage Tailors created the
 * person and minted their login; Staff Management set up their employment
 * separately and held their documents behind a third button. Adding somebody
 * therefore meant knowing that the roster, the employment record and the
 * document store were different things, which is an implementation detail of
 * this codebase rather than a fact about hiring a tailor. Now one Save does
 * all three, in order, and the card offers one Edit.
 *
 * POSTs to the roster endpoint, which is what mints the account: supply an
 * email and the server generates a password and returns it exactly once, in
 * `bootstrap_password`. It is shown here and never again -- there is no second
 * copy to read, so the modal stays open on the credential until it is
 * dismissed deliberately.
 */
function AddStaffForm({ member, terms, onCancel, onSaved, customRoles = [] }) {
  const editing = Boolean(member);
  const [form, setForm] = useState({
    name: member?.name || '',
    phone: member?.phone || '',
    email: member?.email || '',
    specialty: member?.specialty || '',
    role: member?.role || 'Tailor',
    status: member?.status || 'Available',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [created, setCreated] = useState(null);
  const [copied, setCopied] = useState(null);
  const [photo, setPhoto] = useState(null);
  const [termsForm, setTermsForm] = useState(() =>
    terms
      ? { ...EMPTY_FORM, ...Object.fromEntries(Object.keys(EMPTY_FORM).map((k) => [k, terms[k] ?? ''])) }
      : EMPTY_FORM);
  const [docs, setDocs] = useState([]);
  const [docsError, setDocsError] = useState(null);
  const [pending, setPending] = useState([]);
  const [docForm, setDocForm] = useState({ kind: 'AADHAAR', number: '', label: '' });
  const [docFile, setDocFile] = useState(null);
  const [savedMember, setSavedMember] = useState(null);
  const [savedTerms, setSavedTerms] = useState(terms || null);
  const [credential, setCredential] = useState(null);

  const loadDocs = useCallback(async () => {
    if (!member) return;
    try {
      const rows = await api.getStaffDocuments(member.isDesigner ? { designer: member.id } : { staff: member.id });
      setDocs(Array.isArray(rows) ? rows : []);
    } catch (err) {
      setDocsError(err.message || 'Could not load documents.');
    }
  }, [member]);
  useEffect(() => {
    const t = setTimeout(loadDocs, 0);
    return () => clearTimeout(t);
  }, [loadDocs]);

  const removeDoc = async (doc) => {
    setDocsError(null);
    try {
      await api.deleteStaffDocument(doc.id);
      await loadDocs();
    } catch (err) {
      setDocsError(err.message || 'Could not remove that document.');
    }
  };
  const docNumberProblem = documentNumberError(docForm.kind, docForm.number);
  const addDocument = () => {
    if (!docFile || docNumberProblem) return;
    setPending((p) => [...p, { ...docForm, number: docForm.number.trim(), label: docForm.label.trim(), file: docFile }]);
    setDocForm({ kind: 'AADHAAR', number: '', label: '' });
    setDocFile(null);
  };
  const kindLabel = (kind) => (DOCUMENT_KINDS.find(([v]) => v === kind) || [kind, kind])[1];
  const knownValues = ASSIGNABLE_ROLES.map((r) => r.value);
  const memberRoleIsCustom = editing && form.role && !knownValues.includes(form.role);
  const [customRole, setCustomRole] = useState(memberRoleIsCustom ? form.role : '');
  const [roleChoice, setRoleChoice] = useState(memberRoleIsCustom ? '__custom__' : form.role);
  // Custom roles already on the roster, offered for reuse.
  const reusable = customRoles.filter((r) => !knownValues.includes(r));

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const isDesigner = form.role === 'Designer';

  const submit = async (e) => {
    e.preventDefault();
    if (roleChoice === '__custom__' && !customRole.trim()) {
      setError('Type a name for the custom role.'); return;
    }
    const problem = nameError(form.name) || mobileError(form.phone, { required: false }) || emailError(form.email)
      || (isDesigner ? '' : termsError(termsForm));
    if (problem) { setError(problem); return; }
    setBusy(true);
    setError(null);
    try {
      const payload = {
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        specialty: form.specialty.trim() || form.role,
        role: (form.role || '').trim(),
        status: form.status,
      };
      const existing = member || savedMember;
      let saved;
      if (isDesigner) {
        const designerPayload = {
          name: payload.name,
          phone: payload.phone,
          email: payload.email,
          specialisation: form.specialty.trim(),
        };
        saved = existing
          ? await api.updateDesigner(existing.id, designerPayload)
          : await api.createDesigner(designerPayload);
        if (payload.email && !saved.has_login) {
          saved = await api.createDesignerLogin(saved.id, payload.email);
        }
      } else {
        
        let body = payload;
        if (photo) {
          body = new FormData();
          Object.entries(payload).forEach(([k, v]) => body.append(k, v));
          body.append('profile_photo', photo);
        }
        saved = existing
          ? await api.updateTailor(existing.id, body)
          : await api.createTailor(body);
      }
      if (!existing) setSavedMember(saved);
      
      const cred = saved?.bootstrap_password ? saved : credential;
      if (saved?.bootstrap_password) setCredential(saved);
      if (!isDesigner) {
        const employment = cleaned({ ...termsForm, phone: termsForm.phone || payload.phone });
        const filledIn = Object.keys(employment).some((k) => !['employment_type', 'phone'].includes(k));
        let profile = savedTerms;
        if (!profile && filledIn) {
          const rows = await api.getStaffProfiles();
          profile = (Array.isArray(rows) ? rows : []).find((r) => String(r.staff) === String(saved.id)) || null;
        }
        if (profile) {
          await api.updateStaffProfile(profile.id, employment);
          setSavedTerms(profile);
        } else if (filledIn) {
          setSavedTerms(await api.createStaffProfile({ ...employment, staff: saved.id }));
        }
      }

      // Documents, one request each, dropped from the queue as they land.
      for (const doc of pending) {
        const body = new FormData();
        body.append(isDesigner ? 'designer' : 'staff', saved.id);
        body.append('kind', doc.kind);
        body.append('number', doc.number);
        body.append('label', doc.label);
        body.append('file', doc.file);
        await api.uploadStaffDocument(body);
        setPending((p) => p.filter((d) => d !== doc));
      }

      if (cred) setCreated(cred);
      else { onSaved(); onCancel(); }
    } catch (err) {
      setError(err.message || 'Could not save this person.');
    } finally {
      setBusy(false);
    }
  };

  if (created) {
    const done = () => { onSaved(); onCancel(); };
    return (
      <Modal title="Account created" onClose={done}>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
          {created.name} can sign in with the details below. This password is
          shown once and is not stored anywhere it can be read again.
        </p>
        <div style={{ ...panel, padding: '14px 16px', marginTop: '12px' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Email</div>
          <div style={{ fontWeight: 600, marginBottom: '10px' }}>{created.email}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Password</div>
          <div style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: '15px' }}>
            {created.bootstrap_password}
          </div>
        </div>
        {/* Carried over from the retired Manage Tailors screen. A password
            shown once is only useful if it can be handed over in the same
            breath -- the owner is standing next to the person. */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap',
                      justifyContent: 'flex-end', marginTop: '16px' }}>
          <button
            type="button"
            className="btn-secondary"
            style={copied === 'done' ? { color: 'var(--success-color)', borderColor: 'var(--success-color)' } : undefined}
            onClick={async () => {
              const text = `Atelier Staff Login Credentials:\nPortal: ${window.location.origin}\nEmail: ${created.email}\nPassword: ${created.bootstrap_password}`;
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
            href={`https://wa.me/?text=${encodeURIComponent(
              `Hello ${created.name},\nHere are your Atelier login credentials:\nPortal: ${window.location.origin}\nEmail: ${created.email}\nPassword: ${created.bootstrap_password}`
            )}`}
          >Share on WhatsApp</a>
          <button type="button" className="btn-primary" onClick={done}>Done</button>
        </div>
      </Modal>
    );
  }

  const roleLocked = editing && isDesigner;
  const roleHint = roleLocked
    ? 'A designer cannot be moved to the production floor -- they are a different record.'
    : roleChoice === '__custom__'
      ? 'A custom role gets the same access as floor staff -- attendance and their own assignments.'
      : (editing ? 'Changing the role changes which stages they can be given and what they see. ' : '')
        + (ASSIGNABLE_ROLES.find((r) => r.value === roleChoice)?.hint || '');

  return (
    <Modal
      icon={UserPlus}
      title={editing ? `Edit ${member.name}` : 'Add staff'}
      subtitle={editing ? 'Details, employment and documents for this team member.' : 'Details, employment and documents, all in one go.'}
      onClose={onCancel}
      width="760px"
      footer={(
        <>
          <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
          <button type="submit" form="add-staff-form" className="btn-primary" disabled={busy}>
            <UserPlus size={16} /> {busy ? 'Saving…' : (editing ? 'Save changes' : 'Add staff')}
          </button>
        </>
      )}
    >
      <form id="add-staff-form" onSubmit={submit} className="at-stack">
        {error && (
          <div style={errorBox}>{error}</div>
        )}
        <Field label="Name" icon={User}>
          <input className="form-input" value={form.name} onChange={set('name')} maxLength={LIMITS.name}
                 placeholder="Full name" autoFocus />
        </Field>
        {form.role !== 'Designer' && (
          <div className="at-field">
            <span className="at-field-label">Profile photo</span>
            <div className="at-form-section" style={{ flexDirection: 'row', alignItems: 'center', gap: 'var(--space-4)', background: 'var(--surface-2)' }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
                            background: 'var(--surface-inset)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: 'var(--text-muted)' }}>
                {(photo || member?.profile_photo)
                  ? <img src={photo ? URL.createObjectURL(photo) : member.profile_photo} alt=""
                         style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <User size={26} />}
              </div>
              <div style={{ minWidth: 0, flex: 1, borderLeft: '1px solid var(--border-color)', paddingLeft: 'var(--space-4)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <button type="button" className="btn-secondary at-btn-sm"
                          onClick={() => document.getElementById('add-staff-photo').click()}>
                    <Upload size={14} /> Choose file
                  </button>
                  <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                    {photo ? photo.name : 'No file chosen'}
                  </span>
                  <input id="add-staff-photo" type="file" accept="image/*" hidden
                         onChange={(e) => {
                           const file = e.target.files?.[0] || null;
                           const bad = file ? imageFilesError([file]) : '';
                           setError(bad || null);
                           setPhoto(bad ? null : file);
                         }} />
                  <CameraButton onFiles={([f]) => {
                    const bad = f ? imageFilesError([f]) : '';
                    setError(bad || null);
                    setPhoto(bad ? null : (f || null));
                  }} />
                </div>
                <div className="at-field-hint" style={{ marginTop: '6px' }}>
                  Shows on their login. They can change it themselves from My Account.
                </div>
              </div>
            </div>
          </div>
        )}
        <Field label="Mobile number" icon={Smartphone}>
          <input className="form-input" type="tel" value={form.phone} inputMode="numeric"
                 onChange={(e) => setForm({ ...form, phone: tenDigits(e.target.value) })}
                 placeholder="10-digit mobile" />
        </Field>
        <Field label="Role" icon={Scissors} hint={roleHint}>
          <select className="form-input" value={roleChoice} disabled={roleLocked}
                  onChange={(e) => {
                    const v = e.target.value;
                    setRoleChoice(v);
                    setForm({ ...form, role: v === '__custom__' ? customRole : v });
                  }}>
            {/* Designer is offered only when adding: an existing floor member
                cannot become one (see roleLocked), and a designer's own select
                is locked with Designer already chosen. */}
            {ASSIGNABLE_ROLES.filter(({ value }) => !(editing && !isDesigner && value === 'Designer')).map(({ value, label }) => (
              <option key={value} value={value}>{label}</option>
            ))}
            {reusable.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
            <option value="__custom__">Other (add a custom role)…</option>
          </select>
        </Field>
        {roleChoice === '__custom__' && (
          <Field label="Custom role" icon={Tag}>
            <input className="form-input" value={customRole} maxLength={50}
                   placeholder="e.g. Janitor, Cleaner, Helper"
                   onChange={(e) => { setCustomRole(e.target.value); setForm({ ...form, role: e.target.value }); }} />
          </Field>
        )}
        <Field label="Email for their login" icon={Mail}
               hint="Give an address and a password is generated and shown once.">
          <input className="form-input" type="email" value={form.email} onChange={set('email')} maxLength={LIMITS.email}
                 placeholder="Leave blank for no login" />
        </Field>
        <Field label={form.role === 'Designer' ? 'Specialisation' : 'Specialty'} optional icon={Sparkles}>
          <input className="form-input" value={form.specialty} onChange={set('specialty')} maxLength={100}
                 placeholder="Bridal blouses, lehenga…" />
        </Field>
        {editing && form.role !== 'Designer' && (
          <Field label="Status" icon={UserCheck}>
            <select className="form-input" value={form.status} onChange={set('status')}>
              <option value="Available">Available</option>
              <option value="Busy">Busy</option>
            </select>
          </Field>
        )}

        {!isDesigner && (
          <FormSection icon={Briefcase} tone="amber" title="Employment"
                       subtitle={savedTerms ? 'Employment type, pay and dates.' : 'Optional: leave blank to set it up later from Edit.'}>
            <TermsFields form={termsForm} setForm={setTermsForm} memberName={form.name.trim() || 'this person'} />
          </FormSection>
        )}

        <FormSection icon={FileText} tone="green" title="Documents"
                     subtitle="Identity and employment documents. Files added here are uploaded when you save.">
          {docsError && <div style={errorBox}>{docsError}</div>}
          {(docs.length > 0 || pending.length > 0) && (
            <div className="at-form-section" style={{ gap: 0, padding: 'var(--space-2) var(--space-4)' }}>
              {docs.map((doc) => (
                <div key={doc.id} className="at-row">
                  <IconTile icon={FileText} tone="green" size={38} iconSize={17} />
                  <div className="at-row-main">
                    <div className="at-row-title">{doc.kind_display}{doc.label ? ` · ${doc.label}` : ''}</div>
                    <div className="at-row-sub">{doc.number || 'No number recorded'}</div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    {doc.file_url && (
                      <a className="btn-secondary at-btn-sm" href={doc.file_url}
                         target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                        <Eye size={14} /> View
                      </a>
                    )}
                    <button type="button" className="btn-secondary at-btn-sm at-btn-danger" onClick={() => removeDoc(doc)}
                            aria-label={`Remove ${doc.kind_display}`}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
              {pending.map((doc, i) => (
                <div key={`${doc.file.name}-${i}`} className="at-row">
                  <IconTile icon={FilePlus} tone="amber" size={38} iconSize={17} />
                  <div className="at-row-main">
                    <div className="at-row-title">{kindLabel(doc.kind)}{doc.label ? ` · ${doc.label}` : ''}</div>
                    <div className="at-row-sub">{doc.file.name} · uploads on save</div>
                  </div>
                  <button type="button" className="btn-secondary at-btn-sm at-btn-danger" aria-label="Remove"
                          onClick={() => setPending((p) => p.filter((d) => d !== doc))}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="at-form-grid">
            <Field label="Document type" icon={FileText}>
              <select className="form-input" value={docForm.kind}
                      onChange={(e) => setDocForm({ ...docForm, kind: e.target.value, number: cleanDocumentNumber(e.target.value, docForm.number) })}>
                {DOCUMENT_KINDS.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </Field>
            <Field label="Document number" optional icon={Hash} hint={docNumberProblem ? <span style={{ color: 'var(--danger-color)' }}>{docNumberProblem}</span> : undefined}>
              <input className="form-input" value={docForm.number} maxLength={64}
                     aria-invalid={Boolean(docNumberProblem)}
                     style={docNumberProblem ? { borderColor: 'var(--danger-color)' } : undefined}
                     onChange={(e) => setDocForm({ ...docForm, number: cleanDocumentNumber(docForm.kind, e.target.value) })}
                     placeholder="Enter document number" />
            </Field>
          </div>
          <Field label="Label / description" optional icon={Tag}>
            <input className="form-input" value={docForm.label} maxLength={120}
                   onChange={(e) => setDocForm({ ...docForm, label: e.target.value })}
                   placeholder="e.g. Aadhaar (front), 2026 contract…" />
          </Field>
          {docFile ? (
            <div className="at-form-section" style={{ flexDirection: 'row', alignItems: 'center', gap: 'var(--space-3)' }}>
              <IconTile icon={FileText} tone="green" size={40} iconSize={18} />
              <div className="at-row-main">
                <div className="at-row-title">{docFile.name}</div>
                <div className="at-row-sub">{Math.round(docFile.size / 1024)} KB</div>
              </div>
              <button type="button" className="btn-secondary at-btn-sm" onClick={() => setDocFile(null)}>Remove</button>
            </div>
          ) : (
            <Dropzone compact camera accept="image/*,application/pdf"
                      title="Drag & drop a file here" subtitle="or choose from your device"
                      chooseLabel="Choose file" hint="JPG, PNG or PDF, up to 10MB"
                      onFiles={(files) => {
                        const file = files[0] || null;
                        // The server refuses anything over 10 MB; say so before the save.
                        const bad = file && file.size > 10 * 1024 * 1024 ? `${file.name} is larger than 10 MB.` : null;
                        setError(bad);
                        setDocFile(bad ? null : file);
                      }} />
          )}
          <div>
            <button type="button" className="btn-secondary at-btn-sm" onClick={addDocument} disabled={!docFile || Boolean(docNumberProblem)}>
              <Plus size={14} /> Add document
            </button>
          </div>
        </FormSection>
      </form>
    </Modal>
  );
}

function Roster({ isOwner, canSeeTeam }) {
  const [roster, setRoster] = useState([]);
  const [designers, setDesigners] = useState([]);
  const [terms, setTerms] = useState([]);
  const [attendanceToday, setAttendanceToday] = useState([]);
  // Owner only. The endpoint refuses everyone else, so this stays empty for a
  // Master and the deposit block simply does not render for them.
  const [deposits, setDeposits] = useState([]);
  const [advances, setAdvances] = useState([]);
  const [issuingFor, setIssuingFor] = useState(null);
  // Roster rows whose pay / deposit / advance detail is open.
  const [expanded, setExpanded] = useState(() => new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [person, setPerson] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      // Independent failures: a staff member may read their own terms but not
      // the roster, so one refusal must not blank the whole screen.
      const d = new Date();
      const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const [people, designed, profiles, deposited, advanced, present] = await Promise.all([
        canSeeTeam ? api.getTailors().catch(() => []) : Promise.resolve([]),
        // Designers are a separate table with a separate endpoint. They are on
        // this screen because this is where a boutique adds a person, not
        // because they became roster rows.
        canSeeTeam ? api.getDesigners().catch(() => []) : Promise.resolve([]),
        api.getStaffProfiles().catch(() => []),
        isOwner ? api.getDeposits().catch(() => []) : Promise.resolve([]),
        isOwner ? api.getAdvances({ active: 'true' }).catch(() => []) : Promise.resolve([]),
        // Today's attendance, for the "on the floor now" figure in the overview.
        canSeeTeam ? api.getAttendance({ date: today }).catch(() => []) : Promise.resolve([]),
      ]);
      setRoster(Array.isArray(people) ? people : []);
      setDesigners(Array.isArray(designed) ? designed : []);
      setTerms(Array.isArray(profiles) ? profiles : []);
      setDeposits(Array.isArray(deposited) ? deposited : []);
      setAdvances(Array.isArray(advanced) ? advanced : []);
      setAttendanceToday(Array.isArray(present) ? present : []);
    } catch (err) {
      setLoadError(err.message || 'Could not load the staff list.');
    } finally {
      setLoading(false);
    }
  }, [canSeeTeam, isOwner]);


  useEffect(() => {
    const t = setTimeout(refresh, 0);
    return () => clearTimeout(t);
  }, [refresh]);

  const advancesByStaff = useMemo(() => {
    const map = new Map();
    advances.forEach((a) => {
      const key = String(a.staff);
      map.set(key, [...(map.get(key) || []), a]);
    });
    return map;
  }, [advances]);

  const depositByStaff = useMemo(() => {
    const map = new Map();
    deposits.forEach((d) => map.set(String(d.staff), d));
    return map;
  }, [deposits]);

  const termsByStaff = useMemo(() => {
    const map = new Map();
    terms.forEach((t) => map.set(String(t.staff), t));
    return map;
  }, [terms]);

  /** Owners see the roster; a staff member sees only the row their own terms name. */
  const rows = useMemo(() => {
    const source = canSeeTeam
      ? [
          ...roster.map((person) => ({
            member: person, terms: termsByStaff.get(String(person.id)),
          })),
        
          ...designers.map((d) => ({
            member: { ...d, role: 'Designer', isDesigner: true },
            terms: undefined,
          })),
        ]
      : terms.map((t) => ({
          member: { id: t.staff, name: t.staff_name, role: t.staff_role },
          terms: t,
        }));
    const needle = search.trim().toLowerCase();
    if (!needle) return source;
    return source.filter(({ member }) =>
      `${member.name} ${member.role}`.toLowerCase().includes(needle));
  }, [canSeeTeam, roster, designers, terms, termsByStaff, search]);

  const withTerms = rows.filter((r) => r.terms).length;

 
  const roleCounts = useMemo(() => {
    const counts = {};
    roster.forEach((p) => { counts[p.role] = (counts[p.role] || 0) + 1; });
    if (designers.length) counts.Designer = designers.length;
    return counts;
  }, [roster, designers]);

  const rosterRoles = useMemo(
    () => [...new Set(roster.map((p) => p.role).filter(Boolean))],
    [roster]);

  const analytics = useMemo(() => {
    const total = roster.length + designers.length;
    const busy = roster.filter((p) => (p.status || '').toLowerCase() === 'busy').length;
    const available = roster.length - busy;
    const presentIds = new Set(attendanceToday.map((s) => String(s.staff)));
    const workingNow = new Set(
      attendanceToday.filter((s) => s.is_open).map((s) => String(s.staff))).size;
    const emp = {};
    terms.forEach((t) => {
      const k = t.employment_type || 'UNSET';
      emp[k] = (emp[k] || 0) + 1;
    });
    return { total, available, busy, presentToday: presentIds.size, workingNow, emp };
  }, [roster, designers, attendanceToday, terms]);

  // "Master" -> "Masters", but roles ending in "Staff" stay as they are.
  const plural = (role, n) =>
    (n === 1 || /staff$/i.test(role)) ? role : `${role}s`;


  if (loading) {
    return <div style={{ padding: '32px', color: 'var(--text-muted)' }}>Loading staff…</div>;
  }

  return (
    <>
      {loadError && (
        <div style={errorBox}>{loadError}</div>
      )}

      {canSeeTeam && (() => {
        return (
          <div className="at-stat-grid" style={{ marginBottom: 'var(--space-5)' }}>
            <StatCard icon={Users} tone="green" label="Team size" value={analytics.total}
                      sub={`${roster.length} people`} />
            <StatCard icon={UserCheck} tone="amber" label="Available now" value={analytics.available}
                      sub={analytics.busy ? `${analytics.busy} busy` : 'nobody busy'} />
            <StatCard icon={Clock} tone="blue" label="Present today" value={analytics.presentToday}
                      sub={analytics.workingNow ? `${analytics.workingNow} in now` : 'Marked in attendance'} />
            <StatCard icon={Briefcase} tone="violet" label="Pay details added" value={withTerms}
                      sub={`${withTerms} of ${roster.length}`} />
          </div>
        );
      })()}

      {/* Role and employment mix: a chip is a count plus a label, so it reads
          as one figure. Grouped with an eyebrow, on a well, so the eye takes
          them as a breakdown rather than four more cards. */}
      {canSeeTeam && (Object.keys(roleCounts).length > 0 || withTerms > 0) && (() => {
        const chip = (n, label) => (
          <div key={label} style={{
            background: 'var(--surface-color)', border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-md)', padding: '8px 14px',
            display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)',
          }}>
            <span style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--weight-bold)',
                           fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>{n}</span>
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>{label}</span>
          </div>
        );
        return (
          <div style={{
            background: 'var(--surface-inset)', border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-lg)', padding: 'var(--space-4) var(--space-5)',
            marginBottom: 'var(--space-5)', display: 'flex', flexWrap: 'wrap',
            gap: 'var(--space-6)',
          }}>
            {Object.keys(roleCounts).length > 0 && (
              <div>
                <div className="ui-eyebrow" style={{ marginBottom: 'var(--space-2)' }}>By role</div>
                <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                  {Object.entries(roleCounts).sort((a, b) => b[1] - a[1])
                    .map(([role, n]) => chip(n, plural(role, n)))}
                </div>
              </div>
            )}
            {withTerms > 0 && (
              <div>
                <div className="ui-eyebrow" style={{ marginBottom: 'var(--space-2)' }}>By work type</div>
                <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                  {EMPLOYMENT_TYPES.filter(([k]) => analytics.emp[k])
                    .map(([k, label]) => chip(analytics.emp[k], label))}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {canSeeTeam && (
        <div style={{
          display: 'flex', gap: 'var(--space-3)', alignItems: 'center',
          flexWrap: 'wrap', marginBottom: 'var(--space-4)',
        }}>
          <SearchBox value={search} onChange={setSearch} placeholder="Search team by name, role or phone…" />
          {isOwner && (
            <button type="button" className="btn-primary" style={{ marginLeft: 'auto', padding: '10px 18px' }} onClick={() => setAdding(true)}>
              <Plus size={16} /> Add a team member
            </button>
          )}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="ui-card" style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--text-secondary)' }}>
          {canSeeTeam
            ? 'Nobody on the team yet. Add someone with the button above -- their role, login, pay details and documents are all set up in one go.'
            : 'Your employment details have not been set up yet. Your boutique owner can add them.'}
        </div>
      ) : (
        // A dense roster: one line per person with the money summarised
        // inline, and the full pay / deposit / advance detail behind a
        // chevron. Money columns only appear when someone on the list has
        // pay set up, so a roster with no employment yet stays short.
        (() => {
          const showPay = isOwner && rows.some(({ terms }) => terms && showsPay(terms));
          const cols = 4 + (showPay ? 2 : 0) + (isOwner ? 1 : 0);
          const toggle = (id) => setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
          });
          const cell = { fontSize: 'var(--text-sm)', color: 'var(--text-primary)' };
          const sub = { fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: '2px' };
          const muted = <span style={{ color: 'var(--text-muted)' }}>—</span>;
          return (
        <div className="at-table-wrap">
          <table className="at-table">
            <thead>
              <tr>
                <th>Team member</th>
                <th>Status</th>
                <th>Contact</th>
                <th>Work type</th>
                {showPay && <th>Pay</th>}
                {showPay && <th>Advances</th>}
                {isOwner && <th style={{ textAlign: 'right' }}></th>}
              </tr>
            </thead>
            <tbody>
          {rows.map(({ member, terms: t }) => {
            const hasDetail = Boolean(t && showsPay(t));
            const open = expanded.has(member.id);
            const deposit = depositByStaff.get(String(member.id));
            const advances = advancesByStaff.get(String(member.id)) || [];
            const outstanding = advances.reduce((n, a) => n + Number(a.outstanding || 0), 0);
            return (
            <Fragment key={member.id}>
              <tr style={open ? { background: 'var(--surface-2)' } : undefined}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', minWidth: 0 }}>
                    <AvatarInitials name={member.name} size={36} />
                    <div style={{ minWidth: 0 }}>
                      {isOwner ? (
                        <button
                          type="button"
                          onClick={() => setPerson(member)}
                          title="Edit details, employment and documents"
                          style={{
                            fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-sm)',
                            background: 'none', border: 'none', padding: 0, cursor: 'pointer', minHeight: '32px',
                            color: 'var(--text-primary)', textAlign: 'left', fontFamily: 'inherit',
                          }}
                        >{member.name}</button>
                      ) : (
                        <div style={{ fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-sm)',
                                      color: 'var(--text-primary)' }}>{member.name}</div>
                      )}
                      <div style={sub}>
                        {member.role}
                        {member.isDesigner && ` · ${member.design_count ?? 0} design(s)${member.has_login ? '' : ' · no login yet'}`}
                      </div>
                    </div>
                  </div>
                </td>

                <td>
                  {member.status && canSeeTeam && !member.isDesigner
                   && !attendanceToday.some((s) => String(s.staff) === String(member.id)) ? (
                    // Not marked in today: the stored Available/Busy is stale until they arrive.
                    <span className="ui-badge ui-badge--danger">● Absent</span>
                  ) : member.status ? (
                    <span className={`ui-badge ui-badge--${member.status === 'Available' ? 'success' : member.status === 'Busy' ? 'warning' : 'neutral'}`}>
                      ● {member.status}
                    </span>
                  ) : member.isDesigner ? (
                    <span className="ui-badge ui-badge--neutral">Designer</span>
                  ) : null}
                </td>

                <td style={cell}>
                  {member.phone
                    ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}><Phone size={12} /> {member.phone}</span>
                    : muted}
                </td>

                <td style={cell}>
                  {t ? (
                    <>
                      <div>{employmentLabel(t.employment_type)}</div>
                      <div style={sub}>
                        {t.joined_at
                          ? `Joined ${new Date(t.joined_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`
                          : 'Joining date not set'}
                      </div>
                    </>
                  ) : member.isDesigner ? muted : (
                    // Only a roster row can have employment terms -- StaffProfile's
                    // FK points at Tailor -- so a designer is never "not set up".
                    <span style={{ color: 'var(--text-muted)' }}
                          title="No employment details yet — this person works exactly as before.">
                      Not added
                    </span>
                  )}
                </td>

                {showPay && (
                  <td style={cell}>
                    {t && showsPay(t) ? (
                      <>
                        <div>{money(t.hourly_rate)}<span style={{ color: 'var(--text-muted)' }}>/hr</span></div>
                        <div style={sub}>
                          {deposit
                            ? (deposit.fully_recovered ? 'Deposit recovered' : `Deposit ${money(deposit.remaining)} left`)
                            : `Deposit ${money(t.deposit_total)}`}
                        </div>
                      </>
                    ) : muted}
                  </td>
                )}

                {showPay && (
                  <td style={cell}>
                    {t && showsPay(t) ? (
                      <>
                        <div>{outstanding > 0 ? money(outstanding) : <span style={{ color: 'var(--text-muted)' }}>None</span>}</div>
                        {outstanding > 0 && <div style={sub}>{advances.length} outstanding</div>}
                      </>
                    ) : muted}
                  </td>
                )}

                {isOwner && (
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                      {t && showsPay(t) && (
                        <button type="button" className="btn-secondary at-btn-sm"
                                onClick={() => setIssuingFor(member)} title="Issue an advance">
                          <Plus size={14} /> Advance
                        </button>
                      )}
                      {/* One door: details, employment and documents are all
                          behind it. Primary until employment is set up. */}
                      <button
                        type="button"
                        className={`${t || member.isDesigner ? 'btn-secondary' : 'btn-primary'} at-btn-sm`}
                        onClick={() => setPerson(member)}
                        title="Edit details, employment and documents"
                      >
                        <Pencil size={14} /> Edit
                      </button>
                      {hasDetail && (
                        <button type="button" className="btn-secondary at-btn-sm"
                                onClick={() => toggle(member.id)}
                                aria-expanded={open}
                                title={open ? 'Hide pay and advances' : 'Show pay and advances'}
                                style={{ padding: '0 8px' }}>
                          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>

              {hasDetail && open && (
              <tr>
              <td colSpan={cols} style={{ paddingTop: 0, background: 'var(--surface-2)' }}>
              {t && showsPay(t) && (
                <div
                  className="mobile-stack-grid"
                  style={{
                    display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px',
                    marginTop: '12px', paddingTop: '12px',
                    borderTop: '1px solid var(--border-color, rgba(255,255,255,0.08))',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Hourly rate</div>
                    <div style={{ fontWeight: 600 }}>{money(t.hourly_rate)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Deposit</div>
                    <div style={{ fontWeight: 600 }}>{money(t.deposit_total)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Weekly deduction</div>
                    <div style={{ fontWeight: 600 }}>{money(t.deposit_weekly)}</div>
                  </div>
                </div>
              )}

              {t && showsPay(t) && depositByStaff.get(String(member.id)) && (
                (() => {
                  const d = depositByStaff.get(String(member.id));
                  return (
                    <div style={{
                      marginTop: '12px', paddingTop: '12px',
                      borderTop: '1px solid var(--border-color, rgba(255,255,255,0.08))',
                    }}>
                      <div className="ui-eyebrow" style={{ marginBottom: '8px' }}>
                        Security deposit
                      </div>
                      <div
                        className="mobile-stack-grid"
                        style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
                                 gap: '10px' }}
                      >
                        <div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Agreed</div>
                          <div style={{ fontWeight: 600 }}>{money(d.agreed)}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Recovered</div>
                          <div style={{ fontWeight: 600 }}>{money(d.recovered)}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Remaining</div>
                          <div style={{ fontWeight: 600 }}>{money(d.remaining)}</div>
                        </div>
                      </div>
                      {d.fully_recovered && (
                        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--success-color)', marginTop: '8px' }}>
                          Security deposit fully recovered.
                        </div>
                      )}
                    </div>
                  );
                })()
              )}

              {isOwner && t && showsPay(t) && (
                <div style={{
                  marginTop: '12px', paddingTop: '12px',
                  borderTop: '1px solid var(--border-color, rgba(255,255,255,0.08))',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between',
                                alignItems: 'center', marginBottom: '8px' }}>
                    <div className="ui-eyebrow">
                      Advances
                    </div>
                    <button type="button" className="btn-secondary"
                            onClick={() => setIssuingFor(member)}
                            style={{ minHeight: '34px', fontSize: '12px',
                                     display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <Plus size={12} /> Issue advance
                    </button>
                  </div>
                  {(advancesByStaff.get(String(member.id)) || []).length === 0 ? (
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      No outstanding advance.
                    </div>
                  ) : (
                    (advancesByStaff.get(String(member.id)) || []).map((a) => (
                      <div key={a.id}
                           className="mobile-stack-grid"
                           style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
                                    gap: '10px', marginBottom: '6px' }}>
                        <div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            Issued {new Date(a.issued_on).toLocaleDateString([], { day: 'numeric', month: 'short' })}
                          </div>
                          <div style={{ fontWeight: 600 }}>{money(a.issued)}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Recovered</div>
                          <div style={{ fontWeight: 600 }}>{money(a.recovered)}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            Outstanding · {money(a.weekly_recovery)}/wk
                          </div>
                          <div style={{ fontWeight: 600 }}>{money(a.outstanding)}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              </td>
              </tr>
              )}
            </Fragment>
            );
          })}
            </tbody>
          </table>
        </div>
          );
        })()
      )}

      {issuingFor && (
        <Modal title={`Issue advance — ${issuingFor.name}`} onClose={() => setIssuingFor(null)}>
          <AdvanceForm
            member={issuingFor}
            onCancel={() => setIssuingFor(null)}
            onSaved={() => { setIssuingFor(null); refresh(); }}
          />
        </Modal>
      )}

      {adding && (
        <AddStaffForm
          onCancel={() => setAdding(false)}
          onSaved={refresh}
          customRoles={rosterRoles}
        />
      )}

      {person && (
        <AddStaffForm
          member={person}
          terms={termsByStaff.get(String(person.id))}
          onCancel={() => setPerson(null)}
          onSaved={refresh}
          customRoles={rosterRoles}
        />
      )}

    </>
  );
}

const TABS = [
  { key: 'roster', label: 'Team', icon: Users },
  { key: 'tasks', label: 'Tasks', icon: ClipboardList },
  { key: 'attendance', label: 'Attendance', icon: Clock },
  { key: 'payroll', label: 'Payroll', icon: Wallet },
  { key: 'performance', label: 'Performance', icon: TrendingUp },
];

export default function StaffPanel({ currentUser }) {
  // Mirrors the backend: the owner manages, a Master supervises (reads the team
  // without its pay), everyone else sees themselves. This is UX only -- every
  // one of these boundaries is enforced again server-side, and the buttons
  // hidden here are refused there too.
  const isOwner = !currentUser?.role || currentUser.role === 'Owner';
  const isSupervisor = currentUser?.role === 'Master';
  const canSeeTeam = isOwner || isSupervisor;

  // A tailor opens this to record their hours, not to browse a roster of one.
  // Managers open it on the team. Same screen, different first thing.
  const [tab, setTab] = useState(canSeeTeam ? 'roster' : 'attendance');

  return (
    <>
      <PageHeader
        title={canSeeTeam ? 'Your team' : 'My attendance'}
        subtitle={canSeeTeam
          ? 'Tailors, masters, karigars and designers: who is in, what they are paid, and how they are doing.'
          : 'Check in and out, and see the hours recorded for you.'}
      />

      {/* Tab strip, not pill buttons: these switch a view, and an underline on
          the active one reads as navigation rather than four call-to-actions. */}
      <div style={{
        display: 'flex', gap: 'var(--space-1)', flexWrap: 'wrap', margin: 'var(--space-5) 0 var(--space-6)',
        borderBottom: '1px solid var(--border-color)',
      }}>
        {(isOwner
            ? TABS
            : canSeeTeam
              ? TABS.filter((t) => t.key !== 'payroll')
              : TABS.filter((t) => ['attendance', 'roster', 'tasks', 'performance'].includes(t.key)))
          .map(({ key, label, icon: Icon }) => {
          const active = tab === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '10px 14px', marginBottom: '-1px',
                fontSize: 'var(--text-base)',
                fontWeight: active ? 'var(--weight-semibold)' : 'var(--weight-medium)',
                color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                borderBottom: `2px solid ${active ? 'var(--primary-color)' : 'transparent'}`,
              }}
            >
              <Icon size={15} /> {canSeeTeam || key !== 'roster' ? label : 'My details'}
            </button>
          );
        })}
      </div>

      {tab === 'roster' && <Roster isOwner={isOwner} canSeeTeam={canSeeTeam} />}
      {tab === 'tasks' && <TeamTasks currentUser={currentUser} canSeeTeam={canSeeTeam} />}
      {tab === 'attendance' && (
        <Attendance isOwner={isOwner} canSeeTeam={canSeeTeam} />
      )}
      {tab === 'payroll' && (
        // Owner-only, and only the owner can reach this tab at all: the Payroll
        // button is not rendered for anyone else (see TABS filtering above).
        isOwner ? <Payroll /> : (
          <NotBuiltYet
            title="Payroll is not yours to see"
            blurb="Weekly pay runs are visible to the boutique owner only."
          />
        )
      )}
      {tab === 'performance' && (
        <Performance isOwner={isOwner} canSeeTeam={canSeeTeam} />
      )}
    </>
  );
}
