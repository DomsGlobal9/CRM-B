/**
 * The one loader. Every "we are fetching" state in the workspace renders this,
 * so a wait looks the same on Orders as it does inside a stock movement modal.
 *
 * Before this there were a dozen hand-written `<div>Loading…</div>`s, each with
 * its own padding, colour and wording, and several screens with no feedback at
 * all -- a modal that opened empty and filled in seconds later reads as broken,
 * and people click again. One component, four sizes:
 *
 *   <Loader page />     a whole screen's initial fetch
 *   <Loader modal />    inside a modal body, before its data arrives
 *   <Loader section />  one card or panel refreshing
 *   <Loader inline />   next to a label, in a row, inside a select
 *
 * Presentation only. It fetches nothing, decides nothing and holds no state;
 * the caller owns `loading` and passes it, so no permission or role boundary
 * can move because of a spinner. `role="status"` + `aria-live="polite"` so a
 * screen reader hears the wait instead of silence.
 *
 * The ring is a bordered circle, not an icon font or an SVG library: one
 * element, one transform animation, compositor-only, nothing to download. It
 * respects prefers-reduced-motion (index.css) by slowing to a pulse.
 */
export default function Loader({
  label,
  page = false,
  modal = false,
  section = false,
  inline = false,
  className = '',
  style,
}) {
  const variant = page ? 'page' : modal ? 'modal' : section ? 'section' : inline ? 'inline' : 'section';
  // An inline loader sits in a line of text, so it never announces itself
  // twice: the sentence around it already says what is happening.
  const text = label === undefined && variant !== 'inline' ? 'Loading…' : label;
  return (
    <div className={`ld ld--${variant} ${className}`} style={style}
         role="status" aria-live="polite" aria-busy="true">
      <span className="ld-ring" aria-hidden="true" />
      {text ? <span className="ld-text">{text}</span> : <span className="ld-sr">Loading</span>}
    </div>
  );
}

/**
 * Rows of the shape the table will have, for a list that is still arriving.
 * Used where a spinner would collapse the layout and make the page jump when
 * the data lands -- the point is that the box keeps its height.
 */
export function LoaderRows({ rows = 3, className = '' }) {
  return (
    <div className={`ld-rows ${className}`} role="status" aria-live="polite" aria-busy="true">
      {Array.from({ length: rows }, (_, i) => <span key={i} className="ld-row" />)}
      <span className="ld-sr">Loading</span>
    </div>
  );
}
