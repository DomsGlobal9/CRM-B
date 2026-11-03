import { X } from 'lucide-react';
import { Dropzone } from '../../components/ui/Atelier';
import { useLanguage } from '../../i18n/LanguageContext.jsx';

/**
 * Outside garment, screen 2: the garment brought in (stitched elsewhere), and
 * its photo as it arrived. There is no order of ours to pick it from.
 */
export default function OutsideGarmentStep({ garmentTemplates, outsideForm, outsidePhoto, setOutsideForm, setOutsidePhoto }) {
  const { t } = useLanguage();
  return (
    <div className="wz-who-wrap">
      <div className="page-title-group">
        <h1 className="page-title">{t('wizard.outGarmentTitle', 'What garment is it?')}</h1>
        <p className="page-subtitle">{t('wizard.outGarmentSubtitle', 'Stitched elsewhere. Say what it is, and take a photo of it as it came in.')}</p>
      </div>
      <div className="content-card wz-card wz-who">
        <div className="wz-who-row">
          <div className="form-group">
            <label className="form-label" htmlFor="wz-out-type">{t('wizard.outGarmentType', 'Garment type')}</label>
            <select id="wz-out-type" className="form-control" value={outsideForm.templateId}
                    onChange={(e) => setOutsideForm({ ...outsideForm, templateId: e.target.value })}>
              <option value="">{t('wizard.outGarmentOther', 'Other (describe it)')}</option>
              {garmentTemplates.map((tpl) => <option key={tpl.id} value={tpl.id}>{tpl.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="wz-out-note">
              {t('wizard.outGarmentNote', 'About the garment')}{' '}
              {outsideForm.templateId
                ? <span className="od-hint">({t('common.optional', 'optional')})</span>
                : <span className="required">*</span>}
            </label>
            <input id="wz-out-note" className="form-control" maxLength={200} value={outsideForm.note}
                   onChange={(e) => setOutsideForm({ ...outsideForm, note: e.target.value })}
                   placeholder={t('wizard.outGarmentNotePlaceholder', 'e.g. Green silk blouse, bought in Chennai')} />
          </div>
        </div>
        <div className="form-group">
          <span className="form-label">{t('wizard.outPhoto', 'Photo as it came in')} <span className="required">*</span></span>
          {outsidePhoto ? (
            <div className="wz-out-photo">
              <img src={outsidePhoto.url} alt={t('wizard.outPhotoAlt', 'The garment as it came in')} />
              <div className="wz-out-photo-meta">
                <span className="wz-out-photo-name">{outsidePhoto.file.name}</span>
                <button type="button" className="btn-secondary at-btn-sm" onClick={() => setOutsidePhoto(null)}>
                  <X size={13} /> {t('common.remove', 'Remove')}
                </button>
              </div>
            </div>
          ) : (
            <Dropzone compact camera
                      onFiles={([file]) => {
                        if (!file) return;
                        setOutsidePhoto({ file, url: URL.createObjectURL(file) });
                      }}
                      title={t('wizard.outPhotoDrop', 'Drop a photo here')}
                      subtitle={t('wizard.outPhotoOr', 'or choose a photo')}
                      chooseLabel={t('wizard.outPhotoChoose', 'Choose photo')} />
          )}
        </div>
      </div>
    </div>
  );
}
