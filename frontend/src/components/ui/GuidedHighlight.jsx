/* First-time spotlight on a control: a breathing ring around the child and a
   bobbing callout above it, arrow pointing down at it. Only visual: the child
   is untouched and stays clickable, and nothing opens on its own. */
export function GuidedHighlight({ show, text, children }) {
  if (!show) return children;
  return (
    <span className="gh">
      {/* No text: the ring alone, without the callout above it. */}
      {text && <span className="gh-callout" role="note">{text}</span>}
      <span className="gh-ring">{children}</span>
    </span>
  );
}
