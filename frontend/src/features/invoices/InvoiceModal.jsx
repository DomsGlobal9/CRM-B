import { Printer, RefreshCw, Send, X } from 'lucide-react';
import { InvoiceRenderer, normalizeInvoiceData } from './InvoiceTemplates';
import { useApp } from '../../context/AppContext';
import './invoicePhone.css';

/**
 * The printable invoice for one order, opened from Invoices or after an order
 * is placed: print it, or send it to the customer on WhatsApp.
 */
export default function InvoiceModal({ confirmedOrder, invoiceSend, sendInvoiceToWhatsApp, setShowInvoiceModal }) {
  const { boutiqueSettings, currentUser } = useApp();
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1000,
      padding: '20px'
    }}>
      <div className="invoice-modal-content" style={{
        backgroundColor: 'var(--surface-color)',
        borderRadius: '12px',
        width: '100%',
        maxWidth: '700px',
        maxHeight: '90vh',
        overflowY: 'auto',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Modal Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 24px',
          borderBottom: '1px solid var(--border-color)'
        }} className="no-print">
          <h3 style={{ fontSize: '16px', fontWeight: 700 }}>Customer Invoice</h3>
          <button 
            aria-label="Close invoice"
            onClick={() => setShowInvoiceModal(false)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Invoice Printable Area */}
        <div id="invoice-printable" style={{ padding: '40px', color: '#1a1f36', fontSize: '13px', lineHeight: 1.5 }}>
          {/* Styling for printing */}
          <style>{`
            @media print {
              body * {
                visibility: hidden;
              }
              #invoice-printable, #invoice-printable * {
                visibility: visible;
              }
              #invoice-printable {
                position: absolute;
                left: 0;
                top: 0;
                width: 100%;
                padding: 0;
              }
              .no-print {
                display: none !important;
              }
              /* Only the invoice and the boxes holding it are laid out:
                 the page behind would otherwise print as blank pages,
                 and the dialog's 90vh scroll box would cut the bill. */
              body *:not(:has(#invoice-printable)):not(#invoice-printable):not(#invoice-printable *) {
                display: none !important;
              }
              div:has(> .invoice-modal-content), .invoice-modal-content {
                position: static !important;
                max-height: none !important;
                overflow: visible !important;
                padding: 0 !important;
                background: none !important;
                box-shadow: none !important;
              }
            }
          `}</style>

          {confirmedOrder.price_pending ? (
            <div className="od-hint" style={{ textAlign: 'center', padding: '24px 0' }}>
              The price of this order is not decided yet. Add the prices on the order (Prices) and the invoice is made from them.
            </div>
          ) : (
          <InvoiceRenderer
            template={confirmedOrder.invoice_template || boutiqueSettings?.invoice_template || 'classic'}
            data={normalizeInvoiceData(confirmedOrder, boutiqueSettings, currentUser)}
          />
          )}
        </div>

        {/* Modal Footer Controls */}
        <div style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '12px',
          padding: '16px 24px',
          borderTop: '1px solid var(--border-color)',
          backgroundColor: '#fafbfc',
          borderBottomLeftRadius: '12px',
          borderBottomRightRadius: '12px'
        }} className="no-print invoice-modal-foot">
          {/* How the last Send on WhatsApp for this bill went. A send that
              did not go through shows no note: the button turns into
              Retry again instead. */}
          {invoiceSend?.orderId === confirmedOrder.id && !['retrying', 'failed', 'error'].includes(invoiceSend.state) && (
            <div className={`invoice-send-note invoice-send-note--${invoiceSend.state}`} role="status" aria-live="polite">
              {invoiceSend.state === 'sending' && 'Sending the invoice on WhatsApp…'}
              {invoiceSend.state === 'sent' && `Invoice sent to ${confirmedOrder.customer_name || 'the customer'} on WhatsApp.`}
              {invoiceSend.state === 'retrying' && `Not sent yet${invoiceSend.error ? ` (${invoiceSend.error.replace(/^WhatsApp sending failed:\s*/, '')})` : ''}. It will be tried again automatically.`}
              {invoiceSend.state === 'failed' && `Could not send${invoiceSend.error ? `: ${invoiceSend.error.replace(/^WhatsApp sending failed:\s*/, '')}` : '.'}`}
              {invoiceSend.state === 'pending' && 'Still sending. If it does not go through, it will be tried again automatically.'}
              {invoiceSend.state === 'manual' && (
                <>
                  WhatsApp sending is not set up.{' '}
                  {invoiceSend.url && <a href={invoiceSend.url} target="_blank" rel="noopener noreferrer">Open WhatsApp</a>}
                </>
              )}
              {invoiceSend.state === 'error' && invoiceSend.error}
            </div>
          )}
          <button
            className="btn-secondary"
            onClick={() => setShowInvoiceModal(false)}
          >
            Close
          </button>
          {/* Owner or Master, on a bill with a customer: the PDF to the
              customer's WhatsApp. */}
          {(!currentUser?.role || ['Owner', 'Master'].includes(currentUser.role)) && confirmedOrder.customer && !confirmedOrder.price_pending && (
            <button
              type="button"
              className="btn-secondary invoice-send-btn"
              disabled={invoiceSend?.orderId === confirmedOrder.id && invoiceSend.state === 'sending'}
              onClick={() => sendInvoiceToWhatsApp(confirmedOrder)}
            >
              {invoiceSend?.orderId === confirmedOrder.id && ['retrying', 'failed', 'error'].includes(invoiceSend.state)
                ? <RefreshCw size={16} /> : <Send size={16} />}
              {invoiceSend?.orderId === confirmedOrder.id && invoiceSend.state === 'sending' ? 'Sending…'
                : invoiceSend?.orderId === confirmedOrder.id && invoiceSend.state === 'sent' ? 'Send again'
                : invoiceSend?.orderId === confirmedOrder.id && ['retrying', 'failed', 'error'].includes(invoiceSend.state) ? 'Retry again'
                : 'Send on WhatsApp'}
            </button>
          )}
          {!confirmedOrder.price_pending && (
          <button 
            className="btn-primary" 
            onClick={() => window.print()}
          >
            <Printer size={16} /> Print Invoice
          </button>
          )}
        </div>
      </div>
    </div>
  );
}
