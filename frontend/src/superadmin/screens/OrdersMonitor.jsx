/**
 * What every boutique's order book is doing right now.
 *
 * The distribution panels are plain bars with a width, not a chart. This
 * project's dependencies are react, react-dom and lucide-react, and a
 * proportional bar is the workspace's own ProgressBar (the kit's <Meter>),
 * already used by the onboarding and messaging screens.
 *
 * The overdue count is the one number on this page that cannot be shown on its
 * own. superadmin/metrics.py ships a `caveat` string beside it precisely so the
 * frontend cannot render it bare: estimated_delivery defaults to order_date+15
 * days, so the count includes dates the system invented alongside dates a
 * boutique actually promised. It is an upper bound, and a console that prints
 * "14 overdue" without saying so has someone ringing customers about deadlines
 * nobody ever agreed to.
 *
 * Filtering is in the browser because the API returns every boutique in one
 * payload -- the server has already paid for the schema switches, and a second
 * request per filter would pay for them again.
 */

import { useCallback, useMemo, useState } from 'react';
import {
  Building2, CalendarClock, ClipboardList, CreditCard, ListChecks, MessageSquare, Scissors, ShoppingBag,
} from 'lucide-react';

import { consoleApi } from '../api';
import {
  Async, Card, Empty, Meter, Note, PageHeader, Pill, SearchBox, SectionHead, Select, Stat, StatGrid,
  Table, Toolbar, count, useApi,
} from '../ui';

/**
 * One bucket map as labelled bars.
 *
 * Zero-count buckets are kept, not filtered out: superadmin/metrics.py seeds the
 * known statuses so the panel's shape does not change as orders move, and a
 * column that vanishes when it hits zero is a column nobody can trust.
 */
function Breakdown({ icon, title, counts, note, labelFor = (key) => key }) {
  const entries = Object.entries(counts || {})
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const total = entries.reduce((n, [, value]) => n + value, 0);

  return (
    <Card icon={icon} title={title} subtitle={note}>
      {entries.length === 0 ? (
        <p className="sa-muted">No orders to distribute.</p>
      ) : (
        <dl className="sa-kv sa-kv--3">
          {entries.map(([label, value]) => (
            <div key={label} className="sa-kv-row">
              <dt>{label ? labelFor(label) : <span className="sa-muted">(none)</span>}</dt>
              <dd><Meter pct={total ? (100 * value) / total : 0} /></dd>
              <dd className="sa-num">{count(value)}</dd>
            </div>
          ))}
        </dl>
      )}
    </Card>
  );
}

/**
 * A production status or stage key (IN_PROGRESS, stitching_in_progress, ...)
 * in sentence case ('In progress', 'Stitching in progress'), the way order
 * status already reads. Any key the server adds later gets the same treatment
 * rather than showing raw.
 */
function productionLabel(key) {
  const words = key.replace(/_/g, ' ').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The "Show" filter. */
const SHOW = [
  { key: 'all', label: 'All' },
  { key: 'overdue', label: 'Has overdue orders' },
  { key: 'queued', label: 'Has queued messages' },
  { key: 'active', label: 'Active' },
  { key: 'suspended', label: 'Suspended' },
  { key: 'unreadable', label: 'Unreadable' },
];

/**
 * Whether one boutique passes the "Show" filter. One predicate for the table
 * and for each chip's count, so a count is always the rows that chip shows
 * (before the search narrows them).
 */
function shows(b, status) {
  if (status === 'active') return Boolean(b.is_active);
  if (status === 'suspended') return !b.is_active;
  if (status === 'unreadable') return !b.healthy;
  if (status === 'overdue') return b.overdue?.count > 0;
  if (status === 'queued') return b.queued_messages > 0;
  return true;
}

export default function OrdersMonitor({ route }) {
  const [term, setTerm] = useState('');
  const [status, setStatus] = useState('all');

  const state = useApi(useCallback(() => consoleApi.ordersMonitor(), []));

  const rows = useMemo(() => {
    if (!state.data) return [];
    const needle = term.trim().toLowerCase();
    return state.data.boutiques.filter((b) => {
      if (!shows(b, status)) return false;
      if (!needle) return true;
      return `${b.name} ${b.schema_name}`.toLowerCase().includes(needle);
    });
  }, [state.data, term, status]);

  const columns = [
    {
      key: 'boutique',
      label: 'Boutique',
      render: (b) => (
        <>
          <button type="button" className="at-link"
            onClick={() => route.go(`boutiques/${b.schema_name}`)}>
            {b.name}
          </button>
          <div className="sa-schema">{b.schema_name}</div>
          {!b.healthy && (
            <Pill value="warning" label="Unreadable" />
          )}
        </>
      ),
    },
    { key: 'orders', label: 'Orders', numeric: true, render: (b) => count(b.orders) },
    { key: 'today', label: 'Today', numeric: true, render: (b) => count(b.created?.today) },
    { key: 'week', label: 'This week', numeric: true, render: (b) => count(b.created?.week) },
    { key: 'month', label: 'This month', numeric: true, render: (b) => count(b.created?.month) },
    {
      key: 'overdue',
      label: <>Overdue<sup>*</sup></>,
      dataLabel: 'Overdue*',
      numeric: true,
      // Weight, not colour: the Overdue stat above already carries the flag,
      // and semantic colour is kept for badges.
      render: (b) => (b.overdue?.count
        ? <strong>{count(b.overdue.count)}</strong>
        : count(b.overdue?.count)),
    },
    {
      key: 'queued',
      label: 'Queued messages',
      numeric: true,
      render: (b) => (b.queued_messages ? (
        <button type="button" className="at-link" onClick={() => route.go('messaging')}>
          {count(b.queued_messages)}
        </button>
      ) : count(b.queued_messages)),
    },
    {
      key: 'stage',
      label: 'Busiest stage',
      render: (b) => {
        const stages = Object.entries(b.by_stage || {})
          .sort((x, y) => y[1] - x[1]);
        const busiest = stages.find(([, n]) => n > 0);
        return busiest
          ? <>{productionLabel(busiest[0])} <span className="sa-muted">({count(busiest[1])})</span></>
          : <span className="sa-muted">—</span>;
      },
    },
  ];

  return (
    <>
      <PageHeader
        title="Orders across boutiques"
        subtitle="Counts only: where orders are piling up, without opening anyone's order book."
      />

      <Async
        state={state}
        isEmpty={(d) => d.boutiques.length === 0}
        empty={<Empty icon={<ShoppingBag size={20} />} title="No boutiques on the platform yet."
          detail="Order figures appear here once a boutique signs up." />}
      >
        {(data) => {
          const totals = data.totals || {};
          const unreadable = data.boutiques.filter((b) => !b.healthy);
          // Every boutique carries the same server-side sentence; the first one
          // that has it is the platform's copy.
          const caveat = data.boutiques.find((b) => b.overdue?.caveat)?.overdue.caveat;

          return (
            <>
              <StatGrid label="Order totals">
                <Stat icon={ClipboardList} label="Orders" value={count(totals.orders)} />
                <Stat icon={CalendarClock} label="Overdue" value={count(totals.overdue)}
                  tone={totals.overdue ? 'warn' : undefined}
                  note="Upper bound — read the note below" />
                <Stat icon={MessageSquare} label="Queued messages" value={count(totals.queued_messages)}
                  note="Waiting to be sent"
                  onClick={() => route.go('messaging')} />
                <Stat icon={Building2} label="Boutiques" value={count(data.boutiques.length)}
                  note={`${count(data.boutiques.filter((b) => b.is_active).length)} active`} />
              </StatGrid>

              {caveat && (
                <Note tone="warning" title="Overdue is an upper bound.">
                  {caveat}
                </Note>
              )}

              {unreadable.length > 0 && (
                <Note tone="error">
                  {count(unreadable.length)} boutique schema(s) could not be read, so every total on this
                  page excludes them: {unreadable.map((b) => b.name).join(', ')}.
                </Note>
              )}

              <SectionHead title="Across the platform"
                subtitle="Every readable boutique's orders, however this page is filtered below." />
              {/* Two cards per row, so none is left alone. One at-grid-2 per
                  pair: the workspace grid is auto-fit and would put three of
                  four cards on a wide row; with two items it fills the row with
                  two, and stacks them when there is no room. */}
              <div className="at-stack">
                <div className="at-grid-2">
                  <Breakdown icon={ClipboardList} title="Order status" counts={totals.by_order_status} />
                  <Breakdown icon={CreditCard} title="Payment status" counts={totals.by_payment_status}
                    note="Recorded by hand against the order. There is no payment gateway in this product." />
                </div>
                <div className="at-grid-2">
                  <Breakdown icon={Scissors} title="Production status" counts={totals.by_production_status}
                    labelFor={productionLabel} />
                  <Breakdown icon={ListChecks} title="Current stage" counts={totals.by_stage}
                    labelFor={productionLabel} note="Stage keys come from the workflow definition, so this list is open-ended." />
                </div>
              </div>

              <SectionHead title="By boutique" />
              {/* Six "Show" options are too many for chips (they wrap the
                  toolbar), so a select, each option counted from the whole
                  payload already in hand. */}
              <Toolbar right={<>
                <SearchBox value={term} onChange={setTerm} placeholder="Name or schema…" />
                <Select value={status} onChange={setStatus} label="Show" options={SHOW.map((o) => ({
                  value: o.key,
                  label: `${o.label} (${count(data.boutiques.filter((b) => shows(b, o.key)).length)})`,
                }))} />
              </>} />

              <Table
                columns={columns}
                rows={rows}
                keyFor={(b) => b.schema_name}
                rowClassName={(b) => (b.is_active ? '' : 'sa-suspended')}
                empty={<Empty title="No boutique matches those filters."
                  detail="Clear the search or widen the filter." />}
              />
              {rows.length > 0 && (
                // The table's footnote, in the footer row a pager would use.
                <div className="at-pager">
                  <span className="at-pager-size">
                    <span>
                      <sup>*</sup> Overdue counts system-generated delivery dates as well as
                      promised ones — see the note above.
                    </span>
                  </span>
                </div>
              )}

              <Note tone="info" icon={MessageSquare}>
                Queued messages are customer WhatsApp messages that have not gone out yet. WhatsApp
                backlog says whether this platform sends them automatically or by hand.
              </Note>
            </>
          );
        }}
      </Async>
    </>
  );
}
