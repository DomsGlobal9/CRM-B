export function getCustomerMeasurement(m, key) {
  if (!m) return undefined;
  const flat = { ...m, ...(m.additional_measurements || {}) };
  if (flat[key] !== undefined && flat[key] !== null && flat[key] !== '') return flat[key];

  const ALIASES = {
    chest: ['bust'],
    bust: ['chest', 'upper_chest'],
    hip: ['hips', 'hip_round'],
    hips: ['hip', 'hip_round'],
    hip_round: ['hip', 'hips'],
    sleeve_length: ['arm_length'],
    arm_length: ['sleeve_length'],
    waist: ['lehenga_waist', 'pant_waist', 'high_waist'],
    lehenga_waist: ['waist'],
    pant_waist: ['waist'],
    full_length: ['length', 'bottom_full_length', 'pant_length', 'lehenga_length'],
    floor_length: ['waist_to_floor'],
    waist_to_floor: ['floor_length'],
    neck: ['neck_circumference', 'collar_neck'],
    neck_circumference: ['neck', 'collar_neck'],
    full_sleeve_length: ['sleeve_length'],
  };

  const candidates = ALIASES[key] || [];
  for (const alt of candidates) {
    if (flat[alt] !== undefined && flat[alt] !== null && flat[alt] !== '') {
      return flat[alt];
    }
  }
  return undefined;
}

export const MEASUREMENT_LABEL_MAP = {
  bust: 'Bust', waist: 'Waist', hips: 'Hips', shoulder: 'Shoulder', arm_length: 'Arm Length', neck: 'Neck', length: 'Length',
  collar_neck: 'Collar Neck', front_shoulder: 'Front Shoulder', back_shoulder: 'Back Shoulder', upper_chest: 'Upper Chest', underbust: 'Underbust',
  armhole: 'Armhole', bicep_length: 'Bicep Length', bicep_round: 'Bicep Round', elbow_length: 'Elbow Length', elbow_round: 'Elbow Round',
  full_length: 'Full Length', full_sleeves_round: 'Full Sleeves Round', front_neck_depth: 'Front Neck Depth', back_neck_depth: 'Back Neck Depth',
  blouse_length: 'Blouse Length', upper_arm: 'Upper Arm', elbow: 'Elbow', wrist: 'Wrist', sleeve_length: 'Sleeve Length',
  shoulder_to_bust: 'Shoulder to Bust', shoulder_to_waist: 'Shoulder to Waist', sleeve_opening: 'Sleeve Opening',
  neck_circumference: 'Neck Circumference', across_chest: 'Across Chest', across_back: 'Across Back', chest: 'Chest', lower_bust: 'Lower Bust',
  jacket_length: 'Jacket Length', kurti_length: 'Kurti Length', suit_length: 'Suit Length', sherwani_length: 'Sherwani Length',
  gown_length: 'Gown Length', coat_length: 'Coat Length', choli_length: 'Choli Length',
  hip_round: 'Hip Round', bottom_full_length: 'Bottom Full Length', knee_length: 'Knee Length', ankle_length: 'Ankle Length',
  lehenga_length: 'Lehenga Length', lehenga_waist: 'Lehenga Waist', pant_waist: 'Pant Waist', pant_length: 'Pant Length',
  high_round: 'High Round', inseam: 'Inseam', ankle_round: 'Ankle Round', crotch_length: 'Crotch Length', floor_length: 'Floor Length',
  height: 'Height', high_waist: 'High Waist', waist_to_hip: 'Waist to Hip', waist_to_floor: 'Waist to Floor', waist_to_ankle: 'Waist to Ankle',
  heel_height: 'Heel Height', total_ghera: 'Total Ghera', hem_circumference: 'Hem Circumference', thigh: 'Thigh', knee: 'Knee',
  calf: 'Calf', ankle: 'Ankle', outseam: 'Outseam', crotch: 'Crotch', hip: 'Hip', bottom_length: 'Bottom Length', seat: 'Seat',
  petticoat_length: 'Petticoat Length', petticoat_waist: 'Petticoat Waist',
};

export function formatMeasurementLabel(key) {
  if (!key) return '';
  if (MEASUREMENT_LABEL_MAP[key]) return MEASUREMENT_LABEL_MAP[key];
  return String(key).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatMeasurementValue(val) {
  if (val === undefined || val === null || val === '') return '—';
  const str = String(val).trim();
  if (str === '—') return '—';
  if (!Number.isNaN(Number(str))) return `${str} in`;
  return str;
}

export const MEASURE_KEYS = {
  chest: 'bust', bust: 'bust', waist: 'waist', hip: 'hips', shoulder: 'shoulder', neck: 'neck',
  height: 'height', underbust: 'underbust', high_waist: 'high_waist', armhole: 'armhole',
  upper_arm: 'upper_arm', bicep: 'upper_arm', elbow: 'elbow', wrist: 'wrist',
  shoulder_to_bust: 'shoulder_to_bust', shoulder_to_waist: 'shoulder_to_waist',
  waist_to_hip: 'waist_to_hip', waist_to_floor: 'waist_to_floor', floor_length: 'waist_to_floor',
  full_sleeve_length: 'sleeve_length',
  crotch: 'rise', thigh: 'thigh', knee: 'knee', calf: 'calf', ankle: 'ankle',
  inseam: 'inseam', outseam: 'outseam',
};
export const SHEET_COLUMNS = new Set(['bust', 'waist', 'hips', 'shoulder', 'arm_length', 'neck', 'length']);
export const sheetGet = (sheet, key) => (SHEET_COLUMNS.has(key) ? sheet[key] : sheet.additional_measurements?.[key]);
export const sheetSet = (sheet, key, value) => {
  if (SHEET_COLUMNS.has(key)) sheet[key] = value;
  else sheet.additional_measurements = { ...(sheet.additional_measurements || {}), [key]: value };
};

export const getVisibleMeasurementFields = (stitchParts) => {
  const allFields = ['bust', 'waist', 'hips', 'shoulder', 'arm_length', 'neck', 'length'];
  if (!stitchParts || stitchParts.length === 0) return allFields;
  
  const hasUpper = stitchParts.some(p => ['Blouse', 'Blouse / Choli', 'Kurta / Kameez', 'Sherwani Top', 'Anarkali Dress', 'Gown Body', 'Kurti Top'].includes(p));
  const hasLower = stitchParts.some(p => ['Skirt', 'Salwar / Bottom', 'Pants / Churidar', 'Bottom Churidar', 'Petticoat'].includes(p));
  
  const fields = [];
  if (hasUpper) {
    fields.push('bust', 'shoulder', 'arm_length', 'neck');
  }
  if (hasLower) {
    fields.push('hips');
  }
  if (hasUpper || hasLower) {
    fields.push('waist', 'length');
  }
  
  return allFields.filter(f => fields.includes(f));
};
