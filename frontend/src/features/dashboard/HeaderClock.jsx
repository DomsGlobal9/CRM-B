import { useState, useEffect } from 'react';

export const HeaderClock = () => {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(id);
  }, []);
  const date = now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return (
    <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
      {date} · <b style={{ color: 'var(--text-primary)' }}>{time}</b>
    </span>
  );
};
