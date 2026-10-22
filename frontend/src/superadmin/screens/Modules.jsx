/**
 * Which parts of the product each boutique is allowed to reach.
 *
 * The grid is the screen: boutiques down, gateable modules across, the switch in
 * the cell. These are server gates -- tenants/middleware.py refuses the request
 * -- not hidden menu items, so the confirmation names the URL prefixes that stop
 * answering rather than saying "this feature".
 *
 * Everything comes in one request and is filtered in the browser because
 * /modules/ returns the registry plus every tenant row and offers no filters:
 * there is nothing to push to the server. Same honesty as Boutiques.jsx, and the
 * same ceiling -- past a few hundred boutiques this endpoint needs paging first.
 *
 * What is NOT switchable is rendered underneath from the same response rather
 * than left out. "Why is Orders not in the list" is the first question anyone
 * asks, and core/modules.py already answers it; this screen quotes it.
 */

import { useCallback, useMemo, useState } from 'react';
import {
  ChevronRight, Lock, MonitorSmartphone, PackageSearch, RotateCcw, ShieldCheck, ToggleRight,
} from 'lucide-react';

import { consoleApi } from '../api';
import {
  Async, Card, Confirm, Empty, Modal, Note, PageHeader, Pill, SearchBox, SectionHead, Select,
  Toolbar, useApi, useToast,
} from '../ui';

/* The server sends each boutique's `entitled` list (plan + overrides, computed
   in core/modules.py); this screen never re-derives it, so it cannot disagree
   with the middleware about what is on. */
const isOn = (row, key) => row.entitled.includes(key);
const isOverride = (row, key) => row.enabled_modules && key in row.enabled_modules;

// Twelve columns on a laptop, so the boutique name pins to the left (the
// sa-sticky-start cell) instead of scrolling out of sight and leaving a row of
// anonymous switches. Same problem .sa-sticky-end fixes for the action column
// on Boutiques, other edge. sa-nowrap keeps that name on one line: the grid
// scrolls sideways anyway, and a wrapping name column is the one that gets
// squeezed to a word wide. Stacked on a phone, the cells wrap as usual.

export default function Modules() {
  const toast = useToast();
  const [term, setTerm] = useState('');
  const [pending, setPending] = useState(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  // schema -> {plan, enabled_modules, entitled} as the server last answered.
  // The PATCH response is authoritative, so it replaces the fetched row.
  const [stored, setStored] = useState({});

  const state = useApi(useCallback(() => consoleApi.modules(), []));

  const rows = useMemo(() => {
    if (!state.data) return [];
    const needle = term.trim().toLowerCase();
    const list = [...state.data.boutiques].sort((a, b) => a.name.localeCompare(b.name));
    if (!needle) return list;
    return list.filter((b) => `${b.name} ${b.schema_name}`.toLowerCase().includes(needle));
  }, [state.data, term]);

  const remember = (schema, result) =>
    setStored((map) => ({ ...map, [schema]: {
      plan: result.plan, enabled_modules: result.enabled_modules, entitled: result.entitled } }));

  // "Module" on this screen is a product module (CRM, Inventory, ...); each
  // bundles the switchable features the server actually gates.
  const featureOf = (key) => state.data?.modules.find((m) => m.key === key);
  const labelOf = (key) => featureOf(key)?.label || key;
  const productModules = state.data?.product_modules || [];
  // The boutique+module whose features are open in the side panel.
  const [open, setOpen] = useState(null);

  const moduleState = (row, mod) => {
    const on = mod.features.filter((k) => row.entitled.includes(k)).length;
    if (!mod.features.length) return 'coming soon';
    if (on === 0) return 'off';
    return on === mod.features.length ? 'on' : 'partly';
  };

  const apply = async (reason) => {
    const { boutique, module, plan, next, bundle } = pending;
    setBusy(true);
    try {
      // A plan change carries no module: build the switch body only for one.
      const body = plan ? null : bundle
        ? Object.fromEntries(bundle.features.map((k) => [k, next]))
        : { [module.key]: next };
      const result = plan
        ? await consoleApi.setPlan(boutique.schema_name, plan, reason)
        : await consoleApi.setModules(boutique.schema_name, body, reason);
      remember(boutique.schema_name, result);
      // Kept on the page rather than only in a toast. The five-minute lag is the
      // part someone has to act on -- it is the difference between "it worked"
      // and "it worked in the worker that answered me" -- and a toast is gone
      // before they have finished reading the grid.
      const state = next === null ? 'following the plan' : next ? 'on' : 'off';
      const what = plan
        ? `${boutique.name} is now on ${planLabel(plan)}.`
        : bundle
          ? `Every ${bundle.label} feature is now ${state} for ${boutique.name}.`
          : `${module.label} is now ${state} for ${boutique.name}.`;
      setNote([what, result.note].filter(Boolean).join(' '));
      toast('Saved.');
    } catch (e) {
      toast(e.message, 'off');
    } finally {
      setBusy(false);
      setPending(null);
    }
  };

  const planLabel = (key) => state.data?.plans.find((p) => p.key === key)?.label || key;

  return (
    <>
      <PageHeader
        title="Features per boutique"
        subtitle="Modules per boutique — CRM, Design Studio, Inventory, Team Management, Finance, Try-On, Marketing. The plan sets them; open a module to switch its features one by one. The server enforces it, not just the menu."
      />

      <Async
        state={state}
        isEmpty={(d) => d.boutiques.length === 0}
        empty={<Empty icon={<PackageSearch size={20} />} title="No boutiques to configure."
          detail="Modules are set per boutique, and none have signed up yet." />}
      >
        {(data) => (
          <>
            {note && <Note tone="info">{note}</Note>}

            <Toolbar right={
              <SearchBox value={term} onChange={setTerm} placeholder="Boutique name or schema…" />
            } />

            {rows.length === 0 ? (
              <Empty title="No boutique matches that search." detail="Clear the search to see them all." />
            ) : (
              <>
                <div className="at-table-wrap">
                  <table className="at-table at-table--fit sa-nowrap">
                    <thead>
                      <tr>
                        <th scope="col" className="sa-sticky-start">Boutique</th>
                        <th scope="col">Plan</th>
                        {productModules.map((mod) => (
                          <th key={mod.key} scope="col" title={mod.description}>
                            {mod.label}
                            <div className="at-row-sub">
                              {mod.features.length ? `${mod.features.length} feature${mod.features.length === 1 ? '' : 's'}` : 'coming soon'}
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((b) => {
                        const row = stored[b.schema_name] ?? b;
                        return (
                          <tr key={b.schema_name}>
                            <td data-label="Boutique" className="sa-sticky-start">
                              <div className="at-row-title">{b.name}</div>
                              <div className="sa-schema">{b.schema_name}</div>
                              {/* A suspended boutique reaches nothing at all, so its
                                  switches are still worth setting but not worth
                                  reading as live. */}
                              {!b.is_active && <Pill value="suspended" />}
                            </td>
                            <td data-label="Plan">
                              <Select className="form-control sa-compact sa-narrow" value={row.plan}
                                label={`Plan for ${b.name}`}
                                options={data.plans.map((p) => ({ value: p.key, label: p.label }))}
                                onChange={(plan) => setPending({ boutique: b, plan })} />
                            </td>
                            {productModules.map((mod) => {
                              const st = moduleState(row, mod);
                              // Off is a decision (the plan, or a hand-set value), not a
                              // fault, so it is grey like 'coming soon', never red.
                              const tone = { on: 'ok', partly: 'warn', off: 'muted', 'coming soon': 'muted' }[st];
                              const overridden = mod.features.some((k) => isOverride(row, k));
                              return (
                                <td key={mod.key} data-label={mod.label}>
                                  <button type="button" className="btn-ghost at-btn-sm sa-cell-btn" disabled={!mod.features.length}
                                    aria-label={`${mod.label} for ${b.name}: ${st}`}
                                    onClick={() => setOpen({ boutique: b, module: mod })}>
                                    <Pill value={st} tone={tone} label={st} />{overridden ? ' *' : ''}
                                    {mod.features.length ? (
                                      <>
                                        <span className="at-row-sub">· {mod.features.length} feature{mod.features.length === 1 ? '' : 's'}</span>
                                        <ChevronRight size={14} aria-hidden="true" className="sa-muted" />
                                      </>
                                    ) : null}
                                  </button>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="at-row-sub">
                  Click a module to see and switch its features. * means at least one feature is set by hand, overriding the plan.
                </p>
              </>
            )}

            <SectionHead title="What each plan includes"
              subtitle="On top of orders, customers, invoices and reports, which every boutique has." />
            <div className="at-grid-3">
              {data.plans.map((p) => (
                <Card key={p.key} icon={PackageSearch} title={p.label}>
                  <p>{p.modules.map((k) => productModules.find((m) => m.key === k)?.label || k).join(' · ')}</p>
                </Card>
              ))}
              <Card icon={PackageSearch} title="Add-ons">
                <p>{data.addons.map((k) => labelOf(k)).join(' · ')} — CRM features sold separately; switch them on per boutique inside CRM. Included in {planLabel('atelier')}.</p>
              </Card>
            </div>

            <SectionHead title="Plumbing, always on"
              subtitle="Parts every screen depends on. Not sold, not switchable: a switch here would break the product, not restrict it." />
            <div className="at-grid-3">
              {data.modules.filter((m) => m.infrastructure).map((m) => (
                <Card key={m.key} icon={ShieldCheck} title={m.label}>
                  <p>{m.description}</p>
                </Card>
              ))}
            </div>

            <SectionHead
              title="Always available"
              subtitle="Orders and customers are the product itself; switching them off would break everything else."
            />
            <div className="at-grid-2">
              {data.structural.map((s) => (
                <Card key={s.key} icon={Lock} title={s.label}>
                  {/* Verbatim from the server. Paraphrasing a reason is how a
                      console and its middleware start disagreeing. */}
                  <p>{s.reason}</p>
                </Card>
              ))}
            </div>

            <SectionHead
              title="Screens only, no switch"
              subtitle="These exist only in the app, not on the server, so a switch here would hide a menu item without actually blocking anything. Not offered, to be honest about it."
            />
            <div className="at-grid-3">
              {data.client_only.map((c) => (
                <Card key={c.key} icon={MonitorSmartphone} title={c.key.replace(/_/g, ' ')}>
                  <p>{c.reason}</p>
                </Card>
              ))}
            </div>

            <SectionHead title="Always on"
              subtitle="Signing in and settings can never be switched off." />
            <Card icon={ShieldCheck} title="Authentication, settings, the dashboard and this console">
              <p>
                Login shares the <code>/api/</code> mount with the business routers, so a rule
                keyed on it would lock every boutique out of its own account with no way back
                in — and a console that can lock itself out is a console that will.
              </p>
              <p className="sa-schema">
                {data.always_on.join('   ')}
              </p>
            </Card>
          </>
        )}
      </Async>

      {open && (() => {
        const row = stored[open.boutique.schema_name] ?? open.boutique;
        const mod = open.module;
        const close = () => setOpen(null);
        return (
          <Modal
            icon={ToggleRight}
            title={`${mod.label} — ${open.boutique.name}`}
            subtitle={mod.description}
            width="760px"
            busy={busy}
            onClose={close}
            footer={<button type="button" className="btn-secondary" onClick={close}>Close</button>}
          >
            <div className="sa-inline">
              <button type="button" className="btn-secondary"
                onClick={() => setPending({ boutique: open.boutique, bundle: mod, next: true })}>
                Whole module on
              </button>
              <button type="button" className="btn-secondary at-btn-danger"
                onClick={() => setPending({ boutique: open.boutique, bundle: mod, next: false })}>
                Whole module off
              </button>
              <button type="button" className="btn-secondary"
                onClick={() => setPending({ boutique: open.boutique, bundle: mod, next: null })}>
                <RotateCcw size={16} /> Follow plan
              </button>
            </div>
            <div className="at-table-wrap">
              <table className="at-table at-table--fit">
                <thead>
                  <tr>
                    <th scope="col">Feature</th>
                    <th scope="col">State</th>
                    <th scope="col">Set by</th>
                    <th scope="col"></th>
                  </tr>
                </thead>
                <tbody>
                  {mod.features.map((k) => {
                    const f = featureOf(k);
                    const on = isOn(row, k);
                    const override = isOverride(row, k);
                    return (
                      <tr key={k}>
                        <td data-label="Feature" title={f?.description}>
                          {f?.label || k}{f?.addon ? <span className="at-row-sub"> add-on</span> : null}
                        </td>
                        <td data-label="State">
                          <Pill value={on ? 'on' : 'off'} tone={on ? 'ok' : 'muted'} label={on ? 'on' : 'off'} />
                        </td>
                        <td data-label="Set by" className="sa-muted">
                          {override ? 'by hand' : `${planLabel(row.plan)} plan`}
                        </td>
                        <td data-label="Actions" className="sa-actions">
                          <div className="sa-inline">
                            <button type="button" className={`btn-secondary at-btn-sm${on ? ' at-btn-danger' : ''}`}
                              onClick={() => setPending({ boutique: open.boutique, module: f, next: !on })}>
                              Switch {on ? 'off' : 'on'}
                            </button>
                            {override && (
                              <button type="button" className="at-icon-btn"
                                title="Remove the hand-set value so this follows the plan again"
                                aria-label="Remove the hand-set value so this follows the plan again"
                                onClick={() => setPending({ boutique: open.boutique, module: f, next: null })}>
                                <RotateCcw size={16} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Modal>
        );
      })()}

      <Confirm
        open={Boolean(pending)}
        busy={busy}
        danger={pending ? pending.next === false : false}
        requireReason
        title={!pending ? '' : pending.plan
          ? `Move ${pending.boutique.name} to ${planLabel(pending.plan)}?`
          : pending.bundle
            ? `${pending.next === null ? 'Let every' : pending.next ? 'Switch every' : 'Switch every'} ${pending.bundle.label} feature ${pending.next === null ? 'follow the plan' : pending.next ? 'on' : 'off'} for ${pending.boutique.name}?`
          : pending.next === null
            ? `Let ${pending.module.label} follow the plan for ${pending.boutique.name}?`
            : `Switch ${pending.module.label} ${pending.next ? 'on' : 'off'} for ${pending.boutique.name}?`}
        confirmLabel={!pending ? '' : pending.plan ? 'Change plan'
          : pending.next === null ? 'Follow plan' : pending.next ? 'Switch on' : 'Switch off'}
        body={pending && (pending.bundle ? (
          <p>
            {pending.bundle.features.map(labelOf).join(', ')}
            {pending.next === null ? ' go back to whatever the plan says.'
              : pending.next ? ' become reachable, whatever the plan says.'
              : ' are refused by the server until switched back on. Nothing is deleted.'}
          </p>
        ) : pending.plan ? (
          <>
            <p>
              <strong>{pending.boutique.name}</strong> gets everything in{' '}
              <strong>{planLabel(pending.plan)}</strong>:{' '}
              {(state.data?.plans.find((p) => p.key === pending.plan)?.modules || []).map(labelOf).join(', ')}.
            </p>
            <p>
              Anything set by hand for this boutique (marked *) stays as it is. Screens for
              modules the new plan lacks stop answering; nothing is deleted.
            </p>
          </>
        ) : pending.next === null ? (
          <p>
            The hand-set value is removed and <strong>{pending.module.label}</strong> is whatever
            the <strong>{planLabel((stored[pending.boutique.schema_name] ?? pending.boutique).plan)}</strong> plan says.
          </p>
        ) : pending.next ? (
          <>
            <p>
              <strong>{pending.boutique.name}</strong> can reach{' '}
              <span className="sa-schema">{pending.module.prefixes.join(' ')}</span>
              {pending.module.addon ? ' — an add-on on top of their plan.' : ' again.'}
            </p>
            <p>{pending.module.description}</p>
          </>
        ) : (
          <>
            <p>
              Every request from <strong>{pending.boutique.name}</strong> to{' '}
              <span className="sa-schema">{pending.module.prefixes.join(' ')}</span> is refused
              by the server until you switch it back on.
            </p>
            <p>
              {pending.module.description} Their screens that call those URLs will fail rather
              than disappear. Nothing is deleted, and switching it back on restores it.
            </p>
            <Note tone="info">Other server workers apply this within 5 minutes.</Note>
          </>
        ))}
        onConfirm={apply}
        onCancel={() => setPending(null)}
      />
    </>
  );
}
