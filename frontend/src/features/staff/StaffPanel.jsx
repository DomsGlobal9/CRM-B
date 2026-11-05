import { useState } from 'react';
import { Clock, TrendingUp, Users, ClipboardList, Shield } from 'lucide-react';
import { boutiqueLoginUrl } from '../../utils/format';
import { PageHeader, Tabs } from '../../components/ui/Atelier';
import Attendance from './Attendance';
import Performance from './Performance';
import RolePermissions from './RolePermissions';
import TeamTasks from './TeamTasks';
import { Crumbs } from '../../components/ui/Breadcrumbs';
import Roster from './Roster';

/** Staff: the tabs, and which of them each role sees. */

const TABS = [
  { key: 'roster', label: 'Team', icon: Users },
  { key: 'tasks', label: 'Tasks', icon: ClipboardList },
  { key: 'attendance', label: 'Attendance & Payroll', icon: Clock },
  { key: 'performance', label: 'Performance', icon: TrendingUp },
  { key: 'permissions', label: 'Roles & Permissions', icon: Shield },
];

export default function StaffPanel({ currentUser, onlyDesigners = false, onShowAllStaff = null }) {
  const isOwner = !currentUser?.role || currentUser.role === 'Owner';
  const isSupervisor = currentUser?.role === 'Master';
  // Team work the owner handed this role (core/admin_access.py, team.*).
  const handed = (currentUser?.admin_tasks || []).filter((task) => task.startsWith('team.'));
  const can = (task) => isOwner || handed.includes(task);
  const canSeeTeam = isOwner || isSupervisor || handed.length > 0;
  // The Team list's Work-wise / Attendance-wise views and the team's
  // attendance: the owner's, and the supervisors' to read (Master, Designer --
  // apps.staff AttendanceSessionViewSet / DayMarkViewSet). Corrections, leave
  // marks and pay stay the owner's.
  const isDesignerRole = currentUser?.role === 'Designer';
  const canSeeTeamAttendance = can('team.attendance') || isSupervisor || isDesignerRole;
  const rosterSeesTeam = canSeeTeam || isDesignerRole;
  // Payroll is its own module switch, independent of attendance; mirrors
  // App.jsx's hasModule (no list at all means nothing is switched off).
  const payrollOn = can('team.payroll')
    && (!Array.isArray(currentUser?.modules) || currentUser.modules.includes('payroll'));

  const [tab, setTab] = useState(isOwner || (onlyDesigners && canSeeTeam) ? 'roster' : 'attendance');
  // The open tab's crumb opens it afresh: a staff member's payroll or
  // performance page closes, as a sidebar item does for a page.
  const [tabVisit, setTabVisit] = useState(0);

  return (
    <>
      <PageHeader
        title={canSeeTeam ? 'Your team' : 'My attendance'}
        subtitle={canSeeTeam
          ? 'Tailors, masters, karigars and designers: who is in, what they are paid, and how they are doing.'
          : 'Check in and out, and see the hours recorded for you.'}
      />

      <Crumbs level={1} items={[{ label: TABS.find((item) => item.key === tab)?.label || '', onClick: () => setTabVisit((n) => n + 1) }]} />
      {/* Tab strip, not pill buttons: these switch a view, and an underline on
          the active one reads as navigation rather than four call-to-actions. */}
      <Tabs ariaLabel="Staff sections" value={tab} onChange={setTab}
            style={{ margin: 'var(--space-5) 0 var(--space-6)' }}
            tabs={(isOwner
              ? TABS
              : canSeeTeam
                ? TABS.filter((t) => t.key !== 'permissions')
                : TABS.filter((t) => ['attendance', 'roster', 'tasks', 'performance'].includes(t.key)))
              .map((item) => ({
                ...item,
                label: !rosterSeesTeam && item.key === 'roster' ? 'My details'
                  : item.key === 'attendance' && !payrollOn ? 'Attendance' : item.label,
              }))} />

      {tab === 'roster' && <Roster isOwner={isOwner} canSeeTeam={rosterSeesTeam} showDesigners={!isSupervisor} canManage={can('team.manage')}
                                   canPay={can('team.payroll')} canAttend={canSeeTeamAttendance} portalUrl={boutiqueLoginUrl(currentUser?.shop_slug)}
                                   onlyDesigners={onlyDesigners} onShowAll={onShowAllStaff} />}
      {tab === 'tasks' && <TeamTasks currentUser={currentUser} canSeeTeam={canSeeTeam} />}
      {/* The team's attendance is the owner's alone; everyone else sees their own.
          Payroll lives inside it as an owner-only view, since every pay run is
          built from that attendance. */}
      {/* The Master and the Designer see the team's attendance too, read only
          (the server's AttendanceSessionViewSet / DayMarkViewSet): no
          corrections, no pay. */}
      {tab === 'attendance' && (
        <Attendance key={tabVisit} isOwner={can('team.attendance')} canSeeTeam={canSeeTeamAttendance} showPayroll={payrollOn} />
      )}
      {tab === 'performance' && (
        <Performance key={tabVisit} isOwner={isOwner} canReview={can('team.reviews')} canSeeTeam={canSeeTeam} />
      )}
      {tab === 'permissions' && isOwner && <RolePermissions />}
    </>
  );
}
