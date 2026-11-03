import { BASE_URL } from '../config';
import { guardedFetch, getHeaders, describeApiError, failWith } from '../client';

/** Appointments. */
export const schedulingApi = {
  // --- Appointments ---------------------------------------------------------
  // apps/scheduling has had full CRUD since it was written and the customer's
  // tracking page already renders a trial card from it, but no frontend code
  // had ever called it -- the dashboard showed two hardcoded appointments
  // instead, naming staff who may not exist in that boutique.

  async getAppointments(params = {}) {
    const url = new URL(`${BASE_URL}/scheduling/appointments/`);
    Object.entries(params).forEach(([k, v]) => { if (v) url.searchParams.append(k, v); });
    const res = await guardedFetch(url.toString(), { headers: getHeaders() });
    if (!res.ok) await failWith(res, 'Failed to load appointments');
    return res.json();
  },

  // Rescheduling, reassigning, cancelling: the same record, edited.
  async updateAppointment(id, payload) {
    const res = await guardedFetch(`${BASE_URL}/scheduling/appointments/${id}/`, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(describeApiError(res, data));
    return data;
  },

  async createAppointment(payload) {
    const res = await guardedFetch(`${BASE_URL}/scheduling/appointments/`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(describeApiError(res, data));
    return data;
  },
};
