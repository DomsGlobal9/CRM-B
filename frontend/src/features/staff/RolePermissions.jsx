import { useEffect, useState } from 'react';
import {
  BarChart2, Check, ClipboardList, Package, Palette, Receipt, Save, Scissors, Settings, Shield,
  ShoppingBag, Store, UserCog, Users, Wallet,
} from 'lucide-react';

import { InfoNote } from '../../components/ui/Atelier';
import { ASSIGNABLE_ROLES } from '../../constants/roles';
import { api } from '../../services/api';

const panel = {
  background: 'var(--surface-color)',
  border: '1px solid var(--border-color)',
  borderRadius: 'var(--radius-lg)',
  boxShadow: 'var(--shadow-sm)',
};

// The work the owner can hand to a role, per section of the app.
// Must match core/admin_access.py (ADMIN_TASKS).
const SECTIONS = [
  { key: 'dashboard', label: 'Dashboard', icon: Store, tasks: [
    ['view', "See the dashboard and today's figures"],
  ] },
  { key: 'orders', label: 'Orders', icon: ShoppingBag, tasks: [
    ['create', 'Create new orders'],
    ['edit', 'Edit order details'],
    ['stage', 'Update order stage and status'],
    ['delivery_date', 'Set and change delivery dates'],
    ['payments', 'Record payments and advances'],
    ['discounts', 'Give discounts'],
    ['invoices', 'Make and send invoices'],
    ['notify', 'Send order updates to customers'],
    ['deliver', 'Mark orders as delivered'],
    ['cancel', 'Cancel orders'],
  ] },
  { key: 'workshop', label: 'Workshop', icon: Scissors, tasks: [
    ['assign', 'Assign garments to tailors and karigars'],
    ['reassign', 'Reassign delayed work'],
    ['move', 'Move work between stages'],
    ['materials', 'Issue fabrics and materials to jobs'],
    ['review', 'Review and approve finished work'],
    ['quality', 'Quality check before delivery'],
    ['alterations', 'Handle alterations'],
    ['track', 'Track daily production'],
  ] },
  { key: 'customers', label: 'Customers', icon: Users, tasks: [
    ['add', 'Add new customers'],
    ['edit', 'Edit customer details'],
    ['measurements', 'Take and update measurements'],
    ['leads', 'Manage leads and follow-ups'],
    ['history', 'See customer order history'],
    ['message', 'Message customers'],
    ['import', 'Import customers in bulk'],
    ['delete', 'Delete customers'],
  ] },
  { key: 'design', label: 'Design Studio', icon: Palette, tasks: [
    ['view', 'See every design board'],
    ['upload', 'Upload, edit and delete designs'],
    ['approve', 'Approve or reject submitted designs'],
    ['boards', 'Build design boards and collections'],
    ['assign', 'Assign design work to designers'],
  ] },
  { key: 'inventory', label: 'Inventory', icon: Package, tasks: [
    ['view', 'See stock and item details'],
    ['items', 'Add and edit stock items and recipes'],
    ['stock', 'Receive, issue and adjust stock'],
    ['transfer', 'Move stock between locations (warehouse to shop)'],
    ['suppliers', 'Manage suppliers and purchase orders'],
    ['reports', 'See stock reports'],
  ] },
  { key: 'team', label: 'Team', icon: UserCog, tasks: [
    ['view', 'See the whole team'],
    ['manage', 'Add and edit team members'],
    ['attendance', 'Manage attendance and timesheets'],
    ['documents', 'Manage staff documents'],
    ['reviews', 'Write performance reviews'],
    ['todos', 'Assign tasks to the team'],
    ['payroll', "Run payroll (shows everyone's pay)"],
  ] },
  { key: 'finance', label: 'Profit & Costs', icon: Wallet, tasks: [
    ['view', 'See profit and costs'],
    ['expenses', 'Record and edit expenses'],
  ] },
  { key: 'invoices', label: 'Invoices', icon: Receipt, tasks: [
    ['view', 'See all invoices'],
    ['template', 'Change the invoice design'],
  ] },
  { key: 'analytics', label: 'Analytics', icon: BarChart2, tasks: [
    ['view', 'See business analytics'],
  ] },
  { key: 'settings', label: 'Settings', icon: Settings, tasks: [
    ['edit', 'Change boutique settings and workflow'],
  ] },
];
const TASK_LABEL = Object.fromEntries(
  SECTIONS.flatMap(({ key, tasks }) => tasks.map(([k, text]) => [`${key}.${k}`, text])));

const roleLabel = (value) => ASSIGNABLE_ROLES.find((r) => r.value === value)?.label || value;

// Saved to /boutique-settings/admin-access/ (crm_api/views.py) as
// {roles: {role: [task, ...]}}; everyone in a role then signs in with its
// tasks as admin_tasks, which open the matching menus and actions.
export default function RolePermissions() {
  const [roleNames, setRoleNames] = useState(null);
  const [byRole, setByRole] = useState({});
  const [active, setActive] = useState('');
  const [headcount, setHeadcount] = useState({});
  const [previous, setPrevious] = useState(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([api.getTailors().catch(() => []), api.getDesigners().catch(() => [])])
      .then(([staff, designers]) => {
        const counts = {};
        (Array.isArray(staff) ? staff : []).forEach((m) => { counts[m.role] = (counts[m.role] || 0) + 1; });
        const designerRows = Array.isArray(designers) ? designers : (designers?.results || []);
        if (designerRows.length) counts.Designer = designerRows.length;
        setHeadcount(counts);
      });
    api.getAdminAccess()
      .then((data) => {
        const names = data.role_names || [];
        setRoleNames(names);
        setByRole(Object.fromEntries(Object.entries(data.roles || {}).map(([r, t]) => [r, new Set(t)])));
        setActive((prev) => prev || names[0] || '');
        setPrevious(data.previous_admin || null);
        setSaved(true);
      })
      .catch((e) => { setRoleNames([]); setError(e.message); });
  }, []);

  const tasks = byRole[active] || new Set();

  const save = async () => {
    setSaving(true); setError(null);
    try {
      const roles = Object.fromEntries(
        Object.entries(byRole).filter(([, set]) => set.size).map(([r, set]) => [r, [...set]]));
      await api.saveAdminAccess({ roles });
      setSaved(true);
      setPrevious(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const flip = (role, keys, on) => {
    setByRole((prev) => {
      const next = new Set(prev[role] || []);
      keys.forEach((k) => (on ? next.add(k) : next.delete(k)));
      return { ...prev, [role]: next };
    });
    setSaved(false);
  };

  const restorePrevious = () => {
    if (!previous) return;
    flip(previous.role, previous.tasks, true);
    setActive(previous.role);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      <InfoNote icon={Shield} tone="neutral" title="Work by role">
        Pick a role, then tick the extra work everyone in that role may do. The owner always has full access.
        People see the change the next time they sign in.
      </InfoNote>

      {previous && (
        <InfoNote icon={Shield} tone="amber" title="The old Admin setting no longer applies">
          {previous.name} ({roleLabel(previous.role)}) was the Admin with {previous.tasks.length}{' '}
          {previous.tasks.length === 1 ? 'task' : 'tasks'}:{' '}
          {previous.tasks.map((t) => TASK_LABEL[t] || t).join(', ')}. Work is now handed to a whole role.{' '}
          <button type="button" className="at-link" onClick={restorePrevious}>
            Tick these for {roleLabel(previous.role)}
          </button>{' '}
          and save to give them to everyone in that role, or leave them off.
        </InfoNote>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-5)', alignItems: 'flex-start' }}>
        {/* Every role the owner can hand work to. */}
        <section aria-label="Roles" style={{ ...panel, flex: '1 1 260px', maxWidth: '100%', padding: 'var(--space-4)',
                                             display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <div style={{ padding: '0 var(--space-1) var(--space-2)' }}>
            <div style={{ fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-lg)' }}>Roles</div>
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
              Choose a role to see and change its work.
            </div>
          </div>
          {roleNames === null && (
            <div style={{ padding: 'var(--space-2)', color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>Loading roles…</div>
          )}
          {roleNames?.map((role) => {
            const on = role === active;
            const count = (byRole[role] || new Set()).size;
            const people = headcount[role] || 0;
            return (
              <button key={role} type="button" onClick={() => setActive(role)} aria-pressed={on}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px',
                               width: '100%', textAlign: 'left', padding: '10px 12px', cursor: 'pointer',
                               borderRadius: 'var(--radius-md)', font: 'inherit', color: 'var(--text-primary)',
                               border: `1px solid ${on ? 'var(--primary-color)' : 'transparent'}`,
                               background: on ? 'var(--bg-secondary)' : 'transparent' }}>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontWeight: 'var(--weight-semibold)' }}>{roleLabel(role)}</span>
                  <span style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                    {people === 0 ? 'Nobody yet' : `${people} ${people === 1 ? 'person' : 'people'}`}
                  </span>
                </span>
                <span style={{ flexShrink: 0, fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-medium)',
                               color: count ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                  {count ? `${count} ${count === 1 ? 'task' : 'tasks'}` : 'No extra work'}
                </span>
              </button>
            );
          })}
        </section>

        {/* What the chosen role handles */}
        <section aria-label={active ? `Work for ${roleLabel(active)}` : 'Work'}
                 style={{ ...panel, flex: '999 1 480px', minWidth: 0, overflow: 'hidden' }}>
          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap',
                           gap: 'var(--space-3)', padding: 'var(--space-4) var(--space-5)',
                           borderBottom: '1px solid var(--border-color)' }}>
            <div>
              <div style={{ fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-lg)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ClipboardList size={18} /> {active ? `Work for ${roleLabel(active)}` : 'Work'}
              </div>
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                Tick what everyone in this role may do. Anything left unticked stays with you.
              </div>
            </div>
            <button type="button" className="btn-primary" onClick={save} disabled={saving || saved || roleNames === null}>
              {saving ? 'Saving…' : saved ? <><Check size={15} /> Saved</> : <><Save size={15} /> Save</>}
            </button>
          </header>
          {error && (
            <div role="alert" style={{ padding: 'var(--space-3) var(--space-5)', color: 'var(--danger-color, #b91c1c)',
                                       borderBottom: '1px solid var(--border-color)', fontSize: 'var(--text-sm)' }}>
              {error}
            </div>
          )}

          {active && SECTIONS.map(({ key: section, label, icon: Icon, tasks: list }) => {
            const keys = list.map(([k]) => `${section}.${k}`);
            const ticked = keys.filter((k) => tasks.has(k)).length;
            const all = ticked === keys.length;
            return (
              <section key={section} aria-label={label} style={{ padding: 'var(--space-4) var(--space-5)',
                                               borderBottom: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', marginBottom: 'var(--space-3)' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontWeight: 'var(--weight-semibold)' }}>
                    <Icon size={16} /> {label}
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 'var(--weight-medium)' }}>
                      {ticked}/{keys.length}
                    </span>
                  </span>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: 'var(--text-sm)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={all} onChange={() => flip(active, keys, !all)}
                           ref={(el) => { if (el) el.indeterminate = ticked > 0 && !all; }}
                           style={{ accentColor: 'var(--primary-color)' }} />
                    Select all
                  </label>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '8px 16px' }}>
                  {list.map(([k, text]) => {
                    const id = `${section}.${k}`;
                    return (
                      <label key={id} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '4px 0' }}>
                        <input type="checkbox" checked={tasks.has(id)} onChange={(e) => flip(active, [id], e.target.checked)}
                               style={{ width: '18px', height: '18px', accentColor: 'var(--primary-color)', flexShrink: 0 }} />
                        {text}
                      </label>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </section>
      </div>
    </div>
  );
}
