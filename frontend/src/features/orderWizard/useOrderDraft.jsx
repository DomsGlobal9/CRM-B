import { SELF_DESIGNER, WIZARD_STEPS } from '../orders/wizard';
import { splitSpec, withDefaults } from '../../services/templates';
import { voiceNoteList } from '../../components/ui/voiceNotes';
import { plusDaysIso } from '../../services/dates';
import { api } from '../../services/api';

/**
 * The order being written, as a draft: turning the form into what is saved
 * (serialiseWizard) and back (hydrateWizard), saving it (persistDraft), and the
 * material lines and prices it carries.
 */
export default function useOrderDraft({ setView, currentStep, setMaxStepReached, reachStep, setActiveGarmentKey, activeGarmentKey, setGarmentsDone, garmentsDone, setCustomerId, customerId, setCustomerForm, customerForm, setServiceType, serviceType, setCustomerName, setReadyBy, readyBy, setDesignRequest, designRequest, designerChoice, garmentJobs, setGarmentJobs, setDraftId, draftId, setDraftVersion, draftVersion, setDraftSaveState, setGarmentErrors, setDesignNotes, designNotes, setSelectedDesignTemplates, selectedDesignTemplates, setDesignSource, designSource, setDesignLinks, designLinks, setAdvancePaymentAmount, advancePaymentAmount, setSpecialInstructions, specialInstructions, setMeasureVoiceNotes, measureVoiceNotes, setQuotePrices, quotePrices, setWizardError, setAlterOutside, fabrics, setCustomerLocked, wizardSteps }) {
  const defaultMaterialSource = () => 'STORE';

  /** The material fields on a template, with the item chosen for each.
   *
   *  Read off the template rather than off a hardcoded list, so a garment that
   *  gains a material field gains a material line with it. */
  const garmentMaterialFields = (job) => {
    const fallback = defaultMaterialSource(job);
    return (job.template?.sections || [])
      .flatMap(section => section.fields || [])
      .filter(field => field.field_type === 'inventory_ref')
      .map(field => {
        const source = job.sources?.[field.key] || fallback;
        const brought = job.brought?.[field.key] || {};
        return {
          field,
          source,
          itemId: job.values?.[field.key],
          name: (brought.name || '').trim(),
          unit: brought.unit,
          estimated_cost: brought.estimated_cost,
          required_by: brought.required_by,
          notes: brought.notes,
        };
      })
      
      .filter(entry => (entry.source === 'STORE' ? entry.itemId : entry.name));
  };

  /** One material line, in the shape the API stores.
   *
   *  Customer material carries its own name and never an inventory item -- the
   *  serializer rejects the combination, because their cloth is not stock and
   *  must never be reserved or deducted from it.
   */
  const materialLine = (job) => ({ field, source, itemId, name, unit, estimated_cost, required_by, notes }) => (
    source === 'PURCHASE'
      ? {
        field_key: field.key,
        free_text: name,
        quantity: job.quantities?.[field.key],
        unit,
        source: 'PURCHASE',
        estimated_cost: estimated_cost || 0,
        required_by: required_by || null,
        notes: (notes || '').trim(),
      }
    : source === 'CUSTOMER'
      ? {
        field_key: field.key,
        free_text: name,
        quantity: job.quantities?.[field.key],
        unit,
        source: 'CUSTOMER',
      }
      : {
        field_key: field.key,
        inventory_item: itemId,
        quantity: job.quantities?.[field.key],
        source: 'STORE',
      }
  );

  const garmentMaterialLines = (job) => {
    const picked = Object.entries(job.fabrics || {}).flatMap(([slot, ids]) =>
      [...new Set((ids || []).map(String))].map(id => ({
        field_key: slot, inventory_item: id, source: 'STORE',
        quantity: job.fabric_qty?.[`${slot}:${id}`],
      })))
      .filter(line => Number(line.quantity) > 0);
    const pickedIds = new Set(picked.map(line => String(line.inventory_item)));
    const fromTemplate = garmentMaterialFields(job).map(materialLine(job))
      .filter(line => !(line.inventory_item && pickedIds.has(String(line.inventory_item))));
    return [...picked, ...fromTemplate];
  };

  const serialiseWizard = () => {
    const total = getTotalPrice();
    const advance = Number(advancePaymentAmount) || 0;
  
    const withDate = (values) => (readyBy ? { ...values, delivery_date: readyBy } : values);
    return {
      ...customerForm,
      measurements: customerForm.measurements || {},
      service: serviceType,
      ready_by: readyBy || null,
      design_request: { ...designRequest, designer: designerChoice },
      garments: garmentJobs.map(job => {
        const values = withDate(job.values || {});
        const design = { ...(job.design || {}) };
        delete design.request;
        const wantsDesigner = serviceType === 'design' && designerChoice
          && designerChoice !== SELF_DESIGNER;
        return {
          key: job.key,
          label: job.label || '',
          paired_with: job.pairedWith || null,
          template: job.template?.id,
          template_key: job.template?.key || job.key,
          spec: splitSpec(job.template, values).spec,
          measurements: splitSpec(job.template, values).measurements,
          values,
          quantities: job.quantities || {},
          pricing: { ...(job.pricing || {}), fabric: jobMaterialsTotal(job) },
          design: wantsDesigner
            ? { ...design, request: { designer: designerChoice, brief: designRequest.brief || '',
                                      voice_note: voiceNoteList(designRequest.voice_notes, designRequest.voice_note)[0]?.url || '',
                                      voice_notes: voiceNoteList(designRequest.voice_notes, designRequest.voice_note) } }
            : design,
          fabrics: job.fabrics || {},
          fabric_qty: job.fabric_qty || {},
          // The ticked accessories with their type, "Other" text and measurement.
          accessories: job.accessories || {},
          sources: job.sources || {},
          brought: job.brought || {},
          materials: garmentMaterialLines(job),
          purchases: (job.purchases || []).map(r => ({
            field_key: r.field_key || '',
            name: (r.name || '').trim(), quantity: r.quantity, unit: r.unit || 'METER',
            estimated_cost: r.estimated_cost || 0, required_by: r.required_by || null, notes: (r.notes || '').trim(),
          })),
        };
      }),
      design: {
        notes: designNotes, links: designLinks, source: designSource,
        templates: selectedDesignTemplates,
      },
      staff: { tailor_id: null, master_id: null },
      prices: quotePrices,
      delivery: { method: 'Direct Pickup' },
      payment: { option: !quotePrices.price_later && total > 0 && advance >= total ? 'full' : 'partial', advance },
      special_instructions: specialInstructions,
      instructions_voice_note: measureVoiceNotes[0]?.url || '',
      instructions_voice_note_by: measureVoiceNotes[0]?.by || '',
      instructions_voice_note_at: measureVoiceNotes[0]?.at || null,
      instructions_voice_notes: measureVoiceNotes,
    };
  };

  /** Put a saved draft back on screen, exactly where it was left. */
  const hydrateWizard = async (draft) => {
    const payload = draft.payload || {};
    setCustomerLocked(false);
    setDraftId(draft.id);
    setDraftVersion(draft.version);
    setCustomerId(draft.customer || null);

    const { garments = [], design = {}, prices, payment = {},
            service, ready_by, design_request, wizard_cursor, ...customer } = payload;
    
    ['fabric', 'staff', 'delivery'].forEach((key) => { delete customer[key]; });
    setCustomerForm(prev => ({ ...prev, ...customer }));
    setCustomerName(`${customer.first_name || ''} ${customer.last_name || ''}`.trim());
    const kind = service === 'design' ? 'design' : 'stitch';
    setServiceType(kind);
    setAlterOutside(false);

    setReadyBy(ready_by || garments.find(g => g.values?.delivery_date)?.values.delivery_date || plusDaysIso(15));
    setDesignRequest(design_request || { designer: '', brief: '' });

    const rebuilt = [];
    for (const garment of garments) {
      try {
        const template = await api.getGarmentTemplate(garment.template_key);
        rebuilt.push({
          key: garment.key || garment.template_key,
          label: garment.label || '',
          pairedWith: garment.paired_with || null,
          template,
          values: withDefaults(template, garment.values),
          quantities: garment.quantities || {},
          sources: garment.sources || {},
          brought: garment.brought || {},
          pricing: garment.pricing || {},
          design: garment.design || {},
          fabrics: garment.fabrics || {},
          fabric_qty: garment.fabric_qty || {},
          accessories: garment.accessories || {},
          purchases: garment.purchases || [],
        });
      } catch (err) {
        console.error('Could not reload the garment template', garment.template_key, err);
      }
    }
    
    const hasJobPricing = rebuilt.some(job =>
      Object.values(job.pricing || {}).some(v => parseFloat(v || 0)));
    if (!hasJobPricing && rebuilt.length && prices) {
      rebuilt[0] = { ...rebuilt[0], pricing: {
        base: prices.base || 0, fabric: prices.fabric || 0,
        embroidery: prices.embroidery || 0,
        customization: prices.customization || 0,
        tailoring: prices.tailoring || 0,
      } };
    }
    setGarmentJobs(rebuilt);

    setDesignNotes(design.notes || '');
    setDesignLinks(design.links || '');
    if (design.source) setDesignSource(design.source);
    setSelectedDesignTemplates(design.templates || []);
    if (prices) setQuotePrices({ packaging: prices.packaging ?? 500,
                                 discount: prices.discount ?? 0,
                                 gst_mode: prices.gst_mode || 'percent', gst_value: prices.gst_value ?? 0,
                                 price_later: Boolean(prices.price_later) });
    if (payment.advance !== undefined) setAdvancePaymentAmount(payment.advance);
    setSpecialInstructions(payload.special_instructions || '');
    // A draft saved before there could be several keeps its one note.
    setMeasureVoiceNotes(voiceNoteList(payload.instructions_voice_notes, payload.instructions_voice_note
      ? { url: payload.instructions_voice_note, by: payload.instructions_voice_note_by || '', at: payload.instructions_voice_note_at || null }
      : null));
    setWizardError(null);
    setDraftSaveState('idle');
    setGarmentErrors({});
    
    
    const steps = WIZARD_STEPS[kind];
    const named = steps.findIndex(st => st.key === wizard_cursor?.step_key) + 1;
    const old = draft.current_step || 1;
    const legacy = kind === 'alter' ? old
      : old <= 1 ? 1
        : old <= 4 ? steps.findIndex(st => st.key === 'type') + 1
          : old === 5 ? steps.findIndex(st => st.key === 'measure') + 1
            : steps.findIndex(st => st.key === 'review') + 1;
    let step = Math.min(named || legacy, steps.length);
    setActiveGarmentKey(wizard_cursor?.garment || null);
    setGarmentsDone(wizard_cursor?.done || []);
    
    if (kind !== 'alter' && !(draft.payload?.garments || []).length) step = 1;
    setMaxStepReached(step);
    reachStep(step);
    setView('wizard');
  };

  /** Write the wizard to its draft, creating one on first save.
   *
   *  Returns the draft id, so callers that are about to navigate away can be
   *  sure the work is on the server before they go.
   */
  const persistDraft = async ({ step, cursor = {} } = {}) => {
    const current_step = step || currentStep;
   
    const payload = {
      ...serialiseWizard(),
      wizard_cursor: {
        step_key: wizardSteps[current_step - 1]?.key || null,
        garment: activeGarmentKey, done: garmentsDone, ...cursor,
      },
    };
    setDraftSaveState('saving');
    try {
      if (!draftId) {
        const created = await api.createOrderDraft({
          payload, current_step, customer: customerId || null,
        });
        setDraftId(created.id);
        setDraftVersion(created.version);
        setDraftSaveState('saved');
        return created.id;
      }
      const saved = await api.updateOrderDraft(draftId, {
        payload, current_step, customer: customerId || null, version: draftVersion,
      });
      setDraftVersion(saved.version);
      setDraftSaveState('saved');
      return saved.id;
    } catch (err) {
      
      setDraftSaveState(err.isConflict ? 'conflict' : 'failed');
      if (!err.isConflict) console.error('Could not save the draft', err);
      throw err;
    }
  };

  const PRICING_FIELDS = [
    ['base', 'Base price'], ['fabric', 'Fabric'], ['embroidery', 'Embroidery & work'],
    ['customization', 'Customization'], ['tailoring', 'Tailoring'],
  ];

  const EXTRA_CHARGES = [
    ['backing', 'Backing', (v) => v.backing === 'with_backing'],
    ['border', 'Border', (v) => v.border === 'with_border'],
    ['fall', 'Fall', (v) => ['fall', 'fall_pico'].some(s => (v.services || []).includes(s))],
    ['pico', 'Pico', (v) => ['pico', 'fall_pico'].some(s => (v.services || []).includes(s))],
    ['hand_work', 'Maggam / hand work', (v) => Boolean(v.hand_work) && v.hand_work !== 'none'],
  ];

  const jobExtras = (job) => EXTRA_CHARGES.filter(([, , applies]) => applies(job.values || {}));

  const jobMaterialCharges = (job) => {
    const picked = Object.entries(job.fabrics || {}).flatMap(([slot, ids]) =>
      [...new Set((ids || []).map(String))].map((id) => ({ slot, id, quantity: job.fabric_qty?.[`${slot}:${id}`], editable: true })));
    const pickedIds = new Set(picked.map((line) => line.id));
    const fromTemplate = garmentMaterialLines(job)
      .filter((line) => line.source === 'STORE' && line.inventory_item && Number(line.quantity) > 0
        && !pickedIds.has(String(line.inventory_item)))
      .map((line) => ({ slot: line.field_key, id: String(line.inventory_item), quantity: line.quantity, editable: false }));
    return [...picked, ...fromTemplate].map(({ slot, id, quantity, editable }) => {
      const item = fabrics.find((f) => String(f.id) === id);
      const amountOf = Number(quantity) || 0;
      const rate = Number(item?.selling_price || 0);
      return { key: `${slot}:${id}`, slot, id, item, quantity: quantity ?? '', editable, rate,
               amount: Math.round(rate * amountOf * 100) / 100 };
    });
  };

  const jobMaterialsTotal = (job) => jobMaterialCharges(job).reduce((sum, line) => sum + line.amount, 0);

  const jobSubtotal = (job) =>
    PRICING_FIELDS.reduce((sum, [key]) => sum + (key === 'fabric' ? jobMaterialsTotal(job) : parseFloat(job.pricing?.[key] || 0)), 0)
    + jobExtras(job).reduce((sum, [key]) => sum + parseFloat(job.pricing?.extras?.[key] || 0), 0);

  const getSubtotal = () => {
    const garments = garmentJobs.reduce((sum, job) => sum + jobSubtotal(job), 0);
    const packaging = parseFloat(quotePrices.packaging || 0);
    const discount = parseFloat(quotePrices.discount || 0);
    return garments + packaging - discount;
  };

  // The same sum the server makes (domains/orders/pricing.py gst_amount).
  const getTaxes = () => {
    const value = parseFloat(quotePrices.gst_value || 0);
    if (!(value > 0)) return 0;
    return quotePrices.gst_mode === 'amount' ? value : (getSubtotal() * value) / 100;
  };

  const getTotalPrice = () => {
    return getSubtotal() + getTaxes();
  };

  return {
    defaultMaterialSource,
    garmentMaterialFields,
    materialLine,
    garmentMaterialLines,
    serialiseWizard,
    hydrateWizard,
    persistDraft,
    PRICING_FIELDS,
    EXTRA_CHARGES,
    jobExtras,
    jobMaterialCharges,
    jobMaterialsTotal,
    jobSubtotal,
    getSubtotal,
    getTaxes,
    getTotalPrice,
  };
}
