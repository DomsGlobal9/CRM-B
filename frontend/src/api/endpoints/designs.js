import { BASE_URL } from '../config';
import { guardedFetch, getHeaders, describeApiError, failWith } from '../client';

/** The Design Studio and the boutique's design library. */
export const designsApi = {
  // Owner only. The server deactivates the designer's login rather than
  // deleting it, as it does for a roster member.
  async deleteDesigner(id) {
    const res = await guardedFetch(`${BASE_URL}/design-studio/designers/${id}/`, {
      method: 'DELETE',
      headers: getHeaders()
    });
    if (!res.ok) await failWith(res, 'Failed to delete designer');
    return true;
  },

  // Designs CRUD
  async getAllBoutiqueDesigns() {
    const res = await guardedFetch(`${BASE_URL}/boutique-designs/`, {
      headers: getHeaders()
    });
    if (!res.ok) await failWith(res, 'Failed to fetch all boutique designs');
    return res.json();
  },

  async createBoutiqueDesign(designData) {
    const res = await guardedFetch(`${BASE_URL}/boutique-designs/`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(designData),
    });
    if (!res.ok) await failWith(res, 'Failed to create boutique design');
    return res.json();
  },

  // A garment photo for the Add New Design form: stored first, then its
  // URL rides in the design's JSON as image_url like a pasted link does.
  async uploadBoutiqueDesignImage(file) {
    const body = new FormData();
    body.append('image', file);
    const res = await guardedFetch(`${BASE_URL}/boutique-designs/upload-image/`, {
      method: 'POST', headers: getHeaders(true), body,
    });
    if (!res.ok) await failWith(res, 'Failed to upload the design image');
    return res.json();
  },

  async updateBoutiqueDesign(id, designData) {
    const res = await guardedFetch(`${BASE_URL}/boutique-designs/${id}/`, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify(designData),
    });
    if (!res.ok) await failWith(res, 'Failed to update boutique design');
    return res.json();
  },

  async deleteBoutiqueDesign(id) {
    const res = await guardedFetch(`${BASE_URL}/boutique-designs/${id}/`, {
      method: 'DELETE',
      headers: getHeaders()
    });
    if (!res.ok) await failWith(res, 'Failed to delete boutique design');
    return true;
  },

  // --- AI Design Studio ---------------------------------------------
  // Either source: a saved customer, or the draft an order is still being
  // written in. Pass `{ customer_id }` or `{ draft_id }` plus `garment_key`
  // for which dress -- the server resolves both to one context shape, so
  // nothing here branches on which it was.
  async getDesignContext(source, orderInput = {}) {
    const url = new URL(`${BASE_URL}/design-studio/context/`);
    const params = typeof source === 'string' ? { customer_id: source } : (source || {});
    Object.entries(params).forEach(([key, value]) => {
      if (value) url.searchParams.append(key, value);
    });
    Object.entries(orderInput).forEach(([key, value]) => {
      if (value) url.searchParams.append(key, value);
    });
    const res = await guardedFetch(url.toString(), { headers: getHeaders() });
    if (!res.ok) await failWith(res, 'Failed to load design context');
    return res.json();
  },

  async discoverDesigns(payload) {
    const res = await guardedFetch(`${BASE_URL}/design-studio/discover/`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });
    if (!res.ok) await failWith(res, 'Failed to search designs');
    return res.json();
  },

  async createDesignBoard(customerId, title = '', contextSnapshot = {}, queries = []) {
    const res = await guardedFetch(`${BASE_URL}/design-studio/boards/`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        customer: customerId,
        title,
        context_snapshot: contextSnapshot,
        search_queries: queries
      })
    });
    if (!res.ok) await failWith(res, 'Failed to create design board');
    return res.json();
  },

  async getDesignBoards(params = {}) {
    const url = new URL(`${BASE_URL}/design-studio/boards/`);
    Object.entries(params).forEach(([key, value]) => {
      if (value) url.searchParams.append(key, value);
    });
    const res = await guardedFetch(url.toString(), { headers: getHeaders() });
    if (!res.ok) await failWith(res, 'Failed to load design boards');
    return res.json();
  },

  // The Master's note on how to make the selected design. The endpoint has a
  // dedicated Master-only permission carve-out, a model field, a slot in
  // TailorBriefSerializer and two tests -- and its URL appeared nowhere in this
  // file, so the note could never be written from the product.
  async saveProductionNotes(boardId, itemId, notes) {
    const res = await guardedFetch(
      `${BASE_URL}/design-studio/boards/${boardId}/items/${itemId}/production-notes/`,
      {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify({ production_notes: notes }),
      });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(describeApiError(res, data));
    return data;
  },

  async addDesignToBoard(boardId, design) {
    const res = await guardedFetch(`${BASE_URL}/design-studio/boards/${boardId}/items/`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(design)
    });
    if (!res.ok) await failWith(res, 'Failed to shortlist design');
    return res.json();
  },

  async removeDesignFromBoard(boardId, itemId) {
    const res = await guardedFetch(`${BASE_URL}/design-studio/boards/${boardId}/items/${itemId}/`, {
      method: 'DELETE',
      headers: getHeaders()
    });
    if (!res.ok) await failWith(res, 'Failed to remove design');
    return true;
  },

  async selectBoardDesign(boardId, itemId) {
    const res = await guardedFetch(`${BASE_URL}/design-studio/boards/${boardId}/items/${itemId}/select/`, {
      method: 'POST',
      headers: getHeaders()
    });
    if (!res.ok) await failWith(res, 'Failed to select design');
    return res.json();
  },

  async customiseBoardDesign(boardId, itemId, changes) {
    const res = await guardedFetch(`${BASE_URL}/design-studio/boards/${boardId}/items/${itemId}/customise/`, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify(changes)
    });
    if (!res.ok) await failWith(res, 'Failed to save customisation');
    return res.json();
  },

  async approveDesignBoard(boardId) {
    const res = await guardedFetch(`${BASE_URL}/design-studio/boards/${boardId}/approve/`, {
      method: 'POST',
      headers: getHeaders()
    });
    const data = await res.json();
    if (!res.ok) throw new Error(describeApiError(res, data));
    return data;
  },

  // --- Design library ---------------------------------------------------

  // The part tabs on the order wizard's first screen. Needs no customer and no
  // draft: it is the boutique's own library, filed by part of the garment, and
  // the customer browses it before giving any details.
  async getGarmentPartImages({ garment_key, part } = {}) {
    const url = new URL(`${BASE_URL}/design-studio/part-images/`);
    if (garment_key) url.searchParams.set('garment_key', garment_key);
    if (part) url.searchParams.set('part', part);
    const res = await fetch(url.toString(), { headers: getHeaders() });
    if (!res.ok) await failWith(res, 'Failed to load designs for this garment');
    return res.json();
  },

  // A reference photograph the customer brought for one part. Stored on the
  // spot and returned as a URL, because the wizard holds its work in a JSON
  // draft until Confirm and a file cannot ride in one.
  // Design Discovery: photographs from the open web for one garment part.
  // The search returns links; `keepWebDesign` copies a chosen one into our
  // storage, because the vendor's links expire.
  async webDesignSearchAvailable() {
    const res = await guardedFetch(`${BASE_URL}/design-studio/web-search/`, { headers: getHeaders() });
    if (!res.ok) return false;
    return !!(await res.json()).available;
  },

  async searchWebDesigns(payload) {
    const res = await guardedFetch(`${BASE_URL}/design-studio/web-search/`, {
      method: 'POST', headers: getHeaders(), body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || describeApiError(res, data) || 'The design search failed.');
    return data;
  },

  async keepWebDesign(imageUrl, title) {
    const res = await guardedFetch(`${BASE_URL}/design-studio/web-keep/`, {
      method: 'POST', headers: getHeaders(), body: JSON.stringify({ image_url: imageUrl, title }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || describeApiError(res, data) || 'Could not keep that picture.');
    return data;
  },

  // Garment preview: the vendor draws the garment the wizard put together,
  // on a model. 30-95 s live; the server waits it out and answers a URL.
  async garmentPreviewAvailable() {
    const res = await guardedFetch(`${BASE_URL}/design-studio/preview/`, { headers: getHeaders() });
    if (!res.ok) return false;
    return !!(await res.json()).available;
  },

  // { available, garments }: whether drawing is set up, and for which garments.
  async garmentPreviewInfo() {
    const res = await guardedFetch(`${BASE_URL}/design-studio/preview/`, { headers: getHeaders() });
    if (!res.ok) return { available: false, garments: [] };
    const data = await res.json();
    return { available: !!data.available, garments: Array.isArray(data.garments) ? data.garments : [] };
  },

  async generateGarmentPreview(payload) {
    const res = await guardedFetch(`${BASE_URL}/design-studio/preview/`, {
      method: 'POST', headers: getHeaders(), body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || describeApiError(res, data) || 'The preview could not be made.');
    return data;
  },

  async cancelGarmentPreview(customerId = null) {
    const res = await guardedFetch(`${BASE_URL}/design-studio/preview/cancel/`, {
      method: 'POST', headers: getHeaders(), body: JSON.stringify(customerId ? { clientId: customerId } : {}),
    });
    return res.ok ? res.json() : { cancelled: false };
  },

  async uploadReferenceImage(file) {
    const body = new FormData();
    body.append('image', file);
    const res = await guardedFetch(`${BASE_URL}/design-studio/reference-upload/`, {
      method: 'POST', headers: getHeaders(true), body,
    });
    if (!res.ok) await failWith(res, 'Failed to upload the reference image');
    return res.json();
  },

  // A customer's captured designs: a photograph of a paper sketch, or the
  // PNG the studio's canvas produced -- one `image` file either way, with
  // `source` saying which. Listed newest first, narrowed by customer.
  async getCustomerDesigns(params = {}) {
    const url = new URL(`${BASE_URL}/design-studio/customer-designs/`);
    Object.entries(params).forEach(([k, v]) => {
      if (v !== '' && v !== null && v !== undefined) url.searchParams.append(k, v);
    });
    const res = await guardedFetch(url.toString(), { headers: getHeaders() });
    if (!res.ok) await failWith(res, 'Failed to load customer designs');
    const data = await res.json();
    return data.results || data;
  },

  async createCustomerDesign(fields, imageFile) {
    const form = new FormData();
    Object.entries(fields).forEach(([key, value]) => {
      if (value === '' || value === null || value === undefined) return;
      form.append(key, value);
    });
    form.append('image', imageFile);
    const res = await guardedFetch(`${BASE_URL}/design-studio/customer-designs/`, {
      method: 'POST', headers: getHeaders(true), body: form,
    });
    if (!res.ok) await failWith(res, 'Failed to save the customer design');
    return res.json();
  },

  // The design catalogue tree for one garment: category -> sub-category ->
  // design option. Empty categories for a garment that has none yet.
  async getDesignCatalogue(garment) {
    const url = new URL(`${BASE_URL}/design-studio/catalogue/`);
    if (garment) url.searchParams.set('garment', garment);
    const res = await guardedFetch(url.toString(), { headers: getHeaders() });
    if (!res.ok) await failWith(res, 'Failed to load the design catalogue');
    return res.json();
  },

  async getDesignCategories() {
    const res = await guardedFetch(`${BASE_URL}/design-studio/categories/`, { headers: getHeaders() });
    if (!res.ok) await failWith(res, 'Failed to load design categories');
    return res.json();
  },

  async getDesignLibrary(params = {}) {
    const url = new URL(`${BASE_URL}/design-studio/assets/`);
    Object.entries(params).forEach(([k, v]) => {
      if (v !== '' && v !== null && v !== undefined) url.searchParams.append(k, v);
    });
    const res = await guardedFetch(url.toString(), { headers: getHeaders() });
    if (!res.ok) await failWith(res, 'Failed to load the design library');
    return res.json();
  },

  async reviewDesign(id, decision, note = '') {
    const res = await guardedFetch(`${BASE_URL}/design-studio/assets/${id}/review/`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ decision, note })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(describeApiError(res, data));
    return data;
  },

  async getDesignApprovalHistory(id) {
    const res = await guardedFetch(`${BASE_URL}/design-studio/assets/${id}/approval-history/`, { headers: getHeaders() });
    if (!res.ok) await failWith(res, 'Failed to load approval history');
    return res.json();
  },

  async getDesignDashboard() {
    const res = await guardedFetch(`${BASE_URL}/design-studio/dashboard/`, { headers: getHeaders() });
    if (!res.ok) await failWith(res, 'Failed to load the design dashboard');
    return res.json();
  },

  async getDesignerPortfolio(id) {
    const res = await guardedFetch(`${BASE_URL}/design-studio/designers/${id}/portfolio/`, { headers: getHeaders() });
    if (!res.ok) await failWith(res, 'Failed to load the portfolio');
    return res.json();
  },

  // Owner-only: switches a credited designer on so they can sign in for
  // themselves. Idempotent server-side -- a second call against an
  // already-linked designer is refused rather than silently reissuing.
  // Owner only: replaces the person's password with a generated one, shown once.
  async resetStaffPassword(id, { isDesigner = false } = {}) {
    const url = isDesigner
      ? `${BASE_URL}/design-studio/designers/${id}/reset-password/`
      : `${BASE_URL}/tailors/${id}/reset-password/`;
    const res = await guardedFetch(url, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(describeApiError(res, data));
    return data;
  },

  async createDesignerLogin(id, email) {
    const res = await guardedFetch(`${BASE_URL}/design-studio/designers/${id}/create-login/`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ email })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(describeApiError(res, data));
    return data;
  },

  async getDesignAsset(id) {
    const res = await guardedFetch(`${BASE_URL}/design-studio/assets/${id}/`, { headers: getHeaders() });
    if (!res.ok) await failWith(res, 'Failed to load the design');
    return res.json();
  },

  // getDesignDashboard and getDesignerPortfolio used to be defined again here,
  // a second time in the same object literal. The later key silently wins in
  // JS, so the earlier pair above was unreachable and any edit made to it
  // would have been discarded without a word. One definition each, above.

  async getCollections(params = {}) {
    const url = new URL(`${BASE_URL}/design-studio/collections/`);
    Object.entries(params).forEach(([k, v]) => { if (v) url.searchParams.append(k, v); });
    const res = await guardedFetch(url.toString(), { headers: getHeaders() });
    if (!res.ok) await failWith(res, 'Failed to load collections');
    return res.json();
  },

  async createCollection(payload) {
    const res = await guardedFetch(`${BASE_URL}/design-studio/collections/`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(describeApiError(res, data));
    return data;
  },

  // Multipart: the browser posts the photographs themselves rather than the
  // boutique having to host an image somewhere and paste a URL.
  // `imageParts` runs parallel to `imageFiles`: one part key per file, in the
  // same order. Appended one at a time rather than as an array, because the
  // server reads it with getlist() -- a single JSON-stringified value would
  // arrive as one opaque string and every photograph would file as 'overall'.
  async uploadDesign(fields, imageFiles = [], imageParts = []) {
    const form = new FormData();
    Object.entries(fields).forEach(([key, value]) => {
      if (value === '' || value === null || value === undefined) return;
      form.append(key, typeof value === 'object' ? JSON.stringify(value) : value);
    });
    imageFiles.forEach(file => form.append('images', file));
    imageParts.forEach(part => form.append('image_parts', part));

    const res = await guardedFetch(`${BASE_URL}/design-studio/assets/`, {
      method: 'POST',
      headers: getHeaders(true),
      body: form
    });

    // Read the body as text first. res.json() on a non-JSON body rejects with
    // whatever the engine's parser says, and that message reaches the user
    // verbatim -- on WebKit it is "The string did not match the expected
    // pattern", which describes neither what failed nor what to do about it.
    // A 500 renders as an HTML page, so this is the path any server error
    // takes, not an edge case.
    const raw = await res.text();
    let data = null;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {
      data = null;
    }

    if (!res.ok) throw new Error(describeApiError(res, data));
    return data;
  },

  // --- Design assignments -------------------------------------------
  // The work loop: an Owner or Master assigns a garment's design to a
  // designer, the designer submits, the supervisor reviews. Scoped
  // server-side by DesignAssignmentPermission -- a designer's list comes
  // back as their own desk and nobody else's, so there is no client-side
  // filtering to get wrong here.
  async getDesignAssignments(params = {}) {
    const url = new URL(`${BASE_URL}/design-studio/assignments/`);
    Object.entries(params).forEach(([k, v]) => { if (v) url.searchParams.append(k, v); });
    const res = await guardedFetch(url.toString(), { headers: getHeaders() });
    if (!res.ok) await failWith(res, 'Failed to load design assignments');
    return res.json();
  },

  // Posting for a garment that already has an assignment reassigns it, and
  // comes back 200 rather than 201. An approved garment is refused with 409.
  async assignDesignWork(payload) {
    const res = await guardedFetch(`${BASE_URL}/design-studio/assignments/`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(describeApiError(res, data));
    return data;
  },

  async submitDesignAssignment(id, designId, note = '') {
    const res = await guardedFetch(`${BASE_URL}/design-studio/assignments/${id}/submit/`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ design: designId, note })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(describeApiError(res, data));
    return data;
  },

  // decision: 'approve' | 'changes'.
  async reviewDesignAssignment(id, decision, note = '') {
    const res = await guardedFetch(`${BASE_URL}/design-studio/assignments/${id}/review/`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ decision, note })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(describeApiError(res, data));
    return data;
  },

  async getDesigners(params = {}) {
    const url = new URL(`${BASE_URL}/design-studio/designers/`);
    Object.entries(params).forEach(([k, v]) => { if (v) url.searchParams.append(k, v); });
    const res = await guardedFetch(url.toString(), { headers: getHeaders() });
    if (!res.ok) await failWith(res, 'Failed to load designers');
    return res.json();
  },

  // Owner-only, enforced server-side by DesignStudioPermission. Creates a
  // credit-only designer -- `email` is optional here and the row carries no
  // login until createDesignerLogin runs against it.
  async createDesigner(payload) {
    const res = await guardedFetch(`${BASE_URL}/design-studio/designers/`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(describeApiError(res, data));
    return data;
  },

  // Owner-only, same permission class as createDesigner. PATCH so the staff
  // screen can send just the fields its form owns without clearing a bio or a
  // portfolio image it never showed.
  async updateDesigner(id, payload) {
    const res = await guardedFetch(`${BASE_URL}/design-studio/designers/${id}/`, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(describeApiError(res, data));
    return data;
  },

  async saveDesignBoardToOrder(boardId, orderId) {
    const res = await guardedFetch(`${BASE_URL}/design-studio/boards/${boardId}/save-to-order/`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ order_id: orderId })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(describeApiError(res, data));
    return data;
  },
};
