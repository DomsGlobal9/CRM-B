import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ChevronDown } from 'lucide-react';
import { orderRef } from '../../services/format';
import './failedMessagesMenu.css';

/**
 * Customer messages WhatsApp gave up on, as a button beside the search bar that
 * opens the list. Each order is a link to its page, where Retry and Open
 * WhatsApp are. Nothing is drawn when no order has a failed message.
 */
export default function FailedMessagesMenu({ orders, onOpenOrder }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const buttonRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      buttonRef.current?.focus({ preventScroll: true });
    };
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!orders.length) return null;
  const sentence = `${orders.length === 1 ? 'A customer message' : 'Customer messages'} could not be sent on WhatsApp.`;
  return (
    <div className="msg-failed-menu" ref={wrapRef}>
      <button type="button" ref={buttonRef} className="msg-failed-btn" onClick={() => setOpen((v) => !v)}
              aria-expanded={open} aria-haspopup="true" title={sentence}
              aria-label={`${sentence} ${orders.length} ${orders.length === 1 ? 'order' : 'orders'}.`}>
        <AlertTriangle size={16} aria-hidden="true" />
        <span className="msg-failed-btn-label">WhatsApp failed</span>
        <span className="msg-failed-count">{orders.length}</span>
        <ChevronDown size={14} className="msg-failed-chev" aria-hidden="true" />
      </button>
      {open && (
        <div className="msg-failed-panel" role="status">
          <strong>{sentence}</strong>
          <p>Open the order to retry or send it yourself:</p>
          <div className="msg-failed-orders">
            {orders.map((o) => (
              <button key={o.id} type="button" className="at-link" onClick={() => { setOpen(false); onOpenOrder(o.id); }}>
                {orderRef(o)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
