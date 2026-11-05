import { X } from 'lucide-react';
import { cleanAmount } from '../../services/validate';

/** The dialog and labelled inputs every inventory form shares. */
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
          background: 'var(--surface-color)', borderRadius: 'var(--radius-xl)', width: '100%',
          maxWidth: width, maxHeight: '88vh', overflowY: 'auto', padding: 'var(--space-6)',
          border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-lg)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-5)' }}>
          <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--text-xl)', fontWeight: 500, margin: 0, color: 'var(--text-primary)' }}>{title}</h3>
          <button type="button" className="close-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

/**
 * A labelled input. Every `type="number"` here is a price or a quantity, so it
 * is a decimal box that never holds a minus sign, a second dot or a value
 * over `max` (cleanAmount) -- one place, every inventory form.
 */
export function Field({ label, value, onChange, type = 'text', required = false, placeholder = '', max, decimals = 2, ...rest }) {
  const amount = type === 'number';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <label style={{ fontSize: '12px', fontWeight: 600 }}>{label}{required && ' *'}</label>
      <input
        type={amount ? 'text' : type} inputMode={amount ? 'decimal' : undefined} required={required} placeholder={placeholder}
        className="form-control" value={value}
        onChange={(e) => onChange(amount ? cleanAmount(e.target.value, { max, decimals }) : e.target.value)}
        {...rest}
      />
    </div>
  );
}

export function SelectField({ label, value, onChange, options, hint }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <label style={{ fontSize: '12px', fontWeight: 600 }}>{label}</label>
      <select className="form-control" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {hint && <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{hint}</span>}
    </div>
  );
}
