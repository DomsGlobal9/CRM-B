/**
 * The console's navigation, as data.
 *
 * One list rather than markup, because three things read it: the nav rail, the
 * router's screen lookup, and the "unknown route" fallback. When those drifted
 * apart in the boutique workspace the desktop and mobile menus ended up
 * disagreeing about which screens exist (frontend/src/App.jsx nav vs
 * BottomNavigation) -- worth not repeating.
 *
 * `absent: true` marks a screen the specification asks for that this product
 * has no data behind. It is still listed and still reachable: the screen
 * explains what is missing and why, which is more useful than a menu with a
 * hole in it where someone expected an item. See core/modules.py for the
 * server-side equivalent of the same decision.
 */

import {
  Activity, AlertTriangle, Building2, FileWarning, Fingerprint, Gauge, HeartPulse,
  KeyRound, LayoutDashboard, Mail, Plug, PackageSearch, ScrollText, Settings,
  ShieldAlert, ShoppingBag, Sparkles, Users, Wrench,
} from 'lucide-react';

export const NAV = [
  {
    group: 'Overview',
    items: [
      { key: 'dashboard', label: 'Home', icon: LayoutDashboard },
      { key: 'health', label: 'Is everything working?', icon: HeartPulse },
    ],
  },
  {
    group: 'Boutiques',
    items: [
      { key: 'boutiques', label: 'All boutiques', icon: Building2 },
      { key: 'users', label: 'Staff accounts', icon: Users },
      { key: 'onboarding', label: 'Setup progress', icon: Sparkles },
      { key: 'leads', label: 'Demo requests', icon: Mail },
      { key: 'support', label: 'One boutique in depth', icon: Wrench },
    ],
  },
  {
    group: 'Product controls',
    items: [
      { key: 'modules', label: 'Features per boutique', icon: PackageSearch },
      // Feature Flags is deliberately NOT listed, and the screen it pointed at
      // is still in the repository.
      //
      // FeatureFlag, its API and FeatureFlag.applies_to(schema) all work and
      // are tested. Nothing in the product calls applies_to -- not one line of
      // backend code, not one line of frontend code. So the screen was a set of
      // switches an administrator could throw, which reported success, and
      // which changed nothing anywhere.
      //
      // That is worse than an absent feature. Every other control in this
      // console does what it says, so an operator has no reason to suspect this
      // one, and a flag flipped in an incident would be believed. Showing a
      // switch that controls nothing is how a control plane loses the property
      // it exists for.
      //
      // Put it back the moment there is a real consumer: add the item here and
      // the `flags` entry to SCREENS in SuperAdmin.jsx (both are required), and
      // point superadmin/models.py FeatureFlag at what now reads it.
      { key: 'config', label: 'Settings & maintenance', icon: Settings },
    ],
  },
  {
    group: 'Activity',
    items: [
      { key: 'orders', label: 'Orders across boutiques', icon: ShoppingBag },
      { key: 'messaging', label: 'WhatsApp backlog', icon: Activity },
      { key: 'integrations', label: 'Connected services', icon: Plug },
    ],
  },
  {
    group: 'Problems',
    items: [
      { key: 'errors', label: 'Crashes', icon: FileWarning, badge: 'errors' },
      // Sits directly under Crashes because the pair only makes sense
      // together: that screen is what nothing caught, this one is everything
      // the product handled -- swallowed exceptions, refusals by our own
      // controls, deliberate 4xx and browser crashes. Kept apart rather than
      // merged because mixing them buries fifty crashes under fifty thousand
      // validation errors, which is the whole reason ErrorEvent grew a `kind`.
      { key: 'handling', label: 'Other errors', icon: ShieldAlert },
      // 'jobs' and 'api' are still routable (SuperAdmin.jsx SCREENS) and
      // explain why this product has neither; they are off the menu because
      // a menu item that leads to "there is nothing here" is a false lead.
    ],
  },
  {
    group: 'Security',
    items: [
      { key: 'signins', label: 'Sign-in attempts', icon: Fingerprint },
      { key: 'sessions', label: 'Who has access', icon: KeyRound },
      { key: 'audit', label: 'What admins did', icon: ScrollText },
    ],
  },
];

/** Every routable key, for the unknown-route check. */
export const ROUTES = new Set(NAV.flatMap((g) => g.items.map((i) => i.key)));

export const labelFor = (key) => {
  for (const group of NAV) {
    for (const item of group.items) if (item.key === key) return item.label;
  }
  return key;
};
