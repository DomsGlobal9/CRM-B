import { useMemo, useState } from 'react';
import { ImageOff, X } from 'lucide-react';
import { Lightbox } from '../../components/ui/Lightbox';
import { PickCard } from './PickerCards';

/** One design opened from the part picker: all its part photographs. */

export default function DesignModal({ design, partOrder, partLabels, selection, onChoose, onClose }) {
  const [viewIndex, setViewIndex] = useState(null);
  const images = useMemo(() => {
    const rank = new Map(partOrder.map((k, i) => [k, i]));
    return [...(design.images || [])].sort(
      (a, b) => (rank.get(a.part) ?? 999) - (rank.get(b.part) ?? 999));
  }, [design.images, partOrder]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}
         onClick={onClose}>
      <style>{`
        .design-part-grid {
          display: grid;
          gap: 14px;
          overflow: visible;
          /* minmax(0, 1fr) rather than a bare 1fr: a grid track's default
             minimum is its content, so a wide image would push the column past
             its share and break the row of four. */
          grid-template-columns: repeat(4, minmax(0, 1fr));
        }
        @media (max-width: 720px) { .design-part-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
        @media (max-width: 400px) { .design-part-grid { grid-template-columns: minmax(0, 1fr); } }
      `}</style>
      <div className="content-card"
           style={{ maxWidth: '980px', width: '100%', maxHeight: '90vh', overflowY: 'auto', margin: 0 }}
           onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                      marginBottom: '18px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '19px' }}>{design.title}</h3>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              {design.designer_name || 'Unattributed'} · {images.length} photograph
              {images.length === 1 ? '' : 's'} · click any to choose it
            </span>
          </div>
          <button className="btn-secondary" style={{ padding: '4px 10px' }} onClick={onClose}>
            <X size={14} />
          </button>
        </div>

        {images.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '24px 0',
                        color: 'var(--text-secondary)', fontSize: '13px' }}>
            <ImageOff size={16} /> This design has no part photographs yet.
          </div>
        ) : (
          <div className="design-part-grid">
            {images.map((image, i) => {
              const label = partLabels[image.part] || image.part.replace(/_/g, ' ');
              return (
                <PickCard
                  key={image.id}
                  src={image.image_url}
                  alt={label}
                  height="110px"
                  picked={selection[image.part]?.id === image.id}
                  onClick={() => onChoose(image.part,
                    { ...image, design_title: design.title, part_label: label })}
                  onView={() => setViewIndex(i)}
                >
                  <div style={{ padding: '6px 8px' }}>
                    <div style={{ fontSize: '11.5px', fontWeight: 600, overflow: 'hidden',
                                  textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {label}
                    </div>
                    {selection[image.part]?.id === image.id && (
                      <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--brand-link)' }}>
                        chosen
                      </div>
                    )}
                  </div>
                </PickCard>
              );
            })}
          </div>
        )}
      </div>

      {viewIndex !== null && images[viewIndex] && (
        <Lightbox
          items={images.map(img => ({
            image_url: img.image_url,
            label: partLabels[img.part] || img.part.replace(/_/g, ' '),
          }))}
          index={viewIndex}
          onIndexChange={setViewIndex}
          onClose={() => setViewIndex(null)}
          isSelected={selection[images[viewIndex].part]?.id === images[viewIndex].id}
          onToggle={() => onChoose(images[viewIndex].part, {
            ...images[viewIndex],
            design_title: design.title,
            part_label: partLabels[images[viewIndex].part]
                        || images[viewIndex].part.replace(/_/g, ' '),
          })}
        />
      )}
    </div>
  );
}
