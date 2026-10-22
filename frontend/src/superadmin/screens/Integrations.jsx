/**
 * Every seam between this product and something outside it.
 *
 * Most of these rows are permanently grey, and that is the finding rather than a
 * gap in the screen. Payments, SMS and background jobs do not exist anywhere in
 * this codebase; customer messaging is a wa.me link the boutique owner taps on
 * their own phone, which is a product decision (CUSTOMER_MESSAGE_BACKEND is
 * unset on purpose) and not a broken API client. `not_configured` is grey in
 * ui.jsx TONES for exactly this reason: a red light here sends somebody hunting
 * a bug that does not exist, and a green one claims a capability the product
 * does not have.
 *
 * No credential value is displayed, and none is requested. /config/ returns
 * `credentials` as booleans -- presence, never the secret -- and an operations
 * console that prints an API key is a credential store with a login page in
 * front of it.
 *
 * There is no test-connection endpoint and no Test button. Every check in
 * superadmin/health.py is deliberately side-effect free: a health page that
 * sends a test message becomes a page people are afraid to open.
 */

import { useCallback } from 'react';
import { Lock, Plug, Server } from 'lucide-react';

import { consoleApi } from '../api';
import {
  Async, Card, KeyValue, Note, PageHeader, Pill, Table, useApi,
} from '../ui';

/**
 * The seams, in the order an administrator would ask about them.
 *
 * `check` names a row in /health/; `credential` names a boolean in
 * /config/ credentials. Pinterest and Google have a credential but no health
 * check -- nothing in superadmin/health.py probes them -- so their status is
 * derived below from the provider code instead of invented.
 */
const SEAMS = [
  { key: 'email', label: 'Email sending', check: 'email', credential: 'email_host',
    credentialLabel: 'EMAIL_HOST' },
  { key: 'media_storage', label: 'Photo storage (Cloudinary)', check: 'media_storage',
    credential: 'cloudinary', credentialLabel: 'CLOUDINARY_URL' },
  { key: 'backups', label: 'Database backups', check: 'backups', credential: null },
  { key: 'guardian', label: 'Watchdog alerts (WhatsApp)', check: 'guardian', credential: null },
  { key: 'whatsapp', label: 'Customer WhatsApp messages', check: 'whatsapp',
    credential: 'customer_message_backend', credentialLabel: 'CUSTOMER_MESSAGE_BACKEND' },
  { key: 'payments', label: 'Payments', check: 'payments', credential: null },
  { key: 'sms', label: 'SMS', check: 'sms', credential: null },
  { key: 'background_jobs', label: 'Background work', check: 'background_jobs', credential: null },
  { key: 'design_studio_pinterest', label: 'Design search — Pinterest', check: null,
    credential: 'design_studio_pinterest', credentialLabel: 'DESIGN_STUDIO_PINTEREST_TOKEN' },
  { key: 'design_studio_google', label: 'Design search — Google Images', check: null,
    credential: 'design_studio_google', credentialLabel: 'DESIGN_STUDIO_GOOGLE_API_KEY' },
];

/**
 * The two design-studio providers, which /health/ does not check.
 *
 * Read off apps/design_studio/providers/external.py rather than guessed: both
 * subclass _CredentialGatedProvider, which reports `available()` from the
 * credential alone and whose `search()` raises NotImplementedError the moment it
 * is called with one set. So a credential here does NOT mean the seam works --
 * it means the gallery will stop skipping a provider that then raises.
 */
function providerStatus(configured) {
  if (!configured) {
    return ['not_configured', 'No credential set. The provider reports itself unavailable and '
      + 'Design Studio search skips it, so the gallery shows it as not connected. Nothing is broken.'];
  }
  return ['warning', 'A credential IS set, and that is the problem: '
    + '_CredentialGatedProvider.search() in apps/design_studio/providers/external.py raises '
    + 'NotImplementedError once available() is true. No client was ever written. Unset the '
    + 'credential to return the provider to its dormant state.'];
}

/** The table's columns; each row is a seam with its status worked out. */
const COLUMNS = [
  {
    key: 'label',
    label: 'Service',
    render: (row) => (
      <>
        <div className="at-row-title">{row.label}</div>
        {!row.check && <div className="at-row-sub">No health check</div>}
      </>
    ),
  },
  { key: 'status', label: 'Status', render: (row) => <Pill value={row.status} /> },
  {
    key: 'credential',
    label: 'Key set?',
    render: (row) => (row.configured === null ? (
      <span className="sa-muted">none to set</span>
    ) : (
      <>
        {/* The same words as Settings & maintenance: 'Set' / 'Not set'. */}
        <Pill value={row.configured ? 'ok' : 'not_configured'}
          label={row.configured ? 'Set' : 'Not set'} />
        <div className="sa-schema">{row.credentialLabel}</div>
      </>
    )),
  },
  // The prose column is capped on desktop so the identifiers in 'Key set?'
  // (CUSTOMER_MESSAGE_BACKEND) keep enough width not to break mid-name.
  { key: 'detail', label: 'What it means right now', className: 'sa-col-prose' },
];

export default function Integrations() {
  const state = useApi(useCallback(
    () => Promise.all([consoleApi.health(), consoleApi.config()])
      .then(([health, config]) => ({ health, config })),
    [],
  ));

  return (
    <>
      <PageHeader
        title="Connected services"
        subtitle="Every outside service the product talks to, and whether it is set up. Statuses come from the health checks; nothing is pinged from here."
      />

      <Async state={state}>
        {({ health, config }) => {
          const checks = Object.fromEntries((health.checks || []).map((c) => [c.key, c]));
          const credentials = config.credentials || {};

          const rows = SEAMS.map((seam) => {
            const check = seam.check ? checks[seam.check] : null;
            const configured = seam.credential
              ? Boolean(credentials[seam.credential]) : null;
            const [status, detail] = check
              ? [check.status, check.detail]
              : providerStatus(configured);
            return { ...seam, configured, status, detail };
          });

          return (
            <>
              <Note tone="info" icon={Lock}>
                The server sends whether a credential is present, never its value. Nothing on this
                page can reveal a secret, and nothing here asks for one.
              </Note>

              <Table columns={COLUMNS} rows={rows} keyFor={(row) => row.key} />

              <div className="at-grid-2">
                <Card icon={Plug} title="Why so much grey">
                  <p>
                    Grey is <em>not configured</em>, and for most of these rows it is permanent by
                    design rather than pending. Payments, SMS and background jobs have no
                    implementation anywhere in this codebase — an order&apos;s <code>amount_paid</code> is
                    what staff typed, and every operation runs inside the request that asked for it.
                    Colouring those red would invent an outage.
                  </p>
                </Card>
                <Card icon={Server} title="Environment">
                  <KeyValue items={[
                    // A Pill 'On' / 'Off', as on Settings & maintenance. A
                    // payload without the flag shows a dash, not a guess.
                    ['DEBUG', typeof config.environment?.debug === 'boolean' ? (
                      <Pill value={config.environment.debug ? 'warning' : 'healthy'}
                        label={config.environment.debug ? 'On' : 'Off'} />
                    ) : null],
                    ['Time zone', config.environment?.time_zone],
                    ['Tracking base URL', (
                      <span className="sa-schema">{config.environment?.tracking_base_url}</span>
                    )],
                    ['WhatsApp country code', config.environment?.whatsapp_country_code],
                  ]} />
                </Card>
              </div>
            </>
          );
        }}
      </Async>
    </>
  );
}
