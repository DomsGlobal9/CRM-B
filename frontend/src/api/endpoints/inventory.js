import { BASE_URL } from '../config';
import { guardedFetch, getHeaders, describeApiError, failWith } from '../client';

/** Stock: items, movements, suppliers, purchases, locations, recipes, material plans, reports. */
// --- Inventory: catalogue, locations, recipes, plans and reports ----------
// One small helper rather than a `new URL` dance repeated per call: every one
// of these takes optional filters and drops the ones that are unset.

const inventoryUrl = (path, params = {}) => {
  const url = new URL(`${BASE_URL}/inventory/${path}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.append(key, value);
    }
  });
  return url.toString();
};

const inventoryGet = async (path, params, what) => {
  const res = await guardedFetch(inventoryUrl(path, params), { headers: getHeaders() });
  const raw = await res.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = null; }
  if (!res.ok) throw new Error(describeApiError(res, data));
  return data;
};

const inventoryPost = async (path, body, what) => {
  const res = await guardedFetch(inventoryUrl(path), {
    method: 'POST', headers: getHeaders(), body: JSON.stringify(body || {}),
  });
  const raw = await res.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = null; }
  if (!res.ok) throw new Error(describeApiError(res, data));
  return data;
};

export const inventoryApi = {
  // --- Inventory ---
  async getInventoryItems(params = {}) {
    const url = new URL(`${BASE_URL}/inventory/items/`);
    Object.entries(params).forEach(([k, v]) => { if (v) url.searchParams.append(k, v); });
    const res = await guardedFetch(url.toString(), { headers: getHeaders() });
    if (!res.ok) await failWith(res, 'Failed to fetch inventory');
    return res.json();
  },

  async getInventorySummary() {
    const res = await guardedFetch(`${BASE_URL}/inventory/items/summary/`, { headers: getHeaders() });
    if (!res.ok) await failWith(res, 'Failed to fetch inventory summary');
    return res.json();
  },

  async getInventoryOptions() {
    const res = await guardedFetch(`${BASE_URL}/inventory/items/options/`, { headers: getHeaders() });
    if (!res.ok) await failWith(res, 'Failed to fetch inventory options');
    return res.json();
  },

  // The garment / section / slot tree and the material kinds the fabric
  // catalogue used to serve. Owner-only like the rest of inventory.
  async getInventoryTaxonomy() {
    const res = await guardedFetch(`${BASE_URL}/inventory/items/taxonomy/`, { headers: getHeaders() });
    if (!res.ok) await failWith(res, 'Failed to fetch fabric categories');
    return res.json();
  },

  // Photographs go up before the item exists, so the form saves the URLs.
  async uploadInventoryImages(files) {
    const formData = new FormData();
    [...files].forEach((file) => formData.append('images', file));
    const res = await guardedFetch(`${BASE_URL}/inventory/items/upload-images/`, {
      method: 'POST', headers: getHeaders(true), body: formData,
    });
    if (!res.ok) await failWith(res, 'Failed to upload the photos');
    return res.json();
  },

  async saveInventoryItem(itemData, itemId = null) {
    const res = await guardedFetch(
      itemId ? `${BASE_URL}/inventory/items/${itemId}/` : `${BASE_URL}/inventory/items/`,
      {
        method: itemId ? 'PATCH' : 'POST',
        headers: getHeaders(),
        body: JSON.stringify(itemData),
      }
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(describeApiError(res, err) || 'Failed to save item');
    }
    return res.json();
  },

  // Every stock change goes through one of the movement endpoints so the ledger
  // stays in step; the quantity fields themselves are read-only.
  async moveStock(itemId, movement, payload) {
    const res = await guardedFetch(`${BASE_URL}/inventory/items/${itemId}/${movement}/`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(describeApiError(res, err) || 'Failed to record stock movement');
    }
    return res.json();
  },

  async getItemMovements(itemId) {
    const res = await guardedFetch(`${BASE_URL}/inventory/items/${itemId}/movements/`, { headers: getHeaders() });
    if (!res.ok) await failWith(res, 'Failed to fetch stock history');
    return res.json();
  },

  async getSuppliers() {
    const res = await guardedFetch(`${BASE_URL}/inventory/suppliers/`, { headers: getHeaders() });
    if (!res.ok) await failWith(res, 'Failed to fetch suppliers');
    return res.json();
  },

  async createSupplier(data) {
    const res = await guardedFetch(`${BASE_URL}/inventory/suppliers/`, {
      method: 'POST', headers: getHeaders(), body: JSON.stringify(data),
    });
    if (!res.ok) await failWith(res, 'Failed to create supplier');
    return res.json();
  },

  async getPurchaseOrders() {
    const res = await guardedFetch(`${BASE_URL}/inventory/purchase-orders/`, { headers: getHeaders() });
    if (!res.ok) await failWith(res, 'Failed to fetch purchase orders');
    return res.json();
  },

  async createPurchaseOrder(data) {
    const res = await guardedFetch(`${BASE_URL}/inventory/purchase-orders/`, {
      method: 'POST', headers: getHeaders(), body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(describeApiError(res, err) || 'Failed to create purchase order');
    }
    return res.json();
  },

  async receivePurchaseOrder(poId, lines) {
    const res = await guardedFetch(`${BASE_URL}/inventory/purchase-orders/${poId}/receive/`, {
      method: 'POST', headers: getHeaders(), body: JSON.stringify({ lines }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(describeApiError(res, err) || 'Failed to receive goods');
    }
    return res.json();
  },

// Catalogue
  getCatalogSections: () => inventoryGet('catalog/items/sections/'),

  getCatalogItems: (params) => inventoryGet('catalog/items/', params),

  stockCatalogItem: (id, payload) => inventoryPost(`catalog/items/${id}/stock/`, payload),

  // Locations and transfers
  getStockLocations: (params) => inventoryGet('locations/', params),

  getLocationStock: (id) => inventoryGet(`locations/${id}/stock/`),

  createStockLocation: (payload) => inventoryPost('locations/', payload),

  deleteStockLocation: async (id) => {
    const res = await guardedFetch(inventoryUrl(`locations/${id}/`), { method: 'DELETE', headers: getHeaders() });
    if (!res.ok) {
      let data = null;
      try { data = await res.json(); } catch { data = null; }
      throw new Error(describeApiError(res, data));
    }
  },

  getItemLocations: (itemId) => inventoryGet(`items/${itemId}/locations/`),

  transferStock: (itemId, payload) => inventoryPost(`items/${itemId}/transfer/`, payload),

  // Racks & shelves (apps/inventory/shelves.py): where inside a location
  // stock sits. Errors come back as a sentence for the screen.
  getShelfTree: (location) => inventoryGet('shelves/tree/', { location }),

  findOnShelves: (q, location) => inventoryGet('shelves/find/', { q, location }),

  getItemShelves: (itemId, location) => inventoryGet(`shelves/item/${itemId}/`, { location }),

  getNotShelved: (location) => inventoryGet('shelves/not-shelved/', { location }),

  scanShelf: (code, location) => inventoryGet('shelves/scan/', { code, location }),

  previewShelfSetup: (payload) => inventoryPost('shelves/setup/', { ...payload, preview: true }),

  saveShelfSetup: (payload) => inventoryPost('shelves/setup/', { ...payload, preview: false }),

  getShelfLabels: (location, spots) => inventoryGet('shelves/labels/', { location, spots }),

  putAwayOnShelf: (payload) => inventoryPost('shelves/put-away/', payload),

  moveOnShelves: (payload) => inventoryPost('shelves/move/', payload),

  moveWholeShelf: (payload) => inventoryPost('shelves/move-all/', payload),

  reportMissingOnShelf: (payload) => inventoryPost('shelves/report-missing/', payload),

  createShelfSpot: (payload) => inventoryPost('shelves/spots/', payload),

  getShelfSpot: (id) => inventoryGet(`shelves/spots/${id}/`),

  getShelfSpotHistory: (id) => inventoryGet(`shelves/spots/${id}/history/`),

  countShelf: (id, payload) => inventoryPost(`shelves/spots/${id}/count/`, payload),

  getShelfIssues: (params) => inventoryGet('shelves/issues/', params),

  resolveShelfIssue: (id, note) => inventoryPost(`shelves/issues/${id}/resolve/`, { note }),

  updateShelfSpot: async (id, payload) => {
    const res = await guardedFetch(inventoryUrl(`shelves/spots/${id}/`), {
      method: 'PATCH', headers: getHeaders(), body: JSON.stringify(payload || {}),
    });
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    if (!res.ok) throw new Error(describeApiError(res, data));
    return data;
  },

  deleteShelfSpot: async (id) => {
    const res = await guardedFetch(inventoryUrl(`shelves/spots/${id}/`), { method: 'DELETE', headers: getHeaders() });
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    if (!res.ok) throw new Error(describeApiError(res, data));
    return data;
  },

  // Recipes
  getBoms: (params) => inventoryGet('boms/', params),

  createBom: (payload) => inventoryPost('boms/', payload),

  // One request for the whole recipe: its name and every material line.
  async saveBom(payload, id = null) {
    const res = await guardedFetch(inventoryUrl(id ? `boms/${id}/` : 'boms/'), {
      method: id ? 'PATCH' : 'POST', headers: getHeaders(), body: JSON.stringify(payload),
    });
    const raw = await res.text();
    let data = null;
    try { data = raw ? JSON.parse(raw) : null; } catch { data = null; }
    if (!res.ok) throw new Error(describeApiError(res, data));
    return data;
  },

  async deleteBom(id) {
    const res = await guardedFetch(inventoryUrl(`boms/${id}/`), { method: 'DELETE', headers: getHeaders() });
    if (!res.ok && res.status !== 204) await failWith(res, 'Could not remove the recipe.');
    return true;
  },

  getBomRequirements: (id, payload) => inventoryPost(`boms/${id}/requirements/`, payload),

  newBomVersion: (id) => inventoryPost(`boms/${id}/new-version/`),

  createBomLine: (payload) => inventoryPost('bom-lines/', payload),

  async deleteBomLine(id) {
    const res = await guardedFetch(inventoryUrl(`bom-lines/${id}/`), {
      method: 'DELETE', headers: getHeaders(),
    });
    if (!res.ok && res.status !== 204) await failWith(res, 'Could not remove the line.');
    return true;
  },

  // Order material plans
  getMaterialPlans: (params) => inventoryGet('material-plans/', params),

  // The Master's gathering checklist: created on first look, ticked with a
  // name, photographed for the road ahead.
  getMaterialChecklist: (orderId) => inventoryGet('material-plans/checklist/', { order: orderId }),

  gatherMaterialLine: (planId, lineId, gathered) =>
    inventoryPost(`material-plans/${planId}/gather/`, { line_id: lineId, gathered }),

  async addMaterialLinePhoto(planId, lineId, imageFile) {
    const formData = new FormData();
    formData.append('line_id', lineId);
    formData.append('image', imageFile);
    const res = await guardedFetch(`${BASE_URL}/inventory/material-plans/${planId}/line-photo/`, {
      method: 'POST', headers: getHeaders(true), body: formData,
    });
    if (!res.ok) await failWith(res, 'Could not attach the photograph.');
    return res.json();
  },

  planMaterials: (payload) => inventoryPost('material-plans/plan/', payload),

  getPlanAvailability: (id) => inventoryGet(`material-plans/${id}/availability/`),

  reservePlan: (id, payload) => inventoryPost(`material-plans/${id}/reserve/`, payload),

  consumePlanLine: (id, payload) => inventoryPost(`material-plans/${id}/consume/`, payload),

  releasePlanUnused: (id) => inventoryPost(`material-plans/${id}/release-unused/`),

  deductPlanPackaging: (id) => inventoryPost(`material-plans/${id}/deduct-packaging/`),

  reconcilePlan: (id) => inventoryGet(`material-plans/${id}/reconcile/`),

  closePlan: (id, payload) => inventoryPost(`material-plans/${id}/close/`, payload),

  cancelPlan: (id) => inventoryPost(`material-plans/${id}/cancel/`),

  // Customer-supplied materials
  getCustomerMaterials: (params) => inventoryGet('customer-materials/', params),

  receiveCustomerMaterial: (payload) => inventoryPost('customer-materials/', payload),

  recordCustomerMaterial: (id, action, payload) =>
    inventoryPost(`customer-materials/${id}/${action}/`, payload),

  // Things bought for one order (not stock). `step`: purchased | received | use | cancel.
  getOrderPurchases: (params) => inventoryGet('order-purchases/', params),

  createOrderPurchase: (payload) => inventoryPost('order-purchases/', payload),

  updateOrderPurchase: async (id, payload) => {
    const res = await guardedFetch(inventoryUrl(`order-purchases/${id}/`), {
      method: 'PATCH', headers: getHeaders(), body: JSON.stringify(payload || {}),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(describeApiError(res, data));
    return data;
  },

  stepOrderPurchase: (id, step, payload) => inventoryPost(`order-purchases/${id}/${step}/`, payload),

  // Reports
  getInventoryReport: (name, params) => inventoryGet(`reports/${name}/`, params),
};
