import { useEffect } from 'react';
import { Check, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { resolveMediaUrl } from '../../services/media';
import { FALLBACK, onImgError } from './imageFallback';

/** A photo at full size, with the arrows to the others. */

// `details`: the item's full words under the photo (its label, then `value`
// and `sub` when it has them). `closeAtTop`: an icon-only close in the top
// corner instead of the Close button under the photo. Both off by default, so
// every lightbox that does not ask for them looks exactly as it did.
export function Lightbox({ items, index, onIndexChange, onClose, isSelected, onToggle, details = false, closeAtTop = false }) {
  const item = items[index];
  const many = items.length > 1;

  const step = (delta) => onIndexChange((index + delta + items.length) % items.length);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      else if (e.key === 'ArrowLeft' && many) { e.preventDefault(); e.stopPropagation(); step(-1); }
      else if (e.key === 'ArrowRight' && many) { e.preventDefault(); e.stopPropagation(); step(1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const close = (e) => { e.stopPropagation(); onClose(); };
  const stop = (fn) => (e) => { e.stopPropagation(); fn(); };

  const arrow = (side) => ({
    position: 'absolute', [side]: '18px', top: '50%', transform: 'translateY(-50%)',
    width: '44px', height: '44px', borderRadius: '50%', border: 'none', cursor: 'pointer',
    background: 'rgba(255,255,255,0.14)', color: '#fff', display: 'flex',
    alignItems: 'center', justifyContent: 'center',
  });

  return (
    <div onClick={close}
         style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', zIndex: 1100,
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  justifyContent: 'center', gap: '14px', padding: closeAtTop ? '64px 28px 28px' : '28px',
                  ...(details ? { overflowY: 'auto' } : {}) }}>

      {closeAtTop && (
        <button type="button" title="Close (Esc)" aria-label="Close" onClick={close}
                style={{ position: 'absolute', top: '14px', right: '14px', width: '42px', height: '42px',
                         borderRadius: '50%', border: 'none', cursor: 'pointer', zIndex: 1,
                         background: 'rgba(255,255,255,0.16)', color: '#fff', display: 'flex',
                         alignItems: 'center', justifyContent: 'center' }}>
          <X size={20} />
        </button>
      )}

      {many && (
        <>
          <button type="button" title="Previous (left arrow)"
                  onClick={stop(() => step(-1))} style={arrow('left')}>
            <ChevronLeft size={22} />
          </button>
          <button type="button" title="Next (right arrow)"
                  onClick={stop(() => step(1))} style={arrow('right')}>
            <ChevronRight size={22} />
          </button>
        </>
      )}

      <img src={resolveMediaUrl(item.image_url, FALLBACK)} alt={item.label} onError={onImgError}
           onClick={(e) => e.stopPropagation()}
           style={{ maxWidth: '100%',
                    // With the words under it, the photo leaves them room on a short screen.
                    maxHeight: details ? 'min(74vh, calc(100vh - 220px))' : '74vh',
                    objectFit: 'contain', borderRadius: '8px', display: 'block', ...(details ? { minHeight: 0 } : {}) }} />

      <div style={{ color: '#fff', fontSize: '13px', fontWeight: 600, textAlign: 'center',
                    maxWidth: 'min(640px, 100%)', overflowWrap: 'anywhere' }}
           onClick={(e) => e.stopPropagation()}>
        {item.label}
        {many && (
          <span style={{ opacity: 0.6, fontWeight: 400 }}> · {index + 1} of {items.length}</span>
        )}
        {details && item.value && item.value !== item.label && (
          <div style={{ fontSize: '15px', fontWeight: 600, marginTop: '4px' }}>{item.value}</div>
        )}
        {details && item.sub && (
          <div style={{ fontSize: '12.5px', fontWeight: 400, opacity: 0.75, marginTop: '2px' }}>{item.sub}</div>
        )}
        {details && item.href && (
          <a href={item.href} target="_blank" rel="noopener noreferrer"
             style={{ display: 'inline-block', marginTop: '6px', fontSize: '12.5px', fontWeight: 600, color: '#fff',
                      textDecoration: 'underline', overflowWrap: 'anywhere' }}>
            Open the link ↗
          </a>
        )}
      </div>

      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}
           onClick={(e) => e.stopPropagation()}>
        {onToggle && (
          <button
            type="button"
            className={isSelected ? 'btn-secondary' : 'btn-primary'}
            style={{ padding: '6px 16px', fontSize: '12px' }}
            onClick={stop(onToggle)}
          >
            {isSelected ? <><X size={13} /> Remove selection</> : <><Check size={13} /> Select this</>}
          </button>
        )}
        {!closeAtTop && (
          <button className="btn-secondary" style={{ padding: '6px 14px', fontSize: '12px' }}
                  onClick={close}>
            <X size={13} /> Close
          </button>
        )}
      </div>
    </div>
  );
}
