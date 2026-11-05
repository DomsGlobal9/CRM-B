import { X } from 'lucide-react';
import { todayIso } from '../../utils/dates';
import TemplateForm from '../catalog/TemplateForm';
import { LIMITS, cleanAmount } from '../../utils/validate';
import { inr } from '../../utils/format';
import { useLanguage } from '../../i18n/LanguageContext.jsx';

/**
 * Complete the order: when it is promised for, what it costs (garments,
 * materials, packaging, discount, GST), and what was paid now.
 */
export default function MoneyStep({ wizard, advancePaymentAmount, garmentErrors, garmentJobs, getTaxes, getTotalPrice, jobExtras, jobMaterialCharges, quotePrices, readyBy, serviceType, setAdvancePaymentAmount, setQuotePrices, setReadyBy, setWizardError, wizardError }) {
  const { handleFabricQuantity, setJobExtra, setJobPrice, updateGarmentPurchase, updateGarmentValues } = wizard;
  const { t } = useLanguage();
  return (
    <>
      <div className="page-title-group">
        <h1 className="page-title">{t('wizard.moneyTitle', 'Complete the order & invoice')}</h1>
        <p className="page-subtitle">{t('wizard.moneySubtitle', 'A price per garment, the date it is promised for, and anything paid now.')}</p>
      </div>

      {wizardError && (
        <div role="alert" className="wz-error">
          <span>{wizardError}</span>
          <button type="button" className="btn-ghost at-btn-sm" onClick={() => setWizardError(null)} aria-label={t('common.dismiss', 'Dismiss')}><X size={14} /></button>
        </div>
      )}

      <div className="content-card wz-card wz-money-card">
        <div className="form-group" style={{ maxWidth: '260px' }}>
          <label className="form-label" htmlFor="wz-ready">{t('wizard.readyBy', 'Ready by')} <span className="required">*</span></label>
          <input id="wz-ready" type="date" className="form-control" value={readyBy} min={todayIso()}
                 onChange={(e) => setReadyBy(e.target.value)} />
        </div>

        {/* Each garment's optional questions (urgency, trial and the
            like), here beside the date and the price they bear on. */}
        {garmentJobs.map((job) => {
          const sections = ['basic', 'style'].filter((k) => job.template.sections.some((sec) => sec.key === k));
          const foldedAway = (f) => f.key !== 'delivery_date' && !f.is_required && !f.visible_when;
          const hasOptional = sections.some((k) => (job.template.sections.find((sec) => sec.key === k)?.fields || []).some((f) => foldedAway(f) && f.field_type !== 'file'));
          if (!hasOptional) return null;
          return (
            <details key={job.key} className="wz-more" style={{ marginBottom: '12px' }}>
              <summary>{garmentJobs.length > 1 ? `${job.template.name} · ` : ''}{t('wizard.moreDetails', 'More details')} <span className="od-hint">({t('common.optional', 'optional')})</span></summary>
              {sections.map((sectionKey) => (
                <div key={sectionKey} className="wz-garment-section">
                  <TemplateForm template={job.template} section={sectionKey} values={job.values}
                                errors={garmentErrors[job.key] || {}} only={foldedAway}
                                purchases={job.purchases || []} onPurchaseChange={(fieldKey, row) => updateGarmentPurchase(job.key, fieldKey, row)}
                                onChange={(values) => updateGarmentValues(job.key, values)} />
                </div>
              ))}
            </details>
          );
        })}

        {/* "Price not decided yet": the order is placed without
            prices, which are added on the order page later. */}
        <label className="wz-price-later" style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '4px 0 12px', fontSize: '14px', cursor: 'pointer' }}>
          <input type="checkbox" checked={Boolean(quotePrices.price_later)}
                 onChange={(e) => setQuotePrices({ ...quotePrices, price_later: e.target.checked })} />
          {t('wizard.priceLater', 'Price not decided yet')}
        </label>
        <div className="wz-money">
          {quotePrices.price_later ? (
            <div className="od-hint" style={{ marginBottom: '4px' }}>
              {t('wizard.priceLaterHint', 'The prices are added on the order later (Prices). No invoice is sent to the customer until then.')}
            </div>
          ) : (
          <>
          {garmentJobs.map((job) => (
            <div key={job.key} className="wz-money-row">
              <label htmlFor={`wz-price-${job.key}`} className="wz-money-label">{job.template.name}</label>
              <div className="wz-money-input">
                <span>₹</span>
                <input id={`wz-price-${job.key}`} type="number" min="0" max={LIMITS.amount} step="1" inputMode="decimal" className="form-control"
                       value={job.pricing?.base ?? ''} placeholder={serviceType === 'design' ? t('wizard.quoteLater', 'quote later') : '0'}
                       onChange={(e) => setJobPrice(job.key, 'base', cleanAmount(e.target.value))} />
              </div>
            </div>
          ))}
          {garmentJobs.flatMap((job) => jobExtras(job).map(([key, label]) => (
            <div key={`${job.key}-${key}`} className="wz-money-row">
              <label htmlFor={`wz-extra-${job.key}-${key}`} className="wz-money-label" style={{ paddingLeft: '16px' }}>
                {job.template.name} · {label} <span className="od-hint">({t('wizard.extraWork', 'extra work')})</span>
              </label>
              <div className="wz-money-input">
                <span>₹</span>
                <input id={`wz-extra-${job.key}-${key}`} type="number" min="0" max={LIMITS.amount} step="1" inputMode="decimal" className="form-control"
                       value={job.pricing?.extras?.[key] ?? ''} placeholder="0"
                       onChange={(e) => setJobExtra(job.key, key, cleanAmount(e.target.value))} />
              </div>
            </div>
          )))}
          {/* Fabric and accessories from our stock: the amount is
              entered here, once the measurements are in; the price is
              that amount × the item's selling price from Inventory. */}
          {garmentJobs.flatMap((job) => jobMaterialCharges(job).map((line) => {
            const unit = !line.item?.unit || line.item.unit === 'METER' ? 'm' : line.item.unit === 'PIECE' ? 'pcs' : String(line.item.unit).toLowerCase();
            return (
              <div key={`${job.key}-${line.key}`} className="wz-money-row">
                <span className="wz-money-label" style={{ paddingLeft: '16px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span>
                    {job.template.name} · {line.item?.name || t('wizard.stockItem', 'Stock item')}{' '}
                    <span className="od-hint">
                      ({line.item?.is_accessory ? t('wizard.accessory', 'accessory') : t('wizard.fabric', 'fabric')} · {line.rate ? `${inr(line.rate)}/${unit}` : t('wizard.noPriceSet', 'no price set')})
                    </span>
                  </span>
                  {line.editable ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <input inputMode="decimal" className="form-control" style={{ width: '80px', padding: '4px 8px' }}
                             placeholder={unit === 'm' ? t('wizard.metres', 'metres') : t('wizard.qty', 'qty')}
                             aria-label={`${line.item?.name || ''} · ${unit}`}
                             value={line.quantity}
                             onChange={(e) => handleFabricQuantity(job.key, line.slot, line.id, cleanAmount(e.target.value, { max: LIMITS.quantity, decimals: 3 }))} />
                      <span className="od-hint">{unit}</span>
                    </span>
                  ) : (
                    <span className="od-hint">{line.quantity} {unit}</span>
                  )}
                </span>
                <div className="wz-money-input">
                  <span>₹</span>
                  <input type="number" className="form-control" value={line.amount} readOnly tabIndex={-1}
                         aria-label={`${job.template.name} · ${line.item?.name || ''}`} />
                </div>
              </div>
            );
          }))}
          <div className="wz-money-row">
            <label htmlFor="wz-packaging" className="wz-money-label">{t('wizard.packaging', 'Packaging & handling')}</label>
            <div className="wz-money-input">
              <span>₹</span>
              <input id="wz-packaging" type="number" min="0" max={LIMITS.amount} step="1" inputMode="decimal" className="form-control"
                     value={quotePrices.packaging ?? ''} onChange={(e) => setQuotePrices({ ...quotePrices, packaging: cleanAmount(e.target.value) })} />
            </div>
          </div>
          <div className="wz-money-row">
            <label htmlFor="wz-discount" className="wz-money-label">{t('wizard.discount', 'Discount')} <span className="od-hint">({t('common.optional', 'optional')})</span></label>
            <div className="wz-money-input">
              <span>₹</span>
              <input id="wz-discount" type="number" min="0" max={LIMITS.amount} step="1" inputMode="decimal" className="form-control"
                     value={quotePrices.discount || ''} placeholder="0" onChange={(e) => setQuotePrices({ ...quotePrices, discount: cleanAmount(e.target.value) })} />
            </div>
          </div>
          <div className="wz-money-row">
            <label htmlFor="wz-gst" className="wz-money-label">{t('wizard.gstInput', 'GST')} <span className="od-hint">({t('common.optional', 'optional')})</span></label>
            <div className="wz-money-input">
              <select className="form-control" aria-label={t('wizard.gstAs', 'GST as')} style={{ width: '64px', textAlign: 'left' }}
                      value={quotePrices.gst_mode || 'percent'}
                      onChange={(e) => setQuotePrices({ ...quotePrices, gst_mode: e.target.value,
                        gst_value: cleanAmount(quotePrices.gst_value, { max: e.target.value === 'amount' ? LIMITS.amount : 100 }) })}>
                <option value="percent">%</option>
                <option value="amount">₹</option>
              </select>
              <input id="wz-gst" type="number" min="0" max={quotePrices.gst_mode === 'amount' ? LIMITS.amount : 100} step="0.01" inputMode="decimal" className="form-control"
                     value={quotePrices.gst_value || ''} placeholder="0"
                     onChange={(e) => setQuotePrices({ ...quotePrices, gst_value: cleanAmount(e.target.value, { max: quotePrices.gst_mode === 'amount' ? LIMITS.amount : 100 }) })} />
            </div>
          </div>
          <div className="wz-money-total">
            <div><span>{quotePrices.gst_mode !== 'amount' && parseFloat(quotePrices.gst_value || 0) > 0 ? `GST ${parseFloat(quotePrices.gst_value)}%` : 'GST'}</span><strong>{inr(getTaxes())}</strong></div>
            <div className="wz-money-grand"><span>{t('wizard.total', 'Total')}</span><strong>{inr(getTotalPrice())}</strong></div>
          </div>
          </>
          )}
          <div className="wz-money-row">
            <label htmlFor="wz-advance" className="wz-money-label">{t('wizard.advanceNow', 'Advance paid now')}</label>
            <div className="wz-money-input">
              <span>₹</span>
              <input id="wz-advance" type="number" min="0" max={LIMITS.amount} step="1" inputMode="decimal" className="form-control"
                     value={advancePaymentAmount || ''} placeholder="0"
                     onChange={(e) => setAdvancePaymentAmount(cleanAmount(e.target.value))} />
            </div>
          </div>
          <div className="od-hint" style={{ textAlign: 'right' }}>
            {quotePrices.price_later
              ? t('wizard.balanceWhenPriced', 'The balance is worked out when the prices are added.')
              : Number(advancePaymentAmount) >= getTotalPrice() && getTotalPrice() > 0
              ? t('wizard.paidInFull', 'Paid in full')
              : `${t('wizard.balanceAtDelivery', 'Balance at delivery')}: ${inr(Math.max(0, getTotalPrice() - Number(advancePaymentAmount || 0)))}`}
          </div>
        </div>
        <p className="od-hint" style={{ marginTop: '14px' }}>
          {t('wizard.termsPrinted', 'The boutique’s terms are printed on the invoice the customer receives.')}
        </p>
      </div>
    </>
  );
}
