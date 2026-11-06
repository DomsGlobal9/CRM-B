import { BASE_URL } from '../config';
import { guardedFetch, getHeaders, describeApiError, failWith } from '../client';

/** The team: staff, profiles, documents, attendance and day marks. */
// --- Staff Management: employment terms ----------------------------------
// The same shape as the inventory helpers above, with a PATCH they do not need.
// Deliberately its own small set rather than additions to the tailor calls:
// these responses carry pay rates, and keeping them on their own path makes it
// obvious at the call site which requests are confidential.

const staffUrl = (path, params = {}) => {
  const url = new URL(`${BASE_URL}/staff/${path}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.append(key, value);
    }
  });
  return url.toString();
};

const staffRequest = async (path, { method = 'GET', body } = {}, params) => {
  // A document upload is the one write here that is not JSON. FormData has to
  // carry its own multipart boundary, so the Content-Type header is left off
  // and the body passed through untouched -- stringifying it would post the
  // literal "[object FormData]".
  const isMultipart = typeof FormData !== 'undefined' && body instanceof FormData;
  const res = await fetch(staffUrl(path, params), {
    method,
    headers: getHeaders(isMultipart),
    ...(body ? { body: isMultipart ? body : JSON.stringify(body) } : {}),
  });
  const raw = await res.text();
  let data = null;
  // A proxy or an error page can answer with HTML; describeApiError copes with
  // a null body, so a parse failure is left as null rather than thrown.
  try { data = raw ? JSON.parse(raw) : null; } catch { /* not JSON */ }
  if (!res.ok) throw new Error(describeApiError(res, data));
  return data;
};

export const staffApi = {
  // Get all tailors
  // forAttendance also returns the rows designers' attendance is recorded on.
  async getTailors({ forAttendance = false } = {}) {
    const res = await guardedFetch(`${BASE_URL}/tailors/${forAttendance ? '?attendance=1' : ''}`, {
      headers: getHeaders()
    });
    if (!res.ok) await failWith(res, 'Failed to fetch tailors');
    return res.json();
  },

  // Staff > Team, a page at a time, with the team's totals (TailorViewSet.team).
  async getTeamPage(params = {}) {
    const url = new URL(`${BASE_URL}/tailors/team/`);
    Object.entries(params).forEach(([k, v]) => {
      if (v !== '' && v !== null && v !== undefined) url.searchParams.set(k, v);
    });
    const res = await guardedFetch(url.toString(), { headers: getHeaders() });
    if (!res.ok) await failWith(res, 'Could not load the team');
    return res.json();
  },

  // Fabrics CRUD
  // Photos go up before the fabric exists, so this returns URLs the form then
  // saves with the rest of the record.

  // Tailors CRUD
  // FormData when a profile photo is attached (multipart), plain JSON otherwise.
  // getHeaders(true) drops the Content-Type so the browser sets the multipart
  // boundary itself.
  async createTailor(tailorData) {
    const isForm = typeof FormData !== 'undefined' && tailorData instanceof FormData;
    const res = await guardedFetch(`${BASE_URL}/tailors/`, {
      method: 'POST',
      headers: getHeaders(isForm),
      body: isForm ? tailorData : JSON.stringify(tailorData),
    });
    if (!res.ok) await failWith(res, 'Failed to create tailor');
    return res.json();
  },

  async updateTailor(id, tailorData) {
    const isForm = typeof FormData !== 'undefined' && tailorData instanceof FormData;
    const res = await guardedFetch(`${BASE_URL}/tailors/${id}/`, {
      method: 'PATCH',
      headers: getHeaders(isForm),
      body: isForm ? tailorData : JSON.stringify(tailorData),
    });
    if (!res.ok) await failWith(res, 'Failed to update tailor');
    return res.json();
  },

  async deleteTailor(id) {
    const res = await guardedFetch(`${BASE_URL}/tailors/${id}/`, {
      method: 'DELETE',
      headers: getHeaders()
    });
    if (!res.ok) await failWith(res, 'Failed to delete tailor');
    return true;
  },

getStaffProfiles: (params) => staffRequest('profiles/', {}, params),

  // Identity and employment documents. Owner-only on the server for anyone
  // else's row, so a Master calling this gets their own and nothing more.
  getStaffDocuments: (params) => staffRequest('documents/', {}, params),

  uploadStaffDocument: (formData) =>
    staffRequest('documents/', { method: 'POST', body: formData }),

  deleteStaffDocument: (id) =>
    staffRequest(`documents/${id}/`, { method: 'DELETE' }),

  createStaffProfile: (payload) => staffRequest('profiles/', { method: 'POST', body: payload }),

  updateStaffProfile: (id, payload) =>
    staffRequest(`profiles/${id}/`, { method: 'PATCH', body: payload }),

  // Attendance. Check-in and check-out send no timestamp on purpose -- the
  // server stamps them, so a clock that is wrong (or a device whose owner set
  // it back) cannot buy an extra hour.
  getAttendance: (params) => staffRequest('attendance/', {}, params),

  getCurrentAttendance: () => staffRequest('attendance/current/'),

  checkIn: (payload) => staffRequest('attendance/check-in/', { method: 'POST', body: payload || {} }),

  // The position for one's own open check-in saved without one (within 30 minutes).
  addCheckInLocation: (location) => staffRequest('attendance/check-in-location/', { method: 'POST', body: { location } }),

  checkOut: () => staffRequest('attendance/check-out/', { method: 'POST', body: {} }),

  recordAttendance: (payload) => staffRequest('attendance/record/', { method: 'POST', body: payload }),

  correctAttendance: (id, payload) =>
    staffRequest(`attendance/${id}/correct/`, { method: 'POST', body: payload }),

  getTimesheet: (params) => staffRequest('timesheet/', {}, params),

  // Muster roll: leave and weekly-off marks. Owner-only on the server.
  // createDayMark upserts on (staff, date) -- posting a day that already has a
  // mark changes its kind, which is how the grid cycles a cell.
  getDayMarks: (params) => staffRequest('day-marks/', {}, params),

  createDayMark: (payload) => staffRequest('day-marks/', { method: 'POST', body: payload }),

  deleteDayMark: (id) => staffRequest(`day-marks/${id}/`, { method: 'DELETE' }),

  // Performance. Operational only -- this endpoint has no access to a rate, a
  // payslip or a ledger, which is why a Master may read it.
  getPerformance: (params) => staffRequest('performance/', {}, params),

  getReviews: (params) => staffRequest('reviews/', {}, params),

  createReview: (payload) => staffRequest('reviews/', { method: 'POST', body: payload }),

  updateReview: (id, payload) =>
    staffRequest(`reviews/${id}/`, { method: 'PATCH', body: payload }),

  finaliseReview: (id) => staffRequest(`reviews/${id}/finalise/`, { method: 'POST', body: {} }),

  acknowledgeReview: (id) =>
    staffRequest(`reviews/${id}/acknowledge/`, { method: 'POST', body: {} }),
};
