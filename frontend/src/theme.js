/**
 * Design systems are token packs; `data-theme` on <html> picks one.
 *
 * Two preferences: which system (scaleezy | atelier) and which mode (light |
 * dark | system). Adding a system is a new pack in themes.css plus one entry
 * in DESIGN_SYSTEMS; nothing in the components knows which one is on. Kept in
 * localStorage so the choice survives reloads, and applied before React
 * renders so the first paint is already in the right theme.
 */
export const DESIGN_SYSTEMS = [
  { key: 'scaleezy', label: 'Scaleezy', hint: 'Lime on Cloud Dancer, with a near-black shell.' },
  { key: 'atelier', label: 'Atelier', hint: 'Warm paper, forest green and brass.' },
];
export const COLOR_MODES = ['light', 'dark', 'system'];

const KEY_SYSTEM = 'design_system';
const KEY_MODE = 'color_mode';
// The person's own pick on this device (Settings → Appearance); wins over the
// boutique default the platform set.
const KEY_CHOICE = 'color_mode_choice';

const read = (key, allowed, fallback) => {
  try {
    const value = localStorage.getItem(key);
    return allowed.includes(value) ? value : fallback;
  } catch {
    return fallback;
  }
};

export const getThemePrefs = () => ({
  system: read(KEY_SYSTEM, DESIGN_SYSTEMS.map((d) => d.key), 'scaleezy'),
  mode: read(KEY_CHOICE, COLOR_MODES, null) || read(KEY_MODE, COLOR_MODES, 'light'),
});

/** Light, dark or 'system' (follow the device): the mode in force right now. */
export const getColorMode = () => getThemePrefs().mode;

/** Called from the product's Settings page; the choice stays on this device. */
export function setColorMode(mode) {
  if (!COLOR_MODES.includes(mode)) return applyTheme();
  try {
    localStorage.setItem(KEY_CHOICE, mode);
  } catch {
    // Private mode: the choice lasts for this page only.
  }
  return applyTheme();
}

const darkMedia = () =>
  (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null);

export const resolveTheme = ({ system, mode }) => {
  const dark = mode === 'dark' || (mode === 'system' && Boolean(darkMedia()?.matches));
  return dark ? `${system}-dark` : system;
};

export function applyTheme() {
  const name = resolveTheme(getThemePrefs());
  const root = document.documentElement;
  root.dataset.theme = name;
  root.style.colorScheme = name.endsWith('-dark') ? 'dark' : 'light';
  return name;
}

export function setThemePrefs(next) {
  const prefs = { ...getThemePrefs(), ...next };
  try {
    localStorage.setItem(KEY_SYSTEM, prefs.system);
    localStorage.setItem(KEY_MODE, prefs.mode);
  } catch {
    // Private mode: the choice lasts for this page only.
  }
  return applyTheme();
}

/**
 * The platform decides a boutique's look (see the console's Appearance card);
 * the workspace applies whatever /auth/me/ reports and remembers it, so the
 * next sign-in paints correctly before the network answers.
 */
export function applyTenantTheme(user) {
  if (!user) return null;
  const system = DESIGN_SYSTEMS.some((d) => d.key === user.design_system) ? user.design_system : 'scaleezy';
  const mode = COLOR_MODES.includes(user.color_mode) ? user.color_mode : 'light';
  return setThemePrefs({ system, mode });
}

let watching = false;
/** Follow the OS while the mode is "system". */
export function watchSystemMode() {
  const media = darkMedia();
  if (watching || !media) return;
  watching = true;
  media.addEventListener('change', () => { if (getThemePrefs().mode === 'system') applyTheme(); });
}
