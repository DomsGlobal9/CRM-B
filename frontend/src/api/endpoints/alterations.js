import { BASE_URL } from '../config';
import { guardedFetch, getHeaders, describeApiError, failWith } from '../client';

/** Alterations and their actions. */
// --- Alterations -------------------------------------------------------------
// Post-delivery work on a garment that has already gone home. A separate
// prefix because it is a separate process: nothing here writes to an order.
const alterationsUrl = (path = '', params = {}) => {
  const clean = path ? (path.endsWith('/') ? path : `${path}/`) : '';
  const url = new URL(`${BASE_URL}/alterations/${clean}`);
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.append(key, value);
    }
  });
  return url.toString();
};

const alterationRequest = async (path = '', { method = 'GET', body } = {}, params) => {
  const res = await guardedFetch(alterationsUrl(path, params), {
    method,
    headers: getHeaders(),
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const raw = await res.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { /* not JSON */ }
  // describeApiError flattens DRF's field-keyed errors, so the server's own
  // wording -- "only 3 metres available", "more than the 200 outstanding" --
  // is what the screen shows, rather than a generic failure.
  if (!res.ok) throw new Error(describeApiError(res, data));
  return data;
};

const alterationAction = (id, action, body) =>
  alterationRequest(`${id}/${action}`, { method: 'POST', body: body || {} });

export const alterationsApi = {
getAlterations: (params) => alterationRequest('', {}, params),

  getAlteration: (id) => alterationRequest(`${id}`),

  createAlteration: (payload) => alterationRequest('', { method: 'POST', body: payload }),

  // An alteration is an order on the short path: raised on the delivered
  // order it came from, or on its own for a garment from outside.
  async createAlterationOrder(orderId, body) {
    const res = await guardedFetch(`${BASE_URL}/orders/${orderId}/alterations/`, {
      method: 'POST', headers: getHeaders(), body: JSON.stringify(body),
    });
    if (!res.ok) await failWith(res, 'Could not take the garment in');
    return res.json();
  },

  async createOutsideAlterationOrder(body) {
    const res = await guardedFetch(`${BASE_URL}/orders/outside-alteration/`, {
      method: 'POST', headers: getHeaders(), body: JSON.stringify(body),
    });
    if (!res.ok) await failWith(res, 'Could not take the garment in');
    return res.json();
  },

  // A garment stitched elsewhere: multipart, so the photograph of it as it
  // arrived can ride along with the fields.
  async createOutsideAlteration(fields, photoFile) {
    const form = new FormData();
    Object.entries(fields).forEach(([key, value]) => {
      if (value === '' || value === null || value === undefined) return;
      form.append(key, typeof value === 'object' ? JSON.stringify(value) : value);
    });
    if (photoFile) form.append('intake_photo', photoFile);
    const res = await guardedFetch(alterationsUrl('outside'), {
      method: 'POST', headers: getHeaders(true), body: form,
    });
    const raw = await res.text();
    let data = null;
    try { data = raw ? JSON.parse(raw) : null; } catch { /* not JSON */ }
    if (!res.ok) throw new Error(describeApiError(res, data));
    return data;
  },

  // Workflow. Each one returns the whole alteration back, including the
  // refreshed `available_actions`, so a screen never has to guess what is
  // allowed next.
  startAlterationInspection: (id, notes) => alterationAction(id, 'start-inspection', { notes }),

  recordAlterationInspection: (id, payload) => alterationAction(id, 'record-inspection', payload),

  submitAlterationForApproval: (id, payload) => alterationAction(id, 'submit-for-approval', payload),

  approveAlteration: (id, notes) => alterationAction(id, 'approve', { notes }),

  assignAlteration: (id, payload) => alterationAction(id, 'assign', payload),

  startAlterationWork: (id, payload) => alterationAction(id, 'start-work', payload || {}),

  sendAlterationToQC: (id, payload) => alterationAction(id, 'send-to-qc', payload || {}),

  passAlterationQC: (id, notes) => alterationAction(id, 'pass-qc', { notes }),

  failAlterationQC: (id, reason) => alterationAction(id, 'fail-qc', { reason }),

  // The small-issue flow's own stops.
  completeAlterationWork: (id, payload) => alterationAction(id, 'work-complete', payload || {}),

  alterationCustomerApproved: (id, notes) => alterationAction(id, 'customer-approved', { notes }),

  alterationCustomerRejected: (id, reason) => alterationAction(id, 'customer-rejected', { reason }),

  markAlterationPressed: (id, notes) => alterationAction(id, 'pressed', { notes }),

  completeAlteration: (id, notes) => alterationAction(id, 'complete', { notes }),

  cancelAlteration: (id, reason) => alterationAction(id, 'cancel', { reason }),

  // Money and materials.
  getAlterationPayments: (id) => alterationRequest(`${id}/payments`),

  recordAlterationPayment: (id, payload) => alterationAction(id, 'payments', payload),

  getAlterationOutstandingBalance: (id) => alterationRequest(`${id}/outstanding-balance`),

  getAlterationMaterials: (id) => alterationRequest(`${id}/materials`),

  recordAlterationMaterial: (id, payload) => alterationAction(id, 'materials', payload),
};
