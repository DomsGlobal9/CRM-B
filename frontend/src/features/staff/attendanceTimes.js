
/** datetime-local values for the attendance forms, in the browser's own time. */

export const forInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export const nowForInput = () => forInput(new Date().toISOString());

/** Times typed by hand: neither in the future, and out after in; '' when fine. */
export const timesError = (checkIn, checkOut) => {
  const now = nowForInput();
  if (checkIn && checkIn > now) return 'The check-in time cannot be in the future.';
  if (checkOut && checkOut > now) return 'The check-out time cannot be in the future.';
  if (checkIn && checkOut && checkOut < checkIn) return 'The check-out time must be after the check-in time.';
  return '';
};
