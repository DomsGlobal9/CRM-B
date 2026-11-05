import { Edit2, Eye } from 'lucide-react';
import { Suspense, lazy } from 'react';
import { ALL_ACCESSORY_OPTIONS } from '../designStudio/accessories';
import { resolveMediaUrl } from '../../services/media';
import { AvatarInitials } from '../../components/ui/Atelier';
import { formatMobile, inr } from '../../services/format';
import GarmentSummary from '../catalog/GarmentSummary';
import { SELF_DESIGNER } from '../orders/wizard';
import { voiceNoteList } from '../../components/ui/voiceNotes';
import { VoiceNotePlayer } from '../../components/ui/VoiceTextarea';
import { useLanguage } from '../../i18n/LanguageContext.jsx';

const ReviewLightbox = lazy(() => import('../designStudio/GarmentPartPicker').then(m => ({ default: m.Lightbox })));
const GarmentPreviews = lazy(() => import('../designStudio/GarmentPreview'));

/**
 * Review: everything the order will say, on one page, before it is placed.
 */
export default function ReviewStep({ wizard, customerForm, customerId, customerName, designRequest, designerChoice, designers, fabricTaxonomy, fabrics, garmentJobs, reviewView, serviceType, setActiveGarmentKey, setCustomerForm, setGarmentJobs, setReviewView, wizardSteps }) {
  const { customerBlank, customerProblem, ensureCustomerId, garmentLabel, isMaggamOrder, jumpToStep, selfDesignerLabel } = wizard;
  const { t } = useLanguage();
  const stepOf = (key) => wizardSteps.findIndex(st => st.key === key) + 1;
  const slotLabel = (garmentKey, slotKey) => {
    const g = (fabricTaxonomy?.garments || []).find(x => x.key === garmentKey);
    const slot = (g?.sections || []).flatMap(sec => sec.slots || []).find(sl => sl.key === slotKey);
    return slot?.label || slotKey.replace(/_/g, ' ');
  };
  const rollName = (id) => fabrics.find(f => String(f.id) === String(id))?.name || 'Stock item';

  const card = (title, step, body, extraClass = '') => (
    <div className={`content-card wz-card wz-review-card${extraClass ? ` ${extraClass}` : ''}`} style={{ padding: '16px 20px', gap: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '18px', fontWeight: 500, margin: 0 }}>{title}</h2>
        <button type="button" className="btn-secondary at-btn-sm" onClick={() => {
          if (typeof step === 'string') {
            const first = garmentJobs[0]?.key;
            if (first) setActiveGarmentKey(first);
            jumpToStep(stepOf('type'));
            setTimeout(() => { const sec = document.getElementById(`wz-${step}-${first}`); if (sec) { sec.open = true; sec.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }, 80);
          } else jumpToStep(step);
        }}>
          <Edit2 size={12} /> {t('common.edit', 'Edit')}
        </button>
      </div>
      {body}
    </div>
  );

  const accessoryKeys = new Set(ALL_ACCESSORY_OPTIONS.map(o => o.key));
  const partName = (p, img) => img?.part_label || String(p).replace(/_/g, ' ');
  const withGarment = (job, list) => list.map(pic => ({
    ...pic, label: garmentJobs.length > 1 ? `${job.template?.name || job.key} · ${pic.label}` : pic.label }));
  const stockPics = (job, keep) => Object.entries(job.fabrics || {})
    .filter(([slotKey]) => keep(slotKey))
    .flatMap(([slotKey, ids]) => (ids || [])
      .map(id => fabrics.find(f => String(f.id) === String(id)))
      .filter(f => f?.image_url)
      .map(f => ({ key: `${job.key}:${slotKey}:${f.id}`, image_url: f.image_url,
                   label: `${slotLabel(job.template?.key || job.key, slotKey)} · ${f.name}` })));
  const groups = [
    { key: 'design', title: t('wizard.reviewDesign', 'Design'), items: garmentJobs.flatMap(job => withGarment(job,
      Object.entries(job.design?.parts || {}).filter(([, img]) => img?.image_url)
        .map(([part, img]) => ({ key: `${job.key}:pick:${part}`, image_url: img.image_url,
                                  label: `${partName(part, img)} · ${img.design_title || 'from our catalogue'}` })))) },
    { key: 'fabric', title: t('wizard.sheetFabric', 'Fabric from our stock'), items: garmentJobs.flatMap(job => withGarment(job,
      stockPics(job, k => !accessoryKeys.has(k)))) },
    { key: 'accessories', title: t('wizard.sheetBoutiqueAccessories', 'Boutique Accessories & Trims'), items: garmentJobs.flatMap(job => withGarment(job,
      stockPics(job, k => accessoryKeys.has(k)))) },
    { key: 'customer', title: t('wizard.reviewCustomerPhotos', 'From the customer'), items: garmentJobs.flatMap(job => withGarment(job, [
      ...Object.values(job.design?.part_refs || {}).flat().filter(r => r?.image_url)
        .map(r => ({ key: `${job.key}:ref:${r.id}`, image_url: r.image_url,
                     label: `${partName(r.part, r)} · ${r.design_title || 'reference'}` })),
      ...(job.template?.sections || []).flatMap(sec => sec.fields)
        .filter(f => f.field_type === 'file' && job.values?.[f.key])
        .flatMap(f => (Array.isArray(job.values[f.key]) ? job.values[f.key] : [job.values[f.key]])
          .filter(u => typeof u === 'string')
          .map((u, i) => ({ key: `${job.key}:file:${f.key}:${i}`, image_url: u, label: f.label }))),
    ])) },
  ].filter(g => g.items.length > 0);
  const thumb = (pic, items, i) => (
    <figure key={pic.key} style={{ margin: 0, position: 'relative' }}>
      <img src={resolveMediaUrl(pic.image_url)} alt="" loading="lazy"
           style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: '10px',
                    border: '1px solid var(--border-color)', display: 'block' }} />
      <button type="button" className="btn-secondary at-btn-sm"
              style={{ position: 'absolute', top: '8px', right: '8px', minHeight: '28px', padding: '0 10px' }}
              onClick={() => setReviewView({ items, index: i })}>
        <Eye size={12} /> {t('common.view', 'View')}
      </button>
      <figcaption style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px', lineHeight: 1.3 }}>{pic.label}</figcaption>
    </figure>
  );
  const fabricLines = garmentJobs.flatMap(job =>
    Object.entries(job.fabrics || {}).flatMap(([slotKey, ids]) => (ids || []).map(id => ({
      key: `${job.key}:${slotKey}:${id}`, garment: job.template?.name || job.key,
      part: slotLabel(job.template?.key || job.key, slotKey), name: rollName(id),
      qty: job.fabric_qty?.[`${slotKey}:${id}`],
    }))));
  return (
    <div className="wz-review-layout">
      <div className="page-title-group">
        <h1 className="page-title">{t('wizard.reviewTitle', 'Review and confirm')}</h1>
        <p className="page-subtitle">{t('wizard.reviewSubtitle', 'Everything this order will say. Check it once; the price comes next.')}</p>
      </div>

      <div className="wz-review-grid">
        {/* Left Column: Garments & Last Cards (Fabric, Accessories, Purchases) */}
        <div className="wz-review-col wz-review-col--main">
          {/* Apparel / Garments Card */}
          {card(t('wizard.step.type', 'Apparel'), stepOf('type'), (
            <>
              {isMaggamOrder() && (
                <div className="ui-badge ui-badge--warning" style={{ marginBottom: '10px' }}>
                  {t('wizard.maggamPath', 'Maggam order — goes through paper cutting, embroidery and its verification before the fabric is cut')}
                  {garmentJobs.some(j => !j.values?.hand_work || j.values.hand_work === 'none')
                    && ` ${t('wizard.mixedPath', '· Garments without maggam skip it: cut, then stitch')}`}
                </div>
              )}
              <GarmentSummary jobs={garmentJobs.map(job => ({ key: job.key, template: { ...job.template, name: garmentLabel(job) }, values: job.values || {} }))} />
            </>
          ), 'wz-review-card--main')}

          {/* Last Card(s) kept on left side: Fabric from stock, purchases, accessories, designer */}
          {fabricLines.length > 0 && card(t('wizard.sheetFabric', 'Fabric from our stock'), 'fabric', (
            <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
              <tbody>
                {fabricLines.map(line => (
                  <tr key={line.key} style={{ borderTop: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '8px 0', color: 'var(--text-secondary)' }}>{line.garment} · {line.part}</td>
                    <td style={{ padding: '8px 0', fontWeight: 600 }}>{line.name}</td>
                    <td style={{ padding: '8px 0', textAlign: 'right' }}>{line.qty ? `${line.qty} m` : <span className="od-hint">no quantity</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ), 'wz-review-card--last')}

          {garmentJobs.some(job => (job.purchases || []).length) && card(t('wizard.sheetPurchases', 'To buy for this order'), 'fabric', (
            <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
              <tbody>
                {garmentJobs.flatMap(job => (job.purchases || []).map((row, i) => (
                  <tr key={`${job.key}:${i}`} style={{ borderTop: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '8px 0', color: 'var(--text-secondary)' }}>{garmentLabel(job)}</td>
                    <td style={{ padding: '8px 0', fontWeight: 600 }}>🛒 {row.name}</td>
                    <td style={{ padding: '8px 0', textAlign: 'right' }}>{row.quantity} {(row.unit || 'METER').toLowerCase()} · {inr(row.estimated_cost)} est.</td>
                  </tr>
                )))}
              </tbody>
            </table>
          ), 'wz-review-card--last')}

          {garmentJobs.some(job => Object.keys(job.accessories || {}).length) && card(t('wizard.sheetAccessories', 'Accessories'), 'design', (
            <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
              <tbody>
                {garmentJobs.flatMap(job => Object.entries(job.accessories || {}).map(([key, d]) => (
                  <tr key={`${job.key}:${key}`} style={{ borderTop: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '8px 0', color: 'var(--text-secondary)' }}>
                      {garmentLabel(job)} · {ALL_ACCESSORY_OPTIONS.find(o => o.key === key)?.label || key}
                    </td>
                    <td style={{ padding: '8px 0', fontWeight: 600 }}>
                      {d?.style === 'Other' ? (d.other ? `Other: ${d.other}` : 'Other') : (d?.style || '—')}
                    </td>
                    <td style={{ padding: '8px 0', textAlign: 'right' }}>{d?.measure || <span className="od-hint">no measurement</span>}</td>
                  </tr>
                )))}
              </tbody>
            </table>
          ), 'wz-review-card--last')}

          {serviceType === 'design' && card(t('wizard.designerTitle', 'Who will design it?'), 'design', (
            <div style={{ fontSize: '14px' }}>
              {designerChoice === SELF_DESIGNER ? selfDesignerLabel
                : designers.find(d => String(d.id) === String(designerChoice))?.name || designerChoice || <span className="od-hint">Not picked</span>}
              {designRequest.brief && <div className="od-hint" style={{ marginTop: '4px' }}>{designRequest.brief}</div>}
              {voiceNoteList(designRequest.voice_notes, designRequest.voice_note).map((note, i) => (
                <VoiceNotePlayer key={`${note.url}:${i}`} src={note.url} />
              ))}
            </div>
          ), 'wz-review-card--last')}
        </div>

        {/* Right Column: Customer, Photos & References, Model Preview */}
        <div className="wz-review-col wz-review-col--side">
          {/* Customer Card */}
          {card(t('wizard.step.who', 'Customer'), stepOf('who'), (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <AvatarInitials name={`${customerForm.first_name} ${customerForm.last_name}`} size={40} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{customerForm.first_name} {customerForm.last_name}</div>
                <div className="od-hint">
                  {[formatMobile(customerForm.mobile_number), customerForm.gender, customerForm.city_region].filter(Boolean).join(' · ')}
                </div>
              </div>
            </div>
          ), 'wz-review-card--customer')}

          {/* Photos & references Card */}
          {groups.length > 0 && card(t('wizard.reviewPhotos', 'Photos & references'), 'design', (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {groups.map(group => (
                <section key={group.key}>
                  <div className="ui-eyebrow" style={{ marginBottom: '8px' }}>
                    {group.title} <span className="ui-badge ui-badge--neutral" style={{ marginLeft: '6px' }}>{group.items.length}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))', gap: '8px' }}>
                    {group.items.map((pic, i) => thumb(pic, group.items, i))}
                  </div>
                </section>
              ))}
            </div>
          ), 'wz-review-card--photos')}

          {/* "See it on a model": Right Column Preview Studio */}
          <div className="wz-review-preview">
            <Suspense fallback={null}>
              <GarmentPreviews jobs={garmentJobs} title={t('wizard.reviewPreview', 'See it on a model')}
              customer={{ id: customerId, name: customerName, mobile: customerForm.mobile_number,
                          given: !!customerId || (!customerBlank() && !customerProblem()) }}
              ensureCustomerId={ensureCustomerId}
              onCustomer={() => { jumpToStep(wizardSteps.findIndex(s => s.key === 'who') + 1); window.scrollTo(0, 0); }}
              onPreview={(jobKey, url, backUrl, { presentation, annotations } = {}) => {
                const ai = customerForm.ai_model || {};
                const update = presentation === 'sketch'
                  ? { sketch_preview: url, sketch_labels: annotations || [] }
                  : presentation === 'mannequin'
                    ? { mannequin_preview: url, mannequin_preview_back: backUrl || null }
                    : ai.mode === 'customer' && ai.consent && ai.photo
                      ? { customer_preview: url, customer_preview_back: backUrl || null }
                      : { preview: url, preview_back: backUrl || null };
                setGarmentJobs(prev => prev.map(j => j.key === jobKey
                  ? { ...j, design: { ...(j.design || {}), ...update } } : j));
              }}
              aiModel={customerForm.ai_model}
              onAiModel={(ai_model) => {
                if ((ai_model.photo || '') !== (customerForm.ai_model?.photo || '')) {
                  setGarmentJobs(prev => prev.map(j => (j.design ? { ...j, design: { ...j.design,
                    customer_preview: '', customer_preview_back: null } } : j)));
                }
                setCustomerForm(prev => ({ ...prev, ai_model }));
              }}
              />
            </Suspense>
          </div>

          {/* Customer's AI photos (if applicable) */}
          {customerForm.ai_model?.mode === 'customer' && customerForm.ai_model.consent && customerForm.ai_model.photo
            && card(t('wizard.reviewOnCustomer', 'AI pictures on the customer'), 'design', (
            <Suspense fallback={null}>
              <GarmentPreviews jobs={garmentJobs} customerPhoto={customerForm.ai_model.photo}
                customer={{ id: customerId, given: true }} ensureCustomerId={ensureCustomerId}
                onPreview={(jobKey, url, backUrl) => setGarmentJobs(prev => prev.map(j => j.key === jobKey
                  ? { ...j, design: { ...(j.design || {}), customer_preview: url, customer_preview_back: backUrl || null } } : j))} />
            </Suspense>
          ), 'wz-review-extra')}
        </div>
      </div>

      {reviewView && (
        <Suspense fallback={null}>
          <ReviewLightbox items={reviewView.items} index={reviewView.index}
                          onIndexChange={(i) => setReviewView({ ...reviewView, index: i })}
                          onClose={() => setReviewView(null)} />
        </Suspense>
      )}
    </div>
  );
}
