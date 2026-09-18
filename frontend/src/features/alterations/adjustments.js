/**
 * Turn the free text people actually type at the counter into the object the
 * API stores.
 *
 *   waist: let out 1 inch      ->  {waist: "let out 1 inch"}
 *   sleeves feel tight         ->  {note_2: "sleeves feel tight"}
 *
 * One line per adjustment, and a line without a colon is kept whole rather
 * than thrown away -- somebody writing a sentence should not silently lose it.
 * Shared by the intake form and the inspection form so the two cannot drift.
 *
 * Capped at MAX_LINES lines of MAX_LINE_LENGTH characters: the object is
 * stored as JSON with no server-side size rule, and a garment does not have
 * more than twenty things wrong with it.
 */
export const MAX_LINES = 20;
export const MAX_LINE_LENGTH = 200;

export function parseAdjustments(text) {
  const out = {};
  (text || '')
    .split('\n')
    .map((line) => line.trim().slice(0, MAX_LINE_LENGTH))
    .filter(Boolean)
    .slice(0, MAX_LINES)
    .forEach((line, index) => {
      const at = line.indexOf(':');
      if (at > 0) out[line.slice(0, at).trim()] = line.slice(at + 1).trim();
      else out[`note_${index + 1}`] = line;
    });
  return out;
}

/** The inverse, for putting stored adjustments back into a textarea. */
export function formatAdjustments(data) {
  return Object.entries(data || {})
    .map(([key, value]) => (key.startsWith('note_') ? String(value) : `${key}: ${value}`))
    .join('\n');
}
