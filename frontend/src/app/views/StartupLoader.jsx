import Loader from '../../components/ui/Loader';

/** The first load's spinner, while the saved session or the boutique's address is checked. */
export default function StartupLoader() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: 'var(--bg-color)', color: 'var(--text-primary)', fontSize: '18px', fontFamily: 'var(--font-sans, sans-serif)' }}>
      <div style={{ width: 'min(480px, 100% - 32px)' }}>
        <Loader page label="Loading Atelier CRM…" />
      </div>
    </div>
  );
}
