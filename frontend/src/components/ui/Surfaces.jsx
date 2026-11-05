import { useContext } from 'react';
import {
  ArrowRight, X as CloseIcon, Lightbulb as LightbulbIcon, CheckCircle2 as CheckIcon,
  AlertTriangle, Inbox,
} from 'lucide-react';
import { CrumbsContext } from './crumbs';

/** What a page is built from: the logo, tiles, stat and section cards, avatars,
 *  page heads, notes, and what a list shows when it is empty. */

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
