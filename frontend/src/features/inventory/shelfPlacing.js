/* The non-visual half of ShelfPlace.jsx: turning the chosen places into
   put-away lines, putting the stock on them, and the recent-places memory. */
import { api } from '../../services/api';

const RECENT_KEY = 'inventory-recent-places';
const RECENT_MAX = 4;

export const recentIds = () => {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]').filter(Boolean); } catch { return []; }
};
const rememberRecent = (ids) => {
  try {
    const next = [...ids, ...recentIds().filter((id) => !ids.includes(id))].slice(0, RECENT_MAX);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch { /* private mode */ }
};

// Quantities in thousandths, so 12.5 + 7.5 is exactly 20.
const milli = (v) => Math.round((Number(v) || 0) * 1000);
const fromMilli = (n) => String(n / 1000);

/**
 * The places a form chose, turned into put-away lines. Every place but the
 * last needs its amount; the last takes whatever is left. Returns { error }
 * or { lines: [{ spot, quantity }] }.
 */
export function placePlan(places, total) {
  if (!places?.length) return { lines: [] };
  const all = milli(total);
  const lines = [];
  let used = 0;
  for (let i = 0; i < places.length; i += 1) {
    const { spot, quantity } = places[i];
    const last = i === places.length - 1;
    const blank = quantity === '' || quantity == null;
    if (blank && !last) return { error: `Enter how much goes on ${spot.address}.` };
    const q = blank ? all - used : milli(quantity);
    if (q <= 0) {
      return { error: blank ? `The places above already take all of it: remove ${spot.address}.` : `Enter how much goes on ${spot.address}.` };
    }
    used += q;
    lines.push({ spot, quantity: fromMilli(q) });
  }
  if (used > all) return { error: `The places add up to ${fromMilli(used)}, more than the ${fromMilli(all)} being stocked.` };
  return { lines };
}

/** Put the just-stocked item on its shelves. Returns the places that failed, as text. */
export async function putOnShelves(itemId, lines) {
  const failed = [];
  const done = [];
  for (const line of lines) {
    try {
      await api.putAwayOnShelf({ location: line.spot.location, item: itemId, spot: line.spot.id, quantity: line.quantity });
      done.push(line.spot.id);
    } catch (err) {
      failed.push(`${line.spot.address} (${err.message})`);
    }
  }
  if (done.length) rememberRecent(done);
  return failed;
}

/** The sentence a form shows when the stock saved but a shelf refused it. */
export const shelfFailedText = (name, failed) => (
  `${name || 'The item'} is saved and in stock, but did not go on ${failed.join(', ')}. `
  + 'Put it on the shelf from Racks & shelves → Put away.'
);
