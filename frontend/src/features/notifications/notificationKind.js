/* What a notification is about, read from its title: the server stores no
   type, and every title it writes follows a fixed pattern (domains/orders/
   notifications.py, domains/alterations/notifications.py, crm_api/views.py,
   apps/production, apps/scheduling). First match wins, so the
   specific kinds come before the broad ones.
   shortcut: a new title pattern on the server falls to "Update" (grey) until it is added here.
   Self-check: node src/features/notifications/notificationKind.check.mjs */

const KINDS = [
  { key: 'birthday', label: 'Birthday', color: '#e11d48', test: /^birthday (today|in )/i },
  { key: 'sent_back', label: 'Sent back', color: '#dc2626', test: /^sent back/i },
  { key: 'check', label: 'To check', color: '#d97706', test: /^verify |quality check|^qc record/i },
  { key: 'new_work', label: 'New work', color: 'var(--info-500)',
    test: /^new (assignment|stitching task|alteration assigned)|^task created|^ready for /i },
  { key: 'voice', label: 'Voice note', color: 'var(--info-600)', test: /^voice note/i },
  { key: 'done', label: 'Ready / done', color: '#16a34a', test: /ready|completed|approved/i },
  { key: 'alteration', label: 'Alteration', color: '#db2777', test: /^alteration/i },
  { key: 'appointment', label: 'Appointment', color: 'var(--info-800)', test: /^appointment/i },
  { key: 'order', label: 'Order', color: 'var(--info-500)', test: /order/i },
];

const OTHER = { key: 'update', label: 'Update', color: '#64748b' };

export const notificationKind = (title) => KINDS.find((k) => k.test.test(String(title || ''))) || OTHER;
