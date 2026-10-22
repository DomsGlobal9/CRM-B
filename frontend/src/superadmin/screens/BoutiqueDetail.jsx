/**
 * One boutique, drilled into: what it is doing, and everything it holds.
 *
 * The Data half knows about no model in particular. The server derives the
 * table list and every column from Django's own introspection
 * (superadmin/datasets.py), so a model added to a tenant app appears here the
 * day it ships with nothing changed in this file -- which is the only version of
 * this screen that does not silently fall behind the product.
 *
 * Read-only, deliberately. Every rule that keeps a boutique's data correct lives
 * in that boutique's own API, and none of it would run on a write from here.
 *
 * Two columns can never arrive: auth.User.password and every authtoken row. The
 * server drops the whole token model rather than the one field, so a column
 * added to it later cannot reopen the hole, and any field whose name looks like
 * a credential comes back as bullets. The lock icon in the header says so rather
 * than leaving an administrator to wonder why a column is dots.
 */

import { useCallback, useState } from 'react';
import {
  ArrowLeft, ArrowRight, Ban, CalendarClock, ClipboardList, Contact, Copy, Database, KeyRound, Lock,
  PackageSearch, Palette, RotateCw, Sparkles, Table2, TrendingUp, Users, Wallet, Wrench,
} from 'lucide-react';

import { consoleApi } from '../api';
import {
  Async, Card, Confirm, Empty, Field, KeyValue, Meter, Note, PageHeader, Pager, Pill, SearchBox,
  Select, Stat, StatGrid, Tabs, count, day, money, moment, useApi, useToast,
} from '../ui';

/** See core.modules.is_enabled -- absent and malformed both mean ON. */
const moduleOn = (enabled, key) => {
  if (!enabled || typeof enabled !== 'object' || Array.isArray(enabled)
      || Object.keys(enabled).length === 0) return true;
  return enabled[key] !== false;
};

/**
 * One cell.
 *
 * Long text is clipped rather than allowed to set the column width: these tables
 * are as wide as the model has fields -- forty on an order -- and one notes
 * field can push every other column off the screen.
 */
function Cell({ value }) {
  if (value === null || value === undefined) return <span className="sa-muted">—</span>;
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (typeof value === 'object') {
    return <span className="sa-json" title={JSON.stringify(value)}>{JSON.stringify(value)}</span>;
  }
  const text = String(value);
  if (text.length > 120) {
    return <span className="sa-json" title={text}>{`${text.slice(0, 117)}…`}</span>;
  }
  return text;
}

/** A page of one table. Mounted only once a dataset is chosen, so `key` is real. */
function DataPane({ schema, dataset }) {
  const [page, setPage] = useState(1);
  const [term, setTerm] = useState('');

  const state = useApi(
    useCallback(() => consoleApi.dataset(schema, dataset.key, { page, search: term }),
                [schema, dataset.key, page, term]),
    [schema, dataset.key, page, term],
  );

  // A new search must start at page 1 or a two-page result read from page 5
  // renders as empty and looks like "no matches".
  const search = (next) => { setTerm(next); setPage(1); };

  return (
    <div className="sa-pane">
      <div className="sa-pane-head">
        <span className="sa-pane-title">{dataset.label}</span>
        <span className="sa-schema">{dataset.key}</span>
        <SearchBox value={term} onChange={search} placeholder="Search this table…" />
      </div>

      <Async
        state={state}
        isEmpty={(d) => d.rows.length === 0}
        empty={<Empty icon={<Table2 size={20} />}
          title={term ? 'Nothing in this table matches that.' : 'This table is empty.'}
          detail={term ? 'The search covers every text column the server will return.'
            : 'No rows have been written here yet.'} />}
      >
        {(data) => {
          const redacted = data.columns.filter((c) => c.redacted);
          return (
            <div className="at-stack">
              {redacted.length > 0 && (
                <Note tone="info" icon={Lock}>
                  {redacted.map((c) => c.label).join(', ')} {redacted.length === 1 ? 'is' : 'are'} never
                  sent by the server. Password hashes and API tokens are replaced before the response
                  leaves the process, so there is nothing here to reveal.
                </Note>
              )}

              {/* Not --fit: forty columns on an order scroll sideways rather
                  than stack, so the pager sits outside the scroller. */}
              <div className="at-table-wrap">
                <table className="at-table sa-nowrap">
                  <thead>
                    <tr>
                      {data.columns.map((column) => (
                        <th key={column.name} scope="col" title={column.type}>
                          {column.redacted && <><Lock size={12} />{' '}</>}
                          {column.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((row, i) => (
                      <tr key={i}>
                        {data.columns.map((column) => (
                          <td key={column.name} data-label={column.label}>
                            <Cell value={row[column.name]} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager page={data.page} pages={data.pages} total={data.count} onPage={setPage} />
            </div>
          );
        }}
      </Async>
    </div>
  );
}

/** The table list, grouped by app, with the row counts that make it worth having. */
function DataBrowser({ schema }) {
  const [chosen, setChosen] = useState(null);
  const state = useApi(useCallback(() => consoleApi.datasets(schema), [schema]));

  return (
    <Async
      state={state}
      isEmpty={(d) => d.datasets.length === 0}
      empty={<Empty icon={<Database size={20} />} title="Nothing browsable in this schema."
        detail="Either the schema is not migrated or every model in it is excluded." />}
    >
      {(data) => {
        // Default to the first table that actually has rows: an administrator
        // opening this wants a boutique's data, not an empty pane.
        const active = chosen
          || data.datasets.find((d) => d.count > 0)
          || data.datasets[0];

        const groups = data.datasets.reduce((acc, item) => {
          (acc[item.app] = acc[item.app] || []).push(item);
          return acc;
        }, {});

        return (
          <div className="sa-split">
            <aside className="sa-side">
              {Object.entries(groups).map(([app, items]) => (
                <div key={app} className="sa-side-group">
                  <div className="sa-side-title">{app}</div>
                  {items.map((item) => {
                    const on = item.key === active?.key;
                    return (
                      <button key={item.key} type="button" className={`sa-side-item${on ? ' active' : ''}`}
                        aria-current={on ? 'page' : undefined}
                        onClick={() => setChosen(item)}>
                        <span>{item.label}</span>
                        <span className={`sa-side-count${item.count ? '' : ' zero'}`}>
                          {/* null means the table is missing from this schema --
                              a migration not applied there, not an empty table. */}
                          {item.count === null ? '?' : count(item.count)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </aside>

            {active
              ? <DataPane schema={schema} dataset={active} />
              : <Empty title="Pick a table." />}
          </div>
        );
      }}
    </Async>
  );
}

const DESIGN_SYSTEMS = [
  { value: 'scaleezy', label: 'Scaleezy — lime on Cloud Dancer' },
  { value: 'atelier', label: 'Atelier — warm paper, forest green' },
];
const COLOR_MODES = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'Match the device' },
];

/** The look this boutique's workspace runs. Platform-set: the boutique has no
 *  control of its own, so this card is the only place it changes. */
function AppearanceCard({ schema, boutique }) {
  const toast = useToast();
  const [saved, setSaved] = useState({ system: boutique.design_system || 'scaleezy', mode: boutique.color_mode || 'light' });
  const [system, setSystem] = useState(saved.system);
  const [mode, setMode] = useState(saved.mode);
  const [saving, setSaving] = useState(false);
  const dirty = system !== saved.system || mode !== saved.mode;

  const save = async () => {
    setSaving(true);
    try {
      const applied = await consoleApi.setAppearance(schema, { design_system: system, color_mode: mode });
      setSaved({ system: applied.design_system, mode: applied.color_mode });
      toast('Saved. The workspace picks it up at its next sign-in or refresh.');
    } catch (e) {
      toast(e.message, 'off');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card icon={Palette} title="Appearance">
      <p>
        The design system and light/dark mode this boutique&apos;s workspace runs. Recorded in
        the audit trail; the boutique itself cannot change it.
      </p>
      <Field label="Design system" htmlFor="sa-appearance-system">
        <Select id="sa-appearance-system" className="form-control" label="Design system"
          value={system} onChange={setSystem} options={DESIGN_SYSTEMS} />
      </Field>
      <Field label="Light or dark" htmlFor="sa-appearance-mode">
        <Select id="sa-appearance-mode" className="form-control" label="Light or dark"
          value={mode} onChange={setMode} options={COLOR_MODES} />
      </Field>
      <div className="sa-inline">
        <button type="button" className="btn-primary at-btn-sm" disabled={!dirty || saving} onClick={save}>
          {saving ? 'Saving…' : 'Apply to this boutique'}
        </button>
      </div>
    </Card>
  );
}

/** Whether this boutique's customer website may call the intake API.
 *
 *  Platform-set, and the only place it is set: the boutique's own Settings has
 *  no control for it. The key is shown exactly once, when it is generated --
 *  the server keeps a hash and genuinely cannot show it again -- so the panel
 *  that reveals it says so plainly rather than letting somebody close it and
 *  come back.
 */
function PortalAccessCard({ schema }) {
  const toast = useToast();
  const state = useApi(useCallback(() => consoleApi.portalAccess(schema), [schema]));
  const [access, setAccess] = useState(null);
  const [freshKey, setFreshKey] = useState('');
  const [origin, setOrigin] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(null);

  const current = access || state.data;

  const act = async (action, reason) => {
    setBusy(true);
    try {
      const result = await consoleApi.setPortalAccess(schema, action, {
        allowed_origin: origin || undefined, reason,
      });
      setAccess(result);
      // Held in component state only, for as long as this screen is open. It
      // is never written to localStorage and never logged.
      setFreshKey(result.api_key || '');
      setConfirming(null);
      toast(action === 'revoke'
        ? 'Customer Portal API access revoked.'
        : 'Done. Copy the key now — it is not shown again.');
    } catch (e) {
      toast(e.message, 'off');
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(freshKey);
      toast('API key copied.');
    } catch {
      toast('Could not copy. Select the key and copy it by hand.', 'off');
    }
  };

  return (
    <>
      <Card
        icon={Lock}
        title="Access — Customer Portal API"
        actions={current && (
          // Grey when off: not granted is a platform decision, not a fault.
          <Pill value={current.enabled ? 'active' : 'not_configured'}
                label={current.enabled ? 'Enabled' : 'Disabled'} />
        )}
      >
        <Async state={state} skeletonRows={2}>
          {() => (
            <>
              <p>
                Lets this boutique&apos;s own website take customer details through{' '}
                <code>/intake/</code>. Set here by the platform only; the
                boutique cannot grant it to itself. Recorded in the audit trail.
              </p>

              {current?.enabled && (
                <KeyValue items={[
                  ['Key id', <code>{current.key_id}</code>],
                  ['Website', current.allowed_origin
                    ? <code>{current.allowed_origin}</code>
                    : '— none set, so no browser on another origin can read a reply.'],
                  ['Last used', current.last_used_at ? moment(current.last_used_at) : 'never'],
                  !freshKey && ['API key', (
                    <>
                      <code>••••••••••••••••••</code>{' '}
                      — stored hashed, so it cannot be shown again. Rotate to issue a new one.
                    </>
                  )],
                ]} />
              )}

              {freshKey && (
                <Note tone="warning" icon={KeyRound}
                  title="Copy this API key now. For security, the secret will not be shown again.">
                  <p><code>{freshKey}</code></p>
                  <div className="sa-inline">
                    <button type="button" className="btn-secondary at-btn-sm" onClick={copy}>
                      <Copy size={14} /> Copy API key
                    </button>
                    <button type="button" className="btn-secondary at-btn-sm"
                            onClick={() => setFreshKey('')}>I have copied it</button>
                  </div>
                </Note>
              )}

              <Field label="Website address" optional htmlFor="sa-portal-origin">
                <input id="sa-portal-origin" type="text" value={origin}
                       placeholder="https://their-site.example"
                       onChange={(e) => setOrigin(e.target.value)} />
              </Field>

              <div className="sa-inline">
                {current?.enabled ? (
                  <>
                    <button type="button" className="btn-secondary at-btn-sm" disabled={busy}
                            onClick={() => setConfirming('rotate')}>
                      <RotateCw size={14} /> Rotate key
                    </button>
                    <button type="button" className="btn-secondary at-btn-sm at-btn-danger" disabled={busy}
                            onClick={() => setConfirming('revoke')}>
                      <Ban size={14} /> Revoke access
                    </button>
                  </>
                ) : (
                  <button type="button" className="btn-secondary at-btn-sm" disabled={busy}
                          onClick={() => setConfirming('enable')}>
                    <KeyRound size={14} /> Enable access
                  </button>
                )}
              </div>
            </>
          )}
        </Async>
      </Card>

      {/* Outside the card body: a dialog is a fixed overlay, and the body's
          spacing rule would push it 12px down the viewport. */}
      <Confirm
        open={confirming === 'enable'}
        title="Enable Customer Portal API?"
        body="A new API key is generated and shown once. Any earlier key for this boutique stops working."
        confirmLabel="Enable access" busy={busy}
        onCancel={() => setConfirming(null)}
        onConfirm={() => act('enable')}
      />
      <Confirm
        open={confirming === 'rotate'}
        title="Rotate the API key?"
        body="The current key stops working immediately. The new one is shown once."
        confirmLabel="Rotate key" busy={busy}
        onCancel={() => setConfirming(null)}
        onConfirm={() => act('rotate')}
      />
      <Confirm
        open={confirming === 'revoke'}
        title="Revoke Customer Portal API access for this boutique?"
        body="The key stops working immediately and the boutique's website can no longer take customer details."
        confirmLabel="Revoke access" danger requireReason busy={busy}
        onCancel={() => setConfirming(null)}
        onConfirm={(reason) => act('revoke', reason)}
      />
    </>
  );
}

/** Usage, onboarding, modules and appearance. Everything else links out. */
function Overview({ schema, route }) {
  const state = useApi(useCallback(() => consoleApi.support(schema), [schema]));

  return (
    <Async state={state} skeletonRows={6}>
      {({ boutique, usage, onboarding, modules }) => {
        const off = (modules.modules || [])
          .filter((m) => !moduleOn(boutique.enabled_modules, m.key));

        return (
          <>
            {!usage.healthy && (
              <Note tone="error">
                This boutique&apos;s schema could not be read, so the figures below are blank rather
                than zero. A missing or half-migrated schema is an engineering repair, not a quiet
                boutique.
              </Note>
            )}

            <StatGrid>
              <Stat icon={Users} label="Staff" value={count(usage.staff)} />
              <Stat icon={Contact} label="Customers" value={count(usage.customers)} />
              <Stat icon={ClipboardList} label="Orders" value={count(usage.orders)}
                note={`${count(usage.open_orders)} still open`} />
              <Stat icon={TrendingUp} label="Booked" value={usage.revenue === null ? '—' : money(usage.revenue)}
                note="Sum of order totals" />
              <Stat icon={Wallet} label="Collected" value={usage.collected === null ? '—' : money(usage.collected)}
                note="Sum of amounts actually paid" />
              <Stat icon={CalendarClock} label="Last order" value={usage.last_order ? day(usage.last_order) : '—'} />
            </StatGrid>

            <div className="at-grid-3">
              <Card
                icon={Sparkles}
                title="Onboarding"
                actions={onboarding.readable && (
                  <button type="button" className="at-link" onClick={() => route.go('onboarding')}>
                    Full checklist <ArrowRight size={14} />
                  </button>
                )}
              >
                {onboarding.readable ? (
                  <>
                    <p>
                      <strong>{onboarding.percent}%</strong> — {onboarding.percent_basis}
                    </p>
                    <Meter pct={onboarding.percent} />
                    {onboarding.blocked_on ? (
                      <div>
                        <div className="at-row-title">Waiting on: {onboarding.blocked_on.label}</div>
                        <p>{onboarding.blocked_on.detail}</p>
                      </div>
                    ) : <p>Nothing outstanding.</p>}
                  </>
                ) : <p>{onboarding.detail}</p>}
              </Card>

              <Card
                icon={PackageSearch}
                title="Modules"
                actions={(
                  <button type="button" className="at-link" onClick={() => route.go('modules')}>
                    Change modules <ArrowRight size={14} />
                  </button>
                )}
              >
                {off.length === 0 ? (
                  <p>
                    Every switchable module is on. A key absent from the stored map counts as on,
                    which is what the middleware does — see core.modules.is_enabled.
                  </p>
                ) : (
                  <>
                    <p>
                      Switched off, so this boutique&apos;s staff are refused those URLs outright:
                    </p>
                    <div className="sa-inline">
                      {off.map((m) => (
                        <Pill key={m.key} value="not_configured" label={m.label} />
                      ))}
                    </div>
                  </>
                )}
              </Card>

              <AppearanceCard schema={schema} boutique={boutique} />

              <PortalAccessCard schema={schema} />

              {/* Wrench is the One boutique in depth screen's own nav icon. */}
              <Card
                icon={Wrench}
                title="Going further"
                actions={(
                  <button type="button" className="at-link" onClick={() => route.go(`support/${schema}`)}>
                    One boutique in depth <ArrowRight size={14} />
                  </button>
                )}
              >
                <p>
                  Errors, the audit trail and every account in this boutique are on the One boutique in depth
                  screen, which fetches them in the same request as the figures above.
                </p>
              </Card>
            </div>
          </>
        );
      }}
    </Async>
  );
}

export default function BoutiqueDetail({ route }) {
  const schema = route.parts[1];
  const tab = route.parts[2] === 'data' ? 'data' : 'overview';

  if (!schema) {
    return <Empty title="No boutique named in the address."
      detail="Open one from the boutiques list."
      action={(
        <button type="button" className="btn-secondary" onClick={() => route.go('boutiques')}>
          Boutiques
        </button>
      )} />;
  }

  return (
    <>
      <button type="button" className="at-link" onClick={() => route.go('boutiques')}>
        <ArrowLeft size={14} /> All boutiques
      </button>

      <PageHeader
        title={schema}
        subtitle={tab === 'overview'
          // Said plainly: /support/ writes a data.view row, and this tab calls it.
          ? 'Usage, onboarding and modules. Opening this records a data.view entry in the audit log against your account.'
          : "Every table in this boutique's schema, read live. Read-only — the rules that keep this data correct live in the boutique's own API."}
      />

      <Tabs
        ariaLabel="Boutique"
        value={tab}
        onChange={(key) => route.go(key === 'data' ? `boutiques/${schema}/data` : `boutiques/${schema}`)}
        items={[
          { key: 'overview', label: 'Overview' },
          { key: 'data', label: 'Data', icon: Database },
        ]}
      />

      {tab === 'overview'
        ? <Overview key={schema} schema={schema} route={route} />
        : <DataBrowser key={schema} schema={schema} />}
    </>
  );
}
