import { BASE_URL } from '../config';
import { guardedFetch, getHeaders, failWith } from '../client';

/** The team's daily updates (To-do). */
export const dailyUpdatesApi = {
  // To-do: each staff member's daily updates, a month at a time. The owner,
  // Masters and Designers get everyone's (and may filter by `person`).
  async getDailyUpdates({ month = '', person = '' } = {}) {
    const query = new URLSearchParams();
    if (month) query.set('month', month);
    if (person) query.set('person', person);
    const res = await guardedFetch(`${BASE_URL}/daily-updates/?${query}`, { headers: getHeaders() });
    if (!res.ok) await failWith(res, 'Could not load the updates');
    return res.json();
  },

  async postDailyUpdate(formData) {
    const res = await guardedFetch(`${BASE_URL}/daily-updates/`, {
      method: 'POST', headers: getHeaders(true), body: formData,
    });
    if (!res.ok) await failWith(res, 'Could not post the update');
    return res.json();
  },

  async deleteDailyUpdate(id) {
    const res = await guardedFetch(`${BASE_URL}/daily-updates/${id}/`, {
      method: 'DELETE', headers: getHeaders(),
    });
    if (!res.ok) await failWith(res, 'Could not delete the update');
  },
};
