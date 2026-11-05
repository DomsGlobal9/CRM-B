import React from 'react';
import { Mic } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext.jsx';
import { isLive, isSettled, rollupStages, currentRow, stageWords, rowToOpen, anyVoiceNote } from './stages';
import { formatDate as fmtDate } from '../../services/format';
import { DataTable } from '../../components/ui/DataTable';

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
  const openStep = (step) => { const row = lane ? step : rowToOpen(stages, step.stage_key); if (row) onSelectStage(row); };
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
    <DataTable
      wrapClassName="od-tasks-wrap"
      tableClassName="od-tasks"
      rows={steps}
      rowKey={(step) => (lane ? step.id || step.stage_key : step.stage_key)}
      rowClassName={(step) => (step === current ? 'od-tasks-row--current' : isSettled(step) ? 'od-tasks-row--done' : '')}
      onRowClick={openStep}
      columns={[
        { key: 'num', header: '#', label: false, className: 'od-tasks-num', render: (step, i) => i + 1 },
        { key: 'task', header: t('ordersPage.taskCol', 'Task'), render: (step) => (
          <span className="od-tasks-name">{step.stage_name}{anyVoiceNote(step) && <Mic size={12} className="oj-mic" aria-label="Voice note" />}</span>
        ) },
        { key: 'status', header: t('common.status', 'Status'), render: (step) => {
          const [words, tone] = stageWords(t, step.status);
          return (
            <span className={`ui-badge ui-badge--${tone}`}>
              <span className="od-tasks-dot" aria-hidden="true" />{words}
            </span>
          );
        } },
        { key: 'when', header: t('ordersPage.completedOn', 'Completed on'), cellClassName: 'od-tasks-when',
          render: (step) => (step.status === 'COMPLETED' && step.completed_at ? fmtDate(step.completed_at) : '—') },
        { key: 'action', header: t('common.actions', 'Actions'), label: false, align: 'right', render: (step) => (
          isLive(step) ? (
            <button type="button" className="btn-primary at-btn-sm" onClick={(e) => { e.stopPropagation(); openStep(step); }}>
              {t('ordersPage.updateStage', 'Update')}
            </button>
          ) : isSettled(step) ? (
            <button type="button" className="btn-secondary at-btn-sm" onClick={(e) => { e.stopPropagation(); openStep(step); }}>
              {t('common.view', 'View')}
            </button>
          ) : (
            <span className="od-tasks-when">—</span>
          )
        ) },
      ]}
    />
    </>
  );
}
