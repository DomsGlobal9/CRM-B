import { useEffect, useState } from 'react';
import { isProductionStaff } from '../../constants/roles';
import { api } from '../../api';
import { STAFF_SETUP_PREFIX, TENANT_ID_KEY, WIZARD_DRAFT_KEY } from '../../constants/storageKeys';

/**
 * Signing in and out: the saved session checked when the page opens (and an
 * order that was open reopened), logging in, the first sign-in's change of
 * password, opening the workspace on the right page for the role, a new staff
 * member's first setup, and logging out.
 */
export default function useSession({ setView, setDashboardTab, setCurrentUser, currentUser, portalSlug, dashboardTab, setAuthError, setChangeNew, setChangeConfirm, authBusy, setAuthBusy, changeCurrent, setChangeCurrent, changeNew, changeConfirm, loginEmail, loginPassword, setLoginPassword, setLoginEmail, setLoginUnlocked, resetToken, logoutBusy, setLogoutBusy, setJustRegistered, draftAfterReload, openDesignRequests, setLoading, setStaffSetup, staffSetup, setSetupCurrent, hydrateWizard, pendingLoads, fetchDashboardAndConfig }) {
  // The page the workspace was on when it was reloaded. Every page change is
  // recorded on the browser's history entry (useAppStateValue), and a reload
  // keeps that entry, so the restored session can open the same page again.
  // A page this user may no longer see falls back to their first one there.
  const [reloadedTab] = useState(() => {
    const state = window.history.state;
    return state?.atelier && state.view === 'dashboard' ? state.tab : null;
  });

  const setupKey = (user) => {
    let tenant = '';
    try { tenant = localStorage.getItem(TENANT_ID_KEY) || ''; } catch { /* private mode */ }
    return `${STAFF_SETUP_PREFIX}:${tenant}:${user?.id || user?.email || 'user'}`;
  };

  const storeSetup = (user, step) => {
    try { if (step) localStorage.setItem(setupKey(user), step); else localStorage.removeItem(setupKey(user)); } catch { /* private mode */ }
  };

  const storedSetup = (user) => {
    try { return localStorage.getItem(setupKey(user)); } catch { return null; }
  };

  const toProfileStep = (user) => {
    storeSetup(user, 'profile');
    setSetupCurrent('');
    setStaffSetup('profile');
    setDashboardTab('account');
  };

  // Done or skipped: the person's own first page, as a sign-in opens it.
  const finishStaffSetup = () => {
    storeSetup(currentUser, null);
    setStaffSetup(null);
    if (currentUser?.role === 'Designer') openDesignRequests();
    else if (isProductionStaff(currentUser?.role)) setDashboardTab('work');
    else setDashboardTab('overview');
  };

  // Step 2 is the My profile page: leaving it for another page ends the setup.
  useEffect(() => {
    if (staffSetup !== 'profile' || dashboardTab === 'account') return undefined;
    const timer = setTimeout(() => { storeSetup(currentUser, null); setStaffSetup(null); }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffSetup, dashboardTab]);

  useEffect(() => {
    if (resetToken) {
      window.history.replaceState({}, '', window.location.pathname);
      setLoading(false);
      return;
    }
    checkAuthSession();
  }, []);

  /** Where a signed-in user goes: the change-password screen while the
   *  account still has the temporary password the platform team emailed,
   *  otherwise their workspace. False when there is nothing to load. */
  const enterWorkspace = (user) => {
    setCurrentUser(user);
    if (user.must_change_password) {
      setChangeNew('');
      setChangeConfirm('');
      setAuthError(null);
      setView('change-password');
      return false;
    }
    setView('dashboard');
    if (user.role === 'Designer') {
      openDesignRequests();
    } else if (isProductionStaff(user.role)) {
      setDashboardTab('work');
    } else {
      setDashboardTab('overview');
    }
    return true;
  };

  const handleChangePasswordSubmit = async (e) => {
    if (e) e.preventDefault();
    if (authBusy) return;
    if (changeNew.length < 8) { setAuthError('The new password needs at least 8 characters.'); return; }
    if (changeNew !== changeConfirm) { setAuthError('Those two passwords do not match.'); return; }
    if (changeNew === changeCurrent) { setAuthError('Choose a password different from the temporary one.'); return; }
    setAuthBusy(true);
    setAuthError(null);
    try {
      const res = await api.changeMyPassword(changeCurrent, changeNew);
      setChangeCurrent('');
      setChangeNew('');
      setChangeConfirm('');
      setJustRegistered(true);
      if (res.user && enterWorkspace(res.user)) fetchDashboardAndConfig(res.user);
    } catch (err) {
      setAuthError(err.message || 'Could not change your password.');
    } finally {
      setAuthBusy(false);
    }
  };

  /** The page was reloaded while an order was open: open the same order again,
   *  as last saved. One already placed or discarded is simply not reopened. */
  const resumeAfterReload = async (id) => {
    try {
      const draft = await api.getOrderDraft(id);
      if (draft) await hydrateWizard(draft);
    } catch {
      try { sessionStorage.removeItem(WIZARD_DRAFT_KEY); } catch { /* ignore */ }
    }
  };

  const checkAuthSession = async () => {
    try {
      const user = await api.getMe();
      if (user && enterWorkspace(user)) {
        const step = storedSetup(user);
        if (step === 'password' || step === 'profile') {
          setStaffSetup(step);
          if (step === 'profile') setDashboardTab('account');
        } else if (reloadedTab) {
          setDashboardTab(reloadedTab);
        }
        await fetchDashboardAndConfig(user);
        if (draftAfterReload && step !== 'password' && step !== 'profile') await resumeAfterReload(draftAfterReload);
      }
    } catch (e) {
      console.log("No saved session");
    } finally {
      // The opening page's own data may still be on its way (loadData).
      if (!pendingLoads.current) setLoading(false);
    }
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    if (authBusy) return;
    if (!loginEmail || !loginPassword) {
      alert("Please fill in all credentials.");
      return;
    }
    setAuthError(null);
    setAuthBusy(true);
    try {
      const res = await api.login(loginEmail, loginPassword, portalSlug);
      // The temporary password is the "current" one the change screen asks for.
      setChangeCurrent(res.user.must_change_password ? loginPassword : '');
      // A newly added staff member's first sign-in here: the skippable setup,
      // with the password they signed in with as the one being replaced.
      setStaffSetup(null);
      if (res.first_sign_in && res.user?.role && res.user.role !== 'Owner') {
        setSetupCurrent(loginPassword);
        storeSetup(res.user, 'password');
        setStaffSetup('password');
      }
      setLoginPassword('');  // signed in: the password is not kept in the form
      setJustRegistered(false);
      if (enterWorkspace(res.user)) fetchDashboardAndConfig(res.user);
    } catch (err) {
      setAuthError(err.message || 'Invalid credentials.');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleLogout = async () => {
    if (logoutBusy) return;
    setLogoutBusy(true);
    try {
      await api.logout();
      setCurrentUser(null);
      setJustRegistered(false);
      // The login screen opens empty, not with the last person's details.
      setLoginEmail('');
      setLoginPassword('');
      setLoginUnlocked(false);
      setView('login');
    } finally {
      setLogoutBusy(false);
    }
  };

  return {
    setupKey,
    storeSetup,
    storedSetup,
    toProfileStep,
    finishStaffSetup,
    enterWorkspace,
    handleChangePasswordSubmit,
    resumeAfterReload,
    checkAuthSession,
    handleLoginSubmit,
    handleLogout,
  };
}
