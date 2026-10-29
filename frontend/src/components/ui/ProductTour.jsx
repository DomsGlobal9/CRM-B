/* The first-visit guided tour of the workspace (App.jsx, view 'dashboard').
   A dimmed screen with one part lit up at a time -- a menu item, the New
   order button, the account menu -- and a card beside it saying what it is
   for, with Back / Next, Skip (the rest of this part) and Skip all (end the
   tour). Each role gets its own tour, built from the menu that user really
   has. It opens once per person per browser (localStorage), and "Take the
   tour" in the account menu replays it. With `page`, it is that page's own
   tour instead (tourPages.js), shown the first time the page is opened.
   Purely a guide: nothing behind it is clicked or changed while it is open. */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, X } from 'lucide-react';
import { markTourSeen } from './tourState';
import { pageTourSteps } from './tourPages';
import './tour.css';

const isOwner = (role) => !role || role === 'Owner';

/* What each menu item is for, in a sentence or two. The title is the label
   the user's own menu shows, so the two always match. */
function describe(tab, role) {
  switch (tab) {
    case 'overview': return 'Your boutique at a glance: today\'s orders, deliveries that are due, payments and anything that needs your attention. A good place to start every day.';
    case 'orders': return 'Every order in one list. Search and filter by status, take payments, and open an order to see its garments, measurements and progress.';
    case 'workshop': return 'The workshop board: which step each garment is on (cutting, stitching, finishing) and who is working on it right now.';
    case 'customers': return 'Your customers with their measurements, past orders and contact details. Saved once, ready for the next order.';
    case 'designs':
      if (role === 'Designer') return 'Your design studio: create and update the styles, patterns and references the team stitches from.';
      if (role === 'Master') return 'The boutique\'s designs, to check a style and its details before the cutting starts.';
      return 'Your design catalogue: the garment styles, necklines and sleeves you offer, with their photos and prices.';
    case 'inventory': return 'Fabrics, trims and materials in stock. See what is running low, and exactly which rack and shelf each one sits on.';
    case 'staff':
      if (isOwner(role)) return 'Your team: add tailors, masters and designers, see who is present today, who is busy, and how each person is doing.';
      return 'Your attendance: mark when you start and finish the day, and see your days and hours.';
    case 'reports':
    case 'finance':
    case 'analytics': return 'Reports: profit and costs, and insights on your orders, customers and team, to see how the business is really doing.';
    case 'invoices': return 'Bills and invoices for your orders, ready to share with the customer or print.';
    case 'work': return 'The steps handed to you. Open one to see exactly what to make, then start, pause and finish it from here.';
    case 'check': return 'Work your team has finished that is waiting for your check. Approve it, or send it back with a note.';
    case 'done': return 'The work you have finished, kept for your record.';
    case 'alterations': return 'Alteration jobs: garments that came back to be fitted, fixed or changed.';
    default: return null;
  }
}

/** The steps for this user, in parts: welcome, the menu, the tools, the end. */
function buildSteps({ user, menu }) {
  const role = user?.role;
  const name = user?.first_name || user?.name || '';
  const steps = [{
    part: 'welcome', center: true,
    title: `Welcome${name ? `, ${name}` : ''}! 👋`,
    text: isOwner(role)
      ? 'Let us show you around your boutique workspace. It takes about a minute, and you can skip any part, or all of it.'
      : 'Let us show you around your workspace: where your work is, and how to get it done. It takes less than a minute.',
  }];
  menu.forEach((item) => {
    const text = describe(item.tour, role);
    if (!text) return;
    steps.push({ part: 'menu', title: item.label, text, targets: [`.portal-sidebar [data-tour="${item.tour}"]`, `.mobile-bottom-nav [data-tour="${item.tab}"]`], menuItem: true });
  });
  if (isOwner(role)) {
    steps.push({
      part: 'tools', title: 'Your numbers',
      text: 'This month\'s revenue, the money still to collect, the orders in progress and your customers, updated as you work.',
      targets: ['.portal-main .at-stat-grid.dash-stats'], optional: true,
    });
    steps.push({
      part: 'tools', title: 'Getting started',
      text: 'Your first steps, in the order the work flows: add a customer, take an order, add your team, stock your fabrics. Each one ticks itself off once it is done.',
      targets: ['.portal-main [data-tour="getting-started"]'], optional: true,
    });
    steps.push({
      part: 'tools', title: 'Take a new order',
      text: 'Start here when a customer walks in: pick the garment, take measurements and the design, and the order goes to your workshop.',
      targets: ['.portal-main .at-page-head .btn-gold'], optional: true,
    });
    steps.push({
      part: 'tools', title: 'Alerts',
      text: 'New requests, payments and anything that needs you show up here, with a count of what you have not read yet.',
      targets: ['.portal-account-bell-btn', '.mobile-app-header [aria-label="Notifications"]'], optional: true,
    });
  }
  steps.push({
    part: 'tools', title: 'Your account',
    text: 'Your profile, the settings, and signing out. You will also find "Take the tour" here, to see this guide again any time.',
    targets: ['.portal-account-bar .acct-menu-btn', '.mobile-app-header .mobile-account-btn'],
  });
  steps.push({
    part: 'end', center: true,
    title: 'You are all set! 🎉',
    text: isOwner(role)
      ? 'That is your workspace. Start with a new order, or add your team first. You can replay this tour from your account menu whenever you like.'
      : 'That is everything you need. Open My work to begin. You can replay this tour from your account menu whenever you like.',
  });
  return steps;
}

const PAD = 6;     // the lit area's margin round its target
const GAP = 14;    // between the lit area and the card

/** The first of a step's targets that is on screen, or null. */
function findTarget(step) {
  for (const sel of step.targets || []) {
    for (const el of document.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (r.width > 0 && r.height > 0 && style.visibility !== 'hidden'
          && r.right > 0 && r.left < window.innerWidth) return el;
    }
  }
  return null;
}

/** Where the card goes: beside the lit area, wherever there is the most room. */
function place(rect, card) {
  const vw = window.innerWidth, vh = window.innerHeight;
  const cw = card.width, ch = card.height;
  const clampX = (x) => Math.max(12, Math.min(x, vw - cw - 12));
  const clampY = (y) => Math.max(12, Math.min(y, vh - ch - 12));
  const room = { right: vw - rect.right, left: rect.left, bottom: vh - rect.bottom, top: rect.top };
  if (vw > 640 && room.right >= cw + GAP + 12) {
    return { left: rect.right + GAP, top: clampY(rect.top + rect.height / 2 - ch / 2), side: 'right' };
  }
  if (room.bottom >= ch + GAP + 12) return { left: clampX(rect.left + rect.width / 2 - cw / 2), top: rect.bottom + GAP, side: 'bottom' };
  if (room.top >= ch + GAP + 12) return { left: clampX(rect.left + rect.width / 2 - cw / 2), top: rect.top - GAP - ch, side: 'top' };
  if (vw > 640 && room.left >= cw + GAP + 12) return { left: rect.left - GAP - cw, top: clampY(rect.top + rect.height / 2 - ch / 2), side: 'left' };
  return { left: clampX(rect.left + rect.width / 2 - cw / 2), top: clampY(vh - ch - 12), side: 'over' };
}

export default function ProductTour({ open, user, menu, onClose, onMenu, page }) {
  // A page's tour keeps only the steps whose part is on the page as it opens.
  const steps = useMemo(() => (page
    ? pageTourSteps(page, user?.role).filter((s) => findTarget(s))
    : buildSteps({ user, menu })), [page, user, menu]);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState(null);
  const [pos, setPos] = useState(null);
  const cardRef = useRef(null);
  const step = steps[index];
  const target = useRef(null);

  // Finish at the end; Skip all, ✕ and Esc skip it (onClose is told which).
  const finish = useCallback(() => { markTourSeen(user, page); onClose({ skipped: false }); }, [user, page, onClose]);
  const skipAll = useCallback(() => { markTourSeen(user, page); onClose({ skipped: true }); }, [user, page, onClose]);
  // A step whose target is not on this screen (the New order button off the
  // Dashboard, the bell on another page) is passed over; a menu item that
  // only the phone's ☰ menu holds is shown as a card in the middle.
  const usable = useCallback((s) => !s.optional || !!findTarget(s), []);
  const go = useCallback((dir) => {
    setIndex((i) => {
      let n = i + dir;
      while (n >= 0 && n < steps.length && !usable(steps[n])) n += dir;
      return Math.max(0, Math.min(n, steps.length - 1));
    });
  }, [steps, usable]);
  // Skip: the rest of this part -- on to the first step of the next one.
  const skipPart = useCallback(() => {
    setIndex((i) => {
      const part = steps[i].part;
      let n = i + 1;
      while (n < steps.length - 1 && (steps[n].part === part || !usable(steps[n]))) n += 1;
      return Math.min(n, steps.length - 1);
    });
  }, [steps, usable]);

  // Tablet and phone keep the menu in a drawer: open it for the menu part of
  // the tour (so each item can be lit), and close it again after.
  const drawer = useRef(false);
  useEffect(() => {
    if (!onMenu) return;
    const want = !!(open && step?.menuItem && window.innerWidth <= 1024);
    if (want !== drawer.current) { drawer.current = want; onMenu(want); }
  }, [open, step, onMenu]);
  useEffect(() => () => { if (drawer.current && onMenu) onMenu(false); }, [onMenu]);

  // Find, scroll to and measure the target; keep measuring while it moves.
  useLayoutEffect(() => {
    if (!open || !step) return undefined;
    let frame = 0;
    // The target is looked for again as the drawer slides in.
    const measureNow = () => {
      if (!step.center) {
        // The first target in the step's own order that is on screen now --
        // the drawer's item once it has slid in, not the bar under it.
        const now = findTarget(step);
        if (now !== target.current) {
          target.current = now;
          now?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }
      }
      const t = step.center ? null : target.current;
      setRect(t ? t.getBoundingClientRect() : null);
    };
    // Scrolling and resizing: once a frame. Everything else measures at once,
    // so the tour does not wait on frames a hidden tab never draws.
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measureNow);
    };
    target.current = step.center ? null : findTarget(step);
    target.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    measureNow();
    const late = setTimeout(measureNow, 250);
    const later = setTimeout(measureNow, 450);
    const settled = setTimeout(measureNow, 800);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    // The drawer sliding in moves the item without a scroll or resize.
    const onSlide = (e) => { if (!e.target.closest?.('.pt')) measureNow(); };
    document.addEventListener('transitionend', onSlide, true);
    return () => {
      cancelAnimationFrame(frame); clearTimeout(late); clearTimeout(later); clearTimeout(settled);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
      document.removeEventListener('transitionend', onSlide, true);
    };
  }, [open, step]);

  // The card's place follows the lit area and the card's own size.
  useLayoutEffect(() => {
    if (!open) return;
    const card = cardRef.current;
    if (!card) return;
    const size = card.getBoundingClientRect();
    if (!rect) {
      setPos({ left: Math.max(12, (window.innerWidth - size.width) / 2), top: Math.max(12, (window.innerHeight - size.height) / 2), side: 'center' });
      return;
    }
    const lit = { left: rect.left - PAD, top: rect.top - PAD, right: rect.right + PAD, bottom: rect.bottom + PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 };
    setPos(place(lit, size));
  }, [open, rect, index]);

  // Keys: → / Enter next, ← back, Esc skip all. Focus sits on the card.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); skipAll(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); if (index === steps.length - 1) finish(); else go(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, index, steps.length, go, finish, skipAll]);
  useEffect(() => { if (open) cardRef.current?.focus({ preventScroll: true }); }, [open, index]);

  if (!open || !step) return null;

  const intro = index === 0 && !!step.center;
  const last = index === steps.length - 1;
  const counted = steps.filter((s) => !s.center);
  const number = counted.indexOf(step) + 1;
  const middle = !step.center;
  const offMenu = step.menuItem && !rect;
  const lit = rect && {
    left: rect.left - PAD, top: rect.top - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2,
  };

  return (
    <div className="pt" role="presentation">
      {/* Blocks the page behind while the tour is open. */}
      <div className={`pt-shade${lit ? '' : ' pt-shade--full'}`} />
      {lit && <div className="pt-lit" style={lit} aria-hidden="true" />}
      <div ref={cardRef} className={`pt-card pt-card--${pos?.side || 'center'}${step.center ? ' pt-card--intro' : ''}`}
           style={pos ? { left: pos.left, top: pos.top } : { visibility: 'hidden' }}
           role="dialog" aria-modal="true" aria-labelledby="pt-title" aria-describedby="pt-text" tabIndex={-1}>
        <button type="button" className="pt-close" onClick={skipAll} aria-label="Close the tour" title="Close the tour"><X size={16} /></button>
        {step.center && <span className="pt-step">{intro ? 'Quick tour' : 'All done'}</span>}
        {middle && <span className="pt-step">Step {number} of {counted.length}</span>}
        <h3 id="pt-title" className="pt-title">{step.title}</h3>
        <p id="pt-text" className="pt-text">
          {step.text}
          {offMenu && <span className="pt-hint"> You will find it in the menu ☰ at the top left.</span>}
        </p>
        {middle && (
          <div className="pt-dots" aria-hidden="true">
            {counted.map((s, i) => <span key={i} className={i + 1 === number ? 'is-on' : i + 1 < number ? 'is-done' : ''} />)}
          </div>
        )}
        <div className="pt-actions">
          {!last && <button type="button" className="pt-link" onClick={skipAll}>Skip all</button>}
          {middle && !last && <button type="button" className="pt-link" onClick={skipPart} title="Skip the rest of this part">Skip</button>}
          <span className="pt-spacer" />
          {index > 0 && <button type="button" className="pt-btn pt-btn--ghost" onClick={() => go(-1)}><ArrowLeft size={15} /> Back</button>}
          {last
            ? <button type="button" className="pt-btn" onClick={finish}>Finish</button>
            : <button type="button" className="pt-btn" onClick={() => go(1)}>{intro ? 'Start the tour' : 'Next'} <ArrowRight size={15} /></button>}
        </div>
      </div>
    </div>
  );
}
