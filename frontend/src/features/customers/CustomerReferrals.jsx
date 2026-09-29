/* The Referrals card on a customer's page: who referred them, the customers
   they referred, and -- for the owner -- Add referral. The server decides
   whether the referred person is new or already a customer (by mobile); the
   customer list is only used for an early hint while typing. */
import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Plus, UserPlus, Users } from 'lucide-react';
import { api } from '../../services/api';
import { formatMobile } from '../../services/format';
import { LIMITS, cleanName, nameError } from '../../services/validate';
import { DEFAULT_COUNTRY, composeMobile, phoneNumberError } from '../../services/phone';
import CountryPhoneInput from '../../components/ui/CountryPhoneInput';
import { FormModal, SectionCard } from '../../components/ui/Atelier';

const fullNameOf = (c) => `${c?.first_name || ''} ${c?.last_name || ''}`.trim();

/** The mobile as the customer book stores it, for the typing hint only. */
const storedDigits = (iso, national) => {
  const composed = composeMobile(iso, national);
  if (!composed) return '';
  return iso === 'IN' ? `91${composed}` : composed.replace(/\D/g, '');
};

function AddReferralDialog({ referrer, customers, onClose, onSaved }) {
  const [fullName, setFullName] = useState('');
  const [country, setCountry] = useState(DEFAULT_COUNTRY);
  const [mobile, setMobile] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const phoneProblem = phoneNumberError(country, mobile);
  const known = useMemo(() => {
    if (phoneProblem) return null;
    const digits = storedDigits(country, mobile);
    return digits ? (customers || []).find((c) => String(c.mobile_number || '').replace(/\D/g, '') === digits) || null : null;
  }, [customers, country, mobile, phoneProblem]);
  const isSelf = known && String(known.id) === String(referrer.id);

  const submit = async (e) => {
    e.preventDefault();
    const problem = phoneProblem || (known ? '' : nameError(fullName, { label: 'Full name' }));
    if (problem) { setError(problem); return; }
    const [first, ...rest] = cleanName(fullName).trim().split(' ');
    const payload = { mobile_number: composeMobile(country, mobile), note: note.trim() };
    if (first) {
      payload.first_name = first;
      payload.last_name = rest.join(' ');
    }
    setBusy(true);
    setError(null);
    try {
      const answer = await api.addCustomerReferral(referrer.id, payload);
      setResult(answer);
      onSaved(answer);
    } catch (err) {
      setError(err.message || 'Could not record the referral.');
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    const name = fullNameOf(result.customer);
    return (
      <FormModal icon={CheckCircle2} tone="green" title="Referral recorded" onClose={onClose} width="480px"
                 footer={<button type="button" className="btn-primary" onClick={onClose}>Done</button>}>
        <p style={{ margin: 0, fontSize: 'var(--text-sm)', lineHeight: 1.6 }}>
          {result.created
            ? `${name} has been added as a customer, referred by ${fullNameOf(referrer)}.`
            : `${name} is already a customer. The referral has been recorded.`}
        </p>
        {!result.created && result.name_differs && (
          <p style={{ margin: '8px 0 0', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
            Their details were not changed; the name on file is {name}.
          </p>
        )}
      </FormModal>
    );
  }

  return (
    <FormModal icon={UserPlus} tone="green" title="Add referral" width="520px" onClose={busy ? undefined : onClose}
               subtitle={`Someone ${fullNameOf(referrer)} referred to the boutique.`}
               footer={(
                 <>
                   <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
                   <button type="submit" form="add-referral-form" className="btn-primary" disabled={busy}>
                     <UserPlus size={16} /> {busy ? 'Saving…' : 'Add referral'}
                   </button>
                 </>
               )}>
      <form id="add-referral-form" onSubmit={submit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label" htmlFor="rf-mobile">Mobile number <span className="required">*</span></label>
          <CountryPhoneInput id="rf-mobile" country={country} onCountryChange={setCountry}
                             value={mobile} onChange={setMobile} />
          {known && (
            <div role="status" style={{ marginTop: 8, fontSize: 'var(--text-sm)', color: isSelf ? 'var(--danger-color)' : 'var(--text-secondary)' }}>
              {isSelf
                ? `This is ${fullNameOf(referrer)}'s own number.`
                : <>Already a customer: <strong>{fullNameOf(known)}</strong>. Their details stay as they are.</>}
            </div>
          )}
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label" htmlFor="rf-name">
            Full name {known ? <span className="od-hint">(not needed, already a customer)</span> : <span className="required">*</span>}
          </label>
          <input id="rf-name" type="text" className="form-control" value={fullName} maxLength={LIMITS.name}
                 disabled={Boolean(known)} placeholder="e.g. Bina Das"
                 onChange={(e) => setFullName(cleanName(e.target.value))} />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label" htmlFor="rf-note">Note <span className="od-hint">(optional)</span></label>
          <textarea id="rf-note" className="form-control" rows={2} maxLength={LIMITS.note} value={note}
                    placeholder="e.g. Her sister-in-law" onChange={(e) => setNote(e.target.value)} />
        </div>
        {error && <p className="form-error" role="alert" style={{ margin: 0, color: 'var(--danger, #b42318)' }}>{error}</p>}
      </form>
    </FormModal>
  );
}

export default function CustomerReferrals({ customer, canAdd, customers, onOpenCustomer, onCustomerAdded }) {
  const [loaded, setLoaded] = useState({ id: null, rows: [], error: null });
  const [version, setVersion] = useState(0);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let alive = true;
    api.getCustomerReferrals(customer.id)
      .then((rows) => { if (alive) setLoaded({ id: customer.id, rows: Array.isArray(rows) ? rows : [], error: null }); })
      .catch((err) => { if (alive) setLoaded({ id: customer.id, rows: [], error: err.message || 'Could not load the referrals.' }); });
    return () => { alive = false; };
  }, [customer.id, version]);

  const loading = loaded.id !== customer.id;
  const rows = loading ? [] : loaded.rows;
  const referredBy = customer.referred_by;
  const open = (id) => (id && onOpenCustomer ? () => onOpenCustomer(id) : undefined);

  return (
    <SectionCard icon={Users} tone="violet" title="Referrals"
                 subtitle={loading ? undefined : `${rows.length} customer${rows.length === 1 ? '' : 's'} referred`}>
      {referredBy && (
        <p style={{ margin: '0 0 12px', fontSize: 'var(--text-sm)' }}>
          <span style={{ color: 'var(--text-muted)' }}>Referred by </span>
          {open(referredBy.id)
            ? <button type="button" className="at-link" onClick={open(referredBy.id)} style={{ fontWeight: 600 }}>{referredBy.name}</button>
            : <strong>{referredBy.name}</strong>}
        </p>
      )}

      {loading ? (
        <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>Loading referrals…</p>
      ) : loaded.error ? (
        <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--danger-color)' }}>{loaded.error}</p>
      ) : rows.length === 0 ? (
        <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>No referrals yet.</p>
      ) : (
        <div>
          {rows.map((row, i) => (
            <div key={row.id} className="at-row" style={{ paddingLeft: 0, paddingRight: 0 }}>
              <span style={{ width: 20, color: 'var(--text-muted)', fontSize: 'var(--text-sm)', flexShrink: 0 }}>{i + 1}.</span>
              <div className="at-row-main">
                <div className="at-row-title">
                  {open(row.referred)
                    ? <button type="button" className="at-link" onClick={open(row.referred)} style={{ fontWeight: 600, padding: 0 }}>{row.referred_name}</button>
                    : row.referred_name}
                </div>
                <div className="at-row-sub">{formatMobile(row.referred_mobile)}{row.note ? ` · ${row.note}` : ''}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {canAdd && (
        <div style={{ marginTop: 14 }}>
          <button type="button" className="btn-secondary at-btn-sm" onClick={() => setAdding(true)}>
            <Plus size={14} /> Add referral
          </button>
        </div>
      )}

      {adding && (
        <AddReferralDialog
          referrer={customer}
          customers={customers}
          onClose={() => setAdding(false)}
          onSaved={(answer) => {
            setVersion((v) => v + 1);
            if (answer?.created) onCustomerAdded?.();
          }}
        />
      )}
    </SectionCard>
  );
}
