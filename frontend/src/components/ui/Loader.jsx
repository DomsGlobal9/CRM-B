
/* What a fetching page, dialog or panel looks like while its data arrives:
   grey blocks in the rough shape of the content, so nothing jumps when it
   lands. Inline (beside a control or in a line of text) stays a spinner. */
const SKELETONS = {
  page: { heading: true, cards: 3, rows: 5 },
  modal: { heading: true, cards: 0, rows: 3 },
  section: { heading: false, cards: 0, rows: 3 },
};

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

  if (variant !== 'inline') {
    const { heading, cards, rows } = SKELETONS[variant];
    return (
      <div className={`ld-skel ld-skel--${variant} ${className}`} style={style}
           role="status" aria-live="polite" aria-busy="true">
        {heading && <span className="ld-bone ld-bone--title" />}
        {heading && <span className="ld-bone ld-bone--line" />}
        {cards > 0 && (
          <div className="ld-skel-cards">
            {Array.from({ length: cards }, (_, i) => <span key={i} className="ld-bone ld-bone--card" />)}
          </div>
        )}
        {Array.from({ length: rows }, (_, i) => <span key={i} className="ld-row" />)}
        {/* The label is still read out; it is just not drawn. */}
        <span className="ld-sr">{label || 'Loading'}</span>
      </div>
    );
  }

  return (
    <div className={`ld ld--inline ${className}`} style={style}
         role="status" aria-live="polite" aria-busy="true">
      <span className="ld-ring" aria-hidden="true" />
      {label ? <span className="ld-text">{label}</span> : <span className="ld-sr">Loading</span>}
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
