import React from 'react';
import { Mic } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext.jsx';
import { isLive, isSettled, rollupStages, currentRow, stageWords, rowToOpen, anyVoiceNote } from './stages';
import { formatDate as fmtDate } from '../../services/format';

/** The order's journey as one table: a numbered step per stage (a per-garment
 *  stage counts once), what state it is in, when it closed, and the one
 *  action that fits. Every row opens its stage. */
export function OrderTaskTable({ stages, jobs = [], focus = null, onSelectStage }) {
  const { t } = useLanguage();
 
  const rows = stages || [];
  const lanes = jobs.filter((j) => rows.some((s) => s.garment_job === j.id));
  const ownRows = (id) => rows.filter((s) => s.garment_job === id);
  const auto = (lanes.find((j) => ownRows(j.id).some(isLive))
    || lanes.find((j) => ownRows(j.id).some((s) => !isSettled(s))) || lanes[0])?.id;
  const [pick, setPick] = React.useState(null);
  
  const locked = lanes.length > 1 && lanes.some((j) => j.id === focus);
  const lane = locked ? focus : lanes.length > 1 ? (lanes.some((j) => j.id === pick) ? pick : auto) : null;
  const steps = lane
    ? rows.filter((s) => !s.garment_job || s.garment_job === lane).sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))
    : rollupStages(stages);
  if (!steps.length) {
    return <div className="od-empty">{t('ordersPage.noProductionStages', 'No production stages recorded for this order.')}</div>;
  }
  const current = currentRow(steps);
  return (
    <>
    {lane && !locked && (
      <div role="tablist" aria-label={t('ordersPage.garmentsInOrder', 'Garments in this order')}
           style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
        {lanes.map((j) => (
          <button key={j.id} type="button" role="tab" aria-selected={j.id === lane}
                  className={`tab-btn${j.id === lane ? ' active' : ''}`} onClick={() => setPick(j.id)}>
            {jobs.indexOf(j) + 1}. {j.display_name || j.template_name || t('ordersPage.garment', 'Garment')}
            {ownRows(j.id).some((s) => s.stage_key.startsWith('maggam')) ? ` · ${t('ordersPage.maggam', 'Maggam')}` : ''}
          </button>
        ))}
      </div>
    )}
    <div className="at-table-wrap od-tasks-wrap">
      <table className="at-table at-table--fit od-tasks">
        <thead>
          <tr>
            <th className="od-tasks-num">#</th>
            <th>{t('ordersPage.taskCol', 'Task')}</th>
            <th>{t('common.status', 'Status')}</th>
            <th>{t('ordersPage.completedOn', 'Completed on')}</th>
            <th style={{ textAlign: 'right' }}>{t('common.actions', 'Actions')}</th>
          </tr>
        </thead>
        <tbody>
          {steps.map((step, i) => {
            const [words, tone] = stageWords(t, step.status);
            const done = isSettled(step);
            const live = isLive(step);
            const open = () => { const row = lane ? step : rowToOpen(stages, step.stage_key); if (row) onSelectStage(row); };
            return (
              <tr key={lane ? step.id || step.stage_key : step.stage_key} className={step === current ? 'od-tasks-row--current' : done ? 'od-tasks-row--done' : ''}
                  onClick={open} style={{ cursor: 'pointer' }}>
                <td className="od-tasks-num">{i + 1}</td>
                <td data-label={t('ordersPage.taskCol', 'Task')}>
                  <span className="od-tasks-name">{step.stage_name}{anyVoiceNote(step) && <Mic size={12} className="oj-mic" aria-label="Voice note" />}</span>
                </td>
                <td data-label={t('common.status', 'Status')}>
                  <span className={`ui-badge ui-badge--${tone}`}>
                    <span className="od-tasks-dot" aria-hidden="true" />{words}
                  </span>
                </td>
                <td data-label={t('ordersPage.completedOn', 'Completed on')} className="od-tasks-when">
                  {step.status === 'COMPLETED' && step.completed_at ? fmtDate(step.completed_at) : '—'}
                </td>
                <td style={{ textAlign: 'right' }}>
                  {live ? (
                    <button type="button" className="btn-primary at-btn-sm" onClick={(e) => { e.stopPropagation(); open(); }}>
                      {t('ordersPage.updateStage', 'Update')}
                    </button>
                  ) : done ? (
                    <button type="button" className="btn-secondary at-btn-sm" onClick={(e) => { e.stopPropagation(); open(); }}>
                      {t('common.view', 'View')}
                    </button>
                  ) : (
                    <span className="od-tasks-when">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    </>
  );
}
