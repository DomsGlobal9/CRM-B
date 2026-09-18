import { useEffect, useState } from 'react';
import { AlertTriangle, Camera, Shirt, User, X } from 'lucide-react';
import { api } from '../../services/api';
import { Dropzone } from '../../components/ui/Atelier';
import { parseAdjustments } from './adjustments';
import VoiceTextarea from '../../components/ui/VoiceTextarea';
import {
  LIMITS, tenDigits, mobileError, cleanName, nameError, cleanAmount, amountError,
} from '../../services/validate';

/**
 * Taking in a garment that was stitched somewhere else.
 *
 * The request form on an order cannot do this: it hangs off one of our
 * delivered orders and one of its garment jobs, and an outside garment has
 * neither. So this form asks for what stands in for them -- the customer
 * (an existing one, or a walk-in created on save), which garment it is, a
 * line about the piece, and a photograph of it as it arrived, the record of
 * what was already wrong before we touched it. Always a paid, customer-
 * requested job: "our fault" has no meaning for something we did not make.
 * After that it is an alteration like any other.
 */

const customerName = (c) => `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.mobile_number || 'Customer';
const NEW = '__new__';

export default function OutsideGarmentIntake({ onClose, onCreated }) {
  const [customers, setCustomers] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [form, setForm] = useState({
    customer_id: '', new_first_name: '', new_last_name: '', new_mobile: '',
    garment_template_id: '', garment_note: '', issue_description: '', issue_scale: '',
    adjustments: '', charge_amount: '', notes: '',
  });
  const [photo, setPhoto] = useState(null);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.getCustomers().then((d) => setCustomers(d.results || d || [])).catch(() => setCustomers([]));
    api.getGarmentTemplates().then((d) => setTemplates(d.results || d || [])).catch(() => setTemplates([]));
  }, []);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const set = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));
  const isNew = form.customer_id === NEW;

  const submit = async () => {
    if (!form.customer_id) { setError('Choose the customer, or add them as new.'); return; }
    if (isNew) {
      const problem = nameError(form.new_first_name, { label: 'First name' })
        || nameError(form.new_last_name, { label: 'Last name', required: false, min: 1 })
        || mobileError(form.new_mobile);
      if (problem) { setError(problem); return; }
    }
    if (!form.garment_template_id && !form.garment_note.trim()) {
      setError('Say what the garment is: pick a garment type or describe it.'); return;
    }
    const chargeProblem = amountError(form.charge_amount, { label: 'Charge' });
    if (chargeProblem) { setError(chargeProblem); return; }
    setBusy(true);
    setError(null);
    try {
      let customerId = form.customer_id;
      if (isNew) {
        const row = await api.createCustomer({
          first_name: form.new_first_name.trim(), last_name: form.new_last_name.trim(),
          mobile_number: tenDigits(form.new_mobile), source: 'Walk In',
        });
        customerId = row.id;
      }
      const created = await api.createOutsideAlteration({
        customer_id: customerId,
        garment_template_id: form.garment_template_id,
        garment_note: form.garment_note.trim(),
        issue_description: form.issue_description,
        issue_scale: form.issue_scale,
        requested_adjustments: parseAdjustments(form.adjustments),
        charge_amount: form.charge_amount || '0.00',
        notes: form.notes,
      }, photo);
      onCreated(created);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const field = { width: '100%', marginBottom: '10px' };
  const label = { fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' };

  return (
    <div onClick={onClose}
         style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex',
                  alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div onClick={(e) => e.stopPropagation()}
           style={{ background: 'var(--surface-color, #17181a)', border: '1px solid var(--border-color)', borderRadius: '12px',
                    width: '100%', maxWidth: '760px', maxHeight: '92vh', overflowY: 'auto', padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>Take in a garment from outside</h3>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={18} /></button>
        </div>
        <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginTop: 0, marginBottom: '16px', lineHeight: 1.5 }}>
          A garment stitched elsewhere, brought in for work. It is always a paid job, and from here it goes through the same alteration flow as our own.
        </p>

        {error && (
          <div style={{ display: 'flex', gap: '8px', padding: '10px 12px', borderRadius: '8px', background: 'rgba(239,68,68,0.08)',
                        border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', fontSize: '13px', marginBottom: '12px', whiteSpace: 'pre-line' }}>
            <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: '1px' }} />
            <span>{error}</span>
          </div>
        )}

        <div className="form-grid-2" style={{ gap: '12px' }}>
          <div style={field}>
            <label style={label}><User size={12} style={{ verticalAlign: '-2px' }} /> Customer</label>
            <select className="form-control" value={form.customer_id} onChange={set('customer_id')}>
              <option value="">Choose a customer…</option>
              <option value={NEW}>+ New customer (walk-in)</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{customerName(c)}{c.mobile_number ? ` · ${c.mobile_number}` : ''}</option>)}
            </select>
          </div>
          <div style={field}>
            <label style={label}><Shirt size={12} style={{ verticalAlign: '-2px' }} /> Which garment is it?</label>
            <select className="form-control" value={form.garment_template_id} onChange={set('garment_template_id')}>
              <option value="">Not in our list — describe it below</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        </div>

        {isNew && (
          <div className="form-grid-2" style={{ gap: '12px' }}>
            <div style={field}>
              <label style={label}>New customer — name</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input className="form-control" placeholder="First name" maxLength={LIMITS.name} value={form.new_first_name}
                       onChange={(e) => setForm((prev) => ({ ...prev, new_first_name: cleanName(e.target.value) }))} />
                <input className="form-control" placeholder="Last name" maxLength={LIMITS.name} value={form.new_last_name}
                       onChange={(e) => setForm((prev) => ({ ...prev, new_last_name: cleanName(e.target.value) }))} />
              </div>
            </div>
            <div style={field}>
              <label style={label}>New customer — mobile</label>
              {/* No maxLength: it would cut a pasted "+91 98765 43210" before tenDigits could strip the code. */}
              <input className="form-control" type="tel" inputMode="numeric" placeholder="10-digit mobile" value={form.new_mobile}
                     onChange={(e) => setForm((prev) => ({ ...prev, new_mobile: tenDigits(e.target.value) }))} />
            </div>
          </div>
        )}

        <div style={field}>
          <label style={label}>About the garment — colour, fabric, where it was bought</label>
          <input className="form-control" maxLength={200} placeholder="e.g. Green silk blouse, bought in Chennai"
                 value={form.garment_note} onChange={set('garment_note')} />
        </div>

        <div style={field}>
          <label style={label}><Camera size={12} style={{ verticalAlign: '-2px' }} /> Photo as received (optional, but worth taking — it records what was already wrong)</label>
          {photo ? (
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <img src={preview} alt="As received" style={{ width: '84px', height: '104px', objectFit: 'cover', borderRadius: '8px', border: '1px solid var(--border-color)' }} />
              <div style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>
                <div style={{ color: 'var(--text-primary)', fontWeight: 600, wordBreak: 'break-all' }}>{photo.name}</div>
                <button type="button" className="btn-secondary at-btn-sm" style={{ marginTop: '6px' }}
                        onClick={() => { setPhoto(null); setPreview(''); }}>
                  <X size={12} /> Remove
                </button>
              </div>
            </div>
          ) : (
            <Dropzone compact camera onFiles={([f]) => { if (!f) return; if (!f.type?.startsWith('image/')) { setError('Please choose an image file.'); return; } setError(null); setPhoto(f); setPreview(URL.createObjectURL(f)); }}
                      title="Drop a photo here" subtitle="or use the camera" chooseLabel="Choose photo" cameraLabel="Take photo" />
          )}
        </div>

        <div style={field}>
          <label style={label}>How big is the issue?</label>
          <select className="form-control" value={form.issue_scale} onChange={set('issue_scale')}>
            <option value="">Not decided yet</option>
            <option value="SMALL">Small — a quick fix, less time</option>
            <option value="BIG">Big — more work, more time</option>
          </select>
        </div>

        <div className="form-grid-2" style={{ gap: '12px' }}>
          <div style={field}>
            <label style={label}>What does the customer want done?</label>
            <VoiceTextarea className="form-control" rows={2} maxLength={LIMITS.note} placeholder="The sleeves are too tight…" value={form.issue_description} onChange={set('issue_description')} />
          </div>
          <div style={field}>
            <label style={label}>Adjustments asked for — one per line, e.g. “sleeve: let out 1 inch”</label>
            <VoiceTextarea className="form-control" rows={2} maxLength={LIMITS.note} value={form.adjustments} onChange={set('adjustments')} />
          </div>
        </div>

        <div className="form-grid-2" style={{ gap: '12px' }}>
          <div style={field}>
            <label style={label}>Charge (optional now — it can be set after inspection)</label>
            <input className="form-control" inputMode="decimal" value={form.charge_amount}
                   onChange={(e) => setForm((prev) => ({ ...prev, charge_amount: cleanAmount(e.target.value) }))} />
          </div>
          <div style={field}>
            <label style={label}>Notes (optional)</label>
            <input className="form-control" maxLength={LIMITS.note} value={form.notes} onChange={set('notes')} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '6px' }}>
          <button type="button" className="btn-secondary" onClick={onClose}>Close</button>
          <button type="button" className="btn-primary" disabled={busy} onClick={submit}>
            {busy ? 'Taking in…' : 'Take it in'}
          </button>
        </div>
      </div>
    </div>
  );
}
