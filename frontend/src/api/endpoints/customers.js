import { BASE_URL } from '../config';
import { guardedFetch, getHeaders, describeApiError, failWith } from '../client';
import { shrinkImage } from '../../services/media';

/** The customer book: customers, their photos, measurements, design preferences and referrals. */
export const customersApi = {
  // Get boutique fabrics
  // A spreadsheet of customers. Without commit the server only validates and
  // reports; with it, the same file is sent again and the valid rows are saved.
  async importCustomers(file, { commit = false } = {}) {
    const body = new FormData();
    body.append('file', file);
    if (commit) body.append('commit', '1');
    const res = await guardedFetch(`${BASE_URL}/customers/import/`, {
      method: 'POST', headers: getHeaders(true), body,
    });
    if (!res.ok) await failWith(res, 'Failed to read the spreadsheet');
    return res.json();
  },

  // Create customer profile (Step 1). Multipart only when a photo rides
  // along; otherwise JSON, so nested measurements arrive as an object.
  async createCustomer(customerData, profilePhotoFile) {
    let body, headers;
    if (profilePhotoFile) {
      body = new FormData();
      Object.keys(customerData).forEach(key => {
        if (customerData[key] !== null && customerData[key] !== undefined) {
          body.append(key, typeof customerData[key] === 'object' ? JSON.stringify(customerData[key]) : customerData[key]);
        }
      });
      body.append('profile_photo', profilePhotoFile);
      headers = getHeaders(true); // true = multipart (no Content-Type header)
    } else {
      body = JSON.stringify(customerData);
      headers = getHeaders();
    }

    const res = await guardedFetch(`${BASE_URL}/customers/`, { method: 'POST', headers, body });
    // failWith reads the body itself; consuming it here first would leave it
    // with nothing to unpack.
    if (!res.ok) await failWith(res, 'Failed to create customer');
    return res.json();
  },

  // Update customer (e.g. measurements, or drafts)
  async updateCustomer(customerId, customerData) {
    // profile_photo is an ImageField that serializes OUT as a URL string and
    // is writable IN as a file. Every screen that opens an existing customer
    // spreads the API row straight into the form, so the URL came back here as
    // a string and the field rejected it -- re-ordering for any customer who
    // had a photo died on step 1 with "Failed to update customer". Stripped
    // here rather than at the three call sites, because fixing any one of them
    // leaves the other two broken. A real File still passes through untouched.
    const payload = { ...customerData };
    if (typeof payload.profile_photo === 'string') delete payload.profile_photo;

    const res = await guardedFetch(`${BASE_URL}/customers/${customerId}/`, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    // Hand-rolled unpacking of the first field error, which is what
    // describeApiError does for every field rather than only the first.
    if (!res.ok) await failWith(res, 'Failed to update customer');
    return res.json();
  },

  // The customer's photo on its own request: a multipart body cannot carry the
  // nested measurements the JSON saves do, so the two never share one.
  async uploadCustomerPhoto(customerId, file) {
    const body = new FormData();
    body.append('profile_photo', await shrinkImage(file, 800));
    const res = await guardedFetch(`${BASE_URL}/customers/${customerId}/`, {
      method: 'PATCH', headers: getHeaders(true), body,
    });
    if (!res.ok) await failWith(res, 'Failed to save the photo');
    return res.json();
  },

  // Owner only; the server refuses a customer who has orders or alterations,
  // because their invoices and payments would be deleted with them.
  async deleteCustomer(customerId) {
    const res = await guardedFetch(`${BASE_URL}/customers/${customerId}/`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    if (!res.ok) await failWith(res, 'Could not delete the customer');
  },

  // Owner only. Deletes every customer with no orders and no alterations;
  // answers { deleted, kept }.
  async deleteAllCustomers() {
    const res = await guardedFetch(`${BASE_URL}/customers/delete-all/`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ confirm: 'DELETE ALL' }),
    });
    if (!res.ok) await failWith(res, 'Could not delete the customers');
    return res.json();
  },

  // Save design preferences (Step 3)
  async saveDesignPreferences(customerId, notes, imageFiles, selectedUrls = [], source = 'BOUTIQUE_CATALOG', referenceLinks = []) {
    const formData = new FormData();
    formData.append('notes', notes);
    formData.append('selected_urls', JSON.stringify(selectedUrls));
    formData.append('source', source);
    formData.append('reference_links', JSON.stringify(referenceLinks));

    imageFiles.forEach(file => {
      formData.append('images', file);
    });

    const res = await guardedFetch(`${BASE_URL}/customers/${customerId}/design-preferences/`, {
      method: 'POST',
      headers: getHeaders(true),
      body: formData,
    });
    if (!res.ok) await failWith(res, 'Failed to save design preferences');
    return res.json();
  },

  // Sign off one design for production. Supersedes any previously approved design.
  async approveDesign(customerId, prefId, approvedImage = null) {
    const res = await guardedFetch(`${BASE_URL}/customers/${customerId}/design-preferences/${prefId}/approve/`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(approvedImage ? { approved_image: approvedImage } : {}),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(describeApiError(res, err) || 'Failed to approve design');
    }
    return res.json();
  },

  // Get AI Suggestions for a customer based on style inputs
  async getAISuggestions(customerId) {
    const res = await guardedFetch(`${BASE_URL}/customers/${customerId}/ai-suggestions/`, {
      headers: getHeaders()
    });
    if (!res.ok) await failWith(res, 'Failed to fetch AI suggestions');
    return res.json();
  },

  // Get Boutique Designs for a customer based on style inputs
  async getBoutiqueDesigns(customerId) {
    const res = await guardedFetch(`${BASE_URL}/customers/${customerId}/boutique-designs/`, {
      headers: getHeaders()
    });
    if (!res.ok) await failWith(res, 'Failed to fetch boutique designs');
    return res.json();
  },

  // Save fabric selection (Step 4)
  async saveFabricSelection(customerId, fabricData, imageFiles = []) {
    const formData = new FormData();
    formData.append('is_boutique_fabric', fabricData.is_boutique_fabric);
    formData.append('fabric_name', fabricData.fabric_name);
    formData.append('fabric_price', fabricData.fabric_price);

    imageFiles.forEach(file => {
      formData.append('images', file);
    });

    const res = await guardedFetch(`${BASE_URL}/customers/${customerId}/fabric-selections/`, {
      method: 'POST',
      headers: getHeaders(true),
      body: formData,
    });
    if (!res.ok) await failWith(res, 'Failed to save fabric selection');
    return res.json();
  },

  // The whole customer book in one response. Nothing in the app calls this any
  // more -- a large boutique's book is megabytes -- but the endpoint still
  // answers it, so it stays for any caller that has not moved to pages.
  async getCustomers() {
    const res = await guardedFetch(`${BASE_URL}/customers/`, {
      headers: getHeaders()
    });
    if (!res.ok) await failWith(res, 'Failed to fetch customers');
    return res.json();
  },

  // One page of the Customers page, filtered, sorted and counted by the
  // server: { count, page, page_size, page_count, results, summary, facets }.
  // `params` are the page's own: page, page_size, view, search, tier and the
  // filter bar's keys (country, letter, orders, added, birthday, source,
  // gender, city, sort).
  async getCustomerDirectory(params = {}) {
    const url = new URL(`${BASE_URL}/customers/`);
    Object.entries({ page: 1, ...params }).forEach(([k, v]) => {
      if (v !== '' && v !== null && v !== undefined) url.searchParams.append(k, v);
    });
    const res = await guardedFetch(url.toString(), { headers: getHeaders() });
    if (!res.ok) await failWith(res, 'Failed to fetch customers');
    return res.json();
  },

  // The whole book's size and tiers: { total, tiers: { Platinum, Gold, Silver } }.
  async getCustomerStats() {
    const res = await guardedFetch(`${BASE_URL}/customers/stats/`, { headers: getHeaders() });
    if (!res.ok) await failWith(res, 'Failed to fetch customer totals');
    return res.json();
  },

  // A few customers for a picker. { q } searches name, email and mobile;
  // { mobile } narrows to numbers containing those digits; { ids } fetches
  // particular customers. { full: true } returns the list's full rows rather
  // than id / name / mobile / email / city / tier.
  async lookupCustomers({ q = '', mobile = '', ids = [], limit = 20, full = false } = {}) {
    const url = new URL(`${BASE_URL}/customers/lookup/`);
    if (q) url.searchParams.append('q', q);
    if (mobile) url.searchParams.append('mobile', mobile);
    if (ids.length) url.searchParams.append('ids', ids.join(','));
    url.searchParams.append('limit', limit);
    if (full) url.searchParams.append('full', '1');
    const res = await guardedFetch(url.toString(), { headers: getHeaders() });
    if (!res.ok) await failWith(res, 'Failed to search customers');
    return res.json();
  },

  // Full customer record, including nested orders and measurement history.
  // The list endpoint returns flat rows, so open a client through this.
  async getCustomer(customerId) {
    const res = await guardedFetch(`${BASE_URL}/customers/${customerId}/`, {
      headers: getHeaders()
    });
    if (!res.ok) await failWith(res, 'Failed to fetch customer');
    return res.json();
  },

  // The customers this customer referred (GET), or record a new one (POST).
  // The POST body describes the referred customer -- first_name, last_name,
  // mobile_number -- plus an optional note. The server finds them by mobile or
  // adds them; `created` in the answer says which.
  async getCustomerReferrals(customerId) {
    const res = await guardedFetch(`${BASE_URL}/customers/${customerId}/referrals/`, {
      headers: getHeaders()
    });
    if (!res.ok) await failWith(res, 'Could not load the referrals');
    return res.json();
  },

  async addCustomerReferral(customerId, payload) {
    const res = await guardedFetch(`${BASE_URL}/customers/${customerId}/referrals/`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });
    if (!res.ok) await failWith(res, 'Could not record the referral');
    return res.json();
  },
};
