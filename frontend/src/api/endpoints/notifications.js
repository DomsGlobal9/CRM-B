import { BASE_URL } from '../config';
import { guardedFetch, getHeaders, failWith } from '../client';

/** The bell's alerts, and the boutique's WhatsApp connection. */
export const notificationsApi = {
  async getWhatsAppStatus() {
    const res = await guardedFetch(`${BASE_URL}/whatsapp/status/`, {
      headers: getHeaders(),
    });
    if (!res.ok) await failWith(res, 'Failed to fetch WhatsApp status');
    return res.json();
  },

  async resetWhatsAppStatus() {
    const res = await guardedFetch(`${BASE_URL}/whatsapp/reset/`, {
      method: 'POST',
      headers: getHeaders(),
    });
    if (!res.ok) await failWith(res, 'Failed to reset WhatsApp connection');
    return res.json();
  },

  async setWhatsAppSending(enabled) {
    const res = await guardedFetch(`${BASE_URL}/boutique-settings/whatsapp-sending/`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({ enabled }),
    });
    if (!res.ok) await failWith(res, 'Could not change the WhatsApp switch');
    return res.json();
  },

  async getNotifications(role = 'Owner', email = '') {
    const url = new URL(`${BASE_URL}/notifications/`);
    url.searchParams.append('role', role);
    if (email) url.searchParams.append('email', email);
    const res = await guardedFetch(url.toString(), {
      headers: getHeaders()
    });
    if (!res.ok) await failWith(res, 'Failed to fetch notifications');
    return res.json();
  },

  async markNotificationsAsRead(role = 'Owner', email = '') {
    const url = new URL(`${BASE_URL}/notifications/mark-all-read/`);
    url.searchParams.append('role', role);
    if (email) url.searchParams.append('email', email);
    const res = await guardedFetch(url.toString(), {
      method: 'POST',
      headers: getHeaders()
    });
    if (!res.ok) await failWith(res, 'Failed to mark notifications as read');
    return res.json();
  },
};
