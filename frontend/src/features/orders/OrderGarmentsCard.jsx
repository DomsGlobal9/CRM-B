import { Shirt } from 'lucide-react';
import { ALL_ACCESSORY_OPTIONS } from '../catalog/accessories';
import { useLanguage } from '../../i18n/LanguageContext.jsx';
import { IconTile } from '../../components/ui/Atelier';
import { resolveMediaUrl } from '../../services/media';

/** The designs the customer wants, garment by garment: the looks picked from
 *  our catalogue and the customer's own design photos and links, as the order
 *  kept them (GarmentJob.selections.design). The customer's fabric and
 *  accessory photos share part_refs; their keys say so (an accessory key, or an
 *  upper-case fabric slot) and they are left out here. No design photo on any
 *  garment, no card. */
const ORDER_ACCESSORY_KEYS = new Set(ALL_ACCESSORY_OPTIONS.map((o) => o.key));
const designPhotosOf = (job) => {
  const design = job.selections?.design || {};
  const label = (part, pic) => pic?.part_label || String(part).replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
  const photos = [];
  Object.entries(design.parts || {}).forEach(([part, pic]) => {
    if (pic?.image_url) photos.push({ key: `p:${part}:${pic.id || ''}`, src: pic.image_url, part: label(part, pic), from: 'catalogue' });
  });
  Object.entries(design.part_refs || {}).forEach(([part, list]) => {
    if (ORDER_ACCESSORY_KEYS.has(part) || /^[A-Z0-9_]+$/.test(part)) return;
    (list || []).forEach((ref, i) => {
      if (ref?.image_url) photos.push({ key: `r:${part}:${ref.id || i}`, src: ref.image_url, part: label(part, ref),
                                        from: ref.source === 'customer_link' ? 'link' : 'customer' });
    });
  });
  return photos;
};

export function OrderGarmentsCard({ order, focus = null }) {
  const { t } = useLanguage();
  const jobs = order.garment_jobs || [];
  const shown = (jobs.some((j) => j.id === focus) ? jobs.filter((j) => j.id === focus) : jobs)
    .map((job) => ({ job, photos: designPhotosOf(job) }))
    .filter(({ photos }) => photos.length > 0);
  if (!shown.length) return null;

  const fromLabel = {
    catalogue: t('ordersPage.designFromCatalogue', 'Catalogue'),
    customer: t('ordersPage.designCustomerPhoto', 'Customer photo'),
    link: t('ordersPage.designCustomerLink', 'Customer link'),
  };
  return (
    <section className="at-section od-garments">
      <div className="od-section-head">
        <IconTile icon={Shirt} tone="green" size={40} iconSize={18} />
        <div className="od-section-title od-section-title--stack">
          <h3>{t('ordersPage.garmentsInOrder', 'Garments in this order')}</h3>
          <span className="od-section-sub">{t('ordersPage.garmentDesignsSub', 'The designs the customer wants')}</span>
        </div>
      </div>
      <div className="od-garment-list">
        {shown.map(({ job, photos }) => (
          <div key={job.id} className="od-garment-designs">
            <div className="od-garment-name">{jobs.length > 1 ? `${jobs.indexOf(job) + 1}. ` : ''}{job.display_name || job.template_name || t('ordersPage.garment', 'Garment')}</div>
            <div className="od-design-grid">
              {photos.map((photo) => (
                <a key={photo.key} className="od-design-photo" href={resolveMediaUrl(photo.src)} target="_blank" rel="noopener noreferrer"
                   title={`${photo.part} · ${fromLabel[photo.from]}`}>
                  <img src={resolveMediaUrl(photo.src)} alt={photo.part} loading="lazy" />
                  <span className="od-design-photo-part">{photo.part}</span>
                  <span className="od-design-photo-from">{fromLabel[photo.from]}</span>
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
