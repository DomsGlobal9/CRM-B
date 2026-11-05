import { X as CloseIcon } from 'lucide-react';
import { IconTile } from './Surfaces';

/** Dialogs and forms: the dialog itself, a labelled field, a titled group of
 *  fields, and the buttons that end a form. */

export function FormModal({ icon: Icon, tone = 'green', title, subtitle, onClose, children, footer, width = '640px', zIndex = 1200, bodyClassName = '' }) {
  return (
    <div className="at-modal-overlay" style={{ zIndex }} onClick={onClose}>
      <div className="at-modal" style={{ maxWidth: width }} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}
           onClick={(e) => e.stopPropagation()}>
        <header className="at-modal-head">
          {Icon && <span className={`at-modal-icon at-tile at-tile--${tone}`}><Icon size={26} strokeWidth={1.6} /></span>}
          <div className="at-modal-heading">
            <h3 className="at-modal-title">{title}</h3>
            {subtitle && <p className="at-modal-sub">{subtitle}</p>}
          </div>
          {onClose && (
            <button type="button" className="at-modal-close" onClick={onClose} aria-label="Close">
              <CloseIcon size={18} />
            </button>
          )}
        </header>
        <div className={`at-modal-body ${bodyClassName}`}>{children}</div>
        {footer && <footer className="at-modal-foot">{footer}</footer>}
      </div>
    </div>
  );
}

/** A label, the control, and the small print under it. `icon` puts a tinted
 *  box on the left of the control, the way the forms read. `error` marks the
 *  control and says what is wrong; give the input aria-invalid as well.
 *  `disabled` dims the control; the input itself still needs `disabled`. */
export function Field({ label, required, optional, hint, error, disabled = false, icon: Icon, children, htmlFor, style, className = '' }) {
  return (
    <div className={`at-field ${className}${error ? ' at-field--error' : ''}`} style={style}>
      {label && (
        <label className="at-field-label" htmlFor={htmlFor}>
          {label}
          {required && <span className="at-field-req" aria-hidden="true"> *</span>}
          {optional && <span className="at-field-opt"> (Optional)</span>}
        </label>
      )}
      <div className={`at-field-control${Icon ? ' at-field-control--icon' : ''}${disabled ? ' at-field-control--disabled' : ''}`}>
        {Icon && <span className="at-field-icon"><Icon size={17} /></span>}
        {children}
      </div>
      {error && <div className="at-field-error" role="alert">{error}</div>}
      {hint && <div className="at-field-hint">{hint}</div>}
    </div>
  );
}

/** The buttons that end a form. On a phone they stack, with the first one in
 *  the markup at the bottom, so put Cancel first and Save last.
 *  `align`: end (default), start, or between. */
export function FormActions({ align = 'end', className = '', children }) {
  const place = align === 'end' ? '' : ` at-form-actions--${align}`;
  return <div className={`at-form-actions${place} ${className}`}>{children}</div>;
}

/** A titled group inside a dialog: icon, serif title, gloss, then the fields. */
export function FormSection({ icon: Icon, tone = 'green', title, subtitle, aside, children, className = '', style }) {
  return (
    <section className={`at-form-section ${className}`} style={style}>
      <header className="at-form-section-head">
        {Icon && <IconTile icon={Icon} tone={tone} size={40} iconSize={18} />}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="at-section-title">{title}</div>
          {subtitle && <div className="at-section-sub">{subtitle}</div>}
        </div>
        {aside && <div className="at-form-section-aside">{aside}</div>}
      </header>
      {children}
    </section>
  );
}
