/**
 * Visibility and validation for garment templates.
 *
 * The exact mirror of core/templates.py. If you change a rule here, change it
 * there in the same commit: the browser hiding a field the server still demands
 * is how a form saves an order with the wrong measurements on it.
 *
 * A hidden field is never required and is never stored.
 */

const asList = (value) => (Array.isArray(value) ? value : [value]);

const isEmpty = (value) =>
  value === null ||
  value === undefined ||
  value === '' ||
  (Array.isArray(value) && value.length === 0);

export function evaluateRule(rule, values) {
  if (!rule) return true;
  if (rule.all) return rule.all.every((r) => evaluateRule(r, values));
  if (rule.any) return rule.any.some((r) => evaluateRule(r, values));

  const actual = values[rule.field];
  const op = rule.op || 'eq';
  const expected = rule.value;

  if (op === 'is_set') return !isEmpty(actual);
  // A multiselect answer is a list, so 'in' means "any chosen value matches" --
  // picking Fall + Pico must reveal both the fall and the pico field.
  if (op === 'in') {
    const chosen = new Set(asList(actual));
    return asList(expected).some((v) => chosen.has(v));
  }
  if (op === 'not_in') {
    const chosen = new Set(asList(actual));
    return !asList(expected).some((v) => chosen.has(v));
  }
  if (op === 'neq') return actual !== expected;
  return actual === expected;
}

export const isVisible = (field, values) => evaluateRule(field.visible_when, values);

// A dropdown answer typed in because no option fit, stored in the select's own
// key as "other:<text>". Mirrors OTHER_PREFIX in core/templates.py.
/** Answers whose option has been retired, and what they mean now. Mirrors
 *  RETIRED_CHOICES in core/templates.py. */
export const RETIRED_CHOICES = { fall_pico: ['fall', 'pico'], hand_design: ['sleeve_design'] };

export const OTHER_PREFIX = 'other:';
export const OTHER_MAX_LENGTH = 200;
export const isTypedOther = (raw) => typeof raw === 'string' && raw.startsWith(OTHER_PREFIX);
export const typedOtherText = (raw) => (isTypedOther(raw) ? raw.slice(OTHER_PREFIX.length) : '');
// Multiple-choice questions that also take a choice typed at the counter
// ("+ Add" under Work On), kept in the list as "other:<text>". Mirrors
// MULTI_TYPED in core/templates.py.
export const MULTI_TYPED = new Set(['hand_work_parts']);

// Measurements the template does not ask for, added by hand at the counter
// ("Add other measurement"): [{ label, value }] under one key of the garment's
// measurements, in inches. Mirrors EXTRA_MEASUREMENTS in core/templates.py.
export const EXTRA_MEASUREMENTS = 'extra_measurements';
export const EXTRA_MEASUREMENTS_MAX = 20;
export const EXTRA_LABEL_MAX = 60;

/** The added measurements that say something (wholly blank rows left out). */
export const extraMeasurements = (values) => (Array.isArray(values?.[EXTRA_MEASUREMENTS]) ? values[EXTRA_MEASUREMENTS] : [])
  .filter((row) => row && (String(row.label ?? '').trim() || String(row.value ?? '').trim()));

/** What is wrong with the added measurements, as a sentence, or ''. */
export function extraMeasurementsError(values) {
  for (const row of extraMeasurements(values)) {
    const label = String(row.label ?? '').trim();
    const value = String(row.value ?? '').trim();
    if (!label) return 'Give each extra measurement a name.';
    if (!value) return `Enter a value for ${label}.`;
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0 || number > 999.99) return `${label} must be more than 0 and at most 999.99.`;
  }
  return '';
}

/** Every field of a section that currently applies, in render order. */
export function visibleFields(section, values) {
  if (!section) return [];
  return section.fields.filter((field) => isVisible(field, values));
}

export const getSection = (template, key) =>
  template?.sections?.find((section) => section.key === key);

/**
 * Drop the answers to fields that have become hidden.
 *
 * Called on every change: without it, choosing Peplum, typing a flare length and
 * switching to Corset leaves the flare length behind, and the cutter sees a
 * measurement for a panel that is not being made.
 */
export function pruneHidden(template, values) {
  const kept = {};
  (template?.sections || []).forEach((section) => {
    section.fields.forEach((field) => {
      if (isVisible(field, values) && values[field.key] !== undefined) {
        kept[field.key] = values[field.key];
      }
    });
  });
  // Not a template question, so kept by name: editing a measurement must not
  // drop the ones added by hand.
  if (values?.[EXTRA_MEASUREMENTS] !== undefined) kept[EXTRA_MEASUREMENTS] = values[EXTRA_MEASUREMENTS];
  return kept;
}

/** Returns {field_key: message}; empty when the spec is good. */
/** The template's declared defaults under the values already answered.
 *  A required question with a default (hand work: "Without Work") is then
 *  answered the moment the garment is added, and a draft written before the
 *  question existed resumes with it answered too. */
export function withDefaults(template, values = {}) {
  const out = { ...values };
  (template?.sections || []).forEach((section) => section.fields.forEach((field) => {
    if (field.default != null && (out[field.key] === undefined || out[field.key] === null || out[field.key] === '')) {
      out[field.key] = field.default;
    }
    // An answer whose option has been retired reads as what it meant. Mirrors
    // RETIRED_CHOICES in core/templates.py: saree "Fall + Pico" was one tick
    // for two services, and a draft written then resumes with both ticked.
    if (field.field_type === 'multiselect' && Array.isArray(out[field.key])) {
      const allowed = new Set((field.options || []).map((o) => o.value));
      const spread = out[field.key].flatMap((v) => (
        RETIRED_CHOICES[v] && !allowed.has(v) ? RETIRED_CHOICES[v] : [v]));
      out[field.key] = [...new Set(spread)];
    }
  }));
  return out;
}

export function validateSpec(template, values, { partial = false, sections = null } = {}) {
  const errors = {};

  (template?.sections || []).forEach((section) => {
    // The wizard asks a section at its own step; a field it has not asked yet
    // cannot be required of the step before it.
    if (sections && !sections.includes(section.key)) return;
    section.fields.forEach((field) => {
      if (!isVisible(field, values)) return;

      const raw = values[field.key];
      if (isEmpty(raw)) {
        if (field.is_required && !partial) {
          errors[field.key] = `${field.label} is required.`;
        }
        return;
      }

      const rules = field.validation || {};
      if (field.field_type === 'number') {
        const number = Number(raw);
        if (Number.isNaN(number)) {
          errors[field.key] = `${field.label} must be a number.`;
        } else if (rules.min !== undefined && number < rules.min) {
          errors[field.key] = `${field.label} cannot be below ${rules.min}.`;
        } else if (rules.max !== undefined && number > rules.max) {
          errors[field.key] = `${field.label} cannot exceed ${rules.max}.`;
        }
      } else if (field.field_type === 'select' && isTypedOther(raw)) {
        const text = typedOtherText(raw).trim();
        if (!text) errors[field.key] = `${field.label}: type the option you want.`;
        else if (text.length > OTHER_MAX_LENGTH) errors[field.key] = `${field.label} is limited to ${OTHER_MAX_LENGTH} characters.`;
      } else if (field.field_type === 'select' || field.field_type === 'multiselect') {
        const allowed = new Set((field.options || []).map((o) => o.value));
        // A retired answer counts as what it means now, so a garment already
        // on screen when its option went is not held up.
        const typed = (v) => MULTI_TYPED.has(field.key) && isTypedOther(v) && typedOtherText(v).trim();
        const unknown = asList(raw).filter((v) => !allowed.has(v) && !RETIRED_CHOICES[v] && !typed(v));
        if (unknown.length) {
          errors[field.key] = `${field.label}: unknown option ${unknown.join(', ')}.`;
        }
      } else if (rules.max_length && String(raw).length > rules.max_length) {
        errors[field.key] = `${field.label} is limited to ${rules.max_length} characters.`;
      }
    });
  });

  const { trial_date: trial, delivery_date: delivery } = values;
  if (trial && delivery && trial > delivery) {
    errors.trial_date = 'Trial date must fall before the delivery date.';
  }

  if (!partial && (!sections || sections.includes('measurements'))) {
    const extraProblem = extraMeasurementsError(values);
    if (extraProblem) errors[EXTRA_MEASUREMENTS] = extraProblem;
  }

  return errors;
}

/** Split a flat spec into the two columns GarmentJob stores it in. */
export function splitSpec(template, values) {
  const measurementKeys = new Set(
    (getSection(template, 'measurements')?.fields || []).map((f) => f.key)
  );
  const spec = {};
  const measurements = {};
  Object.entries(values).forEach(([key, value]) => {
    (measurementKeys.has(key) || key === EXTRA_MEASUREMENTS ? measurements : spec)[key] = value;
  });
  return { spec, measurements };
}
