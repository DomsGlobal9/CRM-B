import { BASE_URL } from '../config';
import { guardedFetch, getHeaders, describeApiError, clearSessionCheck } from '../client';
import { TENANT_ID_KEY, TOKEN_KEY } from '../../constants/storageKeys';

/** Signing in and out, the session, password reset, and asking for a boutique. */
export const authApi = {
// Auth API
  // shop_slug is the portal URL this screen was opened at, sent as a tenant
  // HINT: it decides which boutique is tried first when the same address
  // exists in more than one, and grants nothing on its own -- the password
  // still has to be right inside that boutique's own schema.
  async login(username, password, shopSlug = '') {
    const res = await guardedFetch(`${BASE_URL}/auth/login/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username, password, ...(shopSlug ? { shop_slug: shopSlug } : {}) })
    });
    // Parsed defensively: an HTML 502 page from the proxy made res.json()
    // throw "Unexpected token '<'", which is what the owner saw at the two
    // moments a clear message matters most.
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || describeApiError(res, data));
    
    // Store token and tenant_id
    if (data.token) {
      clearSessionCheck();
      localStorage.setItem(TOKEN_KEY, data.token);
    }
    if (data.tenant_id) {
      localStorage.setItem(TENANT_ID_KEY, data.tenant_id);
    }
    return data;
  },

  // Request access: the app's replacement for sign-up. Posts to the same
  // public intake as the website's demo form (outside /api/, form-encoded),
  // which emails the requester and alerts the platform team.
  async requestAccess({ name, email, phone, boutique, address, terms_accepted }) {
    const body = new URLSearchParams({
      name, email, phone, boutique, address, source: 'app',
      terms_accepted: terms_accepted ? 'true' : 'false',
    });
    const res = await guardedFetch(new URL('/demo-request/', BASE_URL).href, { method: 'POST', body });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const fieldErrors = data.errors ? Object.values(data.errors).flat().join(' ') : '';
      throw new Error(data.error || fieldErrors || describeApiError(res, data));
    }
    return data;
  },

  async signup(signupData) {
    const res = await guardedFetch(`${BASE_URL}/auth/signup/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(signupData)
    });
    // Parsed defensively: an HTML 502 page from the proxy made res.json()
    // throw "Unexpected token '<'", which is what the owner saw at the two
    // moments a clear message matters most.
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || describeApiError(res, data));
    
    if (data.token) {
      clearSessionCheck();
      localStorage.setItem(TOKEN_KEY, data.token);
    }
    if (data.tenant_id) {
      localStorage.setItem(TENANT_ID_KEY, data.tenant_id);
    }
    return data;
  },

  // Which boutique the portal path in the URL bar belongs to, so the sign-in
  // screen can name it. Unauthenticated and tenant-less by design, and null on
  // any failure: an unknown slug is a plainly-labelled login screen, never an
  // error page. It never writes tenant_id -- the slug labels the screen, the
  // token decides the boutique.
  async getBoutiqueBySlug(slug) {
    if (!slug) return null;
    try {
      const res = await guardedFetch(`${BASE_URL}/auth/boutique/${encodeURIComponent(slug)}/`);
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  },

  // Both of these are deliberately unauthenticated and deliberately vague on
  // failure -- see PasswordResetRequestView. The request call answers the same
  // way for an address that exists and one that does not, so there is nothing
  // here to branch on and nothing worth reporting except that it went through.
  async requestPasswordReset(email) {
    const res = await guardedFetch(`${BASE_URL}/auth/password-reset/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(describeApiError(res, data));
    return data;
  },

  async confirmPasswordReset(token, password) {
    const res = await guardedFetch(`${BASE_URL}/auth/password-reset/confirm/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(describeApiError(res, data));
    return data;
  },

  async logout() {
    try {
      await guardedFetch(`${BASE_URL}/auth/logout/`, {
        method: 'POST',
        headers: getHeaders()
      });
    } catch (e) {
      console.error("Logout error on server", e);
    }
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TENANT_ID_KEY);
  },

  async getMe() {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return null;
    
    const res = await guardedFetch(`${BASE_URL}/auth/me/`, {
      headers: getHeaders()
    });
    if (!res.ok) {
      // Only an auth failure clears the token. This used to drop it on ANY
      // non-ok status, so a 500 from a cold database, or a 502 while Render
      // recycled a worker, signed the owner out of a session that was still
      // perfectly valid -- and because this runs on every page load, a bad
      // thirty seconds on the server logged the whole shop out.
      if (res.status === 401 || res.status === 403) {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(TENANT_ID_KEY);
      }
      return null;
    }
    const data = await res.json();
    if (data.tenant_id) {
      localStorage.setItem(TENANT_ID_KEY, data.tenant_id);
    }
    return data;
  },

  async seedMockData() {
    const res = await guardedFetch(`${BASE_URL}/auth/seed-data/`, {
      method: 'POST',
      headers: getHeaders()
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(describeApiError(res, errData) || 'Failed to seed mock data');
    }
    return res.json();
  },

  // The signed-in user sets their own avatar. Returns the same user object
  // /auth/me/ does, so the caller drops it straight into currentUser.
  async updateMyPhoto(file) {
    const body = new FormData();
    body.append('profile_photo', file);
    const res = await guardedFetch(`${BASE_URL}/auth/me/`, {
      method: 'PATCH', headers: getHeaders(true), body,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || describeApiError(res, data));
    return data;
  },

  // My Profile: the signed-in user's own name. Returns the user object, as /auth/me/ does.
  async updateMyName(firstName, lastName) {
    const res = await guardedFetch(`${BASE_URL}/auth/me/`, {
      method: 'PATCH', headers: getHeaders(), body: JSON.stringify({ first_name: firstName, last_name: lastName }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || describeApiError(res, data));
    return data;
  },

  // My Profile: change the password, knowing the current one. The server
  // replaces the login token (other devices are signed out); this one keeps
  // working on the new token it hands back.
  async changeMyPassword(currentPassword, newPassword) {
    const res = await guardedFetch(`${BASE_URL}/auth/change-password/`, {
      method: 'POST', headers: getHeaders(),
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || describeApiError(res, data));
    if (data.token) localStorage.setItem(TOKEN_KEY, data.token);
    return data;
  },
};
