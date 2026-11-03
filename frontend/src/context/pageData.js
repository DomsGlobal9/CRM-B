// What each page reads from the workspace's data (useWorkspaceData's datasetLoaders).
// Settings, notifications and the customer counts are loaded for every page.
// (Assigning a stage needs the team too; useWorkspaceData adds it while a stage is open.)
const ORDER_BOOK_DATA = ['orders', 'queuedMessages'];
const MY_WORK_DATA = ['orders', 'tailors', 'queuedMessages'];
export const DATA_FOR_TAB = {
  overview: ['dashboard', 'orders', 'appointments'],
  orders: ORDER_BOOK_DATA,
  workshop: ORDER_BOOK_DATA,
  work: MY_WORK_DATA,
  check: MY_WORK_DATA,
  done: MY_WORK_DATA,
  invoices: ['orders'],
  analytics: ['orders', 'tailors'],
};
// The order screens: the fabric picker, and our delivered orders for an alteration.
export const DATA_FOR_VIEW = {
  'order-selector': ['orders', 'fabrics'],
  wizard: ['orders', 'fabrics'],
};
