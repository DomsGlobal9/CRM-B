/**
 * Every check the platform can honestly run against itself.
 *
 * Ordered worst-first and grouped, because this page is opened when something is
 * already wrong and a red row below a green one is a red row nobody reads. The
 * server ranks the same way to pick `overall` (api_views.HealthView), so the
 * banner and the first card can never disagree.
 *
 * The third group is the point of the screen. Payments, background jobs, SMS and
 * customer messaging report not_configured permanently: there is no gateway, no
 * queue, no SMS provider, and WhatsApp messages are wa.me links the owner sends
 * from their own phone on purpose (settings.CUSTOMER_MESSAGE_BACKEND is unset by
 * design). Those are grey, sit under a heading that says they are decisions, and
 * their server-written detail is rendered word for word -- summarising "sent by
 * hand by design" into "offline" is how an on-call engineer ends up hunting an
 * integration that was never built.
 */

import { useCallback } from 'react';
import { AlertTriangle, ArrowRight, Check, Info, RotateCw } from 'lucide-react';

import { consoleApi } from '../api';
import {
  Async, Card, Note, PageHeader, Pill, SectionHead, TONES, moment, useApi, wordFor,
} from '../ui';

/** Worst first. not_configured sorts below healthy: it is a decision, not a fault. */
const RANK = { critical: 0, offline: 1, degraded: 2, warning: 3, healthy: 4, not_configured: 5 };

// An unrecognised status sorts into the attention group rather than under the
// green ones. A word this console has never seen is not evidence of health.
const rankOf = (check) => RANK[check.status] ?? 3.5;

/** The card's tile follows the check's own status, as a Stat's does. */
const TILE = { off: 'rose', warn: 'amber' };

/**
 * Checks whose problem is worked on in another screen. The way there sits in
 * the card header as a text link, as a workspace section card's "View all"
 * does, rather than as a button under the server's detail.
 */
const OPENS = {
  errors: { to: 'errors', label: 'Open Crashes' },
  whatsapp: { to: 'messaging', label: 'Open WhatsApp backlog' },
};

function Group({ title, hint, icon, checks, route }) {
  if (checks.length === 0) return null;
  return (
    <>
      <SectionHead title={`${title} (${checks.length})`} subtitle={hint} />
      <div className="at-grid-3">
        {checks.map((c) => {
          const opens = OPENS[c.key];
          return (
            <Card key={c.key} icon={icon} tone={TILE[TONES[c.status]] || 'neutral'} title={c.label}
              actions={(
                <>
                  <Pill value={c.status} />
                  {opens && (
                    <button type="button" className="at-link" onClick={() => route.go(opens.to)}>
                      {opens.label} <ArrowRight size={14} />
                    </button>
                  )}
                </>
              )}>
              {/* Verbatim from the server. Each detail was written to explain one
                  specific state and loses its meaning if it is condensed. */}
              <p>{c.detail}</p>
            </Card>
          );
        })}
      </div>
    </>
  );
}

export default function Health({ route }) {
  const state = useApi(useCallback(
    // The server does not stamp a time on the response, and the checks run at
    // the moment of the request -- so the browser's own clock is the honest
    // answer to "how old is this?", labelled as the time the console asked.
    () => consoleApi.health().then((d) => ({ ...d, asked_at: new Date().toISOString() })), []));

  return (
    <>
      <PageHeader
        title="Is everything working?"
        subtitle="Checked fresh each time this page opens. Red needs action, amber is worth a look, grey is simply not part of the product."
        meta={state.data && <>Checked {moment(state.data.asked_at)} · {state.data.checks.length} checks</>}
        actions={(
          <>
            {state.data && <Pill value={state.data.overall} />}
            {/* Reload keeps the old cards on screen (useApi holds data through a
                refetch), so re-running does not flash the page back to skeletons. */}
            <button type="button" className="btn-secondary" onClick={state.reload} disabled={state.loading}>
              <RotateCw size={16} /> {state.loading ? 'Checking…' : 'Re-run checks'}
            </button>
          </>
        )}
      />

      <Async state={state} skeletonRows={6} isEmpty={(d) => d.checks.length === 0}>
        {(data) => {
          const sorted = [...data.checks].sort((a, b) => rankOf(a) - rankOf(b));
          const attention = sorted.filter((c) => rankOf(c) < RANK.healthy);
          const healthy = sorted.filter((c) => c.status === 'healthy');
          const absent = sorted.filter((c) => c.status === 'not_configured');

          return (
            <>
              {attention.length === 0 && (
                <Note tone="info">
                  Nothing is failing. The headline reads{' '}
                  <strong>{wordFor(data.overall)}</strong>
                  {data.overall === 'not_configured'
                    ? ' only because something this product does not have is listed below in grey.'
                    : '.'}
                </Note>
              )}

              <Group title="Needs attention" route={route}
                icon={AlertTriangle}
                hint="Something is wrong, slow, or could not be checked."
                checks={attention} />

              <Group title="Working" route={route}
                icon={Check}
                hint="Checked just now and answering."
                checks={healthy} />

              <Group title="Not part of the product" route={route}
                icon={Info}
                hint="Left out on purpose. Grey, not red: nothing here needs fixing."
                checks={absent} />
            </>
          );
        }}
      </Async>
    </>
  );
}
