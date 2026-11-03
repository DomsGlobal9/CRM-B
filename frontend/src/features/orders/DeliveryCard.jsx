import { useState } from 'react';
import { Edit2 } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext.jsx';
import { api } from '../../services/api';
import { LIMITS } from '../../services/validate';

/**
 * How the order leaves the boutique: pickup, or a courier with its details.
 * Intake no longer asks; the counter decides here, when it is decided, through
 * the same PATCH the rest of the order page uses.
 */
export function DeliveryCard({ order, canEdit, onSaved }) {
  const { t } = useLanguage();
  const [editing, setEditing] = useState(false);
  const fromOrder = () => ({
    delivery_method: order.delivery_method || 'Direct Pickup',
    courier_service: order.courier_service || '',
    tracking_number: order.tracking_number || '',
    delivery_address: order.delivery_address || '',
  });
  const [form, setForm] = useState(fromOrder);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const courier = form.delivery_method === 'Courier';
  const save = async () => {
    setBusy(true); setError(null);
    try {
      const saved = await api.updateOrder(order.id, courier ? form : { ...form, courier_service: '', tracking_number: '' });
      setEditing(false);
      if (onSaved) onSaved(saved);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="od-delivery">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-primary)' }}>
          {t('ordersPage.deliveryMethodLabel', 'Delivery Method:')} {order.delivery_method_display || t(`deliveryMethod.${order.delivery_method}`, order.delivery_method)}
        </span>
        {canEdit && !editing && (
          <button type="button" className="btn-secondary at-btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setEditing(true)}>
            <Edit2 size={12} /> {t('common.edit', 'Edit')}
          </button>
        )}
      </div>
      {!editing && order.delivery_method === 'Courier' && (
        <div className="mobile-stack-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginTop: 8 }}>
          <div><strong>Courier:</strong> {order.courier_service || 'TBD'}</div>
          <div><strong>Tracking:</strong> {order.tracking_number || 'TBD'}</div>
          <div style={{ gridColumn: 'span 2' }}><strong>Address:</strong> {order.delivery_address || 'No address specified'}</div>
        </div>
      )}
      {editing && (
        <div className="od-delivery-form">
          <div className="at-seg" role="group" aria-label={t('ordersPage.deliveryMethodLabel', 'Delivery Method:')}>
            {['Direct Pickup', 'Courier'].map((method) => (
              <button key={method} type="button" aria-pressed={form.delivery_method === method}
                      onClick={() => setForm({ ...form, delivery_method: method })}>
                {t(`deliveryMethod.${method}`, method)}
              </button>
            ))}
          </div>
          {courier && (
            <div className="form-grid-2" style={{ marginTop: 10 }}>
              <input className="form-control" placeholder="Courier (e.g. DTDC, Blue Dart)" value={form.courier_service} maxLength={LIMITS.reference}
                     onChange={(e) => setForm({ ...form, courier_service: e.target.value })} />
              <input className="form-control" placeholder="Tracking number" value={form.tracking_number} maxLength={LIMITS.reference}
                     onChange={(e) => setForm({ ...form, tracking_number: e.target.value })} />
              <textarea className="form-control" rows={2} placeholder="Delivery address" style={{ gridColumn: 'span 2' }} maxLength={LIMITS.address}
                        value={form.delivery_address} onChange={(e) => setForm({ ...form, delivery_address: e.target.value })} />
            </div>
          )}
          {error && <div className="od-error">{error}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button type="button" className="btn-primary at-btn-sm" disabled={busy} onClick={save}>{busy ? 'Saving\u2026' : t('common.save', 'Save')}</button>
            <button type="button" className="btn-secondary at-btn-sm" disabled={busy} onClick={() => { setEditing(false); setForm(fromOrder()); }}>{t('common.cancel', 'Cancel')}</button>
          </div>
        </div>
      )}
    </div>
  );
}
