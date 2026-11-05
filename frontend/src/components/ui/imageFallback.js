/** What a picture falls back to when it has no address, or fails to load. */

export const FALLBACK =
  'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?w=400';

const PLACEHOLDER = 'data:image/svg+xml;utf8,'
  + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">'
    + '<rect width="160" height="160" fill="#ececea"/>'
    + '<path d="M44 108l26-32 18 22 12-14 20 24H44z" fill="#c4c4c0"/>'
    + '<circle cx="104" cy="58" r="9" fill="#c4c4c0"/></svg>');

export const onImgError = (e) => {
  if (e.currentTarget.src !== PLACEHOLDER) e.currentTarget.src = PLACEHOLDER;
};
