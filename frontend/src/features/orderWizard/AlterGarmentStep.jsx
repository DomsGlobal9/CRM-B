import { Check, Shirt } from 'lucide-react';
import { IconTile } from '../../components/ui/Atelier';
import { formatDate as fmtDate, orderRef } from '../../utils/format';
import { useLanguage } from '../../i18n/LanguageContext.jsx';

/**
 * Alteration, screen 2: which garment we made (one we delivered to this customer).
 */
export default function AlterGarmentStep({ wizard, alterationForm, setAlterOutside, setAlterationForm }) {
  const { alterCandidates, alterPick } = wizard;
  const { t } = useLanguage();
  return (
    <>
      <div className="page-title-group">
        <h1 className="page-title">{t('wizard.alterGarmentTitle', 'Which garment?')}</h1>
        <p className="page-subtitle">{t('wizard.alterGarmentSubtitle', 'One of the garments we delivered to this customer.')}</p>
      </div>
      <div className="content-card wz-card">
        {alterCandidates.length === 0 ? (
          <div className="od-empty" style={{ textAlign: 'left' }}>
            {t('wizard.noDeliveredGarmentsOutside', 'Nothing we made has been delivered to this customer yet. If the garment was stitched elsewhere, take it in under')}{' '}
            <button type="button" className="at-link" onClick={() => setAlterOutside(true)}>
              {t('wizard.alterOutside', 'Stitched elsewhere')}
            </button>.
          </div>
        ) : (
          <div className="wz-choices" role="radiogroup" aria-label={t('wizard.alterGarmentTitle', 'Which garment?')}>
            {alterCandidates.map(({ order, job }) => {
              const picked = alterPick?.job.id === job.id;
              return (
                <button type="button" key={job.id} role="radio" aria-checked={picked}
                        className={`wz-choice${picked ? ' wz-choice--on' : ''}`}
                        onClick={() => setAlterationForm({ ...alterationForm, orderId: order.order_id, garmentJobId: job.id })}>
                  <IconTile icon={Shirt} tone={picked ? 'green' : 'neutral'} size={40} iconSize={18} />
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span className="wz-match-name">{job.display_name || job.template_name || t('wizard.garment', 'Garment')}</span>
                    <span className="od-hint" style={{ display: 'block' }}>
                      {t('wizard.order', 'Order')} {orderRef(order)}{order.estimated_delivery ? ` · ${t('wizard.delivered', 'delivered')} ${fmtDate(order.estimated_delivery)}` : ''}
                    </span>
                  </span>
                  {picked && <Check size={18} />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
