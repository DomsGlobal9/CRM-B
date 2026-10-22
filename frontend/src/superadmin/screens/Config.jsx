/**
 * Platform configuration: the rows this console can write, the environment it
 * cannot, and whether a credential exists.
 *
 * The three sections are deliberately different shapes because they are three
 * different kinds of thing. Settings are rows in a table and a click changes
 * them. The environment is settings.py, read back so nobody has to guess -- it
 * changes by deploy, not by click, so there is nothing to edit here. Credentials
 * are booleans and only booleans: the API sends presence and never a value, and
 * an operations console that prints an API key is a credential store with a
 * login page in front of it.
 *
 * maintenance_mode is lifted out of the settings table into its own control. It
 * is the one row here that takes the whole platform down, and editing it as raw
 * JSON in a list of five would let someone do that without being told.
 */

import { useCallback, useState } from 'react';
import { Lock, Power, Server } from 'lucide-react';

import { consoleApi } from '../api';
import { LIMITS } from '../../services/validate';
import {
  Async, Card, Confirm, Empty, Field, KeyValue, Note, PageHeader, Pill, SectionHead, Table, moment,
  useApi, useToast,
} from '../ui';

/** Plain names for the keys ConfigView reports on. */
const CREDENTIAL_NAMES = {
  email_host: 'Mail server',
  supabase: 'Supabase storage (unused)',
  cloudinary: 'Cloudinary (photos & backups)',
  customer_message_backend: 'Customer WhatsApp sending',
  design_studio_pinterest: 'Design search — Pinterest',
  design_studio_google: 'Design search — Google Images',
  guardian_whatsapp_number: 'Watchdog WhatsApp number',
};

/** A key the list above does not name yet, in sentence case like every title. */
const credentialName = (key) => {
  if (CREDENTIAL_NAMES[key]) return CREDENTIAL_NAMES[key];
  const words = key.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
};

const MAINTENANCE = 'maintenance_mode';

/**
 * The middleware's reading of the stored value, not a friendlier one.
 *
 * tenants/middleware.py switches on `isinstance(value, dict) and value['enabled']`
 * -- anything else is off. If this screen were more generous than that it would
 * show a lock that is not there.
 */
function maintenanceOf(settings) {
  const raw = settings.find((s) => s.key === MAINTENANCE)?.value;
  const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return {
    on: Boolean(value.enabled),
    message: typeof value.message === 'string' ? value.message : '',
  };
}

export default function Config() {
  const toast = useToast();
  const [draft, setDraft] = useState(null); // null = show whatever is stored
  const [edits, setEdits] = useState({});
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(null);
  const [note, setNote] = useState('');

  const state = useApi(useCallback(() => consoleApi.config(), []));

  const write = async (key, value, reason, said) => {
    setBusy(key);
    try {
      const result = await consoleApi.setConfig(key, value, reason);
      // The lag is kept on the page rather than in a toast. Turning maintenance
      // OFF is the direction that matters: each worker caches this for five
      // minutes, so some traffic keeps getting 503 after the console has said
      // "saved" -- and somebody watching a dashboard needs to know that is
      // expected rather than raise a second incident.
      setNote([said, result?.note].filter(Boolean).join(' '));
      toast('Saved.');
      state.reload();
      return true;
    } catch (e) {
      toast(e.message, 'off');
      return false;
    } finally {
      setBusy(null);
    }
  };

  const saveSetting = async (setting) => {
    let value;
    try {
      value = JSON.parse(edits[setting.key]);
    } catch {
      // Not sent. A setting saved as the string "false" instead of the boolean
      // is the kind of thing that is found weeks later.
      toast('That is not valid JSON — text has to be inside double quotes.', 'off');
      return;
    }
    if (await write(setting.key, value, '', `${setting.key} saved.`)) {
      setEdits((all) => {
        const next = { ...all };
        delete next[setting.key];
        return next;
      });
    }
  };

  return (
    <>
      <PageHeader
        title="Settings & maintenance"
        subtitle="Maintenance mode, the settings the product reads at runtime, and what the server is configured with."
      />

      <Async state={state}>
        {(data) => {
          const stored = maintenanceOf(data.settings);
          const message = draft ?? stored.message;
          const rows = data.settings.filter((s) => s.key !== MAINTENANCE);
          const env = data.environment || {};

          return (
            <>
              {stored.on && (
                <Note tone="error" title="Maintenance mode is on.">
                  Every boutique is being refused with a 503. This console, sign-in and the
                  Django admin stay reachable — that exemption is the only reason it can be
                  switched off from here.
                </Note>
              )}
              {note && <Note tone="info">{note}</Note>}

              <Card
                icon={Power}
                tone={stored.on ? 'rose' : 'neutral'}
                title="Maintenance mode"
                subtitle="Pauses the whole platform: every boutique sees a maintenance message until this is switched off."
                actions={(
                  <Pill value={stored.on ? 'critical' : 'healthy'}
                    label={stored.on ? 'Locked down' : 'Serving normally'} />
                )}
              >
                <Field label="Message every boutique sees" htmlFor="sa-maint-message">
                  <textarea id="sa-maint-message" className="form-control" value={message} maxLength={LIMITS.reason}
                    placeholder="Back at 03:00 UTC. Nothing has been lost."
                    disabled={busy === MAINTENANCE}
                    onChange={(e) => setDraft(e.target.value)} />
                </Field>

                <div className="sa-inline">
                  {stored.on ? (
                    <button type="button" className="btn-secondary at-btn-sm" disabled={busy === MAINTENANCE}
                      onClick={() => write(MAINTENANCE, { enabled: false, message: message.trim() },
                        '', 'Maintenance mode is off. Boutiques are being let back in.')}>
                      <Power size={14} /> Turn maintenance off
                    </button>
                  ) : (
                    <button type="button" className="btn-secondary at-btn-sm at-btn-danger" disabled={busy === MAINTENANCE}
                      onClick={() => setAsking(true)}>
                      <Power size={14} /> Turn maintenance on
                    </button>
                  )}
                  <button type="button" className="btn-primary at-btn-sm"
                    disabled={message === stored.message || busy === MAINTENANCE}
                    onClick={() => write(MAINTENANCE, { enabled: stored.on, message: message.trim() },
                      '', 'Maintenance message saved.')}>
                    Save message
                  </button>
                  <span className="sa-muted">
                    {message === stored.message
                      ? 'The message is saved. Editing it enables the button.'
                      : 'Unsaved message.'}
                  </span>
                </div>
              </Card>

              <SectionHead title="Platform settings"
                subtitle="Values the product reads at runtime. Text must be in double quotes." />

              <Table
                columns={[
                  {
                    key: 'key',
                    label: 'Setting',
                    render: (s) => (
                      <>
                        <div className="at-row-title">{s.key}</div>
                        {s.description && <div className="at-row-sub">{s.description}</div>}
                      </>
                    ),
                  },
                  {
                    key: 'value',
                    label: 'Value',
                    // .form-control is width 100%, which on its own lets a table
                    // column squeeze the editor to nothing; .sa-wide gives it a
                    // floor (about 260px), enough to read a JSON value.
                    render: (s) => (
                      <textarea className="form-control sa-compact sa-mono sa-wide"
                        aria-label={`Value of ${s.key}`} disabled={busy === s.key}
                        value={edits[s.key] ?? JSON.stringify(s.value ?? null)}
                        onChange={(e) => setEdits((all) => ({ ...all, [s.key]: e.target.value }))} />
                    ),
                  },
                  {
                    key: 'updated',
                    label: 'Last change',
                    dataLabel: 'Last change',
                    className: 'sa-nowrap',
                    render: (s) => (
                      <>
                        <div>{s.updated_by || <span className="sa-muted">unknown</span>}</div>
                        <div className="at-row-sub">{moment(s.updated_at)}</div>
                      </>
                    ),
                  },
                  {
                    key: 'save',
                    label: '',
                    dataLabel: 'Actions',
                    className: 'sa-actions',
                    render: (s) => (
                      <button type="button" className="btn-secondary at-btn-sm"
                        disabled={edits[s.key] === undefined || busy === s.key}
                        onClick={() => saveSetting(s)}>
                        {busy === s.key ? 'Saving…' : 'Save'}
                      </button>
                    ),
                  },
                ]}
                rows={rows}
                keyFor={(s) => s.key}
                empty={<Empty title="No platform settings have been written yet."
                  detail="Rows appear here once something writes one. The application reads settings.py for anything it needs at import time — those are below, and they are not editable from a console." />}
              />

              <SectionHead title="Server settings"
                subtitle="Set on the server, shown here for reference. Changing one means a redeploy, not a click." />
              <Card>
                <KeyValue items={[
                  ['DEBUG', (
                    <div className="sa-inline">
                      <Pill value={env.debug ? 'warning' : 'healthy'} label={env.debug ? 'On' : 'Off'} />
                      {env.debug && (
                        <span className="sa-muted">Stack traces go back to whoever triggered the error.</span>
                      )}
                    </div>
                  )],
                  ['Allowed hosts', <span className="sa-schema">{(env.allowed_hosts || []).join(', ') || '—'}</span>],
                  ['Time zone', env.time_zone || '—'],
                  ['Tracking base URL', <span className="sa-schema">{env.tracking_base_url || '—'}</span>],
                  ['WhatsApp country code', env.whatsapp_country_code || '—'],
                ]} />
              </Card>

              <SectionHead title="Keys and passwords"
                subtitle="Only whether each one is set. The value itself is never shown here." />
              <div className="at-grid-3">
                {Object.entries(data.credentials || {}).map(([key, present]) => (
                  <Card key={key} icon={present ? Lock : Server} title={credentialName(key)}>
                    {/* not_configured is grey. Several of these are absent by
                        design, and a red light would send someone hunting a
                        bug that does not exist. */}
                    <Pill value={present ? 'ok' : 'not_configured'}
                      label={present ? 'Set' : 'Not set'} />
                  </Card>
                ))}
              </div>
              <Note tone="info">
                Values are never displayed here because they are never sent here. Set them in the
                deployment environment.
              </Note>
            </>
          );
        }}
      </Async>

      <Confirm
        open={asking}
        busy={busy === MAINTENANCE}
        danger
        requireReason
        title="Turn maintenance mode on?"
        confirmLabel="Lock every boutique out"
        body={(
          <>
            <p>
              Every boutique request is refused with a 503 until you turn this back off. Staff
              cannot sign in to their workspace, the mobile app stops, and the public order
              tracking page stops with it.
            </p>
            <p>
              This console stays reachable, and so do sign-in and the Django admin — that is what
              lets you switch it off again from here.
            </p>
            <Note tone="info">Other server workers apply this within 5 minutes, in both directions.</Note>
          </>
        )}
        onCancel={() => setAsking(false)}
        onConfirm={async (reason) => {
          const stored = maintenanceOf(state.data?.settings || []);
          await write(MAINTENANCE, { enabled: true, message: (draft ?? stored.message).trim() },
                      reason, 'Maintenance mode is ON. Every boutique is locked out.');
          setAsking(false);
        }}
      />
    </>
  );
}
