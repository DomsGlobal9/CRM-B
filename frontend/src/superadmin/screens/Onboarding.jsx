/**
 * How far every boutique has actually got with setting itself up.
 *
 * The list is sorted so the boutiques somebody should ring are at the top, and
 * the ordering encodes two decisions the server already made and this screen
 * must not contradict:
 *
 * An unreadable schema sorts FIRST and never shows a percentage. `readable:
 * false` and `0%` look identical on a progress bar and mean opposite things --
 * "this boutique has done nothing" versus "we could not look" -- and only one
 * of them is a job for an engineer rather than for whoever chases signups.
 *
 * A suspended boutique sorts LAST. superadmin/onboarding.py reports it as
 * `blocked` precisely because its unfinished steps are not work it failed to
 * do: TenantHeaderMiddleware refuses it, so it could not have done them.
 * Putting it in the middle of the queue by percentage would send someone to
 * chase a boutique that the platform itself switched off.
 */

import { Fragment, useCallback, useMemo, useState } from 'react';
import {
  Building2, Check, CheckCircle2, ChevronDown, ChevronRight, CircleDashed, DatabaseZap, Hourglass,
  Minus, Sparkles, X,
} from 'lucide-react';

import { consoleApi } from '../api';
import {
  Async, Card, Empty, Meter, Note, PageHeader, Pill, SearchBox, Select, Stat, StatGrid, Toolbar, count,
  day, useApi,
} from '../ui';

/** Sort order: loudest finding first, the ones nobody should chase last. */
const RANK = {
  unreadable: 0,
  not_started: 1,
  in_progress: 2,
  almost_complete: 3,
  completed: 4,
  blocked: 5,
};

/** The progress filter. Eight options are too many for a chip row, so it is
 * a toolbar select beside the search. */
const PROGRESS = [
  { value: 'all', label: 'All boutiques' },
  { value: 'stuck', label: 'Still outstanding' },
  { value: 'unreadable', label: 'Unreadable' },
  { value: 'not_started', label: 'Not started' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'almost_complete', label: 'Almost complete' },
  { value: 'completed', label: 'Completed' },
  { value: 'blocked', label: 'Suspended' },
];

/** A row's status for sorting and filtering: an unreadable schema has none. */
const withStatus = (b) => ({ ...b, status: b.readable ? b.status : 'unreadable' });

/** Whether one boutique (status already from withStatus) passes the progress
 * filter. */
function inProgress(b, status) {
  if (status === 'all') return true;
  if (status === 'stuck') return b.status !== 'completed' && b.status !== 'blocked';
  return b.status === status;
}

/*
 * A step's glyph, from `state`. Never a red cross on `tracked: false`.
 *
 * Components rather than elements because a <Card> draws its icon in a
 * workspace tile (IconTile), which renders a lucide-style component at its own
 * size. The tick and the cross are the only coloured glyphs on the screen.
 */
const DoneMark = (props) => <Check {...props} className="sa-text-ok" />;
const TodoMark = (props) => <X {...props} className="sa-text-off" />;
const UnmeasuredMark = (props) => <Minus {...props} className="sa-muted" />;

function stepMark(step) {
  if (step.state === 'done') return DoneMark;
  if (step.state === 'todo') return TodoMark;
  // module_off and untracked both arrive with done: null. A cross against
  // something nothing can measure -- or something an administrator switched off
  // -- is an accusation, so both render grey.
  return UnmeasuredMark;
}

function stepPill(step) {
  if (step.state === 'module_off') return <Pill value="not_configured" label="Module off" />;
  if (step.state === 'untracked') return <Pill value="not_tracked" label="Not tracked" />;
  return undefined;
}

/**
 * The full checklist for one boutique, fetched only when its row is opened.
 *
 * A separate component so useApi has a stable schema to key on: the list
 * endpoint deliberately returns the summary rather than every step for every
 * boutique, and fetching fifty checklists to show one is fifty schema switches.
 */
function Checklist({ schema }) {
  const state = useApi(useCallback(() => consoleApi.onboardingFor(schema), [schema]));

  return (
    <Async state={state} skeletonRows={3}>
      {(data) => {
        if (!data.readable) {
          return <Note tone="error">{data.detail}</Note>;
        }
        return (
          <div className="at-stack">
            <Note tone="info" title={`${data.completed_steps} of ${data.tracked_steps} tracked steps.`}>
              {data.percent_basis}
            </Note>
            <div className="at-grid-3">
              {data.steps.map((step) => (
                <Card key={step.key} icon={stepMark(step)} title={step.label} actions={stepPill(step)}>
                  <p>{step.detail}</p>
                </Card>
              ))}
            </div>
          </div>
        );
      }}
    </Async>
  );
}

export default function Onboarding({ route }) {
  const [term, setTerm] = useState('');
  const [status, setStatus] = useState('all');
  const [open, setOpen] = useState(null);

  const state = useApi(useCallback(() => consoleApi.onboarding(), []));

  const rows = useMemo(() => {
    if (!state.data) return [];
    const needle = term.trim().toLowerCase();
    return state.data.boutiques
      .map(withStatus)
      .filter((b) => {
        if (!inProgress(b, status)) return false;
        if (!needle) return true;
        return `${b.name} ${b.owner_email} ${b.schema_name}`.toLowerCase().includes(needle);
      })
      .sort((a, b) => (RANK[a.status] ?? 9) - (RANK[b.status] ?? 9)
        || (a.percent ?? 0) - (b.percent ?? 0)
        || a.name.localeCompare(b.name));
  }, [state.data, term, status]);

  return (
    <>
      <PageHeader
        title="Setup progress"
        subtitle="How far each boutique has got with real use: their own customers, orders and staff. Sample data added at signup does not count."
      />

      <Async
        state={state}
        isEmpty={(d) => d.boutiques.length === 0}
        empty={<Empty icon={<Sparkles size={20} />} title="No boutiques have signed up yet."
          detail="Onboarding progress appears here as soon as one does." />}
      >
        {(data) => {
          const all = data.boutiques;
          const tally = (fn) => all.filter(fn).length;
          const notStarted = tally((b) => b.readable && b.status === 'not_started');
          const unreadable = tally((b) => !b.readable);
          return (
            <>
              <StatGrid label="Setup totals">
                <Stat icon={Building2} label="Boutiques" value={count(all.length)} />
                <Stat icon={CircleDashed} label="Not started" value={count(notStarted)}
                  tone={notStarted ? 'warn' : undefined} note="Zero of the tracked steps done" />
                <Stat icon={Hourglass} label="In progress"
                  value={count(tally((b) => b.readable && b.status === 'in_progress'))} />
                <Stat icon={CheckCircle2} label="Completed"
                  value={count(tally((b) => b.status === 'completed'))} />
                <Stat icon={DatabaseZap} label="Unreadable" value={count(unreadable)}
                  tone={unreadable ? 'off' : undefined}
                  note="Schema missing or half-migrated" />
              </StatGrid>

              <Toolbar right={(
                <>
                  <SearchBox value={term} onChange={setTerm} placeholder="Name, owner or schema…" />
                  <Select value={status} onChange={setStatus} label="Progress" options={PROGRESS} />
                </>
              )} />

              {rows.length === 0 ? (
                <Empty title="No boutique matches those filters."
                  detail="Clear the search or widen the progress filter." />
              ) : (
                <div className="at-table-wrap">
                  <table className="at-table at-table--fit">
                    <thead>
                      <tr>
                        <th scope="col" />
                        <th scope="col">Boutique</th>
                        <th scope="col">Progress</th>
                        <th scope="col">State</th>
                        <th scope="col">Waiting on</th>
                        <th scope="col">Signed up</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((b) => {
                        const expanded = open === b.schema_name;
                        const toggle = () => setOpen(expanded ? null : b.schema_name);
                        return (
                          // A detail row is a second <tr>, so the pair is wrapped
                          // rather than nested.
                          <Fragment key={b.schema_name}>
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
                              <td data-label="Boutique">
                                {/* stopPropagation, or opening a boutique also
                                    toggles the row underneath it. */}
                                <button type="button" className="at-link"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    route.go(`boutiques/${b.schema_name}`);
                                  }}>
                                  {b.name}
                                </button>
                                <div className="at-row-sub">{b.owner_email}</div>
                                <div className="sa-schema">{b.schema_name}</div>
                              </td>
                              <td data-label="Progress">
                                {b.readable ? (
                                  // The workspace's bar-and-percent recipe (the order
                                  // journey head): a fixed-width bar, the figure after it.
                                  <div className="od-progress">
                                    <span className="od-progress-bar"><Meter pct={b.percent} /></span>
                                    <span className="od-progress-pct">{b.percent}%</span>
                                  </div>
                                ) : (
                                  // Not 0%. The schema could not be read, which is a
                                  // different finding from a boutique that has done nothing.
                                  <span className="sa-muted">Not measured</span>
                                )}
                              </td>
                              <td data-label="State">
                                <div className="sa-inline">
                                  {b.readable
                                    ? <Pill value={b.status} />
                                    : <Pill value="warning" label="Unreadable" />}
                                  {!b.is_active && b.readable && <Pill value="suspended" />}
                                </div>
                              </td>
                              <td data-label="Waiting on">
                                {!b.readable ? (
                                  <span className="sa-muted">{b.detail}</span>
                                ) : b.blocked_on ? (
                                  <>
                                    <div className="at-row-title">{b.blocked_on.label}</div>
                                    {/* The detail is the entire point of this screen: the
                                        label says what is missing, this says why. */}
                                    <div className="at-row-sub">{b.blocked_on.detail}</div>
                                  </>
                                ) : (
                                  <span className="sa-muted">Nothing outstanding.</span>
                                )}
                              </td>
                              <td data-label="Signed up" className="sa-nowrap">
                                {day(b.created_on)}
                              </td>
                            </tr>
                            {expanded && (
                              <tr className="sa-detail-row">
                                <td colSpan={6}>
                                  <Checklist schema={b.schema_name} />
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          );
        }}
      </Async>
    </>
  );
}
