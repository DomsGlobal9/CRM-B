import { cleanName } from '../../utils/validate';
import { splitStoredMobile } from '../../utils/phone';

/** What the customer form and its neighbours share: the measurement lists, a customer as form values, and a little wording. */

export const CORE = [['bust', 'Bust'], ['waist', 'Waist'], ['hips', 'Hips'], ['shoulder', 'Shoulder'],
              ['arm_length', 'Arm Length'], ['neck', 'Neck'], ['length', 'Length']];

// The template keys the spreadsheet import accepts, grouped as the sample sheet groups them.
export const MORE = {
  'Upper body (blouse / kurta / shirt)': [
    'collar_neck', 'front_shoulder', 'back_shoulder', 'upper_chest', 'bust', 'underbust', 'waist', 'armhole',
    'bicep_length', 'bicep_round', 'elbow_length', 'elbow_round', 'full_length', 'full_sleeves_round',
    'front_neck_depth', 'back_neck_depth', 'blouse_length', 'upper_arm', 'elbow', 'wrist', 'sleeve_length',
    'shoulder_to_bust', 'shoulder_to_waist',
  ],
  'Lower body (lehenga / skirt / churidar / trouser)': [
    'hip_round', 'bottom_full_length', 'knee_length', 'ankle_length', 'lehenga_length', 'lehenga_waist',
    'pant_waist', 'pant_length', 'high_round', 'inseam', 'ankle_round', 'crotch_length',
    'floor_length', 'height', 'high_waist', 'waist_to_hip', 'waist_to_floor', 'waist_to_ankle', 'heel_height',
    'total_ghera', 'hem_circumference', 'thigh', 'knee', 'calf', 'ankle', 'outseam', 'crotch',
  ],
};

export const label = (key) => key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

// The Blouse's and Lehenga Blouse's order-form measurements, in the order
// form's order and names (apps/catalog/definitions.py). Stored under the keys
// the order form fills itself from: Chest is the sheet's bust, Full Sleeve
// Length its sleeve_length.
const BLOUSE_STEPS = [
  ['Lengths & chest', ['blouse_length', 'upper_chest', 'bust', 'waist', 'armhole']],
  ['Shoulders & arm', ['front_shoulder', 'back_shoulder', 'upper_arm', 'elbow_length', 'elbow_round']],
  ['Sleeve', ['short_sleeve_length', 'short_hand_round', 'sleeve_length', 'full_sleeves_round']],
  ['Neck', ['collar_neck']],
];

const BLOUSE_LABELS = {
  bust: 'Chest', upper_arm: 'Bicep', short_hand_round: 'Short Sleeve Round',
  sleeve_length: 'Full Sleeve Length', full_sleeves_round: 'Full Sleeve Round', collar_neck: 'Collar Round',
};

export const MEASUREMENT_ZONES = [
  {
    id: 'core',
    label: 'Core Body Baseline',
    garments: 'General Baseline (All Garments)',
    // The stored keys are the ones the garment forms already read, so a value
    // typed here still pre-fills them; only the names shown are the boutique's.
    keys: ['length', 'shoulder', 'bust', 'waist', 'hips', 'arm_length', 'bicep_round',
           'front_neck_depth', 'back_neck_depth'],
    labels: { length: 'Bodice Length', hips: 'Hip', bicep_round: 'Arm Rounding',
              front_neck_depth: 'Front Neck', back_neck_depth: 'Back Neck' },
    other: true,
  },
  // Blouse and Lehenga Blouse ask the same measurements: one section, with
  // exactly the order form's.
  {
    id: 'blouse',
    label: 'Blouse & Lehenga Blouse',
    garments: 'Blouse, Lehenga Blouse',
    other: true,
    steps: BLOUSE_STEPS,
    labels: BLOUSE_LABELS,
  },
  {
    id: 'upper_body',
    label: 'Kurti & Tops',
    garments: 'Kurti, Suit, Shirt, Sherwani, Jacket, Anarkali, Gown',
    other: true,
    // In the order a tailor takes them, top to bottom. Every earlier box is
    // still here; four sleeve boxes only carry clearer names, four are new.
    // [heading, keys]; in the sleeve step each length is followed by its round.
    steps: [
      ['Length & shoulders', ['blouse_length', 'full_length', 'front_shoulder', 'back_shoulder',
                              'shoulder_to_bust', 'shoulder_to_waist']],
      ['Chest & bust', ['upper_chest', 'bust', 'underbust', 'across_chest', 'across_back']],
      ['Armhole & arm', ['armhole', 'upper_arm', 'bicep_length', 'bicep_round']],
      ['Sleeve', ['short_sleeve_length', 'short_hand_round', 'elbow_length', 'elbow_round',
                  'three_quarter_sleeve_length', 'three_quarter_round', 'sleeve_length', 'full_sleeves_round',
                  'elbow', 'wrist', 'sleeve_opening']],
      ['Neck', ['front_neck_depth', 'back_neck_depth', 'collar_neck', 'neck_circumference']],
    ],
    labels: {
      short_sleeve_length: 'Short Sleeve Length', short_hand_round: 'Short Hand Rounding',
      elbow_length: 'Elbow Sleeve Length', elbow_round: 'Elbow Rounding',
      three_quarter_sleeve_length: '3/4 Sleeve Length', three_quarter_round: '3/4 Rounding',
      sleeve_length: 'Full Sleeve Length', full_sleeves_round: 'Full Rounding',
    },
  },
  {
    id: 'lehenga_gown',
    label: 'Lehenga & Skirt',
    garments: 'Lehenga, Petticoat, Skirt',
    other: true,
    // The lengths down the leg, then the waist (with the hip round -- the
    // same box the Pants section reads), then the flare. Floor length,
    // height, waist to hip / floor, heel height and bottom full length left
    // this section; a customer's saved values for them are kept (and searchable).
    steps: [
      ['Lengths', ['waist_to_knee', 'waist_to_ankle', 'lehenga_length']],
      ['Waist', ['lehenga_waist', 'high_waist', 'high_round', 'hip_round']],
      ['Flare & hem', ['total_ghera', 'hem_circumference']],
    ],
  },
  {
    id: 'pants_bottoms',
    label: 'Pants, Salwar & Trouser',
    garments: 'Pants, Churidar, Salwar, Sharara, Trouser, Jeans, Shorts',
    other: true,
    // Waist and hip, the crotch, the full lengths, then down the leg with each
    // length beside its round. Knee / Crotch / Calf are the earlier boxes under
    // clearer names; Ankle left the section (its saved values are kept).
    steps: [
      ['Waist & hip', ['pant_waist', 'hip_round', 'thigh']],
      ['Crotch', ['crotch', 'crotch_length']],
      ['Full lengths', ['pant_length', 'outseam', 'inseam']],
      ['Down the leg', ['knee_length', 'knee', 'calf_length', 'calf', 'ankle_length', 'ankle_round']],
    ],
    labels: { knee: 'Knee Round', crotch: 'Crotch Round', calf: 'Calf Round' },
  }
].map((zone) => (zone.steps ? { ...zone, keys: zone.steps.flatMap(([, keys]) => keys) } : zone));

export const EMPTY = {
  full_name: '', mobile_number: '', email_address: '', gender: '', address: '', city_region: '',
  source: 'Walk In', customer_type: 'Silver', date_of_birth: '', notes: '', measurements: {},
};

/** One "Full name" box, stored as the customer's first and last name the way
 *  the Excel import splits full_name: the first word, then the rest. */
export const splitFullName = (raw) => {
  const [first, ...rest] = cleanName(raw).trim().split(' ');
  return { first_name: first || '', last_name: rest.join(' ') };
};

export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// Every extra key the form can hold: the Excel groups and the measurement
// zones, minus the core columns (bust, waist...) the customer row keeps itself.
export const CORE_KEYS = new Set(CORE.map(([key]) => key));

export const MORE_KEYS = [...new Set([...Object.values(MORE).flat(), ...MEASUREMENT_ZONES.flatMap((zone) => zone.keys)])]
  .filter((key) => !CORE_KEYS.has(key));

const asInch = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? '' : String(Number(v)));

/** An existing customer as the form holds them: the mobile split into its
 *  country and number, the inch figures as plain numbers. */
export function customerToForm(customer) {
  const m = customer.measurements || {};
  const extra = m.additional_measurements || {};
  const measurements = {};
  CORE.forEach(([key]) => { measurements[key] = asInch(m[key]); });
  MORE_KEYS.forEach((key) => { measurements[key] = asInch(extra[key]); });
  // Parts typed in under "Other" are kept by their own name.
  Object.keys(extra).forEach((key) => {
    if (!(key in measurements) && !CORE_KEYS.has(key) && asInch(extra[key]) !== '') measurements[key] = asInch(extra[key]);
  });
  const text = (key) => (customer[key] === null || customer[key] === undefined ? '' : String(customer[key]));
  return {
    full_name: [text('first_name'), text('last_name')].map((v) => v.trim()).filter(Boolean).join(' '),
    mobile_number: splitStoredMobile(customer.mobile_number).national,
    email_address: text('email_address'), gender: text('gender'), address: text('address'),
    city_region: text('city_region'), source: text('source') || 'Walk In',
    customer_type: text('customer_type') || 'Silver', date_of_birth: text('date_of_birth'),
    notes: text('notes'), measurements,
  };
}
