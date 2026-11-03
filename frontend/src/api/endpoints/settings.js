import { BASE_URL } from '../config';
import { guardedFetch, getHeaders, failWith } from '../client';

/** The boutique's settings: profile, tier names, Admin access, invoice template, daily summary. */
export const settingsApi = {
  async getInvoiceTemplate() {
    const res = await guardedFetch(`${BASE_URL}/settings/invoice-template/`, {
      headers: getHeaders()
    });
    if (!res.ok) await failWith(res, 'Failed to fetch invoice template setting');
    return res.json();
  },

  // Daily Summary Notifications: who gets the 11 PM summary, in which language.
  async getSummarySettings() {
    const res = await guardedFetch(`${BASE_URL}/daily-summary/settings/`, { headers: getHeaders() });
    if (!res.ok) await failWith(res, 'Failed to load daily summary settings');
    return res.json();
  },

  async updateSummarySetting(userId, changes) {
    const res = await guardedFetch(`${BASE_URL}/daily-summary/settings/${userId}/`, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify(changes),
    });
    if (!res.ok) await failWith(res, 'Failed to save daily summary setting');
    return res.json();
  },

  async updateInvoiceTemplate(template) {
    const res = await guardedFetch(`${BASE_URL}/settings/invoice-template/`, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify({ template })
    });
    if (!res.ok) await failWith(res, 'Failed to update invoice template setting');
    return res.json();
  },

  async getBoutiqueSettings() {
    const res = await guardedFetch(`${BASE_URL}/boutique-settings/`, {
      method: 'GET',
      headers: getHeaders()
    });
    if (!res.ok) await failWith(res, 'Failed to get boutique settings');
    return res.json();
  },

  async updateBoutiqueSettings(formData) {
    const res = await guardedFetch(`${BASE_URL}/boutique-settings/`, {
      method: 'POST',
      headers: getHeaders(true),
      body: formData
    });
    if (!res.ok) await failWith(res, 'Failed to update boutique settings');
    return res.json();
  },

  // The boutique's own names for the customer tiers (owner only).
  async saveTierNames(tierNames) {
    const res = await guardedFetch(`${BASE_URL}/boutique-settings/tier-names/`, {
      method: 'PUT', headers: getHeaders(), body: JSON.stringify({ tier_names: tierNames }),
    });
    if (!res.ok) await failWith(res, 'Could not save the tier names');
    return res.json();
  },

  // The extra work handed to each role, {roles: {role: [task]}} (owner only).
  async getAdminAccess() {
    const res = await guardedFetch(`${BASE_URL}/boutique-settings/admin-access/`, { headers: getHeaders() });
    if (!res.ok) await failWith(res, 'Could not load the admin settings');
    return res.json();
  },

  async saveAdminAccess(body) {
    const res = await guardedFetch(`${BASE_URL}/boutique-settings/admin-access/`, {
      method: 'PUT', headers: getHeaders(), body: JSON.stringify(body),
    });
    if (!res.ok) await failWith(res, 'Could not save the admin settings');
    return res.json();
  },
};
