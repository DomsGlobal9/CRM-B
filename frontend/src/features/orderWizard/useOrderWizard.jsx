import React, { useCallback, useRef, useState } from 'react';
import { api } from '../../api';
import { isVisible, validateSpec, withDefaults } from '../catalog/templates';
import { DEFAULT_CUSTOMER_DATA, GARMENT_PRICES } from './wizard';
import { findMatchingTemplate, getGarmentPairConfig } from './GarmentPairingModal';
import { purchaseError } from '../catalog/materials';
import { AvatarInitials } from '../../components/ui/Atelier';
import { formatMobile, inr } from '../../utils/format';
import { TierBadge } from '../customers/TierBadge';
import { customerTier } from '../customers/customerBook';
import { followerOf } from './garmentCopies';
import { MEASURE_KEYS, sheetGet, sheetSet } from '../catalog/measurements';
import { amountError, emailError, isPastDate, mobileError, nameError } from '../../utils/validate';
import { fabricMatchesColour } from '../fabrics/colour';
import { userIsOwner } from '../../constants/roles';

/**
 * The order wizard's own state and logic: the garments being added and paired,
 * their pricing, materials and selections, the customer match, and the step
 * actions. App keeps what the rest of the workspace shares with the order
 * screens (the customer form, the garment list, the draft) and passes it in.
 */
export default function useOrderWizard({ setView, currentUser, t, currentStep, maxStepReached, reachStep, setActiveGarmentKey, garmentsDone, setGarmentsDone, customerId, setCustomerId, customerForm, setCustomerForm, serviceType, setCustomerName, readyBy, designerChoice, alterationForm, garmentTemplates, garmentJobs, setGarmentJobs, draftId, setDraftId, setDraftVersion, setDraftSaveState, setGarmentErrors, advancePaymentAmount, setAdvancePaymentAmount, quotePrices, setQuotePrices, setWizardError, defaultMaterialSource, garmentMaterialFields, persistDraft, alterOutside, outsideForm, outsidePhoto, openAlteration, rememberAlteration, fabrics, ordersList, setConfirmedOrder, fetchDashboardAndConfig, pickCustomer, customerLocked, matchDigits, matchName, matchBy, customerMatches, setNumberMatched, wizardSteps, wizardStepKey, openGarment, setCtaBusy, getSubtotal, getTotalPrice, refreshCustomerBook }) {
  const [addingGarmentKey, setAddingGarmentKey] = useState(null);

  // "Add more garments to this order": folded shut again once the picked
  // garments are on the order, so the list does not stay open under them.
  const addMoreGarmentsRef = useRef(null);

  const selfDesignerLabel = !userIsOwner(currentUser) ? 'Me' : 'Me (owner)';

  const [activePairingGarment, setActivePairingGarment] = useState(null);

  // Garments picked together whose pairing suggestion is still to come, one after another.
  const [pairingQueue, setPairingQueue] = useState([]);

  const [discardingDraftId, setDiscardingDraftId] = useState(null);

  const [activeDesignTab, setActiveDesignTab] = useState({});

  const addGarment = async (key, skipPairingPrompt = false, allowAnother = false, pairedWith = null) => {
    
    const taken = garmentJobs.some(job => job.key === key || job.template?.key === key);
    if (taken && !allowAnother) return;
    if (addingGarmentKey) return;
    setAddingGarmentKey(key);
    try {
      const template = await api.getGarmentTemplate(key);
  
      const jobKey = taken ? `${key}#${Date.now().toString(36)}` : key;
      setGarmentJobs(prev => [...prev, {
        key: jobKey, template, values: withDefaults(template), quantities: {}, sources: {}, brought: {}, pairedWith,
        pricing: { base: GARMENT_PRICES[template.name] || 15000, fabric: 0,
                   embroidery: 0, customization: 0, tailoring: 0 },
      }]);
      
      if (!skipPairingPrompt && getGarmentPairConfig(key, template.name)) {
        setActivePairingGarment({ key, name: template.name, jobKey });
      }
      return jobKey;
    } catch (err) {
      console.error(err);
      alert('Could not load that garment form.');
    } finally {
      setAddingGarmentKey(null);
    }
  };

  const handleAddPairedGarments = async (pairKeys) => {
    for (const pairKey of pairKeys) {
      await addGarment(pairKey, true, true, activePairingGarment?.jobKey || null);
    }
  };

  /** Several garments ticked at once. A garment picked together with one it
   *  pairs with (Saree and Blouse) is added as that garment's partner, as if
   *  chosen in its pairing suggestion; then each garment with partners still
   *  left to suggest gets its pairing suggestion, one after another. */
  const addGarments = async (keys) => {
    const nameOf = (key) => garmentTemplates.find(tpl => tpl.key === key)?.name || '';
    const configOf = (key) => getGarmentPairConfig(key, nameOf(key));
    const primaries = keys.filter(key => configOf(key));
    const partnerOf = {};
    primaries.forEach(primary => configOf(primary).pairKeys.forEach(pairKey => {
      const tpl = findMatchingTemplate(pairKey, garmentTemplates);
      if (tpl && keys.includes(tpl.key) && !primaries.includes(tpl.key) && !partnerOf[tpl.key]) partnerOf[tpl.key] = primary;
    }));
    // Each garment followed by the partners picked with it.
    const ordered = keys.filter(key => !partnerOf[key])
      .flatMap(key => [key, ...keys.filter(other => partnerOf[other] === key)]);
    const jobKeys = {};
    for (const key of ordered) {
      jobKeys[key] = await addGarment(key, true, false, partnerOf[key] ? jobKeys[partnerOf[key]] || null : null);
    }
    const suggest = primaries
      .filter(primary => jobKeys[primary] && configOf(primary).pairKeys.some(pairKey => {
        const tpl = findMatchingTemplate(pairKey, garmentTemplates);
        return tpl && partnerOf[tpl.key] !== primary;
      }))
      .map(primary => ({ key: primary, name: nameOf(primary), jobKey: jobKeys[primary] }));
    if (suggest.length) {
      setActivePairingGarment(suggest[0]);
      setPairingQueue(suggest.slice(1));
    }
  };

  const removeGarment = (key) => {
    const gone = new Set([key, ...garmentJobs.filter(job => job.pairedWith === key).map(job => job.key)]);
    setGarmentJobs(prev => prev.filter(job => !gone.has(job.key)));
    setGarmentErrors(prev => {
      const next = { ...prev };
      gone.forEach(k => { delete next[k]; });
      return next;
    });
  };

  /** The purchase row hung on one question of a garment: replaced, or
   *  removed when `row` is null (the answer changed to something in stock). */
  const updateGarmentPurchase = (key, fieldKey, row) => {
    setGarmentJobs(prev => prev.map(job => {
      if (job.key !== key) return job;
      const rest = (job.purchases || []).filter(r => r.field_key !== fieldKey);
      return { ...job, purchases: row ? [...rest, row] : rest };
    }));
  };

  const updateGarmentValues = (key, values) => {
    setGarmentJobs(prev => prev.map(job => (job.key === key ? { ...job, values } : job)));
  };

  /** Validate every dress on the order; returns true when all of them pass. */
  const validateGarments = ({ partial = false, sections = null, only = null } = {}) => {
    const errors = {};
    const quantityErrors = {};
    garmentJobs.filter(job => !only || job.key === only).forEach(job => {
      const jobErrors = validateSpec(job.template, job.values, { partial, sections });
      if (Object.keys(jobErrors).length) errors[job.key] = jobErrors;

     
      if (partial || sections) return;
      const jobQuantityErrors = {};
      garmentMaterialFields(job).forEach(({ field }) => {
        const raw = job.quantities?.[field.key];
        const quantity = Number(raw);
        if (raw === undefined || raw === '' || Number.isNaN(quantity) || quantity <= 0) {
          jobQuantityErrors[field.key] = 'Enter how much of this material this garment needs.';
        }
      });
      
      const fallbackSource = defaultMaterialSource(job);
      (job.template?.sections || [])
        .flatMap(section => section.fields || [])
        .filter(field => field.field_type === 'inventory_ref')
        .forEach(field => {
          const source = job.sources?.[field.key] || fallbackSource;
          const name = (job.brought?.[field.key]?.name || '').trim();
          const raw = job.quantities?.[field.key];
          if (source === 'CUSTOMER' && !name && raw !== undefined && raw !== '') {
            jobQuantityErrors[field.key] = 'Name what the customer brought for this.';
          }
          if (source === 'PURCHASE') {
            const cost = Number(job.brought?.[field.key]?.estimated_cost ?? 0);
            if (!name && raw !== undefined && raw !== '') jobQuantityErrors[field.key] = 'Say what needs to be bought.';
            else if (Number.isNaN(cost) || cost < 0) jobQuantityErrors[field.key] = 'The estimated cost cannot be negative.';
          }
        });
      (job.purchases || []).forEach((row, i) => {
        const problem = purchaseError(row);
        if (problem) jobQuantityErrors[`purchase:${i}`] = problem;
      });
      if (Object.keys(jobQuantityErrors).length) quantityErrors[job.key] = jobQuantityErrors;
    });
    setGarmentErrors(errors);
    const failed = Object.keys({ ...errors, ...quantityErrors })[0];
    if (failed) {
      setActiveGarmentKey(failed);

      const fieldKey = Object.keys(errors[failed] || quantityErrors[failed])[0];
      requestAnimationFrame(() => {
        const scope = document.getElementById(`wz-garment-${failed}`) || document;
        const control = scope.querySelector(`[id="tf-${fieldKey}"]`);
        
        let fold = control?.closest('details');
        while (fold) { fold.open = true; fold = fold.parentElement?.closest('details'); }
        control?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        control?.focus({ preventScroll: true });
      });
    }
    return Object.keys(errors).length === 0 && Object.keys(quantityErrors).length === 0;
  };

  const [startingBoutiqueRun, setStartingBoutiqueRun] = useState(false);

  const [deletingDraftId, setDeletingDraftId] = useState(null);

  /** The customer's ID for a picture drawn on them. A customer typed in on
   *  the Customer step has none until the order is placed, so they are saved
   *  now -- or matched by mobile to one the book already has -- and the order
   *  goes on with that same customer. The typed form is left as it is. */
  const ensureCustomerId = async () => {
    if (customerId) return customerId;
    const last10 = (value) => String(value || '').replace(/\D/g, '').slice(-10);
    const typed = last10(customerForm.mobile_number);
    const matches = typed ? await api.lookupCustomers({ mobile: typed, limit: 50 }) : [];
    const found = (matches || []).find(c => last10(c.mobile_number) === typed);
    const optional = Object.fromEntries(['email_address', 'gender', 'city_region', 'address']
      .filter(key => String(customerForm[key] || '').trim()).map(key => [key, customerForm[key]]));
    const cust = found || await api.createCustomer({
      first_name: customerForm.first_name.trim(), last_name: (customerForm.last_name || '').trim(),
      mobile_number: String(customerForm.mobile_number).trim(), ...optional,
    });
    setCustomerId(cust.id);
    if (!found) refreshCustomerBook();
    return cust.id;
  };

  const clearPickedCustomer = (mobile) => {
    setNumberMatched(null);
    setCustomerId(null);
    setCustomerForm({ ...DEFAULT_CUSTOMER_DATA, mobile_number: mobile || '' });
    setCustomerName('');
  };

  const setCustomerNameSplit = (raw) => {
    setCustomerName(raw);
    const trimmed = raw.trim();
    const cut = trimmed.indexOf(' ');
    setCustomerForm(prev => ({
      ...prev,
      first_name: cut === -1 ? trimmed : trimmed.slice(0, cut),
      last_name: cut === -1 ? '' : trimmed.slice(cut + 1).trim(),
    }));
  };

  const customerLookupTyped = matchDigits.length >= 4 || matchName.length >= 3;

  /** The matches, shown under the box being searched by; one picks the customer. */
  const customerMatchList = customerMatches.length > 0 && (
    <div className="wz-matches" role="listbox"
         aria-label={matchBy === 'name' ? t('wizard.matchesByName', 'Customers matching this name') : t('wizard.matches', 'Customers matching this number')}>
      {customerMatches.map((cust) => (
        <button type="button" key={cust.id} className="wz-match" role="option" aria-selected="false" onClick={() => pickCustomer(cust)}>
          <AvatarInitials name={`${cust.first_name} ${cust.last_name}`} size={32} />
          <span style={{ minWidth: 0, flex: 1 }}>
            <span className="wz-match-name">{cust.first_name} {cust.last_name}</span>
            <span className="od-hint" style={{ display: 'block' }}>{formatMobile(cust.mobile_number)}{cust.city_region ? ` · ${cust.city_region}` : ''}</span>
          </span>
          <TierBadge tier={customerTier(cust)} />
        </button>
      ))}
    </div>
  );

  /** Garments we delivered to the chosen customer: the only ones an alteration can name. */
  const alterCandidates = React.useMemo(() => {
    if (!customerId) return [];
    return ordersList
      .filter(o => String(o.customer) === String(customerId) && o.order_status === 'Delivered')
      .flatMap(order => (order.garment_jobs || []).map(job => ({ order, job })));
  }, [ordersList, customerId]);

  /** The garment the alteration is for: the one picked, or the only one there is. */
  const alterPick = alterCandidates.find(c => c.job.id === alterationForm.garmentJobId)
    || (alterCandidates.length === 1 ? alterCandidates[0] : null);

  /** Closing the wizard keeps the order: a draft is saved first when there is one to save. */
  const leaveWizard = async () => {
    if (serviceType !== 'alter' && (garmentJobs.length || customerForm.mobile_number)) {
      try { await persistDraft(); } catch { /* the draft stays as it was */ }
    }
    setView('dashboard');
  };

  const canJumpAhead = serviceType !== 'alter';

  const jumpToStep = (n) => {
    if (n === currentStep || (n > maxStepReached && !canJumpAhead)) return;
    if (wizardStepKey === 'measure') rememberMeasurements();
    if (wizardSteps[n - 1]?.key === 'measure') prefillMeasurements();
    reachStep(n);
  };

  /** Open a garment's form from its top. */
  const openGarmentAt = (key) => {
    setActiveGarmentKey(key);
    window.scrollTo(0, 0);
  };

  /** "Saree 2" when the order has more than one saree; just "Saree" otherwise. */
  const garmentLabel = (job) => {
    if (job.label) return job.label;
    const name = job.template?.name || job.key;
    const same = garmentJobs.filter(j => j.template?.key === job.template?.key);
    return same.length > 1 ? `${name} ${same.findIndex(j => j.key === job.key) + 1}` : name;
  };

  // Renaming a garment on this order: { key, text } while its name box is open.
  const [renamingGarment, setRenamingGarment] = useState(null);

  const saveGarmentName = () => {
    if (!renamingGarment) return;
    const label = renamingGarment.text.trim().slice(0, 60);
    setGarmentJobs(prev => prev.map(j => (j.key === renamingGarment.key ? { ...j, label } : j)));
    setRenamingGarment(null);
  };

  /** One more of this garment, same design: a follower placed after the
   *  garment and its other followers. Whatever is filled on the garment is
   *  copied to it as the staff go (the effect below); changing the follower
   *  itself makes it its own design. Only this garment: the + on a saree adds
   *  a saree, never its paired blouse or petticoat -- each has its own +. */
  const copyGarment = (key) => {
    const source = garmentJobs.find(job => job.key === key);
    if (!source) return;
    const stamp = Date.now().toString(36);
    const copies = [followerOf(source, `${source.template?.key || source.key}#${stamp}0`, source.pairedWith || null)];
    setGarmentJobs(prev => {
      // After the garment, its followers, and anything paired to any of them.
      const group = new Set([key, ...prev.filter(job => job.sameAs === key).map(job => job.key)]);
      const last = Math.max(...prev.map((job, i) => (group.has(job.key) || group.has(job.pairedWith) ? i : -1)));
      return [...prev.slice(0, last + 1), ...copies, ...prev.slice(last + 1)];
    });
  };

  /** One fewer: the last same-design follower of this garment goes (with any
   *  blouse paired to it). A garment filled in its own way is never removed here. */
  const dropFollower = (key) => {
    const last = [...garmentJobs].reverse().find(job => job.sameAs === key);
    if (last) removeGarment(last.key);
  };

  /** "Another, different design": a fresh one of the same garment. */
  const addAnotherOf = (job) => addGarment(job.template.key, false, true);

  /** Moving off a garment's details checks that garment's required questions. */
  const garmentDetailsOk = () => {
    if (!openGarment || validateGarments({ sections: ['basic', 'style'], only: openGarment.key })) return true;
    alert('Say what this garment needs \u2014 see the highlighted fields.');
    return false;
  };

  /** Whether any garment on the order has a measurement to take right now. */
  const needsMeasurements = () => garmentJobs.some(job =>
    ((job.template?.sections || []).find(sec => sec.key === 'measurements')?.fields || [])
      .some(f => f.field_type !== 'file' && isVisible(f, job.values || {})));

  const handleBack = () => {
    if (wizardStepKey === 'type' && openGarment) {
      const at = garmentJobs.findIndex(job => job.key === openGarment.key);
      if (at > 0) { openGarmentAt(garmentJobs[at - 1].key); return; }
    }
    // Back out of the first step returns to where the order began: the
    // customer's own page (the only start that locks the customer), else
    // the New order chooser.
    if (currentStep <= 1) { setView(customerLocked ? 'dashboard' : 'order-selector'); return; }
    const previous = wizardSteps[currentStep - 2];
    const backTo = previous?.key === 'measure' && !needsMeasurements() && currentStep >= 3 ? wizardSteps[currentStep - 3] : previous;
    // Back into the garments lands on the last one, where Next left it.
    if (backTo?.key === 'type' && garmentJobs.length) {
      setActiveGarmentKey(garmentJobs[garmentJobs.length - 1].key);
    }
    // Measurements is skipped both ways when there is nothing to measure.
    if (previous?.key === 'measure' && !needsMeasurements() && currentStep >= 3) {
      reachStep(currentStep - 2);
    } else {
      reachStep(currentStep - 1);
    }
  };

  /** The saved measurements sheet fills any garment field it already answers. */
  const prefillMeasurements = () => {
    const sheet = customerForm.measurements || {};
    setGarmentJobs(prev => prev.map(job => {
      const own = new Set(((job.template?.sections || []).find(sec => sec.key === 'measurements')?.fields || []).map(f => f.key));
      const values = { ...(job.values || {}) };
      own.forEach((key) => {
        const kept = sheetGet(sheet, MEASURE_KEYS[key] || key);
        if ((values[key] === undefined || values[key] === '') && kept) values[key] = /^\d/.test(String(kept)) ? String(Number(kept)) : kept;
      });
      return { ...job, values };
    }));
  };

  /** Garment measurements go back onto the customer's sheet for next time. */
  const rememberMeasurements = () => {
    const body = { ...(customerForm.measurements || {}) };
    garmentJobs.forEach(job => {
      Object.entries(MEASURE_KEYS).forEach(([key, sheetKey]) => {
        if (job.values?.[key] !== undefined && job.values[key] !== '') sheetSet(body, sheetKey, job.values[key]);
      });
    });
    setCustomerForm(prev => ({ ...prev, measurements: body }));
  };

  /** After the customer: measurements when any is needed, else review. */
  /** After the garment screens: measurements when any is needed, else the extras. */
  const stepAfterGarments = () => {
    const measureIdx = wizardSteps.findIndex(step => step.key === 'measure');
    return measureIdx + (needsMeasurements() ? 1 : 2);
  };

  const submitOrderAndConfirm = async () => {
    setWizardError(null);
    let id = draftId;
    try {
      id = await persistDraft({ step: currentStep });
    } catch (err) {
      setWizardError(
        err.isConflict
          ? 'This order was changed in another tab. Reload it before placing it.'
          : 'Could not save the order before placing it. Nothing has been booked — please try again.');
      return;
    }

    try {
      const order = await api.confirmOrderDraft(id);
      setDraftId(null);
      setDraftVersion(null);
      setDraftSaveState('idle');
      setConfirmedOrder(order);
      setView('confirmed');
      fetchDashboardAndConfig();
    } catch (err) {
      if (err.alreadyPlaced) {
        setWizardError(
          'This order has already been placed. Check Manage Orders — do not place it again.');
        return;
      }
      console.error(err);
      setWizardError(
        (err.message || 'Could not place the order.')
        + ' Nothing was booked, and your order is still saved — you can try again.');
    }
  };

  const actionInFlight = useRef(false);

  const runOnce = useCallback(async (action) => {
    if (actionInFlight.current) return;
    actionInFlight.current = true;
    setCtaBusy(true);
    try {
      await action();
    } finally {
      actionInFlight.current = false;
      setCtaBusy(false);
    }
  // setCtaBusy is App's state setter, the same function on every render.
  }, [setCtaBusy]);

  const createAlterationFromWizard = async () => {
    setWizardError(null);
    const candidate = alterPick;
    if (!candidate) { alert('Pick the garment first.'); return; }
    if (!alterationForm.issue.trim()) { alert('Say what needs changing.'); return; }
    // Every alteration is photographed as it came in (the record of what was
    // already wrong), ours as much as one stitched elsewhere.
    if (!outsidePhoto?.file) { alert('Take a photo of the garment as it came in.'); return; }
    const isPaid = alterationForm.type === 'PAID_CLIENT_REQUEST';
    if (isPaid) {
      const charge = parseFloat(alterationForm.charge || 0);
      const bad = amountError(alterationForm.charge, { label: 'Charge' })
        || amountError(alterationForm.paidNow, { label: 'Paid now', max: charge });
      if (bad) { alert(charge ? bad : 'Enter the charge before recording a payment.'); return; }
    }
    try {
      const created = await api.createAlterationOrder(candidate.order.id, {
        garment_job: candidate.job.id,
        issue: alterationForm.issue.trim(),
        charge: isPaid && alterationForm.charge ? alterationForm.charge : '0',
        paid_now: isPaid && alterationForm.paidNow ? alterationForm.paidNow : '0',
      });
      try { await api.uploadGarmentImage(created.id, 'FRONT', outsidePhoto.file); }
      catch (err) { alert(`Taken in, but the photo could not be saved: ${err.message}`); }
      setView('dashboard');
      openAlteration(created.id);
    } catch (err) {
      setWizardError(err.message || 'Could not create the alteration.');
    }
  };

  /** Take in a garment stitched elsewhere: a walk-in customer is added first,
   *  then the alteration order, then its photo as it arrived. */
  const createOutsideAlterationFromWizard = async () => {
    setWizardError(null);
    const f = outsideForm;
    const scale = { SMALL: 'Small job: a quick fix', BIG: 'Big job: more work, more time' }[f.scale];
    const template = garmentTemplates.find((tpl) => String(tpl.id) === String(f.templateId));
    // The order keeps one line for what is wrong; the rest of the form rides
    // along in it rather than being dropped (there is no field for the size).
    const issue = [
      f.request.trim(), f.adjustments.trim(),
      template && f.note.trim() ? `Garment: ${f.note.trim()}` : '',
      scale, f.notes.trim(),
    ].filter(Boolean).join('\n');
    if (!f.request.trim() && !f.adjustments.trim()) { alert('Say what needs changing.'); return; }
    if (!outsidePhoto?.file) { alert('Take a photo of the garment as it came in.'); return; }
    const charge = parseFloat(f.charge || 0);
    const bad = amountError(f.charge, { label: 'Charge' })
      || amountError(f.paidNow, { label: 'Paid now', max: charge });
    if (bad) { alert(charge ? bad : 'Enter the charge before recording a payment.'); return; }
    try {
      let customer = customerId;
      if (!customer) {
        const row = await api.createCustomer({
          first_name: customerForm.first_name.trim(), last_name: (customerForm.last_name || '').trim(),
          mobile_number: customerForm.mobile_number, source: 'Walk In',
        });
        customer = row.id;
        // A retry after a failure below must not add the customer twice.
        setCustomerId(row.id);
      }
      const created = await api.createOutsideAlterationOrder({
        customer,
        garment_name: (template?.name || f.note.trim()).slice(0, 100),
        issue,
        charge: f.charge || '0',
        paid_now: f.paidNow || '0',
      });
      if (outsidePhoto?.file) {
        try { await api.uploadGarmentImage(created.id, 'FRONT', outsidePhoto.file); }
        catch (err) { alert(`Taken in, but the photo could not be saved: ${err.message}`); }
      }
      setView('dashboard');
      rememberAlteration(created);
      openAlteration(created.id);
    } catch (err) {
      setWizardError(err.message || 'Could not take the garment in.');
    }
  };

  /** What is wrong with the customer details, or '' when they will do. */
  const customerProblem = () => {
    const mobileBad = mobileError(customerForm.mobile_number);
    if (mobileBad) return mobileBad;
    if (serviceType === 'alter' && !alterOutside) {
      if (!customerId) return 'Pick the customer from the list. For a garment stitched elsewhere, choose \u201cStitched elsewhere\u201d.';
    } else {
      
      const nameBad = customerId ? '' : nameError(customerForm.first_name, { label: 'Customer name' });
      if (nameBad || customerForm.first_name.trim().length < 2) {
        return nameBad || 'Enter the customer\u2019s name (at least 2 letters).';
      }
    }
    const emailBad = emailError(customerForm.email_address);
    return emailBad ? `${emailBad} Or leave it blank.` : '';
  };

  /** Nothing typed or picked yet: an order may go on and come back for the customer. */
  const customerBlank = () => !customerId && !customerForm.first_name?.trim()
    && !String(customerForm.mobile_number || '').trim();

  const performNext = async () => {
    try {
      if (wizardStepKey === 'who') {
        
        const skip = serviceType !== 'alter' && customerBlank();
        const problem = skip ? '' : customerProblem();
        if (problem) { alert(problem); return; }
        if (serviceType === 'alter') { reachStep(currentStep + 1); return; }
        await persistDraft({ step: currentStep + 1 });
        reachStep(currentStep + 1);
      } else if (wizardStepKey === 'type') {
        if (garmentJobs.length === 0 || !openGarment) { alert('Add at least one garment to this order.'); return; }
        const key = openGarment.key;
        if (!garmentDetailsOk()) return;
        // This garment done: on to the next one not yet moved past, if any.
        const done = [...new Set([...garmentsDone, key])];
        setGarmentsDone(done);
        const at = garmentJobs.findIndex(job => job.key === key);
        const next = [...garmentJobs.slice(at + 1), ...garmentJobs.slice(0, at)].find(job => !done.includes(job.key));
        if (next) {
          openGarmentAt(next.key);
          await persistDraft({ cursor: { garment: next.key, done } });
          return;
        }
        // Every garment once more, in case one was reached by its circle.
        if (!validateGarments({ sections: ['basic', 'style'] })) {
          alert('Say what each garment needs \u2014 see the highlighted fields.');
          return;
        }
        if (serviceType === 'design' && !designerChoice) {
          alert('Pick the designer.');
          document.getElementById('wz-designer')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return;
        }
        const target = stepAfterGarments();
        await persistDraft({ step: target });
        if (wizardSteps[target - 1]?.key === 'measure') prefillMeasurements();
        reachStep(target);
      } else if (wizardStepKey === 'measure') {
        if (!validateGarments({ sections: ['measurements'] })) {
          alert('Some measurements are missing or invalid \u2014 see the highlighted fields.');
          return;
        }
        rememberMeasurements();
        await persistDraft({ step: currentStep + 1 });
        reachStep(currentStep + 1);
      } else if (wizardStepKey === 'review') {
        await persistDraft({ step: currentStep + 1 });
        reachStep(currentStep + 1);
      } else if (wizardStepKey === 'money') {
        if (garmentJobs.length === 0) { alert('Add at least one garment to this order.'); reachStep(wizardSteps.findIndex(st => st.key === 'type') + 1); return; }
        const customerBad = customerProblem();
        if (customerBad) {
          alert(`Fill in the customer details before completing the order. ${customerBad}`);
          reachStep(wizardSteps.findIndex(st => st.key === 'who') + 1);
          return;
        }
        // The step bar can jump past Measurements, so they are checked here too.
        if (needsMeasurements() && !validateGarments({ sections: ['measurements'] })) {
          alert('Some measurements are missing or invalid — see the highlighted fields.');
          jumpToStep(wizardSteps.findIndex(st => st.key === 'measure') + 1);
          return;
        }
        if (!readyBy) { alert('Pick the ready-by date.'); return; }
        // "More details" sits on this screen: a typed value is still checked.
        if (!validateGarments({ sections: ['basic', 'style'] })) {
          alert('Something under More details is not valid — see the highlighted fields.');
          return;
        }
        if (isPastDate(readyBy)) { alert('The ready-by date cannot be in the past.'); return; }
        if (garmentJobs.some(j => j.values?.trial_date && j.values.trial_date > readyBy)) {
          alert('The trial date must be on or before the ready-by date.');
          return;
        }
        
        const goods = getSubtotal() + parseFloat(quotePrices.discount || 0);
        if (!quotePrices.price_later && parseFloat(quotePrices.discount || 0) > goods) {
          setQuotePrices({ ...quotePrices, discount: String(goods) });
          alert(`The discount cannot be more than the order subtotal, so it was set to ${inr(goods)}.`);
          return;
        }
        const total = getTotalPrice();
        if (!quotePrices.price_later && Number(advancePaymentAmount || 0) > total) {
          setAdvancePaymentAmount(String(total));
          alert(`The advance cannot be more than the order total, so it was set to ${inr(total)}.`);
          return;
        }
        await submitOrderAndConfirm();
      } else if (wizardStepKey === 'garment') {
        if (!alterPick) { alert('Pick the garment.'); return; }
        reachStep(currentStep + 1);
      } else if (wizardStepKey === 'issue') {
        await createAlterationFromWizard();
      } else if (wizardStepKey === 'outGarment') {
        if (!outsideForm.templateId && !outsideForm.note.trim()) {
          alert('Say what the garment is: pick a garment type or describe it.'); return;
        }
        if (!outsidePhoto?.file) { alert('Take a photo of the garment as it came in.'); return; }
        reachStep(currentStep + 1);
      } else if (wizardStepKey === 'outIssue') {
        await createOutsideAlterationFromWizard();
      }
    } catch (err) {
      console.error("Step execution failed", err);
      alert("Failed to proceed: " + err.message);
    }
  };

  /** Save for later: the draft as it stands, unvalidated, then the dashboard. */
  const performSaveDraft = async () => {
    try {
      await persistDraft();
      setView('dashboard');
      fetchDashboardAndConfig();
    } catch (err) {
      console.error(err);
      alert("Failed to save draft.");
    }
  };

  const handleNext = () => runOnce(performNext);

  const handleSaveDraft = () => runOnce(performSaveDraft);

  // Any garment asking for hand work puts the order on the maggam path.
  const isMaggamOrder = () => garmentJobs.some(j => j.values?.hand_work && j.values.hand_work !== 'none');

  const setJobPrice = (jobKey, field, value) => {
    setGarmentJobs(prev => prev.map(job => job.key === jobKey
      ? { ...job, pricing: { ...(job.pricing || {}), [field]: value } }
      : job));
  };

  const setJobExtra = (jobKey, key, value) => {
    setGarmentJobs(prev => prev.map(job => job.key === jobKey
      ? { ...job, pricing: { ...(job.pricing || {}), extras: { ...(job.pricing?.extras || {}), [key]: value } } }
      : job));
  };

  const partSelection = React.useMemo(
    () => Object.fromEntries(garmentJobs.map(job => [job.key, job.design?.parts || {}])),
    [garmentJobs]);

  const handlePartSelection = (garmentKey, next) => {
    setGarmentJobs(prev => prev.map(job => job.key === garmentKey
      ? { ...job, design: { ...(job.design || {}), parts: next } }
      : job));
  };

  const [fabricColorQuery, setFabricColorQuery] = useState('');

  const fabricSelection = React.useMemo(
    () => Object.fromEntries(garmentJobs.map(job => [job.key, job.fabrics || {}])),
    [garmentJobs]);

  const handleFabricSelection = (garmentKey, next) => {
    setGarmentJobs(prev => prev.map(job => job.key === garmentKey
      ? { ...job, fabrics: next }
      : job));
  };

  const handleFabricQuantity = (garmentKey, slot, fabricId, quantity) => {
    setGarmentJobs(prev => prev.map(job => job.key === garmentKey
      ? { ...job, fabric_qty: { ...(job.fabric_qty || {}), [`${slot}:${fabricId}`]: quantity } }
      : job));
  };

  const colourFilteredFabrics = React.useMemo(() => {
    const q = fabricColorQuery.trim().toLowerCase();
    if (!q) return fabrics;
    return fabrics.filter(f => fabricMatchesColour(f, q));
  }, [fabrics, fabricColorQuery]);

  const partReferences = React.useMemo(
    () => Object.fromEntries(garmentJobs.map(job => [job.key, job.design?.part_refs || {}])),
    [garmentJobs]);

  const handlePartReferences = (garmentKey, next) => {
    setGarmentJobs(prev => prev.map(job => job.key === garmentKey
      ? { ...job, design: { ...(job.design || {}), part_refs: next } }
      : job));
  };

  return {
    addingGarmentKey,
    setAddingGarmentKey,
    addMoreGarmentsRef,
    selfDesignerLabel,
    activePairingGarment,
    setActivePairingGarment,
    pairingQueue,
    setPairingQueue,
    discardingDraftId,
    setDiscardingDraftId,
    activeDesignTab,
    setActiveDesignTab,
    addGarment,
    handleAddPairedGarments,
    addGarments,
    removeGarment,
    updateGarmentPurchase,
    updateGarmentValues,
    validateGarments,
    startingBoutiqueRun,
    setStartingBoutiqueRun,
    deletingDraftId,
    setDeletingDraftId,
    ensureCustomerId,
    clearPickedCustomer,
    setCustomerNameSplit,
    customerLookupTyped,
    customerMatchList,
    alterCandidates,
    alterPick,
    leaveWizard,
    canJumpAhead,
    jumpToStep,
    openGarmentAt,
    garmentLabel,
    renamingGarment,
    setRenamingGarment,
    saveGarmentName,
    copyGarment,
    dropFollower,
    addAnotherOf,
    garmentDetailsOk,
    needsMeasurements,
    handleBack,
    prefillMeasurements,
    rememberMeasurements,
    stepAfterGarments,
    submitOrderAndConfirm,
    actionInFlight,
    runOnce,
    createAlterationFromWizard,
    createOutsideAlterationFromWizard,
    customerProblem,
    customerBlank,
    performNext,
    performSaveDraft,
    handleNext,
    handleSaveDraft,
    isMaggamOrder,
    setJobPrice,
    setJobExtra,
    partSelection,
    handlePartSelection,
    fabricColorQuery,
    setFabricColorQuery,
    fabricSelection,
    handleFabricSelection,
    handleFabricQuantity,
    colourFilteredFabrics,
    partReferences,
    handlePartReferences,
  };
}
