import { BASE_URL } from '../config';
import { getHeaders, describeApiError } from '../client';

/** Profit & Costs: expenses and the profit-and-loss report. */
// --- Finance: manual costs and the P&L ------------------------------------
// Its own base path and helper, like staff/payroll above. Multipart-aware for
// the same reason the staff helper is: an expense can carry a receipt file.
const financeUrl = (path, params = {}) => {
  const url = new URL(`${BASE_URL}/finance/${path}`);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.append(k, v);
  });
  return url.toString();
};

const financeRequest = async (path, { method = 'GET', body } = {}, params) => {
  const isMultipart = typeof FormData !== 'undefined' && body instanceof FormData;
  const res = await fetch(financeUrl(path, params), {
    method,
    headers: getHeaders(isMultipart),
    ...(body ? { body: isMultipart ? body : JSON.stringify(body) } : {}),
  });
  const raw = await res.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { /* not JSON */ }
  if (!res.ok) throw new Error(describeApiError(res, data));
  return data;
};

export const financeApi = {
getProfitLoss: (params) => financeRequest('profit-loss/', {}, params),

  getFinanceTrend: (params) => financeRequest('trend/', {}, params),

  getExpenses: (params) => financeRequest('expenses/', {}, params),

  // FormData when a receipt is attached, plain JSON otherwise -- the helper
  // detects which and sets the header accordingly.
  createExpense: (body) => financeRequest('expenses/', { method: 'POST', body }),

  deleteExpense: (id) => financeRequest(`expenses/${id}/`, { method: 'DELETE' }),
};
