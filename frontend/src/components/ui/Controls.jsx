/** The small controls: chips, segmented switches, tabs, buttons and status badges. */

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
