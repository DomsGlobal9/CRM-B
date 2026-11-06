/** The kinds of place stock can sit in. */

export const KINDS = [
  ['AREA', 'Area'], ['RACK', 'Rack'], ['CUPBOARD', 'Cupboard'], ['SHELF', 'Shelf'], ['BOX', 'Box'],
  ['RAIL', 'Rail'], ['STACK', 'Stack'], ['COUNTER', 'Counter'], ['DRAWER', 'Drawer'],
  ['DISPLAY', 'Display'], ['TRUNK', 'Trunk'], ['OTHER', 'Other'],
];

export const HOLDERS = KINDS.filter(([k]) => ['RACK', 'CUPBOARD', 'RAIL', 'STACK', 'COUNTER', 'TRUNK', 'DISPLAY'].includes(k));
