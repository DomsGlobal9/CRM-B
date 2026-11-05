import { Fragment, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowRight, X as CloseIcon, Upload as UploadIcon, Camera as CameraIcon,
  Lightbulb as LightbulbIcon, CheckCircle2 as CheckIcon,
  AlertTriangle, ChevronDown, ChevronUp, Inbox,
} from 'lucide-react';
import { imageFilesError } from '../../utils/validate';
import { CrumbsContext } from './crumbs';


/** The logo on the sidebar and phone header. Both files are drawn and the theme
 *  shows one (index.css): the "-dark" file has ink letters, for a light sidebar. */
export function ShellWordmark({ small = false }) {
  const size = small ? ' portal-wordmark--sm' : '';
  return (
    <>
      <img className={`portal-wordmark portal-wordmark--on-light${size}`} src="/scaleezy-wordmark-dark.webp" alt="Scaleezy" />
      <img className={`portal-wordmark portal-wordmark--on-dark${size}`} src="/scaleezy-wordmark.webp" alt="Scaleezy" />
    </>
  );
}

export function IconTile({ icon: Icon, tone = 'neutral', size = 44, iconSize = 20, className = '' }) {
  return (
    <span className={`at-tile at-tile--${tone} ${className}`} style={{ width: size, height: size }}>
      {Icon && <Icon size={iconSize} />}
    </span>
  );
}

// `active`: a tappable card that is also the current filter (Orders' New /
// In progress / Closed) is drawn as selected. Left out, nothing changes.
// `loading`: the card keeps its shape and shows a placeholder for the number.
export function StatCard({ icon, label, value, sub, tone = 'neutral', onClick, trailing, active, loading = false }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      aria-pressed={onClick && active !== undefined ? Boolean(active) : undefined}
      className={`at-stat at-stat--${tone}${onClick ? ' at-stat--tap' : ''}${active ? ' at-stat--active' : ''}`}
    >
      {icon && <IconTile icon={icon} tone={tone} />}
      <span className="at-stat-body">
        <span className="at-stat-label">{label}</span>
        {loading
          ? <span className="ld-bone at-stat-bone" role="status" aria-label="Loading" />
          : <span className="at-stat-value">{value}</span>}
        {sub != null && sub !== '' && <span className="at-stat-sub">{sub}</span>}
      </span>
      {trailing && <span className="at-stat-trailing">{trailing}</span>}
    </Tag>
  );
}

// `action` + `actionLabel` is the one "View all" link. `actions` takes any
// controls for that same corner, and `footer` closes the card with a line above.
export function SectionCard({ icon, tone = 'neutral', title, subtitle, action, actionLabel, actions, footer, children, className = '', style }) {
  return (
    <section className={`at-section ${className}`} style={style}>
      {(title || action || actions) && (
        <header className="at-section-head">
          <div className="at-section-heading">
            {icon && <IconTile icon={icon} tone={tone} size={38} iconSize={18} />}
            <div>
              <div className="at-section-title">{title}</div>
              {subtitle && <div className="at-section-sub">{subtitle}</div>}
            </div>
          </div>
          {action && (
            <button type="button" className="at-link" onClick={action}>
              {actionLabel || 'View all'} <ArrowRight size={14} />
            </button>
          )}
          {actions && <div className="at-section-actions">{actions}</div>}
        </header>
      )}
      {children}
      {footer && <footer className="at-section-foot">{footer}</footer>}
    </section>
  );
}

export function Chips({ options, value, onChange, ariaLabel }) {
  return (
    <div className="at-chips" role="group" aria-label={ariaLabel}>
      {options.map(({ key, label, count }) => (
        <button
          key={key}
          type="button"
          className={`at-chip${value === key ? ' at-chip--active' : ''}`}
          aria-pressed={value === key}
          onClick={() => onChange(key)}
        >
          {label}
          {count != null && <span className="at-chip-count">{count}</span>}
        </button>
      ))}
    </div>
  );
}

const AVATAR_TONES = ['green', 'amber', 'violet', 'blue', 'rose'];

export function AvatarInitials({ name, size = 40, tone, src = '' }) {
  const initials = String(name || '?')
    .split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
  const hue = tone || AVATAR_TONES[[...String(name || '')].reduce((n, c) => n + c.charCodeAt(0), 0) % AVATAR_TONES.length];
  return (
    <span className={`at-avatar at-tile--${hue}`} aria-hidden="true"
          style={{ width: size, height: size, fontSize: Math.round(size * 0.36), ...(src ? { overflow: 'hidden' } : {}) }}>
      {/* A photo when there is one, the initials otherwise. */}
      {src ? <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials}
    </span>
  );
}

export function ProgressBar({ pct, tone = 'green' }) {
  const width = Math.max(0, Math.min(100, Number(pct) || 0));
  return (
    <span className="at-progress" role="progressbar" aria-valuenow={width} aria-valuemin={0} aria-valuemax={100}>
      <i className={`at-progress-fill at-progress-fill--${tone}`} style={{ width: `${width}%` }} />
    </span>
  );
}

export { SearchBar } from './SearchBar';

export function Segmented({ options, value, onChange, ariaLabel }) {
  return (
    <div className="at-seg" role="group" aria-label={ariaLabel}>
      {options.map(({ key, label, icon: Icon, count, disabled }) => (
        <button key={key} type="button" aria-pressed={value === key} onClick={() => onChange(key)}
                disabled={disabled} className={disabled ? 'at-seg-item' : undefined}>
          {Icon && <Icon size={14} />}{label}
          {count != null && <span className="at-count">{count}</span>}
        </button>
      ))}
    </div>
  );
}

/**
 * Tabs that switch what a page shows, the same on every page: an underline under
 * the open one. The look lives in .at-tabs / .at-tab, so no page draws its own.
 * With the keyboard behaviour screen readers expect: arrow keys, Home and End move
 * between tabs and Tab leaves the row. Use Segmented for a small either/or
 * choice inside a form or toolbar. `panelId` points at the element the tabs
 * control, when there is one.
 */
export function Tabs({ tabs, value, onChange, ariaLabel, panelId, className = '', style }) {
  const onKeyDown = (e) => {
    const live = tabs.filter((tab) => !tab.disabled);
    const at = live.findIndex((tab) => tab.key === value);
    const moves = {
      ArrowRight: live[(at + 1) % live.length],
      ArrowLeft: live[(at - 1 + live.length) % live.length],
      Home: live[0],
      End: live[live.length - 1],
    };
    const next = moves[e.key];
    if (!next) return;
    e.preventDefault();
    onChange(next.key);
    e.currentTarget.querySelector(`[data-tab="${next.key}"]`)?.focus();
  };
  return (
    <div className={`at-tabs at-scroll-tabs ${className}`} style={style} role="tablist" aria-label={ariaLabel} onKeyDown={onKeyDown}>
      {tabs.map(({ key, label, icon: Icon, count, disabled }) => (
        <button key={key} type="button" role="tab" data-tab={key} aria-selected={value === key} aria-controls={panelId}
                tabIndex={value === key ? 0 : -1} disabled={disabled}
                className={`at-tab${value === key ? ' at-tab--active' : ''}`} onClick={() => onChange(key)}>
          {Icon && <Icon size={15} />}{label}
          {count != null && <span className="at-count">{count}</span>}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Buttons and badges                                                  */
/* ------------------------------------------------------------------ */

const BUTTON_VARIANTS = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  outline: 'btn-secondary', // the secondary button is the outline button
  danger: 'btn-secondary at-btn-danger',
  ghost: 'btn-secondary btn-ghost',
};

/**
 * The button recipes (.btn-primary and friends) with the loading state written
 * once. A plain <button className="btn-primary"> stays correct everywhere.
 * While `loading` it cannot be pressed twice and says it is busy.
 */
export function Button({ variant = 'primary', size, loading = false, icon: Icon, disabled, type = 'button', className = '', children, ...rest }) {
  const classes = [BUTTON_VARIANTS[variant] || BUTTON_VARIANTS.primary, size === 'sm' && 'at-btn-sm', loading && 'at-btn-busy', className]
    .filter(Boolean).join(' ');
  return (
    <button type={type} className={classes} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <span className="ld-ring at-btn-spinner" aria-hidden="true" /> : Icon && <Icon size={16} />}
      {children}
    </button>
  );
}

/**
 * A button that is only an icon. `label` is required: it names the button for
 * screen readers and is the tooltip for everyone else.
 * Sizes: sm 32px (the default, for table rows), md 36px, lg 40px. On a touch
 * screen all of them grow to 44px.
 */
export function IconButton({ icon: Icon, label, size = 'sm', danger = false, outline = false, loading = false, iconSize = 16, disabled, type = 'button', className = '', ...rest }) {
  const classes = ['at-icon-btn at-icon-btn--std', size !== 'sm' && `at-icon-btn--${size}`, danger && 'at-icon-btn--danger', outline && 'at-icon-btn--outline', className]
    .filter(Boolean).join(' ');
  return (
    <button type={type} className={classes} aria-label={label} title={label} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <span className="ld-ring at-btn-spinner" aria-hidden="true" /> : <Icon size={iconSize} />}
    </button>
  );
}

const BADGE_TONES = ['success', 'warning', 'danger', 'info', 'neutral'];

/**
 * One status, one badge. A feature keeps its own map from status to tone
 * (Paid is success, Overdue is danger); the badge only knows the five tones.
 * A status is never colour alone: the words are always there.
 */
export function StatusBadge({ tone = 'neutral', icon: Icon, dot = false, title, className = '', children }) {
  const safe = BADGE_TONES.includes(tone) ? tone : 'neutral';
  return (
    <span className={`ui-badge ui-badge--${safe} at-status at-status--${safe} ${className}`} title={title}>
      {dot && <span className="at-status-dot" aria-hidden="true" />}
      {Icon && <Icon aria-hidden="true" />}
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Long content and empty states                                       */
/* ------------------------------------------------------------------ */

/** Calls `measure` with the element whenever its box changes or `watch` does. */
function useMeasure(ref, measure, watch) {
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    // An observer reports once when it starts, so this also covers first paint.
    const observer = new ResizeObserver(() => measure(el));
    observer.observe(el);
    return () => observer.disconnect();
    // `measure` is rebuilt each render; only `watch` should re-subscribe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, watch]);
}

/**
 * Text cut to `lines`, with the rest still reachable: only when it really is
 * cut, the full text becomes the tooltip and keyboard focus opens it out.
 * Screen readers always get all of it. Pass `fullText` when the children are
 * not plain text. `focusable={false}` inside a row or link that is itself
 * focusable.
 */
export function ClampedText({ children, lines = 1, fullText, focusable = true, as: Tag = 'span', className = '', style }) {
  const ref = useRef(null);
  const [cut, setCut] = useState(false);
  const plain = typeof children === 'string' || typeof children === 'number' ? String(children) : undefined;
  const whole = fullText ?? plain;
  useMeasure(ref, (el) => {
    setCut(el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1);
  }, `${whole}|${lines}`);
  return (
    <Tag ref={ref} className={`at-clamp ${lines === 1 ? 'at-clamp--one' : 'at-clamp--many'} ${className}`}
         style={lines === 1 ? style : { '--clamp-lines': lines, ...style }}
         title={cut ? whole : undefined} tabIndex={cut && focusable ? 0 : undefined}>
      {children}
    </Tag>
  );
}

/**
 * "See more" that appears only when there really is more.
 *
 * For content, give `maxHeight` (px): taller content is cut there, with a fade.
 * Content only a little taller (under 24px over) is shown whole, because a
 * button that reveals one more line is more work than the line.
 *
 * For a list, give `items`, `renderItem` and `limit`; `as` sets the list's tag,
 * `getKey` the item key.
 */
export function SeeMore({ children, maxHeight = 160, items, renderItem, getKey, limit = 5, as: Tag = 'div', moreLabel, lessLabel = 'Show less', className = '' }) {
  const [open, setOpen] = useState(false);
  const [tall, setTall] = useState(false);
  const innerRef = useRef(null);
  const isList = Array.isArray(items);
  useMeasure(innerRef, (el) => setTall(el.scrollHeight > maxHeight + 24), maxHeight);

  const toggle = (label) => (
    <button type="button" className="at-link at-seemore-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
      {label} {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
    </button>
  );

  if (isList) {
    const shown = open ? items : items.slice(0, limit);
    return (
      <>
        <Tag className={className}>
          {shown.map((item, i) => <Fragment key={getKey ? getKey(item) : i}>{renderItem(item, i)}</Fragment>)}
        </Tag>
        {items.length > limit && toggle(open ? lessLabel : (moreLabel || `See all ${items.length}`))}
      </>
    );
  }
  const clipped = tall && !open;
  return (
    <div className={className}>
      <div className={`at-seemore-body${clipped ? ' at-seemore-body--clip' : ''}`} style={clipped ? { maxHeight } : undefined}>
        <div ref={innerRef}>{children}</div>
      </div>
      {tall && toggle(open ? lessLabel : (moreLabel || 'See more'))}
    </div>
  );
}

/**
 * What a list or card shows when it has nothing to show, or (`error`) when it
 * could not load. Say what is missing in `title`, what to do about it in
 * `detail`, and put the way forward in `action`.
 */
export function EmptyState({ icon, title, detail, action, tone, error = false, compact = false, className = '' }) {
  return (
    <div className={`at-empty-state${compact ? ' at-empty-state--compact' : ''} ${className}`} role={error ? 'alert' : undefined}>
      <IconTile icon={icon || (error ? AlertTriangle : Inbox)} tone={tone || (error ? 'rose' : 'neutral')} />
      {title && <div className="at-empty-title">{title}</div>}
      {detail && <div className="at-empty-detail">{detail}</div>}
      {action && <div className="at-empty-action">{action}</div>}
    </div>
  );
}

export function PageHeader({ icon: Icon, tone = 'neutral', title, subtitle, actions, aside, meta }) {
  // In the workspace the top bar names the page, so the title and the line
  // describing it are not drawn; a header with nothing else takes no room. The
  // admin console has no such bar and keeps its own.
  const titledByTopBar = useContext(CrumbsContext) !== null;
  if (titledByTopBar && !Icon && !actions && !aside && !meta) return null;
  return (
    <header className="at-page-head">
      <div className="at-page-head-left">
        {Icon && <span className={`at-page-icon at-tile at-tile--${tone}`}><Icon size={26} strokeWidth={1.6} /></span>}
        <div className="at-page-head-text">
          {!titledByTopBar && <h1 className="at-page-title">{title}</h1>}
          {!titledByTopBar && subtitle && <p className="at-page-sub">{subtitle}</p>}
          {meta && <div className="at-page-meta">{meta}</div>}
        </div>
      </div>
      <div className="at-page-head-right">
        {aside && <div className="at-page-aside">{aside}</div>}
        {actions && <div className="at-page-actions">{actions}</div>}
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Dialogs and forms                                                   */
/* ------------------------------------------------------------------ */

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


const cameraProblem = (err, siteState) => {
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    return 'The camera only works on a secure (https) address or on localhost. Open the app over https to use it.';
  }
  switch (err?.name) {
    case 'NotAllowedError': case 'PermissionDeniedError': case 'SecurityError':
      if (siteState === 'denied') {
        return 'Camera access is blocked for this site, so the browser will not ask again by itself. '
          + 'Click the camera (or lock) icon at the right end of the address bar, choose "Always allow", '
          + 'then press Reload page below.';
      }
      return 'The browser itself is not allowed to use the camera, so no permission bar or icon appears. '
        + 'On Windows: Settings › Privacy & security › Camera → turn on "Camera access" and '
        + '"Let desktop apps access your camera" (your browser is in that list). On a Mac: System Settings › '
        + 'Privacy & Security › Camera → allow the browser. Then press Reload page below.';
    case 'NotFoundError': case 'DevicesNotFoundError':
      return 'No camera was found on this device.';
    case 'NotReadableError': case 'TrackStartError':
      return 'The camera is in use by another app. Close it and try again.';
    default:
      return 'The camera could not be opened.';
  }
};

let cameraRequest = null;
const acquireCamera = () => {
  if (!cameraRequest) {
    cameraRequest = navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .catch((first) => (first?.name === 'NotAllowedError' || first?.name === 'PermissionDeniedError'
        ? Promise.reject(first)
        : navigator.mediaDevices.getUserMedia({ video: true, audio: false })))
      .finally(() => { cameraRequest = null; });
  }
  return cameraRequest;
};

export function CameraCapture({ onCapture, onClose, onUnavailable, label = 'Capture' }) {
  const [stream, setStream] = useState(null);
  const [problem, setProblem] = useState(null);
  const [blocked, setBlocked] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const videoRef = useRef(null);
  useEffect(() => {
    let live = null;
    let cancelled = false;
    setProblem(null);
    setBlocked(false);
    if (!navigator.mediaDevices?.getUserMedia) { setProblem(cameraProblem(null)); return undefined; }
    acquireCamera()
      .then((s) => { if (cancelled) return; live = s; setStream(s); })
      .catch(async (err) => {
        if (cancelled) return;
        
        if (/dismiss/i.test(err?.message || '')) {
          setProblem('The camera request was closed before it was answered. Press Try again and choose Allow when the browser asks.');
          setBlocked(false);
          return;
        }
        
        let siteState = null;
        try { siteState = (await navigator.permissions.query({ name: 'camera' })).state; } catch { /* not supported */ }
        if (cancelled) return;
        const detail = err?.name ? ` (${err.name}${err.message ? `: ${err.message}` : ''})` : '';
        setProblem(cameraProblem(err, siteState) + detail);
        setBlocked(['NotAllowedError', 'PermissionDeniedError', 'SecurityError'].includes(err?.name));
      });
   
    return () => { cancelled = true; live?.getTracks().forEach((t) => t.stop()); };
  }, [attempt]);  

  const capture = async () => {
    const video = videoRef.current;
    if (!video?.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    const blob = await new Promise((done) => canvas.toBlob(done, 'image/jpeg', 0.92));
    if (blob) onCapture(new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' }));
    onClose();
  };

  if (problem) {
    return createPortal(
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', zIndex: 20000,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '28px' }}
           onClick={onClose}>
        <div style={{ background: 'var(--surface-color, #fff)', color: 'var(--text-primary, #111)', borderRadius: '12px',
                      padding: '20px', maxWidth: '420px', width: '100%', display: 'flex', flexDirection: 'column', gap: '12px' }}
             onClick={(e) => e.stopPropagation()}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700 }}>
            <CameraIcon size={16} /> Camera not available
          </div>
          <div style={{ fontSize: '13px', lineHeight: 1.5, color: 'var(--text-secondary, #555)' }}>{problem}</div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button type="button" className="btn-secondary at-btn-sm" onClick={onClose}>Cancel</button>
            <button type="button" className="btn-secondary at-btn-sm" onClick={() => { onClose(); onUnavailable?.(); }}>
              <UploadIcon size={14} /> Choose a file instead
            </button>
            {blocked ? (
              <button type="button" className="btn-primary at-btn-sm" onClick={() => window.location.reload()}>
                <CameraIcon size={14} /> Reload page
              </button>
            ) : (
              <button type="button" className="btn-primary at-btn-sm" onClick={() => setAttempt((n) => n + 1)}>
                <CameraIcon size={14} /> Try again
              </button>
            )}
          </div>
        </div>
      </div>,
      document.body,
    );
  }
  if (!stream) {
    
    return createPortal(
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', zIndex: 20000,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '28px' }}>
        <div style={{ background: 'var(--surface-color, #fff)', color: 'var(--text-primary, #111)', borderRadius: '12px',
                      padding: '20px', maxWidth: '420px', width: '100%', display: 'flex', flexDirection: 'column', gap: '12px' }}
             onClick={(e) => e.stopPropagation()}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700 }}>
            <CameraIcon size={16} /> Opening camera…
          </div>
          <div style={{ fontSize: '13px', lineHeight: 1.5, color: 'var(--text-secondary, #555)' }}>
            If the browser asks, choose <strong>Allow</strong> so the camera can be used here.
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="button" className="btn-secondary at-btn-sm" onClick={onClose}>Cancel</button>
          </div>
        </div>
      </div>,
      document.body,
    );
  }
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', zIndex: 20000,
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  justifyContent: 'center', gap: '14px', padding: '28px' }}
         onClick={onClose}>
      <video autoPlay playsInline muted
             ref={(el) => { videoRef.current = el; if (el && el.srcObject !== stream) el.srcObject = stream; }}
             onClick={(e) => e.stopPropagation()}
             style={{ maxWidth: '100%', maxHeight: '70vh', borderRadius: '8px', background: '#000' }} />
      <div style={{ display: 'flex', gap: '10px' }} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="btn-primary" style={{ padding: '6px 16px', fontSize: '12px' }} onClick={capture}>
          <CameraIcon size={13} /> {label}
        </button>
        <button type="button" className="btn-secondary" style={{ padding: '6px 14px', fontSize: '12px' }} onClick={onClose}>
          <CloseIcon size={13} /> Cancel
        </button>
      </div>
    </div>,
    document.body,
  );
}

/**
 * The one way to add a photo: a single button over a plain file input.
 *
 * Pass `onCamera` where the screen has its own live camera (the garment part
 * picker), or `camera` to open the shared live camera (CameraCapture), with the
 * `capture` input as its fallback:
 * either way the click asks "Take a photo" or "Choose from device". A phone
 * opens its camera straight away for the first; a laptop with a webcam gets
 * the browser's camera dialog. Without either prop it is one plain button.
 */
export function AddPhotoButton({ onFiles, multiple = false, label = 'Add photo', onCamera, camera = false,
                                 className = 'btn-secondary at-btn-sm',
                                 style, disabled = false, icon: Icon = CameraIcon, iconSize = 14 }) {
  const ref = useRef(null);
  const camRef = useRef(null);
  const [open, setOpen] = useState(false);
  const pick = (e) => {
    const files = [...(e.target.files || [])];
    e.target.value = '';        
    if (!files.length) return;
    
    const problem = imageFilesError(files);
    if (problem) { window.alert(problem); return; }
    onFiles(multiple ? files : files.slice(0, 1));
  };
  const input = <input ref={ref} type="file" accept="image/*" multiple={multiple} hidden onChange={pick} />;
  const [camOpen, setCamOpen] = useState(false);
  const camInput = camera && !onCamera
    ? (
      <>
        <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={pick} />
        {camOpen && (
          <CameraCapture onCapture={(file) => onFiles([file])} onClose={() => setCamOpen(false)}
                         onUnavailable={() => { setCamOpen(false); camRef.current?.click(); }} />
        )}
      </>
    )
    : null;
  const takePhoto = onCamera || (() => setCamOpen(true));
  if (!onCamera && !camera) {
    return (
      <>
        <button type="button" className={className} style={style} disabled={disabled} onClick={() => ref.current?.click()}>
          <Icon size={iconSize} /> {label}
        </button>
        {input}
      </>
    );
  }
  return (
    <span className="at-menu-anchor" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}>
      <button type="button" className={className} style={style} disabled={disabled}
              aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Icon size={iconSize} /> {label}
      </button>
      {open && (
        <span className="at-menu" role="menu">
          <button type="button" role="menuitem" onClick={() => { setOpen(false); takePhoto(); }}>
            <CameraIcon size={14} /> Take a photo
          </button>
          <button type="button" role="menuitem" onClick={() => { setOpen(false); ref.current?.click(); }}>
            <UploadIcon size={14} /> Choose from device
          </button>
        </span>
      )}
      {input}
      {camInput}
    </span>
  );
}

/**
 * A "Take photo" button on its own, for the forms that keep a plain
 * <input type="file"> as their way in: the same `onFiles` the input feeds,
 * reached through the device camera instead of the file dialog.
 */
export function CameraButton({ onFiles, multiple = false, label = 'Take photo', className = 'btn-secondary at-btn-sm', style, disabled = false }) {
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} style={style} disabled={disabled} onClick={() => setOpen(true)}>
        <CameraIcon size={14} /> {label}
      </button>
      {open && (
        <CameraCapture onCapture={(file) => onFiles([file])} onClose={() => setOpen(false)}
                       onUnavailable={() => { setOpen(false); ref.current?.click(); }} />
      )}
      <input ref={ref} type="file" accept="image/*" capture="environment" multiple={multiple} hidden
             onChange={(e) => { const files = [...(e.target.files || [])]; e.target.value = ''; if (files.length) onFiles(multiple ? files : files.slice(0, 1)); }} />
    </>
  );
}

/**
 * A drop area for files. Dropped or chosen files reach `onFiles` as an array;
 * the input resets itself so the same file can be picked twice. `camera` adds
 * a "Take photo" button beside "Choose file" that opens the device camera
 * (a `capture` input), for the counter that photographs rather than browses.
 * No icon above the title: the upload glyph already sits on the button, and
 * twice on one card read as two controls.
 */
export function Dropzone({ onFiles, accept = 'image/*', multiple = false, title, subtitle, chooseLabel = 'Choose file', hint, compact = false, camera = false }) {
  const [over, setOver] = useState(false);
  const [problem, setProblem] = useState('');
  const [camOpen, setCamOpen] = useState(false);
  const fileRef = useRef(null);
  const camRef = useRef(null);
  const take = (list) => {
    const files = [...(list || [])].filter(Boolean);
    if (!files.length) return;
    
    const error = accept === 'image/*' ? imageFilesError(files) : '';
    setProblem(error);
    if (error) return;
    onFiles(multiple ? files : files.slice(0, 1));
  };
  return (
    <div
      className={`at-drop${over ? ' at-drop--over' : ''}${compact ? ' at-drop--compact' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files); }}
    >
      <div className="at-drop-title">{title || (multiple ? 'Drag & drop photos here' : 'Drag & drop a file here')}</div>
      {subtitle !== null && <div className="at-drop-sub">{subtitle || 'or choose from your device'}</div>}
      <div className="at-drop-actions">
        <button type="button" className="btn-secondary at-btn-sm" onClick={() => fileRef.current?.click()}>
          <UploadIcon size={14} /> {chooseLabel}
        </button>
        {camera && (
          <button type="button" className="btn-secondary at-btn-sm" onClick={() => setCamOpen(true)}>
            <CameraIcon size={14} /> Take photo
          </button>
        )}
      </div>
      {hint && <div className="at-drop-hint">{hint}</div>}
      {problem && <div className="at-drop-hint" role="alert" style={{ color: '#dc2626' }}>{problem}</div>}
      <input ref={fileRef} type="file" accept={accept} multiple={multiple} hidden
             onChange={(e) => { take(e.target.files); e.target.value = ''; }} />
      {camera && (
        <input ref={camRef} type="file" accept="image/*" capture="environment" multiple={multiple} hidden
               onChange={(e) => { take(e.target.files); e.target.value = ''; }} />
      )}
      {camera && camOpen && (
        <CameraCapture onCapture={(file) => take([file])} onClose={() => setCamOpen(false)}
                       onUnavailable={() => { setCamOpen(false); camRef.current?.click(); }} />
      )}
    </div>
  );
}

/** One chosen photograph, with its remove button and an optional corner label. */
export function PhotoTile({ src, alt = '', onRemove, label, size = 96 }) {
  return (
    <span className="at-photo" style={{ width: size, height: Math.round(size * 1.25) }}>
      <img src={src} alt={alt} />
      {onRemove && (
        <button type="button" className="at-photo-remove" onClick={onRemove} aria-label="Remove photo">
          <CloseIcon size={12} />
        </button>
      )}
      {label && <span className="at-photo-label">{label}</span>}
    </span>
  );
}

/** A quiet note beside or below a form: a tip, a rule, a checklist. */
export function InfoNote({ icon: Icon = LightbulbIcon, tone = 'amber', title, children, items, onDismiss, style }) {
  return (
    <div className={`at-note at-note--${tone}`} style={style}>
      <span className="at-note-icon"><Icon size={20} strokeWidth={1.7} /></span>
      <div className="at-note-body">
        {title && <div className="at-note-title">{title}</div>}
        {children && <div className="at-note-text">{children}</div>}
        {items && (
          <ul className="at-note-list">
            {items.map((item) => <li key={item}><CheckIcon size={14} /> {item}</li>)}
          </ul>
        )}
      </div>
      {onDismiss && (
        <button type="button" className="at-modal-close" style={{ width: 28, height: 28 }} onClick={onDismiss} aria-label="Dismiss">
          <CloseIcon size={14} />
        </button>
      )}
    </div>
  );
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
