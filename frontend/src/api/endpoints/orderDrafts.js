import { BASE_URL } from '../config';
import { guardedFetch, getHeaders, describeApiError, failWith } from '../client';

/** Orders being written in the order form, saved as drafts until placed. */
export const orderDraftsApi = {
  // --- Order drafts -------------------------------------------------------
  //
  // The order being written, held on the server rather than in this tab. React
  // state is a cache of it, not the record: a refresh, a stray click on an
  // empty-state button or a different tab must not be able to destroy work the
  // boutique has done. See domains/orders/drafts.py.

  async listOrderDrafts() {
    const res = await guardedFetch(`${BASE_URL}/order-drafts/`, { headers: getHeaders() });
    if (!res.ok) await failWith(res, 'Failed to load your saved orders');
    return res.json();
  },

  async getOrderDraft(id) {
    const res = await guardedFetch(`${BASE_URL}/order-drafts/${id}/`, { headers: getHeaders() });
    if (!res.ok) await failWith(res, 'Failed to open that saved order');
    return res.json();
  },

  async createOrderDraft(body) {
    const res = await guardedFetch(`${BASE_URL}/order-drafts/`, {
      method: 'POST', headers: getHeaders(), body: JSON.stringify(body),
    });
    if (!res.ok) await failWith(res, 'Failed to start saving this order');
    return res.json();
  },

  /** Save the draft. Throws a tagged error on 409 so the caller can tell a
   *  stale tab from a failed request -- they need different words. */
  async updateOrderDraft(id, body) {
    const res = await guardedFetch(`${BASE_URL}/order-drafts/${id}/`, {
      method: 'PATCH', headers: getHeaders(), body: JSON.stringify(body),
    });
    if (res.status === 409) {
      const data = await res.json().catch(() => ({}));
      const conflict = new Error(data.error || 'This order was changed somewhere else.');
      conflict.isConflict = true;
      throw conflict;
    }
    if (!res.ok) await failWith(res, 'Failed to save this order');
    return res.json();
  },

  async deleteOrderDraft(id) {
    const res = await guardedFetch(`${BASE_URL}/order-drafts/${id}/`, {
      method: 'DELETE', headers: getHeaders(),
    });
    if (!res.ok && res.status !== 404) await failWith(res, 'Failed to discard this order');
    return true;
  },

  /** Place the order. One request, one transaction, and the draft is the
   *  token -- a retry finds it spent rather than booking a second order. */
  async confirmOrderDraft(id) {
    const res = await guardedFetch(`${BASE_URL}/order-drafts/${id}/confirm/`, {
      method: 'POST', headers: getHeaders(),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 409) {
      const spent = new Error(data.error || 'This order has already been placed.');
      spent.alreadyPlaced = true;
      throw spent;
    }
    if (!res.ok) throw new Error(describeApiError(res, data));
    return data;
  },
};
