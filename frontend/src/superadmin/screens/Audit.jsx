/**
 * The audit trail: who did what, to what, and why they said they were doing it.
 *
 * Read-only, and the note at the top of the screen says so out loud rather than
 * leaving it to be inferred from the absence of a delete button. The claim is
 * scoped carefully: the console exposes no write route (superadmin.api_views
 * has a GET and nothing else), and the table is written by superadmin.audit
 * .record alone. That is append-only by convention and by API surface, not by a
 * database grant -- Postgres can be told to refuse UPDATE and DELETE here, and
 * has not been. Saying "append-only" without that qualifier would be a stronger
 * promise than the code keeps.
 *
 * Everything is filtered and paged server-side, including free text. The
 * interesting queries on this table are all "what did this person do" and "what
 * happened to this boutique", and both are indexed columns.
 */

import { Fragment, useCallback, useState } from 'react';
import { ChevronDown, ChevronRight, ScrollText, X } from 'lucide-react';

import { consoleApi } from '../api';
import {
  Async, Card, Empty, Note, PageHeader, Pager, SearchBox, Select, Toolbar, moment, useApi,
} from '../ui';

const PAGE_SIZE = 50;

/** JSON as one line a human can scan, rather than as pretty-printed prose. */
const show = (value) => {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return value || '""';
  if (Array.isArray(value)) return value.length ? value.join(', ') : '(empty)';
  return JSON.stringify(value);
};

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * What changed, rather than the two objects it changed between.
 *
 * before/after are free-form JSON on this model -- a dict of module switches, a
 * bare setting value, `{ok, result}` from a user action -- so a changed-key
 * table is only possible when both sides are objects. When they are not, the
 * pair is shown side by side, which is the honest fallback: better a small
 * amount of JSON than a diff that quietly invents structure.
 */
function Diff({ before, after }) {
  if (before === null && after === null) {
    return (
      <p className="sa-muted">
        This action recorded no before/after state — the reason is the whole record of it.
      </p>
    );
  }

  if (!isPlainObject(before) || !isPlainObject(after)) {
    // at-grid-3's narrower floor (280px) is deliberate: inside a stacked
    // table cell on a phone a 320px floor would overflow the card.
    return (
      <div className="at-grid-3">
        <Card title="Before">
          <pre className="sa-code sa-code--wrap">{show(before)}</pre>
        </Card>
        <Card title="After">
          <pre className="sa-code sa-code--wrap">{show(after)}</pre>
        </Card>
      </div>
    );
  }

  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((key) => !same(before[key], after[key]))
    .sort();

  if (keys.length === 0) {
    return (
      <p className="sa-muted">
        Nothing changed. The request was recorded because it was made, not because it had an
        effect — which is itself worth knowing.
      </p>
    );
  }

  return (
    <div className="at-table-wrap">
      <table className="at-table at-table--fit">
        <thead>
          <tr>
            <th scope="col">Field</th>
            <th scope="col">Before</th>
            <th scope="col">After</th>
          </tr>
        </thead>
        <tbody>
          {keys.map((key) => (
            <tr key={key}>
              <td data-label="Field"><span className="at-row-title">{key}</span></td>
              <td data-label="Before">
                {key in before
                  ? <span className="sa-schema sa-text-off">{show(before[key])}</span>
                  : <span className="sa-muted">not set</span>}
              </td>
              <td data-label="After">
                {key in after
                  ? <span className="sa-schema sa-text-ok">{show(after[key])}</span>
                  : <span className="sa-muted">removed</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Audit() {
  const [filters, setFilters] = useState({ actor: '', action: '', boutique: '', q: '', page: 1 });
  const [open, setOpen] = useState(null);

  const state = useApi(
    useCallback(() => consoleApi.audit({ ...filters, page_size: PAGE_SIZE }), [filters]),
    [filters],
  );

  // Any filter change goes back to page 1: page 3 of the old result set is a
  // different set of rows.
  const set = (patch) => setFilters((f) => ({ ...f, page: 1, ...patch }));
  const anyFilter = Boolean(filters.actor || filters.action || filters.boutique || filters.q);
  const clear = () => setFilters({ actor: '', action: '', boutique: '', q: '', page: 1 });

  const isEmpty = (d) => d.count === 0 && !anyFilter;
  // The toolbar sits outside <Async> so the search box is always on screen,
  // as it was in the page header. The action filter and the filter chips are
  // drawn exactly when <Async> draws its children -- loaded, not failed, not
  // the empty trail -- which is where they used to live.
  const loaded = Boolean(state.data) && !state.error && !isEmpty(state.data);

  return (
    <>
      <PageHeader
        title="What admins did"
        subtitle="Every action taken from this console — who, when, to which boutique, and the reason they typed."
      />

      <Note tone="info">
        This trail is append-only: it is written by one function on the server and the console
        offers no route that edits or deletes an entry — a record the credential that took the
        action can rewrite is not an audit trail. That is enforced by the API surface and by
        convention, not by the database, which still permits an UPDATE from a Postgres session.
      </Note>

      <Toolbar
        right={(
          <>
            {/* Search first, then the select, as on every other screen. */}
            <SearchBox value={filters.q} onChange={(q) => set({ q })}
              placeholder="Actor, target, action or reason…" />
            {/* The action list comes from the server's own choices field, so a
                new action type appears in this dropdown without an edit here. */}
            {loaded && (
              <Select value={filters.action} onChange={(action) => set({ action })} label="Action"
                options={[{ value: '', label: 'All actions' }, ...state.data.actions]} />
            )}
          </>
        )}
      >
        {/* Both of these filter on an exact match server-side, which is
            why the rows below are clickable: typing a schema name exactly
            is a worse way to get one than clicking the one you can see.
            Free text is what `q` is for. */}
        {loaded && anyFilter && (
          <div className="sa-inline">
            {filters.actor && (
              <button type="button" className="btn-secondary at-btn-sm" onClick={() => set({ actor: '' })}>
                Actor: {filters.actor} <X size={14} />
              </button>
            )}
            {filters.boutique && (
              <button type="button" className="btn-secondary at-btn-sm" onClick={() => set({ boutique: '' })}>
                Boutique: {filters.boutique} <X size={14} />
              </button>
            )}
            <button type="button" className="btn-secondary at-btn-sm" onClick={clear}>Clear all filters</button>
          </div>
        )}
      </Toolbar>

      <Async
        state={state}
        isEmpty={isEmpty}
        empty={(
          <Empty icon={<ScrollText size={20} />} title="Nothing has been recorded yet."
            detail="Suspensions, module changes, feature flags, user actions, password resets and
                    console sign-ins all land here the moment one happens." />
        )}
      >
        {(data) => (data.entries.length === 0 ? (
          <Empty title="No entry matches those filters."
            detail="The trail is not empty — these filters are just too narrow."
            action={(
              <button type="button" className="btn-secondary at-btn-sm" onClick={clear}>
                Clear the filters
              </button>
            )} />
        ) : (
          <>
            <div className="at-table-wrap">
              <table className="at-table at-table--fit">
                <thead>
                  <tr>
                    <th scope="col" />
                    <th scope="col">When</th>
                    <th scope="col">Who</th>
                    <th scope="col">What</th>
                    <th scope="col">Target</th>
                    <th scope="col">Boutique</th>
                    <th scope="col">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {data.entries.map((entry) => {
                    const expanded = open === entry.id;
                    const toggle = () => setOpen(expanded ? null : entry.id);
                    return (
                      <Fragment key={entry.id}>
                        <tr className="sa-clickable" tabIndex={0} aria-expanded={expanded}
                          onClick={toggle}
                          onKeyDown={(e) => {
                            if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                              e.preventDefault();
                              toggle();
                            }
                          }}>
                          <td className="sa-expand-cell">
                            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </td>
                          <td data-label="When" className="sa-nowrap">
                            {moment(entry.created_at)}
                          </td>
                          <td data-label="Who">
                            <button type="button" className="at-link"
                              onClick={(e) => { e.stopPropagation(); set({ actor: entry.actor }); }}>
                              {entry.actor || <span className="sa-muted">no actor</span>}
                            </button>
                            {entry.ip && <div className="sa-schema">{entry.ip}</div>}
                          </td>
                          <td data-label="What"><div className="at-row-title">{entry.action_label}</div></td>
                          <td data-label="Target">
                            {entry.target
                              ? <span className="sa-schema">{entry.target}</span>
                              : <span className="sa-muted">—</span>}
                          </td>
                          <td data-label="Boutique">
                            {entry.boutique ? (
                              <button type="button" className="at-link sa-mono"
                                onClick={(e) => { e.stopPropagation(); set({ boutique: entry.boutique }); }}>
                                {entry.boutique}
                              </button>
                            ) : <span className="sa-muted">—</span>}
                          </td>
                          {/* The reason is the only part of a row that was
                              typed by a person, so it gets room rather than a
                              tooltip. Blank is stated, not left as a gap: the
                              API requires a reason on the destructive actions
                              and not on the rest. */}
                          <td data-label="Reason">
                            {entry.reason || <span className="sa-muted">none given</span>}
                          </td>
                        </tr>

                        {expanded && (
                          <tr className="sa-detail-row">
                            <td colSpan={7}>
                              <Diff before={entry.before} after={entry.after} />
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
        ))}
      </Async>
    </>
  );
}
