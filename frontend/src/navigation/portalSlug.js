export function portalSlugFromPath() {
  const segments = window.location.pathname.split('/').filter(Boolean);
  if (segments.length !== 1) return '';
  let only = segments[0];
  try {
    only = decodeURIComponent(only).toLowerCase();
  } catch {
    return '';  
  }
  return /^[a-z0-9]+$/.test(only) && only !== 'app' ? only : '';
}
