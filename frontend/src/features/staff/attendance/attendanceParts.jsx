import { X } from 'lucide-react';

/** Small pieces the attendance screens share: the banner, the dialog, and where a check-in happened. */

export function Banner({ text, tone = 'error' }) {
  const colours = tone === 'error'
    ? { bg: 'rgba(220,80,60,0.12)', border: 'rgba(220,80,60,0.35)', fg: 'var(--danger-color)' }
    : { bg: 'rgba(46,180,120,0.12)', border: 'rgba(46,180,120,0.35)', fg: '#1e8a5c' };
  return (
    <div style={{
      background: colours.bg, border: `1px solid ${colours.border}`, color: colours.fg,
      borderRadius: '8px', padding: '10px 12px', fontSize: '13px', marginBottom: '14px',
    }}>
      {text}
    </div>
  );
}

export function Modal({ title, onClose, children, width = '520px' }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 1200,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--modal-bg, #fff)', borderRadius: '12px', width: '100%',
          maxWidth: width, maxHeight: '88vh', overflowY: 'auto', padding: '24px',
          border: '1px solid var(--border-color)',
        }}
      >
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: '18px',
        }}>
          <h3 style={{ fontSize: '18px', fontWeight: 600, margin: 0 }}>{title}</h3>
          <button type="button" className="close-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const metresText = (m) => (m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`);

/** Where a self check-in happened, for the owner's eye; null when there is nothing to say. */
export function WhereTag({ session }) {
  if (session.source !== 'SELF') return null;
  const accuracy = session.check_in_accuracy_m != null ? ` (±${metresText(session.check_in_accuracy_m)})` : '';
  if (session.check_in_outside_shop) {
    return (
      <span style={{ color: '#dc2626', fontWeight: 600 }}
            title={`Checked in ${metresText(session.check_in_distance_m)} from the shop${accuracy}`}>
        Outside shop · {metresText(session.check_in_distance_m)}
      </span>
    );
  }
  if (session.check_in_outside_shop === false) {
    return <span title={`${metresText(session.check_in_distance_m)} from the shop${accuracy}`}>At shop</span>;
  }
  if (session.check_in_accuracy_m == null) {
    return <span style={{ color: 'var(--text-muted)' }}>No location</span>;
  }
  // A position, but the boutique has not pinned its shop yet, so there is
  // nothing to measure it against -- say it was recorded rather than leave
  // the line ending on a bare separator.
  return (
    <span title="Set the shop's location (My account › Shop location for staff check-in) to see At shop / Outside shop">
      Location saved{accuracy}
    </span>
  );
}
