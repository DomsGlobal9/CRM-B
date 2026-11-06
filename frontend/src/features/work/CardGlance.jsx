import { resolveMediaUrl } from '../../services/media';
import { inventoryImage } from '../inventory/inventoryImages';
import { ALL_ACCESSORY_OPTIONS } from '../catalog/accessories';
import { entries, humanise, measureEntries } from './workHelpers';

/** What a job's card shows at a glance. */

const ACCESSORY_KEYS = new Set(ALL_ACCESSORY_OPTIONS.map((o) => o.key));

/* What a card shows so the job is known at a glance: the design photo, the
   fabric, who holds it, the measurements. A per-garment stage reads its own
   garment; an order-level one reads them all. */
function jobGlance(order, stage) {
  const all = order.garment_jobs || [];
  const jobs = stage.garment_job ? all.filter((j) => j.id === stage.garment_job) : all;
  const image = jobs.map((j) => {
    const d = j.selections?.design || {};
    return d.preview
      || Object.values(d.parts || {}).find((p) => p?.image_url)?.image_url
      || Object.values(d.part_refs || {}).flat().find((r) => r?.image_url)?.image_url;
  }).find(Boolean);
  const fabrics = [];
  jobs.forEach((j) => {
    const byId = Object.fromEntries((j.selections?.fabric_items || []).map((f) => [String(f.id), f]));
    Object.entries(j.selections?.fabrics || {}).forEach(([slot, ids]) => {
      if (ACCESSORY_KEYS.has(slot)) return;
      (ids || []).forEach((id) => { const f = byId[String(id)]; if (f && !fabrics.includes(f)) fabrics.push(f); });
    });
  });
  const measurements = jobs.length
    ? jobs.flatMap((j) => measureEntries(j.measurements))
    : [...entries(order.customer_measurements).filter(([k]) => k !== 'id'), ...entries(order.customer_measurements?.additional_measurements)];
  return { image, fabrics, measurements };
}

export default function CardGlance({ order, stage, t }) {
  const { image, fabrics, measurements } = jobGlance(order, stage);
  const shown = measurements.slice(0, 4);
  return (
    <div className="wk-glance">
      {(image || fabrics.length > 0) && (
        <div className="wk-glance-pics">
          {image && <img src={resolveMediaUrl(image)} alt={t('workPage.design', 'Design')} loading="lazy" />}
          {fabrics.slice(0, 2).map((f) => <img key={f.id} className="wk-glance-fabric" src={resolveMediaUrl(inventoryImage(f))} alt={f.name} loading="lazy" />)}
        </div>
      )}
      <div className="wk-glance-text">
        {fabrics.length > 0 && <div><b>{t('workPage.fabric', 'Fabric')}:</b> {fabrics.map((f) => f.name).join(', ')}</div>}
        <div><b>{t('workPage.assigned', 'Assigned')}:</b> {stage.assigned_to_name
          ? `${stage.assigned_to_name}${stage.assigned_to_role ? ` · ${stage.assigned_to_role}` : ''}`
          : t('workPage.notAssigned', 'Not assigned yet')}</div>
        {shown.length > 0 && (
          <div><b>{t('workPage.measurements', 'Measurements')}:</b> {shown.map(([k, v]) => `${humanise(k)} ${v}`).join(' · ')}
            {measurements.length > shown.length && ` +${measurements.length - shown.length}`}</div>
        )}
      </div>
    </div>
  );
}
