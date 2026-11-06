/**
 * Every name the workspace uses in the browser's storage, in one place.
 *
 * Do not rename one. What is stored can only be found under the name it was
 * saved with, so a new name signs people out or forgets their settings.
 *
 * Superadmin keeps its own names on purpose (superadmin/api.js, SuperAdmin.jsx).
 * The public site's site/layout.html also reads LANGUAGE_KEY's name; it is a
 * static page and cannot import this file.
 */

// Who is signed in.
export const TOKEN_KEY = 'token';
export const TENANT_ID_KEY = 'tenant_id';

// Choices remembered on this device.
export const LANGUAGE_KEY = 'app_language';
export const THEME_SYSTEM_KEY = 'design_system';
export const THEME_MODE_KEY = 'color_mode';
// The person's own pick on this device (Settings → Appearance); wins over the
// boutique default the platform set.
export const THEME_CHOICE_KEY = 'color_mode_choice';
export const NAV_COLLAPSED_KEY = 'nav_collapsed';
export const REPORTS_TAB_KEY = 'reports_tab';
export const STAFF_STATUS_VIEW_KEY = 'staff-team-status-view';
export const SHELVES_VIEW_KEY = 'inventory-shelves-view';
export const SHELVES_LOCATION_KEY = 'inventory-shelves-location';
export const RECENT_PLACES_KEY = 'inventory-recent-places';

// The order being written in this tab, so a reload reopens it where it was saved.
// sessionStorage: one tab only, gone when the tab closes; a reload keeps it.
export const WIZARD_DRAFT_KEY = 'order-wizard-draft';

// One for each boutique or person: the start of the name, or the whole name built here.
// v2: every guide shows once more after the page-by-page change (v1 marks
// from earlier tours are ignored).
export const TOUR_DONE_PREFIX = 'scaleezy_tour_done_v2';
export const STAFF_SETUP_PREFIX = 'scaleezy_staff_setup';
export const onboardingDismissedKey = (tenant) => `onboarding_dismissed_${tenant}`;
export const workOpenedKey = (userId) => `wk-opened:${userId}`;
