import { useState, useEffect, useCallback, useMemo } from 'react';
import { AlertTriangle, Pencil } from 'lucide-react';
import { api } from '../../../api';
import Loader from '../../../components/ui/Loader';
import { CorrectionForm } from '../CorrectionForm';
import { clockText, dayText, hoursText, panel } from './payrollHelpers';
import { Banner, Modal } from './payrollParts';

/** A draft week's attendance, correctable in place. */

/** Ids of completed sessions that share an instant with another -- the same
 *  test the server's _overlaps applies, so the rows it blames can be marked. */
const overlappingIds = (sessions) => {
  const ids = new Set();
  const done = sessions.filter((s) => s.check_out).sort((a, b) => a.check_in.localeCompare(b.check_in));
  done.forEach((earlier, i) => {
    const later = done[i + 1];
    if (later && new Date(earlier.check_out) > new Date(later.check_in)) {
      ids.add(earlier.id);
      ids.add(later.id);
    }
  });
  return ids;
};

/**
 * A draft week's attendance as it stands now, correctable in place.
 *
 * Read live from the timesheet rather than from the record's frozen breakdown,
 * because the breakdown leaves out exactly the sessions that need fixing (the
 * open ones). Saving a correction recalculates the draft, so a blocked row can
 * be cleared without leaving payroll.
 */
export default function LiveSessions({ record, week, onRecalculate }) {
  const [sheet, setSheet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [correcting, setCorrecting] = useState(null);
  const [recalculating, setRecalculating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSheet(await api.getTimesheet({ staff: record.staff, week }));
    } catch (err) {
      setError(err.message || 'Could not load this week’s attendance.');
      setSheet(null);
    } finally {
      setLoading(false);
    }
  }, [record.staff, week]);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  const overlaps = useMemo(() => overlappingIds(sheet?.sessions || []), [sheet]);

  const saved = async () => {
    setCorrecting(null);
    setRecalculating(true);
    setError(null);
    try {
      await onRecalculate();
      await load();
    } catch (err) {
      setError(err.message || 'The correction was saved, but the draft could not be recalculated. Use Recalculate.');
    } finally {
      setRecalculating(false);
    }
  };

  return (
    <>
      <h4 style={{ fontSize: '13px', fontWeight: 600, margin: '0 0 4px' }}>
        Attendance behind this total
      </h4>
      <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 10px' }}>
        Live from attendance. Correct a session here and this draft recalculates.
      </p>

      {error && <Banner text={error} />}

      {loading || recalculating ? (
        <Loader section label={recalculating ? 'Recalculating…' : 'Loading attendance…'} />
      ) : !sheet || sheet.sessions.length === 0 ? (
        <div style={{ ...panel, padding: '20px', textAlign: 'center',
                      color: 'var(--text-secondary)', fontSize: '13px' }}>
          No attendance in this week.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {sheet.sessions.map((s) => {
            const overlap = overlaps.has(s.id);
            return (
              <div key={s.id} style={{
                ...panel, padding: '11px 14px',
                ...(overlap ? { borderColor: 'rgba(220,80,60,0.5)' }
                  : s.is_open ? { borderColor: 'rgba(200,140,50,0.5)' } : {}),
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between',
                              gap: '10px', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600, fontSize: '14px' }}>{dayText(s.check_in)}</span>
                  <span style={{ fontWeight: 600 }}>{s.is_open ? 'Still open' : hoursText(s.minutes)}</span>
                </div>
                <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginTop: '3px' }}>
                  {clockText(s.check_in)} → {s.is_open ? '—' : clockText(s.check_out)}
                  {' · '}{s.source === 'OWNER' ? 'Entered by owner' : s.source === 'WORK' ? 'From start of work' : 'Self'}
                  {s.was_corrected && ' · corrected'}
                </div>
                {(overlap || s.is_open) && (
                  <div style={{ fontSize: '12px', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '5px',
                                color: overlap ? 'var(--danger-color)' : '#a0691f' }}>
                    <AlertTriangle size={13} />
                    {overlap ? 'Overlaps another session, so this time would be paid twice'
                      : 'No check-out, so these hours are not paid in this run'}
                  </div>
                )}
                <button type="button" className="btn-secondary" onClick={() => setCorrecting(s)}
                        style={{ marginTop: '10px', display: 'inline-flex',
                                 alignItems: 'center', gap: '6px', minHeight: '36px' }}>
                  <Pencil size={13} /> {s.is_open ? 'Add check-out' : 'Correct'}
                </button>
              </div>
            );
          })}
          <div style={{ ...panel, padding: '11px 14px', display: 'flex',
                        justifyContent: 'space-between', fontWeight: 600 }}>
            <span>Paid in this draft</span>
            <span>{hoursText(record.worked_minutes)}</span>
          </div>
        </div>
      )}

      {correcting && (
        <Modal title="Correct attendance" onClose={() => setCorrecting(null)}>
          <CorrectionForm session={correcting} onCancel={() => setCorrecting(null)} onSaved={saved} />
        </Modal>
      )}
    </>
  );
}
