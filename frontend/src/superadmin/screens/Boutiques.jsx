/**
 * Every boutique on the platform, with its live figures.
 *
 * The counts are read from inside each boutique's own Postgres schema, which is
 * why nothing here can be sorted or filtered by the server: they are not columns
 * in the table being listed. Sorting and searching therefore happen in the
 * browser over an already-complete list, which is honest at the tens of
 * boutiques this product has. Past a few hundred the list itself needs
 * server-side paging and the counts need a rollup table -- the server says the
 * same thing in superadmin/metrics.py.
 */

import { useCallback, useMemo, useState } from 'react';
import {
  Building2, ClipboardList, Contact, Database, Pause, Play, Trash2, TrendingUp, Users, Wallet,
} from 'lucide-react';

import { consoleApi } from '../api';
import {
  Async, Chips, Confirm, Empty, Modal, Note, PageHeader, Pill, RowMenu, SearchBox, Select, Stat,
  StatGrid, Table, Toolbar, count, day, money, since, useApi, useToast,
} from '../ui';

const SORTS = [
  { value: 'name', label: 'Name' },
  { value: 'orders', label: 'Orders' },
  { value: 'revenue', label: 'Order value' },
  { value: 'customers', label: 'Customers' },
  { value: 'last_order', label: 'Last order' },
  { value: 'created_on', label: 'Signed up' },
];

export default function Boutiques({ route }) {
  const toast = useToast();
  const [term, setTerm] = useState('');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState('name');
  const [pending, setPending] = useState(null);
  const [deleting, setDeleting] = useState(null); // { boutique, agreed, busy }

  const state = useApi(useCallback(() => consoleApi.overview(), []));

  const rows = useMemo(() => {
    if (!state.data) return [];
    const needle = term.trim().toLowerCase();
    return state.data.boutiques
      .filter((b) => {
        if (status === 'active' && !b.is_active) return false;
        if (status === 'suspended' && b.is_active) return false;
        if (status === 'unreadable' && b.healthy) return false;
        if (!needle) return true;
        return `${b.name} ${b.owner_email} ${b.schema_name}`.toLowerCase().includes(needle);
      })
      .sort((a, b) => {
        if (sort === 'name') return a.name.localeCompare(b.name);
        if (sort === 'created_on') return String(b.created_on).localeCompare(String(a.created_on));
        if (sort === 'last_order') return String(b.last_order || '').localeCompare(String(a.last_order || ''));
        return (b[sort] || 0) - (a[sort] || 0);
      });
  }, [state.data, term, status, sort]);

  const apply = async (reason) => {
    const { boutique, next } = pending;
    try {
      await (next ? consoleApi.reactivate : consoleApi.suspend)(boutique.schema_name, reason);
      toast(`${boutique.name} ${next ? 'reactivated' : 'suspended'}.`);
      setPending(null);
      state.reload();
    } catch (e) {
      toast(e.message, 'off');
      setPending(null);
    }
  };

  const destroy = async () => {
    const { boutique } = deleting;
    setDeleting((d) => ({ ...d, busy: true }));
    try {
      await consoleApi.deleteBoutique(boutique.schema_name, boutique.name);
      toast(`${boutique.name} deleted.`);
      setDeleting(null);
      state.reload();
    } catch (e) {
      toast(e.message, 'off');
      setDeleting((d) => ({ ...d, busy: false }));
    }
  };

  const columns = [
    {
      key: 'boutique',
      label: 'Boutique',
      render: (b) => (
        <>
          <button type="button" className="at-link"
            onClick={() => route.go(`boutiques/${b.schema_name}`)}>
            {b.name}
          </button>
          <div className="at-row-sub">{b.owner_email}</div>
          <div className="sa-schema">{b.schema_name}</div>
        </>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (b) => (
        <div className="sa-inline">
          <Pill value={b.is_active ? 'active' : 'suspended'} />
          {!b.healthy && <Pill value="warning" label="Unreadable" />}
        </div>
      ),
    },
    { key: 'staff', label: 'Staff', numeric: true, render: (b) => count(b.staff) },
    { key: 'customers', label: 'Customers', numeric: true, render: (b) => count(b.customers) },
    { key: 'orders', label: 'Orders', numeric: true, render: (b) => count(b.orders) },
    { key: 'open_orders', label: 'Open', numeric: true, render: (b) => count(b.open_orders) },
    {
      key: 'revenue', label: 'Booked', numeric: true,
      render: (b) => (b.revenue === null ? '—' : money(b.revenue)),
    },
    {
      key: 'collected', label: 'Collected', numeric: true,
      render: (b) => (b.collected === null ? '—' : money(b.collected)),
    },
    {
      key: 'last_order',
      label: 'Last order',
      className: 'sa-nowrap',
      render: (b) => {
        const last = since(b.last_order);
        return (
          <>
            <Pill value={last.tone === 'ok' ? 'healthy' : 'warning'} label={last.text} />
            {b.last_order && <div className="at-row-sub">{day(b.last_order)}</div>}
          </>
        );
      },
    },
    {
      // The row's actions behind one ⋯ button: the workspace RowMenu, which
      // portals its menu to <body> so the sticky Action cells below it cannot
      // paint over it, and keeps one menu open at a time.
      key: 'action',
      label: 'Action',
      className: 'sa-actions sa-sticky-end',
      render: (b) => (
        <RowMenu items={[
          { label: 'Data', icon: <Database size={14} />,
            onClick: () => route.go(`boutiques/${b.schema_name}/data`) },
          b.is_active
            ? { label: 'Suspend', icon: <Pause size={14} />, danger: true,
                onClick: () => setPending({ boutique: b, next: false }) }
            : { label: 'Reactivate', icon: <Play size={14} />,
                onClick: () => setPending({ boutique: b, next: true }) },
          // The template schema is what signup clones; it is not a boutique.
          ...(b.schema_name === 'tenant_base' ? [] : [{
            label: 'Delete', icon: <Trash2 size={14} />, danger: true,
            onClick: () => setDeleting({ boutique: b, agreed: false, busy: false }),
          }]),
        ]} />
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="All boutiques"
        subtitle="Every boutique on the platform, counted live. Open one for its data, or suspend it."
      />

      <Async
        state={state}
        isEmpty={(d) => d.boutiques.length === 0}
        empty={<Empty icon={<Building2 size={20} />} title="No boutiques have signed up yet." />}
      >
        {(data) => (
          <>
            <StatGrid>
              <Stat icon={Building2} label="Boutiques" value={count(data.totals.boutiques)}
                note={`${count(data.totals.active)} active · ${count(data.totals.suspended)} suspended`} />
              <Stat icon={Users} label="Staff accounts" value={count(data.totals.staff)} />
              <Stat icon={Contact} label="Customers" value={count(data.totals.customers)} />
              <Stat icon={ClipboardList} label="Orders" value={count(data.totals.orders)}
                note={`${count(data.totals.open_orders)} still open`} />
              <Stat icon={TrendingUp} label="Booked" value={money(data.totals.revenue)}
                note="Sum of order totals" />
              <Stat icon={Wallet} label="Collected" value={money(data.totals.collected)}
                note="Sum of amounts actually paid" />
            </StatGrid>

            {data.totals.unreadable > 0 && (
              <Note tone="error">
                {count(data.totals.unreadable)} boutique schema(s) could not be read, so the totals
                above exclude them. They are marked <em>Unreadable</em> below.
              </Note>
            )}

            {/* Status as workspace chips on the left, counted from the same
                totals as the tiles above; search and sort on the right. */}
            <Toolbar right={(
              <>
                <SearchBox value={term} onChange={setTerm} placeholder="Name, owner or schema…" />
                <Select value={sort} onChange={setSort} label="Sort by"
                  options={SORTS.map((s) => ({ value: s.value, label: `Sort: ${s.label}` }))} />
              </>
            )}>
              <Chips label="Status" value={status} onChange={setStatus} options={[
                { key: 'all', label: 'All', count: count(data.totals.boutiques) },
                { key: 'active', label: 'Active', count: count(data.totals.active) },
                { key: 'suspended', label: 'Suspended', count: count(data.totals.suspended) },
                { key: 'unreadable', label: 'Unreadable', count: count(data.totals.unreadable) },
              ]} />
            </Toolbar>

            <Table
              columns={columns}
              rows={rows}
              keyFor={(b) => b.schema_name}
              rowClassName={(b) => (b.is_active ? '' : 'sa-suspended')}
              empty={(
                <Empty title="No boutique matches those filters."
                  detail="Clear the search or widen the status filter." />
              )}
            />
          </>
        )}
      </Async>

      <Confirm
        open={Boolean(pending)}
        danger={pending && !pending.next}
        requireReason
        title={pending && (pending.next ? `Reactivate ${pending.boutique.name}?` : `Suspend ${pending.boutique.name}?`)}
        body={pending && (pending.next
          ? 'Their team can sign in again straight away. Nothing else changes.'
          : 'Everyone there is signed out of the app and the API until you reactivate it. No data is deleted, and reactivating restores the boutique exactly as it was.')}
        confirmLabel={pending && (pending.next ? 'Reactivate' : 'Suspend')}
        onCancel={() => setPending(null)}
        onConfirm={apply}
      />

      {/* Deleting drops the whole schema. One tick to say so is enough of a
          pause; the server still gets the boutique's name back as its guard. */}
      {deleting && (() => {
        const { boutique, agreed, busy } = deleting;
        const close = () => { if (!busy) setDeleting(null); };
        return (
          <Modal
            title="Delete this boutique?"
            icon={Trash2}
            tone="rose"
            width="460px"
            busy={busy}
            onClose={close}
            footer={(
              <>
                <button type="button" className="btn-secondary" onClick={close} disabled={busy}>
                  Cancel
                </button>
                <button type="button" className="btn-secondary at-btn-danger" onClick={destroy}
                  disabled={busy || !agreed}>
                  {busy ? 'Deleting…' : 'Delete'}
                </button>
              </>
            )}
          >
            <div className="sa-dialog-text">
              <p><strong>{boutique.name}</strong></p>
              <p>All of its data will be deleted: customers, orders, staff, everything.</p>
              <p><strong>This action cannot be undone.</strong></p>
            </div>
            <label className="at-check-card">
              <input type="checkbox" checked={agreed} autoFocus
                onChange={(e) => setDeleting((d) => ({ ...d, agreed: e.target.checked }))} />
              <span className="at-check-card-title">I understand. Delete this boutique and all its data.</span>
            </label>
          </Modal>
        );
      })()}
    </>
  );
}
