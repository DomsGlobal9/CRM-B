import { BASE_URL } from '../config';
import { guardedFetch, getHeaders, describeApiError, failWith } from '../client';

/** Garment templates (the order form for each garment) and garment jobs. */
export const catalogApi = {
  // --- Garment templates ---------------------------------------------------
  // The order form is rendered from these, so a new garment or a changed option
  // list reaches the wizard without a frontend release.

  async getGarmentTemplates() {
    const res = await guardedFetch(`${BASE_URL}/catalog/templates/`, { headers: getHeaders() });
    if (!res.ok) await failWith(res, 'Failed to load garment templates');
    return res.json();
  },

  async getGarmentTemplate(key) {
    const res = await guardedFetch(`${BASE_URL}/catalog/templates/${key}/`, { headers: getHeaders() });
    if (!res.ok) await failWith(res, `Failed to load the ${key} template`);
    return res.json();
  },

  async createGarmentJob(payload) {
    const res = await guardedFetch(`${BASE_URL}/catalog/jobs/`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(describeApiError(res, data));
    return data;
  },

  async getGarmentJobs(orderId) {
    const res = await guardedFetch(`${BASE_URL}/catalog/jobs/?order=${encodeURIComponent(orderId)}`, {
      headers: getHeaders()
    });
    if (!res.ok) await failWith(res, 'Failed to load the garments on this order');
    return res.json();
  },
};
