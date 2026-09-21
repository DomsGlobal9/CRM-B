export const UNITS = [
  ['METER', 'Meter'], ['PIECE', 'Piece'], ['PAIR', 'Pair'], ['ROLL', 'Roll'],
  ['PACKET', 'Packet'], ['BOX', 'Box'], ['SET', 'Set'], ['KILOGRAM', 'Kilogram'],
  ['GRAM', 'Gram'], ['STRING', 'String'], ['UNIT', 'Unit'],
];

/** A 'buy for this order' row the wizard can send: named, a quantity, no negative cost. */
export const purchaseError = (row) => {
  if (!(row.name || '').trim()) return 'Say what needs to be bought.';
  if (!(Number(row.quantity) > 0)) return 'Enter how much is needed.';
  if (Number(row.estimated_cost || 0) < 0) return 'The estimated cost cannot be negative.';
  return '';
};
