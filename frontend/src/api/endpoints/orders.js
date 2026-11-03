import { BASE_URL } from '../config';
import { guardedFetch, getHeaders, describeApiError, failWith } from '../client';
import { shrinkImage } from '../../services/media';

/** Orders and their journey through the workroom: stages, parts, photos, payments, messages. */
export const ordersApi = {
  // Nominate who should perform a stage. Pass tailorId null to clear it.
  // A verifier opened a submitted stage. Idempotent on the server: the
  // first open leaves the "seen" tick and tells the worker, later ones do
  // nothing, so this is safe to call on every open.
  // `garmentJob`: which garment's row, on a stage tracked per garment.
  async markStageSeen(orderId, stageKey, garmentJob = null) {
    const res = await guardedFetch(`${BASE_URL}/orders/${orderId}/stage-seen/`, {
      method: 'POST', headers: getHeaders(), body: JSON.stringify({ stage_key: stageKey, garment_job: garmentJob }),
    });
    if (!res.ok) await failWith(res, 'Could not mark the stage as seen');
    return res.json();
  },

  async assignStage(orderId, stageKey, tailorId, garmentJob = null) {
    const res = await guardedFetch(`${BASE_URL}/orders/${orderId}/assign-stage/`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ stage_key: stageKey, tailor_id: tailorId, garment_job: garmentJob }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(describeApiError(res, err) || 'Failed to assign stage');
    }
    return res.json();
  },

  // A step split between several people (domains/orders/stage_parts.py).
  // parts: [{ label, tailor_id }]. Each answers the whole order, refreshed.
  async splitStage(orderId, stageKey, parts, garmentJob = null) {
    const res = await guardedFetch(`${BASE_URL}/orders/${orderId}/split-stage/`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ stage_key: stageKey, garment_job: garmentJob, parts }),
    });
    if (!res.ok) await failWith(res, 'Could not split this step');
    return res.json();
  },

  async unsplitStage(orderId, stageKey, garmentJob = null) {
    const res = await guardedFetch(`${BASE_URL}/orders/${orderId}/unsplit-stage/`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ stage_key: stageKey, garment_job: garmentJob }),
    });
    if (!res.ok) await failWith(res, 'Could not undo the split');
    return res.json();
  },

  async assignPart(orderId, partId, tailorId) {
    const res = await guardedFetch(`${BASE_URL}/orders/${orderId}/assign-part/`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ part_id: partId, tailor_id: tailorId }),
    });
    if (!res.ok) await failWith(res, 'Could not change who does this part');
    return res.json();
  },

  async transitionPart(orderId, partId, status, comments = '', imageFiles = [], voiceNote = null) {
    const formData = new FormData();
    formData.append('part_id', partId);
    formData.append('status', status);
    if (comments) formData.append('comments', comments);
    if (voiceNote) formData.append('voice_note', voiceNote);
    if (imageFiles && imageFiles.length > 0) {
      (await Promise.all(imageFiles.map((file) => shrinkImage(file)))).forEach((file) => formData.append('images', file));
    }
    const res = await guardedFetch(`${BASE_URL}/orders/${orderId}/part-transition/`, {
      method: 'POST',
      headers: getHeaders(true),
      body: formData,
    });
    if (!res.ok) await failWith(res, 'Could not update this part');
    return res.json();
  },

  // Create order (Step 5)
  async createOrder(customerId, orderData) {
    const res = await guardedFetch(`${BASE_URL}/customers/${customerId}/create-order/`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(orderData),
    });
    // Read the body before throwing, the way the sibling updateOrder already
    // does. The fixed string this replaces discarded every reason the server
    // takes trouble to produce -- "base_price cannot be negative", the total
    // ceiling, a missing tailor -- so the owner was told "Failed to create
    // order" for a mistake they could have corrected in seconds if anyone had
    // told them which field it was.
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(describeApiError(res, data));
    }
    return res.json();
  },

  // Update order status
  async updateOrderStatus(orderId, status) {
    const res = await guardedFetch(`${BASE_URL}/orders/${orderId}/update-status/`, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify({ status }),
    });
    // Read the body before throwing. This used to discard the response, so the
    // API's actual explanation -- "Cannot deliver order before Master Quality
    // Check is completed." -- was replaced by a generic failure the owner
    // could not act on. Matches what transitionStage already does below.
    if (!res.ok) {
      const detail = await res.json().catch(() => ({}));
      throw new Error(describeApiError(res, detail) || 'Failed to update order status');
    }
    return res.json();
  },

  /** One tap from the counter: put the Master and tailor on the order and
   *  start its first workroom stage. Returns the order plus `started_stage`. */
  async sendToWorkshop(orderId, { master, tailor } = {}) {
    const res = await guardedFetch(`${BASE_URL}/orders/${orderId}/send-to-workshop/`, {
      method: 'POST', headers: getHeaders(), body: JSON.stringify({ master: master || null, tailor: tailor || null }),
    });
    if (!res.ok) await failWith(res, 'Could not send the order to the workshop');
    return res.json();
  },

  /** The staff the signed-in person may hand work to, decided on the server
   *  by the Owner > Designer > Master > worker hierarchy: {id, name, role}. */
  async getAssignableStaff() {
    const res = await guardedFetch(`${BASE_URL}/orders/assignable-staff/`, { headers: getHeaders() });
    if (!res.ok) await failWith(res, 'Could not load the staff you can assign');
    return res.json();
  },

  /** Owner of a staff-less boutique completes every remaining stage at once. */
  async completeAllStages(orderId) {
    const res = await guardedFetch(`${BASE_URL}/orders/${orderId}/complete-all/`, {
      method: 'POST', headers: getHeaders(),
    });
    if (!res.ok) await failWith(res, 'Could not complete the stages');
    return res.json();
  },

  /** Owner/Master moves an order onto the other path through the workroom. */
  async setOrderFlow(orderId, flow) {
    const res = await guardedFetch(`${BASE_URL}/orders/${orderId}/set-flow/`, {
      method: 'POST', headers: getHeaders(), body: JSON.stringify({ flow }),
    });
    if (!res.ok) await failWith(res, 'Failed to change the order path');
    return res.json();
  },

  /** Owner/Master rejects one submitted photo with a remark, or clears a verdict. */
  async reviewStagePhoto(orderId, stageKey, url, remark, status = 'REJECTED', garmentJob = null) {
    const res = await guardedFetch(`${BASE_URL}/orders/${orderId}/review-photo/`, {
      method: 'POST', headers: getHeaders(),
      body: JSON.stringify({ stage_key: stageKey, url, remark, status, garment_job: garmentJob }),
    });
    if (!res.ok) await failWith(res, 'Failed to review the photo');
    return res.json();
  },

  async submitCompletion(orderId, comments, imageFiles, garmentJob = null) {
    const formData = new FormData();
    if (comments) formData.append('tailor_comments', comments);
    if (garmentJob) formData.append('garment_job', garmentJob);
    [].concat(imageFiles || []).filter(Boolean)
      .forEach((f) => formData.append('completed_garment_images', f));

    const res = await guardedFetch(`${BASE_URL}/orders/${orderId}/submit-completion/`, {
      method: 'PATCH',
      headers: getHeaders(true),
      body: formData
    });
    if (!res.ok) await failWith(res, 'Failed to submit completion');
    return res.json();
  },

  async submitStageReview(orderId, stage, comments, imageFile, completedBy = 'Boutique Staff') {
    const formData = new FormData();
    formData.append('stage', stage);
    if (comments) formData.append('comments', comments);
    if (imageFile) formData.append('image', imageFile);
    formData.append('completed_by', completedBy);

    const res = await guardedFetch(`${BASE_URL}/orders/${orderId}/submit-stage-review/`, {
      method: 'POST',
      headers: getHeaders(true),
      body: formData
    });
    if (!res.ok) await failWith(res, 'Failed to submit stage review');
    return res.json();
  },

  // The two sanctioned reversals. Both demand a reason because the record of
  // who moved a garment backwards, and why, is the entire point of them.
  async reopenStage(orderId, stageKey, reason, garmentJob = null) {
    const res = await guardedFetch(`${BASE_URL}/orders/${orderId}/reopen-stage/`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ stage_key: stageKey, reason, garment_job: garmentJob }),
    });
    if (!res.ok) await failWith(res, 'Could not reopen that stage.');
    return res.json();
  },

  async failQualityCheck(orderId, reason, garmentJob = null) {
    const res = await guardedFetch(`${BASE_URL}/orders/${orderId}/fail-qc/`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ reason, garment_job: garmentJob }),
    });
    if (!res.ok) await failWith(res, 'Could not record the QC failure.');
    return res.json();
  },

  async transitionStage(orderId, stageKey, status, comments, imageFiles = [], performedById = null, voiceNote = null, clearVoiceNote = false, garmentJob = null) {
    const formData = new FormData();
    formData.append('stage_key', stageKey);
    formData.append('status', status);
    if (garmentJob) formData.append('garment_job', garmentJob);
    if (comments) formData.append('comments', comments);
    if (performedById) formData.append('performed_by_id', performedById);
    if (voiceNote) formData.append('voice_note', voiceNote);
    // Deleting a sent recording: a note with no clip and possibly no text,
    // which the server otherwise treats as nothing to save.
    if (clearVoiceNote) formData.append('voice_note_clear', '1');
    
    if (imageFiles && imageFiles.length > 0) {
      // Sent small: a full-size phone photo is what made a save take minutes.
      (await Promise.all(imageFiles.map((file) => shrinkImage(file)))).forEach(file => {
        formData.append('images', file);
      });
    }

    const res = await guardedFetch(`${BASE_URL}/orders/${orderId}/transition/`, {
      method: 'POST',
      headers: getHeaders(true),
      body: formData
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(describeApiError(res, err) || 'Failed to transition stage');
    }
    return res.json();
  },

  async updateOrder(orderId, orderData) {
    const res = await guardedFetch(`${BASE_URL}/orders/${orderId}/`, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify(orderData),
    });
    // Read the body before throwing, like updateOrderStatus does. This threw a
    // fixed string, so the Master's checklist reported "Failed to update
    // order" for what was really a 403 naming the permission.
    if (!res.ok) {
      const detail = await res.json().catch(() => ({}));
      throw new Error(describeApiError(res, detail) || 'Failed to update order');
    }
    return res.json();
  },

  // The Master's production checklist has its own narrow route: a plain PATCH
  // of the order resolves to DRF's 'partial_update', which supervisors are not
  // granted -- and must not be, because that same action carries the money
  // fields.
  async saveMasterVerification(orderId, checks) {
    const res = await guardedFetch(`${BASE_URL}/orders/${orderId}/master-verification/`, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify({ master_verification: checks }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(describeApiError(res, data));
    return data;
  },

  // Customer messages that need staff: ones WhatsApp could not send after its
  // automatic tries (FAILED), and ones with no automatic sender (QUEUED).
  // Staff retry, or send from their own WhatsApp via whatsapp_url and mark it sent.
  async getQueuedCustomerMessages() {
    const res = await guardedFetch(`${BASE_URL}/orders/customer-messages/`, {
      headers: getHeaders(),
    });
    if (!res.ok) await failWith(res, 'Failed to fetch customer messages');
    return res.json();
  },

  async markMessageSent(orderId, messageId) {
    const res = await guardedFetch(`${BASE_URL}/orders/${orderId}/mark-message-sent/`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ message_id: messageId }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(describeApiError(res, err) || 'Failed to mark the message sent');
    }
    return res.json();
  },

  // An order taken with "Price not decided yet": its prices, added later
  // (or changed while it is open). The server works out the total.
  async setOrderPrices(orderId, body) {
    const res = await guardedFetch(`${BASE_URL}/orders/${orderId}/set-prices/`, {
      method: 'POST', headers: getHeaders(), body: JSON.stringify(body),
    });
    if (!res.ok) await failWith(res, 'Could not save the prices');
    return res.json();
  },

  // The order's invoice as a PDF to the customer's WhatsApp. Resolves to
  // { outcome: 'sent' | 'retrying' | 'failed' | 'manual' | 'sending', message }.
  async sendInvoice(orderId) {
    const res = await guardedFetch(`${BASE_URL}/orders/${orderId}/send-invoice/`, {
      method: 'POST',
      headers: getHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(describeApiError(res, err) || 'Could not send the invoice');
    }
    return res.json();
  },

  // One more automatic try at a FAILED message; resolves to the message after it.
  async retryCustomerMessage(orderId, messageId) {
    const res = await guardedFetch(`${BASE_URL}/orders/${orderId}/retry-message/`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ message_id: messageId }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(describeApiError(res, err) || 'Failed to retry the message');
    }
    return res.json();
  },

  // Finished-garment photographs. Published as a set, because publishing is
  // what tells the customer their outfit is ready.
  // `garmentJob`: which garment the photo shows, on an order of several.
  async uploadGarmentImage(orderId, view, file, garmentJob = null) {
    const formData = new FormData();
    formData.append('view', view);
    formData.append('image', await shrinkImage(file));
    if (garmentJob) formData.append('garment_job', garmentJob);
    const res = await guardedFetch(`${BASE_URL}/orders/${orderId}/garment-images/`, {
      method: 'POST',
      headers: getHeaders(true),
      body: formData,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(describeApiError(res, data));
    return data;
  },

  async deleteStageNoteVoice(orderId, activityId) {
    const res = await guardedFetch(`${BASE_URL}/orders/${orderId}/stage-notes/${activityId}/voice-note/`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error(describeApiError(res, await res.json().catch(() => ({}))));
  },

  async deleteGarmentImage(orderId, imageId) {
    const res = await guardedFetch(`${BASE_URL}/orders/${orderId}/garment-images/${imageId}/`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error(describeApiError(res, await res.json().catch(() => ({}))));
  },

  async deleteGarmentTryOn(orderId, tryonId) {
    const res = await guardedFetch(`${BASE_URL}/orders/${orderId}/garment-tryons/${tryonId}/`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error(describeApiError(res, await res.json().catch(() => ({}))));
  },

  // One finished garment's photos to the customer's WhatsApp (after its QC).
  async sendGarmentPhotos(orderId, garmentJob) {
    const res = await guardedFetch(`${BASE_URL}/orders/${orderId}/send-garment-photos/`, {
      method: 'POST', headers: getHeaders(), body: JSON.stringify({ garment_job: garmentJob }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || describeApiError(res, data));
    return data;
  },

  async publishGarmentImages(orderId, published = true) {
    const res = await guardedFetch(`${BASE_URL}/orders/${orderId}/publish-garment-images/`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ published }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(describeApiError(res, data));
    return data;
  },

  async getOrders() {
    const res = await guardedFetch(`${BASE_URL}/orders/`, {
      headers: getHeaders()
    });
    if (!res.ok) await failWith(res, 'Failed to fetch orders');
    return res.json();
  },

  // Bills & Payments, a page at a time: { count, page, page_size, pages,
  // summary, results }. `status` All | Paid | Pending, `search` the order or
  // customer (crm_api.views.OrderViewSet.invoices).
  async getInvoices(params = {}) {
    const url = new URL(`${BASE_URL}/orders/invoices/`);
    Object.entries({ page: 1, ...params }).forEach(([k, v]) => {
      if (v !== '' && v !== null && v !== undefined) url.searchParams.append(k, v);
    });
    const res = await guardedFetch(url.toString(), { headers: getHeaders() });
    if (!res.ok) await failWith(res, 'Failed to fetch invoices');
    return res.json();
  },

  // Garments the boutique makes for its own stock: the same workroom as a
  // customer's order, with no customer, no price and no payment on it.
  // Every in-house run (garments made for the boutique's own stock).
  async getInternalProduction() {
    const res = await guardedFetch(`${BASE_URL}/orders/?kind=internal`, { headers: getHeaders() });
    if (!res.ok) await failWith(res, 'Could not load the in-house garments');
    return res.json();
  },

  async createInternalProduction(payload) {
    const res = await guardedFetch(`${BASE_URL}/orders/internal-production/`, {
      method: 'POST', headers: getHeaders(), body: JSON.stringify(payload),
    });
    if (!res.ok) await failWith(res, 'Could not start this production run');
    return res.json();
  },
};
