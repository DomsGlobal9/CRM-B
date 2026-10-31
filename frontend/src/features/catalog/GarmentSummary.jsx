import { useEffect, useMemo, useState } from 'react';

import { api } from '../../services/api';
import { isVisible, isTypedOther, typedOtherText, extraMeasurements } from '../../services/templates';
import { VoiceNotePlayer } from '../../components/ui/VoiceTextarea';
import { voiceNoteList } from '../../components/ui/voiceNotes';

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

  // The garment's recorded voice notes: played, not counted as a photo.
  if ((field.key === 'audio_note' || field.key === 'hand_work_voice_note') && typeof value === 'string') {
    return <VoiceNotePlayer src={value} />;
  }
  // Several voice notes ([{ url, by, at }], up to ten): each one played.
  if ((field.key === 'audio_note' || field.key === 'hand_work_voice_note') && Array.isArray(value)) {
    const notes = voiceNoteList(value);
    if (notes.length) {
      return (
        <span style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {notes.map((note, i) => <VoiceNotePlayer key={`${note.url}:${i}`} src={note.url} />)}
        </span>
      );
    }
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

function MeasurementTable({ title, entries }) {
  const cell = { padding: '10px 14px', borderTop: '1px solid var(--border-color)',
                 display: 'flex', alignItems: 'center', minWidth: 0 };
  // The table holds the figures. Written notes ("Notes on the measurements")
  // and recorded voice notes go under it at full width: as a row, a long
  // note forced the value column wide and squeezed every name to one letter.
  const isNote = ({ field, text }) => field.field_type === 'textarea' || typeof text !== 'string';
  const rows = entries.filter((entry) => !isNote(entry));
  const notes = entries.filter(isNote);
  return (
    <div className="garment-section">
      <div className="ui-eyebrow garment-section-title">{title}</div>
      {/* Capped like a job card: on a wide modal a full-width sheet put the
          figure a screen away from its name. Full width on a phone. */}
      {rows.length > 0 && (
      <div role="table" aria-label={title}
           style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) fit-content(55%)',
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
        {rows.map(({ field, text }) => (
          <div role="row" key={field.key} style={{ display: 'contents' }}>
            <div role="rowheader"
                 style={{ ...cell, fontSize: 'var(--text-sm)', fontWeight: 500,
                          color: 'var(--text-primary)', overflowWrap: 'break-word' }}>
              {field.label || formatKey(field.key)}
            </div>
            {/* A figure stays on one line; a longer answer (a typed "Other")
                wraps inside its column instead of widening the table. */}
            <div role="cell"
                 style={{ ...cell, justifyContent: 'flex-end', textAlign: 'right', fontSize: 'var(--text-md, 16px)',
                          fontWeight: 'var(--weight-semibold, 600)', color: 'var(--text-primary)',
                          fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere' }}>
              {text}
            </div>
          </div>
        ))}
      </div>
      )}
      {notes.map(({ field, text }) => (
        <div key={field.key}
             style={{ width: '100%', maxWidth: '560px', marginTop: rows.length ? 'var(--space-3, 12px)' : 0,
                      padding: '10px 14px', border: '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-md, 8px)', background: 'var(--surface-color)',
                      boxSizing: 'border-box', minWidth: 0 }}>
          <div className="ui-eyebrow" style={{ fontWeight: 700, marginBottom: '6px' }}>
            {field.label || formatKey(field.key)}
          </div>
          <div style={{ fontSize: 'var(--text-sm)', lineHeight: 1.5, color: 'var(--text-primary)',
                        whiteSpace: typeof text === 'string' ? 'pre-wrap' : undefined,
                        overflowWrap: 'anywhere' }}>
            {text}
          </div>
        </div>
      ))}
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
        // The measurements added by hand ("Add other measurement") read as
        // rows of the Measurements section, after the template's own.
        const extras = extraMeasurements(job.values).map((row, i) => ({
          field: { key: `extra_measurement_${i}`, label: String(row.label ?? '').trim() },
          text: `${String(row.value ?? '').trim()} Inches`,
        }));
        const withExtras = job.template.sections.some((s) => s.key === 'measurements') || !extras.length
          ? job.template.sections
          : [...job.template.sections, { key: 'measurements', title: 'Measurements', fields: [] }];
        const sections = withExtras
          .map((section) => ({
            ...section,
            answered: [
              ...section.fields
                .filter((f) => isVisible(f, job.values))
                .map((f) => ({ field: f, text: displayValue(f, job.values[f.key], inventoryNames) }))
                .filter((entry) => entry.text !== null),
              ...(section.key === 'measurements' ? extras : []),
            ],
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
