import { BASE_URL } from '../config';
import { guardedFetch, getHeaders, failWith } from '../client';

/** The Dashboard's figures. */
export const dashboardApi = {
  // Get dashboard data
  async getDashboard() {
    const res = await guardedFetch(`${BASE_URL}/dashboard/`, {
      headers: getHeaders()
    });
    if (!res.ok) await failWith(res, 'Failed to fetch dashboard');
    return res.json();
  },
};
