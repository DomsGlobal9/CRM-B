export const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const todayIso = () => isoDay(new Date());
export const plusDaysIso = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return isoDay(d); };
