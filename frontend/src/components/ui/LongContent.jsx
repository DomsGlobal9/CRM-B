import { Fragment, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

/** Long content kept tidy: text cut to a number of lines, and "See more". */

/** Calls `measure` with the element whenever its box changes or `watch` does. */
function useMeasure(ref, measure, watch) {
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    // An observer reports once when it starts, so this also covers first paint.
    const observer = new ResizeObserver(() => measure(el));
    observer.observe(el);
    return () => observer.disconnect();
    // `measure` is rebuilt each render; only `watch` should re-subscribe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, watch]);
}

/**
 * Text cut to `lines`, with the rest still reachable: only when it really is
 * cut, the full text becomes the tooltip and keyboard focus opens it out.
 * Screen readers always get all of it. Pass `fullText` when the children are
 * not plain text. `focusable={false}` inside a row or link that is itself
 * focusable.
 */
export function ClampedText({ children, lines = 1, fullText, focusable = true, as: Tag = 'span', className = '', style }) {
  const ref = useRef(null);
  const [cut, setCut] = useState(false);
  const plain = typeof children === 'string' || typeof children === 'number' ? String(children) : undefined;
  const whole = fullText ?? plain;
  useMeasure(ref, (el) => {
    setCut(el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1);
  }, `${whole}|${lines}`);
  return (
    <Tag ref={ref} className={`at-clamp ${lines === 1 ? 'at-clamp--one' : 'at-clamp--many'} ${className}`}
         style={lines === 1 ? style : { '--clamp-lines': lines, ...style }}
         title={cut ? whole : undefined} tabIndex={cut && focusable ? 0 : undefined}>
      {children}
    </Tag>
  );
}

/**
 * "See more" that appears only when there really is more.
 *
 * For content, give `maxHeight` (px): taller content is cut there, with a fade.
 * Content only a little taller (under 24px over) is shown whole, because a
 * button that reveals one more line is more work than the line.
 *
 * For a list, give `items`, `renderItem` and `limit`; `as` sets the list's tag,
 * `getKey` the item key.
 */
export function SeeMore({ children, maxHeight = 160, items, renderItem, getKey, limit = 5, as: Tag = 'div', moreLabel, lessLabel = 'Show less', className = '' }) {
  const [open, setOpen] = useState(false);
  const [tall, setTall] = useState(false);
  const innerRef = useRef(null);
  const isList = Array.isArray(items);
  useMeasure(innerRef, (el) => setTall(el.scrollHeight > maxHeight + 24), maxHeight);

  const toggle = (label) => (
    <button type="button" className="at-link at-seemore-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
      {label} {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
    </button>
  );

  if (isList) {
    const shown = open ? items : items.slice(0, limit);
    return (
      <>
        <Tag className={className}>
          {shown.map((item, i) => <Fragment key={getKey ? getKey(item) : i}>{renderItem(item, i)}</Fragment>)}
        </Tag>
        {items.length > limit && toggle(open ? lessLabel : (moreLabel || `See all ${items.length}`))}
      </>
    );
  }
  const clipped = tall && !open;
  return (
    <div className={className}>
      <div className={`at-seemore-body${clipped ? ' at-seemore-body--clip' : ''}`} style={clipped ? { maxHeight } : undefined}>
        <div ref={innerRef}>{children}</div>
      </div>
      {tall && toggle(open ? lessLabel : (moreLabel || 'See more'))}
    </div>
  );
}
