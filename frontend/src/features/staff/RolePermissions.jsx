import { useState } from 'react';
import { Check, RotateCw, Save, Shield } from 'lucide-react';

import { InfoNote } from '../../components/ui/Atelier';
import { DESIGNER_ROLE, STAFF_ROLES } from '../../constants/roles';

const panel = {
  background: 'var(--surface-color)',
  border: '1px solid var(--border-color)',
  borderRadius: 'var(--radius-lg)',
  boxShadow: 'var(--shadow-sm)',
};

const ROLES = [DESIGNER_ROLE, ...STAFF_ROLES];

const ACTIONS = [
  ['view', 'View'],
  ['add', 'Add'],
  ['edit', 'Edit'],
  ['delete', 'Delete'],
];

// Mirrors the sidebar, so the owner recognises what they are switching.
const SECTIONS = [
  ['Overview', [['dashboard', 'Dashboard'], ['orders', 'Orders'], ['workshop', 'Workshop'],
                ['customers', 'Customers'], ['leads', 'Leads'], ['todos', 'To-do']]],
  ['Design', [['design_library', 'Design Library']]],
  ['Stock', [['inventory', 'Fabrics & Materials']]],
  ['Team', [['staff', 'Team roster'], ['tasks', 'Tasks'], ['attendance', 'Attendance'],
            ['payroll', 'Payroll'], ['performance', 'Performance']]],
];

const SUPERVISORS = new Set(['Master', 'Designer']);

// ponytail: placeholder defaults until this is wired to /api/boutique-settings/role-modules/.
function defaultsFor(role) {
  const out = {};
  for (const [, items] of SECTIONS) {
    for (const [key] of items) {
      const floor = ['workshop', 'todos', 'tasks', 'attendance', 'performance'].includes(key);
      const view = floor || (SUPERVISORS.has(role) && key !== 'payroll');
      out[key] = { view, add: view && SUPERVISORS.has(role) && key !== 'staff', edit: false, delete: false };
    }
  }
  return out;
}

const initial = () => Object.fromEntries(ROLES.map((r) => [r.value, defaultsFor(r.value)]));

export default function RolePermissions() {
  const [perms, setPerms] = useState(initial);
  const [role, setRole] = useState(ROLES[0].value);
  const [saved, setSaved] = useState(false);
  const current = perms[role];

  const update = (next) => { setPerms((p) => ({ ...p, [role]: next })); setSaved(false); };

  // Add, edit and delete are meaningless without view: turning one on turns view on,
  // turning view off takes the rest with it.
  const toggle = (key, action) => {
    const row = { ...current[key], [action]: !current[key][action] };
    if (action === 'view' && !row.view) Object.assign(row, { add: false, edit: false, delete: false });
    if (action !== 'view' && row[action]) row.view = true;
    update({ ...current, [key]: row });
  };

  const allKeys = SECTIONS.flatMap(([, items]) => items.map(([key]) => key));
  const columnOn = (action) => allKeys.every((key) => current[key][action]);
  const toggleColumn = (action) => {
    const on = !columnOn(action);
    const next = {};
    for (const key of allKeys) {
      const row = { ...current[key], [action]: on };
      if (action === 'view' && !on) Object.assign(row, { add: false, edit: false, delete: false });
      if (action !== 'view' && on) row.view = true;
      next[key] = row;
    }
    update(next);
  };

  const grantedCount = (r) => allKeys.filter((key) => perms[r][key].view).length;
  const roleLabel = ROLES.find((r) => r.value === role);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      <InfoNote icon={Shield} tone="neutral" title="Decide what each role can see and do">
        Pick a role on the left, then tick what it may view, add, edit or delete. The owner always has full access.
      </InfoNote>

      {/* Wraps to one column on a phone: the role list stacks above the table. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-5)', alignItems: 'flex-start' }}>
        <nav aria-label="Roles" style={{ ...panel, padding: 'var(--space-2)', flex: '1 1 220px', maxWidth: '100%' }}>
          {ROLES.map((r) => {
            const active = r.value === role;
            return (
              <button key={r.value} type="button" onClick={() => setRole(r.value)} aria-current={active}
                      style={{
                        display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center', gap: '8px',
                        padding: '10px 12px', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer',
                        textAlign: 'left',
                        background: active ? 'var(--primary-light, var(--bg-secondary))' : 'transparent',
                        color: 'var(--text-primary)',
                        fontWeight: active ? 'var(--weight-semibold)' : 'var(--weight-medium)',
                      }}>
                <span>{r.label}</span>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                  {grantedCount(r.value)}/{allKeys.length}
                </span>
              </button>
            );
          })}
        </nav>

        <section style={{ ...panel, overflow: 'hidden', flex: '999 1 480px', minWidth: 0 }}>
          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap',
                           gap: 'var(--space-3)', padding: 'var(--space-4) var(--space-5)',
                           borderBottom: '1px solid var(--border-color)' }}>
            <div>
              <div style={{ fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-lg)' }}>{roleLabel.label}</div>
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>{roleLabel.hint}</div>
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <button type="button" className="btn-secondary" onClick={() => update(defaultsFor(role))}>
                <RotateCw size={15} /> Reset to default
              </button>
              {/* ponytail: not connected to the backend yet; Save only confirms locally. */}
              <button type="button" className="btn-primary" onClick={() => setSaved(true)}>
                {saved ? <><Check size={15} /> Saved</> : <><Save size={15} /> Save</>}
              </button>
            </div>
          </header>

          <div className="at-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
            <table className="at-table">
              <thead>
                <tr>
                  <th>Section</th>
                  {ACTIONS.map(([action, label]) => (
                    <th key={action} style={{ textAlign: 'center', width: '90px' }}>
                      <label style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                        {label}
                        <input type="checkbox" checked={columnOn(action)} onChange={() => toggleColumn(action)}
                               aria-label={`${label} for every section`} />
                      </label>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SECTIONS.map(([group, items]) => (
                  [
                    <tr key={group}>
                      <td colSpan={ACTIONS.length + 1} style={{ background: 'var(--bg-secondary)', fontSize: 'var(--text-xs)',
                                                               letterSpacing: '0.08em', textTransform: 'uppercase',
                                                               fontWeight: 'var(--weight-semibold)', color: 'var(--text-secondary)' }}>
                        {group}
                      </td>
                    </tr>,
                    ...items.map(([key, label]) => (
                      <tr key={key}>
                        <td data-label="Section" style={{ fontWeight: 'var(--weight-medium)' }}>{label}</td>
                        {ACTIONS.map(([action, actionLabel]) => (
                          <td key={action} data-label={actionLabel} style={{ textAlign: 'center' }}>
                            <input type="checkbox" checked={current[key][action]} onChange={() => toggle(key, action)}
                                   aria-label={`${roleLabel.label}: ${actionLabel} ${label}`}
                                   style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: 'var(--primary-color)' }} />
                          </td>
                        ))}
                      </tr>
                    )),
                  ]
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
