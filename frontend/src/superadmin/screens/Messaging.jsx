/**
 * The customer-message backlog -- the one real queue in this product.
 *
 * Whether anything sends them depends on CUSTOMER_MESSAGE_BACKEND, and the
 * whatsapp health check (superadmin/health.py `_whatsapp`) reports which: with
 * it set, 'healthy' and "sent automatically"; unset, 'not_configured', and
 * rows pile up in each boutique's CustomerMessage table with status QUEUED
 * until the owner opens the order and taps send on their own phone (a wa.me
 * link costs nothing and goes out from the number the customer already
 * knows). The note's title follows that status rather than assuming either.
 *
 * Without a sender, a large backlog is a person who has stopped sending
 * messages, not a broken integration -- which is why this screen ranks
 * boutiques by depth and gives the server's own words rather than painting a
 * red light.
 *
 * No threshold turns a number amber here. Any "50 is a lot" would be invented in
 * this file and would be the only place on the platform that believed it; the
 * bar shows each boutique's share of the backlog, which is measured.
 */

import { useCallback } from 'react';
import {
  Building2, Hourglass, Inbox, MessageSquare, Send, Smartphone, Stethoscope,
} from 'lucide-react';

import { consoleApi } from '../api';
import {
  Async, Card, Empty, Meter, Note, PageHeader, Pill, SectionHead, Stat, StatGrid, count, useApi,
} from '../ui';

export default function Messaging({ route }) {
  const state = useApi(useCallback(
    () => Promise.all([consoleApi.ordersMonitor(), consoleApi.health()])
      .then(([orders, health]) => ({ orders, health })),
    [],
  ));

  return (
    <>
      <PageHeader
        title="WhatsApp backlog"
        subtitle="Customer messages each boutique has queued but not yet sent."
      />

      <Async
        state={state}
        isEmpty={({ orders }) => orders.boutiques.length === 0}
        empty={<Empty icon={<MessageSquare size={20} />} title="No boutiques on the platform yet."
          detail="A messaging backlog appears here once a boutique starts taking orders." />}
      >
        {({ orders, health }) => {
          const whatsapp = (health.checks || []).find((c) => c.key === 'whatsapp');
          const totals = orders.totals || {};
          const unreadable = orders.boutiques.filter((b) => !b.healthy);

          // Largest first. A boutique whose schema could not be read reports
          // null rather than 0 and sorts to the bottom, because "nobody is
          // sending" and "we could not count" are different findings.
          const rows = [...orders.boutiques]
            .sort((a, b) => (b.queued_messages ?? -1) - (a.queued_messages ?? -1));
          const deepest = rows[0]?.queued_messages || 0;
          const withBacklog = rows.filter((b) => b.queued_messages > 0);

          return (
            <>
              <StatGrid>
                <Stat icon={MessageSquare} label="Queued, platform-wide"
                  value={count(totals.queued_messages)} note="Waiting to be sent" />
                <Stat icon={Building2} label="Boutiques with a backlog"
                  value={count(withBacklog.length)} note={`of ${count(orders.boutiques.length)}`} />
                <Stat icon={Hourglass} label="Deepest single backlog" value={count(deepest)}
                  note={rows[0]?.queued_messages ? rows[0].name : undefined} />
              </StatGrid>

              {/* The title follows the health check's status; the body is its
                  own sentence, verbatim, which also carries the note about
                  schemas it could not read. */}
              {whatsapp && (
                <Note tone={whatsapp.status === 'healthy' ? 'info' : 'warning'} icon={Send}
                  title={{ healthy: 'Sent automatically.', not_configured: 'Automatic sending is off.' }[
                    whatsapp.status] ?? 'Automatic sending could not be checked.'}>
                  {whatsapp.detail}
                </Note>
              )}

              {unreadable.length > 0 && (
                <Note tone="error">
                  {count(unreadable.length)} boutique schema(s) could not be read, so the platform total
                  is a floor rather than the real backlog: {unreadable.map((b) => b.name).join(', ')}.
                </Note>
              )}

              <SectionHead title="By boutique"
                subtitle="Longest backlog first." />

              {withBacklog.length === 0 ? (
                <Empty icon={<MessageSquare size={20} />} title="Nothing is waiting to be sent."
                  detail="Every queued customer message has been marked sent, or no order has generated one yet." />
              ) : (
                <div className="at-table-wrap">
                  <table className="at-table at-table--fit">
                    <thead>
                      <tr>
                        <th scope="col">Boutique</th>
                        <th scope="col" className="sa-num">Queued</th>
                        <th scope="col">Share of the deepest backlog</th>
                        <th scope="col" className="sa-num">Orders</th>
                        <th scope="col" />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((b) => (
                        <tr key={b.schema_name} className={b.is_active ? undefined : 'sa-suspended'}>
                          <td data-label="Boutique">
                            <button type="button" className="at-link"
                              onClick={() => route.go(`boutiques/${b.schema_name}`)}>
                              {b.name}
                            </button>
                            <div className="sa-schema">{b.schema_name}</div>
                            {!b.is_active && <Pill value="suspended" />}
                          </td>
                          <td data-label="Queued" className="at-num sa-num">
                            {b.healthy ? count(b.queued_messages)
                              : <Pill value="warning" label="Unreadable" />}
                          </td>
                          <td data-label="Share of the deepest backlog">
                            {b.healthy && deepest > 0 && (
                              <Meter pct={(100 * (b.queued_messages || 0)) / deepest} />
                            )}
                          </td>
                          <td data-label="Orders" className="at-num sa-num">{count(b.orders)}</td>
                          <td data-label="Actions" className="sa-actions">
                            <div className="sa-inline sa-inline--end">
                              <button type="button" className="btn-secondary at-btn-sm"
                                onClick={() => route.go(`support/${b.schema_name}`)}>
                                <Stethoscope size={14} /> Diagnose
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="at-grid-2">
                <Card icon={Smartphone} title="There is no send button here">
                  <p>
                    The console cannot send these. A message goes out as a wa.me link from the
                    boutique owner&apos;s own WhatsApp, opened from the order in their workspace —
                    the platform has no number to send from and no template approval to send under.
                    A button here would either do nothing or forge a message from a boutique.
                  </p>
                </Card>
                <Card icon={Inbox} title="What a large backlog means">
                  <p>
                    Rows queue themselves on order events, so their existence proves nothing. Only
                    the QUEUED count above is outstanding work, and the person who has to clear it
                    is the owner of that boutique, not anyone on this console.
                  </p>
                </Card>
              </div>
            </>
          );
        }}
      </Async>
    </>
  );
}
