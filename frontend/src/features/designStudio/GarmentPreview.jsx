import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Eye, RefreshCw, Sparkles } from 'lucide-react';

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
export default function GarmentPreviews({ jobs = [], title, onPreview }) {
  const [available, setAvailable] = useState(false);
  useEffect(() => { api.garmentPreviewAvailable().then(setAvailable, () => setAvailable(false)); }, []);
  const rows = jobs.filter((job) => baseImage(job) || (available && hasDesign(job)));
  // ponytail: rows with a missing base file still get a row (name + hint);
  // a HEAD check per garment is not worth it for a review-step picture.
  if (!rows.length) return null;
  return (
    // Sticky: the garment's form is long, and the picture should stay in view
    // while the designs and fabrics below are chosen.
    <div className="sidebar-card" style={{ position: 'sticky', top: '16px', zIndex: 1 }}>
      <div className="sidebar-card-title"><Sparkles size={16} /> {title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {rows.map((job) => (
          <GarmentPreview key={job.key} job={job} onPreview={onPreview}
                          canDraw={available && hasDesign(job)} />
        ))}
      </div>
    </div>
  );
}

function GarmentPreview({ job, onPreview, canDraw }) {
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

  const preview = job.design?.preview;
  const previewBack = job.design?.preview_back;
  const base = baseImage(job);
  const name = job.template?.name || job.key;
  // Every picture on the card, in order, so the popup can step through them.
  const shown = [
    ...(preview ? [[preview, previewBack ? 'Front' : 'Drawn preview']] : []),
    ...(preview && previewBack ? [[previewBack, 'Back']] : []),
    ...(base ? [[base, 'Model']] : []),
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
        model_image: base && useModel ? await asDataUri(base) : '',
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
          {picture(base, 'Model', preview ? '64px' : '120px')}
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', cursor: 'pointer' }}>
            <input type="checkbox" checked={useModel} disabled={busy}
                   onChange={(e) => setUseModel(e.target.checked)} />
            Use this model in the preview
          </label>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ fontWeight: 600, fontSize: '13px' }}>{name}</div>
        <div className="od-hint">
          {busy ? `Drawing the garment… ${seconds}s (${views === 'both' ? 'front and back, up to four minutes' : 'usually under two minutes'})`
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
            {busy ? 'Working…' : preview ? 'Draw again' : 'Preview on a model'}
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
