import { useState } from 'react';
import { Camera, Plus, ArrowRight, Send } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext.jsx';
import { IconTile, AddPhotoButton, PhotoTile } from '../../components/ui/Atelier';
import { imageFilesError } from '../../utils/validate';
import { api } from '../../api';
import { resolveMediaUrl } from '../../services/media';
import { formatDateTime as fmtDateTime } from '../../utils/format';

const GARMENT_VIEWS = [
  ['FRONT', 'Front view'], ['BACK', 'Back view'],
  ['LEFT', 'Left side'], ['RIGHT', 'Right side'],
  ['DETAIL', 'Close-up detail'], ['FABRIC', 'Fabric texture'],
  ['SLEEVE', 'Sleeve detail'], ['BLOUSE', 'Blouse detail'],
  ['DUPATTA', 'Dupatta styling'],
];

export function GarmentGallery({ order, onChanged, role }) {
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [view, setView] = useState('FRONT');
  // Which garment's photos: each garment is photographed, and sent to the
  // customer, on its own once it passes Master quality check. '' is the
  // order's own gallery, as it always was.
  const jobs = order.garment_jobs || [];
  const [jobId, setJobId] = useState(jobs[0]?.id || '');
  const job = jobs.find((j) => j.id === jobId) || null;

  const images = (order.garment_images || []).filter((i) => (i.garment_job || '') === (job ? job.id : ''));
  const qcDone = job && (order.stages || []).some((st) => st.stage_key === 'master_quality_check'
    && st.garment_job === job.id && st.status === 'COMPLETED');
  const canSend = !role || ['Owner', 'Designer', 'Master'].includes(role);
  const sentAt = images.map((i) => i.sent_at).filter(Boolean).sort().pop();
  const review = job && (order.photo_reviews || []).find((r) => r.garment_job === job.id);
  const tryons = job ? (order.garment_tryons || []).filter((r) => r.garment_job === job.id) : [];
  const published = order.garment_images_published;
  const have = new Set(images.map((i) => i.view));
  // Share with customer (the whole order's gallery) checks every photo on the order, as it always did.
  const orderViews = new Set((order.garment_images || []).map((i) => i.view));
  const missing = ['FRONT', 'BACK'].filter((v) => !orderViews.has(v));

  const run = async (work) => {
    setBusy(true);
    setError(null);
    try {
      await work();
      await onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="at-section od-gallery">
      <div className="od-section-head">
        <IconTile icon={Camera} tone="amber" size={40} iconSize={18} />
        <div className="od-section-title od-section-title--stack">
          <h3>{t('ordersPage.garmentPhotos', 'Garment photos')}</h3>
          <span className="od-section-sub">
            {published
              ? t('ordersPage.visibleToCustomer', 'visible to the customer')
              : t('ordersPage.uploadedNotShared', '{count} uploaded, not yet shared', { count: images.length })}
          </span>
        </div>
        <div className="od-head-actions">
          <select className="form-control od-select" value={view} onChange={(e) => setView(e.target.value)} disabled={busy}
                  aria-label="Which view the next photo shows">
            {GARMENT_VIEWS.map(([value, label]) => (
              <option key={value} value={value}>{label}{have.has(value) ? ' (replace)' : ''}</option>
            ))}
          </select>
          <AddPhotoButton camera className="btn-primary at-btn-sm" icon={Plus} disabled={busy}
                          label={busy ? 'Working…' : t('common.addPhoto', 'Add photo')}
                          onFiles={([file]) => { const bad = imageFilesError([file]); if (bad) { alert(bad); return; } run(() => api.uploadGarmentImage(order.id, view, file, job?.id || null)); }} />
        </div>
      </div>

      {jobs.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <label htmlFor="gallery-garment" className="od-hint" style={{ margin: 0 }}>Photos of</label>
          <select id="gallery-garment" className="form-control od-select" value={jobId} disabled={busy}
                  onChange={(e) => setJobId(e.target.value)}>
            {jobs.map((j, i) => (
              <option key={j.id} value={j.id}>{jobs.length > 1 ? `${i + 1}. ` : ''}{j.display_name || j.template_name || 'Garment'}</option>
            ))}
            <option value="">Whole order</option>
          </select>
        </div>
      )}

      {error && <div className="od-error">{error}</div>}

      {images.length > 0 ? (
        <div className="od-photos">
          {images.map((image) => (
            <PhotoTile key={image.id} src={resolveMediaUrl(image.image)} alt={image.view_label} label={image.view_label} size={112}
                       onRemove={busy ? undefined : () => run(() => api.deleteGarmentImage(order.id, image.id))} />
          ))}
        </div>
      ) : (
        <div className="od-photos-empty">
          <Camera size={18} />
          <span>{t('ordersPage.noPhotosYet', 'No photos yet. Add the front and back views to share them with the customer.')}</span>
        </div>
      )}

      {/* Sharing is what the photos are for: the customer sees them once front
          and back are in. */}
      <div className="od-gallery-foot">
        <button type="button" className="btn-secondary at-btn-sm"
                disabled={busy || (!published && missing.length > 0)}
                title={missing.length ? `Still needs: ${missing.join(', ')}` : ''}
                onClick={() => run(() => api.publishGarmentImages(order.id, !published))}>
          <ArrowRight size={14} /> {published ? 'Hide from customer' : t('ordersPage.shareWithCustomer', 'Share with customer')}
        </button>
        {!published && missing.length > 0 && (
          <span className="od-hint">{t('ordersPage.needsFrontAndBack', 'needs front and back')}</span>
        )}
      </div>

      {/* This garment's photos to the customer's WhatsApp, once it has passed
          Master quality check; the customer approves or asks for changes on
          their tracking page. */}
      {job && canSend && (
        <div className="od-gallery-foot" style={{ flexWrap: 'wrap', gap: 8 }}>
          <button type="button" className="btn-primary at-btn-sm"
                  disabled={busy || !qcDone || images.length === 0}
                  onClick={() => run(() => api.sendGarmentPhotos(order.id, job.id))}>
            <Send size={14} /> {sentAt ? 'Send photos again on WhatsApp' : 'Send photos to customer on WhatsApp'}
          </button>
          {!qcDone ? <span className="od-hint">after Master quality check</span>
            : images.length === 0 ? <span className="od-hint">add a photo of this garment first</span> : null}
          {sentAt && (
            <span className="od-hint">
              Sent {fmtDateTime(sentAt)}
              {review ? (review.decision === 'APPROVED'
                ? ' · ✓ Approved by the customer'
                : ` · ✎ Changes asked${review.note ? `: "${review.note}"` : ''}`) : ' · waiting for the customer'}
            </span>
          )}
        </div>
      )}

      {/* The customer's own try-on pictures of this garment, made from the
          try-on link sent with its photos. */}
      {tryons.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div className="od-hint" style={{ marginBottom: 6 }}>Customer try-on ({tryons.length})</div>
          <div className="od-photos">
            {tryons.map((tryon) => (
              <a key={tryon.id} href={resolveMediaUrl(tryon.image_url)} target="_blank" rel="noopener noreferrer"
                 title={`Made ${fmtDateTime(tryon.created_at)}`}>
                <PhotoTile src={resolveMediaUrl(tryon.image_url)} alt="Customer try-on"
                           label={fmtDateTime(tryon.created_at)} size={112}
                           onRemove={busy ? undefined : (e) => {
                             // The tile sits inside the link that opens it.
                             e.preventDefault();
                             e.stopPropagation();
                             if (!window.confirm('Delete this try-on picture? The customer will no longer see it.')) return;
                             run(() => api.deleteGarmentTryOn(order.id, tryon.id));
                           }} />
              </a>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
