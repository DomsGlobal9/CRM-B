import { useEffect, useState } from 'react';
import { Check, ClipboardList, Save, Scissors, Shield, ShoppingBag, Users } from 'lucide-react';

import { InfoNote } from '../../components/ui/Atelier';
import { api } from '../../services/api';

const panel = {
  background: 'var(--surface-color)',
  border: '1px solid var(--border-color)',
  borderRadius: 'var(--radius-lg)',
  boxShadow: 'var(--shadow-sm)',
};

// The work the owner can hand to an admin, per section of the app.
const SECTIONS = [
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
];

const memberKey = (m) => `${m.isDesigner ? 'd' : 's'}:${m.id}`;

// ponytail: frontend only -- the admin and tasks live in this component's state
// until the backend for access levels exists; Save only confirms locally.
export default function RolePermissions() {
  const [people, setPeople] = useState(null);
  const [admin, setAdmin] = useState('');
  const [tasks, setTasks] = useState(() => new Set());
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    Promise.all([api.getTailors().catch(() => []), api.getDesigners().catch(() => [])])
      .then(([staff, designers]) => setPeople([
        ...(Array.isArray(staff) ? staff : []),
        ...(Array.isArray(designers) ? designers : []).map((d) => ({ ...d, role: 'Designer', isDesigner: true })),
      ]));
  }, []);

  const chosen = people?.find((m) => memberKey(m) === admin);

  const flip = (setter, keys, on) => {
    setter((prev) => {
      const next = new Set(prev);
      keys.forEach((k) => (on ? next.add(k) : next.delete(k)));
      return next;
    });
    setSaved(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      <InfoNote icon={Shield} tone="neutral" title="Admins and regular team members">
        Everyone keeps their role (tailor, master, designer…). Choose one person as Admin to hand them the work you tick below;
        everyone else stays Regular. The owner always has full access.
      </InfoNote>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-5)', alignItems: 'flex-start' }}>
        {/* Who is the admin: one person at a time. */}
        <section style={{ ...panel, flex: '1 1 300px', maxWidth: '100%', padding: 'var(--space-4) var(--space-5)',
                          display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <div>
            <div style={{ fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-lg)' }}>Admin</div>
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
              One person at a time. Everyone else is Regular.
            </div>
          </div>
          <select value={admin} disabled={people === null} aria-label="Choose the admin"
                  onChange={(e) => { setAdmin(e.target.value); setSaved(false); }}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-md)',
                           border: '1px solid var(--border-color)', background: 'var(--surface-color)',
                           color: 'var(--text-primary)', fontSize: 'var(--text-base)' }}>
            <option value="">{people === null ? 'Loading team…' : 'No admin'}</option>
            {people?.map((m) => (
              <option key={memberKey(m)} value={memberKey(m)}>{m.name} · {m.role}</option>
            ))}
          </select>
          {chosen && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px',
                          borderRadius: 'var(--radius-md)', background: 'var(--bg-secondary)' }}>
              <Shield size={18} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 'var(--weight-semibold)' }}>{chosen.name}</div>
                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>{chosen.role} · Admin</div>
              </div>
            </div>
          )}
        </section>

        {/* What the admin handles */}
        <section style={{ ...panel, flex: '999 1 480px', minWidth: 0, overflow: 'hidden' }}>
          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap',
                           gap: 'var(--space-3)', padding: 'var(--space-4) var(--space-5)',
                           borderBottom: '1px solid var(--border-color)' }}>
            <div>
              <div style={{ fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-lg)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ClipboardList size={18} /> Work assigned to the admin
              </div>
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                Tick what the admin may do. Anything left unticked stays with you.
              </div>
            </div>
            <button type="button" className="btn-primary" onClick={() => setSaved(true)}>
              {saved ? <><Check size={15} /> Saved</> : <><Save size={15} /> Save</>}
            </button>
          </header>

          {SECTIONS.map(({ key: section, label, icon: Icon, tasks: list }) => {
            const keys = list.map(([k]) => `${section}.${k}`);
            const ticked = keys.filter((k) => tasks.has(k)).length;
            const all = ticked === keys.length;
            return (
              <section key={section} aria-label={label} style={{ padding: 'var(--space-4) var(--space-5)',
                                               borderBottom: '1px solid var(--border-color)' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', marginBottom: 'var(--space-3)' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontWeight: 'var(--weight-semibold)' }}>
                      <Icon size={16} /> {label}
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 'var(--weight-medium)' }}>
                        {ticked}/{keys.length}
                      </span>
                    </span>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: 'var(--text-sm)', cursor: 'pointer' }}>
                      <input type="checkbox" checked={all} onChange={() => flip(setTasks, keys, !all)}
                             ref={(el) => { if (el) el.indeterminate = ticked > 0 && !all; }}
                             style={{ accentColor: 'var(--primary-color)' }} />
                      Select all
                    </label>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '8px 16px' }}>
                  {list.map(([k, text]) => {
                    const id = `${section}.${k}`;
                    return (
                      <label key={id} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '4px 0' }}>
                        <input type="checkbox" checked={tasks.has(id)} onChange={(e) => flip(setTasks, [id], e.target.checked)}
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
