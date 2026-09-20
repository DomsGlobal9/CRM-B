import { useEffect, useMemo, useState } from 'react';

import { api } from '../../services/api';
import { getSection, isVisible, pruneHidden } from '../../services/templates';
import VoiceTextarea from '../../components/ui/VoiceTextarea';
import { OTHER_PREFIX, OTHER_MAX_LENGTH, isTypedOther, typedOtherText } from '../../services/templates';

// Dropdowns that steer the order rather than describe the garment: an answer
// nobody listed would send the job down no path at all.
const NO_OTHER = new Set(['hand_work', 'urgency']);
import { CameraButton } from '../../components/ui/Atelier';
import { UNITS, purchaseError } from './materials';
import { PurchaseDetails } from './GarmentPurchases';

// A select's own "buy it" choice, never stored: the answer is kept as
// "other:<name>" like any typed option, and the purchase row beside it says
// it must be bought. Mirrors nothing on the server on purpose.
const BUY_OPTION = '__buy__';

/**
 * Renders one section of a garment template.
 *
 * This replaces the hardcoded garment dropdown, stitch-part grid and seven fixed
 * measurement inputs the wizard used to carry. Everything shown here comes from
 * /api/catalog/templates/, so adding Sharara or a new saree type is a data
 * change.
 */

// Inventory pickers all want the same shape, and several fields on one form ask
// for the same category. Fetch once per category and share it across fields.
function useInventoryOptions(categories) {
  const [byCategory, setByCategory] = useState({});

  const wanted = useMemo(() => [...new Set(categories)].sort().join(','), [categories]);

  useEffect(() => {
    if (!wanted) return;
    let cancelled = false;
    Promise.all(
      wanted.split(',').map((category) =>
        api
          .getInventoryItems({ category })
          .then((items) => [category, items.results || items])
          .catch(() => [category, []])
      )
    ).then((pairs) => {
      if (!cancelled) setByCategory(Object.fromEntries(pairs));
    });
    return () => {
      cancelled = true;
    };
  }, [wanted]);

  return byCategory;
}

// How a template field's unit reads on its label; the stored value ('in') is
// what validation and the summary keep using.
const UNIT_NAMES = { in: 'Inches' };

// Mirrors Unit and DEFAULT_UNIT_BY_CATEGORY in apps/inventory/models.py. A
// customer's own cloth has no stock row to read a unit off, so the form has to
// offer the same vocabulary the ledger stores.

const DEFAULT_UNIT = {
  FABRIC: 'METER', BORDER: 'METER', LINING: 'METER', EMBELLISHMENT: 'PIECE',
  STITCHING: 'PIECE', PACKAGING: 'PIECE', MAGGAM: 'PIECE', OTHER: 'UNIT',
};

function Field({ field, value, error, onChange, inventory, quantity, quantityError, onQuantityChange,
                 source, brought, onSourceChange, onBroughtChange, purchase, onPurchaseChange }) {
  const common = {
    className: 'form-control',
    id: `tf-${field.key}`,
    value: value ?? '',
    onChange: (e) => onChange(field.key, e.target.value),
  };

  let control;
  switch (field.field_type) {
    case 'textarea':
      control = <VoiceTextarea {...common} rows={3} placeholder={field.help_text || ''} />;
      break;

    case 'number':
      control = (
        <input
          {...common}
          type="number"
          step={field.validation?.step || 0.25}
          min={field.validation?.min}
          max={field.validation?.max}
          placeholder="0.00"
        />
      );
      break;

    case 'date':
      control = <input {...common} type="date" />;
      break;

    case 'boolean':
      control = (
        <select
          {...common}
          value={value === true ? 'yes' : value === false ? 'no' : ''}
          onChange={(e) =>
            onChange(field.key, e.target.value === '' ? null : e.target.value === 'yes')
          }
        >
          <option value="">Select</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
      );
      break;

    case 'select': {
      // "Other" keeps the select's own key: the typed text is stored as
      // "other:<text>", so nothing else about the spec changes shape.
      // Skipped where the template already lists an Other option with its
      // own "Specify" text field (saree, shirt, kurta...): that pair stays.
      const other = !NO_OTHER.has(field.key) && !field.options.some((o) => o.value === 'other');
      const typed = other && isTypedOther(value);
      // "Buy for this order": a typed answer with a purchase row hung on it.
      const buying = typed && Boolean(purchase);
      const pick = (chosen) => {
        if (chosen === BUY_OPTION) {
          onChange(field.key, OTHER_PREFIX + (purchase?.name || ''));
          if (!purchase) onPurchaseChange(field.key, { field_key: field.key, name: '', quantity: '', unit: 'METER', estimated_cost: '', required_by: '', notes: '' });
          return;
        }
        if (purchase) onPurchaseChange(field.key, null);
        onChange(field.key, chosen === OTHER_PREFIX ? OTHER_PREFIX : chosen);
      };
      control = (
        <>
          <select {...common} value={buying ? BUY_OPTION : typed ? OTHER_PREFIX : (value ?? '')}
                  onChange={(e) => pick(e.target.value)}>
            <option value="">Select</option>
            {field.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
            {other && <option value={OTHER_PREFIX}>Other (type it)</option>}
            {other && <option value={BUY_OPTION}>Not in stock? Buy for this order</option>}
          </select>
          {typed && !buying && (
            <input className="form-control" type="text" style={{ marginTop: '8px' }} autoFocus
                   maxLength={OTHER_MAX_LENGTH} value={typedOtherText(value)}
                   placeholder={`Type the ${field.label.toLowerCase()} you want`}
                   onChange={(e) => onChange(field.key, OTHER_PREFIX + e.target.value)} />
          )}
          {buying && (
            <div style={{ marginTop: '8px', padding: '12px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', background: 'var(--surface-2)' }}>
              <input className="form-control" type="text" autoFocus maxLength={OTHER_MAX_LENGTH}
                     placeholder={`What do you need? e.g. the ${field.label.toLowerCase()} the customer asked for`}
                     aria-label={`What to buy for ${field.label}`} value={purchase.name || ''}
                     onChange={(e) => { onChange(field.key, OTHER_PREFIX + e.target.value); onPurchaseChange(field.key, { ...purchase, name: e.target.value }); }} />
              <div style={{ marginTop: '8px' }}>
                <PurchaseDetails row={purchase} onChange={(next) => onPurchaseChange(field.key, next)} />
              </div>
              {purchaseError(purchase) && (
                <div style={{ fontSize: '12px', color: 'var(--danger-color)', marginTop: '4px' }}>{purchaseError(purchase)}</div>
              )}
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                🛒 Bought specially for this order. Nothing is taken from boutique stock.
              </div>
            </div>
          )}
        </>
      );
      break;
    }

    case 'multiselect': {
      const chosen = Array.isArray(value) ? value : [];
      control = (
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', paddingTop: '6px' }}>
          {field.options.map((option) => (
            <label
              key={option.value}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '13.5px',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={chosen.includes(option.value)}
                onChange={(e) =>
                  onChange(
                    field.key,
                    e.target.checked
                      ? [...chosen, option.value]
                      : chosen.filter((v) => v !== option.value)
                  )
                }
              />
              {option.label}
            </label>
          ))}
        </div>
      );
      break;
    }

    case 'inventory_ref': {
      const items = inventory[field.inventory_category] || [];
      const selected = items.find((item) => String(item.id) === String(value ?? ''));
      // Where this material comes from is a property of the material, not of
      // the garment: the customer brings the saree and the boutique still
      // supplies the fall cloth, the lining and the thread. That is what
      // "Mixed" on the order means, and the only place it can be recorded
      // truthfully is here, line by line.
      const fromCustomer = source === 'CUSTOMER';
      // Not in stock and not the customer's: bought for this one order.
      const toBuy = source === 'PURCHASE';
      const unit = brought.unit || DEFAULT_UNIT[field.inventory_category] || 'UNIT';
      const setBrought = (patch) => onBroughtChange(field.key, { ...brought, unit, ...patch });
      const sourceToggle = (
        <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' }}>
          {[['STORE', 'From stock'], ['CUSTOMER', 'Customer brought'], ['PURCHASE', 'Not in stock? Buy for this order']].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => onSourceChange(field.key, key)}
              style={{
                fontSize: '12px', padding: '4px 10px', borderRadius: '99px', cursor: 'pointer',
                border: '1px solid var(--border-color)',
                background: source === key ? 'var(--text-primary)' : 'transparent',
                color: source === key ? '#fff' : 'var(--text-secondary)',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      );
      // Picking the roll is half the answer. Without "how much", the order can
      // name a material but the inventory ledger can never reserve or consume
      // it -- which is exactly how a delivered order used to leave stock
      // untouched. So the quantity is asked for here, at the moment the choice
      // is made, rather than defaulted to a number nobody decided.
      control = toBuy ? (
        <>
          {sourceToggle}
          <input
            className="form-control"
            id={`tf-${field.key}`}
            type="text"
            placeholder="What do you need? e.g. Pink zari maggam work"
            value={brought.name || ''}
            onChange={(e) => setBrought({ name: e.target.value })}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
            <input
              className="form-control"
              id={`tf-${field.key}-qty`}
              type="number"
              min="0"
              step="0.001"
              style={{ maxWidth: '120px' }}
              placeholder="Quantity"
              aria-label={`Quantity to buy for ${field.label}`}
              value={quantity ?? ''}
              onChange={(e) => onQuantityChange(field.key, e.target.value)}
            />
            <select
              className="form-control"
              style={{ maxWidth: '140px' }}
              aria-label={`Unit for ${field.label}`}
              value={unit}
              onChange={(e) => setBrought({ unit: e.target.value })}
            >
              {UNITS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
            <input
              className="form-control"
              type="number"
              min="0"
              step="1"
              style={{ maxWidth: '160px' }}
              placeholder="Estimated cost ₹"
              aria-label={`Estimated purchase cost for ${field.label}`}
              value={brought.estimated_cost ?? ''}
              onChange={(e) => setBrought({ estimated_cost: e.target.value })}
            />
            <input
              className="form-control"
              type="date"
              style={{ maxWidth: '170px' }}
              aria-label={`Purchase needed by, for ${field.label}`}
              title="Purchase needed by"
              value={brought.required_by || ''}
              onChange={(e) => setBrought({ required_by: e.target.value })}
            />
          </div>
          <input
            className="form-control"
            type="text"
            style={{ marginTop: '8px' }}
            placeholder="Notes, e.g. use on the pallu"
            aria-label={`Notes for buying ${field.label}`}
            value={brought.notes || ''}
            onChange={(e) => setBrought({ notes: e.target.value })}
          />
          {quantityError && (
            <div style={{ fontSize: '12px', color: 'var(--danger-color)', marginTop: '4px' }}>
              {quantityError}
            </div>
          )}
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Bought specially for this order. Nothing is taken from boutique stock.
          </div>
        </>
      ) : fromCustomer ? (
        <>
          {sourceToggle}
          <input
            className="form-control"
            id={`tf-${field.key}`}
            type="text"
            placeholder="What did the customer bring? e.g. Kanjivaram silk, maroon"
            value={brought.name || ''}
            onChange={(e) => onBroughtChange(field.key, { name: e.target.value, unit })}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
            <input
              className="form-control"
              id={`tf-${field.key}-qty`}
              type="number"
              min="0"
              step="0.001"
              style={{ maxWidth: '120px' }}
              placeholder="Quantity"
              aria-label={`Quantity the customer brought for ${field.label}`}
              value={quantity ?? ''}
              onChange={(e) => onQuantityChange(field.key, e.target.value)}
            />
            <select
              className="form-control"
              style={{ maxWidth: '140px' }}
              aria-label={`Unit for ${field.label}`}
              value={unit}
              onChange={(e) => onBroughtChange(field.key, { name: brought.name || '', unit: e.target.value })}
            >
              {UNITS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </div>
          {quantityError && (
            <div style={{ fontSize: '12px', color: 'var(--danger-color)', marginTop: '4px' }}>
              {quantityError}
            </div>
          )}
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Received onto this order&apos;s customer-material ledger. Boutique stock is untouched.
          </div>
        </>
      ) : (
        <>
          {sourceToggle}
          <select {...common}>
            <option value="">
              {items.length ? 'Select from stock' : 'Nothing in stock for this category'}
            </option>
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
                {item.available_stock !== undefined
                  ? ` — ${item.available_stock} ${item.unit_display || item.unit || ''} available`
                  : ''}
              </option>
            ))}
          </select>
          {selected && (
            <div style={{ marginTop: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  className="form-control"
                  id={`tf-${field.key}-qty`}
                  type="number"
                  min="0"
                  step="0.001"
                  style={{ maxWidth: '120px' }}
                  placeholder="Quantity"
                  aria-label={`Quantity of ${selected.name} for ${field.label}`}
                  value={quantity ?? ''}
                  onChange={(e) => onQuantityChange(field.key, e.target.value)}
                />
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                  {selected.unit_display || selected.unit || 'units'}
                  {selected.available_stock !== undefined
                    && ` · ${selected.available_stock} available`}
                </span>
              </div>
              {quantityError && (
                <div style={{ fontSize: '12px', color: 'var(--danger-color)', marginTop: '4px' }}>
                  {quantityError}
                </div>
              )}
            </div>
          )}
        </>
      );
      break;
    }

    case 'file': {
      // The draft is JSON and a File cannot ride in it, so the picture is
      // stored the moment it is chosen and the value is its URL -- the same
      // shape the customer-reference upload already produces.
      const urls = field.is_repeatable ? (value || []) : (value ? [value] : []);
      const upload = async (e) => {
        const files = [...e.target.files];
        e.target.value = '';
        if (!files.length) return;
        try {
          const uploaded = await Promise.all(files.map((f) => api.uploadReferenceImage(f)));
          const next = uploaded.map((r) => r.image_url);
          onChange(field.key, field.is_repeatable ? [...urls, ...next] : next[0]);
        } catch (err) {
          alert(err.message || 'Could not upload the image.');
        }
      };
      control = (
        <>
          <input className="form-control" id={`tf-${field.key}`} type="file" accept="image/*"
                 multiple={field.is_repeatable} onChange={upload} />
          <div style={{ marginTop: '6px' }}>
            <CameraButton multiple={field.is_repeatable} onFiles={(files) => upload({ target: { files, value: '' } })} />
          </div>
          {urls.length > 0 && (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
              {urls.map((url) => (
                <img key={url} src={url} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 6 }} />
              ))}
            </div>
          )}
        </>
      );
      break;
    }

    default:
      control = <input {...common} type="text" placeholder={field.help_text || ''} />;
  }

  return (
    <div className="form-group">
      <label className="form-label" htmlFor={`tf-${field.key}`}>
        {field.label}
        {field.unit ? ` (${UNIT_NAMES[field.unit] || field.unit})` : ''}
        {field.is_required && <span className="required"> *</span>}
      </label>
      {control}
      {field.help_text && field.field_type !== 'text' && (
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
          {field.help_text}
        </div>
      )}
      {error && (
        <div style={{ fontSize: '12px', color: 'var(--danger-color)', marginTop: '4px' }}>{error}</div>
      )}
    </div>
  );
}

export default function TemplateForm({
  template, section, values, errors = {}, onChange,
  // Which of the section's fields to draw; the wizard asks the required ones
  // first and folds the rest away. Visibility rules still apply on top.
  only = null,
  // How much of each selected material this garment needs, keyed by field key.
  // Kept beside `values` rather than inside it because `spec` is validated
  // against the template's own field list, and a quantity is not one of its
  // fields -- it belongs to the material line, not to the garment's spec.
  quantities = {}, quantityErrors = {}, onQuantityChange = () => {},
  // Per-material source, and what the customer brought when it is theirs. Same
  // reasoning as quantities: neither is a field of the garment's spec.
  // `defaultSource` comes from the order's Material Source answer, so choosing
  // "Customer Provided Fabric" up top starts every line on the customer and
  // "Mixed" leaves each one to be said explicitly.
  sources = {}, brought = {}, defaultSource = 'STORE',
  onSourceChange = () => {}, onBroughtChange = () => {},
  // Things to buy for this garment, one per question they answer (field_key).
  // Same reasoning again: a purchase is not a field of the spec.
  purchases = [], onPurchaseChange = () => {},
  // Where to send someone whose inventory is empty. Optional because this form
  // also renders in places that have no navigation to offer.
  onGoToInventory = null,
}) {
  const definition = getSection(template, section);
  // File fields are not rendered, because nothing in this product can save one.
  //
  // The four of them -- Measurement Sheet, Reference Images, Audio Note, Final
  // Approved Design -- stored the browser's raw File object in `values`, and
  // saveGarmentJobs sends that through JSON.stringify, which turns a File into
  // `{}`. core/templates.py then treats `{}` as empty and drops the key with no
  // error; a repeatable one becomes `[{}]` and is stored verbatim, reaching the
  // tailor's "What to make" panel as `reference images: [object Object]`.
  // Meanwhile GarmentSummary printed "Attached".
  //
  // So a staff member photographed the customer's handwritten measurement
  // sheet, the wizard advanced with no complaint, and the artefact proving what
  // was actually measured was gone at the moment of capture.
  //
  // Removing the affordance rather than hardening the write path, deliberately.
  // Rejecting the value server-side would be worse: saveGarmentJobs runs AFTER
  // the order is created, so a hard 400 there strands an order with no garment
  // job behind a dead wizard. Real uploads need a multipart endpoint and a
  // FormData path, which is a feature -- see the audit's Missing Features
  // table. Until it exists, offering the input is the bug.
  const fields = (definition?.fields || [])
    .filter((f) => f.field_type !== 'file')
    .filter((f) => (only ? only(f) : true))
    .filter((f) => isVisible(f, values));

  const inventoryCategories = fields
    .filter((f) => f.field_type === 'inventory_ref')
    .map((f) => f.inventory_category);
  const inventory = useInventoryOptions(inventoryCategories);

  // Loaded-and-empty across every category this section asks about. A new
  // boutique used to discover mid-order that every picker says "Nothing in
  // stock" -- the guidance belongs before the choices, not scattered under
  // them. Distinguished from still-loading so established boutiques never see
  // the banner flash.
  const inventoryLoaded = inventoryCategories.length > 0
    && inventoryCategories.every((c) => c in inventory);
  const inventoryEmpty = inventoryLoaded
    && inventoryCategories.every((c) => (inventory[c] || []).length === 0);

  const handleChange = (key, value) => {
    // Prune after every edit: switching Peplum to Corset must take the flare
    // length with it, or the cutter is handed a measurement for a panel that is
    // not being made.
    onChange(pruneHidden(template, { ...values, [key]: value }));
  };

  if (!definition) return null;
  if (!fields.length) {
    // A filtered instance is one of several on the screen; only the whole
    // section has nothing to say.
    if (only) return null;
    return (
      <div style={{ fontSize: '13px', color: 'var(--text-secondary)', padding: '8px 0' }}>
        Nothing to record here for a {template.name.toLowerCase()}.
      </div>
    );
  }

  return (
    <div>
      {inventoryEmpty && onGoToInventory && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
          padding: '12px 14px', marginBottom: '14px', borderRadius: '8px',
          border: '1px dashed var(--border-color)', background: 'var(--surface-color, #fafafa)',
        }}>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            Your inventory has nothing to pick from yet. Add fabrics and materials
            first — this order is saved as a draft, so you can come straight back.
          </div>
          <button type="button" className="btn-secondary" style={{ flexShrink: 0, fontSize: '12px', padding: '6px 12px' }} onClick={onGoToInventory}>
            Set up inventory
          </button>
        </div>
      )}
      <div className="form-grid-2">
      {fields.map((field) => (
        <Field
          key={field.key}
          field={field}
          value={values[field.key]}
          error={errors[field.key]}
          onChange={handleChange}
          inventory={inventory}
          quantity={quantities[field.key]}
          quantityError={quantityErrors[field.key]}
          onQuantityChange={onQuantityChange}
          source={sources[field.key] || defaultSource}
          brought={brought[field.key] || {}}
          onSourceChange={onSourceChange}
          onBroughtChange={onBroughtChange}
          purchase={purchases.find((r) => r.field_key === field.key) || null}
          onPurchaseChange={onPurchaseChange}
        />
      ))}
      </div>
    </div>
  );
}
