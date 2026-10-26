/**
 * Requests: the app's Request access and the website's demo form.
 *
 * Nobody creates their own boutique. A request lands here (the requester has
 * already been emailed "your request is under review", and the team alerted
 * at PLATFORM_ALERT_EMAIL), and Approve creates the boutique with a temporary
 * owner password, emails the owner their login details, and shows them once
 * so they can also be shared by hand. The owner must choose their own
 * password at first sign-in. "Resend login" issues a fresh temporary password
 * when the first email went astray.
 *
 * Status and notes are the only writable fields on a request, matching the
 * server: everything else was typed by the requester and is the evidence of
 * what they actually sent (LeadSerializer.read_only_fields). The approval form
 * starts from their answers but is the administrator's own, so a typo in the
 * request can be corrected before it becomes the owner's sign-in email.
 */

import { useCallback, useRef, useState } from 'react';
import { Check, Copy, KeyRound, Lock, Mail, UserPlus } from 'lucide-react';

import { consoleApi } from '../api';
import { go } from '../router';
import { LIMITS } from '../../services/validate';
import {
  Async, Empty, Modal, Note, PageHeader, Pill, Select, day, moment, useApi, useToast,
} from '../ui';

const STATUSES = ['NEW', 'CONTACTED', 'QUALIFIED', 'CONVERTED', 'DECLINED'];
// The server speaks in codes ('CONTACTED'); people read sentence case.
const STATUS_OPTIONS = STATUSES.map((s) => ({ value: s, label: s[0] + s.slice(1).toLowerCase() }));
const SOURCE_LABEL = { app: 'Access request', website: 'Demo request' };

function splitName(full) {
  const parts = (full || '').trim().split(/\s+/);
  return { first_name: parts[0] || '', last_name: parts.slice(1).join(' ') };
}

function CopyRow({ label, value }) {
  const [copied, setCopied] = useState(false);
  const field = useRef(null);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      field.current?.select();
    }
  };
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <div className="sa-onetime-row">
        <input ref={field} className="form-control sa-mono" readOnly value={value}
          onFocus={(e) => e.target.select()} aria-label={label} />
        <button className="btn-secondary" type="button" onClick={copy}>
          {copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy</>}
        </button>
      </div>
    </div>
  );
}

function ApproveDialog({ lead, plans, onCancel, onApproved }) {
  const toast = useToast();
  const [form, setForm] = useState(() => ({
    ...splitName(lead.name),
    email: lead.email || '',
    business_name: lead.boutique || '',
    phone: lead.phone || '',
    address: lead.address || '',
    plan: '',
    reason: '',
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const ready = form.first_name.trim() && form.last_name.trim() && form.email.trim()
    && form.business_name.trim() && form.plan;

  const submit = async (e) => {
    e?.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      const trimmed = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim()]));
      onApproved(await consoleApi.approveLead(lead.id, trimmed));
    } catch (err) {
      setError(err.message);
      toast(err.message, 'off');
    } finally {
      setBusy(false);
    }
  };

  const field = (key, label, props = {}) => (
    <div className="form-group">
      <label className="form-label" htmlFor={`approve-${key}`}>{label}</label>
      <input id={`approve-${key}`} className="form-control" value={form[key]} onChange={set(key)}
        disabled={busy} {...props} />
    </div>
  );
  const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0 12px' };

  return (
    <Modal icon={UserPlus} tone="green" busy={busy} onClose={onCancel}
      title={`Approve ${lead.boutique}`}
      subtitle="Creates the boutique and its owner, and emails them their login details."
      footer={(
        <>
          <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="button" className="btn-primary" onClick={submit} disabled={!ready || busy}>
            <UserPlus size={15} /> {busy ? 'Creating boutique…' : 'Approve and send login'}
          </button>
        </>
      )}>
      <form onSubmit={submit}>
        <Note tone="info">
          The owner gets a temporary password by email and must choose their own at
          first sign-in. Customer messaging starts <strong>off</strong>.
        </Note>
        <div style={grid}>
          {field('first_name', 'Owner first name', { maxLength: 150, required: true, autoFocus: true })}
          {field('last_name', 'Owner last name', { maxLength: 150, required: true })}
        </div>
        {field('email', 'Owner email (their sign-in)', { type: 'email', maxLength: LIMITS.email, required: true })}
        {field('business_name', 'Boutique name', { maxLength: 100, required: true })}
        <div style={grid}>
          {field('phone', 'Mobile', { inputMode: 'numeric', maxLength: 16 })}
          <div className="form-group">
            <label className="form-label" htmlFor="approve-plan">Plan</label>
            <select id="approve-plan" className="form-control" value={form.plan}
              onChange={set('plan')} disabled={busy} required>
              <option value="" disabled>Choose a plan…</option>
              {plans.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </div>
        </div>
        {field('address', 'Boutique address', { maxLength: LIMITS.address })}
        {field('reason', 'Note for the audit log (optional)', { maxLength: LIMITS.reason,
          placeholder: 'e.g. Called the owner on 26 Oct' })}
        {error && <Note tone="danger">{error}</Note>}
      </form>
    </Modal>
  );
}

function CredentialsDialog({ result, onDone }) {
  const { login, boutique, emailed } = result;
  return (
    <Modal icon={KeyRound} tone="green" onClose={onDone}
      title={`Login details for ${boutique.name}`}
      footer={(
        <>
          <button type="button" className="btn-secondary"
            onClick={() => { onDone(); go(`boutiques/${boutique.schema_name}`); }}>
            Open boutique
          </button>
          <button type="button" className="btn-primary" onClick={onDone}>Done</button>
        </>
      )}>
      {emailed ? (
        <Note tone="success">
          Emailed to <strong>{login.email}</strong>. If it doesn&apos;t arrive, share these
          details with the owner directly.
        </Note>
      ) : (
        <Note tone="danger">
          The email could not be sent. Share these details with the owner yourself
          before closing this window.
        </Note>
      )}
      <CopyRow label="Sign-in page" value={login.login_url} />
      <CopyRow label="Email" value={login.email} />
      <CopyRow label="Temporary password" value={login.temporary_password} />
      <p className="sa-onetime-note">
        <Lock size={14} aria-hidden="true" />
        <span>
          Shown once: it is not stored by this console or written to the audit log.
          Anyone with it can sign in as the owner until they choose their own password.
        </span>
      </p>
    </Modal>
  );
}

export default function Leads() {
  const toast = useToast();
  const [saving, setSaving] = useState(null);
  const [saved, setSaved] = useState(null);
  const [approving, setApproving] = useState(null);
  const [resending, setResending] = useState(null);
  const [credentials, setCredentials] = useState(null);

  const state = useApi(useCallback(() => consoleApi.leads(), []));
  const plansState = useApi(useCallback(() => consoleApi.modules(), []));
  const plans = plansState.data?.plans || [];

  const replaceRow = (updated) => {
    const rows = state.data.results || state.data;
    const index = rows.findIndex((row) => row.id === updated.id);
    if (index !== -1) rows.splice(index, 1, updated);
  };

  const save = async (lead, fields) => {
    setSaving(lead.id);
    try {
      // Patch in place rather than refetching: the administrator is working
      // down a list and a reload would jump them back to the top of it.
      replaceRow(await consoleApi.updateLead(lead.id, fields));
      setSaved(lead.id);
      setTimeout(() => setSaved((id) => (id === lead.id ? null : id)), 2000);
      toast('Request updated.');
    } catch (e) {
      toast(e.message, 'off');
    } finally {
      setSaving(null);
    }
  };

  const resend = async (lead) => {
    if (!window.confirm(`Send ${lead.email} a new temporary password?\n\nTheir current password and every signed-in session stop working.`)) return;
    setResending(lead.id);
    try {
      const result = await consoleApi.resendLeadCredentials(lead.id);
      replaceRow(result.lead);
      setCredentials(result);
    } catch (e) {
      toast(e.message, 'off');
    } finally {
      setResending(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Requests"
        subtitle="Access requests from the app and demo requests from the website. Approve an access request to create the boutique and email the owner their login."
      />

      <Async
        state={state}
        isEmpty={(rows) => (rows.results || rows).length === 0}
        empty={<Empty icon={<Mail size={20} />} title="No requests yet."
          detail="They arrive from the app's Request access screen and the website's demo form." />}
      >
        {(data) => {
          const leads = data.results || data;
          return (
            <div className="at-table-wrap">
              <table className="at-table at-table--fit">
                <thead>
                  <tr>
                    <th scope="col">Received</th><th scope="col">Who</th><th scope="col">Contact</th>
                    <th scope="col">What they said</th><th scope="col">Login</th>
                    <th scope="col">Status</th><th scope="col">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((lead) => (
                    <tr key={lead.id} id={`lead-${lead.id}`}>
                      <td data-label="Received" className="sa-nowrap">
                        <div>{day(lead.created_at)}</div>
                        <div style={{ marginTop: 4 }}>
                          <Pill tone={lead.source === 'app' ? 'info' : 'neutral'}
                            label={SOURCE_LABEL[lead.source] || lead.source} />
                        </div>
                        <div className="at-row-sub"
                          title={lead.welcome_emailed_at ? `Sent ${moment(lead.welcome_emailed_at)}` : undefined}>
                          {lead.welcome_emailed_at ? 'Welcome email sent' : 'Welcome email not sent'}
                        </div>
                      </td>
                      <td data-label="Who" style={{ minWidth: 150 }}>
                        <div className="at-row-title">{lead.name}</div>
                        <div className="at-row-sub">{lead.boutique}</div>
                      </td>
                      <td data-label="Contact" style={{ minWidth: 190 }}>
                        <div>{lead.email}</div>
                        <div className="at-row-sub">{lead.phone}</div>
                        {lead.address && <div className="at-row-sub">{lead.address}</div>}
                      </td>
                      <td data-label="What they said" className="sa-col-prose">
                        {lead.problem || <span className="sa-muted">—</span>}
                        {(lead.makes || lead.orders_per_month || lead.people) && (
                          <div className="at-row-sub">
                            {[lead.makes,
                              lead.orders_per_month && `${lead.orders_per_month}/mo`,
                              lead.people && `${lead.people} people`].filter(Boolean).join(' · ')}
                          </div>
                        )}
                      </td>
                      <td data-label="Login" className="sa-nowrap">
                        {lead.boutique_schema ? (
                          <>
                            <div className="sa-inline">
                              <button type="button" className="btn-secondary at-btn-sm"
                                onClick={() => go(`boutiques/${lead.boutique_schema}`)}>
                                Open boutique
                              </button>
                              <button type="button" className="btn-secondary at-btn-sm"
                                disabled={resending === lead.id} onClick={() => resend(lead)}>
                                <KeyRound size={13} /> {resending === lead.id ? 'Sending…' : 'Resend login'}
                              </button>
                            </div>
                            <div className="at-row-sub">
                              Approved {day(lead.approved_at)}{lead.approved_by ? ` by ${lead.approved_by}` : ''}
                              {lead.credentials_emailed_at ? ' · login emailed' : ' · login not emailed'}
                            </div>
                          </>
                        ) : (
                          <button type="button" className="btn-primary at-btn-sm" disabled={!plans.length}
                            title={plans.length ? undefined : 'Loading plans…'}
                            onClick={() => setApproving(lead)}>
                            <UserPlus size={13} /> Approve
                          </button>
                        )}
                      </td>
                      <td data-label="Status">
                        <div className="sa-inline">
                          <Select className="sa-compact" label="Status" value={lead.status}
                            disabled={saving === lead.id} options={STATUS_OPTIONS}
                            onChange={(status) => save(lead, { status })} />
                          {saved === lead.id && <Check size={14} className="sa-text-ok" />}
                        </div>
                      </td>
                      <td data-label="Notes" className="sa-col-note">
                        <textarea className="form-control sa-compact" aria-label="Notes"
                          defaultValue={lead.notes} maxLength={LIMITS.note}
                          disabled={saving === lead.id} placeholder="Add a note…"
                          // Saved on blur, not per keystroke: one PATCH when the
                          // administrator moves on, not one per character.
                          onBlur={(e) => {
                            if (e.target.value !== lead.notes) save(lead, { notes: e.target.value });
                          }} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }}
      </Async>

      {approving && (
        <ApproveDialog lead={approving} plans={plans}
          onCancel={() => setApproving(null)}
          onApproved={(result) => { replaceRow(result.lead); setApproving(null); setCredentials(result); }} />
      )}
      {credentials && <CredentialsDialog result={credentials} onDone={() => setCredentials(null)} />}
    </>
  );
}
