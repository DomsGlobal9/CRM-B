// node src/services/notificationKind.check.mjs -- every title the server writes lands in its kind.
import assert from 'node:assert/strict';
import { notificationKind } from './notificationKind.js';

const cases = {
  'New Assignment: #16': 'new_work',
  'New assignment on #16': 'new_work',
  'New Stitching Task: #16': 'new_work',
  'New Alteration Assigned: #12-A1': 'new_work',
  'New to-do: Blouse hand work': 'new_work',
  'Task Created: Cutting': 'new_work',
  'Ready for Cutting: #16': 'new_work',
  'Verify Stitching: #16': 'check',
  'Quality Check Required: #16': 'check',
  'Alteration Quality Check: #12-A1': 'check',
  'QC Record: PASSED': 'check',
  'Sent back: Stitching on #16': 'sent_back',
  'Stitching Ready: #16': 'done',
  'Garment Stitching Completed: #16': 'done',
  'Alteration Ready: #12-A1': 'done',
  'Alteration Completed: #12-A1': 'done',
  'Alteration Approved: #12-A1': 'done',
  'To-do closed: Blouse hand work': 'done',
  'Voice note on #16 · Cutting': 'voice',
  'Alteration Received: #12-A1': 'alteration',
  'Alteration Estimate: #12-A1': 'alteration',
  'Alteration Started: #12-A1': 'alteration',
  'Alteration Cancelled: #12-A1': 'alteration',
  'Appointment Booked: Trial': 'appointment',
  'New Order Received: #16': 'order',
  'New Order #16': 'order',
  'Order Confirmed: #16': 'order',
  'Order #16 Update: Cutting': 'order',
  'Order Update: Cutting': 'order',
  'Birthday today: Vanshika': 'birthday',
  'Birthday in 3 days: Vanshika': 'birthday',
  'Samar opened your Cutting submission': 'update',
  '': 'update',
};
for (const [title, kind] of Object.entries(cases)) {
  assert.equal(notificationKind(title).key, kind, title);
}
console.log(`ok: ${Object.keys(cases).length} titles`);
