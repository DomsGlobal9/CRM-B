import { Check, CheckCircle2, FileText, MessageSquare, Scissors } from 'lucide-react';
import { formatDate as fmtDate, formatMoney, orderRef } from '../../services/format';
import { waLink } from '../../services/phone';
import { orderBucket } from './stages';
import { useLanguage } from '../../i18n/LanguageContext.jsx';
import { useApp } from '../../context/AppContext';

/**
 * Shown once an order is placed: its number, what was ordered and paid, and
 * what to do next (the invoice, sending it, another order, the dashboard).
 */
export default function OrderConfirmedScreen({ confirmedOrder, customerForm, openSendToWorkshop, sendBusy, setShowInvoiceModal, setView }) {
  const { t } = useLanguage();
  const { refresh: fetchDashboardAndConfig } = useApp();
  const confirmedCustomerName = (
    confirmedOrder.customer_name
    || `${customerForm.first_name || ''} ${customerForm.last_name || ''}`.trim()
    || 'the customer');
  return (
  <div className="order-confirmed-container">
    <div className="success-badge-container">
      <div className="success-circle"><Check size={40} /></div>
      {/* The owner or a master places this order at the counter, with
          the customer standing in front of them or not there at all.
          Addressed to "you", the screen thanked the boutique for its own
          order and named the customer as the reader. It names the
          customer as the customer instead. */}
      <h1 className="success-title">
        {t('confirmed.title', 'Order created for {name} 🎉', { name: confirmedCustomerName })}
      </h1>
      <p style={{ color: 'var(--text-secondary)', fontSize: '15px' }}>
        {t('confirmed.subtitle',
           'It is with the workroom now, and sits on {name}\'s profile with everything recorded here.',
           { name: confirmedCustomerName })}
      </p>
      <div className="order-id-badge">
        <span>Order ID: <strong>{orderRef(confirmedOrder)}</strong></span>
      </div>
    </div>

    <div className="order-meta-info-grid">
      <div className="meta-info-block">
        <span className="meta-info-label">Order Date</span>
        <span className="meta-info-val">
          {fmtDate(confirmedOrder.order_date)}
        </span>
      </div>
      <div className="meta-info-block">
        <span className="meta-info-label">Payment Status</span>
        {/* Was the literal `Paid • ₹{total_amount}` in success green,
            referencing neither payment_status nor amount_paid -- so the
            screen staff turn to face the customer announced the order
            settled in full the moment it was placed, and contradicted the
            invoice one click later. total_amount also arrives as a string
            (COERCE_DECIMAL_TO_STRING is unset), and String.toLocaleString
            does no grouping, so it printed ₹51502.50 rather than
            ₹51,502.50. parseFloat fixes the second half. */}
        <span className="meta-info-val" style={{ color: confirmedOrder.payment_status === 'Paid' ? 'var(--success-color)' : 'var(--text-primary)' }}>
          {confirmedOrder.payment_status} • {formatMoney(confirmedOrder.amount_paid)}
          {confirmedOrder.payment_status !== 'Paid' && (
            <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>
              {' '}of {formatMoney(confirmedOrder.total_amount)}
            </span>
          )}
        </span>
      </div>
      <div className="meta-info-block">
        <span className="meta-info-label">Estimated Delivery</span>
        <span className="meta-info-val">
          {fmtDate(confirmedOrder.estimated_delivery)}
        </span>
      </div>
    </div>

    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <h3 style={{ fontSize: '16px', fontWeight: 600 }}>What happens next?</h3>
      <div className="timeline-tracker">
        <div className="timeline-line"></div>
        {[
          { label: 'Stylist Review', desc: 'A stylist is reviewing the order details.', active: true, completed: true },
          { label: 'Design & Creation', desc: 'Artisans will cut and assemble the garment.', active: false, completed: false },
          { label: 'Quality Check', desc: 'Multi-level measurement and stitching validation.', active: false, completed: false },
          { label: 'Packed & Shipped', desc: 'Packed securely and handed over to the customer.', active: false, completed: false }
        ].map((node, i) => (
          <div key={i} className={`timeline-node ${node.completed ? 'completed' : ''} ${node.active ? 'active' : ''}`}>
            <div className="timeline-node-circle">
              {node.completed ? <Check size={14} /> : (i + 1)}
            </div>
            <span className="timeline-node-label">{node.label}</span>
            <span className="timeline-node-desc">{node.desc}</span>
          </div>
        ))}
      </div>
    </div>

    <div className="whatsapp-action-card">
      <div className="whatsapp-info">
        <span className="whatsapp-title">Crafting something just for you ✨</span>
        <span className="whatsapp-desc">Need changes or have questions? Chat directly with us on WhatsApp.</span>
      </div>
      <button className="whatsapp-btn" onClick={() => window.open(waLink(customerForm.mobile_number))}>
        <MessageSquare size={18} />
        Chat on WhatsApp
      </button>
    </div>

    {/* `flex: 1` alone does not shrink a button below its own text, so at
        390px these two ran off both edges of the screen -- the last two
        controls of the whole order flow, on a screen that then scrolled
        sideways. Wrapping, with a width floor, stacks them instead. */}
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', justifyContent: 'center', width: '100%', maxWidth: '450px' }}>
      {orderBucket(confirmedOrder) === 'workshop' ? (
        <div className="at-sent-note" role="status" style={{ flex: '1 1 100%' }}>
          <CheckCircle2 size={18} /> {t('ordersPage.inTheWorkshop', 'In the workshop')}
          {confirmedOrder.tailor_name ? ` · ${confirmedOrder.tailor_name}` : ''}
        </div>
      ) : (
        <button className="btn-primary" style={{ flex: '1 1 100%', justifyContent: 'center', minHeight: '48px' }} disabled={sendBusy}
                onClick={() => openSendToWorkshop(confirmedOrder)}>
          <Scissors size={18} /> {t('ordersPage.sendToWorkshop', 'Send to workshop')}
        </button>
      )}
      <button className="btn-secondary" style={{ flex: '1 1 180px', justifyContent: 'center' }} onClick={() => setShowInvoiceModal(true)}>
        <FileText size={18} /> View & Print Invoice
      </button>
      <button className="btn-secondary" style={{ flex: '1 1 180px', justifyContent: 'center' }} onClick={() => { setView('dashboard'); fetchDashboardAndConfig(); }}>
        Back to Dashboard
      </button>
    </div>
  </div>
  );
}
