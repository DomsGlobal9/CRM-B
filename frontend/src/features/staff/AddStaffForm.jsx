import { useState, useEffect, useCallback } from 'react';
import { Check, Plus, Clock, FileText, Trash2, Calendar, Briefcase, UserCheck, User, UserPlus, Smartphone, Mail, Sparkles, Scissors, Shield, Coins, MapPin, Hash, Tag, FilePlus, Upload, Eye, IndianRupee } from 'lucide-react';
import { api } from '../../api';
import { Field, Dropzone, InfoNote, FormSection, IconTile, CameraButton } from '../../components/ui/Atelier';
import { ASSIGNABLE_ROLES, DOCUMENT_KINDS } from '../../constants/roles';
import VoiceTextarea from '../../components/ui/VoiceTextarea';
import { LIMITS, tenDigits, mobileError, emailError, nameError, cleanAmount, amountError, cleanDocumentNumber, documentNumberError, imageFilesError } from '../../utils/validate';
import Loader from '../../components/ui/Loader';
import { Modal } from './StaffDialogs';
import { EMPLOYMENT_TYPES, cleaned, errorBox, panel } from './staffShared';
import { WHATSAPP_URL } from '../../constants/links';

/** Adding or editing a team member: their details, login, pay terms and documents. */

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

function DocumentThumb({ url }) {
  const [failed, setFailed] = useState(false);
  if (!url || failed || /\.pdf(\?|#|$)/i.test(url)) {
    return <IconTile icon={FileText} tone="green" size={38} iconSize={17} />;
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" title="Open the document"
       style={{ flexShrink: 0, width: 38, height: 38, borderRadius: 'var(--radius-md)', overflow: 'hidden',
                border: '1px solid var(--border-color)', background: 'var(--surface-inset)', display: 'block' }}>
      <img src={url} alt="" onError={() => setFailed(true)}
           style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
    </a>
  );
}

export default function AddStaffForm({ member, terms, onCancel, onSaved, customRoles = [], portalUrl = window.location.origin }) {
  const editing = Boolean(member);
  const [form, setForm] = useState({
    name: member?.name || '',
    phone: member?.phone || '',
    email: member?.email || '',
    specialty: member?.specialty || member?.specialisation || '',
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
  const [docsLoading, setDocsLoading] = useState(Boolean(member));
  const [docsError, setDocsError] = useState(null);
  const [pending, setPending] = useState([]);
  const [docForm, setDocForm] = useState({ kind: 'AADHAAR', number: '', label: '' });
  const [docFile, setDocFile] = useState(null);
  const [savedMember, setSavedMember] = useState(null);
  const [savedTerms, setSavedTerms] = useState(terms || null);
  const [credential, setCredential] = useState(null);

  const loadDocs = useCallback(async () => {
    if (!member) return;
    setDocsLoading(true);
    try {
      const rows = await api.getStaffDocuments(member.isDesigner ? { designer: member.id } : { staff: member.id });
      setDocs(Array.isArray(rows) ? rows : []);
    } catch (err) {
      setDocsError(err.message || 'Could not load documents.');
    } finally {
      setDocsLoading(false);
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
  const reusable = customRoles.filter((r) => !knownValues.includes(r));

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const isDesigner = form.role === 'Designer';
  const savedPhoto = member?.profile_photo || member?.profile_image || '';

  const submit = async (e) => {
    e.preventDefault();
    if (roleChoice === '__custom__' && !customRole.trim()) {
      setError('Type a name for the custom role.'); return;
    }

    const typedNumber = docForm.number.trim();
    const unqueued = docFile
      ? { ...docForm, number: typedNumber, label: docForm.label.trim(), file: docFile }
      : null;
    const problem = nameError(form.name) || mobileError(form.phone, { required: false }) || emailError(form.email)
      || termsError(termsForm)
      || (docFile && docNumberProblem ? docNumberProblem : '')
      || (!docFile && typedNumber ? `Choose the file for the ${kindLabel(docForm.kind)} document, or clear its number.` : '');
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
       
        if (photo) {
          const uploaded = await api.uploadBoutiqueDesignImage(photo);
          if (uploaded?.image_url) designerPayload.profile_image = uploaded.image_url;
        }
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
      const employment = cleaned({ ...termsForm, phone: termsForm.phone || payload.phone });
      const filledIn = Object.keys(employment).some((k) => !['employment_type', 'phone'].includes(k));
      
      const holder = isDesigner ? 'designer' : 'staff';
      let profile = savedTerms;
      if (!profile && filledIn) {
        const rows = await api.getStaffProfiles();
        profile = (Array.isArray(rows) ? rows : [])
          .find((r) => r[holder] !== null && String(r[holder]) === String(saved.id)) || null;
      }
      if (profile) {
        await api.updateStaffProfile(profile.id, employment);
        setSavedTerms(profile);
      } else if (filledIn) {
        setSavedTerms(await api.createStaffProfile({ ...employment, [holder]: saved.id }));
      }

      for (const doc of (unqueued ? [...pending, unqueued] : pending)) {
        const body = new FormData();
        body.append(isDesigner ? 'designer' : 'staff', saved.id);
        body.append('kind', doc.kind);
        body.append('number', doc.number);
        body.append('label', doc.label);
        body.append('file', doc.file);
        await api.uploadStaffDocument(body);
        if (doc === unqueued) {
          setDocFile(null);
          setDocForm({ kind: 'AADHAAR', number: '', label: '' });
        } else {
          setPending((p) => p.filter((d) => d !== doc));
        }
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
    const roleLine = (created.role || form.role) ? `\nRole: ${created.role || form.role}` : '';
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
          <div style={{ fontWeight: 600, fontFamily: 'var(--font-mono)', fontSize: '15px' }}>
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
            style={copied === 'done' ? { color: 'var(--success-text)', borderColor: 'var(--success-color)' } : undefined}
            onClick={async () => {
              const text = `Atelier Staff Login Credentials:\nPortal: ${portalUrl}${roleLine}\nEmail: ${created.email}\nPassword: ${created.bootstrap_password}`;
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
            href={`${WHATSAPP_URL}/?text=${encodeURIComponent(
              `Hello ${created.name},\nHere are your Atelier login credentials:\nPortal: ${portalUrl}${roleLine}\nEmail: ${created.email}\nPassword: ${created.bootstrap_password}`
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
        <div className="at-field">
          <span className="at-field-label">Profile photo</span>
          <div className="at-form-section" style={{ flexDirection: 'row', alignItems: 'center', gap: 'var(--space-4)', background: 'var(--surface-2)' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
                          background: 'var(--surface-inset)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: 'var(--text-muted)' }}>
              {(photo || savedPhoto)
                ? <img src={photo ? URL.createObjectURL(photo) : savedPhoto} alt=""
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
                  {photo ? photo.name : (savedPhoto ? 'Current photo' : 'No file chosen')}
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
                {isDesigner
                  ? 'Kept on their designer profile.'
                  : 'Shows on their login. They can change it themselves from My Account.'}
              </div>
            </div>
          </div>
        </div>
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

        <FormSection icon={Briefcase} tone="amber" title="Employment"
                     subtitle={savedTerms ? 'Employment type, pay and dates.' : 'Optional: leave blank to set it up later from Edit.'}>
          <TermsFields form={termsForm} setForm={setTermsForm} memberName={form.name.trim() || 'this person'} />
        </FormSection>

        <FormSection icon={FileText} tone="green" title="Documents"
                     subtitle="Identity and employment documents. Files added here are uploaded when you save.">
          {docsError && <div style={errorBox}>{docsError}</div>}
          {docsLoading && !docsError && <Loader section label="Loading documents…" />}
          {!docsLoading && (docs.length > 0 || pending.length > 0) && (
            <div className="at-form-section" style={{ gap: 0, padding: 'var(--space-2) var(--space-4)' }}>
              {docs.map((doc) => (
                <div key={doc.id} className="at-row">
                  <DocumentThumb url={doc.file_url} />
                  <div className="at-row-main">
                    <div className="at-row-title">{doc.kind_display}{doc.label ? ` · ${doc.label}` : ''}</div>
                    <div className="at-row-sub">{doc.number ? `No. ${doc.number}` : 'No number recorded'}</div>
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

/** "Delete this team member?" -- what goes, what stays, and a red button. */
