import { useState } from 'react';
import { MapPin } from 'lucide-react';
import { api } from '../services/api';

/**
 * The attendance pin. Saved on its own tap rather than with the form's autosave:
 * reading the GPS is a deliberate act done standing in the shop, and a position
 * should never be re-sent just because someone edited the phone number.
 */
export function ShopPin({ settings, onSaved }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const save = async (lat, lng) => {
    const formData = new FormData();
    formData.append('shop_latitude', lat);
    formData.append('shop_longitude', lng);
    onSaved(await api.updateBoutiqueSettings(formData));
  };
  const pin = () => {
    if (!navigator.geolocation) { setMessage('This browser cannot read a location.'); return; }
    setBusy(true);
    setMessage('');
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          await save(coords.latitude.toFixed(6), coords.longitude.toFixed(6));
          setMessage(`Saved (accurate to about ${Math.round(coords.accuracy)} m).`);
        } catch (err) {
          setMessage(err.message || 'Could not save the location.');
        } finally {
          setBusy(false);
        }
      },
      (err) => {
        setBusy(false);
        setMessage(err.code === 1
          ? 'Location permission was denied. Allow it in the browser and try again.'
          : 'Could not read your location. Try again near a window.');
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  };
  const pinned = settings?.shop_latitude != null;
  return (
    <div className="at-form-section" style={{ flexDirection: 'row', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
      <div className="at-row-main">
        <div className="at-row-title">{pinned ? 'Shop location set' : 'Shop location not set'}</div>
        <div className="at-row-sub">
          {message || (pinned
            ? 'Staff check-ins outside the radius below are flagged on the attendance screen.'
            : 'Stand in the shop and tap the button. Until then, check-ins are not compared to a location.')}
        </div>
      </div>
      <button type="button" className="btn-secondary at-btn-sm" onClick={pin} disabled={busy}>
        <MapPin size={14} /> {busy ? 'Reading location…' : pinned ? 'Update to my current location' : 'Use my current location'}
      </button>
      {pinned && (
        <button type="button" className="btn-secondary at-btn-sm" disabled={busy}
                onClick={() => save('', '').then(() => setMessage('Shop location cleared.'), (err) => setMessage(err.message))}>
          Clear
        </button>
      )}
    </div>
  );
}
