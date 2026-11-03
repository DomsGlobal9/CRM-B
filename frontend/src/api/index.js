/**
 * The backend, as one object: `api.getOrders()`, `api.login(...)`. Each area's
 * calls live in endpoints/<area>.js; the base URL in config.js; how a request
 * is made (headers, errors, the session check) in client.js.
 */
import { authApi } from './endpoints/auth';
import { dashboardApi } from './endpoints/dashboard';
import { notificationsApi } from './endpoints/notifications';
import { settingsApi } from './endpoints/settings';
import { customersApi } from './endpoints/customers';
import { ordersApi } from './endpoints/orders';
import { orderDraftsApi } from './endpoints/orderDrafts';
import { catalogApi } from './endpoints/catalog';
import { designsApi } from './endpoints/designs';
import { schedulingApi } from './endpoints/scheduling';
import { staffApi } from './endpoints/staff';
import { payrollApi } from './endpoints/payroll';
import { financeApi } from './endpoints/finance';
import { alterationsApi } from './endpoints/alterations';
import { inventoryApi } from './endpoints/inventory';
import { dailyUpdatesApi } from './endpoints/dailyUpdates';
import { uploadsApi } from './endpoints/uploads';

export const api = {
  ...authApi,
  ...dashboardApi,
  ...notificationsApi,
  ...settingsApi,
  ...customersApi,
  ...ordersApi,
  ...orderDraftsApi,
  ...catalogApi,
  ...designsApi,
  ...schedulingApi,
  ...staffApi,
  ...payrollApi,
  ...financeApi,
  ...alterationsApi,
  ...inventoryApi,
  ...dailyUpdatesApi,
  ...uploadsApi,
};

export { BASE_URL } from './config';
