import { Check, Eye, Globe } from 'lucide-react';
import { resolveMediaUrl } from '../../services/media';
import { FALLBACK, onImgError } from '../../components/ui/imageFallback';

/** The cards in the part picker: a photo to choose, and a picture found on the web. */

export function PickCard({ src, alt, picked, onClick, onView, onSelect, children, height = '110px' }) {
  return (
    <div
      style={{
        position: 'relative', background: 'var(--surface-color)', borderRadius: '9px',
        border: picked ? '2px solid var(--primary-color)' : '1px solid var(--border-color)',
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={onClick}
        style={{ padding: 0, margin: 0, border: 'none', background: 'none', cursor: 'pointer',
                 textAlign: 'left', display: 'block', width: '100%' }}
      >
        <div style={{ height, background: 'var(--brand-dark)' }}>
          <img src={resolveMediaUrl(src, FALLBACK)} alt={alt} loading="lazy" onError={onImgError}
               style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        </div>
        {children}
      </button>

      {onView && (
        <button
          type="button"
          title="View all parts of this design"
          onClick={(e) => { e.stopPropagation(); onView(); }}
          style={{ position: 'absolute', top: '6px', left: '6px', display: 'flex',
                   alignItems: 'center', gap: '4px', padding: '3px 8px', cursor: 'pointer',
                   borderRadius: '5px', border: 'none', fontSize: '10.5px', fontWeight: 600,
                   background: 'rgba(0,0,0,0.65)', color: '#fff', zIndex: 2 }}
        >
          <Eye size={11} /> View
        </button>
      )}

      {onSelect ? (
        <button
          type="button"
          title={picked ? "Deselect design" : "Select design"}
          onClick={(e) => { e.stopPropagation(); onSelect(); }}
          style={{ position: 'absolute', top: '6px', right: '6px', display: 'flex',
                   alignItems: 'center', gap: '4px', padding: '3px 8px', cursor: 'pointer',
                   borderRadius: '5px', border: 'none', fontSize: '10.5px', fontWeight: 600,
                   background: picked ? 'var(--primary-color)' : 'rgba(0,0,0,0.65)',
                   color: '#fff', zIndex: 2 }}
        >
          <Check size={11} /> {picked ? 'Selected' : 'Select'}
        </button>
      ) : (
        picked && (
          <span style={{ position: 'absolute', top: '6px', right: '6px', width: '20px', height: '20px',
                         borderRadius: '50%', background: 'var(--primary-color)', color: 'var(--primary-foreground)', display: 'flex',
                         alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', zIndex: 2 }}>
            <Check size={12} />
          </span>
        )
      )}
    </div>
  );
}

/** One picture found on the web: keep it on this part, or open where it came from. */
export function WebResultCard({ hit, kept, keeping, onKeep, sourceUrl, title }) {
  return (
    <div className={`web-result-card${kept ? ' is-kept' : ''}`}>
      <button type="button" className="web-result-media" onClick={onKeep} disabled={keeping}
              title={kept ? 'Kept on this part' : 'Keep this picture on this part'}
              style={{ cursor: kept ? 'default' : 'pointer' }}>
        <img src={hit.image_url} alt={title} loading="lazy"
             onError={onImgError} />
        {(kept || keeping) && (
          <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                         background: 'rgba(16,124,65,0.28)', color: '#fff', fontSize: '12px', fontWeight: 700,
                         letterSpacing: '0.02em', textShadow: '0 1px 2px rgba(0,0,0,0.4)' }}>
            {keeping ? 'Keeping…' : <><Check size={14} style={{ marginRight: '4px' }} /> Kept</>}
          </span>
        )}
        {!kept && !keeping && (
          <span style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '22px 8px 9px',
                         background: 'linear-gradient(to top, rgba(0,0,0,0.55), transparent)', color: '#fff',
                         fontSize: '12px', fontWeight: 600, textAlign: 'center', pointerEvents: 'none' }}>
            Click to keep
          </span>
        )}
      </button>
      <div className="web-result-body">
        <div className="web-result-title" title={title}>{title}</div>
        <a href={sourceUrl} target="_blank" rel="noopener noreferrer"
           style={{ fontSize: '11.5px', color: 'var(--text-secondary)', textDecoration: 'none',
                    display: 'inline-flex', alignItems: 'center', gap: '4px', maxWidth: '100%' }}>
          <Globe size={10} style={{ flexShrink: 0 }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {hit.source_domain?.replace(/^www\./, '') || 'source'}
          </span>
        </a>
        <div className="web-result-actions">
          <button type="button" className="btn-secondary"
                  onClick={(e) => { e.stopPropagation(); window.open(sourceUrl, '_blank', 'noopener'); }}>
            <Eye size={13} /> View
          </button>
          <button type="button" className={kept ? 'btn-secondary' : 'btn-primary'} disabled={keeping || kept}
                  onClick={onKeep}>
            {kept ? <><Check size={13} /> Kept</> : keeping ? 'Keeping…' : 'Keep'}
          </button>
        </div>
      </div>
    </div>
  );
}
