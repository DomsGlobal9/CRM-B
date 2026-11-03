import { resolveMediaUrl } from '../../services/media';

export const UserAvatar = ({ user, size }) => {
  const url = resolveMediaUrl(user?.profile_photo || '');
  const initial = (user?.first_name || user?.name || user?.email || 'U').trim().charAt(0).toUpperCase();
  const box = size ? { width: size, height: size } : { width: '100%', height: '100%' };
  if (url) {
    return <img src={url} alt="" style={{ ...box, borderRadius: '50%', objectFit: 'cover' }} />;
  }
  return (
    <div className="user-avatar-initial"
         style={{ ...box, borderRadius: '50%', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', background: 'color-mix(in srgb, var(--primary-color) 24%, var(--surface-color))',
                  color: 'var(--accent-text)', fontWeight: 700, fontSize: size ? size * 0.42 : '1em' }}>
      {initial}
    </div>
  );
};
