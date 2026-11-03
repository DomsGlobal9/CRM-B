import { createContext, useContext } from 'react';

/**
 * What every page of the workspace needs from App, the shell that holds it:
 * who is signed in, the boutique's settings, which page is open, and how to
 * reload after a save. App provides it around the whole workspace; a page
 * moved out of App.jsx reads it with useApp() instead of a long list of props.
 *
 *   currentUser       the signed-in user (role, modules, admin_tasks)
 *   boutiqueSettings  GET /boutique-settings/ (tier names, workflow, timezone)
 *   dashboardTab      the page on screen ('overview', 'orders', ...)
 *   setDashboardTab   open another page
 *   refresh           reload the workspace data (fetchDashboardAndConfig)
 *   adminCan(task)    whether the owner handed this user `task` as Admin
 *   isOwner           the signed-in user is the boutique's owner
 *
 * Data only one page uses stays a prop of that page.
 */
export const AppContext = createContext(null);

export function useApp() {
  const app = useContext(AppContext);
  if (!app) throw new Error('useApp() is used outside the workspace (no AppContext.Provider above it).');
  return app;
}
