import { BASE_URL } from '../config';
import { getHeaders, describeApiError } from '../client';

/** Payroll: salaries, deposits and advances. */
// --- Payroll -------------------------------------------------------------
// Its own base path because it is its own module and its own switch. Every one
// of these is owner-only server-side; the interface hides them too, but the
// hiding is convenience and the refusal is the control.

const payrollUrl = (path, params = {}) => {
  const url = new URL(`${BASE_URL}/payroll/${path}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.append(key, value);
    }
  });
  return url.toString();
};

const payrollRequest = async (path, { method = 'GET', body } = {}, params) => {
  const res = await fetch(payrollUrl(path, params), {
    method,
    headers: getHeaders(),
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const raw = await res.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { /* not JSON */ }
  if (!res.ok) throw new Error(describeApiError(res, data));
  return data;
};

export const payrollApi = {
getPayrollPeriods: (params) => payrollRequest('periods/', {}, params),

  getPayrollPeriod: (id) => payrollRequest(`periods/${id}/`),

  generatePayroll: (week) => payrollRequest('periods/generate/', { method: 'POST', body: { week } }),

  approvePayroll: (id) => payrollRequest(`periods/${id}/approve/`, { method: 'POST', body: {} }),

  getDeposits: () => payrollRequest('deposits/'),

  getDeposit: (staffId) => payrollRequest(`deposits/${staffId}/`),

  // Advances. Issue and cancel are owner-only server-side; the amount of a
  // recovery is never sent from here -- payroll decides it.
  getAdvances: (params) => payrollRequest('advances/', {}, params),

  getAdvance: (id) => payrollRequest(`advances/${id}/`),

  issueAdvance: (payload) => payrollRequest('advances/', { method: 'POST', body: payload }),

  updateAdvance: (id, payload) =>
    payrollRequest(`advances/${id}/`, { method: 'PATCH', body: payload }),

  cancelAdvance: (id, reason) =>
    payrollRequest(`advances/${id}/cancel/`, { method: 'POST', body: { reason } }),

  // Payout. No amount in the body, ever: the server pays the approved net.
  recordPayout: (recordId, payload) =>
    payrollRequest(`records/${recordId}/payout/`, { method: 'POST', body: payload }),
};
