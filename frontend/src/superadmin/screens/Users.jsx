/**
 * Every account on the platform, and the four things the console can do to one.
 *
 * Filtering and paging are the server's (superadmin/users.py). That list is one
 * queryset per boutique merged into a total order over (schema, username), so
 * re-slicing it in the browser would mean pulling every row of every boutique to
 * draw one page of fifty. Filters go into the query string; `qs()` in api.js
 * drops the empty ones so a cleared filter matches everything rather than
 * nothing.
 *
 * Two facts about this product decide what the table is allowed to say:
 *
 * `last_login` is never written. Nothing in this codebase calls Django's
 * login() -- the API issues DRF tokens instead -- so that column is NULL for
 * every account that has ever existed here. The envelope states it in
 * `last_login_tracked`, and this screen follows the envelope: "not tracked",
 * never "never signed in", which would be a false claim about the whole
 * platform rather than a fact about an account.
 *
 * `has_token` is a boolean and there is no token value beside it. The server
 * sends whether a key exists and never which key (superadmin/users.py:_rows_for)
 * -- otherwise read access to this console would be the ability to act as any
 * user in any boutique.
 */

import { useCallback, useMemo, useState } from 'react';
import { KeyRound, Link2, Mail, Pause, Play, Users as UsersIcon } from 'lucide-react';

import { consoleApi } from '../api';
import {
  Async, Chips, Confirm, Empty, Modal, Note, OneTimeLink, PageHeader, Pager, Pill, RowMenu,
  SearchBox, Select, Table, Toolbar, count, day, moment, useApi, useToast,
} from '../ui';

const PAGE_SIZE = 50;

/**
 * The role vocabulary, copied from the server that defines it.
 *
 * `role` is not a column anywhere -- superadmin/users.py resolves it per row
 * from three tables and the registry, and filters the merged list in Python --
 * so there is no endpoint to read the choices from. The list is
 * Tailor.ROLE_CHOICES (crm_api/models.py) plus the two roles that are not
 * Tailor profiles at all: OWNER and DESIGNER in core/roles.py. Keep it in step
 * with those two files; the server matches case-insensitively.
 */
const ROLES = [
  'Owner', 'Designer', 'Master', 'Tailor', 'Maggam Master', 'Karigar',
  'Maggam Karigar', 'Packaging Staff', 'QC Staff',
];

/**
 * What each action does, in the words someone needs before confirming it.
 *
 * Every one of them is audited with the typed reason (UserActionView.post), so
 * every one of them asks for a reason -- including the two that are not
 * destructive, because "who reset this person's password and why" is the
 * question the log exists to answer.
 */
const ACTIONS = {
  deactivate: {
    verb: 'Deactivate',
    danger: true,
    body: 'They cannot sign in from anywhere. Their token is left in place — '
      + 'DRF refuses an inactive user at the next request, so the key stops '
      + 'working without being deleted, and starts working again if you '
      + 'reactivate them. A boutique owner cannot be deactivated: the server '
      + 'refuses, because there would be no route back in for them.',
  },
  activate: {
    verb: 'Activate',
    body: 'They can sign in again straight away. Any token they already had '
      + 'starts working again with them.',
  },
  revoke: {
    verb: 'Revoke sessions',
    danger: true,
    body: 'Deletes their API token, which signs them out of every device. They '
      + 'can sign in again a second later and get a fresh key — this ends the '
      + 'current sessions, it does not lock the account. Deactivate does that.',
  },
  'reset-password': {
    verb: 'Send password reset',
    body: 'Sends the boutique\'s own reset email to the address on the account. '
      + 'Their current password keeps working until they use the link.',
  },
  'access-link': {
    verb: 'Get sign-in link',
    body: 'Creates a one-time link that lets them choose their own password, and '
      + 'shows it to you so you can send it however you normally reach them. '
      + 'This is how you hand a boutique its access without anybody having to '
      + 'know a password: you never see one, and neither does the audit log. '
      + 'Their current password, if they have one, keeps working until the link '
      + 'is used. It is also emailed automatically when the platform has a mail '
      + 'server configured and the account has an address.',
  },
};

export default function Users({ route }) {
  const toast = useToast();
  const [filters, setFilters] = useState({ q: '', boutique: '', role: '', status: '' });
  const [page, setPage] = useState(1);
  const [pending, setPending] = useState(null);
  const [issued, setIssued] = useState(null);
  const [busy, setBusy] = useState(false);

  // Any filter change returns to page 1. Page 4 of the old filter is usually
  // past the end of the new one, and an empty table there reads as "no such
  // user" when it means "wrong page".
  const set = (key) => (value) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  };

  const state = useApi(
    useCallback(() => consoleApi.users({ ...filters, page, page_size: PAGE_SIZE }),
                [filters, page]),
    [filters, page],
  );

  // Read only for the boutique filter's options. It is deliberately not fed to
  // <Async>: if the overview fails, the console loses one dropdown, not the
  // list of users.
  const overview = useApi(useCallback(() => consoleApi.overview(), []));

  const boutiques = useMemo(() => [
    { value: '', label: 'All boutiques' },
    ...(overview.data?.boutiques || []).map((b) => ({ value: b.schema_name, label: b.name })),
  ], [overview.data]);

  const run = async (reason) => {
    const { user, action } = pending;
    setBusy(true);
    try {
      const result = action === 'access-link'
        ? await consoleApi.accessLink(user.boutique, user.username, reason)
        : await consoleApi.userAction(user.boutique, user.username, action, reason);
      toast(result.message);
      // The link is held in state only long enough to be copied, and only ever
      // here -- never in localStorage, never in the URL. Closing the panel
      // drops it, which is the same lifetime the server gives the token.
      if (action === 'access-link' && result.link) setIssued({ user, ...result });
      state.reload();
    } catch (e) {
      // A refusal arrives as HTTP 400 carrying the server's own sentence --
      // deactivating an owner, resetting a password on an address that resolves
      // to a different boutique. That is an answer to the question, not a
      // fault, so it is shown as written and nothing is retried.
      toast(e.message, 'off');
    } finally {
      setBusy(false);
      setPending(null);
    }
  };

  const act = ACTIONS[pending?.action];

  // The table's columns. `tracked` is the envelope's last_login_tracked -- see
  // the file header for why the last sign-in column follows it.
  const columnsFor = (tracked) => [
    {
      key: 'account',
      label: 'Account',
      render: (u) => {
        const name = [u.first_name, u.last_name].filter(Boolean).join(' ');
        return (
          <>
            <div className="at-row-title">{name || u.username}</div>
            {name && <div className="sa-schema">{u.username}</div>}
            <div className="at-row-sub">{u.email || <span className="sa-muted">no email on file</span>}</div>
          </>
        );
      },
    },
    {
      key: 'boutique',
      label: 'Boutique',
      render: (u) => (
        <>
          <button type="button" className="at-link" onClick={() => route.go(`boutiques/${u.boutique}`)}>
            {u.boutique_name}
          </button>
          <div className="sa-schema">{u.boutique}</div>
        </>
      ),
    },
    {
      key: 'role',
      label: 'Role',
      render: (u) => (
        <>
          {u.role || <span className="sa-muted">—</span>}
          {/* Where the role came from. Owner is resolved from the
              registry, everything else from one of these two. */}
          {u.tailor_id && <div className="at-row-sub">tailor #{u.tailor_id}</div>}
          {u.designer_id && <div className="at-row-sub">designer profile</div>}
        </>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (u) => (
        <Pill value={u.is_active ? 'active' : 'disabled'}
          label={u.is_active ? 'Active' : 'Deactivated'} />
      ),
    },
    {
      key: 'token',
      label: 'API token',
      // A boolean. There is no key to show and there must not be one -- see
      // the file header.
      render: (u) => (
        <Pill value="token" tone={u.has_token ? 'ok' : 'muted'}
          label={u.has_token ? 'Live token' : 'None'} />
      ),
    },
    {
      key: 'joined',
      label: 'Joined',
      // sa-nowrap keeps "12 Sept 2025" on one line on desktop; stacked cards
      // below 1024px still wrap it.
      className: 'sa-nowrap',
      render: (u) => day(u.date_joined) || '—',
    },
    {
      key: 'last_login',
      label: 'Last sign-in',
      className: 'sa-nowrap',
      render: (u) => (tracked
        ? (moment(u.last_login) || <span className="sa-muted">—</span>)
        : <Pill value="not_tracked" label="Not tracked" />),
    },
    {
      // Sticky, like Boutiques: this table is wide enough to scroll on a
      // laptop and the actions are the point of it. One primary action stays
      // visible; the other three sit behind the workspace ⋯ menu, which keeps
      // the sticky column narrow enough not to cover the columns beside it.
      key: 'actions',
      label: '',
      dataLabel: 'Actions',
      className: 'sa-actions sa-sticky-end',
      render: (u) => (
        <div className="sa-inline sa-inline--end">
          <button type="button"
            className={`btn-secondary at-btn-sm${u.is_active ? ' at-btn-danger' : ''}`}
            onClick={() => setPending({
              user: u, action: u.is_active ? 'deactivate' : 'activate',
            })}>
            {u.is_active
              ? <><Pause size={14} /> Deactivate</>
              : <><Play size={14} /> Activate</>}
          </button>
          <RowMenu label={`More actions for ${u.username}`} items={[
            // Disabled with no live token: there is nothing to revoke.
            { label: 'Revoke', icon: <KeyRound size={14} />, danger: true,
              disabled: !u.has_token,
              title: u.has_token ? undefined : 'No live token to revoke.',
              onClick: () => setPending({ user: u, action: 'revoke' }) },
            // Works with no email address on file and with no mail server,
            // which is why it sits before Reset: it is the one that always
            // has an answer. Disabled until the account is reactivated.
            { label: 'Sign-in link', icon: <Link2 size={14} />,
              disabled: !u.is_active,
              title: u.is_active ? 'Create a one-time link you can send them'
                : 'Reactivate the account first.',
              onClick: () => setPending({ user: u, action: 'access-link' }) },
            // The reset view skips inactive users silently, so offering it
            // there would promise an email nobody sends.
            { label: 'Reset', icon: <Mail size={14} />,
              disabled: !u.is_active,
              title: u.is_active ? undefined
                : 'Reactivate the account first — password resets skip deactivated users.',
              onClick: () => setPending({ user: u, action: 'reset-password' }) },
          ]} />
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Staff accounts"
        subtitle="Every staff account on every boutique. Deactivate, sign out everywhere, or send a one-time sign-in link. The product does not record last sign-in, so that column says not tracked."
      />

      {/* Status as workspace chips on the left (the server sends no
          per-status counts, so none are shown); search and the long boutique
          and role lists stay on the right. */}
      <Toolbar right={(
        <>
          <SearchBox value={filters.q} onChange={set('q')} placeholder="Name, username or email…" />
          <Select value={filters.boutique} onChange={set('boutique')} label="Boutique"
            options={boutiques} />
          <Select value={filters.role} onChange={set('role')} label="Role" options={[
            { value: '', label: 'All roles' },
            ...ROLES.map((r) => ({ value: r, label: r })),
          ]} />
        </>
      )}>
        <Chips label="Status" value={filters.status} onChange={set('status')} options={[
          { key: '', label: 'All' },
          { key: 'active', label: 'Active' },
          { key: 'inactive', label: 'Deactivated' },
        ]} />
      </Toolbar>

      {overview.error && (
        <Note tone="info">
          The boutique list did not load, so that filter only offers “All boutiques”.
          Everything else on this screen is unaffected.
        </Note>
      )}

      <Async
        state={state}
        // Not `users.length === 0` alone: a sweep where every boutique failed
        // returns no users and a full `unreadable` list, and "no accounts yet"
        // would be the wrong answer to that.
        isEmpty={(d) => d.users.length === 0 && d.unreadable.length === 0}
        empty={<Empty icon={<UsersIcon size={20} />} title="No staff accounts anywhere yet."
          detail="Accounts appear here as boutiques sign up and add their team." />}
      >
        {(data) => (
          <>
            {data.unreadable.length > 0 && (
              <Note tone="error">
                {count(data.unreadable.length)} boutique schema(s) could not be read, so nobody from
                them is listed or counted below: {data.unreadable.join(', ')}.
              </Note>
            )}

            <Table
              columns={columnsFor(data.last_login_tracked)}
              rows={data.users}
              keyFor={(u) => `${u.boutique}/${u.username}`}
              rowClassName={(u) => (u.is_active ? '' : 'sa-suspended')}
              empty={(
                <Empty title="No account matches those filters."
                  detail="Clear the search, or widen the boutique, role and status filters." />
              )}
            />

            <Pager page={data.page} pages={data.pages} onPage={setPage} total={data.count} />
          </>
        )}
      </Async>

      {issued && (
        <Modal
          title={`Sign-in link for ${issued.user.username}`}
          icon={Link2}
          width="560px"
          onClose={() => setIssued(null)}
          footer={(
            <button type="button" className="btn-secondary" onClick={() => setIssued(null)}>
              Done
            </button>
          )}
        >
          <div className="sa-dialog-text">
            <p>
              Send this to <strong>{issued.user.username}</strong> at{' '}
              {issued.boutique || issued.user.boutique_name}. Opening it lets them
              set their own password and signs them in.
              {issued.emailed
                ? ` It has also been emailed to ${issued.email_address}.`
                : ' The platform has no mail server configured, so it has not been'
                  + ' emailed — you need to deliver it yourself.'}
            </p>
          </div>
          <OneTimeLink value={issued.link} expiresMinutes={issued.expires_minutes} />
        </Modal>
      )}

      <Confirm
        open={Boolean(pending)}
        danger={act?.danger}
        requireReason
        busy={busy}
        title={pending && `${act.verb}: ${pending.user.username}?`}
        body={pending && (
          <>
            <p>
              <strong>{pending.user.username}</strong> at {pending.user.boutique_name}
              {pending.user.role && ` · ${pending.user.role}`}
            </p>
            <p>{act.body}</p>
          </>
        )}
        confirmLabel={act?.verb}
        onCancel={() => setPending(null)}
        onConfirm={run}
      />
    </>
  );
}
