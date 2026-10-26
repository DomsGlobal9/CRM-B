import { Check } from 'lucide-react';

/**
 * PetticoatStylePicker - the petticoat's "Choose design".
 *
 * Nobody designs a petticoat, so the order wizard shows these pictures in
 * place of the catalogue / customer photos / new-design cards. Each tile is a
 * simple outline of the style; the choice is the template's `petticoat_style`
 * field (apps/catalog/definitions.py), so it is saved, shown and printed like
 * any other detail of the garment. Tapping the chosen style again clears it.
 */

// Front-view outlines on a 100 x 120 board: waistband at the top, hem at the
// bottom. `waist` false draws a gathered drawstring waist instead of a band.
const STYLES = [
  {
    value: 'shapewear', label: 'Shapewear / Fish-cut', hint: 'Fitted, flares at the hem',
    body: 'M33 18 C31 52 35 78 39 92 L30 112 L70 112 L61 92 C65 78 69 52 67 18 Z',
  },
  {
    value: 'a_line_kali', label: 'A-line / Kali', hint: 'Panelled, gently flared',
    body: 'M32 18 L18 112 L82 112 L68 18 Z',
    lines: ['M41 18 L33 112', 'M50 18 L50 112', 'M59 18 L67 112'],
  },
  {
    value: 'straight', label: 'Straight / Regular', hint: 'Plain, everyday',
    body: 'M32 18 L28 112 L72 112 L68 18 Z',
  },
  {
    value: 'umbrella', label: 'Umbrella / Flared', hint: 'Full, wide flare',
    body: 'M32 18 Q14 70 8 106 Q18 114 29 106 Q39 114 50 106 Q61 114 71 106 Q82 114 92 106 Q86 70 68 18 Z',
    lines: ['M42 18 L28 104', 'M58 18 L72 104'],
  },
  {
    value: 'mermaid', label: 'Mermaid', hint: 'Fitted to the knee, then flared',
    body: 'M34 18 C32 55 37 78 41 86 C31 95 17 105 12 112 L88 112 C83 105 69 95 59 86 C63 78 68 55 66 18 Z',
  },
  {
    value: 'drawstring_cotton', label: 'Drawstring Cotton', hint: 'Cotton, drawstring waist',
    body: 'M32 18 L23 112 L77 112 L68 18 Z',
    waist: false,
  },
];

function Outline({ style }) {
  const gathered = style.waist === false;
  return (
    <svg viewBox="0 0 100 120" width="100%" height="100%" aria-hidden="true"
         fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">
      <path d={style.body} fill="var(--surface-2, #f7f5f1)" />
      {(style.lines || []).map((d) => <path key={d} d={d} strokeWidth="1.2" opacity="0.55" />)}
      {gathered ? (
        <>
          <path d="M31 18 Q35 14 39 18 Q43 14 47 18 Q51 14 55 18 Q59 14 63 18 Q67 14 69 18" />
          <path d="M48 19 L45 32" strokeWidth="1.4" />
          <path d="M52 19 L55 32" strokeWidth="1.4" />
          <circle cx="45" cy="33.5" r="1.6" fill="currentColor" />
          <circle cx="55" cy="33.5" r="1.6" fill="currentColor" />
        </>
      ) : (
        <rect x="30" y="10" width="40" height="8" rx="2" fill="var(--surface-color, #fff)" />
      )}
    </svg>
  );
}

export default function PetticoatStylePicker({ value = '', onChange }) {
  return (
    <div className="ptc-picker">
      <div className="ptc-picker-head">
        <span className="ptc-picker-title">Petticoat style</span>
        <span className="ptc-picker-sub">Tap the style the customer wants.</span>
      </div>
      <div className="ptc-grid" role="radiogroup" aria-label="Petticoat style">
        {STYLES.map((style) => {
          const on = value === style.value;
          return (
            <button key={style.value} type="button" role="radio" aria-checked={on}
                    className={`ptc-tile${on ? ' ptc-tile--on' : ''}`}
                    onClick={() => onChange?.(on ? '' : style.value)}>
              {on && <span className="ptc-tick" aria-hidden="true"><Check size={12} strokeWidth={3} /></span>}
              <span className="ptc-art"><Outline style={style} /></span>
              <span className="ptc-label">{style.label}</span>
              <span className="ptc-hint">{style.hint}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
