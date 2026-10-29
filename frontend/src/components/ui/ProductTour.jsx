/* The first-visit guided tour of the workspace (App.jsx, view 'dashboard').
   A dimmed screen with one part lit up at a time -- a menu item, the New
   order button, the account menu -- and a card beside it saying what it is
   for, with Back / Next, Skip (the rest of this part) and Skip all (end the
   tour). Each role gets its own tour, built from the menu that user really
   has. It opens once per person per browser (localStorage), and "Guide for
   this page" in the account menu replays it. With `page`, it is that page's own
   tour instead (tourPages.js), shown the first time the page is opened.
   With `task`, it is a hands-on guide to one Getting started item
   (tourTasks.js): the page stays usable, the lit part is the real button or
   box to use, and the guide moves on as the person does each thing.
   The tours themselves never click or change anything. */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, X } from 'lucide-react';
import { markTourSeen } from './tourState';
import { pageTourSteps } from './tourPages';
import { taskSteps } from './tourTasks';
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
/** The first-visit tour: the Dashboard only, page by page from there on --
 *  every other page shows its own short guide the first time it is opened
 *  (tourPages.js), so the menu is not walked through item by item. */
function buildSteps({ user }) {
  const role = user?.role;
  const name = user?.first_name || user?.name || '';
  const owner = isOwner(role);
  const steps = [{
    part: 'welcome', center: true,
    title: `Welcome${name ? `, ${name}` : ''}! 👋`,
    text: owner
      ? 'Let us show you around your Dashboard. Every other page has its own short guide, shown the first time you open it.'
      : 'Here is a quick look around. Every page has its own short guide, shown the first time you open it.',
  }];
  if (owner) {
    steps.push({
      part: 'dash', title: 'Your Dashboard', text: describe('overview', role),
      targets: ['.portal-main .at-page-head .at-page-title'], optional: true,
    });
    steps.push({
      part: 'dash', title: 'Your numbers',
      text: "This month's revenue, pending payments, the orders in progress and your customers, updated as you work.",
      targets: ['.portal-main .at-stat-grid.dash-stats'], optional: true,
    });
    steps.push({
      part: 'dash', title: 'Getting started',
      text: 'Your first steps, in the order the work flows: add a customer, take an order, add your team, stock your fabrics. Click any of them and it guides you through it. Each one ticks itself off once it is done.',
      targets: ['.portal-main [data-tour="getting-started"]'], optional: true,
    });
    steps.push({
      part: 'dash', title: 'Take a new order',
      text: 'Start here when a customer walks in: pick the garment, take measurements and the design, and the order goes to your workshop.',
      targets: ['.portal-main .at-page-head .btn-gold'], optional: true,
    });
    steps.push({
      part: 'dash', title: 'Alerts',
      text: 'New requests, payments and anything that needs you show up here, with a count of what you have not read yet.',
      targets: ['.portal-account-bell-btn', '.mobile-app-header [aria-label="Notifications"]'], optional: true,
    });
  }
  steps.push({
    part: 'account', title: 'Your account',
    text: 'Your profile, the settings, and signing out. You will also find "Guide for this page" here, to see the guide for whichever page you are on again.',
    targets: ['.portal-account-bar .acct-menu-btn', '.mobile-app-header .mobile-account-btn'],
  });
  steps.push({
    part: 'end', center: true,
    title: 'You are all set! 🎉',
    text: owner
      ? 'That is your Dashboard. Open any page from the menu, and it shows you around the first time. You can replay this from your account menu whenever you like.'
      : 'Next, a short guide to your page. Every page you open shows you around the first time. You can replay this from your account menu whenever you like.',
  });
  return steps;
}

/** A step's text as its sentences (split after . ! or ? and a space). */
const sentences = (text) => String(text || '').split(/(?<=[.!?])\s+/).filter(Boolean);

const PAD = 6;     // the lit area's margin round its target
const GAP = 14;    // between the lit area and the card

const candidates = (target) => {
  if (typeof target === 'string') return [...document.querySelectorAll(target)];
  const found = [...document.querySelectorAll(target.sel)]
    .filter((el) => el.textContent.trim().startsWith(target.text));
  return found.map((el) => {
    let at = el;
    for (let i = 0; i < (target.up || 0) && at.parentElement; i += 1) at = at.parentElement;
    return at;
  });
};

/** The heading of the order wizard's current screen, for steps with `at`. */
const wizardTitle = () => document.querySelector('h1.page-title')?.textContent.trim() || '';
const atMatches = (step) => !step.at || step.at.test(wizardTitle());

/** The first of a step's targets that is on screen, or null. */
function findTarget(step) {
  for (const sel of step.targets || []) {
    for (const el of candidates(sel)) {
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

export default function ProductTour({ open, user, onClose, onMenu, page, task, taskLabel }) {
  // A page's tour keeps only the steps whose part is on the page as it opens.
  // A page's steps are the parts already on the page; while the page is
  // still drawing them (its data loading), look again for a few seconds
  // before giving up, rather than opening empty.
  const pageParts = () => pageTourSteps(page, user?.role).filter((s) => findTarget(s));
  const [found, setFound] = useState(() => (page ? pageParts() : []));
  const waiting = !!page && found.length === 0;
  useEffect(() => {
    if (!waiting) return undefined;
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      const now = pageTourSteps(page, user?.role).filter((st) => findTarget(st));
      if (now.length) { clearInterval(timer); setFound(now); }
      else if (tries >= 20) { clearInterval(timer); onClose({ empty: true }); }
    }, 300);
    return () => clearInterval(timer);
  }, [waiting, page, user, onClose]);
  const steps = useMemo(() => (task
    ? taskSteps(task)
    : page
      ? found
      : buildSteps({ user })), [task, page, user, found]);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState(null);
  const [pos, setPos] = useState(null);
  const cardRef = useRef(null);
  const step = steps[index];
  const target = useRef(null);

  // Finish at the end; Skip all, ✕ and Esc skip it (onClose is told which).
  const finish = useCallback(() => { if (!task) markTourSeen(user, page); onClose({ skipped: false }); }, [task, user, page, onClose]);
  const skipAll = useCallback(() => { if (!task) markTourSeen(user, page); onClose({ skipped: true }); }, [task, user, page, onClose]);
  // A step whose target is not on this screen (the New order button off the
  // Dashboard, the bell on another page) is passed over; a menu item that
  // only the phone's ☰ menu holds is shown as a card in the middle.
  // A guide's wizard steps count only on their own screen of the wizard.
  const usable = useCallback((s) => (!s.optional || !!findTarget(s)) && atMatches(s), []);
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
    // Scrolling and resizing measure straight away too (a frame-timed measure
    // waits on frames a background tab never draws, and the lit part lags).
    const measure = () => {
      cancelAnimationFrame(frame);
      measureNow();
    };
    target.current = step.center ? null : findTarget(step);
    target.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    measureNow();
    const late = setTimeout(measureNow, 250);
    const later = setTimeout(measureNow, 450);
    const settled = setTimeout(measureNow, 800);
    // A guide's page keeps changing under it (forms open, fields grow).
    const poll = step.task ? setInterval(measureNow, 400) : 0;
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    // The drawer sliding in moves the item without a scroll or resize.
    const onSlide = (e) => { if (!e.target.closest?.('.pt')) measureNow(); };
    document.addEventListener('transitionend', onSlide, true);
    return () => {
      cancelAnimationFrame(frame); clearTimeout(late); clearTimeout(later); clearTimeout(settled); clearInterval(poll);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
      document.removeEventListener('transitionend', onSlide, true);
    };
  }, [open, step]);

  // A guide: keep up with the page. On a wizard screen the step does not
  // belong to, go to the nearest step that does (back first: a Next that the
  // form refused); when the lit part is gone and a later step's screen is up,
  // go there.
  const indexRef = useRef(index);
  useEffect(() => { indexRef.current = index; }, [index]);
  useEffect(() => {
    if (!open || !task) return undefined;
    const sync = () => {
      const i = indexRef.current;
      const s = steps[i];
      if (!s) return;
      if (s.at && !atMatches(s)) {
        for (let n = i - 1; n >= 0; n -= 1) if (steps[n].at && atMatches(steps[n])) { setIndex(n); return; }
        for (let n = i + 1; n < steps.length; n += 1) if (steps[n].at && atMatches(steps[n])) { setIndex(n); return; }
        return;
      }
      if (!findTarget(s)) {
        for (let n = i + 1; n < steps.length; n += 1) {
          if (steps[n].at && atMatches(steps[n]) && findTarget(steps[n])) { setIndex(n); return; }
        }
      }
    };
    const timer = setInterval(sync, 400);
    return () => clearInterval(timer);
  }, [open, task, steps]);
  // The move after a click outlives re-renders (the click itself re-renders
  // the app), so it keeps the latest go / finish in refs.
  const moveRef = useRef({ go, finish, last: steps.length - 1 });
  useEffect(() => { moveRef.current = { go, finish, last: steps.length - 1 }; }, [go, finish, steps.length]);
  const pending = useRef(0);
  useEffect(() => () => clearTimeout(pending.current), []);
  useEffect(() => {
    if (!open || !task || !step?.click) return undefined;
    const onClick = (e) => {
      const lit = target.current;
      if (!lit || !lit.contains(e.target)) return;
      // A moment for the click to do its work (open the form, change screen).
      clearTimeout(pending.current);
      pending.current = setTimeout(() => {
        const { go: next, finish: done, last } = moveRef.current;
        if (indexRef.current === last) done(); else next(1);
      }, 350);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [open, task, step]);

  // The card's place follows the lit area and the card's own size.
  useLayoutEffect(() => {
    if (!open) return;
    const card = cardRef.current;
    if (!card) return;
    const size = card.getBoundingClientRect();
    if (!rect) {
      if (task) {
        setPos({ left: Math.max(12, window.innerWidth - size.width - 20), top: Math.max(12, window.innerHeight - size.height - 20), side: 'corner' });
        return;
      }
      setPos({ left: Math.max(12, (window.innerWidth - size.width) / 2), top: Math.max(12, (window.innerHeight - size.height) / 2), side: 'center' });
      return;
    }
    const lit = { left: rect.left - PAD, top: rect.top - PAD, right: rect.right + PAD, bottom: rect.bottom + PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 };
    setPos(place(lit, size));
  }, [open, rect, index, task]);

  // Keys: → / Enter next, ← back, Esc skip all. Focus sits on the card.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      const el = e.target;
      if (el?.closest?.('input, textarea, select, [contenteditable="true"]') && !el.closest('.pt')) return;
      if (e.key === 'Escape') { e.preventDefault(); skipAll(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); if (index === steps.length - 1) finish(); else go(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, index, steps.length, go, finish, skipAll]);
  // A guide leaves the focus where the person is typing.
  useEffect(() => { if (open && !task) cardRef.current?.focus({ preventScroll: true }); }, [open, index, task]);

  if (!open || !step) return null;

  const intro = index === 0 && !!step.center;
  const last = index === steps.length - 1;
  const counted = steps.filter((s) => !s.center);
  const number = counted.indexOf(step) + 1;
  const middle = !step.center;
  const offMenu = step.menuItem && !rect;
  const text = task && !rect && step.missing ? step.missing : step.text;
  const lit = rect && {
    left: rect.left - PAD, top: rect.top - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2,
  };

  return (
    <div className={`pt${task ? ' pt--task' : ''}`} role="presentation">
      {/* Blocks the page behind while a tour is open; a guide leaves it usable. */}
      <div className={`pt-shade${lit ? '' : ' pt-shade--full'}`} />
      {lit && <div className="pt-lit" style={lit} aria-hidden="true" />}
      <div ref={cardRef} className={`pt-card pt-card--${pos?.side || 'center'}${step.center ? ' pt-card--intro' : ''}`}
           style={pos ? { left: pos.left, top: pos.top } : { visibility: 'hidden' }}
           role="dialog" aria-modal={task ? 'false' : 'true'} aria-labelledby="pt-title" aria-describedby="pt-text" tabIndex={-1}>
        <button type="button" className="pt-close" onClick={skipAll} aria-label="Close the tour" title="Close the tour"><X size={16} /></button>
        {step.center && <span className="pt-step">{intro ? 'Quick tour' : 'All done'}</span>}
        {middle && !task && <span className="pt-step">Step {number} of {counted.length}</span>}
        {task && <span className="pt-step">{taskLabel || 'Guide'}</span>}
        <h3 id="pt-title" className="pt-title">{step.title}</h3>
        <p id="pt-text" className="pt-text">
          {/* One sentence to a line, each starting under the one before. */}
          {sentences(text).map((line) => <span key={line} className="pt-line">{line}</span>)}
          {offMenu && <span className="pt-line pt-hint">You will find it in the menu ☰ at the top left.</span>}
        </p>
        {middle && !task && (
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
