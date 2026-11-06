import { Store, ShoppingBag, Scissors, Contact, Target, Palette, Package, Users, ListTodo, Wallet, Receipt, BarChart2, ClipboardList, ShieldCheck, CheckCircle2, Clock, User, Settings } from 'lucide-react';
import { SUPERVISOR_ROLES, roleIsOwner } from '../constants/roles';

export const NAV_MODULE = {
  overview: null,
  orders: null,
  workshop: null,
  alterations: 'alterations',
  customers: null,
  leads: null,
  work: null,
  check: null,
  done: null,
  todo: null,
  invoices: null,
  analytics: null,
  account: null,
  settings: null,
  designs: 'design_studio',
  designWork: 'design_studio',
  inventory: 'inventory',
  staff: 'staff',
  finance: 'finance',
};

export const hasModule = (user, key) =>
  !key || !Array.isArray(user?.modules) || user.modules.includes(key);


export const canSeeTab = (user, tab) => {
  if (import.meta.env.DEV && !(tab in NAV_MODULE)) {
    console.warn(`canSeeTab: no NAV_MODULE row for "${tab}" -- showing it to every role. Add a module key, or an explicit null if that is meant.`);
  }
  return hasModule(user, NAV_MODULE[tab]);
};


export const navSectionsFor = (user, t) => {
  const role = user?.role;
  const sections =
    roleIsOwner(role) ? [
      { key: 'daily', label: t('nav.groups.daily', 'Overview'), items: [
        { tab: 'overview', icon: Store, label: t('nav.dashboard'), phone: true },
        { tab: 'orders', icon: ShoppingBag, label: t('nav.manageOrders'), phone: true, phoneLabel: t('nav.orders', 'Orders') },
        { tab: 'workshop', icon: Scissors, label: t('nav.workshop', 'Production'), phone: true },
        { tab: 'customers', icon: Contact, label: t('nav.customers'), phone: true },
        // Hidden for now, not removed: `hidden` keeps it out of the sidebar and
        // makes the page unreachable. Delete `hidden: true` to bring it back.
        { tab: 'leads', icon: Target, label: t('nav.leads', 'Leads'), hidden: true },
      ] },
      { key: 'design', label: t('nav.groups.design', 'Design'), items: [
        { tab: 'designs', icon: Palette, label: t('nav.manageDesigns') },
      ] },
      
      { key: 'stock', label: t('nav.groups.stock', 'Stock'), items: [
        { tab: 'inventory', icon: Package, label: t('nav.inventory'), phone: true },
      ] },
      
      { key: 'people', label: t('nav.groups.people', 'Team'), items: [
        { tab: 'staff', icon: Users, label: t('nav.staffManagement') },
        { tab: 'todo', icon: ListTodo, label: t('nav.todo', 'To-do') },
      ] },
      { key: 'business', label: t('nav.groups.business', 'Finance'), items: [
        { tab: 'finance', icon: Wallet, label: t('nav.finance', 'Profit & Costs') },
        { tab: 'invoices', icon: Receipt, label: t('nav.invoices') },
        { tab: 'analytics', icon: BarChart2, label: t('nav.analytics') },
      ] },
    ] : role === 'Master' ? [
      { key: 'master', items: [
        { tab: 'work', icon: ClipboardList, label: t('nav.myWork', 'My work'), phone: true },
        { tab: 'check', icon: ShieldCheck, label: t('nav.toCheck', 'To check'), phone: true },
        { tab: 'done', icon: CheckCircle2, label: t('nav.doneWork', 'Done'), phone: true },
        // The order workflow (Production), as the Designer has it.
        { tab: 'workshop', icon: Scissors, label: t('nav.workshop', 'Production'), phone: true },
        { tab: 'designs', icon: Palette, label: t('nav.manageDesigns') },
        { tab: 'staff', icon: Clock, label: t('nav.myAttendance') },
        { tab: 'todo', icon: ListTodo, label: t('nav.todo', 'To-do') },
      ] },
    ] : role === 'Designer' ? [
      { key: 'designer', items: [
        { tab: 'work', icon: ClipboardList, label: t('nav.myWork', 'My work'), phone: true },
        { tab: 'designs', icon: Palette, label: t('nav.designStudio'), phone: true },
        { tab: 'workshop', icon: Scissors, label: t('nav.workshop', 'Production'), phone: true },
        { tab: 'check', icon: ShieldCheck, label: t('nav.toCheck', 'To check'), phone: true },
        { tab: 'staff', icon: Clock, label: t('nav.myAttendance') },
        { tab: 'todo', icon: ListTodo, label: t('nav.todo', 'To-do') },
      ] },
    ] : [
      { key: 'production', items: [
        { tab: 'work', icon: ClipboardList, label: t('nav.myWork', 'My work'), phone: true },
        { tab: 'done', icon: CheckCircle2, label: t('nav.doneWork', 'Done'), phone: true },
        { tab: 'staff', icon: Clock, label: t('nav.myAttendance') },
        { tab: 'todo', icon: ListTodo, label: t('nav.todo', 'To-do'), phone: true },
      ] },
    ];

  // The owner's Admin also gets the sections of the work handed to them
  // (user.admin_tasks, e.g. 'orders.create'), ahead of their own menu.
  const handed = new Set((user?.admin_tasks || []).map((task) => task.split('.')[0]));
  const own = new Set(sections.flatMap((section) => section.items.map((i) => i.tab)));
  // `section` is the task prefix (core/admin_access.py ADMIN_TASKS) that opens
  // the screen. Team is not here: every role already has the staff screen.
  const adminItems = [
    { section: 'dashboard', tab: 'overview', icon: Store, label: t('nav.dashboard') },
    { section: 'orders', tab: 'orders', icon: ShoppingBag, label: t('nav.manageOrders'), phone: true, phoneLabel: t('nav.orders', 'Orders') },
    { section: 'workshop', tab: 'workshop', icon: Scissors, label: t('nav.workshop', 'Production'), phone: true },
    { section: 'customers', tab: 'customers', icon: Contact, label: t('nav.customers'), phone: true },
    { section: 'design', tab: 'designs', icon: Palette, label: t('nav.manageDesigns') },
    { section: 'inventory', tab: 'inventory', icon: Package, label: t('nav.inventory') },
    { section: 'finance', tab: 'finance', icon: Wallet, label: t('nav.finance', 'Profit & Costs') },
    { section: 'invoices', tab: 'invoices', icon: Receipt, label: t('nav.invoices') },
    { section: 'analytics', tab: 'analytics', icon: BarChart2, label: t('nav.analytics') },
  ].filter((item) => handed.has(item.section) && !own.has(item.tab));
  if (adminItems.length) sections.unshift({ key: 'admin', label: t('nav.groups.admin', 'Admin'), items: adminItems });

  const roomy = roleIsOwner(role) || SUPERVISOR_ROLES.includes(role);
  return [...sections, { key: 'session', divider: true, label: t('nav.groups.account', 'Account'), items: [
    { tab: 'account', icon: User, label: t('nav.account'), phone: !roomy },
    { tab: 'settings', icon: Settings, label: t('nav.settings') },
  ] }];
};

/* Drop what this user cannot reach, then drop any group left with nothing
   under it -- otherwise the sidebar grows headings over empty space. */
export const visibleNav = (user, t) => navSectionsFor(user, t)
  .map((section) => ({ ...section, items: section.items.filter((i) => !i.hidden && canSeeTab(user, i.tab)) }))
  .filter((section) => section.items.length);
