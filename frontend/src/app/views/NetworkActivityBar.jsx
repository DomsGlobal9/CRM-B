import { useState, useEffect } from 'react';

export function NetworkActivityBar() {
  const [active, setActive] = useState(false);
  useEffect(() => {
    const onActivity = (e) => setActive(e.detail > 0);
    window.addEventListener('api-activity', onActivity);
    return () => window.removeEventListener('api-activity', onActivity);
  }, []);
  if (!active) return null;
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: '3px', zIndex: 3000, overflow: 'hidden', background: 'rgba(15, 41, 30, 0.12)' }}>
      <div style={{ position: 'absolute', top: 0, bottom: 0, width: '38%', background: 'var(--text-primary, var(--text-primary))', borderRadius: '3px', animation: 'apiActivitySweep 1.1s ease-in-out infinite' }} />
    </div>
  );
}
