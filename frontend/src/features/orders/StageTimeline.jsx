import { Mic, ChevronDown } from 'lucide-react';
import React from 'react';
import { useLanguage } from '../../i18n/LanguageContext.jsx';
import { isSettled, isLive, currentRow, anyVoiceNote, stageLanes } from './stages';

/** One task line: a plain mark, the name, and what state it is in, in words. */
function JourneyTask({ stage, current, onSelect, hasVoiceNote }) {
  const { t } = useLanguage();
  const done = isSettled(stage);
  const live = isLive(stage);
  const words = stage.status === 'COMPLETED' ? t('ordersPage.taskDone', 'Completed')
    : stage.status === 'SKIPPED' ? t('ordersPage.taskSkipped', 'Skipped')
    : stage.status === 'PENDING_VERIFICATION' ? t('ordersPage.taskWaitingCheck', 'Waiting for check')
    : stage.status === 'PAUSED' ? t('ordersPage.taskPaused', 'Paused')
    : live ? t('ordersPage.taskLive', 'In progress')
    : t('ordersPage.taskNotStarted', 'Not started');
  const shortDate = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return (
    <button type="button" className={`oj-task${done ? ' oj-task--done' : ''}${current ? ' oj-task--current' : ''}`}
            onClick={() => onSelect(stage)}
            title={`${stage.stage_name} — ${words}`}>
      <span className="oj-mark" aria-hidden="true">{done ? '✓' : live ? '●' : '○'}</span>
      <span className="oj-task-name">
        {stage.stage_name}
        {hasVoiceNote(stage) && <Mic size={12} className="oj-mic" aria-label="Voice note" />}
      </span>
      <span className="oj-task-state">
        {words}{stage.status === 'COMPLETED' && stage.completed_at ? ` · ${shortDate(stage.completed_at)}` : ''}
      </span>
      {current && <span className="oj-task-now">← {t('ordersPage.currentTask', 'Current task')}</span>}
    </button>
  );
}

function JourneyTaskList({ rows, onSelectStage, hasVoiceNote }) {
  const now = currentRow(rows);
  return (
    <div className="oj-tasks" role="list">
      {rows.map((stage) => (
        <JourneyTask key={stage.id || stage.stage_key} stage={stage} current={now === stage}
                     onSelect={onSelectStage} hasVoiceNote={hasVoiceNote} />
      ))}
    </div>
  );
}

/** One garment, folded to a line -- its name and how far along it is -- and
 *  opened to its task list. Only one garment is open at a time, so the
 *  person reads one job, not every job on the order. */
export function StageTimeline({ stages, onSelectStage, hasVoiceNote = anyVoiceNote }) {
  const { t } = useLanguage();
  const { head, garments, tail } = stageLanes(stages);
  const autoKey = (garments.find((g) => g.stages.some(isLive)) || garments.find((g) => g.stages.some((s) => !isSettled(s))))?.key || null;
  const [pick, setPick] = React.useState();
  const openKey = pick === undefined ? autoKey : pick;
  const setOpenKey = setPick;

  if (!stages || stages.length === 0) {
    return (
      <div className="od-empty">
        {t('ordersPage.noProductionStages', 'No production stages recorded for this order.')}
      </div>
    );
  }
  const allGarmentsDone = garments.every((g) => g.stages.every(isSettled));

  return (
    <div className="oj">
      {head.length > 0 && <JourneyTaskList rows={head} onSelectStage={onSelectStage} hasVoiceNote={hasVoiceNote} />}

      {garments.length > 0 && (
        <div className="oj-section">
          <div className="stat-label">{t('ordersPage.garmentsToMake', 'Garments to make')}</div>
          {garments.map((g) => {
            const done = g.stages.filter(isSettled).length;
            const finished = done === g.stages.length;
            const open = g.key === openKey;
            const now = currentRow(g.stages);
            return (
              <div key={g.key} className={`oj-garment${finished ? ' oj-garment--done' : ''}${open ? ' oj-garment--open' : ''}`}>
                <button type="button" className="oj-garment-head" aria-expanded={open}
                        onClick={() => setOpenKey(open ? null : g.key)}>
                  <span className="oj-mark" aria-hidden="true">{finished ? '✓' : now && isLive(now) ? '●' : '○'}</span>
                  <span className="oj-garment-name">{g.label}</span>
                  <span className="oj-garment-progress">
                    <span>{t('ordersPage.garmentProgress', '{done} of {total} completed').replace('{done}', done).replace('{total}', g.stages.length)}</span>
                    <span className="oj-bar" aria-hidden="true"><span style={{ width: `${(done / g.stages.length) * 100}%` }} /></span>
                  </span>
                  {!finished && now && !open && <span className="oj-garment-next">{t('ordersPage.nextUp', 'Now')}: {now.stage_name}</span>}
                  <ChevronDown size={16} className="oj-chevron" />
                </button>
                {open && <JourneyTaskList rows={g.stages} onSelectStage={onSelectStage} hasVoiceNote={hasVoiceNote} />}
              </div>
            );
          })}
        </div>
      )}

      {tail.length > 0 && (
        <div className="oj-section">
          <div className="stat-label">{t('ordersPage.orderCompletion', 'Order completion')}</div>
          {garments.length > 0 && !allGarmentsDone && (
            <div className="oj-hint">{t('ordersPage.afterGarments', 'Starts once every garment above is finished.')}</div>
          )}
          <JourneyTaskList rows={tail} onSelectStage={onSelectStage} hasVoiceNote={hasVoiceNote} />
        </div>
      )}
    </div>
  );
}
