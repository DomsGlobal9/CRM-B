/**
 * The console's shared primitives.
 *
 * Every screen needs the same five states -- loading, empty, failed,
 * permission-denied, and loaded -- and the specification is explicit that no
 * screen may ever be blank when an API fails. Putting that in one place is what
 * makes it true on all fifteen screens rather than on the ones someone
 * remembered, so screens are expected to render <Async> rather than hand-roll
 * their own conditionals.
 *
 * The look is the boutique workspace's own design system, not a copy of it:
 * these components render the workspace components (src/components/ui) and
 * the workspace classes in src/index.css, and the workspace components a
 * screen needs directly are re-exported from here, so a screen imports
 * everything from '../ui'. superadmin.css adds only the layouts the workspace
 * has no recipe for. lucide-react is still the only UI dependency.
 */

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle, ArrowLeft, ArrowRight, Check, CheckCircle2, Copy, Info, Lock, RotateCw, Search, X,
} from 'lucide-react';

import {
  AvatarInitials, Chips as WorkspaceChips, Field, FormModal, IconTile, InfoNote, PageHeader, ProgressBar,
  SectionCard, Segmented, StatCard,
} from '../components/ui/Atelier.jsx';
import Loader, { LoaderRows } from '../components/ui/Loader.jsx';
import RowMenu from '../components/ui/RowMenu.jsx';
import { LIMITS } from '../services/validate';

// The workspace components screens use directly. Importing them from here
// keeps one import line per screen and one place to see what the console uses.
// Chips is the one exception: the console wraps it (below, with the filters).
export {
  AvatarInitials, Field, FormModal, IconTile, InfoNote, Loader, LoaderRows, PageHeader,
  ProgressBar, RowMenu, SectionCard, Segmented, StatCard,
};

/* ----------------------------------------------------------- formatting */

const nf = new Intl.NumberFormat('en-IN');

export const count = (n) => (n === null || n === undefined ? '—' : nf.format(n));

export const money = (n) =>
  n === null || n === undefined
    ? '—'
    : `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n)}`;

export const day = (iso) =>
  !iso
    ? null
    : new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export const moment = (iso) =>
  !iso
    ? null
    : new Date(iso).toLocaleString('en-GB', {
        day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
      });

/** How long ago, in the roughest terms that are still useful. */
export function since(iso) {
  if (!iso) return { text: 'never', tone: 'warn' };
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return { text: 'today', tone: 'ok' };
  if (days === 1) return { text: 'yesterday', tone: 'ok' };
  if (days < 30) return { text: `${days} days ago`, tone: 'ok' };
  return { text: `${Math.floor(days / 30)} mo ago`, tone: 'warn' };
}

/* --------------------------------------------------------------- status */

/**
 * The one place a health/severity word becomes a colour.
 *
 * `not_configured` is grey, never red. Several integrations this product does
 * not have are permanently in that state by design -- WhatsApp is a wa.me link
 * on purpose, not a broken API client -- and a red light there would send
 * someone hunting a bug that does not exist.
 */
export const TONES = {
  healthy: 'ok', ok: 'ok', active: 'ok', completed: 'ok', resolved: 'ok', enabled: 'ok',
  warning: 'warn', in_progress: 'warn', almost_complete: 'warn', acknowledged: 'warn',
  degraded: 'warn', trial: 'warn', new: 'info', not_started: 'info', info: 'info',
  critical: 'off', offline: 'off', suspended: 'off', blocked: 'off', disabled: 'off',
  high: 'off', failed: 'off',
  medium: 'warn', low: 'info',
  not_configured: 'muted', not_tracked: 'muted', ignored: 'muted', unknown: 'muted',
};

/** Plain words for the statuses the server speaks in. Anything not listed is
 * shown as-is with underscores turned to spaces. */
export const WORDS = {
  healthy: 'working', ok: 'OK', warning: 'keep an eye on', degraded: 'partly working',
  critical: 'needs action', offline: 'down', not_configured: 'not set up',
  not_tracked: 'not recorded', unreadable: 'cannot be read',
  new: 'new', acknowledged: 'being looked at', resolved: 'fixed', ignored: 'ignored',
  crash: 'crash', handled: 'handled', refusal: 'refused on purpose', client: 'bad request',
  frontend: 'browser crash', high: 'serious', medium: 'moderate', low: 'minor',
};

export const wordFor = (value) => {
  const key = String(value).toLowerCase();
  return WORDS[key] ?? key.replace(/_/g, ' ');
};

/**
 * Console tone -> workspace badge. Info is grey in Scaleezy (there is no blue
 * status), and the workspace names are accepted as they are.
 */
const BADGE = {
  ok: 'success', warn: 'warning', off: 'danger', info: 'neutral', muted: 'neutral',
  success: 'success', warning: 'warning', danger: 'danger', neutral: 'neutral',
};

/** Badges read in sentence case, as in the workspace ('Not set up', 'Live
 * token'): the first letter is raised and nothing else is touched, so an
 * explicit label keeps its own words. A JSX label is left exactly as given. */
const sentence = (text) =>
  (typeof text === 'string' && text ? text[0].toUpperCase() + text.slice(1) : text);

export function Pill({ value, label, tone }) {
  const resolved = tone || TONES[String(value).toLowerCase()] || 'info';
  return (
    <span className={`ui-badge ui-badge--${BADGE[resolved] || 'neutral'}`}>
      {sentence(label ?? wordFor(value))}
    </span>
  );
}

/* ---------------------------------------------------------------- toast */

const ToastContext = createContext(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastHost({ children }) {
  const [toasts, setToasts] = useState([]);
  const seq = useRef(0);

  const push = useCallback((message, tone = 'ok') => {
    const id = ++seq.current;
    setToasts((list) => [...list, { id, message, tone }]);
    // Errors stay long enough to read and copy; confirmations get out of the way.
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)),
               tone === 'off' ? 8000 : 3500);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="sa-toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          // A failure is marked (a danger edge) and announced at once.
          <div key={t.id} className={`sa-toast${t.tone === 'off' ? ' sa-toast--error' : ''}`}
            role={t.tone === 'off' ? 'alert' : undefined}>
            {t.tone === 'off' ? <AlertTriangle size={16} aria-hidden="true" /> : <Check size={16} aria-hidden="true" />}
            <span className="sa-toast-text">{t.message}</span>
            <button type="button" className="at-icon-btn" aria-label="Dismiss"
              onClick={() => setToasts((l) => l.filter((x) => x.id !== t.id))}>
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/* ---------------------------------------------------------------- fetch */

/**
 * Load once, expose {data, error, loading, reload}.
 *
 * `load` MUST be a stable reference -- wrap it in useCallback at the call site,
 * with the real dependencies there. That is the whole contract, and it is the
 * standard trap with this shape: an inline arrow is a new function every render
 * and this would refetch forever.
 *
 * There is deliberately no `deps` argument. An earlier version took one and
 * forwarded it into useCallback, which cannot be statically checked and quietly
 * breaks React's hook invariant if a caller's array ever changes length.
 * Since every caller already memoises `load` on exactly those dependencies,
 * `[load]` says the same thing, is a literal, and cannot be got wrong.
 */
export function useApi(load) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const alive = useRef(true);

  const run = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await load();
      if (alive.current) setState({ data, error: null, loading: false });
    } catch (e) {
      // The error object carries .status, which <Async> uses to tell a
      // permission failure apart from a server failure.
      if (alive.current) setState({ data: null, error: e, loading: false });
    }
  }, [load]);

  useEffect(() => {
    alive.current = true;
    run();
    return () => { alive.current = false; };
  }, [run]);

  return { ...state, reload: run };
}

/* -------------------------------------------------------------- dialogs */

/**
 * Escape closes the TOP dialog only. A Confirm opened over a Modal (Modules
 * does this) must not take the Modal down with it, so handlers stack and one
 * window listener calls the last. A busy dialog still takes the key -- its
 * handler just declines -- so Escape never reaches the dialog underneath.
 */
const escapeStack = [];

function onEscapeKey(event) {
  if (event.key !== 'Escape' || escapeStack.length === 0) return;
  escapeStack[escapeStack.length - 1].current?.();
}

function useEscape(active, handler) {
  const latest = useRef(handler);
  useEffect(() => { latest.current = handler; });
  useEffect(() => {
    if (!active) return undefined;
    escapeStack.push(latest);
    if (escapeStack.length === 1) window.addEventListener('keydown', onEscapeKey);
    return () => {
      const at = escapeStack.lastIndexOf(latest);
      if (at !== -1) escapeStack.splice(at, 1);
      if (escapeStack.length === 0) window.removeEventListener('keydown', onEscapeKey);
    };
  }, [active]);
}

/**
 * A workspace dialog (FormModal) for the console's own forms and read-outs.
 * Render it conditionally -- `{open && <Modal …/>}` -- the way FormModal is.
 * While `busy`, the backdrop and Escape do nothing and the close button is
 * not drawn (FormModal draws it only with an onClose), so a request in
 * flight cannot be abandoned half-way.
 */
export function Modal({ title, subtitle, icon, tone = 'neutral', onClose, busy = false, footer,
                        width = '560px', zIndex, children }) {
  useEscape(true, () => { if (!busy) onClose(); });
  return (
    <FormModal icon={icon} tone={tone} title={title} subtitle={subtitle}
      onClose={busy ? undefined : onClose} footer={footer} width={width} zIndex={zIndex}>
      {children}
    </FormModal>
  );
}

/* --------------------------------------------------------------- states */

export function Skeleton({ rows = 5 }) {
  return <LoaderRows rows={rows} />;
}

/** The workspace's empty-state card: a tile, a title, one line, an action. */
function StateCard({ icon, tone = 'neutral', title, detail, action, role }) {
  return (
    <div className="ui-card sa-empty-state" role={role}>
      <span className={`at-tile at-tile--${tone}`} aria-hidden="true">{icon}</span>
      <h3 className="sa-empty-title">{title}</h3>
      {detail && <p className="sa-empty-detail">{detail}</p>}
      {action && <div className="sa-empty-action">{action}</div>}
    </div>
  );
}

export function Empty({ icon, title, detail, action }) {
  return <StateCard icon={icon || <Info size={20} />} title={title} detail={detail} action={action} />;
}

export function Failed({ error, onRetry }) {
  const denied = error?.status === 401 || error?.status === 403;
  return (
    <StateCard
      role="alert"
      tone="rose"
      icon={denied ? <Lock size={20} /> : <AlertTriangle size={20} />}
      title={denied ? 'Not permitted' : 'That did not load'}
      detail={error?.message || 'The server did not answer.'}
      // A retry on a permission failure just fails again; signing in is the
      // only thing that helps, and the shell handles that.
      action={!denied && onRetry && (
        <button type="button" className="btn-secondary at-btn-sm" onClick={onRetry}>
          <RotateCw size={14} /> Try again
        </button>
      )}
    />
  );
}

/**
 * The five states, once.
 *
 * `isEmpty` is a predicate rather than a boolean so a screen can say what empty
 * means for it -- an empty array, a zero count, a missing key -- without
 * computing it before the data has arrived.
 */
export function Async({ state, isEmpty, empty, children, skeletonRows }) {
  if (state.loading && state.data === null) return <Skeleton rows={skeletonRows} />;
  if (state.error) return <Failed error={state.error} onRetry={state.reload} />;
  if (state.data === null) return <Skeleton rows={skeletonRows} />;
  if (isEmpty && isEmpty(state.data)) return empty || <Empty title="Nothing here yet." />;
  return children(state.data);
}

/* -------------------------------------------------------------- confirm */

/**
 * A modal confirmation for anything destructive.
 *
 * `requireReason` is what makes the audit trail worth having: the console
 * records a reason on suspensions and module changes, and a free-text box the
 * administrator must fill is the only place that reason can come from.
 */
export function Confirm({ open, title, body, confirmLabel = 'Confirm', danger, requireReason,
                          onConfirm, onCancel, busy }) {
  const [reason, setReason] = useState('');
  // A fresh reason every time the dialog opens, set while rendering rather
  // than in an effect so the stale one is never drawn.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setReason('');
  }
  useEscape(Boolean(open), () => { if (!busy) onCancel(); });
  if (!open) return null;

  const blocked = busy || (requireReason && reason.trim().length < 3);

  return (
    <FormModal
      icon={danger ? AlertTriangle : undefined}
      tone={danger ? 'rose' : 'neutral'}
      title={title}
      onClose={busy ? undefined : onCancel}
      width="460px"
      // Above a console Modal (1200): Modules confirms over its features dialog.
      zIndex={1300}
      // Marks the dialog as a Confirm, so on a phone it is a sheet as tall as
      // its content rather than a full-height page (superadmin.css).
      bodyClassName="sa-confirm-body"
      footer={(
        <>
          <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="button" className={danger ? 'btn-secondary at-btn-danger' : 'btn-primary'}
            onClick={() => onConfirm(reason.trim())} disabled={blocked}>
            {busy ? 'Working…' : confirmLabel}
          </button>
        </>
      )}
    >
      {body && <div className="sa-dialog-text">{body}</div>}
      {requireReason && (
        <Field label="Reason (recorded in the audit log)" htmlFor="sa-reason">
          <input id="sa-reason" type="text" value={reason} autoFocus maxLength={LIMITS.reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why are you doing this?" />
        </Field>
      )}
    </FormModal>
  );
}

/* ---------------------------------------------------------------- table */

const cellLabel = (c) => c.dataLabel ?? (typeof c.label === 'string' ? c.label : undefined);

/**
 * The workspace table: .at-table-wrap > table.at-table.at-table--fit, every
 * cell labelled with its column (data-label) so it stacks into a card below
 * 1024px. Columns: { key, label, numeric?, render?, className?, dataLabel? }.
 * A clickable row is also reachable from the keyboard (Tab, then Enter/Space).
 */
export function Table({ columns, rows, keyFor, empty, onRowClick, rowClassName }) {
  if (!rows.length) return empty || <Empty title="No rows." />;
  return (
    <div className="at-table-wrap">
      <table className="at-table at-table--fit">
        <thead>
          <tr>{columns.map((c) => (
            <th key={c.key} scope="col"
              className={[c.numeric && 'sa-num', c.className].filter(Boolean).join(' ') || undefined}>
              {c.label}
            </th>
          ))}</tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const classes = [onRowClick && 'sa-clickable', rowClassName && rowClassName(row)]
              .filter(Boolean).join(' ');
            return (
              <tr key={keyFor ? keyFor(row, i) : i}
                className={classes || undefined}
                tabIndex={onRowClick ? 0 : undefined}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={onRowClick ? (e) => {
                  if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    onRowClick(row);
                  }
                } : undefined}>
                {columns.map((c) => (
                  <td key={c.key} data-label={cellLabel(c) || undefined}
                    className={[c.numeric && 'at-num sa-num', c.className].filter(Boolean).join(' ') || undefined}>
                    {c.render ? c.render(row) : row[c.key]}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** First, last, and the pages either side of the current one, with gaps. */
const pageNumbers = (page, pages) => {
  const list = [...new Set([1, page - 1, page, page + 1, pages])]
    .filter((n) => n >= 1 && n <= pages)
    .sort((a, b) => a - b);
  return list.flatMap((n, i) => (i && n - list[i - 1] > 1 ? [`gap-${n}`, n] : [n]));
};

export function Pager({ page, pages, onPage, total }) {
  if (pages <= 1) {
    return total ? (
      <nav className="at-pager" aria-label="Pages">
        <span className="at-pager-size">{count(total)} rows</span>
      </nav>
    ) : null;
  }
  return (
    <nav className="at-pager" aria-label="Pages">
      <span className="at-pager-size">
        Page {page} of {pages}{total !== undefined && ` · ${count(total)} rows`}
      </span>
      <div className="at-pager-pages">
        <button type="button" className="btn-secondary at-btn-sm" disabled={page <= 1}
          onClick={() => onPage(page - 1)}>
          <ArrowLeft size={14} /> Previous
        </button>
        {pageNumbers(page, pages).map((n) => (typeof n === 'string'
          ? <span key={n} className="at-pager-gap" aria-hidden="true">…</span>
          : (
            <button key={n} type="button" aria-current={n === page ? 'page' : undefined}
              className={`at-pager-num${n === page ? ' at-pager-num--on' : ''}`}
              onClick={() => onPage(n)}>
              {n}
            </button>
          )))}
        <button type="button" className="btn-secondary at-btn-sm" disabled={page >= pages}
          onClick={() => onPage(page + 1)}>
          Next <ArrowRight size={14} />
        </button>
      </div>
    </nav>
  );
}

/**
 * A search box that does not fire a request per keystroke.
 *
 * 350ms: long enough that typing a word is one request, short enough that it
 * does not feel broken. The timer is cleared on unmount so a screen change
 * mid-type cannot fire a search into a component that is gone. The workspace
 * look (.at-search), plus a clear button.
 */
export function SearchBox({ value, onChange, placeholder = 'Search…', delay = 350, label }) {
  const [local, setLocal] = useState(value || '');
  const timer = useRef(null);

  // Follow the parent when it changes the value (a cleared filter, a new
  // route), set while rendering rather than in an effect.
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    setLocal(value || '');
  }
  useEffect(() => () => clearTimeout(timer.current), []);

  const change = (next) => {
    setLocal(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => onChange(next), delay);
  };

  return (
    <div className="at-search sa-search">
      <Search size={15} aria-hidden="true" />
      <input type="search" value={local} placeholder={placeholder} aria-label={label || placeholder}
        onChange={(e) => change(e.target.value)} />
      {local && (
        <button type="button" className="at-icon-btn sa-search-clear" aria-label="Clear"
          onClick={() => { clearTimeout(timer.current); setLocal(''); onChange(''); }}>
          <X size={14} />
        </button>
      )}
    </div>
  );
}

/**
 * A native select. Defaults to the workspace toolbar filter (36px); pass
 * className="form-control" for a full-size select inside a <Field>.
 */
export function Select({ value, onChange, options, label, className = 'form-control at-filter', id, disabled }) {
  return (
    <select id={id} className={className} value={value} disabled={disabled}
      onChange={(e) => onChange(e.target.value)} aria-label={label}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

/**
 * The workspace filter chips with the <select> contract the filters they
 * replaced had: picking the chip that is already on changes nothing (the
 * workspace Chips reports every click, which refetched and reset the page),
 * and `label` names the group for a screen reader, as the select's did.
 * options: [{ key, label, count? }].
 */
export function Chips({ options, value, onChange, label }) {
  return (
    <WorkspaceChips options={options} value={value} ariaLabel={label}
      onChange={(key) => { if (key !== value) onChange(key); }} />
  );
}

/* ----------------------------------------------------------------- misc */

const STAT_TONE = { off: 'rose', warn: 'amber', ok: 'neutral', info: 'neutral', muted: 'neutral' };

/**
 * A workspace StatCard. `note` is the line under the value (StatCard's `sub`).
 * tone 'off' -> rose tile, 'warn' -> amber tile; a flagged stat without its
 * own icon gets a warning glyph, because in Scaleezy the tile is the only
 * thing a tone changes and a tone with no tile would be invisible.
 */
export function Stat({ label, value, note, sub, tone, onClick, icon, trailing }) {
  const flagged = tone === 'off' || tone === 'warn';
  return (
    <StatCard icon={icon || (flagged ? AlertTriangle : undefined)} label={label} value={value}
      sub={note ?? sub} tone={STAT_TONE[tone] || tone || 'neutral'} onClick={onClick} trailing={trailing} />
  );
}

/** The grid a row of Stats sits in. */
export function StatGrid({ children, label }) {
  return <section className="at-stat-grid" aria-label={label}>{children}</section>;
}

/**
 * A sub-section heading on the page: the card-title type (18/600), an
 * optional line under it, and controls on the right. Not a page title --
 * every screen opens with one <PageHeader>.
 */
export function SectionHead({ title, subtitle, children }) {
  return (
    <div className="sa-section-head">
      <div className="sa-section-head-text">
        <h2 className="at-section-title">{title}</h2>
        {subtitle && <p className="at-section-sub">{subtitle}</p>}
      </div>
      {children && <div className="sa-inline">{children}</div>}
    </div>
  );
}

/**
 * A workspace section card (.at-section) whose header can carry any controls
 * (buttons, a Pill), not only SectionCard's single "View all" link. Body copy
 * inside is the workspace's 13px secondary; machine strings wrap.
 */
export function Card({ title, subtitle, icon, tone = 'neutral', actions, children, className = '' }) {
  return (
    <section className={`at-section ${className}`.trim()}>
      {(title || actions) && (
        <header className="at-section-head sa-card-head">
          <div className="at-section-heading">
            {icon && <IconTile icon={icon} tone={tone} size={38} iconSize={18} />}
            <div>
              {title && <h3 className="at-section-title">{title}</h3>}
              {subtitle && <div className="at-section-sub">{subtitle}</div>}
            </div>
          </div>
          {actions && <div className="sa-card-actions">{actions}</div>}
        </header>
      )}
      {children !== undefined && children !== null && children !== false && (
        <div className="sa-card-body">{children}</div>
      )}
    </section>
  );
}

const NOTE = {
  info: { className: 'at-note--neutral', icon: Info },
  warning: { className: 'at-note--amber', icon: AlertTriangle },
  error: { className: 'sa-note--danger', icon: AlertTriangle },
  success: { className: 'at-note--green', icon: CheckCircle2 },
};
const NOTE_ALIAS = { warn: 'warning', off: 'error', danger: 'error', ok: 'success', muted: 'info', neutral: 'info' };

/**
 * A banner in the flow of the page: the workspace note (.at-note). tone is
 * 'info' (grey), 'warning', 'error' (danger fill, announced) or 'success'.
 * `action` sits on the right (a button); `icon` replaces the tone's glyph.
 */
export function Note({ tone = 'info', title, icon, action, children, className = '' }) {
  const kind = NOTE[NOTE_ALIAS[tone] || tone] || NOTE.info;
  const Icon = icon || kind.icon;
  return (
    <div className={`at-note ${kind.className} sa-note ${className}`.trim()}
      role={kind === NOTE.error ? 'alert' : undefined}>
      <span className="at-note-icon" aria-hidden="true"><Icon size={18} strokeWidth={1.8} /></span>
      <div className="at-note-body">
        {title && <div className="at-note-title">{title}</div>}
        {children && <div className="at-note-text">{children}</div>}
      </div>
      {action && <div className="sa-note-action">{action}</div>}
    </div>
  );
}

/**
 * Tabs that are routes (Overview / Data, one tab per error kind): the
 * workspace tab strip, the current one raised and marked aria-current.
 * items: [{ key, label, count?, icon? }]. A count of null/undefined is hidden.
 */
export function Tabs({ items, value, onChange, ariaLabel }) {
  return (
    <nav className="tabs-header sa-tabs" aria-label={ariaLabel}>
      {items.map(({ key, label, count: n, icon: Icon }) => {
        const active = key === value;
        return (
          <button key={key} type="button" className={`tab-btn${active ? ' active' : ''}`}
            aria-current={active ? 'page' : undefined} onClick={() => onChange(key)}>
            {Icon && <Icon size={14} aria-hidden="true" />}
            {label}
            {n !== undefined && n !== null && n !== false && (
              <span className="sa-tab-count">{typeof n === 'number' ? count(n) : n}</span>
            )}
          </button>
        );
      })}
    </nav>
  );
}

/** A definition list: [[label, value], …]. Falsy entries are skipped. */
export function KeyValue({ items, className = '' }) {
  return (
    <dl className={`sa-kv ${className}`.trim()}>
      {items.filter(Boolean).map(([k, v], i) => (
        <div key={typeof k === 'string' ? k : i} className="sa-kv-row">
          <dt>{k}</dt>
          <dd>{v ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * A proportion bar: the workspace ProgressBar. Scaleezy draws every bar in
 * the brand colour, so `tone` is accepted for the old call sites but does not
 * colour it -- put the status beside the bar as a Pill.
 */
export function Meter({ pct }) {
  return <ProgressBar pct={pct} />;
}

/**
 * The workspace toolbar under the page head: filters/chips on the left,
 * search and selects in `right`.
 */
export function Toolbar({ children, right, className = '' }) {
  return (
    <div className={`at-toolbar ${className}`.trim()}>
      {children}
      {right && <div className="at-toolbar-right">{right}</div>}
    </div>
  );
}

/**
 * Says plainly that something is absent from the product rather than broken.
 *
 * Used wherever the specification asks for a screen this codebase has no data
 * for -- background jobs, payment gateways, request latency. Showing an empty
 * chart there would read as "nothing is wrong"; this reads as "nothing is
 * measured", which is the truth and is actionable.
 */
export function NotBuilt({ title, detail }) {
  return <StateCard icon={<Info size={20} />} title={title} detail={detail} />;
}

/* --------------------------------------------------------- one-time link */

/**
 * A credential-equivalent string, shown once, with a copy button.
 *
 * Used for the sign-in link an administrator hands to a boutique. Three
 * deliberate properties:
 *
 * It is never persisted by this client -- not in localStorage, not in a URL.
 * The component holds it in React state and it is gone on navigation, which is
 * the same lifetime the server gives it.
 *
 * Copy uses the clipboard API with a select-the-text fallback, because
 * navigator.clipboard is unavailable on a page served over plain http (this
 * console runs on localhost in development, where it happens to be allowed, and
 * over https in production -- but a self-hosted http deployment would silently
 * have no copy button at all, and a copy button that does nothing is worse than
 * none).
 *
 * The warning is not decoration. The holder of this link can set the password
 * on that account, so it wants a channel the administrator trusts.
 */
export function OneTimeLink({ value, expiresMinutes, note }) {
  const [copied, setCopied] = useState(false);
  const field = useRef(null);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // No clipboard permission, or an insecure origin. Select it instead so
      // the administrator can copy by hand rather than being stuck.
      field.current?.select();
    }
  };

  return (
    <div className="sa-onetime">
      <div className="sa-onetime-row">
        <input ref={field} type="text" className="form-control sa-mono" readOnly value={value}
          onFocus={(e) => e.target.select()} aria-label="One-time sign-in link" />
        <button type="button" className="btn-primary" onClick={copy}>
          {copied ? <><Check size={16} /> Copied</> : <><Copy size={16} /> Copy</>}
        </button>
      </div>
      <Note tone="warning">
        Anyone holding this link can set the password on that account. Send it
        over a channel you trust, and only to the person it belongs to.
        {expiresMinutes ? ` It stops working in ${expiresMinutes} minutes` : ''}
        {expiresMinutes ? ', and the moment it is used.' : ''}
        {note ? ` ${note}` : ''}
      </Note>
      <p className="sa-onetime-note">
        <Lock size={14} aria-hidden="true" />
        <span>
          Shown once. It is not stored by this console and not written to the
          audit log — only the fact that you issued it is recorded.
        </span>
      </p>
    </div>
  );
}
