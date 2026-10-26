/* The accessories a garment can carry, as the order wizard offers them.

   Data only, so the screens that pick accessories and the ones that read
   them back share one list: the women's list (ACCESSORY_OPTIONS, as it has
   always been), the men's list, and which garment takes which. */

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

// Men's wear: what a men's tailor asks for. An item both lists carry keeps the
// same key and label (Buttons, Zip, Hooks...), so a saved accessory reads the
// same on every screen; only the choices under it suit men's wear.
export const MENS_ACCESSORY_OPTIONS = [
  {
    key: 'buttons',
    label: 'Buttons',
    subtypes: ['Shirt Buttons', 'Sherwani / Kundan Buttons', 'Fabric-Covered Buttons', 'Metal Blazer Buttons'],
    measurementLabel: 'Quantity (Pieces)',
    placeholder: 'e.g. 7 pcs for a shirt or 9 pcs for a sherwani',
  },
  {
    key: 'cufflinks',
    label: 'Cufflinks',
    subtypes: ['Metal Cufflinks', 'Stone / Kundan Cufflinks', 'Fabric Knot Cufflinks'],
    measurementLabel: 'Quantity (Pairs)',
    placeholder: 'e.g. 1 pair',
  },
  {
    key: 'collar_interfacing',
    label: 'Collar Stays / Interfacing',
    subtypes: ['Collar Stays / Inserts', 'Fusible Interfacing', 'Suit Canvas / Interlining'],
    measurementLabel: 'Quantity or Length (Meters)',
    placeholder: 'e.g. 1 pair of stays, 0.5m fusing',
  },
  {
    key: 'shoulder_pad',
    label: 'Shoulder Pad',
    subtypes: ['Thin Soft Shoulder Pad', 'Thick Moulded Shoulder Pad', 'Raglan Shoulder Pad'],
    measurementLabel: 'Size / Thickness',
    placeholder: 'e.g. Standard thin for a blazer',
  },
  {
    key: 'zip',
    label: 'Zip',
    subtypes: ['Trouser Fly Zip', 'Jacket / Front Zip', 'Concealed / Invisible Zip', 'Heavy Duty Metallic Zip'],
    measurementLabel: 'Zipper Length (Inches)',
    placeholder: 'e.g. 7" fly zip or 24" jacket zip',
  },
  {
    key: 'hooks',
    label: 'Hooks',
    subtypes: ['Trouser Hook & Bar', 'Waistband Fastener', 'Standard Hook & Eye'],
    measurementLabel: 'Quantity (Sets / Pairs)',
    placeholder: 'e.g. 2 sets',
  },
  {
    key: 'elastic_drawstring',
    label: 'Elastic or Draw String',
    subtypes: ['Pajama Nada (Drawstring)', 'Waistband Elastic', 'Track-Pant Elastic', 'Braided Cord'],
    measurementLabel: 'Length / Waist Size (Inches)',
    placeholder: 'e.g. 34" nada or 32" elastic',
  },
  {
    key: 'lining',
    label: 'Lining',
    subtypes: ['Suit / Coat Lining', 'Sherwani Lining', 'Pocket Lining (Pocketing)', 'Sleeve Lining'],
    measurementLabel: 'Fabric Length (Meters)',
    placeholder: 'e.g. 1.5m for a blazer or 0.5m pocketing',
  },
  {
    key: 'brooch_kalgi',
    label: 'Brooch / Kalgi',
    subtypes: ['Sherwani Brooch', 'Kalgi (Turban Ornament)', 'Collar Pin', 'Mala / Chain'],
    measurementLabel: 'Quantity (Pieces)',
    placeholder: 'e.g. 1 brooch',
  },
  {
    key: 'border',
    label: 'Border',
    subtypes: ['Sherwani / Kurta Border', 'Piping', 'Embroidered Border', 'Zari Border'],
    measurementLabel: 'Length (Meters / Yards)',
    placeholder: 'e.g. 2m for a kurta placket and hem',
  },
  {
    key: 'decorative_motifs',
    label: 'Decorative Motifs',
    subtypes: ['Zardozi / Embroidered Patch', 'Monogram / Initials', 'Readymade Appliqué Motif', 'Badge / Crest'],
    measurementLabel: 'Dimensions (W × H Inches) & Quantity',
    placeholder: 'e.g. 2"x2", 1 pc',
  },
  {
    key: 'other',
    label: 'Other',
    subtypes: ['Handmade / Custom Work', 'Readymade Bought Accessory', 'Special Trimming'],
    measurementLabel: 'Measurement / Requirement Details',
    placeholder: 'Enter measurement or specific requirement details',
  },
];

// Every accessory any garment can carry, for the screens that read saved
// accessories back (labels, which keys are accessories): women's, then the
// men's items women's wear has no entry for.
export const ALL_ACCESSORY_OPTIONS = [
  ...ACCESSORY_OPTIONS,
  ...MENS_ACCESSORY_OPTIONS.filter((m) => !ACCESSORY_OPTIONS.some((o) => o.key === m.key)),
];

// Garments made only for men take the men's list; Jacket, made for both
// (a Nehru jacket or a lehenga jacket), takes both; everything else keeps the
// women's list. Mirrors MENS_GARMENT_KEYS / WOMENS_GARMENT_KEYS in App.jsx.
const MENS_ONLY_GARMENTS = new Set([
  'shirt', 't_shirt', 'kurta', 'indo_western', 'mens_suit', 'trouser', 'jeans',
  'shorts', 'mens_bottom_wear', 'coat', 'casual_wear', 'sherwani',
]);
const FOR_BOTH = new Set(['jacket']);
export const accessoryOptionsFor = (garmentKey) => (
  MENS_ONLY_GARMENTS.has(garmentKey) ? MENS_ACCESSORY_OPTIONS
    : FOR_BOTH.has(garmentKey) ? ALL_ACCESSORY_OPTIONS
      : ACCESSORY_OPTIONS);

// Fabric-catalogue slots the order's fabric pickers leave out for a garment.
// The dupatta's are accessories, offered by the Accessories step instead
// (Tassel/Latkan, and Lace/Trim with its Gota / Kiran type); a blouse's
// Backing (the blouse and the lehenga blouse) is not chosen when taking an
// order.
const ACCESSORY_SLOTS = {
  dupatta: ['TASSEL_LATKAN', 'LACE_GOTA_KIRAN'],
  blouse: ['BACKING_FABRIC'],
  lehenga_blouse: ['BACKING_FABRIC'],
};
export const isAccessorySlot = (garmentKey, slotKey) => (
  (ACCESSORY_SLOTS[garmentKey] || []).includes(slotKey));
