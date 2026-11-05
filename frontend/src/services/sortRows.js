/**
 * Sorts a list held in the browser, for <DataTable>. A list sorted by the server
 * skips this and sends `sort` with its request.
 *
 * `sort` is { key, dir: 'asc' | 'desc' }. A column's `sortValue(row)` overrides
 * the value compared. Numbers inside text compare naturally (Order 9 before
 * Order 10), and blanks go last in either direction.
 */
export function sortRows(rows, sort, columns = []) {
  if (!sort?.key) return rows;
  const column = columns.find((c) => c.key === sort.key);
  const read = column?.sortValue || ((row) => row[sort.key]);
  const blank = (v) => v == null || v === '';
  return [...rows].sort((a, b) => {
    const [x, y] = [read(a), read(b)];
    if (blank(x) || blank(y)) return blank(x) - blank(y);
    const order = typeof x === 'number' && typeof y === 'number'
      ? x - y
      : String(x).localeCompare(String(y), undefined, { numeric: true, sensitivity: 'base' });
    return sort.dir === 'desc' ? -order : order;
  });
}
