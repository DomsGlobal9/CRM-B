/* Hands-on guides for the Dashboard's Getting started list (ProductTour.jsx
   with `task`). Clicking an item still opens its screen as before; the guide
   then lights up the real button or box to use next, one at a time, and the
   person does it themselves -- the page stays usable under the guide. A
   step marked `click` moves on when its lit part is clicked; a step with
   `at` belongs to one screen of a wizard (matched on its heading), so the
   guide follows when the person moves through the wizard on their own.
   A target is a selector, or { sel, text, up }: the first `sel` whose text
   starts with `text`, lit `up` levels higher (a label's whole field). */

const WIZ = 'h1.page-title';
const NEXT = '.footer-right-actions';

const TASKS = {
  customer: [
    { part: 'details', title: 'Their name', text: 'Type the customer\'s full name.',
      targets: ['.portal-main .form-group:has(#cf-name)', '.portal-main #cf-name'] },
    { part: 'details', title: 'Mobile number', text: 'Add their mobile number. It is how you find them again, and where their order updates go.',
      targets: ['.portal-main .cp-field:has(#cf-mobile)', '.portal-main #cf-mobile'] },
    { part: 'measure', title: 'Measurements', text: 'Pick the garment type, then fill in the measurements you take. You can also add them later, when they order.',
      targets: ['.portal-main .wz-card:has(input[placeholder*="measurement"])'] },
    { part: 'save', title: 'Save the customer', text: 'Press Save customer. They join your customer list, ready for their first order.',
      targets: ['.portal-main form button[type="submit"].btn-primary'], click: true },
  ],

  order: [
    { part: 'service', title: 'Choose the service', text: 'Stitching for a new garment, Alteration to fix or adjust one, or In-house for your own stock. Tap the one you need.',
      // The first card lit; tapping any of them moves the guide on (it
      // follows the wizard's screen).
      targets: ['.wz-service'], click: true },
    // Stitching
    { part: 'customer', at: /^Who is this for/i, title: 'The steps of an order', text: 'The bar at the top shows each step of the order and where you are. You can go back to any step.',
      targets: ['.wizard-header-container'] },
    { part: 'customer', at: /^Who is this for/i, title: 'Who is it for?', text: 'Type the customer\'s name and mobile number.',
      targets: ['.form-group:has(#wz-name)', '#wz-name'] },
    { part: 'customer', at: /^Who is this for/i, title: 'On to the garments', text: 'Press Next to choose what you are making.',
      targets: [NEXT], click: true },
    { part: 'garments', at: /^What are we making/i, title: 'Add the garments', text: 'Tick each garment you are making: a blouse, a lehenga, a kurti. Then add its design and fabric.',
      targets: [{ sel: 'button', text: 'Tick garments to add' }, WIZ] },
    { part: 'garments', at: /^What are we making/i, title: 'Next: measurements', text: 'Press Next when the garments are in.',
      targets: [NEXT], click: true },
    { part: 'measure', at: /^Measurements/i, title: 'Measurements', text: 'Fill in the customer\'s measurements for each garment.',
      targets: [WIZ] },
    { part: 'measure', at: /^Measurements/i, title: 'Next: review', text: 'Press Next to check everything before the payment.',
      targets: [NEXT], click: true },
    { part: 'review', at: /^Review and confirm/i, title: 'Review', text: 'Check the garments, the measurements, the dates and the price.',
      targets: [WIZ] },
    { part: 'review', at: /^Review and confirm/i, title: 'Next: payment', text: 'Press Next when everything is right.',
      targets: [NEXT], click: true },
    // Alteration and In-house have their own screens; the same idea.
    { part: 'garments', at: /^(Which garment|What garment is it)/i, title: 'The garment', text: 'Pick or describe the garment this order is for, then press Next.',
      targets: [WIZ] },
    { part: 'garments', at: /^What needs changing/i, title: 'What needs changing', text: 'Say what needs fixing or adjusting, then press Next.',
      targets: [WIZ] },
    { part: 'pay', at: /^Complete the order/i, title: 'The payment', text: 'Enter the advance the customer pays now, if any.',
      targets: [WIZ] },
    { part: 'pay', at: /^Complete the order/i, title: 'Create the order', text: 'Press the button here to create the order. It goes straight to your workshop.',
      targets: [NEXT], click: true },
  ],

  staff: [
    { part: 'open', title: 'Add a team member', text: 'Press Add a team member.',
      targets: [{ sel: '.portal-main button', text: 'Add a team member' }], click: true },
    { part: 'form', title: 'Their details', text: 'Fill in their name, phone and role: tailor, master, designer and so on. The role decides which work they can be given, and what they see.',
      targets: ['#add-staff-form'] },
    { part: 'form', title: 'Add them', text: 'Press Add staff. They join your team, ready to be given work.',
      targets: ['button[form="add-staff-form"]'], click: true },
  ],

  fabrics: [
    { part: 'open', title: 'Add material', text: 'Press Add material.',
      targets: ['.portal-main .at-page-head .at-page-actions button'], click: true },
    { part: 'form', title: 'What it is', text: 'Give it a name, like Red Kanchi silk, and choose its category.',
      targets: [{ sel: 'form label', text: 'Name', up: 1 }] },
    { part: 'form', title: 'How much you have', text: 'Enter the quantity you have in stock now.',
      targets: [{ sel: 'form label', text: 'Initial Quantity', up: 1 }] },
    { part: 'form', title: 'Which shelf', text: 'Choose the rack and shelf you keep it on, so anyone can find it.',
      targets: ['form .sp'], optional: true },
    { part: 'save', title: 'Save it', text: 'Press Save material. It is in stock now, and on its shelf.',
      targets: [{ sel: 'form button[type="submit"]', text: 'Save' }], click: true },
  ],

  production: [
    { part: 'open', title: 'Open the Workshop', text: 'Orders move through the workshop one step at a time. Open it here.',
      targets: ['.portal-sidebar [data-tour="workshop"]', '.mobile-bottom-nav [data-tour="workshop"]'], click: true, menuItem: true },
    { part: 'board', title: 'The board', text: 'On the Board each step, such as cutting, stitching and finishing, has its own column.',
      targets: ['.portal-main .at-seg'] },
    { part: 'board', title: 'A garment', text: 'Each card is a garment. Open it to give its next step to someone, and it moves along as the work is done.',
      missing: 'When you take an order, its garments appear here as cards.',
      targets: ['.portal-main .kanban-card'], click: true },
  ],
};

/** Whether a Getting started item has a hands-on guide. */
export const hasTask = (key) => !!TASKS[key];

/** A task's steps. */
export const taskSteps = (key) => (TASKS[key] || []).map((s) => ({ ...s, task: true }));
