export const MAGGAM_NOTE_VOICE = { hand_work_notes: 'hand_work_voice_note' };

export const WIZARD_STEPS = {
  stitch: [
    { key: 'who', label: 'Customer', sub: 'Who it is for' },
    { key: 'type', label: 'Garments', sub: 'Details, design & fabric' },
    { key: 'measure', label: 'Measurements', sub: 'Body measurements' },
    { key: 'review', label: 'Review', sub: 'Check everything' },
    { key: 'money', label: 'Complete the order', sub: 'Invoice & payment' },
  ],
  design: [
    { key: 'who', label: 'Customer', sub: 'Who it is for' },
    { key: 'type', label: 'Garments', sub: 'Details, design & fabric' },
    { key: 'measure', label: 'Measurements', sub: 'Body measurements' },
    { key: 'review', label: 'Review', sub: 'Check everything' },
    { key: 'money', label: 'Complete the order', sub: 'Invoice & payment' },
  ],
  alter: [
    { key: 'who', label: 'Customer', sub: 'Who it is for' },
    { key: 'garment', label: 'Garment', sub: 'Which one we made' },
    { key: 'issue', label: 'Details', sub: 'What needs changing' },
  ],
  // An alteration on a garment stitched elsewhere: no order of ours to pick
  // it from, so the garment is described and photographed instead.
  alterOutside: [
    { key: 'who', label: 'Customer', sub: 'Who it is for' },
    { key: 'outGarment', label: 'Garment', sub: 'What was brought in' },
    { key: 'outIssue', label: 'Details', sub: 'What needs changing' },
  ],
};
export const EMPTY_ALTERATION = { orderId: '', garmentJobId: '', issue: '', type: 'PAID_CLIENT_REQUEST', charge: '', paidNow: '' };
/** "Me" in Who will design it: the person taking the order designs it
 *  (crm_api/views.py SELF_DESIGNER). */
export const SELF_DESIGNER = 'self';
export const EMPTY_OUTSIDE = { templateId: '', note: '', scale: '', request: '', adjustments: '', charge: '', paidNow: '', notes: '' };

export const MENS_GARMENT_KEYS = new Set([
  'shirt', 't_shirt', 'kurta', 'indo_western', 'mens_suit', 'trouser', 'jeans',
  'shorts', 'mens_bottom_wear', 'coat', 'casual_wear', 'sherwani', 'jacket',
]);
export const WOMENS_GARMENT_KEYS = new Set([
  'saree', 'blouse', 'lehenga', 'lehenga_blouse', 'dupatta', 'kurti', 'anarkali',
  'petticoat', 'bottom_wear', 'gown', 'suit', 'jacket',
]);
export const garmentsForGender = (templates, gender) => {
  const keys = gender === 'Male' ? MENS_GARMENT_KEYS : gender === 'Female' ? WOMENS_GARMENT_KEYS : null;
  return keys ? templates.filter((t) => keys.has(t.key)) : templates;
};

export const GARMENT_PRICES = {
  'Lehenga': 32000,
  'Gown': 25000,
  'Saree': 15000,
  'Anarkali': 18000,
  'Kurti': 5000,
  'Sherwani': 35000,
  'Suit': 22000,
  // men's wear
  'Shirt': 3500,
  'T-Shirt': 1500,
  'Kurta': 4500,
  'Indo-Western': 25000,
  'Mens Suit': 30000,
  'Trouser': 3000,
  'Jeans': 3000,
  'Shorts': 2000,
  'Mens Bottom Wear': 2500,
  'Coat': 18000,
  'Casual Wear': 3000
};

export const DEFAULT_CUSTOMER_DATA = {
  first_name: '',
  last_name: '',
  mobile_number: '',
  email_address: '',
  address: '',
  city_region: '',
  source: 'Walk In',
  customer_type: 'Silver',
  gender: '',
  garment_type: 'Lehenga',
  neckline_style: '',
  sleeve_style: '',
  back_style: '',
  length_preference: '',
  silhouette: '',
  embellishments: '',
  pattern_style: '',
  occasion: '',
  custom_requirements: '',
  date_of_birth: '',
  occupation: '',
  preferred_communication: 'WhatsApp',
  notes: '',
  measurements: {
    bust: '',
    waist: '',
    hips: '',
    shoulder: '',
    arm_length: '',
    neck: '',
    length: ''
  }
};

// The order being written in this tab, so a reload reopens it where it was saved.
// sessionStorage: one tab only, gone when the tab closes; a reload keeps it.
export const WIZARD_DRAFT_KEY = 'order-wizard-draft';
