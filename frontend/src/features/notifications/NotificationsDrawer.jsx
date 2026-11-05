import { Bell } from 'lucide-react';
import { notificationKind } from '../../services/notificationKind';
import { formatDateTime as fmtDateTime } from '../../services/format';

/**
 * The owner's inbox alerts, opened from the bell on the Dashboard.
 * App marks them read as it opens; this only lists them, in the order
 * GET /notifications/ returns them.
 */
export default function NotificationsDrawer({ notifications, setShowNotificationsDrawer }) {
  return (
    <div className="notif-drawer" style={{
      position: 'fixed',
      top: 0,
      right: 0,
      width: '400px',
      height: '100%',
      backgroundColor: 'var(--surface-color)',
      borderLeft: '1px solid var(--border-color)',
      boxShadow: '-4px 0 24px rgba(0,0,0,0.15)',
      zIndex: 1000,
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Header */}
      <div className="notif-drawer-head" style={{
        padding: '20px',
        borderBottom: '1px solid var(--border-color)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Bell size={20} style={{ color: 'var(--accent-text, #b07c40)' }} />
          <h3 style={{ fontSize: '18px', fontWeight: 600, margin: 0, fontFamily: 'var(--font-serif)' }}>Boutique alerts</h3>
        </div>
        <button
          className="btn-primary"
          style={{ padding: '4px 10px', fontSize: '12px' }}
          onClick={() => setShowNotificationsDrawer(false)}
        >
          Close
        </button>
      </div>

      {/* List */}
      <div className="notif-drawer-list" style={{
        flex: 1,
        overflowY: 'auto',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px'
      }}>
        {notifications.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: '13px' }}>
            No notifications received yet.
          </div>
        ) : (
          notifications.map(n => {
            // Coloured by what it is about: new work, to check, sent back, ready...
            const kind = notificationKind(n.title);
            return (
            <div key={n.id} className="notif-card" style={{
              padding: '16px',
              backgroundColor: n.is_read ? 'rgba(0,0,0,0.01)' : 'rgba(212,175,55,0.04)',
              border: `1px solid ${n.is_read ? 'var(--border-color)' : 'rgba(212,175,55,0.2)'}`,
              borderLeft: `4px solid ${kind.color}`,
              borderRadius: '8px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px'
            }}>
              <span style={{ alignSelf: 'flex-start', fontSize: '10px', fontWeight: 700, letterSpacing: '0.04em',
                             textTransform: 'uppercase', padding: '2px 8px', borderRadius: '999px',
                             color: kind.color, background: `color-mix(in srgb, ${kind.color} 10%, transparent)` }}>
                {kind.label}
              </span>
              <div className="notif-card-top" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)' }}>{n.title}</span>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{fmtDateTime(n.created_at)}</span>
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>{n.message}</p>
            </div>
            );
          })
        )}
      </div>
    </div>
  );
}
