import { useState } from 'react';
import { Plus } from 'lucide-react';
import { api } from '../../api';
import { useLanguage } from '../../i18n/LanguageContext.jsx';
import { LIMITS, phoneError, emailError, cleanUpper, isGstin } from '../../utils/validate';
import { Field, Modal } from './inventoryForm';
import { errorBox, panel } from './inventoryShared';

/** Suppliers: the list and adding one. The tab is hidden for now, not removed. */

export function SuppliersTab({ suppliers, isOwner, onAdd }) {
  const { t } = useLanguage();
  return (
    <>
      {isOwner && (
        <div style={{ marginTop: '20px' }}>
          <button type="button" className="btn-secondary" onClick={onAdd}>
            <Plus size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />{t('inventoryPage.newSupplier', 'New supplier')}
          </button>
        </div>
      )}
      {suppliers.length === 0 ? (
        <div style={{ ...panel, padding: '48px', textAlign: 'center', marginTop: '16px', color: 'var(--text-muted)' }}>
          {t('inventoryPage.noSuppliersYet', 'No suppliers yet.')}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '12px', marginTop: '16px' }}>
          {suppliers.map((s) => (
            <div key={s.id} style={{ ...panel, padding: '16px' }}>
              <div style={{ fontWeight: 600 }}>{s.name}</div>
              {s.contact_person && <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{s.contact_person}</div>}
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>
                {s.phone && <div>📞 {s.phone}</div>}
                {s.email && <div>✉️ {s.email}</div>}
                {s.gst_number && <div>GST {s.gst_number}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export function SupplierFormModal({ onClose, onSaved }) {
  const [form, setForm] = useState({ name: '', contact_person: '', phone: '', email: '', gst_number: '' });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    const problem = (!form.name.trim() ? 'Enter the supplier name.' : '')
      || phoneError(form.phone)
      || emailError(form.email)
      || (form.gst_number && !isGstin(form.gst_number) ? 'Enter a 15-character GSTIN like 29ABCDE1234F1Z5.' : '');
    if (problem) { setError(problem); return; }
    setError(null);
    setSaving(true);
    try {
      await api.createSupplier({ ...form, name: form.name.trim(), contact_person: form.contact_person.trim() });
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="New supplier" onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <Field label="Name" required value={form.name} onChange={(v) => set('name', v)} maxLength={150} />
        <Field label="Contact person" value={form.contact_person} onChange={(v) => set('contact_person', v)} maxLength={150} />
        <div className="mobile-stack-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
          {/* A supplier's phone is often a landline or an office board, so no mobile rule. */}
          <Field label="Phone" type="tel" inputMode="tel" placeholder="044-2345 6789" value={form.phone} onChange={(v) => set('phone', v)} maxLength={30} />
          <Field label="Email" type="email" value={form.email} onChange={(v) => set('email', v)} maxLength={LIMITS.email} />
        </div>
        <Field label="GST number" placeholder="29ABCDE1234F1Z5" value={form.gst_number} onChange={(v) => set('gst_number', cleanUpper(v).slice(0, 15))} />
        {error && <div style={errorBox}>{error}</div>}
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save supplier'}</button>
        </div>
      </form>
    </Modal>
  );
}
