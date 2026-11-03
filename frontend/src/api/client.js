/**
 * How every request is made: the auth and tenant headers, shared in-flight
 * requests, the activity bar's count, readable errors, and the check that
 * ends a session the server no longer accepts. The endpoints use these.
 */

import { BASE_URL } from './config';

/**
 * Collapse identical concurrent mutations into one network request.
 *
 * Against a database a region away, a mutation takes 2-8 seconds and most
 * buttons render no pending state, so people click again -- and every extra
 * click used to become another POST: another order, another payment row,
 * another customer. Keying by method+url+body and handing every caller the
 * same in-flight response means the double-click and the burst-click cost
 * exactly one request, without touching sixty call sites.
 *
 * Scope is deliberately narrow: only while the first request is still in
 * flight (the map is cleared the moment it settles -- this is not a cache),
 * only for non-GET calls, and not for FormData bodies (two uploads with the
 * same form object are not provably the same bytes). A deliberate repeat --
 * submit, wait, submit again -- still goes through; stopping that is the
 * job of the buttons' own pending states.
 */
/**
 * Tell the page how many API calls are in flight, so it can show a global
 * activity bar. Every request against a database a region away takes seconds;
 * a screen that does nothing during them reads as broken, and not every
 * control can carry its own spinner. window events rather than React state so
 * this module stays framework-free.
 */
let activeRequests = 0;
const trackRequest = (promise) => {
  activeRequests += 1;
  window.dispatchEvent(new CustomEvent('api-activity', { detail: activeRequests }));
  const settle = () => {
    activeRequests -= 1;
    window.dispatchEvent(new CustomEvent('api-activity', { detail: activeRequests }));
  };
  promise.then(settle, settle);
  return promise;
};

const inFlightMutations = new Map();

/**
 * The same collapse, applied to reads.
 *
 * Two components mounting in the same tick and asking for the same list --
 * the designer roster wanted by three screens, the dashboard fetched by the
 * bootstrap and again by the overview tab's own effect -- used to be two
 * round trips for one answer. Against a database a region away that is
 * seconds of duplicated wait on the very first paint.
 *
 * Still not a cache, and deliberately so: the entry is dropped the moment the
 * request settles, so a refetch after a save always goes to the server and
 * nobody can read a stale list. All this removes is the case where the second
 * request was sent before the first had answered -- where sharing the answer
 * is not an optimisation but simply correct.
 *
 * Authorisation is untouched. The key includes the URL and the method, every
 * request still carries the caller's own token, and the server still decides.
 * Two different people cannot share a response: a sign-in replaces the token
 * and nothing in this map outlives a request in flight.
 */
const inFlightReads = new Map();

export const guardedFetch = (url, options = {}) => {
  const method = (options.method || 'GET').toUpperCase();
  if (method === 'GET') {
    const key = `GET ${url}`;
    const running = inFlightReads.get(key);
    if (running) return running.then((res) => res.clone());
    const read = trackRequest(fetch(url, options));
    inFlightReads.set(key, read);
    read.then(() => inFlightReads.delete(key),
              () => inFlightReads.delete(key));
    return read.then((res) => res.clone());
  }
  if (options.body && typeof options.body !== 'string') {
    return trackRequest(fetch(url, options));
  }
  const key = `${method} ${url} ${options.body || ''}`;
  const pending = inFlightMutations.get(key);
  // clone() because a Response body can only be read once, and every caller
  // that shared this request will want to read it.
  if (pending) return pending.then((res) => res.clone());
  const request = trackRequest(fetch(url, options));
  inFlightMutations.set(key, request);
  request.then(() => inFlightMutations.delete(key),
               () => inFlightMutations.delete(key));
  return request.then((res) => res.clone());
};

/**
 * A CONFIRMED 401 means this session is over -- stop pretending otherwise.
 *
 * Nothing in this file inspected status for 401 once, so signing out on a
 * phone left the shop desktop painting stale state forever. But the first cure
 * overshot: ANY single 401 wiped the session, so one stray response ejected
 * the owner mid-order. Hence the middle path below: a 401 triggers one direct
 * check of the token, and only the server's confirmed no ends the session.
 * Guarded so a burst of concurrent 401s -- the dashboard opens by firing
 * eight requests -- runs one check and reloads once.
 */
let sessionCheckInFlight = false;
const handleSessionEnded = async () => {
  if (sessionCheckInFlight) return;
  sessionCheckInFlight = true;
  // One 401 is a claim, not proof. A blip mid-deploy, one flaky proxy
  // response, or a single request racing a worker restart must not eject the
  // owner mid-order -- that read as "the app logged me out by itself". So ask
  // the server directly whether this token still stands, and end the session
  // only on its confirmed no. A network failure keeps the session: offline is
  // not signed out.
  const token = localStorage.getItem('token');
  if (token) {
    try {
      const tenantId = localStorage.getItem('tenant_id');
      const res = await guardedFetch(`${BASE_URL}/auth/me/`, {
        headers: {
          'Authorization': `Token ${token}`,
          ...(tenantId ? { 'X-Tenant-ID': tenantId } : {}),
        },
      });
      if (res.status !== 401 && res.status !== 403) {
        sessionCheckInFlight = false;  // stray 401; a later real one re-checks
        return;
      }
    } catch {
      sessionCheckInFlight = false;
      return;
    }
  }
  // Confirmed dead (or never had a token). Reloading rather than routing: the
  // token is gone, so every screen behind it is invalid, and a reload is the
  // one operation that cannot leave a fragment of the previous session behind.
  localStorage.removeItem('token');
  localStorage.removeItem('tenant_id');
  window.location.reload();
};

export const getHeaders = (isMultipart = false) => {
  const headers = {};
  if (!isMultipart) {
    headers['Content-Type'] = 'application/json';
  }
  const token = localStorage.getItem('token');
  if (token) {
    headers['Authorization'] = `Token ${token}`;
  }
  const tenantId = localStorage.getItem('tenant_id');
  if (tenantId) {
    headers['X-Tenant-ID'] = tenantId;
  }
  const lang = localStorage.getItem('app_language') || 'en';
  headers['Accept-Language'] = lang;
  return headers;
};

/**
 * Turn a failed response into a sentence worth showing someone.
 *
 * DRF returns {field: ["message"]} for a validation failure, which is worth
 * unpacking; anything else (an HTML 500 page, a proxy's 413, an empty body)
 * has no useful text in it, so the status is all there is to report.
 */
export const describeApiError = (res, data) => {
  // Every failed request in this file ends up here, which makes it the one
  // place that can notice the session has ended without touching 60 call sites.
  if (res.status === 401) {
    handleSessionEnded();
    return 'Your session has ended. Please sign in again.';
  }
  if (data && typeof data === 'object') {
    const fields = Object.entries(data)
      .map(([key, value]) => {
        const text = Array.isArray(value) ? value.join(' ') : String(value);
        return key === 'detail' || key === 'error' ? text : `${key}: ${text}`;
      })
      .filter(Boolean);
    if (fields.length) return fields.join('\n');
  }
  if (res.status === 413) return 'That file is too large to upload.';
  if (res.status === 404) return 'That no longer exists. It may have been removed.';
  if (res.status === 403) return 'You do not have permission to do that.';
  if (res.status >= 500) return `The server could not complete that (error ${res.status}). Please try again.`;
  return `That request failed (error ${res.status}).`;
};

/**
 * Throw a sentence a boutique owner can act on, for any failed response.
 *
 * Most calls in this file used to throw a hand-written string -- "Failed to
 * fetch tailors" -- or, at four sites, JSON.stringify(body), which rendered
 * in an alert() as {"mobile_number":["Enter a mobile number the boutique can
 * actually reach"]}. describeApiError already unpacks exactly that shape and
 * was used by only a handful of callers.
 *
 * Routing every failure through here also gives the 401 handler somewhere to
 * live: a session that ended on another device now ends here too, rather than
 * on whichever call happened to use describeApiError.
 */
export const failWith = async (res, fallback) => {
  const data = await res.json().catch(() => ({}));
  throw new Error(describeApiError(res, data) || fallback);
};

/** A sign-in that just succeeded: a later 401 is checked afresh. */
export const clearSessionCheck = () => { sessionCheckInFlight = false; };
