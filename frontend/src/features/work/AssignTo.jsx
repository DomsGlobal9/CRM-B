import { useEffect, useState } from 'react';
import { api } from '../../api';
import { useLanguage } from '../../i18n/LanguageContext.jsx';
import { ASSIGN_ONLY_TO } from '../../constants/roles';

/** Handing a job to someone else. */

/* A Master hands their job to someone else. The server's roster already
   leaves out the Owner and Designers; this only narrows it to who may hold
   this stage, and drops the Master themselves. */
export default function AssignTo({ order, stage, me, stageRoles, onDone }) {
  const { t } = useLanguage();
  const [staff, setStaff] = useState(null);
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getAssignableStaff().then(setStaff).catch((e) => setError(e?.message || t('workPage.staffFailed', 'Could not load staff.')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Hemming & finishing goes only to the Hemming & Pressing Staff.
  const only = ASSIGN_ONLY_TO[stage.stage_key];
  const options = (staff || []).filter((s) => s.id !== me
    && (only ? only.includes(s.role) : (!stageRoles.length || stageRoles.includes(s.role))));

  const assign = async () => {
    const who = options.find((s) => String(s.id) === pick);
    setBusy(true); setError('');
    try {
      await api.assignStage(order.id, stage.stage_key, who.id, stage.garment_job || null);
      onDone(t('workPage.assignedToast', 'Assigned to {who}.', { who: who.name }));
    } catch (e) {
      setError(e?.message || t('workPage.assignFailed', 'Could not assign. Please try again.'));
    } finally { setBusy(false); }
  };

  return (
    <section className="wk-section">
      <h3 className="wk-section-title">{t('workPage.assignTo', 'Assign to')}</h3>
      {staff && options.length === 0
        ? <div className="wk-quiet">{only
            ? t('workPage.noHemmingStaff', 'No Hemming & Pressing Staff yet. Add one in Staff to hand this step on.')
            : t('workPage.noOneToAssign', 'No one else can take this step.')}</div>
        : (
          <div className="wk-pickers">
            <select className="form-control" value={pick} disabled={busy || !staff} onChange={(e) => setPick(e.target.value)}
                    aria-label={t('workPage.assignTo', 'Assign to')}>
              <option value="">{staff ? t('workPage.pickWorker', 'Choose a worker') : t('workPage.loading', 'Loading…')}</option>
              {options.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.role}</option>)}
            </select>
            <button type="button" className="btn-secondary" disabled={busy || !pick} onClick={assign}>
              {busy ? t('workPage.saving', 'Saving…') : t('workPage.assign', 'Assign')}
            </button>
          </div>
        )}
      {error && <div className="wk-error" role="alert">{error}</div>}
    </section>
  );
}
