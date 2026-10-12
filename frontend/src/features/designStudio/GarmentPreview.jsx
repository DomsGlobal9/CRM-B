import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Eye, RefreshCw, Sparkles } from 'lucide-react';

import { AddPhotoButton } from '../../components/ui/Atelier';
import { api } from '../../services/api';
import { resolveMediaUrl } from '../../services/media';
import { Lightbox } from './GarmentPartPicker';

/**
 * The garment the wizard put together, drawn on a model.
 *
 * One button per garment, in the garments step's right-hand column. It sends the job's own maps --
 * the design chosen per part, the roll per slot -- and shows the photograph
 * that comes back. The URL is handed up through `onPreview`, so it lands on
 * `job.design.preview` and rides the draft to the order like any picture.
 *
 * The wait is 30-95 s (the vendor's own figures), so the button counts the
 * seconds rather than spinning silently: a counter waiting with a customer
 * needs to know it is working, not stuck.
 */

/** A same-origin picture as a data:image/...;base64 URI, or '' if it is not there. */
const asDataUri = async (url) => {
  try {
    const res = await fetch(url);
    if (!res.ok) return '';
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => resolve('');
      reader.readAsDataURL(blob);
    });
  } catch {
    return '';
  }
};

const hasDesign = (job) => Object.values(job.design?.parts || {}).some((img) => img?.image_url)
  || Object.values(job.design?.part_refs || {}).some((refs) => refs?.some?.((r) => r?.image_url));

// The plain garment on a model, served from public/garment-base/<template
// key>.jpg. Shown until a drawn preview replaces it, so the review step has
// a picture of the garment even before anything is drawn. Not a list of keys
// here: dropping a file into that folder is all adding a garment takes, and
// a garment with no file simply hides its picture (onError below).
// Absolute, so resolveMediaUrl (here and in the lightbox) passes it through
// instead of pointing it at the API host.
const baseImage = (job) => {
  const key = (job.template?.key || job.key || '').toLowerCase();
  return key ? `${window.location.origin}/garment-base/${key}.jpg` : null;
};

/** The card: one row per garment that has a base picture or a design.
 *  Nothing at all when no garment has either, so the review step never
 *  shows an empty heading. */
/** Who wears the garment in the picture: a standard model, or -- with the
 *  customer's consent -- the customer, from a full-length photo of them.
 *  `value` is { mode: 'standard' | 'customer', consent, consent_at, photo }. */
// What makes a customer photo usable: the service keeps the person and
// replaces the clothes, so it needs the whole body, clearly apart from the wall.
const PHOTO_TIPS = [
  'Head to foot: the whole body in the frame, with a little space above the head and below the feet.',
  'Standing straight, facing the camera, arms relaxed at the sides.',
  'A plain, light background in one colour (white, cream or light grey wall). No patterns, furniture or other people.',
  'Clothes in a colour that stands out from the wall, plain and fitted. No dupatta, saree drape or loose layers.',
  'Bright, even light (daylight is best). Face clearly visible: no sunglasses, mask or cap, no strong shadows.',
  'Phone held upright at chest height, about 2–3 metres away. No filters or beauty mode.',
];

function ModelChoice({ value, onChange }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const mode = value.mode || 'standard';
  const set = (patch) => onChange({ ...value, ...patch });

  const upload = async ([file]) => {
    setUploading(true); setError(null);
    try {
      set({ photo: (await api.uploadReferenceImage(file)).image_url });
    } catch (e) {
      setError(e.message || 'The photo could not be uploaded.');
    } finally {
      setUploading(false);
    }
  };

  const option = (key, label) => (
    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
      <input type="radio" name="ai-model-mode" checked={mode === key} onChange={() => set({ mode: key })}
             style={{ accentColor: 'var(--primary-color)' }} />
      {label}
    </label>
  );

  return (
    <fieldset style={{ border: '1px solid var(--border-color)', borderRadius: '10px', padding: '10px 12px',
                       margin: '0 0 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <legend style={{ fontWeight: 600, fontSize: '13px', padding: '0 4px' }}>Who wears it in the picture?</legend>
      {option('standard', 'A standard model')}
      {option('customer', 'The customer, from their own photo')}
      {mode === 'customer' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingLeft: '22px' }}>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer', fontSize: '12.5px' }}>
            <input type="checkbox" checked={!!value.consent} style={{ marginTop: '2px', accentColor: 'var(--primary-color)' }}
                   onChange={(e) => set({ consent: e.target.checked, consent_at: e.target.checked ? new Date().toISOString() : null })} />
            The customer agrees to their photo (and later their measurements) being used to make AI pictures of this order.
          </label>
          {value.consent && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              {value.photo && (
                <img src={resolveMediaUrl(value.photo)} alt="Customer photo"
                     style={{ width: '48px', height: '64px', objectFit: 'cover', borderRadius: '6px',
                              border: '1px solid var(--border-color)' }} />
              )}
              <AddPhotoButton camera disabled={uploading} onFiles={upload}
                              label={uploading ? 'Uploading…' : value.photo ? 'Change photo' : 'Add full-length photo'} />
              {value.photo && (
                <button type="button" className="btn-secondary at-btn-sm" onClick={() => set({ photo: '' })}>Remove</button>
              )}
            </div>
          )}
          {value.consent ? (
            <div style={{ background: 'var(--bg-secondary)', borderRadius: '8px', padding: '8px 10px', fontSize: '12px' }}>
              <div style={{ fontWeight: 600, marginBottom: '4px' }}>How to take the photo</div>
              <ul style={{ margin: 0, paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '2px',
                           color: 'var(--text-secondary)' }}>
                {PHOTO_TIPS.map((tip) => <li key={tip}>{tip}</li>)}
              </ul>
            </div>
          ) : (
            <div className="od-hint">Without consent, only the standard model is used.</div>
          )}
          {value.consent && value.photo && (
            <div className="od-hint">The pictures on the customer are made on the Review step, with their measurements.</div>
          )}
          {error && <div role="alert" style={{ color: 'var(--danger-color, #b91c1c)', fontSize: '12.5px' }}>{error}</div>}
        </div>
      )}
    </fieldset>
  );
}

/** The measurements taken for this garment, as the preview service will
 *  read them: numbers only, each with its label and unit. */
const measurementsOf = (job) => ((job.template?.sections || []).find((sec) => sec.key === 'measurements')?.fields || [])
  .filter((f) => f.field_type !== 'file' && Number(job.values?.[f.key]) > 0)
  .map((f) => ({ key: f.key, label: f.label || f.key, value: Number(job.values[f.key]), unit: f.unit || 'Inches' }));

/** `customerPhoto` set: the Review step's card, drawing each garment on the
 *  customer from their photo and measurements. Unset: the Garments step's
 *  card, on the standard model. */
export default function GarmentPreviews({ jobs = [], title, onPreview, aiModel, onAiModel, customerPhoto = '' }) {
  const [available, setAvailable] = useState(false);
  useEffect(() => { api.garmentPreviewAvailable().then(setAvailable, () => setAvailable(false)); }, []);
  // With the customer's consent the standard model is put away: the
  // customer is who the pictures are for.
  const hideModel = aiModel?.mode === 'customer' && !!aiModel.consent;
  const rows = jobs.filter((job) => (customerPhoto || hideModel ? false : baseImage(job)) || (available && hasDesign(job)));
  // ponytail: rows with a missing base file still get a row (name + hint);
  // a HEAD check per garment is not worth it for a review-step picture.
  if (!rows.length) return null;
  const list = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {rows.map((job) => (
        <GarmentPreview key={job.key} job={job} onPreview={onPreview} customerPhoto={customerPhoto}
                        hideModel={hideModel} canDraw={available && hasDesign(job)} />
      ))}
    </div>
  );
  if (customerPhoto) return list;
  return (
    // Sticky: the garment's form is long, and the picture should stay in view
    // while the designs and fabrics below are chosen.
    <div className="sidebar-card" style={{ position: 'sticky', top: '16px', zIndex: 1 }}>
      <div className="sidebar-card-title"><Sparkles size={16} /> {title}</div>
      {onAiModel && <ModelChoice value={aiModel || {}} onChange={onAiModel} />}
      {list}
    </div>
  );
}

function GarmentPreview({ job, onPreview, canDraw, customerPhoto, hideModel }) {
  const [busy, setBusy] = useState(false);
  // Seconds since the request started; reset by `run`, not by the effect,
  // so the effect only ever starts and stops the clock.
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState(null);
  const [warnings, setWarnings] = useState([]);
  // Whether the plain garment's model is sent as the person to dress. Off,
  // the vendor creates a model of its own.
  const [useModel, setUseModel] = useState(true);
  // Which sides to draw: both (the vendor's default) or one, which is
  // half the wait and cost.
  const [views, setViews] = useState('both');
  // Index into `shown` of the picture open in the popup, or null.
  const [viewing, setViewing] = useState(null);

  useEffect(() => {
    if (!busy) return undefined;
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [busy]);

  // On the customer, the pictures are kept apart from the standard model's.
  const preview = customerPhoto ? job.design?.customer_preview : job.design?.preview;
  const previewBack = customerPhoto ? job.design?.customer_preview_back : job.design?.preview_back;
  const base = customerPhoto || (hideModel ? null : baseImage(job));
  const baseLabel = customerPhoto ? 'Customer' : 'Model';
  const measurements = customerPhoto ? measurementsOf(job) : [];
  const name = job.template?.name || job.key;
  // Every picture on the card, in order, so the popup can step through them.
  const shown = [
    ...(preview ? [[preview, previewBack ? 'Front' : 'Drawn preview']] : []),
    ...(preview && previewBack ? [[previewBack, 'Back']] : []),
    ...(base ? [[base, baseLabel]] : []),
  ].map(([src, label]) => ({ key: label, image_url: src, label: `${name} · ${label}` }));

  const run = async () => {
    setBusy(true); setSeconds(0); setError(null); setWarnings([]);
    try {
      const result = await api.generateGarmentPreview({
        garment_key: job.template?.key || job.key,
        parts: job.design?.parts || {},
        part_refs: job.design?.part_refs || {},
        fabrics: job.fabrics || {},
        notes: job.design?.notes || '',
        product_name: name,
        // The plain garment on a model, as base64: it lives on this app's
        // origin, which the server may not be able to reach, so the
        // browser reads it and sends the bytes. Missing file → no model.
        model_image: customerPhoto || (base && useModel ? await asDataUri(base) : ''),
        // Only on the customer: their body, for the fit the picture shows.
        ...(customerPhoto ? { measurements } : {}),
        views: views === 'both' ? undefined : [views],
      });
      setWarnings(result.warnings || []);
      // preview is the primary photograph (front, or the one side asked
      // for); preview_back only when both sides came back.
      const images = result.images || {};
      onPreview?.(job.key, result.image_url, images.front ? images.back : undefined);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  // The eye is a bare styled button, not .at-btn-sm: that class's !important
  // min-height and padding make a 36px pill of what should be a small icon
  // in the picture's corner.
  const picture = (src, label, width) => (
    <figure style={{ margin: 0, position: 'relative', width, maxWidth: '100%' }}>
      <img src={resolveMediaUrl(src)} alt={`${name} · ${label}`}
           onError={(e) => { e.currentTarget.parentElement.style.display = 'none'; }}
           style={{ width: '100%', height: 'auto', borderRadius: '10px',
                    border: '1px solid var(--border-color)', display: 'block' }} />
        <button type="button" title="View full size" aria-label="View full size"
                style={{ position: 'absolute', top: '6px', right: '6px', width: '24px', height: '24px',
                         padding: 0, border: 'none', borderRadius: '6px', cursor: 'pointer',
                         background: 'rgba(0,0,0,0.55)', color: '#fff',
                         display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                onClick={() => setViewing(shown.findIndex((item) => item.image_url === src))}>
          <Eye size={13} />
        </button>
      <figcaption className="od-hint" style={{ marginTop: '4px' }}>{label}</figcaption>
    </figure>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {/* The drawn garment at full width; the plain model as a thumbnail. */}
      {preview && !previewBack && picture(preview, 'Drawn preview', '100%')}
      {preview && previewBack && (
        <div style={{ display: 'flex', gap: '8px' }}>
          {picture(preview, 'Front', 'calc(50% - 4px)')}
          {picture(previewBack, 'Back', 'calc(50% - 4px)')}
        </div>
      )}
      {base && (
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {picture(base, baseLabel, preview ? '64px' : '120px')}
          {!customerPhoto && (
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', cursor: 'pointer' }}>
              <input type="checkbox" checked={useModel} disabled={busy}
                     onChange={(e) => setUseModel(e.target.checked)} />
              Use this model in the preview
            </label>
          )}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ fontWeight: 600, fontSize: '13px' }}>{name}</div>
        <div className="od-hint">
          {busy ? `Drawing the garment… ${seconds}s (${views === 'both' ? 'front and back, up to four minutes' : 'usually under two minutes'})`
            : customerPhoto ? `On the customer: their photo, these designs and fabrics, and ${measurements.length ? `${measurements.length} measurement${measurements.length === 1 ? '' : 's'}` : 'no measurements yet'}.`
            : preview ? 'Made from the designs and fabrics chosen above.'
              : canDraw ? 'See these designs and fabrics as one garment, on a model.'
                : 'The plain garment, before designs and fabrics are drawn on.'}
        </div>
        {error && <div role="alert" style={{ color: 'var(--danger-color, #b91c1c)', fontSize: '12.5px' }}>{error}</div>}
        {warnings.map((w) => <div key={w} className="od-hint">⚠ {w}</div>)}
        {canDraw && <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={views} disabled={busy} onChange={(e) => setViews(e.target.value)}
                  aria-label="Sides to draw" style={{ fontSize: '12.5px' }}>
            <option value="both">Front &amp; back</option>
            <option value="front">Front only</option>
            <option value="back">Back only</option>
          </select>
          <button type="button" className={preview ? 'btn-secondary' : 'btn-primary'} disabled={busy} onClick={run}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            {preview ? <RefreshCw size={13} /> : <Sparkles size={13} />}
            {busy ? 'Working…' : preview ? 'Draw again' : customerPhoto ? 'Draw on the customer' : 'Preview on a model'}
          </button>
        </div>}
      </div>
      {/* Portalled: the card is sticky with a z-index, which would trap a fixed popup beneath the page. */}
      {viewing !== null && shown[viewing] && createPortal(
        <Lightbox items={shown} index={viewing} onIndexChange={setViewing} onClose={() => setViewing(null)} />,
        document.body)}
    </div>
  );
}
