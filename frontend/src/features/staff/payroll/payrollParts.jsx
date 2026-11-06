import { CheckCircle2, Lock, X } from 'lucide-react';

/** Small pieces the payroll screens share: the banner, the dialog, and the status label. */

export function Banner({ text, tone = 'error', icon: Icon }) {
  const c = tone === 'error'
    ? { bg: 'rgba(220,80,60,0.12)', bd: 'rgba(220,80,60,0.35)', fg: 'var(--danger-color)' }
    : tone === 'warn'
      ? { bg: 'rgba(200,140,50,0.12)', bd: 'rgba(200,140,50,0.35)', fg: '#a0691f' }
      : { bg: 'rgba(46,180,120,0.12)', bd: 'rgba(46,180,120,0.35)', fg: '#1e8a5c' };
  return (
    <div style={{
      background: c.bg, border: `1px solid ${c.bd}`, color: c.fg, borderRadius: '8px',
      padding: '10px 12px', fontSize: '13px', marginBottom: '14px',
      display: 'flex', gap: '8px', alignItems: 'flex-start',
    }}>
      {Icon && <Icon size={15} style={{ flexShrink: 0, marginTop: '1px' }} />}
      <span>{text}</span>
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
        <div style={{ display: 'flex', justifyContent: 'space-between',
                      alignItems: 'center', marginBottom: '18px' }}>
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

export function StatusPill({ status }) {
  const tone = status === 'PAID'
    ? { bg: 'color-mix(in srgb, var(--info-500) 15%, transparent)', fg: 'var(--info-700)', label: 'Paid', Icon: CheckCircle2 }
    : status === 'APPROVED'
      ? { bg: 'rgba(46,180,120,0.15)', fg: '#1e8a5c', label: 'Approved', Icon: Lock }
      : { bg: 'rgba(140,140,140,0.15)', fg: 'var(--text-secondary)', label: 'Draft', Icon: null };
  return (
    <span style={{
      fontSize: '11px', fontWeight: 600, letterSpacing: '0.04em',
      textTransform: 'uppercase', padding: '3px 8px', borderRadius: '4px',
      background: tone.bg, color: tone.fg,
      display: 'inline-flex', alignItems: 'center', gap: '4px',
    }}>
      {tone.Icon && <tone.Icon size={10} />} {tone.label}
    </span>
  );
}
