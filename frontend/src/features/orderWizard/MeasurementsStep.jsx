import { Ruler } from 'lucide-react';
import { getCustomerMeasurement } from '../catalog/measurements';
import { Field, IconTile } from '../../components/ui/Atelier';
import TemplateForm from '../catalog/TemplateForm';
import ExtraMeasurements from '../catalog/ExtraMeasurements';
import { EXTRA_MEASUREMENTS } from '../catalog/templates';
import VoiceTextarea, { VoiceRecorder } from '../../components/ui/VoiceTextarea';
import { LIMITS } from '../../utils/validate';
import { api } from '../../api';
import { useLanguage } from '../../i18n/LanguageContext.jsx';
import { useApp } from '../../context/AppContext';

/**
 * Measurements: only the fields each garment's cut asks for, prefilled from
 * the customer's last ones.
 */
export default function MeasurementsStep({ wizard, customerForm, garmentErrors, garmentJobs, measureVoiceNotes, setMeasureVoiceNotes, setSpecialInstructions, specialInstructions }) {
  const { garmentLabel, needsMeasurements, updateGarmentValues } = wizard;
  const { t } = useLanguage();
  const { currentUser } = useApp();
  return (
    <>
      <div className="page-title-group">
        <h1 className="page-title">{t('wizard.measurements', 'Measurements')}</h1>
        <p className="page-subtitle">{t('wizard.measurementsSubtitle', 'Body measurements for every garment on this order. Each one asks only for what its cut needs.')}</p>
      </div>
      {garmentJobs.map((job) => {
        const section = job.template.sections.find((sec) => sec.key === 'measurements');
        if (!section) return null;

        const customerM = customerForm?.measurements || {};
        const mergedValues = { ...job.values };
        let autoPrefilled = false;
        (section.fields || []).forEach((f) => {
          if ((mergedValues[f.key] === undefined || mergedValues[f.key] === null || mergedValues[f.key] === '') && f.unit) {
            const fetched = getCustomerMeasurement(customerM, f.key);
            if (fetched !== undefined && fetched !== null && fetched !== '') {
              mergedValues[f.key] = fetched;
              autoPrefilled = true;
            }
          }
        });

        const numeric = (section.fields || []).filter((f) => f.field_type === 'number' && !f.validation?.group);
        const filledCount = numeric.filter((f) => mergedValues[f.key] !== undefined && mergedValues[f.key] !== null && mergedValues[f.key] !== '').length;
        return (
          <div className="content-card wz-card wz-measure-card" key={job.key} id={`wz-garment-${job.key}`}>
            <div className="wz-measure-head">
              <IconTile icon={Ruler} tone="green" size={36} iconSize={18} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="wz-measure-title">{garmentLabel(job)}</div>
                {numeric.length > 0 && (
                  <div className="od-hint">
                    {t('wizard.measuredOf', '{done} of {total} measured, in inches', { done: filledCount, total: numeric.length })}
                  </div>
                )}
              </div>
              {autoPrefilled && (
                <span className="wz-measure-loaded">✓ {t('wizard.measurementsLoaded', 'Last measurements loaded')}</span>
              )}
            </div>
            <TemplateForm
              template={job.template}
              section="measurements"
              values={mergedValues}
              errors={garmentErrors[job.key] || {}}
              onChange={(values) => updateGarmentValues(job.key, values)}
              only={(f) => f.field_type !== 'textarea'}
            />
            {/* The measurements added by hand sit with the figures, before the notes. */}
            <ExtraMeasurements values={mergedValues} error={garmentErrors[job.key]?.[EXTRA_MEASUREMENTS]}
                               onChange={(values) => updateGarmentValues(job.key, values)} />
            {(section.fields || []).some((f) => f.field_type === 'textarea') && (
              <div style={{ marginTop: '14px' }}>
                <TemplateForm
                  template={job.template}
                  section="measurements"
                  values={mergedValues}
                  errors={garmentErrors[job.key] || {}}
                  onChange={(values) => updateGarmentValues(job.key, values)}
                  only={(f) => f.field_type === 'textarea'}
                />
              </div>
            )}
          </div>
        );
      })}
      {!needsMeasurements() && (
        <div className="content-card wz-card od-hint">{t('wizard.nothingToMeasure', 'Nothing to measure for these garments.')}</div>
      )}

      {/* The same recorder the workflow's stage review uses: record,
          hear it back, Send keeps it under the sender's name, Delete
          throws it away. Sent here means uploaded and held on the
          draft; it lands on the order at confirm. */}
      <div className="content-card wz-card wz-measure-notes">
        <Field label={t('wizard.notesForTailor', 'Notes for the tailor')}>
          {/* The same note the "What" screen asks for; one field, two doors. */}
          <VoiceTextarea className="form-control" rows={3} value={specialInstructions} maxLength={LIMITS.note}
                         onChange={(e) => setSpecialInstructions(e.target.value)}
                         placeholder={t('wizard.notesPlaceholder', 'e.g. padding, side zip, extra margin at the waist')} />
          <VoiceRecorder
            notes={measureVoiceNotes}
            onSend={async (blob) => {
              const url = await api.uploadVoiceNote(blob);
              const by = [currentUser?.first_name, currentUser?.last_name].filter(Boolean).join(' ') || currentUser?.name || currentUser?.email || '';
              setMeasureVoiceNotes(prev => [...prev, { url, by, at: new Date().toISOString() }]);
            }}
            onDelete={(index) => setMeasureVoiceNotes(prev => prev.filter((_, i) => i !== index))}
          />
        </Field>
      </div>
    </>
  );
}
