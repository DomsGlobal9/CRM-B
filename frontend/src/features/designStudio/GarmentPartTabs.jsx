import { useEffect, useRef, useState } from 'react';
import { Check, ImageOff } from 'lucide-react';

import { api } from '../../services/api';
import { resolveMediaUrl } from '../../services/media';
import Loader from '../../components/ui/Loader';

/**
 * A garment's parts as tabs, and the photographs filed under the active one.
 *
 * A boutique looking for a pallu is not looking for a saree: the pallu they
 * want is on one design and the border they want is on another. So selecting a
 * part gathers every photograph of it across the whole garment's designs,
 * rather than making them open twenty sarees to find four pallus.
 *
 * Reads the part-images endpoint, which already answers exactly this question
 * and returns the requested part's photographs only -- a garment with five
 * hundred designs has thousands of part photographs and no screen needs them
 * all. The tab labels and their order come from the garment template's own
 * `design_parts`, so they are the same words, in the same order, that the
 * upload form files photographs under. Nothing here declares a part list of
 * its own: a part the boutique adds to a template appears here by itself.
 *
 * Every declared part gets a tab whether or not anything has been uploaded for
 * it. An empty Pallu tab tells the boutique what is missing, and hiding it
 * would make the gap invisible.
 *
 * `active` is null for the caller's own view, which is the last tab.
 */

const FALLBACK =
  'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?w=400';

/** The tab strip on its own.
 *
 *  Split out because two screens show these tabs over different things: the
 *  library shows the boutique's whole catalogue filed by part, and the order
 *  wizard shows the same parts over photographs a customer can pick. The strip
 *  is the shared half; what sits under it is not.
 */
export function PartTabStrip({ parts = [], active, onChange, allLabel = 'All Designs', showNext = true, nextAsDone = false, allFirst = false }) {
  const strip = useRef(null);

  if (parts.length === 0) return null;

  /** A plain wheel over the strip scrolls it sideways.
   *
   *  A trackpad already sends deltaX and needs nothing; a mouse has only a
   *  vertical wheel, and over a one-row strip that scrolled the page instead.
   *  Claimed only while the strip actually has somewhere to go, so a wheel over
   *  tabs that all fit still scrolls the page.
   */
  const onWheel = (e) => {
    const el = strip.current;
    if (!el || e.deltaX !== 0 || el.scrollWidth <= el.clientWidth) return;
    el.scrollLeft += e.deltaY;
    e.preventDefault();
  };

  // `allFirst`: the whole-design tab leads the strip instead of closing it.
  const all = allLabel ? [{ key: null, label: allLabel }] : [];
  const tabs = allFirst ? [...all, ...parts] : [...parts, ...all];
  // The tab after the open one; nothing after the last, so the strip has an end.
  const activeIndex = tabs.findIndex((p) => p.key === active);
  // showNext false: a screen that wants the plain tabs, no "Next" button or arrow.
  const next = !showNext || activeIndex === -1 ? null : (tabs[activeIndex + 1] || null);

  return (
    <>
      {/* Every part in view at once: the tabs wrap onto a second line inside
          their grey track rather than one row scrolled sideways, so no part
          hides off the edge of a phone -- the app's .tabs-header wraps the same
          way. The open part is the raised pill the theme gives an active tab
          (index.css, .at-part-tabs .tab-btn.active). "Next" sits beside the
          track on a wide screen and on its own line, right-aligned, on a
          phone. Scoped to this component's own class, so the shared
          .tabs-header rules are untouched. */}
      <style>{`
        .at-part-tabs {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          width: 100%;
          gap: 10px 12px;
          margin-bottom: 16px;
        }
        .at-part-tabs-scroll {
          display: flex;
          flex: 0 1 auto;
          min-width: 0;
          max-width: 100%;
          flex-wrap: wrap;
          align-items: center;
          gap: 4px;
          padding: 4px;
          background: var(--tab-track, var(--surface-inset, #f4f4f5));
          border: 1px solid var(--border-color, #e4e4e7);
          border-radius: 10px;
        }
        .at-part-tabs .tab-btn {
          flex: 0 0 auto;
          max-width: 100%;
          min-height: 34px;
          white-space: nowrap;
          padding: 7px 14px;
          font-size: 13px;
          font-weight: 500;
          line-height: 1.3;
          border-radius: 7px;
          border: 1px solid transparent;
          background: transparent;
          color: var(--text-secondary, #64748b);
          transition: background-color 0.15s ease, color 0.15s ease;
          cursor: pointer;
        }
        .at-part-tabs .tab-btn.active {
          background: var(--surface-color, #ffffff);
          color: var(--text-primary, #0f172a);
          font-weight: 600;
          box-shadow: 0 1px 3px rgba(0,0,0,0.12);
        }
        .at-part-tabs .tab-btn:hover:not(.active) {
          background: rgba(0, 0, 0, 0.05);
          color: var(--text-primary, #0f172a);
        }
        .at-part-tabs .tab-btn:focus-visible {
          outline: 2px solid var(--primary-color, #18181b);
          outline-offset: 2px;
        }
        .at-part-tabs .tab-next {
          margin-left: auto;
          padding: 7px 4px 7px 12px;
          font-weight: 600;
          color: var(--text-primary, #0f172a);
        }
        .at-part-tabs .tab-next:hover:not(.active) {
          background: transparent;
          text-decoration: underline;
        }
        /* nextAsDone: the same button as a filled "Done" that moves on. */
        .at-part-tabs .tab-next.tab-done {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 7px 18px;
          border-radius: 8px;
          background: var(--primary-color, #18181b);
          color: var(--primary-foreground, #ffffff);
          box-shadow: 0 1px 2px rgba(0,0,0,0.08);
        }
        .at-part-tabs .tab-next.tab-done:hover:not(.active) {
          background: var(--primary-color, #18181b);
          text-decoration: none;
          filter: brightness(0.95);
        }
        @media (max-width: 560px) {
          .at-part-tabs-scroll { flex-basis: 100%; }
          .at-part-tabs .tab-btn {
            padding: 6px 12px;
            font-size: 12.5px;
            white-space: normal; /* a long part name wraps inside its tab */
            text-align: left;
          }
          .at-part-tabs .tab-next {
            flex-basis: 100%;
            justify-content: flex-end; /* buttons are flex boxes app-wide */
            text-align: right;
          }
          .at-part-tabs .tab-next.tab-done { justify-content: center; min-height: 40px; }
        }
      `}</style>
      <div className="at-part-tabs" role="tablist">
        <div className="at-part-tabs-scroll" ref={strip} onWheel={onWheel}>
        {/* allLabel null means there is no view behind these tabs other than
            the parts themselves, so the strip is parts alone. */}
        {tabs.map((part) => (
          <button
            key={part.key || '__all__'}
            type="button"
            role="tab"
            aria-selected={active === part.key}
            className={`tab-btn ${active === part.key ? 'active' : ''}`}
            onClick={() => onChange(part.key)}
          >
            {part.label}
            {/* The arrow on the open tab points at the one to fill in next, so
                a form with eight parts says where to go rather than leaving the
                customer to guess. */}
            {active === part.key && next ? ' →' : ''}
          </button>
        ))}
        </div>
        {next && (
          <button
            type="button"
            className={`tab-btn tab-next${nextAsDone ? ' tab-done' : ''}`}
            aria-label={nextAsDone ? `Done, go to ${next.label}` : `Next: ${next.label}`}
            onClick={() => {
              onChange(next.key);
              // The new tab may sit behind the fade: bring it into view.
              requestAnimationFrame(() => strip.current?.querySelector('[aria-current="true"], .active')?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }));
            }}
          >
            {nextAsDone ? <><Check size={15} strokeWidth={2.5} /> Done</> : <>Next: {next.label} →</>}
          </button>
        )}
      </div>
    </>
  );
}


export default function GarmentPartTabs({
  garmentKey, parts = [], active, onChange, onOpenDesign, allLabel = 'All Designs', showNext = true,
  wholeDesignCount = 0, onShowAll = null, allFirst = false,
}) {
  // Stamped with the tab it answers, so "still loading" is derived from the
  // stamp not matching rather than from a flag an effect has to clear first.
  const [answer, setAnswer] = useState(null);
  const stamp = `${garmentKey}:${active}`;
  const current = answer?.stamp === stamp ? answer : null;

  useEffect(() => {
    if (!active) return undefined;
    let cancelled = false;
    api.getGarmentPartImages({ garment_key: garmentKey, part: active })
      .then((data) => { if (!cancelled) setAnswer({ stamp, images: data.images || [] }); })
      .catch((err) => { if (!cancelled) setAnswer({ stamp, error: err.message }); });
    return () => { cancelled = true; };
  }, [garmentKey, active, stamp]);

  if (parts.length === 0) return null;

  const activeLabel = parts.find((p) => p.key === active)?.label || '';

  return (
    <>
      <PartTabStrip parts={parts} active={active} onChange={onChange} allLabel={allLabel} showNext={showNext} allFirst={allFirst} />

      {active && (
        <>
          <div className="gpt-part-head" style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '12px' }}>
            <span className="gpt-part-title" style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--text-lg)',
                           fontWeight: 500, color: 'var(--text-primary)' }}>
              {activeLabel}
            </span>
            <span className="gpt-part-count" style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              {current?.images
                ? `${current.images.length} design${current.images.length === 1 ? '' : 's'}`
                : 'loading…'}
            </span>
          </div>

          {/* Nothing had been drawn here while the part's images were in
              flight, so switching tab left a blank panel. The answer for this
              tab has not arrived when `current` is null -- a stale answer for
              the previous tab does not count as one. */}
          {!current && <Loader section label="Loading designs…" />}

          {current?.error && (
            <div style={{ fontSize: '13px', color: 'var(--danger-color)', padding: '24px 0' }}>
              {current.error}
            </div>
          )}

          {current?.images?.length === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
                          padding: '30px 0', color: 'var(--text-secondary)' }}>
              <ImageOff size={22} />
              <div style={{ fontSize: '13px' }}>No designs available for this part yet.</div>
              {/* The garment's designs saved as a whole picture, without part
                  photos, live under the last tab: say so, and open it. */}
              {wholeDesignCount > 0 && onShowAll && (
                <button type="button" className="btn-secondary at-btn-sm" style={{ marginTop: '6px' }} onClick={onShowAll}>
                  See {wholeDesignCount} design{wholeDesignCount === 1 ? '' : 's'} in {allLabel || 'All Designs'}
                </button>
              )}
            </div>
          )}

          {current?.images?.length > 0 && (
            <div className="dl-grid" style={{ display: 'grid', gap: '16px',
                          gridTemplateColumns: 'repeat(auto-fill, minmax(min(220px, 100%), 1fr))' }}>
              {current.images.map((image) => (
                // Opens the design the photograph came off, through the same
                // detail panel a card in the design grid opens -- one View,
                // not a second one written for this tab.
                <div key={image.id}
                     className="dl-card"
                     role="button"
                     tabIndex={0}
                     onClick={() => onOpenDesign?.(image.design_id)}
                     onKeyDown={(e) => {
                       if (e.key === 'Enter' || e.key === ' ') {
                         e.preventDefault(); onOpenDesign?.(image.design_id);
                       }
                     }}
                     style={{ border: '1px solid var(--border-color)', borderRadius: '10px',
                              overflow: 'hidden', background: 'var(--surface-color)',
                              cursor: onOpenDesign ? 'pointer' : 'default' }}>
                  <div className="dl-card-img" style={{ height: '170px', background: 'var(--brand-dark)' }}>
                    <img src={resolveMediaUrl(image.image_url, FALLBACK)}
                         alt={image.caption || activeLabel} loading="lazy"
                         style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  </div>
                  <div className="dl-card-body" style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div className="dl-card-title" style={{ fontSize: '14px', fontWeight: 600, overflow: 'hidden',
                                  textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {image.design_title || 'Untitled design'}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                      {image.designer || 'Unattributed'}
                    </div>
                    {image.caption && (
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', overflow: 'hidden',
                                    textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {image.caption}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
