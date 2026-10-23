/**
 * One boutique, everything a support call needs, on one page.
 *
 * The server assembles this in a single request rather than the console firing
 * six, because it is opened while somebody is on the phone. It also records a
 * `data.view` audit entry every time it is opened -- the console reaching into
 * one customer's data is exactly the access an audit trail exists to make
 * reviewable -- which is why nothing here loads until a boutique is chosen, and
 * why the subtitle says so. A person should know when their own use of a tool is
 * being written down.
 *
 * Every section links out, from its header, rather than acting. Suspending a boutique,
 * switching a module, resolving an error and deactivating a user all live on
 * screens that already do them properly, with their own confirmations and their
 * own audit reasons. A second copy here would be a second set of rules to keep
 * in step.
 */

import { useCallback } from 'react';
import {
  ArrowRight, Building2, CalendarClock, ClipboardList, Contact, FileWarning, PackageSearch,
  ScrollText, Sparkles, TrendingUp, Users, Wallet,
} from 'lucide-react';

import { consoleApi } from '../api';
import {
  Async, Card, Empty, KeyValue, Meter, Note, PageHeader, Pill, SectionHead, Select, Stat, StatGrid,
  Table, Toolbar, count, day, money, moment, useApi,
} from '../ui';

/**
 * Mirrors core.modules.is_enabled exactly, including its two odd cases.
 *
 * An absent key means ON (a tenant row written before a module existed has no
 * opinion, and no opinion must not read as off), and a malformed column -- the
 * field is a JSONField editable as free text in the Django admin -- also reads
 * as on, because that is what the middleware will actually do. Guessing
 * differently here would show a switch as off while every request sails through.
 */
const moduleOn = (enabled, key) => {
  if (!enabled || typeof enabled !== 'object' || Array.isArray(enabled)
      || Object.keys(enabled).length === 0) return true;
  return enabled[key] !== false;
};

const ERROR_COLUMNS = [
  { key: 'exception_type', label: 'Exception', render: (e) => <div className="at-row-title">{e.exception_type}</div> },
  { key: 'path', label: 'Path', render: (e) => <span className="sa-schema">{e.path}</span> },
  { key: 'count', label: 'Seen', numeric: true, render: (e) => count(e.count) },
  { key: 'severity', label: 'Severity', render: (e) => <Pill value={e.severity} /> },
  { key: 'status', label: 'Status', render: (e) => <Pill value={e.status} /> },
  { key: 'last_seen', label: 'Last seen', dataLabel: 'Last seen', className: 'sa-nowrap', render: (e) => moment(e.last_seen) },
];

const ACCOUNT_COLUMNS = [
  { key: 'username', label: 'Username', render: (u) => <div className="at-row-title">{u.username}</div> },
  {
    key: 'name',
    label: 'Name',
    render: (u) => `${u.first_name} ${u.last_name}`.trim() || <span className="sa-muted">—</span>,
  },
  { key: 'email', label: 'Email', render: (u) => u.email || <span className="sa-muted">—</span> },
  { key: 'role', label: 'Role' },
  {
    key: 'status',
    label: 'Status',
    render: (u) => (
      <Pill value={u.is_active ? 'active' : 'disabled'} label={u.is_active ? 'Active' : 'Deactivated'} />
    ),
  },
  {
    // Whether a token exists, never which token it is.
    key: 'token',
    label: 'Token',
    render: (u) => (
      <Pill value="token" tone={u.has_token ? 'ok' : 'muted'} label={u.has_token ? 'Live token' : 'None'} />
    ),
  },
  { key: 'joined', label: 'Joined', dataLabel: 'Joined', className: 'sa-nowrap', render: (u) => day(u.date_joined) },
];

const AUDIT_COLUMNS = [
  { key: 'when', label: 'When', dataLabel: 'When', className: 'sa-nowrap', render: (a) => moment(a.created_at) },
  { key: 'actor', label: 'Who' },
  { key: 'action_label', label: 'What' },
  { key: 'target', label: 'Target', render: (a) => <span className="sa-schema">{a.target}</span> },
  { key: 'reason', label: 'Reason', render: (a) => a.reason || <span className="sa-muted">none given</span> },
];

function Picker({ value, onChange }) {
  const state = useApi(useCallback(() => consoleApi.overview(), []));
  return (
    <Async state={state} skeletonRows={1}>
      {(data) => (
        <Select value={value} onChange={onChange} label="Boutique" options={[
          { value: '', label: 'Choose a boutique…' },
          ...data.boutiques.map((b) => ({
            value: b.schema_name,
            label: b.is_active ? b.name : `${b.name} (suspended)`,
          })),
        ]} />
      )}
    </Async>
  );
}

function Diagnostics({ schema, route }) {
  const state = useApi(useCallback(() => consoleApi.support(schema), [schema]));

  return (
    <Async state={state} skeletonRows={8}>
      {(data) => {
        const { boutique, usage, operations, onboarding, users, errors, audit, modules } = data;
        const off = (modules.modules || [])
          .filter((m) => !moduleOn(boutique.enabled_modules, m.key));

        return (
          <>
            <SectionHead title={boutique.name}
              subtitle={`${boutique.owner_email} · ${boutique.schema_name} · signed up ${day(boutique.created_on)}`}>
              <Pill value={boutique.is_active ? 'active' : 'suspended'} />
              <button type="button" className="at-link" onClick={() => route.go(`boutiques/${schema}`)}>
                Open boutique <ArrowRight size={14} />
              </button>
            </SectionHead>

            {!usage.healthy && (
              <Note tone="error">
                This boutique&apos;s schema could not be read, so every usage figure below is blank
                rather than zero. That is a missing or half-migrated schema — an engineering repair,
                not a boutique that has done nothing.
              </Note>
            )}

            <StatGrid label="Usage">
              <Stat icon={Users} label="Staff" value={count(usage.staff)} />
              <Stat icon={Contact} label="Customers" value={count(usage.customers)} />
              <Stat icon={ClipboardList} label="Orders" value={count(usage.orders)}
                note={`${count(usage.open_orders)} still open`} />
              <Stat icon={TrendingUp} label="Booked" value={usage.revenue === null ? '—' : money(usage.revenue)} />
              <Stat icon={Wallet} label="Collected" value={usage.collected === null ? '—' : money(usage.collected)} />
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
                ) : (
                  <p>{onboarding.detail}</p>
                )}
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
                    Every switchable module is on. Absent keys count as on — see
                    core.modules.is_enabled.
                  </p>
                ) : (
                  <>
                    <p>
                      {off.length} module(s) are switched off, so this boutique&apos;s staff get a 403
                      on those URLs and any onboarding step behind them is excluded from its
                      percentage rather than counted as failed:
                    </p>
                    <div className="sa-inline">
                      {off.map((m) => (
                        <Pill key={m.key} value="not_configured" label={m.label} />
                      ))}
                    </div>
                  </>
                )}
              </Card>

              <Card
                icon={ClipboardList}
                title="Order operations"
                actions={(
                  <button type="button" className="at-link" onClick={() => route.go('orders')}>
                    Orders monitor <ArrowRight size={14} />
                  </button>
                )}
              >
                <KeyValue items={[
                  ['Orders', count(operations.orders)],
                  ['Created today', count(operations.created?.today)],
                  ['Overdue', count(operations.overdue?.count)],
                  ['Queued messages', count(operations.queued_messages)],
                ]} />
                {/* The caveat travels with the number from superadmin/metrics.py
                    so that no screen can print the count on its own. */}
                {operations.overdue?.caveat && (
                  <p>
                    <strong>Overdue is an upper bound.</strong> {operations.overdue.caveat}
                  </p>
                )}
              </Card>
            </div>

            <SectionHead title="Recent errors"
              subtitle="Errors this boutique has hit, newest first.">
              <button type="button" className="at-link" onClick={() => route.go('errors')}>
                Crashes <ArrowRight size={14} />
              </button>
            </SectionHead>
            <Table
              columns={ERROR_COLUMNS}
              rows={errors}
              keyFor={(e) => e.id}
              empty={<Empty icon={<FileWarning size={20} />} title="No errors recorded for this boutique."
                detail="Unhandled server exceptions would appear here with a count and a fingerprint." />}
            />

            <SectionHead title="Accounts"
              subtitle={users.last_login_tracked ? undefined
                : 'Last sign-in is not recorded anywhere in this product, so there is no column for it.'}>
              <button type="button" className="at-link" onClick={() => route.go('users')}>
                All users <ArrowRight size={14} />
              </button>
            </SectionHead>
            <Table
              columns={ACCOUNT_COLUMNS}
              rows={users.users}
              keyFor={(u) => u.username}
              rowClassName={(u) => (u.is_active ? '' : 'sa-suspended')}
              empty={<Empty icon={<Users size={20} />} title="No accounts could be read in this boutique." />}
            />

            <SectionHead title="What admins did here"
              subtitle="Every console action taken on this boutique, newest first.">
              <button type="button" className="at-link" onClick={() => route.go('audit')}>
                Audit log <ArrowRight size={14} />
              </button>
            </SectionHead>
            <Table
              columns={AUDIT_COLUMNS}
              rows={audit}
              keyFor={(a, i) => `${a.created_at}-${i}`}
              empty={<Empty icon={<ScrollText size={20} />} title="Nothing has been done to this boutique."
                detail="Suspensions, module changes and account actions are recorded here with the reason typed at the time." />}
            />
          </>
        );
      }}
    </Async>
  );
}

export default function Support({ route }) {
  const schema = route.parts[1] || '';

  return (
    <>
      <PageHeader
        title="One boutique in depth"
        subtitle="Everything about one boutique on one page. Opening it is recorded under What admins did, because looking into a customer's data should leave a trace."
      />

      <Toolbar right={(
        <Picker value={schema}
          onChange={(next) => route.go(next ? `support/${next}` : 'support')} />
      )} />

      {schema
        ? <Diagnostics key={schema} schema={schema} route={route} />
        : <Empty icon={<Building2 size={20} />} title="Choose a boutique."
            detail="Nothing is fetched until you do, because fetching writes an audit entry against the boutique you look at." />}
    </>
  );
}
