/* One garment, configured the way the order wizard configures one.

   The same four pieces the wizard's Apparel, Design, Fabric and Measurements
   steps use -- TemplateForm for the template's own sections, GarmentPartPicker
   for the look part by part, GarmentFabricPicker for the cloth slot by slot --
   gathered onto one panel because a run for stock has no customer to walk
   through eight steps for. What it hands back is a garment in the shape the
   order draft uses, so the server stores it exactly as it stores a customer's.
*/
import { lazy, Suspense, useMemo, useState } from 'react';
import { Layers, Package, PenTool, Ruler, Shirt } from 'lucide-react';

import TemplateForm from '../catalog/TemplateForm';
import GarmentPurchases from '../catalog/GarmentPurchases';
import { getSection } from '../../services/templates';
import { useFabricTaxonomy } from '../fabrics/taxonomy';

const GarmentPartPicker = lazy(() => import('../designStudio/GarmentPartPicker'));
const GarmentFabricPicker = lazy(() => import('../fabrics/GarmentFabricPicker'));

const Loading = () => (
  <p className="od-hint" style={{ margin: '10px 0' }}>Loading…</p>
);

function Fold({ icon: Icon, title, children, open = false }) {
  return (
    <details className="wz-more" open={open}>
      <summary><Icon size={14} /> {title}</summary>
      {children}
    </details>
  );
}

/** `value`: { values, fabrics, fabric_qty, design, purchases }. */
export default function GarmentConfigurator({ template, fabrics = [], value, onChange, errors = {} }) {
  const taxonomy = useFabricTaxonomy();
  const [key] = useState(() => `bp-${Math.random().toString(36).slice(2, 9)}`);

  const set = (patch) => onChange({ ...value, ...patch });

  // GarmentFabricPicker and GarmentPartPicker are written for the wizard's
  // several garments at once, so they are handed this one under its own key.
  const job = useMemo(() => ({ key, template, values: value.values || {} }), [key, template, value.values]);
  const selection = useMemo(() => ({ [key]: value.fabrics || {} }), [key, value.fabrics]);
  const quantities = useMemo(() => ({ [key]: value.fabric_qty || {} }), [key, value.fabric_qty]);

  const sections = ['basic', 'style'].filter((s) => (template.sections || []).some((sec) => sec.key === s));
  const upFront = (f) => f.key !== 'delivery_date' && (f.is_required || Boolean(f.visible_when));
  const foldedAway = (f) => f.key !== 'delivery_date' && !upFront(f);
  const hasOptional = sections.some((s) => (
    (template.sections.find((sec) => sec.key === s)?.fields || [])
      .some((f) => foldedAway(f) && f.field_type !== 'file')));
  const measures = (getSection(template, 'measurements')?.fields || []).length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {sections.map((sectionKey) => (
        <div key={sectionKey} className="wz-garment-section">
          <TemplateForm template={template} section={sectionKey} values={value.values || {}}
                        errors={errors} only={upFront}
                        purchases={value.purchases || []}
                        onPurchaseChange={(fieldKey, row) => set({
                          purchases: [...(value.purchases || []).filter((r) => r.field_key !== fieldKey),
                                      ...(row ? [{ ...row, field_key: fieldKey }] : [])],
                        })}
                        onChange={(values) => set({ values })} />
        </div>
      ))}

      <div className="wz-garment-section">
        <TemplateForm template={template} section="production" values={value.values || {}}
                      errors={errors} only={(f) => f.key === 'special_instructions'}
                      onChange={(values) => set({ values })} />
      </div>

      {hasOptional && (
        <Fold icon={Shirt} title="More details about the garment">
          {sections.map((sectionKey) => (
            <div key={sectionKey} className="wz-garment-section">
              <TemplateForm template={template} section={sectionKey} values={value.values || {}}
                            errors={errors} only={foldedAway}
                            purchases={value.purchases || []}
                            onChange={(values) => set({ values })} />
            </div>
          ))}
        </Fold>
      )}

      <Fold icon={PenTool} title="The look, part by part">
        <Suspense fallback={<Loading />}>
          <GarmentPartPicker garmentKey={template.key} garmentName={template.name}
                             selection={(value.design || {}).parts || {}}
                             onChange={(parts) => set({ design: { ...(value.design || {}), parts } })} />
        </Suspense>
      </Fold>

      <Fold icon={Layers} title="Fabric from our stock" open>
        <Suspense fallback={<Loading />}>
          {fabrics.length === 0 ? (
            <p className="od-hint" style={{ margin: '10px 0 0' }}>
              No fabric in stock yet. The workroom can pick a roll later.
            </p>
          ) : (
            <GarmentFabricPicker
              garmentJobs={[job]} fabrics={fabrics} taxonomy={taxonomy}
              selection={selection} quantities={quantities}
              onChange={(_, next) => set({ fabrics: next })}
              onQuantityChange={(_, slot, fabricId, quantity) => set({
                fabric_qty: { ...(value.fabric_qty || {}), [`${slot}:${fabricId}`]: quantity },
              })} />
          )}
        </Suspense>
      </Fold>

      <Fold icon={Package} title="Trims & accessories">
        <Suspense fallback={<Loading />}>
          <GarmentFabricPicker
            garmentJobs={[job]} fabrics={fabrics} taxonomy={taxonomy}
            selection={selection} quantities={quantities}
            onChange={(_, next) => set({ fabrics: next })}
            onQuantityChange={(_, slot, fabricId, quantity) => set({
              fabric_qty: { ...(value.fabric_qty || {}), [`${slot}:${fabricId}`]: quantity },
            })}
            accessoriesOnly />
        </Suspense>
      </Fold>

      <Fold icon={Package} title="To buy for this run">
        <GarmentPurchases rows={value.purchases || []} onChange={(purchases) => set({ purchases })} />
      </Fold>

      {measures && (
        <Fold icon={Ruler} title="Measurements">
          <TemplateForm template={template} section="measurements" values={value.values || {}}
                        errors={errors} onChange={(values) => set({ values })} />
        </Fold>
      )}
    </div>
  );
}
