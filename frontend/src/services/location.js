/**
 * The device's position, or null. Never rejects: a denied, absent or slow GPS
 * gives "no location" -- it never stops anyone saving. The outer timer is
 * there because the browser's own timeout does not start until the
 * permission prompt is answered, and an ignored prompt would hang the tap.
 * Shared by attendance check-in and the to-do form.
 */
export const currentLocation = () => currentLocationDetailed().then((r) => r.location);

const ask = (options, wait) => new Promise((resolve) => {
  const giveUp = setTimeout(() => resolve({ location: null, reason: 'timeout' }), wait);
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      clearTimeout(giveUp);
      resolve({ location: { latitude: coords.latitude, longitude: coords.longitude,
                            accuracy: Math.round(coords.accuracy) }, reason: null });
    },
    (err) => {
      clearTimeout(giveUp);
      resolve({ location: null,
                reason: err?.code === 1 ? 'denied' : err?.code === 3 ? 'timeout' : 'unavailable' });
    },
    options,
  );
});

/**
 * The position and, when there is none, why: 'denied' (location blocked for
 * this site), 'unavailable', 'timeout', 'unsupported' (no geolocation here)
 * or 'insecure' (only https or localhost may ask). Never rejects.
 *
 * A precise (GPS) fix first; a computer with no GPS often fails or times out
 * on that, so a failure other than "blocked" asks once more for the ordinary
 * Wi-Fi / network position, which is quick and usually enough.
 */
export const currentLocationDetailed = async () => {
  if (typeof window !== 'undefined' && window.isSecureContext === false) return { location: null, reason: 'insecure' };
  if (!navigator.geolocation) return { location: null, reason: 'unsupported' };
  const precise = await ask({ enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }, 15000);
  if (precise.location || precise.reason === 'denied') return precise;
  return ask({ enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }, 12000);
};

/** What to tell someone whose position did not come through, by reason. */
export const locationProblem = (reason) => ({
  denied: 'Location is blocked for this site. Click the lock icon next to the address bar, set Location to Allow, then tap “Add my location”.',
  timeout: 'Your device did not give a position in time. Check that location is on, then tap “Add my location”.',
  unavailable: 'Your device could not find its position. Check that location is on, then tap “Add my location”.',
  unsupported: 'This browser cannot share a location.',
  insecure: 'Location only works on a secure (https) address.',
}[reason] || '');
