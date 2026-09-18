/**
 * A picture for every inventory row, photo or not.
 *
 * Most stock is filed from the catalogue in a hurry and never photographed;
 * a list of grey boxes helps nobody find the red cotton. So a row without a
 * photo shows a tile for what it is -- a weave for fabric, a spool for thread,
 * a button, a zip -- tinted with its own shade when one was recorded. Nothing
 * is stored: the tile is drawn here, so a better set later reaches every
 * boutique at once, and a real photo replaces it the moment one is uploaded.
 *
 * To swap a tile for a photograph, put the file under public/inventory/ and
 * name it in PHOTOS; everything else stays as it is.
 */

import { resolveMediaUrl } from './media';

/** Real photographs by tile key, when the boutique (or we) have them. */
const PHOTOS = {};

const PALETTE = {
  fabric: '#c8a97e', lining: '#e6dccb', border: '#b8860b', lace: '#d9c7d2',
  thread: '#5b7fa6', button: '#8c7a6b', zip: '#6b6f7a', elastic: '#7a8c6b',
  needle: '#8a8f99', embellishment: '#c94f7c', packaging: '#a67c52',
  maggam: '#b03a48', design: '#4c6ef5', other: '#8a8f99',
};

/** What the tile shows, from the category and the words in the name/group. */
export function inventoryTileKey(item) {
  const words = `${item?.name || ''} ${item?.kind || ''} ${item?.sub_category || ''} ${item?.section_full_name || ''}`.toLowerCase();
  // Whole words: 'pink' is not a pin and 'necklace' is not lace.
  const has = (...ws) => ws.some((w) => new RegExp(`\\b${w}s?\\b`).test(words));
  if (has('button')) return 'button';
  if (has('zip', 'zipper')) return 'zip';
  if (has('thread', 'yarn')) return 'thread';
  if (has('elastic')) return 'elastic';
  if (has('needle', 'pin', 'hook')) return 'needle';
  if (has('lace')) return 'lace';
  switch (item?.category) {
    case 'FABRIC': return 'fabric';
    case 'LINING': return 'lining';
    case 'BORDER': return 'border';
    case 'EMBELLISHMENT': return 'embellishment';
    case 'STITCHING': return 'thread';
    case 'PACKAGING': return 'packaging';
    case 'MAGGAM': return 'maggam';
    case 'DESIGN': return 'design';
    default: return 'other';
  }
}

const hex = (v) => (/^#[0-9a-fA-F]{6}$/.test(v || '') ? v : '');
const darker = (h, by = 0.28) => {
  const n = parseInt(h.slice(1), 16);
  const c = (s) => Math.max(0, Math.round(((n >> s) & 255) * (1 - by)));
  return `#${[16, 8, 0].map((s) => c(s).toString(16).padStart(2, '0')).join('')}`;
};
const lighter = (h, by = 0.35) => {
  const n = parseInt(h.slice(1), 16);
  const c = (s) => Math.min(255, Math.round(((n >> s) & 255) + (255 - ((n >> s) & 255)) * by));
  return `#${[16, 8, 0].map((s) => c(s).toString(16).padStart(2, '0')).join('')}`;
};

// Line art per tile, drawn over the tinted ground; `ink` is the stroke colour.
const ART = {
  fabric: (ink) => `<g stroke="${ink}" stroke-width="2" opacity=".45">${[0, 24, 48, 72, 96, 120, 144].map((o) => `<line x1="${o}" y1="0" x2="${o + 160}" y2="160"/><line x1="${o}" y1="160" x2="${o + 160}" y2="0"/>`).join('')}</g>`,
  lining: (ink) => `<g stroke="${ink}" stroke-width="1.5" opacity=".35">${[20, 50, 80, 110, 140].map((o) => `<line x1="${o}" y1="0" x2="${o}" y2="160"/><line x1="0" y1="${o}" x2="160" y2="${o}"/>`).join('')}</g>`,
  border: (ink) => `<g stroke="${ink}" stroke-width="3" fill="none" opacity=".7"><path d="M0 60 q20 -25 40 0 t40 0 t40 0 t40 0"/><path d="M0 100 q20 25 40 0 t40 0 t40 0 t40 0"/><line x1="0" y1="45" x2="160" y2="45"/><line x1="0" y1="115" x2="160" y2="115"/></g>`,
  lace: (ink) => `<g stroke="${ink}" stroke-width="2" fill="none" opacity=".6">${[30, 80, 130].map((y) => [30, 80, 130].map((x) => `<circle cx="${x}" cy="${y}" r="16"/><circle cx="${x}" cy="${y}" r="6"/>`).join('')).join('')}</g>`,
  thread: (ink) => `<g stroke="${ink}" stroke-width="3" fill="none" opacity=".8"><rect x="55" y="30" width="50" height="100" rx="6"/><line x1="45" y1="30" x2="115" y2="30"/><line x1="45" y1="130" x2="115" y2="130"/>${[50, 62, 74, 86, 98, 110].map((y) => `<line x1="58" y1="${y}" x2="102" y2="${y + 4}"/>`).join('')}</g>`,
  button: (ink) => `<g stroke="${ink}" stroke-width="3" fill="none" opacity=".8"><circle cx="80" cy="80" r="44"/><circle cx="80" cy="80" r="34" opacity=".5"/><circle cx="68" cy="68" r="5"/><circle cx="92" cy="68" r="5"/><circle cx="68" cy="92" r="5"/><circle cx="92" cy="92" r="5"/></g>`,
  zip: (ink) => `<g stroke="${ink}" stroke-width="3" fill="none" opacity=".8"><line x1="80" y1="10" x2="80" y2="150"/>${[20, 36, 52, 68, 84, 100, 116, 132].map((y) => `<line x1="66" y1="${y}" x2="80" y2="${y + 8}"/><line x1="94" y1="${y + 8}" x2="80" y2="${y + 16}"/>`).join('')}<rect x="70" y="40" width="20" height="26" rx="4" fill="${ink}" opacity=".9"/></g>`,
  elastic: (ink) => `<g stroke="${ink}" stroke-width="3" fill="none" opacity=".8"><path d="M10 80 q10 -30 20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0"/><line x1="10" y1="60" x2="150" y2="60" opacity=".4"/><line x1="10" y1="100" x2="150" y2="100" opacity=".4"/></g>`,
  needle: (ink) => `<g stroke="${ink}" stroke-width="3" fill="none" opacity=".8"><line x1="30" y1="130" x2="130" y2="30"/><ellipse cx="120" cy="40" rx="6" ry="10" transform="rotate(45 120 40)"/><path d="M40 120 q-20 20 -10 30" opacity=".6"/></g>`,
  embellishment: (ink) => `<g fill="${ink}" opacity=".8">${[[40, 50, 14], [100, 40, 10], [70, 100, 18], [120, 110, 12]].map(([x, y, r]) => `<path d="M${x} ${y - r} L${x + r / 3} ${y - r / 3} L${x + r} ${y} L${x + r / 3} ${y + r / 3} L${x} ${y + r} L${x - r / 3} ${y + r / 3} L${x - r} ${y} L${x - r / 3} ${y - r / 3} Z"/>`).join('')}</g>`,
  packaging: (ink) => `<g stroke="${ink}" stroke-width="3" fill="none" opacity=".8"><path d="M30 60 L80 40 L130 60 L130 120 L80 140 L30 120 Z"/><line x1="80" y1="40" x2="80" y2="140" opacity=".5"/><line x1="30" y1="60" x2="80" y2="80" /><line x1="130" y1="60" x2="80" y2="80"/></g>`,
  maggam: (ink) => `<g stroke="${ink}" stroke-width="3" fill="none" opacity=".8"><circle cx="80" cy="80" r="40"/><circle cx="80" cy="80" r="52" stroke-dasharray="4 8"/><path d="M60 80 q20 -30 40 0 q-20 30 -40 0" fill="${ink}" opacity=".5"/></g>`,
  design: (ink) => `<g stroke="${ink}" stroke-width="3" fill="none" opacity=".8"><path d="M40 120 L110 50 L124 64 L54 134 L36 138 Z"/><line x1="100" y1="60" x2="114" y2="74"/></g>`,
  other: (ink) => `<g stroke="${ink}" stroke-width="3" fill="none" opacity=".8"><path d="M40 40 h50 l40 40 l-50 50 l-40 -40 Z"/><circle cx="60" cy="60" r="6"/></g>`,
};

/** An SVG data URI tile for the item: its own shade when known, the family's otherwise. */
export function inventoryTile(item) {
  const key = inventoryTileKey(item);
  const ground = hex(item?.color_hex) || PALETTE[key] || PALETTE.other;
  // Ink darker than the ground, unless the ground is already near black.
  const n = parseInt(ground.slice(1), 16);
  const luma = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  const ink = luma < 70 ? lighter(ground, 0.6) : darker(ground);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${lighter(ground)}"/><stop offset="1" stop-color="${ground}"/></linearGradient></defs><rect width="160" height="160" fill="url(#g)"/>${ART[key](ink)}</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** The picture to show for a row: its photo, else a photograph we ship for the family, else the tile. */
export function inventoryImage(item) {
  return resolveMediaUrl(item?.image_url) || PHOTOS[inventoryTileKey(item)] || inventoryTile(item);
}
