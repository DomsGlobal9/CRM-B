
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
