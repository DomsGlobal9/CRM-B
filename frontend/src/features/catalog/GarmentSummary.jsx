import { useEffect, useMemo, useState } from 'react';

import { api } from '../../services/api';
import { isVisible, isTypedOther, typedOtherText } from '../../services/templates';

const formatKey = (key) => key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const UNIT_NAMES = { in: 'Inches', inch: 'Inches', inches: 'Inches' };

function useInventoryNames(needed) {
  const [names, setNames] = useState({});

  useEffect(() => {
    if (!needed) return;
    let cancelled = false;
    api
      .getInventoryItems({})
      .then((data) => {
        if (cancelled) return;
        const items = data.results || data;
        setNames(Object.fromEntries(items.map((i) => [String(i.id), i.name])));
      })
      .catch(() => {
        /* Names are a nicety here; the id still identifies the line. */
      });
    return () => {
      cancelled = true;
    };
  }, [needed]);

  return names;
}

function displayValue(field, value, inventoryNames) {
  if (value === null || value === undefined || value === '') return null;

  if (field.field_type === 'boolean') return value ? 'Yes' : 'No';

  if (field.field_type === 'select') {
    if (isTypedOther(value)) return typedOtherText(value);
    return field.options.find((o) => o.value === value)?.label ?? value;
  }

  if (field.field_type === 'multiselect') {
    const chosen = Array.isArray(value) ? value : [value];
    if (!chosen.length) return null;
    return chosen
      .map((v) => field.options.find((o) => o.value === v)?.label ?? v)
      .join(', ');
  }

  if (field.field_type === 'inventory_ref') {
    return inventoryNames[String(value)] || 'Selected from stock';
  }

  if (field.field_type === 'file') {
    const urls = (Array.isArray(value) ? value : [value]).filter((v) => typeof v === 'string' && v);
    if (urls.length) return `${urls.length} photo${urls.length === 1 ? '' : 's'} attached`;
    if (Array.isArray(value)) {
      const named = value.filter((v) => v && v.name);
      return named.length ? named.map((v) => v.name).join(', ') : 'Not saved';
    }
    return value?.name || 'Not saved';
  }

  const text = String(value);
  return field.unit ? `${text} ${UNIT_NAMES[String(field.unit).toLowerCase()] || field.unit}` : text;
}

/** atom: a label over its value. */
function Detail({ label, value }) {
  return (
    <div className="garment-detail">
      <span className="garment-detail-label">{label}</span>
      <span className="garment-detail-value">{value}</span>
    </div>
  );
}

/** molecule: one template section and the answers it received. */
function SectionGroup({ title, entries }) {
  return (
    <div className="garment-section">
      <div className="ui-eyebrow garment-section-title">{title}</div>
      <div className="garment-section-grid">
        {entries.map(({ field, text }) => (
          <Detail key={field.key} label={field.label || formatKey(field.key)} value={text} />
        ))}
      </div>
    </div>
  );
}

/** molecule: the measurements as a tailor's sheet -- one row per measure,
 *  the name on the left, the figure on the right where a tape-reader's eye
 *  lands. Same entries, same text (unit included), same order as the grid it
 *  replaces on the production stage; only the shape is different. Kept opt-in
 *  so the wizard's own review, which also renders this component, is untouched.
 */
function MeasurementTable({ title, entries }) {
  const cell = { padding: '10px 14px', borderTop: '1px solid var(--border-color)',
                 display: 'flex', alignItems: 'center', minWidth: 0 };
  return (
    <div className="garment-section">
      <div className="ui-eyebrow garment-section-title">{title}</div>
      {/* Capped like a job card: on a wide modal a full-width sheet put the
          figure a screen away from its name. Full width on a phone. */}
      <div role="table" aria-label={title}
           style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto',
                    width: '100%', maxWidth: '560px',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-md, 8px)', overflow: 'hidden',
                    background: 'var(--surface-color)' }}>
        <div role="row" style={{ display: 'contents' }}>
          <div role="columnheader" className="ui-eyebrow"
               style={{ ...cell, borderTop: 'none', background: 'var(--surface-inset, #f6f6f4)', fontWeight: 700 }}>
            Measurement
          </div>
          <div role="columnheader" className="ui-eyebrow"
               style={{ ...cell, borderTop: 'none', background: 'var(--surface-inset, #f6f6f4)',
                        fontWeight: 700, justifyContent: 'flex-end' }}>
            Value
          </div>
        </div>
        {entries.map(({ field, text }) => (
          <div role="row" key={field.key} style={{ display: 'contents' }}>
            <div role="rowheader"
                 style={{ ...cell, fontSize: 'var(--text-sm)', fontWeight: 500,
                          color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>
              {field.label || formatKey(field.key)}
            </div>
            <div role="cell"
                 style={{ ...cell, justifyContent: 'flex-end', fontSize: 'var(--text-md, 16px)',
                          fontWeight: 'var(--weight-semibold, 600)', color: 'var(--text-primary)',
                          fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
              {text}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function GarmentSummary({ jobs, onEdit, inventoryNames: providedNames,
                                         measurementsAsTable = false }) {
  const needsInventory = useMemo(
    () =>
      !providedNames
      && jobs.some((job) =>
        job.template.sections.some((s) =>
          s.fields.some((f) => f.field_type === 'inventory_ref' && job.values[f.key])
        )
      ),
    [jobs, providedNames]
  );
  const fetchedNames = useInventoryNames(needsInventory);
  const inventoryNames = providedNames || fetchedNames;

  if (!jobs.length) {
    return (
      <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
        No garment was added to this order.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      {jobs.map((job) => {
        const sections = job.template.sections
          .map((section) => ({
            ...section,
            answered: section.fields
              .filter((f) => isVisible(f, job.values))
              .map((f) => ({ field: f, text: displayValue(f, job.values[f.key], inventoryNames) }))
              .filter((entry) => entry.text !== null),
          }))
          .filter((section) => section.answered.length > 0);

        const total = sections.reduce((n, s) => n + s.answered.length, 0);

        /* organism: one dress. */
        return (
          <div key={job.key} className={`ui-card garment-card${job.express ? ' gh-express' : ''}`}>
            <div className="garment-card-head">
              <span className="garment-card-name">{job.template.name}
                {job.express && <span className="gh-express-tag">EXPRESS</span>}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <span className="ui-badge ui-badge--neutral">
                  {total} detail{total === 1 ? '' : 's'}
                </span>
                {onEdit && (
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ padding: '4px 10px', fontSize: 'var(--text-2xs)' }}
                    onClick={onEdit}
                  >
                    Edit
                  </button>
                )}
              </span>
            </div>

            {sections.map((section) => (
              measurementsAsTable && section.key === 'measurements'
                ? <MeasurementTable key={section.key} title={section.title} entries={section.answered} />
                : <SectionGroup key={section.key} title={section.title} entries={section.answered} />
            ))}
          </div>
        );
      })}
    </div>
  );
}
