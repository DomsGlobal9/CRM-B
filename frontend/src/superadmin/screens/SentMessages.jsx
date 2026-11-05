/**
 * Activity > Messages sent.
 *
 * Every WhatsApp message and email the product tried to send, and to whom
 * (superadmin/outbound.py). Recipients and what kind of message, never the text:
 * message bodies carry sign-in codes and password-reset links, so the server does
 * not keep them for this screen to show. Each look is itself audited, because
 * these rows are customers' numbers and addresses.
 */

import { useCallback, useState } from 'react';
import { AlertTriangle, Ban, Mail, MessageSquare, Send, X } from 'lucide-react';

import { consoleApi } from '../api';
import {
  Async, Empty, Note, PageHeader, Pager, Pill, SearchBox, Select, Stat, StatGrid, Table, Toolbar,
  count, moment, useApi,
} from '../ui';

const PAGE_SIZE = 50;
const NO_FILTERS = { channel: '', status: '', boutique: '', q: '', page: 1 };

const CHANNELS = [
  { value: '', label: 'All channels' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'email', label: 'Email' },
];

const STATUSES = [
  { value: '', label: 'All results' },
  { value: 'sent', label: 'Sent' },
  { value: 'failed', label: 'Failed' },
  { value: 'blocked', label: 'Blocked by the switch' },
];

const RESULT = {
  sent: { tone: 'ok', label: 'Sent' },
  failed: { tone: 'off', label: 'Failed' },
  blocked: { tone: 'warn', label: 'Blocked' },
};

export default function SentMessages() {
  const [filters, setFilters] = useState(NO_FILTERS);

  const state = useApi(
    useCallback(() => consoleApi.outboundMessages({ ...filters, page_size: PAGE_SIZE }), [filters]),
    [filters],
  );

  // Any filter change goes back to page 1: page 3 of the old result set is a
  // different set of rows.
  const set = (patch) => setFilters((f) => ({ ...f, page: 1, ...patch }));
  const anyFilter = Boolean(filters.channel || filters.status || filters.boutique || filters.q);
  const clear = () => setFilters(NO_FILTERS);

  const columns = [
    { key: 'at', label: 'When', className: 'sa-nowrap', render: (r) => moment(r.at) },
    { key: 'channel', label: 'Channel', render: (r) => (r.channel === 'email' ? 'Email' : 'WhatsApp') },
    { key: 'recipient', label: 'To', render: (r) => <span className="sa-schema">{r.recipient}</span> },
    { key: 'what', label: 'What', className: 'sa-col-prose',
      render: (r) => (r.what || <span className="sa-muted">Not recorded</span>) },
    { key: 'boutique', label: 'Boutique',
      render: (r) => (r.boutique ? (
        <button type="button" className="at-link" onClick={() => set({ boutique: r.boutique })}>
          {r.boutique_name || r.boutique}
        </button>
      ) : <span className="sa-muted">Platform</span>) },
    { key: 'status', label: 'Result',
      render: (r) => {
        const result = RESULT[r.status] || { tone: 'info', label: r.status };
        return (
          <>
            <Pill value={r.status} tone={result.tone} label={result.label} />
            {r.error && <div className="sa-muted sa-clamp-2" title={r.error}>{r.error}</div>}
          </>
        );
      } },
  ];

  return (
    <>
      <PageHeader
        title="Messages sent"
        subtitle="Every WhatsApp message and email the product tried to send, and to whom. The message text is never kept."
      />

      <Toolbar
        right={(
          <>
            <SearchBox value={filters.q} onChange={(q) => set({ q })}
              placeholder="Number, email address or subject…" />
            <Select value={filters.channel} onChange={(channel) => set({ channel })} label="Channel"
              options={CHANNELS} />
            <Select value={filters.status} onChange={(status) => set({ status })} label="Result"
              options={STATUSES} />
          </>
        )}
      >
        {anyFilter && (
          <div className="sa-inline">
            {filters.boutique && (
              <button type="button" className="btn-secondary at-btn-sm" onClick={() => set({ boutique: '' })}>
                Boutique: {filters.boutique} <X size={14} />
              </button>
            )}
            <button type="button" className="btn-secondary at-btn-sm" onClick={clear}>Clear all filters</button>
          </div>
        )}
      </Toolbar>

      <Async state={state} skeletonRows={8}>
        {(d) => (
          <>
            {!d.sending_enabled && (
              <Note tone="warning" icon={Ban} title="WhatsApp sending is off for the whole platform.">
                WHATSAPP_SENDING_ENABLED is off on this server, so every WhatsApp attempt is
                recorded here as blocked, including sign-in codes and alerts.
              </Note>
            )}

            <StatGrid label="Last 24 hours">
              <Stat icon={MessageSquare} label="WhatsApp sent, 24h" value={count(d.summary.whatsapp_sent)} />
              <Stat icon={Mail} label="Emails sent, 24h" value={count(d.summary.email_sent)} />
              <Stat icon={AlertTriangle} label="Failed, 24h" value={count(d.summary.failed)}
                tone={d.summary.failed ? 'warn' : undefined} />
              <Stat icon={Ban} label="Blocked by the switch, 24h" value={count(d.summary.blocked)} />
            </StatGrid>

            <Table columns={columns} rows={d.entries} keyFor={(r) => r.id}
              empty={anyFilter ? (
                <Empty title="No message matches those filters."
                  detail="The log is not empty — these filters are just too narrow."
                  action={(
                    <button type="button" className="btn-secondary at-btn-sm" onClick={clear}>
                      Clear the filters
                    </button>
                  )} />
              ) : (
                <Empty icon={<Send size={20} />} title="No messages recorded yet."
                  detail="Rows appear from the next WhatsApp message or email the product sends." />
              )} />

            <Pager page={d.page} pages={d.pages} total={d.count}
              onPage={(page) => setFilters((f) => ({ ...f, page }))} />
          </>
        )}
      </Async>
    </>
  );
}
