import { useState } from 'react';
import { Eye, X } from 'lucide-react';
import { resolveMediaUrl } from '../../services/media';
import { Lightbox } from '../../components/ui/Lightbox';
import { FALLBACK, onImgError } from '../../components/ui/imageFallback';

/** The designs chosen so far, garment by garment. */

export function SelectedDesignSummary({ garmentJobs = [], onClear }) {
  const [viewIndex, setViewIndex] = useState(null);

  const sections = garmentJobs
    .map(job => ({
      key: job.key,
      name: job.template?.name || job.key,
      picks: Object.entries(job.design?.parts || {})
        .filter(([, image]) => image)
        .map(([part, image]) => ({ part, image })),
    }))
    .filter(section => section.picks.length > 0);

  if (sections.length === 0) return null;

  const total = sections.reduce((n, s) => n + s.picks.length, 0);

  const viewItems = sections.flatMap(section =>
    section.picks.map(({ part, image }) => ({
      sectionKey: section.key,
      part,
      image_url: image.image_url,
      label: `${image.part_label || part.replace(/_/g, ' ')} · ${section.name}`,
    })));

  const flatIndexOf = (sectionKey, part) =>
    viewItems.findIndex(i => i.sectionKey === sectionKey && i.part === part);

  return (
    <div className="content-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                    flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
        <div className="card-title" style={{ margin: 0 }}>Your selected designs</div>
        <span style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>
          {total} design{total === 1 ? '' : 's'} across {sections.length} garment
          {sections.length === 1 ? '' : 's'}
        </span>
      </div>

      {sections.map((section) => (
        <div key={section.key} style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '10px',
                        borderBottom: '1px solid var(--border-color)', paddingBottom: '5px' }}>
            <span style={{ fontSize: '13.5px', fontWeight: 700 }}>{section.name}</span>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
              {section.picks.length} chosen
            </span>
          </div>

          {/* A row that scrolls sideways rather than wrapping: an eleven-part
              anarkali would otherwise push the next garment's section off the
              bottom of the screen, which is the thing this summary exists to
              stop. */}
          <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '4px' }}>
            {section.picks.map(({ part, image }) => (
              <div key={part} style={{ width: '112px', flexShrink: 0, position: 'relative' }}>
                <div style={{ height: '104px', background: 'var(--brand-dark)', borderRadius: '8px',
                              overflow: 'hidden', border: '1px solid var(--border-color)' }}>
                  <img src={resolveMediaUrl(image.image_url, FALLBACK)} onError={onImgError}
                       alt={image.part_label || part} loading="lazy"
                       style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                </div>
                <button
                  type="button"
                  title="View full size"
                  onClick={() => setViewIndex(flatIndexOf(section.key, part))}
                  style={{ position: 'absolute', top: '5px', left: '5px', display: 'flex',
                           alignItems: 'center', gap: '3px', padding: '3px 7px', cursor: 'pointer',
                           borderRadius: '5px', border: 'none', fontSize: '10px', fontWeight: 600,
                           background: 'rgba(0,0,0,0.62)', color: '#fff' }}
                >
                  <Eye size={10} /> View
                </button>
                {onClear && (
                  <button
                    type="button"
                    title="Remove this choice"
                    onClick={() => onClear(section.key, part)}
                    style={{ position: 'absolute', top: '5px', right: '5px', width: '19px',
                             height: '19px', borderRadius: '50%', border: 'none', cursor: 'pointer',
                             background: 'rgba(0,0,0,0.62)', color: '#fff', fontSize: '11px',
                             lineHeight: '19px', padding: 0 }}
                  >
                    <X size={11} />
                  </button>
                )}
                <div style={{ fontSize: '11px', fontWeight: 600, marginTop: '5px',
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {image.part_label || part.replace(/_/g, ' ')}
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text-secondary)',
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {image.design_title || ''}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {viewIndex !== null && viewItems[viewIndex] && (
        <Lightbox
          items={viewItems}
          index={viewIndex}
          onIndexChange={setViewIndex}
          onClose={() => setViewIndex(null)}
        />
      )}
    </div>
  );
}
