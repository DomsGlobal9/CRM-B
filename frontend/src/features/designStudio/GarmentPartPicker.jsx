import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Check, ChevronLeft, ChevronRight, Eye, Globe, ImageOff, Link as LinkIcon, Upload, X } from 'lucide-react';
import { AddPhotoButton } from '../../components/ui/Atelier';

import { api } from '../../services/api';
import { resolveMediaUrl } from '../../services/media';
import { PartTabStrip } from './GarmentPartTabs';
import DesignCatalogueFilter from './DesignCatalogueFilter';
import { useFabricTaxonomy } from '../fabrics/taxonomy';
import Loader from '../../components/ui/Loader';


const FALLBACK =
  'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?w=400';

const PLACEHOLDER = 'data:image/svg+xml;utf8,'
  + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">'
    + '<rect width="160" height="160" fill="#ececea"/>'
    + '<path d="M44 108l26-32 18 22 12-14 20 24H44z" fill="#c4c4c0"/>'
    + '<circle cx="104" cy="58" r="9" fill="#c4c4c0"/></svg>');
const onImgError = (e) => {
  if (e.currentTarget.src !== PLACEHOLDER) e.currentTarget.src = PLACEHOLDER;
};

function PickCard({ src, alt, picked, onClick, onView, children, height = '110px' }) {
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

      {picked && (
        <span style={{ position: 'absolute', top: '6px', right: '6px', width: '20px', height: '20px',
                       borderRadius: '50%', background: 'var(--primary-color)', color: 'var(--primary-foreground)', display: 'flex',
                       alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <Check size={12} />
        </span>
      )}

      {onView && (
        <button
          type="button"
          title="View full size"
          onClick={(e) => { e.stopPropagation(); onView(); }}
          style={{ position: 'absolute', top: '6px', left: '6px', display: 'flex',
                   alignItems: 'center', gap: '4px', padding: '3px 8px', cursor: 'pointer',
                   borderRadius: '5px', border: 'none', fontSize: '10.5px', fontWeight: 600,
                   background: 'rgba(0,0,0,0.62)', color: '#fff' }}
        >
          <Eye size={11} /> View
        </button>
      )}
    </div>
  );
}


/** One picture found on the web: keep it on this part, or open where it came from. */
function WebResultCard({ hit, kept, keeping, onKeep, sourceUrl, title }) {
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


export function Lightbox({ items, index, onIndexChange, onClose, isSelected, onToggle }) {
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
                  justifyContent: 'center', gap: '14px', padding: '28px' }}>

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
           style={{ maxWidth: '100%', maxHeight: '74vh', objectFit: 'contain',
                    borderRadius: '8px', display: 'block' }} />

      <div style={{ color: '#fff', fontSize: '13px', fontWeight: 600, textAlign: 'center' }}
           onClick={(e) => e.stopPropagation()}>
        {item.label}
        {many && (
          <span style={{ opacity: 0.6, fontWeight: 400 }}> · {index + 1} of {items.length}</span>
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
        <button className="btn-secondary" style={{ padding: '6px 14px', fontSize: '12px' }}
                onClick={close}>
          <X size={13} /> Close
        </button>
      </div>
    </div>
  );
}

function DesignModal({ design, partOrder, partLabels, selection, onChoose, onClose }) {
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

export const ACCESSORY_OPTIONS = [
  {
    key: 'dori',
    label: 'Dori',
    subtypes: ['Handmade Fabric Dori', 'Handmade Potli Dori', 'Readymade Metallic Dori', 'Readymade Thread Dori'],
    measurementLabel: 'Length (Inches)',
    placeholder: 'e.g. 18" - 24"',
  },
  {
    key: 'tassel_latkan',
    label: 'Tassel/Latkan',
    subtypes: ['Handmade Fabric Latkan', 'Hand Beaded / Maggam Latkan', 'Readymade Designer Latkan', 'Thread Tassels'],
    measurementLabel: 'Quantity & Hanging Length',
    placeholder: 'e.g. 1 Pair, 4 inches',
  },
  {
    key: 'border',
    label: 'Border',
    subtypes: ['Hand Embroidered / Maggam Border', 'Readymade Zari / Cutwork Border', 'Fabric Patch Border', 'Velvet / Satin Border'],
    measurementLabel: 'Length (Meters / Yards)',
    placeholder: 'e.g. 2.5m for dupatta or 6m for saree',
  },
  {
    key: 'lace_trim',
    label: 'Lace/Trim',
    subtypes: ['Handcrafted Crochet / Trim', 'Readymade Gota / Kiran', 'Embroidered Lace', 'Sequence / Mirror Work Lace'],
    measurementLabel: 'Length (Meters / Yards)',
    placeholder: 'e.g. 1.5m for sleeves or 9m for 4-side lace',
  },
  {
    key: 'buttons',
    label: 'Buttons',
    subtypes: ['Handmade Fabric Potli Buttons', 'Handmade Cloth Buttons', 'Readymade Fancy Metal Buttons', 'Pearl Buttons'],
    measurementLabel: 'Quantity (Pieces)',
    placeholder: 'e.g. 6 pcs or 12 pcs',
  },
  {
    key: 'zip',
    label: 'Zip',
    subtypes: ['Concealed / Invisible Zip', 'Heavy Duty Metallic Zip', 'Standard Nylon Zip'],
    measurementLabel: 'Zipper Length (Inches)',
    placeholder: 'e.g. 8" side zip or 12" back zip',
  },
  {
    key: 'hooks',
    label: 'Hooks',
    subtypes: ['Standard Hook & Eye', 'Heavy Duty Steel Hooks', 'Pant / Skirt Fastener'],
    measurementLabel: 'Quantity (Sets / Pairs)',
    placeholder: 'e.g. 5 pairs',
  },
  {
    key: 'elastic_drawstring',
    label: 'Elastic or Draw String',
    subtypes: ['Soft Waistband Elastic', 'Braided Cord Elastic', 'Cotton Drawstring (Nada)', 'Fabric Cord Drawstring'],
    measurementLabel: 'Length / Waist Size (Inches)',
    placeholder: 'e.g. 28" waist elastic or 36" nada',
  },
  {
    key: 'padding_cups',
    label: 'Padding/Cups',
    subtypes: ['Soft Padded Cups', 'Moulded Foam Cups', 'Push-up Cups', 'Heavy Density Bust Support'],
    measurementLabel: 'Bust / Cup Size',
    placeholder: 'e.g. Size 34, Size 36, Size 38',
  },
  {
    key: 'shoulder_pad',
    label: 'Shoulder Pad',
    subtypes: ['Thin Soft Shoulder Pad', 'Thick Moulded Shoulder Pad', 'Raglan Shoulder Pad'],
    measurementLabel: 'Size / Thickness',
    placeholder: 'e.g. Small / Standard Thin',
  },
  {
    key: 'decorative_motifs',
    label: 'Decorative Motifs',
    subtypes: ['Handmade Zardozi / Maggam Patch', 'Hand Embroidered Motif', 'Readymade Appliqué Motif', 'Sequin Patch'],
    measurementLabel: 'Dimensions (W × H Inches) & Quantity',
    placeholder: 'e.g. 4"x6", 2 pcs',
  },
  {
    key: 'fall',
    label: 'Fall',
    subtypes: ['Standard Cotton Fall', 'Terrycot Fall', 'Silk / Velvet Heavy Fall'],
    measurementLabel: 'Length (Meters)',
    placeholder: 'e.g. Standard 2.25m - 2.5m',
  },
  {
    key: 'lining',
    label: 'Lining',
    subtypes: ['Pure Cotton Lining (Aster)', 'Shantoon / Santoon Lining', 'Crepe / Micro Lining', 'Satin / Butter Silk Lining'],
    measurementLabel: 'Fabric Length (Meters)',
    placeholder: 'e.g. 1m for blouse or 3m for lehenga',
  },
  {
    key: 'other',
    label: 'Other',
    subtypes: ['Handmade / Custom Work', 'Readymade Bought Accessory', 'Special Trimming'],
    measurementLabel: 'Measurement / Requirement Details',
    placeholder: 'Enter measurement or specific requirement details',
  },
];

function AccessoryMultiSelectDropdown({
  options = ACCESSORY_OPTIONS,
  selectedKeys = [],
  onToggleKey,
  activeKey,
  onSelectActiveKey,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedCount = selectedKeys.length;

  return (
    <div style={{ marginBottom: '16px', position: 'relative' }} ref={dropdownRef}>
      <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
        Select Accessories (Choose one or more options):
      </label>

      {/* Multi-Select Dropdown Header */}
      <button
        type="button"
        className="form-control"
        onClick={() => setIsOpen((v) => !v)}
        style={{
          width: '100%',
          maxWidth: '420px',
          padding: '8px 12px',
          fontSize: '13px',
          fontWeight: 600,
          borderRadius: '8px',
          border: '1.5px solid var(--border-color, #d1d5db)',
          background: 'var(--surface-color, #fff)',
          color: 'var(--text-primary)',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          textAlign: 'left',
        }}
      >
        <span>
          {selectedCount === 0
            ? 'Select accessories from dropdown...'
            : `${selectedCount} Accessor${selectedCount === 1 ? 'y' : 'ies'} Selected`}
        </span>
        <span style={{ fontSize: '11px', opacity: 0.7 }}>{isOpen ? '▲' : '▼'}</span>
      </button>

      {/* Dropdown Menu Overlay */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            zIndex: 99,
            width: '100%',
            maxWidth: '420px',
            marginTop: '4px',
            maxHeight: '260px',
            overflowY: 'auto',
            background: 'var(--surface-color, #ffffff)',
            border: '1.5px solid var(--border-color, #d1d5db)',
            borderRadius: '8px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            padding: '8px',
          }}
        >
          {options.map((opt) => {
            const isChecked = selectedKeys.includes(opt.key);
            return (
              <label
                key={opt.key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '6px 10px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '12.5px',
                  fontWeight: isChecked ? 600 : 400,
                  background: isChecked ? 'rgba(16, 124, 65, 0.08)' : 'transparent',
                  color: isChecked ? 'var(--primary-color)' : 'var(--text-primary)',
                  marginBottom: '2px',
                }}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => onToggleKey(opt.key)}
                  style={{ width: '15px', height: '15px', accentColor: 'var(--primary-color)', cursor: 'pointer' }}
                />
                <span>{opt.label}</span>
              </label>
            );
          })}
        </div>
      )}

      {/* Selected Accessories Pills/Tabs */}
      {selectedKeys.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' }}>
          {selectedKeys.map((key) => {
            const opt = options.find((o) => o.key === key);
            if (!opt) return null;
            const isActive = activeKey === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => onSelectActiveKey(key)}
                style={{
                  padding: '4px 10px',
                  borderRadius: '16px',
                  border: isActive ? '1.5px solid var(--primary-color)' : '1px solid var(--border-color)',
                  background: isActive ? 'var(--primary-color)' : 'var(--surface-color, #f3f4f6)',
                  color: isActive ? '#fff' : 'var(--text-primary)',
                  fontSize: '11.5px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <span>{opt.label}</span>
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleKey(key);
                  }}
                  style={{ opacity: 0.8, fontSize: '11px', fontWeight: 700, padding: '0 2px' }}
                  title="Remove accessory"
                >
                  ✕
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function GarmentPartPicker({ garmentKey, garmentName, selection = {}, onChange,
                                            ownOnly = false, references = {},
                                            onReferencesChange, taxonomy = null, isFabric = false, accessoriesOnly = false }) {
  const fetchedTaxonomy = useFabricTaxonomy();
  const effectiveTaxonomy = taxonomy || fetchedTaxonomy;

  const [allDesigns, setAllDesigns] = useState(null);
  const [catalogueFilter, setCatalogueFilter] = useState({});
  const [template, setTemplate] = useState(null);
  const [error, setError] = useState(null);
  const [openDesign, setOpenDesign] = useState(null);
  const [viewIndex, setViewIndex] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [selectedAccessoryKeys, setSelectedAccessoryKeys] = useState(() => {
    const existing = Object.keys(references || {});
    return existing.length > 0 ? existing : [];
  });

  const toggleAccessoryKey = (key) => {
    setSelectedAccessoryKeys((prev) => {
      const isAdding = !prev.includes(key);
      const next = isAdding
        ? [...prev, key]
        : prev.filter((k) => k !== key);
      if (isAdding) {
        setPartTab(key);
      }
      return next;
    });
  };

  const [accessorySubtypes, setAccessorySubtypes] = useState({});
  const [fabricMeasurements, setFabricMeasurements] = useState({});

  const loading = !allDesigns && !error;

  useEffect(() => {
    if (!garmentKey) return undefined;
    let cancelled = false;
    Promise.all([
      ownOnly ? [] : api.getDesignLibrary({ template: garmentKey, status: 'ACTIVE' }),
      ownOnly ? [] : api.getDesignLibrary({ template: 'none', status: 'ACTIVE' }).catch(() => []),
      api.getGarmentTemplate(garmentKey).catch(() => null),
    ])
      .then(([rows, untagged, tpl]) => {
        if (cancelled) return;
        const overallKey = (tpl?.design_parts || []).map(p => p.key)
          .find(k => k.startsWith('overall')) || 'overall';
        const withCover = (d) => (d.images?.length || !d.image_url) ? d
          : { ...d, images: [{ id: d.id, part: overallKey, image_url: d.image_url,
                               caption: '', sequence: 0 }] };
        setAllDesigns([...(rows || []), ...(untagged || [])].map(withCover));
        setTemplate(tpl);
      })
      .catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [garmentKey, reloadToken, ownOnly]);

  
  const designs = useMemo(() => {
    if (!allDesigns) return null;
    const { category, subcategory, option } = catalogueFilter;
    if (!category) return allDesigns;
    return allDesigns.filter((d) => {
      const c = d.catalogue || {};
      return c.category === category
        && (!subcategory || c.subcategory === subcategory)
        && (!option || c.option === option);
    });
  }, [allDesigns, catalogueFilter]);

  const partOrder = useMemo(
    () => (template?.design_parts || []).map(p => p.key), [template]);
  const partLabels = useMemo(
    () => Object.fromEntries((template?.design_parts || []).map(p => [p.key, p.label])),
    [template]);

  const imagesByPart = useMemo(() => {
    const map = new Map();
    (designs || []).forEach((design) => {
      (design.images || []).forEach((image) => {
        if (!map.has(image.part)) map.set(image.part, []);
        map.get(image.part).push({ ...image, design_id: design.id,
                                   design_title: design.title,
                                   designer_name: design.designer_name });
      });
    });
    return map;
  }, [designs]);

  const garmentsByKey = useMemo(() => Object.fromEntries(
    (effectiveTaxonomy?.garments || []).map(g => [g.key, g])), [effectiveTaxonomy]);

  // The tabs: every part the template or fabric taxonomy declares.
  const tabParts = useMemo(() => {
    if (accessoriesOnly) {
      return ACCESSORY_OPTIONS;
    }
    if (isFabric && effectiveTaxonomy && garmentKey) {
      const spec = garmentsByKey[garmentKey];
      if (spec?.sections?.length) {
        let slotsFromTaxonomy = spec.sections.flatMap(section => {
          const sectionPrefix = (spec.sections.length > 1 && section.label) ? `${section.label} - ` : '';
          return (section.slots || []).map(slot => ({
            key: slot.key,
            label: `${sectionPrefix}${slot.label}`,
          }));
        });
        if (slotsFromTaxonomy.length > 0) {
          return slotsFromTaxonomy;
        }
      }
    }

    const declared = template?.design_parts || [];
    const extra = [...imagesByPart.keys()]
      .filter(key => !declared.some(p => p.key === key))
      .map(key => ({ key, label: key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) }));
    if (ownOnly && !declared.length && !extra.length) {
      return [{ key: 'overall', label: 'Overall Design' }];
    }
    return [...declared, ...extra];
  }, [template, imagesByPart, ownOnly, isFabric, accessoriesOnly, effectiveTaxonomy, garmentKey, garmentsByKey]);

  const [partTab, setPartTab] = useState(undefined);
  const [linkDraft, setLinkDraft] = useState('');
  const [addingLink, setAddingLink] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [webAvailable, setWebAvailable] = useState(false);
  const [webOpen, setWebOpen] = useState(false);
  const [webQuery, setWebQuery] = useState('');
  const [webSearching, setWebSearching] = useState(false);
  const [webResults, setWebResults] = useState(null);
  const [webNote, setWebNote] = useState('');
  const [webKeepingId, setWebKeepingId] = useState(null);
  useEffect(() => {
    if (!ownOnly || isFabric) return undefined;
    let live = true;
    api.webDesignSearchAvailable().then((ok) => { if (live) setWebAvailable(ok); }).catch(() => {});
    return () => { live = false; };
  }, [ownOnly, isFabric]);
  const ownCamRef = useRef(null);
  const videoRef = useRef(null);
  const [camStream, setCamStream] = useState(null);
  useEffect(() => () => camStream?.getTracks().forEach(track => track.stop()), [camStream]);

  const openPart = partTab === null ? null
    : accessoriesOnly
    ? (selectedAccessoryKeys.includes(partTab) ? partTab : (selectedAccessoryKeys[0] || null))
    : (tabParts.some(p => p.key === partTab) ? partTab : (tabParts[0]?.key ?? null));
  const openPartLabel = tabParts.find(p => p.key === openPart)?.label || '';
  const partShots = openPart ? (imagesByPart.get(openPart) || []) : [];
  const overallTab = Boolean(openPart && openPart.startsWith('overall'));

  const ownRefs = (openPart && references[openPart]) || [];

  const putRefs = (list) => onReferencesChange?.({ ...references, [openPart]: list });

  const addRefs = (added) => putRefs([...ownRefs, ...added]);

  const removeRef = (id, part = openPart) => {
    const left = (references[part] || []).filter(r => r.id !== id);
    const next = { ...references };
    if (left.length) next[part] = left; else delete next[part];
    onReferencesChange?.(next);
  };

  const allRefs = useMemo(() => {
    const order = new Map(partOrder.map((key, i) => [key, i]));
    const own = (isFabric || accessoriesOnly) ? new Set(tabParts.map(p => p.key)) : null;
    return Object.entries(references)
      .filter(([part]) => !own || own.has(part))
      .sort(([a], [b]) => (order.get(a) ?? 99) - (order.get(b) ?? 99))
      .flatMap(([part, list]) => (list || []).map(ref => ({ ...ref, part })));
  }, [references, partOrder, isFabric, accessoriesOnly, tabParts]);

  const addReferenceLink = () => {
    const typed = linkDraft.trim();
    if (!typed) return;
    const url = /^https?:\/\//i.test(typed) ? typed : `https://${typed}`;
    if (ownRefs.some(r => r.source_url === url)) { setLinkDraft(''); return; }
    addRefs([{
      id: `link:${url}`, part: openPart, part_label: openPartLabel,
      image_url: url, source_url: url, source: 'customer_link',
      design_title: url.replace(/^https?:\/\//i, '').slice(0, 60),
    }]);
    setLinkDraft('');
    // The box stays open: a customer with one link usually has another.
  };

  const webRefTitle = (hit) => hit.title || hit.source_domain || 'Web design';
  const webRefSource = (hit) => hit.source_url || hit.image_url;
  const isKept = (hit) => ownRefs.some(
    r => r.source_url === webRefSource(hit) && r.design_title === webRefTitle(hit));

  const runWebSearch = async () => {
    setWebSearching(true);
    setWebNote('');
    try {
      const found = await api.searchWebDesigns({
        garment_key: garmentKey, part_key: openPart, part_label: openPartLabel,
        keywords: webQuery.trim(),
      });
      setWebResults(found.results || []);
      const where = [found.interpreted?.garment, found.interpreted?.area].filter(Boolean).join(' · ');
      setWebNote(found.results?.length
        ? `${found.results.length} found${where ? ` for ${where}` : ''}${found.cached ? ' (cached)' : ''}`
        : 'Nothing found. Try different words.');
    } catch (err) {
      setWebResults([]);
      setWebNote(err.message);
    } finally {
      setWebSearching(false);
    }
  };

  const keepWebResult = async (hit) => {
    if (webKeepingId || isKept(hit)) return;
    setWebKeepingId(hit.id);
    try {
      const { image_url } = await api.keepWebDesign(hit.image_url, hit.title);
      addRefs([{
        id: `web:${image_url}`, part: openPart, part_label: openPartLabel,
        image_url, source: 'customer_link', source_url: webRefSource(hit),
        design_title: webRefTitle(hit),
      }]);
    } catch (err) {
      setWebNote(err.message);
    } finally {
      setWebKeepingId(null);
    }
  };

  const uploadFiles = async (files) => {
    if (!files.length) return;
    setUploading(true);
    setUploadError(null);
    try {
      const stored = await Promise.all(files.map(async (file) => {
        const { image_url } = await api.uploadReferenceImage(file);
        return {
          id: `upload:${image_url}`, part: openPart, part_label: openPartLabel,
          image_url, source: 'customer_upload', design_title: file.name,
        };
      }));
      addRefs(stored);
    } catch (err) {
      setUploadError(`${err.message} — please add those pictures again.`);
    } finally {
      setUploading(false);
    }
  };

  const uploadReference = (e) => {
    const files = [...(e.target.files || [])];
    e.target.value = '';       
    uploadFiles(files);
  };


  const openCamera = async () => {
    setUploadError(null);
    if (!navigator.mediaDevices?.getUserMedia) { ownCamRef.current?.click(); return; }
    try {
      setCamStream(await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }, audio: false }));
    } catch {
      ownCamRef.current?.click();
    }
  };

  const closeCamera = () => {
    camStream?.getTracks().forEach(track => track.stop());
    setCamStream(null);
  };

  const capturePhoto = async () => {
    const video = videoRef.current;
    if (!video?.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    const blob = await new Promise(done => canvas.toBlob(done, 'image/jpeg', 0.92));
    closeCamera();
    if (!blob) return;
    await uploadFiles([
      new File([blob], `${openPart || 'reference'}-${Date.now()}.jpg`, { type: 'image/jpeg' })]);
  };

  const chosenCount = Object.values(selection).filter(Boolean).length;
  const referencedParts = Object.values(references).filter(list => list?.length).length;
  const referenceCount = Object.values(references)
    .reduce((n, list) => n + (list?.length || 0), 0);

  const choose = (part, image) => {
    const next = { ...selection };
    if (next[part]?.id === image.id) delete next[part];
    else next[part] = image;
    onChange?.(next);
  };

  /** The photograph that represents a whole design in the list: its overall
   *  shot where it has one, its cover otherwise. */
  const coverOf = (design) => {
    const images = design.images || [];
    const overall = images.find(i => i.part.startsWith('overall'));
    return (overall || images[0])?.image_url || design.image_url;
  };

  if (!garmentKey) return null;

  if (error) {
    return (
      <div style={{ color: 'var(--danger-color)', fontSize: '12.5px' }}>
        {error}
        <button className="btn-secondary" style={{ marginLeft: '10px', padding: '3px 9px', fontSize: '11px' }}
                onClick={() => { setAllDesigns(null); setError(null); setReloadToken(t => t + 1); }}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: '14px' }}>
        <span style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>
          {ownOnly
            ? (referenceCount > 0
                ? `${referenceCount} reference${referenceCount === 1 ? '' : 's'} across ${referencedParts} part${referencedParts === 1 ? '' : 's'}`
                : (isFabric ? 'Add your own photos for each part' : 'Add your own photos or links for each part'))
            : chosenCount > 0
            ? `${chosenCount} part${chosenCount === 1 ? '' : 's'} chosen — parts may come from different designs`
            : (openPart ? 'Click a photograph to choose this part'
                        : 'Open a design to choose its parts')}
        </span>
      </div>

      {/* This garment's parts. Every photograph filed under the open one, taken
          across every design in the library, so choosing a pallu is one tab
          rather than opening twenty sarees. The last tab is the design list
          this screen has always opened on. */}
      {/* The garment's design catalogue -- category, section, design option --
          the same positions Manage Designs files under, narrowing the tabs and
          the list below to designs filed there. Renders nothing for a garment
          that has no catalogue, so those look exactly as they did. */}
      {!loading && !ownOnly && !isFabric && !accessoriesOnly && (
        <DesignCatalogueFilter
          garmentKey={garmentKey}
          value={catalogueFilter}
          onChange={setCatalogueFilter}
        />
      )}

      {!loading && (
        accessoriesOnly ? (
          <AccessoryMultiSelectDropdown
            options={ACCESSORY_OPTIONS}
            selectedKeys={selectedAccessoryKeys}
            onToggleKey={toggleAccessoryKey}
            activeKey={openPart || tabParts[0]?.key}
            onSelectActiveKey={(key) => { setPartTab(key); setViewIndex(null); }}
          />
        ) : (
          <PartTabStrip parts={tabParts} active={openPart}
                        allLabel={ownOnly ? null : 'All Designs'}
                        onChange={(part) => { setPartTab(part); setViewIndex(null); }} />
        )
      )}

      {!loading && accessoriesOnly && selectedAccessoryKeys.length === 0 && (
        <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', padding: '4px 0 18px' }}>
          Select an accessory from the dropdown above to add or upload items.
        </div>
      )}

      {loading && <Loader section label="Loading designs…" />}

      {/* The customer's own reference for THIS part -- ownOnly, so only in the
          References tab. The Design Studio tab is for picking off the
          boutique's catalogue and offers no upload of its own.
          The upload is stored on the spot because the wizard's draft is JSON
          and cannot carry a file; the link is kept as it was typed. */}
      {!loading && ownOnly && openPart && (() => {
        const isAlreadyFabric = /fabric/i.test(openPartLabel);
        const partFabricLabel = isFabric
          ? (isAlreadyFabric ? openPartLabel : `${openPartLabel} Fabric`)
          : openPartLabel;
        const currentAccOption = accessoriesOnly && ACCESSORY_OPTIONS.find(o => o.key === openPart);
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '14px' }}>
            {isFabric && !accessoriesOnly && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', minWidth: '180px' }}>
                  {partFabricLabel} Meter / Length / Size:
                </label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. 2.5 meters, 1 meter, 3 yards..."
                  value={fabricMeasurements[openPart] || ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    setFabricMeasurements(prev => ({ ...prev, [openPart]: val }));
                  }}
                  style={{ maxWidth: '320px', padding: '5px 10px', fontSize: '12px', borderRadius: '6px' }}
                />
              </div>
            )}

            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
              {/* One control; it asks live camera or device, because this screen
                  has its own camera (openCamera) and a laptop can use it too. Several
                  files at once, because a customer describing one part sends several
                  pictures of it; each becomes its own reference for this part. */}
              <AddPhotoButton multiple className="btn-secondary" style={{ padding: '5px 11px', fontSize: '11.5px' }}
                              icon={Upload} iconSize={12} disabled={uploading}
                              label={uploading ? 'Uploading…' : `Add ${partFabricLabel} photos`}
                              onCamera={openCamera} onFiles={uploadFiles} />
              {!isFabric && (
                <button type="button" className="btn-secondary"
                        style={{ padding: '5px 11px', fontSize: '11.5px' }}
                        onClick={() => setAddingLink(v => !v)}>
                  <LinkIcon size={12} /> Add reference link
                </button>
              )}
              {!isFabric && webAvailable && (
                <button type="button" className="btn-secondary"
                        style={{ padding: '5px 11px', fontSize: '11.5px',
                                 borderColor: webOpen ? 'var(--text-primary)' : undefined }}
                        onClick={() => setWebOpen(v => !v)}>
                  <Globe size={12} /> Search the web
                </button>
              )}
              {/* Only the fallback for openCamera when getUserMedia is refused: a
                  phone still gets its native camera through it. */}
              <input ref={ownCamRef} type="file" accept="image/*" capture="environment" hidden
                     onChange={uploadReference} />

              {!isFabric && addingLink && (
                <>
                  <input className="form-control" value={linkDraft} autoFocus
                         onChange={(e) => setLinkDraft(e.target.value)}
                         onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addReferenceLink(); } }}
                         placeholder={`Link to a ${partFabricLabel.toLowerCase()} you like — add as many as you want`}
                         style={{ flex: '1 1 240px', maxWidth: '340px', padding: '5px 9px', fontSize: '11.5px' }} />
                  <button type="button" className="btn-primary" disabled={!linkDraft.trim()}
                          style={{ padding: '5px 11px', fontSize: '11.5px' }}
                          onClick={addReferenceLink}>
                    Add
                  </button>
                </>
              )}

              {uploadError && (
                <span role="alert" style={{ fontSize: '11.5px', color: 'var(--danger-color, var(--danger-color))' }}>
                  {uploadError}
                </span>
              )}
            </div>

            {!isFabric && webAvailable && webOpen && (
              <div style={{ border: '1px solid var(--border-color)', borderRadius: '12px',
                            background: 'var(--surface-inset, #fafaf8)',
                            padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <div style={{ position: 'relative', flex: '1 1 auto', maxWidth: '520px' }}>
                    <Globe size={14} style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)',
                                              color: 'var(--text-secondary)', pointerEvents: 'none' }} />
                    <input className="form-control" value={webQuery} autoFocus
                           onChange={(e) => setWebQuery(e.target.value)}
                           onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); runWebSearch(); } }}
                           placeholder={`Describe the ${openPartLabel.toLowerCase()} — e.g. gold zari temple border`}
                           style={{ width: '100%', padding: '9px 12px 9px 32px', fontSize: '13px', borderRadius: '10px' }} />
                  </div>
                  <button type="button" className="btn-primary" disabled={webSearching}
                          style={{ padding: '9px 18px', fontSize: '13px', borderRadius: '10px', whiteSpace: 'nowrap' }}
                          onClick={runWebSearch}>
                    {webSearching ? 'Searching…' : 'Search'}
                  </button>
                </div>
                {webNote && (
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '-2px' }}>{webNote}</div>
                )}
                {!!webResults?.length && (
                  <div className="web-result-grid">
                    {webResults.map((hit) => (
                      <WebResultCard key={hit.id} hit={hit}
                                     kept={isKept(hit)} keeping={webKeepingId === hit.id}
                                     onKeep={() => keepWebResult(hit)}
                                     sourceUrl={webRefSource(hit)} title={webRefTitle(hit)} />
                    ))}
                  </div>
                )}
                <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
                  Pictures come from the open web. Click one to keep a copy on this order; the source link stays with it.
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Fabric and accessory sections keep the list but not the picture
          grid: the boutique asked for the "selected design image" preview to
          go from those two, so a kept photo there is a chip with its × and
          nothing else. The design (catalogue look) mode still shows the grid. */}
      {!loading && ownOnly && (isFabric || accessoriesOnly) && openPart && allRefs.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '14px' }}>
          {allRefs.map((ref) => (
            <span key={`${ref.part}:${ref.id}`}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '3px 6px 3px 10px',
                           borderRadius: '999px', fontSize: '11.5px', fontWeight: 600,
                           border: '1px solid var(--border-color)', background: 'var(--surface-inset, #f3f4f6)' }}>
              {partLabels[ref.part] || ref.part.replace(/_/g, ' ')} · {ref.design_title}
              <button type="button" title="Remove this reference" onClick={() => removeRef(ref.id, ref.part)}
                      style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0,
                               display: 'flex', color: 'var(--text-secondary)' }}>
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}

      {!loading && ownOnly && !isFabric && !accessoriesOnly && openPart && allRefs.length > 0 && (
        <>
        <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
                      color: 'var(--text-secondary)', margin: '4px 0 10px' }}>
          Kept on this {garmentName || 'garment'} · {allRefs.length} reference{allRefs.length === 1 ? '' : 's'}
        </div>
        <div style={{ display: 'grid', gap: '14px', marginBottom: '16px',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
          {allRefs.map((ref) => (
            <div key={`${ref.part}:${ref.id}`} style={{ position: 'relative' }}>
              <PickCard
                src={ref.image_url}
                alt={partLabels[ref.part] || ref.part}
                height="150px"
                picked
                onClick={() => window.open(
                  ref.source_url || resolveMediaUrl(ref.image_url, FALLBACK), '_blank', 'noopener')}
              >
                <div style={{ padding: '8px 10px' }}>
                  <div style={{ fontSize: '12.5px', fontWeight: 600, overflow: 'hidden',
                                textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {ref.design_title}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                    {ref.source === 'customer_link' ? 'Your link' : 'Your photo'}
                  </div>
                </div>
              </PickCard>
              {/* Which part it was kept on; the open tab's own are marked. */}
              <span style={{ position: 'absolute', top: '6px', left: '6px', padding: '2px 8px', borderRadius: '999px',
                             fontSize: '10px', fontWeight: 700, letterSpacing: '0.02em',
                             background: ref.part === openPart ? 'var(--primary-color)' : 'rgba(0,0,0,0.62)', color: '#fff' }}>
                {partLabels[ref.part] || ref.part.replace(/_/g, ' ')}
              </span>
              <button
                type="button"
                title="Remove this reference"
                onClick={() => removeRef(ref.id, ref.part)}
                style={{ position: 'absolute', top: '6px', right: '6px', width: '20px',
                         height: '20px', borderRadius: '50%', border: 'none', cursor: 'pointer',
                         background: 'rgba(0,0,0,0.62)', color: '#fff', padding: 0,
                         display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <X size={11} />
              </button>
            </div>
          ))}
        </div>
        </>
      )}

      {!loading && !ownOnly && openPart && partShots.length === 0 && designs.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
                      padding: '30px 0', color: 'var(--text-secondary)' }}>
          <ImageOff size={22} />
          <div style={{ fontSize: '13px' }}>No {openPartLabel} references available yet.</div>
        </div>
      )}

      {!loading && ownOnly && openPart && ownRefs.length === 0 && (
        <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', padding: '4px 0 18px' }}>
          No {(() => {
            const isAlreadyFabric = /fabric/i.test(openPartLabel);
            const partFabricLabel = isFabric
              ? (isAlreadyFabric ? openPartLabel : `${openPartLabel} Fabric`)
              : openPartLabel;
            return partFabricLabel.toLowerCase();
          })()} references yet — add as many photos{isFabric ? '' : ' and links'} as you like.
        </div>
      )}

      {!loading && openPart && partShots.length > 0 && (
        <div style={{ display: 'grid', gap: '14px',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
          {partShots.map((image, i) => (
            // The same card, the same choose() and the same View the design
            // modal uses -- this tab is another way into the one selection,
            // not a second one.
            <PickCard
              key={image.id}
              src={image.image_url}
              alt={openPartLabel}
              height="150px"
              picked={selection[openPart]?.id === image.id}
              onClick={() => choose(openPart, { ...image, design_title: image.design_title,
                                                part_label: openPartLabel })}
              onView={() => {
                const design = overallTab
                  && (designs || []).find(d => String(d.id) === String(image.design_id));
                if (design) setOpenDesign(design); else setViewIndex(i);
              }}
            >
              <div style={{ padding: '8px 10px' }}>
                <div style={{ fontSize: '12.5px', fontWeight: 600, overflow: 'hidden',
                              textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {image.design_title || 'Untitled design'}
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                  {image.designer_name || 'Unattributed'}
                  {selection[openPart]?.id === image.id && (
                    <span style={{ color: 'var(--brand-link)', fontWeight: 700 }}> · chosen</span>
                  )}
                </div>
              </div>
            </PickCard>
          ))}
        </div>
      )}

      {!loading && !ownOnly && allDesigns.length === 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
                      padding: '30px 0', color: 'var(--text-secondary)' }}>
          <ImageOff size={22} />
          <div style={{ fontSize: '13px', fontWeight: 600 }}>
            No {garmentName.toLowerCase()} designs uploaded yet
          </div>
          <div style={{ fontSize: '12px' }}>Add them under Manage Designs.</div>
        </div>
      )}

      {!loading && !ownOnly && allDesigns.length > 0 && designs.length === 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
                      padding: '30px 0', color: 'var(--text-secondary)' }}>
          <ImageOff size={22} />
          <div style={{ fontSize: '13px', fontWeight: 600 }}>No designs filed here yet</div>
          <div style={{ fontSize: '12px' }}>Pick another design option, or All designs.</div>
        </div>
      )}

      {!loading && !openPart && designs.length > 0 && (
        <div style={{ display: 'grid', gap: '14px',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
          {designs.map((design, i) => {
            const taken = Object.values(selection)
              .filter(img => img && String(img.design_id) === String(design.id)).length;
            return (
              <PickCard
                key={design.id}
                src={coverOf(design)}
                alt={design.title}
                picked={taken > 0}
                height="150px"
                onClick={() => setOpenDesign(design)}
                onView={() => setViewIndex(i)}
              >
                <div style={{ padding: '8px 10px' }}>
                  <div style={{ fontSize: '12.5px', fontWeight: 600, overflow: 'hidden',
                                textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {design.title}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                    {design.garment_type || garmentName} · {(design.images || []).length} photograph
                    {(design.images || []).length === 1 ? '' : 's'}
                    {taken > 0 && (
                      <span style={{ color: 'var(--brand-link)', fontWeight: 700 }}> · {taken} chosen</span>
                    )}
                  </div>
                </div>
              </PickCard>
            );
          })}
        </div>
      )}

      {/* Full size, walking whichever set is on screen: the part's photographs
          under a part tab, the design covers under the design list. Selecting
          from inside it is the same choose() the card behind it calls. */}
      {camStream && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', zIndex: 1100,
                      display: 'flex', flexDirection: 'column', alignItems: 'center',
                      justifyContent: 'center', gap: '14px', padding: '28px' }}
             onClick={closeCamera}>
          <video
            autoPlay playsInline muted
            ref={(el) => { videoRef.current = el; if (el && el.srcObject !== camStream) el.srcObject = camStream; }}
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '100%', maxHeight: '70vh', borderRadius: '8px', background: '#000' }}
          />
          <div style={{ display: 'flex', gap: '10px' }} onClick={(e) => e.stopPropagation()}>
            <button type="button" className="btn-primary" disabled={uploading}
                    style={{ padding: '6px 16px', fontSize: '12px' }}
                    onClick={capturePhoto}>
              <Camera size={13} /> {uploading ? 'Saving…' : `Capture ${openPartLabel}`}
            </button>
            <button type="button" className="btn-secondary"
                    style={{ padding: '6px 14px', fontSize: '12px' }} onClick={closeCamera}>
              <X size={13} /> Cancel
            </button>
          </div>
        </div>
      )}

      {viewIndex !== null && !openDesign && openPart && partShots[viewIndex] && (
        <Lightbox
          items={partShots.map(img => ({
            image_url: img.image_url,
            label: `${openPartLabel} · ${img.design_title || 'Untitled design'}`,
          }))}
          index={viewIndex}
          onIndexChange={setViewIndex}
          onClose={() => setViewIndex(null)}
          isSelected={selection[openPart]?.id === partShots[viewIndex].id}
          onToggle={() => choose(openPart, {
            ...partShots[viewIndex],
            design_title: partShots[viewIndex].design_title,
            part_label: openPartLabel,
          })}
        />
      )}

      {viewIndex !== null && !openDesign && !openPart && designs[viewIndex] && (
        <Lightbox
          items={designs.map(d => ({ image_url: coverOf(d), label: d.title }))}
          index={viewIndex}
          onIndexChange={setViewIndex}
          onClose={() => setViewIndex(null)}
        />
      )}

      {openDesign && (
        <DesignModal
          design={openDesign}
          partOrder={partOrder}
          partLabels={partLabels}
          selection={selection}
          onChoose={choose}
          onClose={() => setOpenDesign(null)}
        />
      )}
    </div>
  );
}


/**
 * What the customer has chosen so far, across every dress on the order.
 *
 * One section per garment, stacked; inside each, the chosen photographs in a
 * row. The order form is long and a choice made under Saree scrolls out of
 * sight the moment the customer opens Blouse, so this is where they see the
 * whole outfit at once before moving on.
 *
 * Reads the same `job.design.parts` the pickers write, so there is nothing to
 * keep in step -- it is a view of the selection, not a copy of it.
 */
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
