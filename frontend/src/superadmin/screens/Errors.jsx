/**
 * The Error Center: one row per distinct crash, not one per occurrence.
 *
 * Scoped to kind='crash' and nothing else. ErrorEvent now also holds handled
 * exceptions, refusals by a platform control, deliberate 4xx and frontend
 * crashes -- the last two by the thousand -- and they live next door on the
 * Error Handling screen. The API defaults to crashes precisely so this screen
 * did not have to change to stay what it is; if it is ever given a `kind`
 * filter, that decision is being reversed.
 *
 * The server groups by fingerprint (exception class + normalised path + the
 * last in-project frame), so `count` is the number of times this one bug has
 * fired and the feed shows fifty problems rather than the same problem fifty
 * times. That is the whole design of superadmin.models.ErrorEvent, and this
 * screen is only useful if it makes the grouping obvious -- hence the count in
 * its own wide column and first/last seen next to it, rather than a timestamp
 * per row that would read like a log tail.
 *
 * Every filter and the page go to the server. This table is the one in the
 * console most likely to run to thousands of rows, and it is the one someone
 * opens when the platform is already unwell -- fetching all of it to filter in
 * the browser is exactly the wrong time to be doing that.
 */

import { Fragment, useCallback, useState } from 'react';
import {
  Bug, ChevronDown, ChevronRight, Database, FileWarning, ShieldCheck, X,
} from 'lucide-react';

import { consoleApi } from '../api';
import { LIMITS } from '../../services/validate';
import {
  Async, Chips, Confirm, Empty, Field, KeyValue, Note, PageHeader, Pager, Pill, SearchBox, Select,
  Stat, StatGrid, Toolbar, count, moment, since, useApi, useToast,
} from '../ui';

const PAGE_SIZE = 25;

/** Status chips. The keys are the filter values the server takes; '' is all. */
const STATUSES = [
  { key: '', label: 'All' },
  { key: 'new', label: 'New' },
  { key: 'acknowledged', label: 'Acknowledged' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'ignored', label: 'Ignored' },
];

const SEVERITIES = [
  { value: '', label: 'All severities' },
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

/**
 * The four transitions the server accepts, and what each one actually means.
 *
 * `confirm` is present exactly where the move takes a live problem off the
 * feed, because those are the two the audit log needs a reason for. Acknowledge
 * and Reopen only say who is looking, and a modal in front of those would train
 * people to dismiss modals.
 *
 * The wording is not decoration: core/exceptions.py reopens a *resolved* error
 * on the next occurrence and deliberately leaves an *ignored* one alone, so
 * "resolve" and "ignore" behave differently in a way nobody can guess from the
 * button.
 */
const MOVES = [
  {
    value: 'acknowledged',
    label: 'Acknowledge',
    already: 'Someone has already acknowledged this.',
  },
  {
    value: 'resolved',
    label: 'Resolve',
    already: 'This is already resolved.',
    confirm: {
      title: 'Resolve this error?',
      body: 'Your name and the time are recorded against it. If the same bug fires again the '
        + 'server reopens it as New and keeps that resolution visible, so the feed reads '
        + '"closed on the 1st, back on the 12th" rather than quietly staying green.',
      confirmLabel: 'Resolve',
    },
  },
  {
    value: 'ignored',
    label: 'Ignore',
    already: 'This is already ignored.',
    confirm: {
      title: 'Ignore this error permanently?',
      danger: true,
      body: 'Ignored is a standing decision, not a snooze: the count keeps rising but a new '
        + 'occurrence will never reopen it and it stays out of the unresolved badge. Nobody '
        + 'will be told about this bug again unless someone reopens it here.',
      confirmLabel: 'Ignore it',
    },
  },
  { value: 'new', label: 'Reopen', already: 'This error is already open.' },
];

/** The in-project frames, or an honest sentence about why there are none. */
function Traceback({ text }) {
  if (!text) {
    return (
      <p className="sa-muted">
        No frames from this codebase were captured — the exception was raised entirely inside
        Django or a library, so there is nothing here that a diff would explain.
      </p>
    );
  }
  return <pre className="sa-code">{text}</pre>;
}

export default function Errors({ route, onBadges }) {
  const toast = useToast();
  const [filters, setFilters] = useState({ status: '', severity: '', boutique: '', q: '', page: 1 });
  const [open, setOpen] = useState(null);
  const [pending, setPending] = useState(null);
  const [busy, setBusy] = useState(false);

  const state = useApi(
    useCallback(() => consoleApi.errors({ ...filters, page_size: PAGE_SIZE }), [filters]),
    [filters],
  );

  // Every filter change goes back to page 1. Page 4 of the previous result set
  // is a different set of rows, and usually no rows at all.
  const set = (patch) => setFilters((f) => ({ ...f, page: 1, ...patch }));
  const anyFilter = Boolean(filters.status || filters.severity || filters.boutique || filters.q);
  const clear = () => setFilters({ status: '', severity: '', boutique: '', q: '', page: 1 });

  const isEmpty = (d) => d.count === 0 && !anyFilter;
  // The stats sit above the toolbar, outside <Async>, but are drawn exactly
  // when <Async> draws its children -- loaded, not failed, not the empty feed
  // -- which is where they used to live.
  const loaded = Boolean(state.data) && !state.error && !isEmpty(state.data);
  const summary = loaded ? state.data.summary : null;

  const move = async (error, status, reason = '') => {
    setBusy(true);
    try {
      await consoleApi.updateError(error.id, { status, reason });
      toast(`${error.exception_type} marked ${status === 'new' ? 'open' : status}.`);
      setPending(null);
      // The navigation badge counts unresolved errors, so it is stale the
      // instant this returns until something asks the server again.
      if (onBadges) onBadges();
      state.reload();
    } catch (e) {
      toast(e.message, 'off');
    } finally {
      setBusy(false);
    }
  };

  const saveNotes = async (error, notes) => {
    try {
      await consoleApi.updateError(error.id, { notes });
      // Patched in place rather than reloaded: the feed is ordered by last seen
      // and a reload would move the row out from under whoever just typed in it.
      error.notes = notes;
      toast('Note saved.');
    } catch (e) {
      toast(e.message, 'off');
    }
  };

  return (
    <>
      <PageHeader
        title="Crashes"
        subtitle="Requests that failed outright and showed someone an error. Everything the product recovered from is under Other errors."
      />

      {summary && (
        <>
          <StatGrid>
            <Stat icon={FileWarning} label="Unresolved" value={count(summary.unresolved)}
              tone={summary.unresolved > 0 ? 'warn' : undefined}
              note="Whole feed, ignoring the filters" />
            <Stat icon={Database} label="Critical & open" value={count(summary.critical)}
              tone={summary.critical > 0 ? 'off' : undefined}
              note="Database errors only" />
            <Stat icon={Bug} label="Distinct bugs" value={count(state.data.count)}
              note={anyFilter ? 'Matching these filters' : 'Every bug ever recorded'} />
          </StatGrid>

          {summary.critical > 0 && (
            <Note tone="error">
              {count(summary.critical)} critical error
              {summary.critical === 1 ? ' is' : 's are'} open. Critical is set only for a
              database error — either a constraint the code does not know about, so writes are
              being lost, or the database itself, which in this single-database deployment is
              every boutique at once.
            </Note>
          )}
        </>
      )}

      {/* Outside <Async>, as the filters always were: a filter that makes the
          server fail must stay on screen so it can be changed back. */}
      <Toolbar
        right={(
          <>
            <SearchBox value={filters.q} onChange={(q) => set({ q })}
              placeholder="Exception, message or path…" />
            <Select value={filters.severity} onChange={(severity) => set({ severity })}
              label="Severity" options={SEVERITIES} />
          </>
        )}
      >
        <Chips label="Status" options={STATUSES} value={filters.status}
          onChange={(status) => set({ status })} />
        {filters.boutique && (
          <div className="sa-inline">
            <span className="at-row-sub">Only errors last seen in</span>
            <span className="sa-schema">{filters.boutique}</span>
            <button type="button" className="btn-secondary at-btn-sm" onClick={() => set({ boutique: '' })}>
              Clear <X size={14} />
            </button>
          </div>
        )}
      </Toolbar>

      <Async
        state={state}
        isEmpty={isEmpty}
        empty={(
          <Empty
            icon={<ShieldCheck size={20} />}
            title="Nothing has crashed."
            detail="Every unhandled 500 in this project is captured with a fingerprint, a count
                    and its in-project stack frames. An empty feed means there is nothing to
                    capture, not that nothing is watching — but it is not a clean bill of
                    health either: a failure the code caught and carried on from never
                    reaches this screen. Those are under Other errors."
            action={(
              <button type="button" className="btn-secondary at-btn-sm" onClick={() => route.go('handling')}>
                Open Other errors
              </button>
            )}
          />
        )}
      >
        {(data) => (
          <>
            {data.errors.length === 0 ? (
              <Empty
                icon={<Bug size={20} />}
                title="No error matches those filters."
                detail="The feed is not empty — these filters are just too narrow."
                action={(
                  <button type="button" className="btn-secondary at-btn-sm" onClick={clear}>
                    Clear the filters
                  </button>
                )}
              />
            ) : (
              <>
                <div className="at-table-wrap">
                  <table className="at-table at-table--fit">
                    <thead>
                      <tr>
                        <th scope="col" />
                        <th scope="col">Bug</th>
                        <th scope="col">Severity</th>
                        <th scope="col">Status</th>
                        <th scope="col" className="sa-num">Occurrences</th>
                        <th scope="col">First seen</th>
                        <th scope="col">Last seen</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.errors.map((e) => {
                        const expanded = open === e.id;
                        const toggle = () => setOpen(expanded ? null : e.id);
                        const last = since(e.last_seen);
                        // The server has this capped, so it is a floor on the
                        // distinct boutiques rather than the total. Missing
                        // entirely on an older payload, hence the fallback.
                        const seenIn = e.boutiques || [];
                        return (
                          // A detail row is a second <tr>, so the pair is wrapped
                          // rather than nested -- a <div> between <tbody> and <tr>
                          // is not valid table markup and browsers hoist it out.
                          <Fragment key={e.id}>
                            <tr className="sa-clickable" tabIndex={0} aria-expanded={expanded}
                              onClick={toggle}
                              onKeyDown={(ev) => {
                                if (ev.target === ev.currentTarget && (ev.key === 'Enter' || ev.key === ' ')) {
                                  ev.preventDefault();
                                  toggle();
                                }
                              }}>
                              <td className="sa-expand-cell">
                                {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                              </td>
                              <td data-label="Bug">
                                <div className="at-row-title">{e.exception_type}</div>
                                {/* at-row-sub, as on Other errors: the console
                                    lets it break inside a long URL or token. */}
                                <div className="at-row-sub">{e.message}</div>
                                <div className="sa-schema">
                                  {e.method} {e.path} · {e.status_code}
                                </div>
                              </td>
                              <td data-label="Severity"><Pill value={e.severity} /></td>
                              <td data-label="Status">
                                <Pill value={e.status} />
                                {e.resolved_by && (
                                  <div className="at-row-sub">
                                    {e.resolved_by}, {moment(e.resolved_at)}
                                  </div>
                                )}
                              </td>
                              {/* The count is the point of this table -- it is what
                                  separates a bug that fired once from the one
                                  breaking a boutique's checkout all morning. */}
                              <td data-label="Occurrences" className="at-num sa-num">
                                <strong>{count(e.count)}</strong>
                              </td>
                              <td data-label="First seen" className="sa-nowrap">
                                <div>{moment(e.first_seen)}</div>
                                <div className="at-row-sub">{since(e.first_seen).text}</div>
                              </td>
                              {/* Inverted against every other screen on purpose:
                                  a boutique that ordered today is healthy, a bug
                                  that fired today is not. */}
                              <td data-label="Last seen" className="sa-nowrap">
                                <Pill value={last.tone === 'ok' ? 'warning' : 'healthy'}
                                  label={last.text} />
                                <div className="at-row-sub">{moment(e.last_seen)}</div>
                              </td>
                            </tr>

                            {expanded && (
                              <tr className="sa-detail-row">
                                <td colSpan={7}>
                                  <div className="at-stack">
                                    <Traceback text={e.traceback} />

                                    <KeyValue items={[
                                      ['Seen in', seenIn.length === 0 ? (
                                        <span className="sa-muted">
                                          No boutique — this fired on a public-schema request.
                                        </span>
                                      ) : (
                                        <>
                                          <div className="sa-inline">
                                            {seenIn.map((schema) => (
                                              <button key={schema} type="button"
                                                className="btn-secondary at-btn-sm sa-mono"
                                                onClick={() => set({ boutique: schema })}>
                                                {schema}
                                              </button>
                                            ))}
                                          </div>
                                          <div className="at-row-sub">
                                            {count(seenIn.length)} boutique(s), and the list is
                                            capped server-side — read it as a floor, not a total.
                                          </div>
                                        </>
                                      )],
                                      ['Most recent occurrence', (
                                        <>
                                          {e.boutique ? (
                                            <button type="button" className="at-link sa-mono"
                                              onClick={() => route.go(`boutiques/${e.boutique}`)}>
                                              {e.boutique}
                                            </button>
                                          ) : <span className="sa-muted">public schema</span>}
                                          {e.username && <span className="sa-muted"> · as {e.username}</span>}
                                        </>
                                      )],
                                      ['Fingerprint', <span className="sa-schema">{e.fingerprint}</span>],
                                    ]} />

                                    <Field label="Internal notes" htmlFor={`note-${e.id}`}>
                                      <textarea id={`note-${e.id}`} className="form-control" maxLength={LIMITS.note}
                                        defaultValue={e.notes} placeholder="What you found, what you tried…"
                                        // Saved on blur, not per keystroke: one
                                        // PATCH when the writer moves on.
                                        onBlur={(ev) => {
                                          if (ev.target.value !== e.notes) saveNotes(e, ev.target.value);
                                        }} />
                                    </Field>

                                    <div className="sa-inline">
                                      {MOVES.map((m) => (
                                        <button key={m.value} type="button"
                                          className={`btn-secondary at-btn-sm${m.confirm?.danger ? ' at-btn-danger' : ''}`}
                                          disabled={busy || e.status === m.value}
                                          title={e.status === m.value ? m.already : undefined}
                                          onClick={() => (m.confirm
                                            ? setPending({ error: e, move: m })
                                            : move(e, m.value))}>
                                          {m.label}
                                        </button>
                                      ))}
                                      {/* Every button above is either live or
                                          disabled with its reason in the tooltip;
                                          this repeats the reason in text, because
                                          a tooltip is not an explanation on a
                                          touch screen. */}
                                      <span className="at-row-sub">
                                        {MOVES.find((m) => m.value === e.status)?.already}
                                      </span>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <Pager page={data.page} pages={data.pages} total={data.count}
                  onPage={(page) => { setOpen(null); setFilters((f) => ({ ...f, page })); }} />
              </>
            )}
          </>
        )}
      </Async>

      <Confirm
        open={Boolean(pending)}
        requireReason
        busy={busy}
        danger={pending?.move.confirm.danger}
        title={pending?.move.confirm.title}
        body={pending && (
          <>
            <div className="sa-schema">
              {pending.error.exception_type} at {pending.error.path}
            </div>
            <div className="at-row-sub">{count(pending.error.count)} occurrence(s)</div>
            <p>{pending.move.confirm.body}</p>
          </>
        )}
        confirmLabel={pending?.move.confirm.confirmLabel}
        onCancel={() => setPending(null)}
        onConfirm={(reason) => move(pending.error, pending.move.value, reason)}
      />
    </>
  );
}
