import { useSyncExternalStore } from 'react';
import { Moon, Sun } from 'lucide-react';
import { setColorMode, subscribeTheme } from '../theme';

const currentTheme = () => document.documentElement.dataset.theme || '';

/**
 * One tap between light and dark, beside the account chip. It saves the same
 * per-device choice as Settings > Appearance, and follows whichever theme is
 * really showing, so the two can never disagree.
 */
export function ThemeToggle({ className = '', size = 18 }) {
  const dark = useSyncExternalStore(subscribeTheme, currentTheme).endsWith('-dark');
  const label = dark ? 'Switch to light theme' : 'Switch to dark theme';
  return (
    <button type="button" className={className} title={label} aria-label={label}
            onClick={() => setColorMode(dark ? 'light' : 'dark')}>
      {dark ? <Sun size={size} /> : <Moon size={size} />}
    </button>
  );
}
