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
// The same model from behind: public/garment-base/<template key>-back.jpg.
// Shown beside the front once the file is there; until then nothing changes.
const baseBackImage = (job) => {
  const front = baseImage(job);
  return front ? front.replace(/\.jpg$/, '-back.jpg') : null;
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

/** Pictures drawn on a customer are sent under their ID, so the order needs a
 *  customer first. Without one, this sends the counter back to the Customer step. */
function CustomerNeeded({ customer, onCustomer }) {
  if (customer?.given) {
    return (
      <div className="od-hint">
        Customer: <strong>{customer.name || 'Saved customer'}</strong>{customer.mobile ? ` · ${customer.mobile}` : ''}
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '8px 10px', borderRadius: '8px',
                  border: '1px dashed var(--border-color)' }}>
      <div style={{ fontWeight: 600, fontSize: '12.5px' }}>This order has no customer yet</div>
      <div className="od-hint">Pictures on the customer are saved under their customer record. Add the customer first.</div>
      <button type="button" className="btn-primary at-btn-sm" onClick={onCustomer} style={{ alignSelf: 'flex-start' }}>
        Go to Customer step
      </button>
    </div>
  );
}

function ModelChoice({ value, onChange, customer, onCustomer }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [viewing, setViewing] = useState(false);
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
          {onCustomer && <CustomerNeeded customer={customer} onCustomer={onCustomer} />}
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer', fontSize: '12.5px' }}>
            <input type="checkbox" checked={!!value.consent} style={{ marginTop: '2px', accentColor: 'var(--primary-color)' }}
                   onChange={(e) => set({ consent: e.target.checked, consent_at: e.target.checked ? new Date().toISOString() : null })} />
            The customer agrees to their photo (and later their measurements) being used to make AI pictures of this order.
          </label>
          {value.consent && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              {value.photo && (
                <button type="button" title="View full size" aria-label="View the customer photo full size"
                        onClick={() => setViewing(true)}
                        style={{ position: 'relative', padding: 0, border: 'none', background: 'none', cursor: 'zoom-in' }}>
                  <img src={resolveMediaUrl(value.photo)} alt="Customer photo"
                       style={{ width: '48px', height: '64px', objectFit: 'cover', borderRadius: '6px',
                                border: '1px solid var(--border-color)', display: 'block' }} />
                  <span aria-hidden="true"
                        style={{ position: 'absolute', top: '3px', right: '3px', width: '18px', height: '18px',
                                 borderRadius: '5px', background: 'rgba(0,0,0,0.55)', color: '#fff',
                                 display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Eye size={11} />
                  </span>
                </button>
              )}
              {viewing && value.photo && createPortal(
                <Lightbox items={[{ key: 'customer', image_url: value.photo, label: 'Customer photo' }]}
                          index={0} onIndexChange={() => {}} onClose={() => setViewing(false)} />,
                document.body)}
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
            <div className="od-hint">Previews here use this photo. On the Review step the customer's measurements are added too.</div>
          )}
          {error && <div role="alert" style={{ color: 'var(--danger-color, #b91c1c)', fontSize: '12.5px' }}>{error}</div>}
        </div>
      )}
    </fieldset>
  );
}

const PRESENTATIONS = [
  ['model', 'Photo on a model'],
  ['mannequin', 'On a mannequin'],
  ['sketch', 'Sketch with labels'],
];
const small = { fontSize: '12.5px' };

/** Design Studio's options for one drawing: how the garment is shown, the
 *  model's gender, what it is worn with, and how the designs are applied. */
function PreviewOptions({ busy, onCustomer, presentation, setPresentation, gender, setGender, pair, setPair,
                          keepMotif, setKeepMotif, coverage, setCoverage }) {
  const setPairField = (key) => (e) => setPair((prev) => ({ ...prev, [key]: e.target.value }));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        <label style={small} htmlFor="gp-presentation">Show it as</label>
        <select id="gp-presentation" value={onCustomer ? 'model' : presentation} disabled={busy || onCustomer}
                onChange={(e) => setPresentation(e.target.value)} style={small}>
          {PRESENTATIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
        {!onCustomer && (
          <select value={gender} disabled={busy} onChange={(e) => setGender(e.target.value)}
                  aria-label="Model" style={small}>
            <option value="female">Female</option>
            <option value="male">Male</option>
          </select>
        )}
      </div>
      {onCustomer && (
        <div className="od-hint">On the customer's own photo it is always a photograph; mannequin and sketch use a standard model.</div>
      )}
      <details>
        <summary style={{ ...small, cursor: 'pointer' }}>More options</summary>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
          <div style={{ ...small, fontWeight: 600 }}>Worn with</div>
          <div className="od-hint">What the model wears with this garment, e.g. a saree's blouse. It stays plain; your designs never go on it.</div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <input type="text" className="form-control" placeholder="Colour, e.g. antique gold" maxLength={60}
                   value={pair.color} disabled={busy} onChange={setPairField('color')} style={{ ...small, flex: '1 1 140px' }} />
            <input type="color" aria-label="Exact colour" value={pair.color_hex || '#c9a227'} disabled={busy}
                   onChange={setPairField('color_hex')} style={{ width: '40px', height: '32px', padding: 0 }} />
            {pair.color_hex && (
              <button type="button" className="btn-secondary at-btn-sm" disabled={busy}
                      onClick={() => setPair((prev) => ({ ...prev, color_hex: '' }))}>Clear colour</button>
            )}
          </div>
          <input type="text" className="form-control" placeholder="Note, e.g. short puff sleeves" maxLength={300}
                 value={pair.note} disabled={busy} onChange={setPairField('note')} style={small} />
          <label style={small} htmlFor="gp-motif">Motif colours</label>
          <select id="gp-motif" value={keepMotif ? 'keep' : 'recolour'} disabled={busy}
                  onChange={(e) => setKeepMotif(e.target.value === 'keep')} style={small}>
            <option value="keep">Keep each design's own colours</option>
            <option value="recolour">Recolour them to suit the fabric</option>
          </select>
          <label style={small} htmlFor="gp-coverage">Design coverage</label>
          <select id="gp-coverage" value={coverage} disabled={busy} onChange={(e) => setCoverage(e.target.value)} style={small}>
            <option value="full">Cover the whole part</option>
            <option value="reference">Follow the design picture's layout</option>
          </select>
        </div>
      </details>
    </div>
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
export default function GarmentPreviews({ jobs = [], title, onPreview, aiModel, onAiModel, customerPhoto = '',
                                          customer = {}, onCustomer, ensureCustomerId }) {
  const [available, setAvailable] = useState(false);
  // Garments the service can draw: a plain one is offered front and back too.
  const [drawable, setDrawable] = useState([]);
  useEffect(() => {
    api.garmentPreviewInfo().then(
      (info) => { setAvailable(info.available); setDrawable(info.garments); },
      () => setAvailable(false));
  }, []);
  // With the customer's consent the standard model is put away: the
  // customer is who the pictures are for.
  const hideModel = aiModel?.mode === 'customer' && !!aiModel.consent;
  // With consent and a photo, the quick check here is on the customer too --
  // photo only; their measurements join on the Review step.
  const ownPhoto = hideModel ? aiModel.photo || '' : '';
  // Drawing on the customer waits until the order knows who they are.
  const needsCustomer = hideModel && !customer?.given;
  const rows = jobs.filter((job) => (customerPhoto || hideModel ? false : baseImage(job)) || (available && hasDesign(job)));
  // ponytail: rows with a missing base file still get a row (name + hint);
  // a HEAD check per garment is not worth it for a review-step picture.
  if (!rows.length) return null;
  const list = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {rows.map((job) => (
        <GarmentPreview key={job.key} job={job} onPreview={onPreview} customerPhoto={customerPhoto}
                        hideModel={hideModel} ownPhoto={ownPhoto} customerId={customer?.id || null}
                        ensureCustomerId={ensureCustomerId}
                        needsCustomer={needsCustomer} canDraw={available && hasDesign(job) && !needsCustomer}
                        canDrawPlain={available && !hasDesign(job) && drawable.includes(job.template?.key)} />
      ))}
    </div>
  );
  if (customerPhoto) return list;
  return (
    // Sticky: the garment's form is long, and the picture should stay in view
    // while the designs and fabrics below are chosen.
    <div className="sidebar-card" style={{ position: 'sticky', top: '16px', zIndex: 1 }}>
      <div className="sidebar-card-title"><Sparkles size={16} /> {title}</div>
      {onAiModel && <ModelChoice value={aiModel || {}} onChange={onAiModel} customer={customer} onCustomer={onCustomer} />}
      {list}
    </div>
  );
}

function GarmentPreview({ job, onPreview, canDraw: canDrawDesigns, canDrawPlain = false, customerPhoto, hideModel,
                          ownPhoto = '', customerId = null, needsCustomer = false, ensureCustomerId }) {
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
  // How the garment is shown (Design Studio's `presentation`): on a person,
  // on a headless dress form, or as one labelled fashion sketch.
  const [presentation, setPresentation] = useState('model');
  const [gender, setGender] = useState('female');
  // What the product is worn with (a saree's blouse, a blouse's skirt).
  const [pair, setPair] = useState({ color: '', color_hex: '', note: '' });
  // Applied to every design: keep the motifs' own colours or recolour them to
  // the fabric; cover the whole part or follow the reference's layout.
  const [keepMotif, setKeepMotif] = useState(true);
  const [coverage, setCoverage] = useState('full');
  // Index into `shown` of the picture open in the popup, or null.
  const [viewing, setViewing] = useState(null);

  useEffect(() => {
    if (!busy) return undefined;
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [busy]);

  // On the customer (Review, or their own photo here), the pictures are kept
  // apart from the standard model's, so switching back and forth shows each its own.
  const onCustomer = !!(customerPhoto || ownPhoto);
  // A customer's own photo dresses a real person, so it is always a photograph.
  const shape = onCustomer ? 'model' : presentation;
  // Each way of showing it keeps its own pictures, so switching shows each its own.
  const [frontKey, backKey] = { mannequin: ['mannequin_preview', 'mannequin_preview_back'],
                                sketch: ['sketch_preview', null] }[shape]
    || (onCustomer ? ['customer_preview', 'customer_preview_back'] : ['preview', 'preview_back']);
  const preview = job.design?.[frontKey];
  const previewBack = backKey ? job.design?.[backKey] : null;
  const labels = shape === 'sketch' ? job.design?.sketch_labels || [] : [];
  const base = customerPhoto || ownPhoto || (hideModel ? null : baseImage(job));
  // The standard model's back, only once its file has actually loaded.
  const baseBack = customerPhoto || ownPhoto || hideModel ? null : baseBackImage(job);
  const [hasBack, setHasBack] = useState(false);
  // No design chosen: the plain garment's own photo is sent as its Overall
  // design, so the service still draws it front and back. Only on the
  // standard model, and only once that photo has actually loaded.
  const [baseLoaded, setBaseLoaded] = useState(false);
  const plain = canDrawPlain && !customerPhoto && !ownPhoto && !hideModel && baseLoaded;
  const canDraw = canDrawDesigns || plain;
  const baseLabel = customerPhoto || ownPhoto ? 'Customer' : hasBack ? 'Model · Front' : 'Model';
  const measurements = customerPhoto ? measurementsOf(job) : [];
  const name = job.template?.name || job.key;
  // Every picture on the card, in order, so the popup can step through them.
  const shown = [
    ...(preview ? [[preview, shape === 'sketch' ? 'Sketch' : previewBack ? 'Front' : 'Drawn preview']] : []),
    ...(preview && previewBack ? [[previewBack, 'Back']] : []),
    ...(base ? [[base, baseLabel]] : []),
    ...(baseBack && hasBack ? [[baseBack, 'Model · Back']] : []),
  ].map(([src, label]) => ({ key: label, image_url: src, label: `${name} · ${label}` }));

  const run = async () => {
    setBusy(true); setSeconds(0); setError(null); setWarnings([]);
    try {
      // On the customer: their ID goes with the picture, saving a new customer first.
      const pictureOf = onCustomer ? customerId || (ensureCustomerId ? await ensureCustomerId() : null) : null;
      const result = await api.generateGarmentPreview({
        garment_key: job.template?.key || job.key,
        parts: job.design?.parts || {},
        part_refs: plain ? { overall: [{ image_url: await asDataUri(base) }] } : (job.design?.part_refs || {}),
        fabrics: job.fabrics || {},
        notes: job.design?.notes || '',
        product_name: name,
        // The plain garment on a model, as base64: it lives on this app's
        // origin, which the server may not be able to reach, so the
        // browser reads it and sends the bytes. Missing file → no model.
        model_image: shape !== 'model' ? ''
          : customerPhoto || ownPhoto || (base && useModel ? await asDataUri(base) : ''),
        // Only on the customer: their body, for the fit the picture shows.
        ...(customerPhoto ? { measurements } : {}),
        views: views === 'both' ? undefined : [views],
        presentation: shape,
        // A picture of the customer: their ID is the image service's clientId.
        ...(pictureOf ? { clientId: pictureOf } : {}),
        ...(onCustomer ? {} : { model_gender: gender }),
        pair_with: pair,
        keep_motif_colors: keepMotif,
        coverage,
      });
      // What the service's own checks still found wrong (a sketch label
      // written twice, a face that drifted) is shown with the warnings.
      const failed = Object.values(result.quality || {}).flatMap((q) => (
        q && q.passed === false ? (q.failures || []).map((f) => f.evidence || f.check) : []));
      setWarnings([...(result.warnings || []), ...failed]);
      // preview is the primary photograph (front, the one side asked for, or
      // the sketch sheet); preview_back only when both sides came back.
      const images = result.images || {};
      onPreview?.(job.key, result.image_url, images.front ? images.back : undefined,
                  { presentation: shape, annotations: result.annotations || [] });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  // The eye is a bare styled button, not .at-btn-sm: that class's !important
  // min-height and padding make a 36px pill of what should be a small icon
  // in the picture's corner.
  const picture = (src, label, width, onLoad) => (
    <figure style={{ margin: 0, position: 'relative', width, maxWidth: '100%' }}>
      <img src={resolveMediaUrl(src)} alt={`${name} · ${label}`} onLoad={onLoad}
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
      {preview && !previewBack && picture(preview, shape === 'sketch' ? 'Sketch' : 'Drawn preview', '100%')}
      {labels.length > 0 && (
        <ul className="od-hint" style={{ margin: 0, paddingLeft: '18px' }}>
          {labels.map((a) => <li key={`${a.part}:${a.label}`}>{a.label}</li>)}
        </ul>
      )}
      {preview && previewBack && (
        <div style={{ display: 'flex', gap: '8px' }}>
          {picture(preview, 'Front', 'calc(50% - 4px)')}
          {picture(previewBack, 'Back', 'calc(50% - 4px)')}
        </div>
      )}
      {/* The customer's own photo is already shown beside Change photo above. */}
      {base && !ownPhoto && (
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {picture(base, baseLabel, preview ? '64px' : '120px', () => setBaseLoaded(true))}
          {baseBack && picture(baseBack, 'Model · Back', preview ? '64px' : '120px', () => setHasBack(true))}
          {!customerPhoto && !ownPhoto && shape === 'model' && (
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
          {busy ? `Drawing the garment… ${seconds}s (${shape === 'sketch' ? 'one sheet, usually under a minute'
              : views === 'both' ? 'front and back, up to four minutes' : 'usually under two minutes'})`
            : customerPhoto ? `On the customer: their photo, these designs and fabrics, and ${measurements.length ? `${measurements.length} measurement${measurements.length === 1 ? '' : 's'}` : 'no measurements yet'}.`
            : preview && plain ? 'The plain garment, drawn on a model. Choose designs to see them drawn on.'
            : preview ? 'Made from the designs and fabrics chosen above.'
              : plain ? 'See the plain garment front and back on a model. Choose designs to see them drawn on.'
              : needsCustomer ? 'Add the customer above to draw this on their photo.'
              : canDraw ? 'See these designs and fabrics as one garment, on a model.'
                : 'The plain garment, before designs and fabrics are drawn on.'}
        </div>
        {error && <div role="alert" style={{ color: 'var(--danger-color, #b91c1c)', fontSize: '12.5px' }}>{error}</div>}
        {warnings.map((w) => <div key={w} className="od-hint">⚠ {w}</div>)}
        {canDraw && (
          <PreviewOptions busy={busy} onCustomer={onCustomer} presentation={presentation} setPresentation={setPresentation}
                          gender={gender} setGender={setGender} pair={pair} setPair={setPair}
                          keepMotif={keepMotif} setKeepMotif={setKeepMotif} coverage={coverage} setCoverage={setCoverage} />
        )}
        {canDraw && <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={views} disabled={busy} onChange={(e) => setViews(e.target.value)}
                  aria-label="Sides to draw" style={{ fontSize: '12.5px' }}>
            <option value="both">Front &amp; back</option>
            <option value="front">Front only</option>
            <option value="back">Back only</option>
          </select>
          <button type="button" className="btn-primary" disabled={busy} onClick={run}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            {preview ? <RefreshCw size={13} /> : <Sparkles size={13} />}
            {busy ? 'Working…' : preview ? 'Draw again' : shape === 'sketch' ? 'Draw the sketch'
              : shape === 'mannequin' ? 'Show on a mannequin' : customerPhoto ? 'Draw on the customer' : 'Preview on a model'}
          </button>
          {busy && (
            <button type="button" className="btn-secondary" onClick={() => api.cancelGarmentPreview(onCustomer ? customerId : null)}>Stop</button>
          )}
        </div>}
      </div>
      {/* Portalled: the card is sticky with a z-index, which would trap a fixed popup beneath the page. */}
      {viewing !== null && shown[viewing] && createPortal(
        <Lightbox items={shown} index={viewing} onIndexChange={setViewing} onClose={() => setViewing(null)} />,
        document.body)}
    </div>
  );
}
