/**
 * Resolve an image reference into a URL the browser can actually fetch.
 *
 * Seeded catalogue rows store a bare filename ("fabric_02.jpg") rather than a
 * URL, while owner-entered rows store a full external URL. Rendering the bare
 * filename directly makes the browser resolve it against the *frontend* origin,
 * so on Vercel every seeded image 404s at https://<site>/fabric_02.jpg. Deriving
 * the media host from the configured API URL fixes that, and replaces the
 * hardcoded http://localhost:8000/media/ that could only ever work locally.
 */

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

export const MEDIA_BASE = API_BASE.replace(/\/api\/?$/, '');

export const resolveMediaUrl = (url, fallback = '') => {
  if (!url) return fallback;
  if (/^https?:\/\//i.test(url) || url.startsWith('data:') || url.startsWith('blob:')) {
    return url;
  }
  if (url.startsWith('/')) return `${MEDIA_BASE}${url}`;
  return `${MEDIA_BASE}/media/${url}`;
};

/**
 * A phone photo made small enough to send quickly: at most `maxSide` px on its
 * long side, re-encoded as JPEG. Work photos only need to show the work, and a
 * 3-8 MB original crossed shop Wi-Fi and then went on to Cloudinary inside the
 * save. Anything that cannot be decoded here (HEIC on most browsers, a non-
 * image) or that would not get smaller goes as it was.
 */
export async function shrinkImage(file, maxSide = 1600, quality = 0.8) {
  if (!(file instanceof Blob) || !/^image\/(jpeg|png|webp)$/i.test(file.type || '')) return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';  // a transparent PNG would turn black as JPEG
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise((done) => canvas.toBlob(done, 'image/jpeg', quality));
    if (!blob || blob.size >= file.size) return file;
    const name = (file.name || 'photo').replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() });
  } catch {
    return file;
  }
}
