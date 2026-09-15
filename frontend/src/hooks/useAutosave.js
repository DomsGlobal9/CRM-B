import { useEffect, useRef, useState } from 'react';

/**
 * Save a piece of work on its own: every `interval` ms (a minute by default)
 * when it has changed since the last save, and the moment the tab is hidden,
 * so switching away does not lose the last minute of typing.
 *
 * `getSnapshot` returns the work as a string, or null when there is nothing
 * to save; comparing strings is how "changed" is decided, so the caller
 * chooses what counts. `save` may throw: a failure leaves the work unsaved
 * and the next tick tries again. Turning `enabled` on takes a fresh baseline,
 * so opening a form is not a change; `paused` skips ticks without touching
 * the baseline, for while a manual save is already running.
 */
export default function useAutosave({ getSnapshot, save, enabled = true, paused = false, interval = 60000 }) {
  const latest = useRef({ getSnapshot, save, paused });
  useEffect(() => { latest.current = { getSnapshot, save, paused }; });
  const savedRef = useRef(null);
  const busyRef = useRef(false);
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!enabled) return undefined;
    savedRef.current = latest.current.getSnapshot();
    let cancelled = false;
    const tick = async () => {
      const { getSnapshot: snap, save: run, paused: hold } = latest.current;
      if (hold || busyRef.current) return;
      const current = snap();
      if (current == null || current === savedRef.current) return;
      busyRef.current = true;
      if (!cancelled) setSaving(true);
      try {
        await run();
        savedRef.current = current;
        if (!cancelled) setLastSavedAt(new Date());
      } catch {
        // Left unsaved on purpose: the next tick tries again.
      } finally {
        busyRef.current = false;
        if (!cancelled) setSaving(false);
      }
    };
    const id = setInterval(tick, interval);
    const onHide = () => { if (document.visibilityState === 'hidden') tick(); };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [enabled, interval]);

  return { lastSavedAt, saving };
}
