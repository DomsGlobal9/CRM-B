import { Tabs } from '../../../components/ui/Atelier';
import { useState, useEffect, useCallback } from 'react';
import { Clock, Calendar, CalendarDays, Wallet } from 'lucide-react';
import { api } from '../../../api';
import { Crumbs } from '../../../components/ui/Breadcrumbs';
import { CorrectionForm } from '../CorrectionForm';
import Payroll from '../payroll/Payroll';
import MonthlyAttendanceLogs from './MonthlyLogs';
import MusterGrid from './MusterGrid';
import MyDay from './MyDay';
import RecordForm from './RecordForm';
import Timesheet from './Timesheet';
import TodayOnTheFloor from './TodayOnTheFloor';
import { localISO, mondayOf, todayISO } from './attendanceHelpers';
import { Modal } from './attendanceParts';

/** Attendance & Payroll: the tabs, and the period and data each one is given. */

const PERIODS = [['day', 'Day'], ['week', 'Week'], ['month', 'Month']];

const PERIOD_LABEL = { day: 'Today', week: 'This week', month: 'This month' };

/** First and last day of the current month -- the muster grid spans the whole
 *  month, with future days shown blank. */
const monthGridBounds = () => {
  const now = new Date();
  return {
    since: localISO(new Date(now.getFullYear(), now.getMonth(), 1)),
    until: localISO(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  };
};

/** [since, until] for the chosen period, inclusive, ending today -- future days
 *  hold no attendance, so a period never reaches past today. */
const periodBounds = (period) => {
  const now = new Date();
  const until = localISO(now);
  if (period === 'week') {
    const d = new Date(now);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // back to Monday
    return { since: localISO(d), until };
  }
  if (period === 'month') {
    return { since: localISO(new Date(now.getFullYear(), now.getMonth(), 1)), until };
  }
  return { since: until, until };
};

const SUB_TABS = [
  { key: 'today', label: "Today's Status & Roster", icon: Clock },
  { key: 'timesheet', label: 'Weekly Timesheet', icon: CalendarDays },
  { key: 'monthly', label: 'Monthly Attendance Log', icon: Calendar },
  { key: 'payroll', label: 'Payroll', icon: Wallet },
];

export default function Attendance({ isOwner, canSeeTeam, showPayroll = false }) {
  const [roster, setRoster] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [dayMarks, setDayMarks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [correcting, setCorrecting] = useState(null);
  const [recording, setRecording] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [period, setPeriod] = useState('day');
  // The roster tab is only for the Owner and the Master; everyone else opens
  // straight onto their monthly log.
  const [activeTab, setActiveTab] = useState(canSeeTeam ? 'today' : 'monthly');
  // As on the Staff page: the sub-tab's crumb opens it afresh.
  const [tabVisit, setTabVisit] = useState(0);
  // Payroll runs Monday to Sunday; the timesheet and the pay run share this
  // week so switching between them never loses your place.
  const [week, setWeek] = useState(() => mondayOf(todayISO()));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const bounds = period === 'month' ? monthGridBounds() : periodBounds(period);
      const [people, today, marks] = await Promise.all([
        canSeeTeam ? api.getTailors({ forAttendance: true }).catch(() => []) : Promise.resolve([]),
        canSeeTeam ? api.getAttendance(bounds).catch(() => []) : Promise.resolve([]),
        canSeeTeam && period === 'month'
          ? api.getDayMarks(bounds).catch(() => []) : Promise.resolve([]),
      ]);
      setRoster(Array.isArray(people) ? people : []);
      setSessions(Array.isArray(today) ? today : []);
      setDayMarks(Array.isArray(marks) ? marks : []);
    } finally {
      setLoading(false);
    }
  }, [canSeeTeam, period]);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load, reloadKey]);

  const refresh = () => setReloadKey((n) => n + 1);

  return (
    <>
      <Crumbs level={2} items={[{ label: SUB_TABS.find((item) => item.key === activeTab)?.label || '', onClick: () => setTabVisit((n) => n + 1) }]} />
      {/* Your own check-in card belongs with attendance, not with a pay run. */}
      {activeTab !== 'payroll' && <MyDay onChanged={refresh} />}

      <Tabs ariaLabel="Attendance sections" value={activeTab} onChange={setActiveTab}
            style={{ margin: '20px 0 18px' }}
            tabs={SUB_TABS.filter(({ key }) => (key === 'monthly' || (key === 'payroll' ? showPayroll : canSeeTeam)))} />

      {activeTab === 'today' && canSeeTeam && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px',
                        flexWrap: 'wrap', margin: '0 0 12px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 600, margin: 0,
                         display: 'flex', alignItems: 'center', gap: '7px' }}>
              <Clock size={15} /> On the floor · {PERIOD_LABEL[period]}
            </h3>
            <div role="group" aria-label="Attendance period"
                 style={{ display: 'inline-flex', borderRadius: '8px', overflow: 'hidden',
                          border: '1px solid var(--border-color, rgba(255,255,255,0.12))' }}>
              {PERIODS.map(([value, label]) => (
                <button key={value} type="button" onClick={() => setPeriod(value)}
                        aria-pressed={period === value}
                        style={{
                          padding: '6px 14px', fontSize: '13px', border: 'none', cursor: 'pointer',
                          background: period === value ? 'var(--primary-color)' : 'transparent',
                          color: period === value ? 'var(--primary-foreground)' : 'var(--text-secondary)',
                          fontWeight: period === value ? 600 : 400,
                        }}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          {period === 'month' ? (
            <MusterGrid
              isOwner={isOwner}
              roster={roster}
              sessions={sessions}
              dayMarks={dayMarks}
              since={monthGridBounds().since}
              until={monthGridBounds().until}
              onChanged={refresh}
            />
          ) : (
            <TodayOnTheFloor
              isOwner={isOwner}
              roster={roster}
              sessions={sessions}
              loading={loading}
              period={period}
              onCorrect={setCorrecting}
              onRecord={() => setRecording(true)}
            />
          )}
        </>
      )}

      {activeTab === 'timesheet' && canSeeTeam && (
        <Timesheet
          canSeeTeam={canSeeTeam}
          isOwner={isOwner}
          roster={roster}
          onCorrect={setCorrecting}
          week={week}
          onWeekChange={setWeek}
          reloadKey={reloadKey}
          onOpenPayroll={showPayroll ? () => setActiveTab('payroll') : undefined}
        />
      )}

      {activeTab === 'monthly' && (
        <MonthlyAttendanceLogs reloadKey={reloadKey} />
      )}

      {activeTab === 'payroll' && showPayroll && (
        <Payroll key={tabVisit} week={week} onWeekChange={setWeek} onChanged={refresh} />
      )}

      {correcting && (
        <Modal title="Correct attendance" onClose={() => setCorrecting(null)}>
          <CorrectionForm
            session={correcting}
            onCancel={() => setCorrecting(null)}
            onSaved={() => { setCorrecting(null); refresh(); }}
          />
        </Modal>
      )}

      {recording && (
        <Modal title="Record attendance" onClose={() => setRecording(false)}>
          <RecordForm
            roster={roster}
            onCancel={() => setRecording(false)}
            onSaved={() => { setRecording(false); refresh(); }}
          />
        </Modal>
      )}
    </>
  );
}
