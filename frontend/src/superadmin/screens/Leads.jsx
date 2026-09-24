/**
 * Access requests: the website's demo form and the app's Request access.
 *
 * Nobody creates their own boutique. A request lands here (the requester has
 * already been emailed a welcome), and Approve creates the boutique with a
 * temporary owner password, emails it, and shows it once so it can also be
 * shared by hand. The owner must replace it at first sign-in.
 *
 * Status and notes are the only writable fields on a request, matching the
 * server: everything else was typed by the requester and is the evidence of
 * what they actually sent (LeadSerializer.read_only_fields). The approval form
 * starts from their answers but is the administrator's own, so a typo in the
 * request can be corrected before it becomes the owner's sign-in email.
 */

import { useCallback, useRef, useState } from 'react';
import { AlertTriangle, Check, Copy, Lock, Mail, UserPlus } from 'lucide-react';

import { consoleApi } from '../api';
import { go } from '../router';
import { LIMITS } from '../../services/validate';
import { Async, Empty, Pill, SectionHead, day, moment, useApi, useToast } from '../ui';

const STATUSES = ['NEW', 'CONTACTED', 'QUALIFIED', 'CONVERTED', 'DECLINED'];

const SOURCE_LABEL = { app: 'App', website: 'Website' };

function splitName(full) {
  const parts = (full || '').trim().split(/\s+/);
  return { first_name: parts[0] || '', last_name: parts.slice(1).join(' ') };
}

function draftFor(lead) {
  return {
    ...splitName(lead.name),
    email: lead.email || '',
    business_name: lead.boutique || '',
    phone: lead.phone || '',
    address: lead.address || '',
    plan: '',
    reason: '',
  };
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
    <div className="sa-field" style={{ marginBottom: 10 }}>
      <label>{label}</label>
      <div className="sa-onetime-row">
        <input ref={field} className="sa-input" readOnly value={value}
          onFocus={(e) => e.target.select()} aria-label={label} />
        <button className="sa-btn primary-inline" type="button" onClick={copy}>
          {copied ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy</>}
        </button>
      </div>
    </div>
  );
}

function ApproveDialog({ lead, plans, onCancel, onApproved }) {
  const toast = useToast();
  const [form, setForm] = useState(() => draftFor(lead));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const ready = form.first_name.trim() && form.last_name.trim() && form.email.trim()
    && form.business_name.trim() && form.plan;

  const submit = async (e) => {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await consoleApi.approveLead(lead.id, {
        ...form,
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim(),
        business_name: form.business_name.trim(),
        address: form.address.trim(),
        reason: form.reason.trim(),
      });
      onApproved(result);
    } catch (err) {
      setError(err.message);
      toast(err.message, 'off');
    } finally {
      setBusy(false);
    }
  };

  const field = (key, label, props = {}) => (
    <div className="sa-field" style={{ marginBottom: 12 }}>
      <label htmlFor={`approve-${key}`}>{label}</label>
      <input id={`approve-${key}`} className="sa-input" value={form[key]} onChange={set(key)}
        disabled={busy} {...props} />
    </div>
  );

  return (
    <div className="sa-modal-backdrop" onClick={busy ? undefined : onCancel}>
      <form className="sa-modal" role="dialog" aria-modal="true" aria-label="Approve request"
        onClick={(e) => e.stopPropagation()} onSubmit={submit} style={{ maxWidth: 560 }}>
        <h3>Create a boutique for {lead.boutique}</h3>
        <div className="sa-modal-body">
          <p style={{ marginBottom: 14 }}>
            This creates the boutique and its owner account with a temporary password.
            The owner is emailed their sign-in details and must choose their own password
            at first sign-in. Customer messaging starts <strong>off</strong>.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0 12px' }}>
            {field('first_name', 'Owner first name', { maxLength: 150, required: true, autoFocus: true })}
            {field('last_name', 'Owner last name', { maxLength: 150, required: true })}
          </div>
          {field('email', 'Owner email (their sign-in)', { type: 'email', maxLength: LIMITS.email, required: true })}
          {field('business_name', 'Boutique name (printed on invoices)', { maxLength: 100, required: true })}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0 12px' }}>
            {field('phone', 'Mobile', { inputMode: 'numeric', maxLength: 16 })}
            <div className="sa-field" style={{ marginBottom: 12 }}>
              <label htmlFor="approve-plan">Plan</label>
              <select id="approve-plan" className="sa-select" style={{ width: '100%' }}
                value={form.plan} onChange={set('plan')} disabled={busy} required>
                <option value="" disabled>Choose a plan…</option>
                {plans.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </div>
          </div>
          {field('address', 'Boutique address', { maxLength: LIMITS.address })}
          {field('reason', 'Note for the audit log (optional)', { maxLength: LIMITS.reason,
            placeholder: 'e.g. Contract signed 24 Sep' })}
          {error && <div className="sa-note error" role="alert">{error}</div>}
        </div>
        <div className="sa-modal-actions">
          <button type="button" className="sa-btn" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="submit" className="sa-btn primary-inline" disabled={!ready || busy}>
            <UserPlus size={13} /> {busy ? 'Creating boutique…' : 'Create boutique'}
          </button>
        </div>
      </form>
    </div>
  );
}

function CredentialsDialog({ result, onDone }) {
  const { login, boutique, emailed } = result;
  return (
    <div className="sa-modal-backdrop">
      <div className="sa-modal" role="dialog" aria-modal="true" aria-label="Sign-in details"
        style={{ maxWidth: 560 }}>
        <h3>{boutique.name} is ready</h3>
        <div className="sa-modal-body">
          {emailed ? (
            <p style={{ marginBottom: 12 }}>
              Sign-in details have been emailed to <strong>{login.email}</strong>. If they
              don't receive it, share these details with them directly.
            </p>
          ) : (
            <div className="sa-note error" style={{ marginBottom: 12 }}>
              The email could not be sent. Share these details with the owner yourself
              before closing this window.
            </div>
          )}
          <CopyRow label="Sign-in page" value={login.login_url} />
          <CopyRow label="Email" value={login.email} />
          <CopyRow label="Temporary password" value={login.temporary_password} />
          <p className="sa-onetime-note">
            <AlertTriangle size={13} />
            <span>
              Anyone with this password can sign in as the owner until they change it. Send it
              only to the owner, over a channel you trust.
            </span>
          </p>
          <p className="sa-onetime-note sa-muted">
            <Lock size={13} />
            <span>
              Shown once. It is not stored by this console or written to the audit log. If it
              is lost, use <em>Staff accounts → Sign-in link</em> for this owner.
            </span>
          </p>
        </div>
        <div className="sa-modal-actions">
          <button className="sa-btn" onClick={() => { onDone(); go(`boutiques/${boutique.schema_name}`); }}>
            Open boutique
          </button>
          <button className="sa-btn primary-inline" onClick={onDone}>Done</button>
        </div>
      </div>
    </div>
  );
}

export default function Leads() {
  const toast = useToast();
  const [saving, setSaving] = useState(null);
  const [saved, setSaved] = useState(null);
  const [approving, setApproving] = useState(null);
  const [approved, setApproved] = useState(null);

  const state = useApi(useCallback(() => consoleApi.leads(), []));
  const plansState = useApi(useCallback(() => consoleApi.modules(), []));
  const plans = plansState.data?.plans || [];

  const save = async (lead, fields) => {
    setSaving(lead.id);
    try {
      const updated = await consoleApi.updateLead(lead.id, fields);
      // Patch in place rather than refetching: the administrator is working
      // down a list and a reload would jump them back to the top of it.
      state.data.splice(state.data.indexOf(lead), 1, updated);
      setSaved(lead.id);
      setTimeout(() => setSaved((id) => (id === lead.id ? null : id)), 2000);
      toast('Request updated.');
    } catch (e) {
      toast(e.message, 'off');
    } finally {
      setSaving(null);
    }
  };

  const onApproved = (result) => {
    const rows = state.data.results || state.data;
    const index = rows.findIndex((row) => row.id === result.lead.id);
    if (index !== -1) rows.splice(index, 1, result.lead);
    setApproving(null);
    setApproved(result);
  };

  return (
    <>
      <SectionHead
        title="Access requests"
        subtitle="Requests from the website and the app. Approve one to create the boutique and email the owner their sign-in details."
      />

      <Async
        state={state}
        isEmpty={(rows) => (rows.results || rows).length === 0}
        empty={<Empty icon={<Mail size={22} />} title="No access requests yet."
          detail="Requests arrive from the website's demo form and the app's Request access screen." />}
      >
        {(data) => {
          const leads = data.results || data;
          return (
            <div className="sa-table-wrap">
              <table className="sa-table">
                <thead>
                  <tr>
                    <th>Received</th><th>Who</th><th>Contact</th>
                    <th>What they said</th><th>Boutique</th><th>Status</th><th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((lead) => (
                    <tr key={lead.id}>
                      <td className="sa-schema" style={{ whiteSpace: 'nowrap' }}>
                        <div>{day(lead.created_at)}</div>
                        <div style={{ marginTop: 4 }}>
                          <Pill value="info" label={SOURCE_LABEL[lead.source] || lead.source} />
                        </div>
                        <div className="sa-muted" style={{ fontSize: 12, marginTop: 4 }}
                          title={lead.welcome_emailed_at ? `Welcome email sent ${moment(lead.welcome_emailed_at)}` : undefined}>
                          {lead.welcome_emailed_at ? 'Welcomed by email' : 'Welcome email not sent'}
                        </div>
                      </td>
                      <td>
                        <div className="sa-name">{lead.name}</div>
                        <div className="sa-schema">{lead.boutique}</div>
                      </td>
                      <td>
                        <div>{lead.email}</div>
                        <div className="sa-muted" style={{ fontSize: 13 }}>{lead.phone}</div>
                        {lead.address && (
                          <div className="sa-muted" style={{ fontSize: 12.5, marginTop: 4, maxWidth: 220 }}>{lead.address}</div>
                        )}
                      </td>
                      <td style={{ maxWidth: 320, fontSize: 13.5 }}>
                        {lead.problem || <span className="sa-muted">—</span>}
                        {(lead.makes || lead.orders_per_month || lead.people) && (
                          <div className="sa-muted" style={{ fontSize: 12.5, marginTop: 4 }}>
                            {[lead.makes,
                              lead.orders_per_month && `${lead.orders_per_month}/mo`,
                              lead.people && `${lead.people} people`].filter(Boolean).join(' · ')}
                          </div>
                        )}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {lead.boutique_schema ? (
                          <>
                            <button className="sa-btn" onClick={() => go(`boutiques/${lead.boutique_schema}`)}>
                              Open boutique
                            </button>
                            <div className="sa-muted" style={{ fontSize: 12, marginTop: 4 }}>
                              Approved {day(lead.approved_at)}{lead.approved_by ? ` by ${lead.approved_by}` : ''}
                            </div>
                          </>
                        ) : (
                          <button className="sa-btn primary-inline" disabled={!plans.length}
                            title={plans.length ? undefined : 'Loading plans…'}
                            onClick={() => setApproving(lead)}>
                            <UserPlus size={13} /> Approve
                          </button>
                        )}
                      </td>
                      <td>
                        <select className="sa-select" value={lead.status} disabled={saving === lead.id}
                          onChange={(e) => save(lead, { status: e.target.value })}>
                          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <div style={{ marginTop: 6 }}>
                          <Pill value={lead.status.toLowerCase()} label={lead.status} />
                          {saved === lead.id && (
                            <Check size={14} color="var(--success-color)"
                              style={{ verticalAlign: '-3px', marginLeft: 6 }} />
                          )}
                        </div>
                      </td>
                      <td style={{ minWidth: 220 }}>
                        <textarea className="sa-textarea" defaultValue={lead.notes} maxLength={LIMITS.note}
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
          onCancel={() => setApproving(null)} onApproved={onApproved} />
      )}
      {approved && <CredentialsDialog result={approved} onDone={() => setApproved(null)} />}
    </>
  );
}
