import { useState } from 'react';
import { AlertTriangle, Check, ChevronDown, MessageSquare, RotateCw } from 'lucide-react';

import { IconTile } from '../../components/ui/Atelier';

// What a pre-filled WhatsApp chat cannot carry: staff attach it themselves.
const MESSAGE_ATTACHMENT = { invoice: 'the invoice PDF', garment_photos: 'the garment photos' };

// Why a message failed, in words staff can act on. The server keeps the
// raw error (a connection trace, a service reply); it stays one tap away
// under "Technical details". First match wins.
const FAILURE_REASONS = [
  [/connection refused|failed to establish|max retries exceeded|newconnectionerror|econnrefused|winerror 10061|failed to reach|connectionerror|getaddrinfo|name or service not known/i,
    'The WhatsApp service is not running right now, so this message could not go out. Once it is back on, tap Retry, or send it yourself with Open WhatsApp.'],
  [/unauthori[sz]ed|internal api secret/i,
    'The app could not sign in to the WhatsApp service. Ask your admin to check the WhatsApp setup, then tap Retry.'],
  [/not connected|current status|disconnected|logged out|not ready|qr/i,
    'WhatsApp is not linked to the boutique right now. Link it in Settings by scanning the QR code, then tap Retry.'],
  [/invalid phone|phone number is required|not registered|not on whatsapp|not a whatsapp/i,
    "This mobile number does not look like a WhatsApp number. Check the customer's number, then tap Retry."],
  [/timed? ?out|timeout/i,
    'WhatsApp took too long to answer. Tap Retry in a moment.'],
  [/64mb|exceeds maximum|mime type|download media|media delivery/i,
    'The attachment could not be sent with this message. Tap Retry, or send it yourself with Open WhatsApp.'],
];
const failureReason = (raw) => (raw && FAILURE_REASONS.find(([pattern]) => pattern.test(raw))?.[1])
  || 'Something went wrong while sending. Tap Retry, or send it yourself with Open WhatsApp.';

// The feed shows this many messages first; "Show more" opens the rest.
const FIRST_SHOWN = 3;

const when = (iso) => {
  if (!iso) return ['', ''];
  const d = new Date(iso);
  return [
    d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }),
    d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
  ];
};

/** Customer messages that need staff: FAILED after WhatsApp's automatic tries
 *  (Retry, or send by hand), or QUEUED with no automatic sender. On an order's
 *  page (Orders and Workshop), and across orders on a Master's My work, where
 *  `orderLabel(message)` names the order each one is for. */
export default function CustomerMessageQueue({ messages, onMarkSent, onRetry, orderLabel, title = 'Customer updates' }) {
  const [busy, setBusy] = useState(null); // [messageId, 'retry' | 'sent']
  const [error, setError] = useState(null);
  const [showAll, setShowAll] = useState(false);

  // A Retry that goes through takes the message (and any earlier error) off
  // the list; one that fails again says so in a single red line -- the raw
  // reply stays on the message, behind its red line's tooltip.
  const run = async (message, kind, work) => {
    setBusy([message.id, kind]);
    setError(null);
    try {
      await work(message.order, message.id);
    } catch (err) {
      setError(kind === 'retry' ? 'Still not sent on WhatsApp.' : err.message);
    } finally {
      setBusy(null);
    }
  };
  const isBusy = (id, kind) => busy && busy[0] === id && busy[1] === kind;

  if (!messages.length && !error) return null;

  const queued = messages.filter((m) => m.status === 'QUEUED' || m.status === 'FAILED');
  const failed = messages.filter((m) => m.status === 'FAILED').length;

  return (
    <div className="at-section od-updates">
      <div className="od-section-head">
        <IconTile icon={MessageSquare} tone="neutral" size={36} iconSize={16} />
        <div className="od-section-title">
          <h3>{title}</h3>
          {failed > 0
            ? <span className="ui-badge ui-badge--danger">{failed} could not be sent on WhatsApp</span>
            : queued.length > 0
              ? <span className="ui-badge ui-badge--warning">{queued.length} waiting to send</span>
              : <span className="od-section-sub">Everything sent</span>}
        </div>
      </div>

      {error && <div className="od-error">{error}</div>}

      <ol className="od-feed">
        {(showAll ? messages : messages.slice(0, FIRST_SHOWN)).map((message) => {
          const isFailed = message.status === 'FAILED';
          const isQueued = message.status === 'QUEUED' || isFailed;
          const attachment = MESSAGE_ATTACHMENT[message.template_key];
          const [day, time] = when(message.created_at);
          return (
            <li key={message.id} className={`od-feed-item${isQueued ? '' : ' od-feed-item--sent'}`}>
              <span className={`od-feed-dot od-feed-dot--${isFailed ? 'failed' : isQueued ? 'queued' : 'sent'}`} aria-hidden="true" />
              <div className="od-feed-when">{day}<br />{time}</div>
              <div className="od-feed-body">
                <div className="od-feed-meta">
                  {orderLabel && <strong>{orderLabel(message)}</strong>}
                  <span className="ui-badge ui-badge--neutral">{message.template_key.replace(/_/g, ' ')}</span>
                  <span>{message.to_number}</span>
                  {!isQueued && (
                    <span>· {message.status.toLowerCase()}{message.sent_by_name ? ` by ${message.sent_by_name}` : ''}</span>
                  )}
                </div>
                {/* A failed message shows just its red line (the reason on
                    hover) and the three buttons. */}
                {!isFailed && <p className="od-feed-text">{message.body}</p>}
                {isFailed && (
                  <p className="od-feed-failed" title={failureReason(message.error)}>
                    <AlertTriangle size={14} aria-hidden="true" /> Not sent on WhatsApp
                  </p>
                )}
                {isQueued && !isFailed && attachment && (
                  <p className="od-hint">Sending it yourself? Attach {attachment} in WhatsApp.</p>
                )}
              </div>
              {isQueued && (
                <div className="od-feed-actions">
                  {isFailed && onRetry && (
                    <button type="button" className="btn-primary at-btn-sm" disabled={!!busy}
                            onClick={() => run(message, 'retry', onRetry)}>
                      <RotateCw size={14} /> {isBusy(message.id, 'retry') ? 'Sending…' : 'Retry'}
                    </button>
                  )}
                  {message.whatsapp_url ? (
                    <a href={message.whatsapp_url} target="_blank" rel="noopener noreferrer" className="btn-secondary at-btn-sm">
                      <MessageSquare size={14} /> Open WhatsApp
                    </a>
                  ) : (
                    <span className="od-hint">No mobile number</span>
                  )}
                  <button type="button" className="btn-secondary at-btn-sm" disabled={!!busy}
                          onClick={() => run(message, 'sent', onMarkSent)}>
                    <Check size={14} /> {isBusy(message.id, 'sent') ? 'Saving…' : 'Mark sent'}
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {messages.length > FIRST_SHOWN && (
        <div className="od-feed-more">
          <button type="button" className="btn-secondary at-btn-sm" onClick={() => setShowAll(!showAll)}>
            {showAll ? 'Show less' : `Show ${messages.length - FIRST_SHOWN} more`}
            <ChevronDown size={14} style={{ transform: showAll ? 'rotate(180deg)' : 'none' }} />
          </button>
        </div>
      )}
    </div>
  );
}
