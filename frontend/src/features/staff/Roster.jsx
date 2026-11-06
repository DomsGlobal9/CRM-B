import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Plus, Clock, Users, Trash2, Phone, Briefcase, UserCheck, Pencil, ChevronDown, ChevronUp, KeyRound, X } from 'lucide-react';
import { api } from '../../api';
import { AvatarInitials, SearchBar, StatCard } from '../../components/ui/Atelier';
import Loader from '../../components/ui/Loader';
import RowMenu from '../../components/ui/RowMenu';
import { DataTable } from '../../components/ui/DataTable';
import AddStaffForm from './AddStaffForm';
import AdvanceForm from './AdvanceForm';
import { CredentialsDialog, DeleteMemberDialog, Modal } from './StaffDialogs';
import { employmentLabel, errorBox, money, showsPay } from './staffShared';
import { STAFF_STATUS_VIEW_KEY } from '../../constants/storageKeys';

/** Staff > Team: the stat cards, the search, and the paged list of the team. */

/* Staff > Team: the Status column read two ways (the switch above the list).
   Work-wise: Busy while the person holds open workflow steps (any role), with
   how many are in progress and how many are still to do (open_steps, counted
   by the roster list itself). Attendance-wise: Present / Checked out / Absent
   today, or the owner's Leave / Weekly off mark. Each view also flags what
   needs a hand: someone away with work waiting, someone in with none. */
// Staff > Team's "By role" box (5 Tailors, 4 Masters...). Hidden for now, not
// removed: set to true to bring it back.
const SHOW_ROLE_MIX = false;
const readStatusView = () => {
  try { return localStorage.getItem(STAFF_STATUS_VIEW_KEY) === 'attendance' ? 'attendance' : 'work'; } catch { return 'work'; }
};
const clockTime = (iso) => (iso ? new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '');
const hoursText = (minutes) => {
  const m = Math.max(0, Math.round(minutes || 0));
  return m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}` : `${m}m`;
};

/** Today's attendance for one roster row: {kind, since, until, minutes, outside}. */
function attendanceOf(member, sessions, marks) {
  const staffId = member.isDesigner ? member.staff : member.id;
  if (staffId == null) return null;
  const mine = sessions.filter((s) => String(s.staff) === String(staffId))
    .sort((a, b) => String(a.check_in).localeCompare(String(b.check_in)));
  const outside = mine.some((s) => s.check_in_outside_shop);
  if (mine.length) {
    const open = mine.find((s) => s.is_open);
    const minutes = mine.reduce((n, s) => n + (s.is_open
      ? (Date.now() - new Date(s.check_in).getTime()) / 60000
      : Number(s.minutes || 0)), 0);
    return open
      ? { kind: 'present', since: mine[0].check_in, minutes, outside }
      : { kind: 'out', since: mine[0].check_in, until: mine[mine.length - 1].check_out, minutes, outside };
  }
  const mark = marks.find((d) => String(d.staff) === String(staffId));
  if (mark) return { kind: mark.kind === 'WEEKLY_OFF' ? 'off' : 'leave', note: mark.note };
  return { kind: 'absent' };
}

const ATTENDANCE_BADGE = {
  present: ['success', 'Present'],
  out: ['neutral', 'Checked out'],
  absent: ['danger', 'Absent'],
  leave: ['warning', 'On leave'],
  off: ['neutral', 'Weekly off'],
};
const AWAY = new Set(['absent', 'leave', 'off']);

/** Rows per page; the server offers the same (TailorViewSet.TEAM_PAGE_SIZES). */
const TEAM_PAGE_SIZES = [20, 30, 40, 50];

const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function Roster({ isOwner, canSeeTeam, showDesigners = true, canManage = isOwner, canPay = isOwner, canAttend = isOwner,
                  portalUrl, onlyDesigners = false, onShowAll = null }) {
  // Edit/delete, pay and today's attendance each follow their own handed
  // task (core/admin_access.py); sign-in credentials stay the owner's alone.
  const canAct = canManage || canPay;
  const [terms, setTerms] = useState([]);
  const [attendanceToday, setAttendanceToday] = useState([]);
  const [dayMarksToday, setDayMarksToday] = useState([]);
  // The stat card clicked above the list: 'available' | 'present' | 'pay', or
  // null for everyone. It narrows the list to what the card counts.
  const [cardFilter, setCardFilter] = useState(null);
  const listRef = useRef(null);
  const [statusView, setStatusViewState] = useState(readStatusView);
  const setStatusView = (next) => {
    setStatusViewState(next);
    try { localStorage.setItem(STAFF_STATUS_VIEW_KEY, next); } catch { /* private mode: this visit only */ }
  };
  const [deposits, setDeposits] = useState([]);
  const [advances, setAdvances] = useState([]);
  const [issuingFor, setIssuingFor] = useState(null);
  const [expanded, setExpanded] = useState(() => new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [person, setPerson] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [credentialsFor, setCredentialsFor] = useState(null);

  // The page of the team on show, from the server. The page asked for is kept
  // with what it was asked under: a new search, card or page size starts at 1.
  const [pageSize, setPageSize] = useState(TEAM_PAGE_SIZES[0]);
  const needle = search.trim();
  const teamKey = `${needle}|${cardFilter || ''}|${pageSize}|${onlyDesigners}|${showDesigners}`;
  const [pageAt, setPageAt] = useState({ key: teamKey, page: 1 });
  if (pageAt.key !== teamKey) setPageAt({ key: teamKey, page: 1 });
  const page = pageAt.key === teamKey ? pageAt.page : 1;
  // Bumped after a change to the team, to fetch the same page again.
  const [teamVersion, setTeamVersion] = useState(0);
  const teamRequest = `${teamKey}|${page}|${teamVersion}`;
  // What came back, with the request it answers: loading until they match.
  const [team, setTeam] = useState({ request: '', body: null, error: '' });

  useEffect(() => {
    if (!canSeeTeam) return undefined;
    let live = true;
    // Typing in the search box waits for a pause before asking.
    const timer = setTimeout(() => {
      api.getTeamPage({
        page, page_size: pageSize, search: needle, card: cardFilter, date: localToday(),
        only_designers: onlyDesigners ? '1' : '', designers: showDesigners ? '' : '0',
      })
        .then((body) => { if (live) setTeam({ request: teamRequest, body, error: '' }); })
        .catch((err) => {
          if (live) setTeam((prev) => ({ request: teamRequest, body: prev.body, error: err.message || 'Could not load the team.' }));
        });
    }, needle ? 250 : 0);
    return () => { live = false; clearTimeout(timer); };
  }, [canSeeTeam, teamRequest, page, pageSize, needle, cardFilter, onlyDesigners, showDesigners]);
  const teamLoading = canSeeTeam && team.request !== teamRequest;
  const teamBody = team.body;

  // Everything drawn beside the people: their terms, money and today's attendance.
  const loadDetails = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const today = localToday();
      const [profiles, deposited, advanced, present, marked] = await Promise.all([
        api.getStaffProfiles().catch(() => []),
        canPay ? api.getDeposits().catch(() => []) : Promise.resolve([]),
        canPay ? api.getAdvances({ active: 'true' }).catch(() => []) : Promise.resolve([]),
        canAttend ? api.getAttendance({ date: today }).catch(() => []) : Promise.resolve([]),
        // Leave / weekly off: the owner marks them; the owner and the
        // supervisors read them (DayMarkViewSet).
        canAttend ? api.getDayMarks({ since: today, until: today }).catch(() => []) : Promise.resolve([]),
      ]);
      setTerms(Array.isArray(profiles) ? profiles : []);
      setDeposits(Array.isArray(deposited) ? deposited : []);
      setAdvances(Array.isArray(advanced) ? advanced : []);
      setAttendanceToday(Array.isArray(present) ? present : []);
      setDayMarksToday(Array.isArray(marked) ? marked : []);
    } catch (err) {
      setLoadError(err.message || 'Could not load the staff list.');
    } finally {
      setLoading(false);
    }
  }, [canPay, canAttend]);

  const refresh = useCallback(() => {
    setTeamVersion((n) => n + 1);
    return loadDetails();
  }, [loadDetails]);

  useEffect(() => {
    const t = setTimeout(loadDetails, 0);
    return () => clearTimeout(t);
  }, [loadDetails]);

  const advancesByStaff = useMemo(() => {
    const map = new Map();
    advances.forEach((a) => {
      const key = String(a.staff);
      map.set(key, [...(map.get(key) || []), a]);
    });
    return map;
  }, [advances]);

  const depositByStaff = useMemo(() => {
    const map = new Map();
    deposits.forEach((d) => map.set(String(d.staff), d));
    return map;
  }, [deposits]);


  const termsByStaff = useMemo(() => {
    const map = new Map();
    terms.forEach((t) => map.set(t.designer ? `designer:${t.designer}` : `staff:${t.staff}`, t));
    return map;
  }, [terms]);
  const termsFor = useCallback((member) => (member.isDesigner
    ? termsByStaff.get(`designer:${member.id}`)
      || (member.staff ? termsByStaff.get(`staff:${member.staff}`) : undefined)
    : termsByStaff.get(`staff:${member.id}`)), [termsByStaff]);

  /** Owners see a page of the team; a staff member sees only the row their own terms name. */
  const rows = useMemo(() => {
    if (canSeeTeam) {
      return (teamBody?.results || []).map((row) => {
        const member = row.is_designer ? { ...row, role: 'Designer', isDesigner: true } : row;
        return { member, terms: termsFor(member) };
      });
    }
    return terms.map((t) => ({
      member: t.designer
        ? { id: t.designer, name: t.staff_name, role: t.staff_role, isDesigner: true }
        : { id: t.staff, name: t.staff_name, role: t.staff_role },
      terms: t,
    })).filter(({ member }) => !onlyDesigners || member.isDesigner || member.role === 'Designer');
  }, [canSeeTeam, teamBody, terms, termsFor, onlyDesigners]);

  const summary = teamBody?.summary || { total: 0, people: 0, designers: 0, busy: 0, available: 0 };
  const counts = teamBody?.counts || { scoped: 0, busy: 0, available: 0, with_terms: 0 };
  const withTerms = counts.with_terms;
  const roleCounts = teamBody?.role_counts || {};
  const rosterRoles = teamBody?.roles || [];

  const analytics = useMemo(() => {
    const presentIds = new Set(attendanceToday.map((s) => String(s.staff)));
    const workingNow = new Set(
      attendanceToday.filter((s) => s.is_open).map((s) => String(s.staff))).size;
    return { presentToday: presentIds.size, workingNow };
  }, [attendanceToday]);

  // A card: the list narrowed to what it counts, in the view it is about
  // (Available -> Work-wise, Present -> Attendance-wise); the same card again,
  // or Team size, shows everyone.
  const CARD_LABEL = { available: 'Available now', present: 'Present today', pay: 'Pay details added' };
  const pickCard = (key) => {
    const next = key && cardFilter === key ? null : key;
    setCardFilter(next);
    if (next === 'available') setStatusView('work');
    if (next === 'present' && canAttend) setStatusView('attendance');
    setTimeout(() => listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  };
  // The server has already narrowed the page to what the card counts.
  const shownRows = rows;
  const anyone = canSeeTeam ? counts.scoped > 0 : rows.length > 0;

  const plural = (role, n) =>
    (n === 1 || /staff$/i.test(role)) ? role : `${role}s`;


  if (loading || (canSeeTeam && !teamBody && !team.error)) {
    return <Loader page label="Loading staff…" />;
  }

  return (
    <>
      {(loadError || team.error) && (
        <div style={errorBox}>{loadError || team.error}</div>
      )}

      {canSeeTeam && (() => {
        return (
          <div className="at-stat-grid staff-stats" style={{ marginBottom: 'var(--space-5)' }}>
            <StatCard icon={Users} tone="green" label="Team size" value={summary.total}
                      sub={`${summary.people} people`}
                      onClick={() => pickCard(null)} active={cardFilter === null} />
            <StatCard icon={UserCheck} tone="amber" label="Available now" value={summary.available}
                      sub={summary.busy ? `${summary.busy} busy` : 'nobody busy'}
                      onClick={() => pickCard('available')} active={cardFilter === 'available'} />
            {canAttend && (
              <StatCard icon={Clock} tone="blue" label="Present today" value={analytics.presentToday}
                        sub={analytics.workingNow ? `${analytics.workingNow} in now` : 'Marked in attendance'}
                        onClick={() => pickCard('present')} active={cardFilter === 'present'} />
            )}
            <StatCard icon={Briefcase} tone="violet" label="Pay details added" value={withTerms}
                      sub={`${withTerms} of ${summary.total}`}
                      onClick={() => pickCard('pay')} active={cardFilter === 'pay'} />
          </div>
        );
      })()}

      {/* Role mix: a chip is a count plus a label, so it reads
          as one figure. Grouped with an eyebrow, on a well, so the eye takes
          them as a breakdown rather than four more cards. */}
      {SHOW_ROLE_MIX && canSeeTeam && Object.keys(roleCounts).length > 0 && (() => {
        const chip = (n, label) => (
          <div key={label} style={{
            background: 'var(--surface-color)', border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-md)', padding: '8px 14px',
            display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)',
          }}>
            <span style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--weight-bold)',
                           fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>{n}</span>
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>{label}</span>
          </div>
        );
        return (
          <div style={{
            background: 'var(--surface-inset)', border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-lg)', padding: 'var(--space-4) var(--space-5)',
            marginBottom: 'var(--space-5)', display: 'flex', flexWrap: 'wrap',
            gap: 'var(--space-6)',
          }}>
            {Object.keys(roleCounts).length > 0 && (
              <div>
                <div className="ui-eyebrow" style={{ marginBottom: 'var(--space-2)' }}>By role</div>
                <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                  {Object.entries(roleCounts).sort((a, b) => b[1] - a[1])
                    .map(([role, n]) => chip(n, plural(role, n)))}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {canSeeTeam && (
        <div className="staff-team-bar" style={{
          display: 'flex', gap: 'var(--space-3)', alignItems: 'center',
          flexWrap: 'wrap', marginBottom: 'var(--space-4)',
        }}>
          <SearchBar value={search} onChange={setSearch} placeholder="Search team by name, role or phone…" />
          {onlyDesigners && (
            <span className="staff-only-chip">
              Showing designers only
              {onShowAll && (
                <button type="button" onClick={onShowAll} aria-label="Show the whole team">
                  Show everyone <X size={13} />
                </button>
              )}
            </span>
          )}
          {canManage && (
            <button type="button" className="btn-primary" style={{ marginLeft: 'auto', padding: '10px 18px' }} onClick={() => setAdding(true)}>
              <Plus size={16} /> Add a team member
            </button>
          )}
        </div>
      )}

      {canSeeTeam && anyone && (() => {
        const view = canAttend ? statusView : 'work';
        const badges = view === 'work'
          ? [['warning', 'Busy', counts.busy], ['success', 'Available', counts.available]]
          : Object.entries(ATTENDANCE_BADGE).map(([k, [tone, label]]) => [tone, label, counts[k] || 0])
            .filter(([, , n], i) => n > 0 || i < 3);
        return (
          <div className="staff-status-bar" ref={listRef}>
            {canAttend && (
              <div className="at-seg" role="group" aria-label="Show status by">
                <button type="button" aria-pressed={view === 'work'} onClick={() => setStatusView('work')}>
                  <Briefcase size={15} /> Work-wise
                </button>
                <button type="button" aria-pressed={view === 'attendance'} onClick={() => setStatusView('attendance')}>
                  <Clock size={15} /> Attendance-wise
                </button>
              </div>
            )}
            <div className="staff-status-counts" aria-live="polite">
              {badges.map(([tone, label, n]) => (
                <span key={label} className={`ui-badge ui-badge--${tone}`}>{label} · {n}</span>
              ))}
            </div>
            {cardFilter && (
              <span className="staff-only-chip staff-card-filter">
                Showing: {CARD_LABEL[cardFilter]} · {teamBody?.count ?? 0}
                <button type="button" onClick={() => setCardFilter(null)} aria-label="Show the whole team">
                  Show everyone <X size={13} />
                </button>
              </span>
            )}
          </div>
        );
      })()}

      {!anyone ? (
        <div className="ui-card" style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--text-secondary)' }}>
          {canSeeTeam && needle
            ? 'Nobody matches that search.'
            : canSeeTeam
            ? 'Nobody on the team yet. Add someone with the button above -- their role, login, pay details and documents are all set up in one go.'
            : 'Your employment details have not been set up yet. Your boutique owner can add them.'}
        </div>
      ) : (
        
        (() => {
          // From the whole team, so the column does not come and go between pages.
          const showPay = canPay && terms.some(showsPay);
          const toggle = (id) => setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
          });
          const cell = { fontSize: 'var(--text-sm)', color: 'var(--text-primary)' };
          const sub = { fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: '2px' };
          const muted = <span style={{ color: 'var(--text-muted)' }}>—</span>;
          return (
        <DataTable
          fit={false}
          rows={shownRows}
          loading={teamLoading}
          pager={canSeeTeam && teamBody?.count > 0 ? {
            page: teamBody.page, pageCount: teamBody.pages, pageSize: teamBody.page_size, sizes: TEAM_PAGE_SIZES,
            onPage: (n) => setPageAt({ key: teamKey, page: n }), onSize: setPageSize,
            label: 'Team members per page', total: teamBody.count,
          } : undefined}
          rowKey={({ member }) => member.id}
          wrapClassName="staff-table-wrap"
          tableClassName="staff-table"
          rowClassName={({ member }) => `staff-row${expanded.has(member.id) ? ' staff-row--open' : ''}`}
          rowProps={({ member }) => ({ style: expanded.has(member.id) ? { background: 'var(--surface-2)' } : undefined })}
          empty={(
            <div style={{ padding: 'calc(var(--space-6) - var(--cell-y)) 0', textAlign: 'center', color: 'var(--text-secondary)' }}>
              Nobody here for “{CARD_LABEL[cardFilter]}” right now.
            </div>
          )}
          rowDetail={({ member, terms: t }) => Boolean(t && showsPay(t)) && expanded.has(member.id) && (
            <>
              {t && showsPay(t) && (
                <div
                  className="mobile-stack-grid"
                  style={{
                    display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px',
                    marginTop: '12px', paddingTop: '12px',
                    borderTop: '1px solid var(--border-color)',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Hourly rate</div>
                    <div style={{ fontWeight: 600 }}>{money(t.hourly_rate)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Deposit</div>
                    <div style={{ fontWeight: 600 }}>{money(t.deposit_total)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Weekly deduction</div>
                    <div style={{ fontWeight: 600 }}>{money(t.deposit_weekly)}</div>
                  </div>
                </div>
              )}

              {t && showsPay(t) && depositByStaff.get(String(member.id)) && (
                (() => {
                  const d = depositByStaff.get(String(member.id));
                  return (
                    <div style={{
                      marginTop: '12px', paddingTop: '12px',
                      borderTop: '1px solid var(--border-color)',
                    }}>
                      <div className="ui-eyebrow" style={{ marginBottom: '8px' }}>
                        Security deposit
                      </div>
                      <div
                        className="mobile-stack-grid"
                        style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
                                 gap: '10px' }}
                      >
                        <div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Agreed</div>
                          <div style={{ fontWeight: 600 }}>{money(d.agreed)}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Recovered</div>
                          <div style={{ fontWeight: 600 }}>{money(d.recovered)}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Remaining</div>
                          <div style={{ fontWeight: 600 }}>{money(d.remaining)}</div>
                        </div>
                      </div>
                      {d.fully_recovered && (
                        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--success-text)', marginTop: '8px' }}>
                          Security deposit fully recovered.
                        </div>
                      )}
                    </div>
                  );
                })()
              )}

              {/* Advances are paid back out of payroll, which covers the
                  roster only, so a designer has no advances section. */}
              {canPay && t && showsPay(t) && !member.isDesigner && (
                <div style={{
                  marginTop: '12px', paddingTop: '12px',
                  borderTop: '1px solid var(--border-color)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between',
                                alignItems: 'center', marginBottom: '8px' }}>
                    <div className="ui-eyebrow">
                      Advances
                    </div>
                    <button type="button" className="btn-secondary"
                            onClick={() => setIssuingFor(member)}
                            style={{ minHeight: '34px', fontSize: '12px',
                                     display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <Plus size={12} /> Issue advance
                    </button>
                  </div>
                  {(advancesByStaff.get(String(member.id)) || []).length === 0 ? (
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      No outstanding advance.
                    </div>
                  ) : (
                    (advancesByStaff.get(String(member.id)) || []).map((a) => (
                      <div key={a.id}
                           className="mobile-stack-grid"
                           style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
                                    gap: '10px', marginBottom: '6px' }}>
                        <div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            Issued {new Date(a.issued_on).toLocaleDateString([], { day: 'numeric', month: 'short' })}
                          </div>
                          <div style={{ fontWeight: 600 }}>{money(a.issued)}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Recovered</div>
                          <div style={{ fontWeight: 600 }}>{money(a.recovered)}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            Outstanding · {money(a.weekly_recovery)}/wk
                          </div>
                          <div style={{ fontWeight: 600 }}>{money(a.outstanding)}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </>
          )}
          columns={[
            { key: 'member', header: 'Team member', label: false, cellClassName: 'staff-cell-member', render: ({ member }) => (
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', minWidth: 0 }}>
                <AvatarInitials name={member.name} size={36} />
                <div style={{ minWidth: 0 }}>
                  {canManage ? (
                    <button
                      type="button"
                      onClick={() => setPerson(member)}
                      title="Edit details, employment and documents"
                      style={{
                        fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-sm)',
                        background: 'none', border: 'none', padding: 0, cursor: 'pointer', minHeight: '32px',
                        color: 'var(--text-primary)', textAlign: 'left', fontFamily: 'inherit',
                      }}
                    >{member.name}</button>
                  ) : (
                    <div style={{ fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-sm)',
                                  color: 'var(--text-primary)' }}>{member.name}</div>
                  )}
                  <div style={sub}>
                    {member.role}
                    {member.isDesigner && ` · ${member.design_count ?? 0} design(s)${member.has_login ? '' : ' · no login yet'}`}
                  </div>
                </div>
              </div>
            ) },
            {
              key: 'status',
              header: canSeeTeam && canAttend && statusView === 'attendance' ? 'Attendance today' : 'Status',
              label: canSeeTeam && canAttend && statusView === 'attendance' ? 'Attendance' : 'Status',
              cellClassName: 'staff-cell-status',
              // In a fragment, so a cell with no status stays empty: DataTable draws a dash for null.
              render: ({ member }) => (
                <>
                  {(() => {
                    if (!canSeeTeam || (member.isDesigner && !(canAttend && statusView === 'attendance'))) return null;
                    const att = canAttend ? attendanceOf(member, attendanceToday, dayMarksToday) : null;
                    const work = member.open_steps;
                    const jobs = work ? work.doing + work.todo : 0;
                    const workLine = work && jobs > 0
                      ? [work.doing && `${work.doing} in progress`, work.todo && `${work.todo} to do`].filter(Boolean).join(' · ')
                      : null;
                    if (canAttend && statusView === 'attendance') {
                      if (!att) return <span className="ui-badge ui-badge--neutral">—</span>;
                      const [tone, label] = ATTENDANCE_BADGE[att.kind];
                      const detail = att.kind === 'present' ? `In since ${clockTime(att.since)} · ${hoursText(att.minutes)}`
                        : att.kind === 'out' ? `${clockTime(att.since)} – ${clockTime(att.until)} · ${hoursText(att.minutes)}`
                        : att.note || null;
                      return (
                        <div className="staff-status">
                          <span className={`ui-badge ui-badge--${tone}`}>● {label}</span>
                          {att.outside && <span className="ui-badge ui-badge--warning staff-status-tag">Outside shop</span>}
                          {detail && <div className="staff-status-sub">{detail}</div>}
                          {work && AWAY.has(att.kind) && jobs > 0 && (
                            <div className="staff-status-sub staff-status-flag">{jobs} {jobs === 1 ? 'job' : 'jobs'} waiting</div>
                          )}
                          {work && att.kind === 'present' && jobs === 0 && (
                            <div className="staff-status-sub staff-status-free">No work assigned</div>
                          )}
                        </div>
                      );
                    }
                    if (!work) return undefined;
                    return (
                      <div className="staff-status">
                        <span className={`ui-badge ui-badge--${jobs > 0 ? 'warning' : 'success'}`}>● {jobs > 0 ? 'Busy' : 'Available'}</span>
                        <div className="staff-status-sub">{workLine || 'No work assigned'}</div>
                        {att && AWAY.has(att.kind) && jobs > 0 && (
                          <div className="staff-status-sub staff-status-flag">{ATTENDANCE_BADGE[att.kind][1]} today</div>
                        )}
                      </div>
                    );
                  })() ?? (member.status && canAttend && !member.isDesigner
                   && !attendanceToday.some((s) => String(s.staff) === String(member.id)) ? (
                    // Not marked in today: the stored Available/Busy is stale until they arrive.
                    <span className="ui-badge ui-badge--danger">● Absent</span>
                  ) : member.status ? (
                    <span className={`ui-badge ui-badge--${member.status === 'Available' ? 'success' : member.status === 'Busy' ? 'warning' : 'neutral'}`}>
                      ● {member.status}
                    </span>
                  ) : member.isDesigner && canAttend ? (
                    // A designer's attendance is recorded on their linked row (member.staff).
                    member.staff && attendanceToday.some((s) => String(s.staff) === String(member.staff))
                      ? <span className="ui-badge ui-badge--success">● Present</span>
                      : <span className="ui-badge ui-badge--danger">● Absent</span>
                  ) : member.isDesigner ? (
                    <span className="ui-badge ui-badge--neutral">Designer</span>
                  ) : null)}
                </>
              ),
            },
            { key: 'contact', header: 'Contact', cellProps: () => ({ style: cell }), render: ({ member }) => (
              member.phone
                ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}><Phone size={12} /> {member.phone}</span>
                : muted
            ) },
            { key: 'work', header: 'Work type', cellProps: () => ({ style: cell }), render: ({ member, terms: t }) => (
              t ? (
                <>
                  <div>{employmentLabel(t.employment_type)}</div>
                </>
              ) : member.isDesigner ? muted : (
                <span style={{ color: 'var(--text-muted)' }}
                      title="No employment details yet — this person works exactly as before.">
                  Not added
                </span>
              )
            ) },
            showPay && { key: 'pay', header: 'Pay', cellProps: () => ({ style: cell }), render: ({ member, terms: t }) => {
              const deposit = depositByStaff.get(String(member.id));
              return t && showsPay(t) ? (
                <>
                  <div>{money(t.hourly_rate)}<span style={{ color: 'var(--text-muted)' }}>/hr</span></div>
                  <div style={sub}>
                    {deposit
                      ? (deposit.fully_recovered ? 'Deposit recovered' : `Deposit ${money(deposit.remaining)} left`)
                      : `Deposit ${money(t.deposit_total)}`}
                  </div>
                </>
              ) : muted;
            } },
            showPay && { key: 'advances', header: 'Advances', cellProps: () => ({ style: cell }), render: ({ member, terms: t }) => {
              const advances = advancesByStaff.get(String(member.id)) || [];
              const outstanding = advances.reduce((n, a) => n + Number(a.outstanding || 0), 0);
              return t && showsPay(t) && !member.isDesigner ? (
                <>
                  <div>{outstanding > 0 ? money(outstanding) : <span style={{ color: 'var(--text-muted)' }}>None</span>}</div>
                  {outstanding > 0 && <div style={sub}>{advances.length} outstanding</div>}
                </>
              ) : muted;
            } },
            canAct && {
              key: 'action',
              header: 'Action',
              label: false,
              align: 'right',
              cellClassName: 'staff-cell-actions',
              cellProps: () => ({ style: { whiteSpace: 'nowrap' } }),
              render: ({ member, terms: t }) => {
                const hasDetail = Boolean(t && showsPay(t));
                const open = expanded.has(member.id);
                return (
                  <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                    {canPay && t && showsPay(t) && !member.isDesigner && (
                      <button type="button" className="btn-secondary at-btn-sm"
                              onClick={() => setIssuingFor(member)} title="Issue an advance">
                        <Plus size={14} /> Advance
                      </button>
                    )}
                    {/* Edit (details, employment and documents) and
                        Delete, behind one ⋯ button. */}
                    {canManage && (
                      <RowMenu
                        label={`Actions for ${member.name}`}
                        items={[
                          { label: 'Edit', icon: <Pencil size={14} />, onClick: () => setPerson(member) },
                          ...(isOwner ? [{ label: 'Credentials', icon: <KeyRound size={14} />, onClick: () => setCredentialsFor(member) }] : []),
                          { label: 'Delete', icon: <Trash2 size={14} />, danger: true,
                            onClick: () => setRemoving({ member, busy: false, error: null }) },
                        ]}
                      />
                    )}
                    {hasDetail && (
                      <button type="button" className="btn-secondary at-btn-sm"
                              onClick={() => toggle(member.id)}
                              aria-expanded={open}
                              title={open ? 'Hide pay and advances' : 'Show pay and advances'}
                              style={{ padding: '0 8px' }}>
                        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>
                    )}
                  </div>
                );
              },
            },
          ]}
        />
          );
        })()
      )}

      {issuingFor && (
        <Modal title={`Issue advance — ${issuingFor.name}`} onClose={() => setIssuingFor(null)}>
          <AdvanceForm
            member={issuingFor}
            onCancel={() => setIssuingFor(null)}
            onSaved={() => { setIssuingFor(null); refresh(); }}
          />
        </Modal>
      )}

      {adding && (
        <AddStaffForm
          portalUrl={portalUrl}
          onCancel={() => setAdding(false)}
          onSaved={refresh}
          customRoles={rosterRoles}
        />
      )}

      {person && (
        <AddStaffForm
          portalUrl={portalUrl}
          member={person}
          terms={termsFor(person)}
          onCancel={() => setPerson(null)}
          onSaved={refresh}
          customRoles={rosterRoles}
        />
      )}

      {credentialsFor && (
        <CredentialsDialog
          portalUrl={portalUrl}
          member={credentialsFor}
          onClose={() => setCredentialsFor(null)}
        />
      )}

      {removing && (
        <DeleteMemberDialog
          state={removing}
          onCancel={() => { if (!removing.busy) setRemoving(null); }}
          onConfirm={async () => {
            const { member } = removing;
            setRemoving((prev) => ({ ...prev, busy: true, error: null }));
            try {
              if (member.isDesigner) await api.deleteDesigner(member.id);
              else await api.deleteTailor(member.id);
              setRemoving(null);
              refresh();
            } catch (err) {
              setRemoving((prev) => prev && ({
                ...prev, busy: false,
                error: err.message || `Could not delete ${member.name}. Please try again.`,
              }));
            }
          }}
        />
      )}

    </>
  );
}
