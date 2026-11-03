// What each page reads from the workspace's data (useWorkspaceData's datasetLoaders),
// fetched the first time the page opens. The settings are loaded for every page,
// and the customer count for whoever sees the sidebar's "Add new customers" hint.
// (Assigning a stage needs the team too; useWorkspaceData adds it while a stage is open.)
const ORDER_BOOK_DATA = ['orders', 'queuedMessages'];
const MY_WORK_DATA = ['orders', 'tailors', 'queuedMessages'];
export const DATA_FOR_TAB = {
  // The figures and the workroom tiles (both GET /dashboard/), the appointments,
  // the tier line, and the owner's bell (the bell is on this page only).
  overview: ['dashboard', 'appointments', 'customerStats', 'notifications'],
  orders: ORDER_BOOK_DATA,
  workshop: ORDER_BOOK_DATA,
  work: MY_WORK_DATA,
  check: MY_WORK_DATA,
  done: MY_WORK_DATA,
  customers: ['customerStats'],
  leads: ['customerStats'],
  // Bills & Payments asks for its own page of bills (GET /orders/invoices/).
  invoices: [],
  analytics: ['orders', 'tailors', 'customerStats'],
};
// The order form: the fabric picker, and our delivered orders for an alteration.
// (What kind of order -- the screen before it -- needs neither.)
export const DATA_FOR_VIEW = {
  wizard: ['orders', 'fabrics'],
};
