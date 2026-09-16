/**
 * Security > Sign-in Attempts.
 *
 * Every sign-in and reset request the platform has seen, pass or fail, and
 * the patterns superadmin/signins.py judges worth an alert. The same rules the
 * guardian sends to WhatsApp; this is where to look afterwards.
 */

import { useCallback } from 'react';
import { Fingerprint } from 'lucide-react';

import { consoleApi } from '../api';
import { Async, Empty, Pill, SectionHead, Stat, Table, moment, useApi } from '../ui';

const KIND = { login: 'Boutique', console: 'Console', reset: 'Reset' };

const COLUMNS = [
  { key: 'at', label: 'When', render: (r) => moment(r.at) },
  { key: 'ok', label: 'Result',
    render: (r) => <Pill value={r.ok ? 'ok' : 'failed'} tone={r.ok ? 'ok' : 'off'} /> },
  { key: 'kind', label: 'Kind', render: (r) => KIND[r.kind] || r.kind },
  { key: 'username', label: 'Account' },
  { key: 'boutique', label: 'Boutique' },
  { key: 'ip', label: 'From' },
  { key: 'user_agent', label: 'Browser' },
];

export default function Signins() {
  const state = useApi(useCallback(() => consoleApi.signins(), []));

  return (
    <>
      <SectionHead
        title="Sign-in attempts"
        subtitle="Who tried to sign in, from where, and whether it worked — boutiques and this console. Suspicious patterns in the last hour are flagged here and sent to WhatsApp."
      >
        <button className="sa-btn" onClick={state.reload} disabled={state.loading}>Refresh</button>
      </SectionHead>

      <Async state={state} skeletonRows={6}>
        {(d) => (
          <>
            <div className="sa-stats">
              <Stat label="Attempts, 24h" value={d.last_24h.total} />
              <Stat label="Failed, 24h" value={d.last_24h.failed}
                tone={d.last_24h.failed ? 'warn' : undefined} />
              <Stat label="Reset requests, 24h" value={d.last_24h.reset_requests} />
              <Stat label="Distinct addresses, 24h" value={d.last_24h.distinct_ips} />
            </div>

            {d.suspicious.length > 0 && (
              <div className="sa-note error">
                <strong>Right now:</strong>
                <ul>{d.suspicious.map((t) => <li key={t}>{t}</li>)}</ul>
              </div>
            )}

            <Table columns={COLUMNS} rows={d.recent} keyFor={(r, i) => i}
              empty={<Empty icon={<Fingerprint size={18} />}
                title="No sign-ins recorded yet."
                detail="Rows appear from the next sign-in or reset request on any boutique." />} />
          </>
        )}
      </Async>
    </>
  );
}
