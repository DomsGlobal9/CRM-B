/* Several voice notes on one note: the list shape the recorders and the
   screens that play them share. Kept out of VoiceTextarea.jsx, which
   exports components only (fast refresh). */

/** How many voice notes one note keeps (mirrors core.validators.MAX_VOICE_NOTES). */
export const MAX_VOICE_NOTES = 10;

/** Voice notes as a list of { url, by, at } -- what a several-note recorder
 *  shows. Reads the list as stored, or the one note kept before there could be
 *  several (`single`: a URL, or one { url, by, at }) when the list is empty. */
export function voiceNoteList(value, single = null) {
  const list = (Array.isArray(value) ? value : (value ? [value] : []))
    .map((n) => (typeof n === 'string' ? { url: n } : n))
    .filter((n) => n && n.url);
  return list.length || !single ? list : voiceNoteList(single);
}
