/* Each page's own guided tour (ProductTour.jsx with `page`): shown the first
   time a person opens that page. Steps point at the parts every page is
   built from -- its title, its main buttons, the summary cards, the tabs,
   the search -- and a step whose part is not on the page is left out. Parts
   (`part`) are what Skip jumps over: the top of the page, then what is
   under it. */

const M = '.portal-main';
const sel = {
  title: `${M} .at-page-head .at-page-title`,
  actions: `${M} .at-page-head .at-page-actions`,
  stats: `${M} .at-stat-grid`,
  tabs: `${M} .at-scroll-tabs`,
  seg: `${M} .at-seg`,
  search: `${M} .at-search, ${M} .search-input-wrapper`,
  table: `${M} table`,
  jobs: `${M} .wk`,
  reports: `${M} .reports-switch`,
};

const isOwner = (role) => !role || role === 'Owner';
const supervisor = (role) => role === 'Master' || role === 'Designer';

/** [{ part, key, title, text }] for a page; `key` names its target in `sel`. */
function stepsFor(page, role) {
  switch (page) {
    case 'orders': return [
      { part: 'top', key: 'title', title: 'Orders', text: 'Every order your boutique has taken, from the newest down. Open any order to see its garments, measurements, payments and progress.' },
      { part: 'top', key: 'actions', title: 'New order', text: 'Start an order for a walk-in or a regular customer: the garments, measurements, design and advance, in one flow.' },
      { part: 'list', key: 'stats', title: 'Orders by status', text: 'How many orders are new, in progress and closed, at a glance.' },
      { part: 'list', key: 'search', title: 'Find an order', text: 'Type an order number or the customer\'s name to find it straight away.' },
    ];
    case 'workshop': return [
      { part: 'top', key: 'title', title: 'Workshop', text: 'Every garment being made, and the step it is on: cutting, stitching, finishing and the trial, with who is working on it.' },
      { part: 'list', key: 'seg', title: 'Board or list', text: 'The Board gives each step its own column, so you see where work is piling up. The List shows every garment in one table.' },
      { part: 'list', key: 'search', title: 'Find a garment', text: 'Search by order, customer, status or the person working on it.' },
    ];
    case 'customers': return [
      { part: 'top', key: 'title', title: 'Customers', text: 'Everyone who orders from you, with their measurements, past orders and contact details. Measurements are saved once and ready for the next order.' },
      { part: 'top', key: 'actions', title: 'Add customers', text: 'Add a customer one at a time, or bring your whole list in at once with Import from Excel.' },
      { part: 'list', key: 'stats', title: 'Your customers at a glance', text: 'How many customers you have, your Platinum regulars, the new ones this month, and those with orders.' },
      { part: 'list', key: 'search', title: 'Find a customer', text: 'Search by name, mobile number or email.' },
    ];
    case 'designs': return [
      { part: 'top', key: 'title', title: role === 'Designer' ? 'Design studio' : 'Design library', text: role === 'Designer'
        ? 'Your designs: the styles, patterns and references the team stitches from.'
        : 'The garment styles your boutique offers, with their photos, details and prices.' },
      { part: 'top', key: 'actions', title: 'Add a design', text: 'Add a new style with its photos, the garment it is for, and its price.' },
      { part: 'list', key: 'stats', title: 'The library at a glance', text: 'How many designs there are, by whom, in which collections, and any waiting for a review.' },
    ];
    case 'inventory': return [
      { part: 'top', key: 'title', title: 'Fabrics & Materials', text: 'Everything you stock: fabrics, trims, threads and materials, with every movement recorded.' },
      { part: 'top', key: 'actions', title: 'Add material', text: 'Put a new fabric or trim into stock with its quantity, price and the shelf it goes on.' },
      { part: 'list', key: 'stats', title: 'Stock at a glance', text: 'The value of your stock, and what is out of stock, running low or not moving.' },
      { part: 'list', key: 'tabs', title: 'All about stock, one tab each', text: 'The stock list, garments made in-house, the materials library, your locations, racks & shelves, and purchase history.' },
      { part: 'list', key: 'search', title: 'Find a material', text: 'Search any fabric, trim or thread by its name.' },
    ];
    case 'staff':
      if (isOwner(role)) return [
        { part: 'top', key: 'title', title: 'Your team', text: 'Everyone who works with you: tailors, masters, designers and staff. Add people, and see who is in today and who is busy.' },
        { part: 'list', key: 'stats', title: 'The team today', text: 'How many people you have, who is free right now, who is present today, and whose pay details are filled in.' },
        { part: 'list', key: 'tabs', title: 'Team, tasks and attendance', text: 'The team list, tasks, attendance, performance, and roles & permissions, each on its own tab.' },
        { part: 'list', key: 'search', title: 'Find someone', text: 'Search the team by name, role or phone number.' },
      ];
      return [
        { part: 'top', key: 'title', title: supervisor(role) ? 'Team and attendance' : 'My attendance', text: supervisor(role)
          ? 'Your team\'s work and attendance, and your own: who is in today, who is busy, and your own days and hours.'
          : 'Mark when you start and finish your day, and see your days and hours.' },
        { part: 'list', key: 'tabs', title: 'One tab each', text: supervisor(role)
          ? 'The team, tasks, attendance and performance, and your own status, timesheet and monthly log.'
          : 'Today\'s status, your weekly timesheet and your monthly attendance log.' },
        { part: 'list', key: 'stats', title: 'At a glance', text: 'The numbers that matter for today.' },
      ];
    case 'invoices': return [
      { part: 'top', key: 'title', title: 'Bills & payments', text: 'Every bill for your orders, and what has been paid against it.' },
      { part: 'list', key: 'stats', title: 'Money at a glance', text: 'What you have collected, what is still to collect, and the total billed.' },
      { part: 'list', key: 'search', title: 'Find a bill', text: 'Search by the bill number or the customer\'s name.' },
      { part: 'list', key: 'table', title: 'Every bill', text: 'Each bill with its amount, what is paid and what is due. Open one to share it or print it.' },
    ];
    case 'finance':
    case 'analytics': return [
      { part: 'top', key: 'title', title: 'Reports', text: 'How the business is doing: profit and costs, and insights on your orders, customers and team.' },
      { part: 'top', key: 'reports', title: 'Profit & Costs or Insights', text: 'Switch between the money view and the insights view here.' },
      { part: 'list', key: 'stats', title: 'The headline numbers', text: 'The figures for the period you are looking at, side by side.' },
    ];
    case 'work': return [
      { part: 'top', key: 'title', title: 'My work', text: 'The steps handed to you, newest first. This is where your day starts.' },
      { part: 'list', key: 'jobs', title: 'Your jobs', text: 'Each card is one step of one garment. Open it to see the measurements, the design and the photos, then press Start when you begin, and Finish when it is done.' },
    ];
    case 'check': return [
      { part: 'top', key: 'title', title: 'To check', text: 'Work your team has finished and sent to you to check.' },
      { part: 'list', key: 'jobs', title: 'Waiting for you', text: 'Look at the work and its photos, then approve it so it moves on, or send it back with a note saying what to fix.' },
    ];
    case 'done': return [
      { part: 'top', key: 'title', title: 'Done', text: 'The work you have finished, newest first, kept for your record.' },
      { part: 'list', key: 'jobs', title: 'Your finished work', text: 'Each card is a step you completed, with when it was done.' },
    ];
    case 'settings': return [
      { part: 'top', key: 'title', title: 'Settings', text: 'Your boutique\'s settings: its details, the workflow steps garments go through, and how the workspace works for your team.' },
      { part: 'list', key: 'tabs', title: 'One tab each', text: 'Each group of settings has its own tab. Changes apply to the whole boutique.' },
    ];
    case 'account': return [
      { part: 'top', key: 'title', title: 'My profile', text: 'Your own details: your name, phone number, photo and password.' },
    ];
    default: return null;
  }
}

/** Whether a page has a tour of its own. The Dashboard's is the workspace tour. */
export const hasPageTour = (page, role) => !!stepsFor(page, role);

/** The page's steps, each with the selector of the part it points at. */
export function pageTourSteps(page, role) {
  return (stepsFor(page, role) || []).map((s) => ({ ...s, targets: [sel[s.key]] }));
}
