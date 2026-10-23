/**
 * The device's position, or null. Never rejects: a denied, absent or slow GPS
 * gives "no location" -- it never stops anyone saving. The outer timer is
 * there because the browser's own timeout does not start until the
 * permission prompt is answered, and an ignored prompt would hang the tap.
 * Shared by attendance check-in and the to-do form.
 */
export const currentLocation = () => new Promise((resolve) => {
  if (!navigator.geolocation) { resolve(null); return; }
  const giveUp = setTimeout(() => resolve(null), 15000);
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      clearTimeout(giveUp);
      resolve({ latitude: coords.latitude, longitude: coords.longitude,
                accuracy: Math.round(coords.accuracy) });
    },
    () => { clearTimeout(giveUp); resolve(null); },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
  );
});
