/**
 * Security > Sign-in Attempts.
 *
 * Every sign-in and reset request the platform has seen, pass or fail, and
 * the patterns superadmin/signins.py judges worth an alert. The same rules the
 * guardian sends to WhatsApp; this is where to look afterwards.
 */

import { useCallback } from 'react';
import { Fingerprint, Globe, KeyRound, LogIn, ShieldX } from 'lucide-react';

import { consoleApi } from '../api';
import {
  Async, Empty, Note, PageHeader, Pill, Stat, StatGrid, Table, count, moment, useApi,
} from '../ui';

const KIND = { login: 'Boutique', console: 'Console', reset: 'Reset' };

const COLUMNS = [
  { key: 'at', label: 'When', className: 'sa-nowrap', render: (r) => moment(r.at) },
  { key: 'ok', label: 'Result',
    render: (r) => (
      <Pill value={r.ok ? 'ok' : 'failed'} tone={r.ok ? 'ok' : 'off'} label={r.ok ? 'OK' : 'Failed'} />
    ) },
  { key: 'kind', label: 'Kind', render: (r) => KIND[r.kind] || r.kind },
  // Usernames and schema names are machine values, mono as on every other
  // screen. A blank one (a console sign-in has no boutique) stays blank.
  { key: 'username', label: 'Account',
    render: (r) => (r.username ? <span className="sa-schema">{r.username}</span> : null) },
  { key: 'boutique', label: 'Boutique',
    render: (r) => (r.boutique ? <span className="sa-schema">{r.boutique}</span> : null) },
  { key: 'ip', label: 'From' },
  // A user agent is long and rarely read in full: two lines in the table,
  // the whole string on hover.
  { key: 'user_agent', label: 'Browser', className: 'sa-col-prose',
    render: (r) => (r.user_agent
      ? <span className="sa-clamp-2" title={r.user_agent}>{r.user_agent}</span>
      : null) },
];

export default function Signins() {
  const state = useApi(useCallback(() => consoleApi.signins(), []));

  return (
    <>
      <PageHeader
        title="Sign-in attempts"
        subtitle="Who tried to sign in, from where, and whether it worked — boutiques and this console. Suspicious patterns in the last hour are flagged here and sent to WhatsApp."
      />

      <Async state={state} skeletonRows={6}>
        {(d) => (
          <>
            <StatGrid label="Last 24 hours">
              <Stat icon={LogIn} label="Attempts, 24h" value={count(d.last_24h.total)} />
              <Stat icon={ShieldX} label="Failed, 24h" value={count(d.last_24h.failed)}
                tone={d.last_24h.failed ? 'warn' : undefined} />
              <Stat icon={KeyRound} label="Reset requests, 24h" value={count(d.last_24h.reset_requests)} />
              <Stat icon={Globe} label="Addresses, 24h" value={count(d.last_24h.distinct_ips)} />
            </StatGrid>

            {d.suspicious.length > 0 && (
              <Note tone="error" title="Right now:">
                <ul>{d.suspicious.map((t) => <li key={t}>{t}</li>)}</ul>
              </Note>
            )}

            <Table columns={COLUMNS} rows={d.recent} keyFor={(r, i) => i}
              empty={<Empty icon={<Fingerprint size={20} />}
                title="No sign-ins recorded yet."
                detail="Rows appear from the next sign-in or reset request on any boutique." />} />
          </>
        )}
      </Async>
    </>
  );
}
