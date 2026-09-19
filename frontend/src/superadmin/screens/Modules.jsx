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
import { Info, Lock, MonitorSmartphone, PackageSearch, ShieldCheck } from 'lucide-react';

import { consoleApi } from '../api';
import { Async, Confirm, Empty, Pill, SearchBox, SectionHead, useApi, useToast } from '../ui';

/* The server sends each boutique's `entitled` list (plan + overrides, computed
   in core/modules.py); this screen never re-derives it, so it cannot disagree
   with the middleware about what is on. */
const isOn = (row, key) => row.entitled.includes(key);
const isOverride = (row, key) => row.enabled_modules && key in row.enabled_modules;

// Twelve columns on a laptop, so the boutique name pins to the left instead of
// scrolling out of sight and leaving a row of anonymous switches. Same problem
// .sa-sticky-end fixes for the action column on Boutiques, other edge.
const PINNED = { position: 'sticky', left: 0, background: 'var(--surface-color)', zIndex: 1 };

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
      <Async
        state={state}
        isEmpty={(d) => d.boutiques.length === 0}
        empty={<Empty icon={<PackageSearch size={22} />} title="No boutiques to configure."
          detail="Modules are set per boutique, and none have signed up yet." />}
      >
        {(data) => (
          <>
            <SectionHead
              title="Features per boutique"
              subtitle="Modules per boutique — CRM, Design Studio, Inventory, Team Management, Finance, Try-On, Marketing. The plan sets them; open a module to switch its features one by one. The server enforces it, not just the menu."
            >
              <SearchBox value={term} onChange={setTerm} placeholder="Boutique name or schema…" />
            </SectionHead>

            {note && <div className="sa-note info">{note}</div>}

            {rows.length === 0 ? (
              <Empty title="No boutique matches that search." detail="Clear the search to see them all." />
            ) : (
              <div className="sa-table-wrap">
                <table className="sa-table">
                  <thead>
                    <tr>
                      <th style={PINNED}>Boutique</th>
                      <th>Plan</th>
                      {productModules.map((mod) => (
                        <th key={mod.key} title={mod.description}>
                          {mod.label}
                          <div className="sa-schema">
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
                          <td style={PINNED}>
                            <div className="sa-name">{b.name}</div>
                            <div className="sa-schema">{b.schema_name}</div>
                            {/* A suspended boutique reaches nothing at all, so its
                                switches are still worth setting but not worth
                                reading as live. */}
                            {!b.is_active && <Pill value="suspended" />}
                          </td>
                          <td>
                            <select className="sa-select" style={{ width: 110 }} value={row.plan}
                              aria-label={`Plan for ${b.name}`}
                              onChange={(e) => setPending({ boutique: b, plan: e.target.value })}>
                              {data.plans.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                            </select>
                          </td>
                          {productModules.map((mod) => {
                            const st = moduleState(row, mod);
                            const tone = { on: 'ok', partly: 'warn', off: 'off', 'coming soon': 'muted' }[st];
                            const overridden = mod.features.some((k) => isOverride(row, k));
                            return (
                              <td key={mod.key}>
                                <button className="sa-btn" disabled={!mod.features.length}
                                  aria-label={`${mod.label} for ${b.name}: ${st}`}
                                  onClick={() => setOpen({ boutique: b, module: mod })}>
                                  <Pill value={st} tone={tone} label={st} />{overridden ? " *" : ""}{mod.features.length ? <span className="sa-schema"> · {mod.features.length} feature{mod.features.length === 1 ? "" : "s"} ▸</span> : null}
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="sa-muted" style={{ fontSize: 12.5, marginTop: 8 }}>
                  Click a module to see and switch its features. * means at least one feature is set by hand, overriding the plan.
                </p>
              </div>
            )}

            <div style={{ marginTop: 32 }}>
              <SectionHead title="What each plan includes"
                subtitle="On top of orders, customers, invoices and reports, which every boutique has." />
              <div className="sa-cards">
                {data.plans.map((p) => (
                  <div key={p.key} className="sa-card">
                    <h4><PackageSearch size={14} /> {p.label}</h4>
                    <p>{p.modules.map((k) => productModules.find((m) => m.key === k)?.label || k).join(' · ')}</p>
                  </div>
                ))}
                <div className="sa-card">
                  <h4><PackageSearch size={14} /> Add-ons</h4>
                  <p>{data.addons.map((k) => labelOf(k)).join(' · ')} — CRM features sold separately; switch them on per boutique inside CRM. Included in {planLabel('atelier')}.</p>
                </div>
              </div>
            </div>

            <div style={{ marginTop: 32 }}>
              <SectionHead title="Plumbing, always on"
                subtitle="Parts every screen depends on. Not sold, not switchable: a switch here would break the product, not restrict it." />
              <div className="sa-cards">
                {data.modules.filter((m) => m.infrastructure).map((m) => (
                  <div key={m.key} className="sa-card">
                    <h4><ShieldCheck size={14} /> {m.label}</h4>
                    <p>{m.description}</p>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginTop: 32 }}>
              <SectionHead
                title="Always available"
                subtitle="Orders and customers are the product itself; switching them off would break everything else."
              />
              <div className="sa-cards">
                {data.structural.map((s) => (
                  <div key={s.key} className="sa-card">
                    <h4><Lock size={14} /> {s.label}</h4>
                    {/* Verbatim from the server. Paraphrasing a reason is how a
                        console and its middleware start disagreeing. */}
                    <p>{s.reason}</p>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginTop: 32 }}>
              <SectionHead
                title="Screens only, no switch"
                subtitle="These exist only in the app, not on the server, so a switch here would hide a menu item without actually blocking anything. Not offered, to be honest about it."
              />
              <div className="sa-cards">
                {data.client_only.map((c) => (
                  <div key={c.key} className="sa-card">
                    <h4><MonitorSmartphone size={14} /> {c.key.replace(/_/g, ' ')}</h4>
                    <p>{c.reason}</p>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginTop: 32 }}>
              <SectionHead title="Always on"
                subtitle="Signing in and settings can never be switched off." />
              <div className="sa-card">
                <h4><ShieldCheck size={14} /> Authentication, settings, the dashboard and this console</h4>
                <p>
                  Login shares the <code>/api/</code> mount with the business routers, so a rule
                  keyed on it would lock every boutique out of its own account with no way back
                  in — and a console that can lock itself out is a console that will.
                </p>
                <p className="sa-schema" style={{ marginTop: 10 }}>
                  {data.always_on.join('   ')}
                </p>
              </div>
            </div>
          </>
        )}
      </Async>

      {open && (() => {
        const row = stored[open.boutique.schema_name] ?? open.boutique;
        const mod = open.module;
        return (
          <div className="sa-modal-backdrop" onClick={() => setOpen(null)}>
            <div className="sa-modal" onClick={(e) => e.stopPropagation()} role="dialog"
              aria-label={`${mod.label} features for ${open.boutique.name}`}>
              <h3>{mod.label} — {open.boutique.name}</h3>
              <p className="sa-muted">{mod.description}</p>
              <div style={{ display: 'flex', gap: 8, margin: '12px 0' }}>
                <button className="sa-btn" onClick={() => setPending({ boutique: open.boutique, bundle: mod, next: true })}>
                  Whole module on
                </button>
                <button className="sa-btn danger" onClick={() => setPending({ boutique: open.boutique, bundle: mod, next: false })}>
                  Whole module off
                </button>
                <button className="sa-btn" onClick={() => setPending({ boutique: open.boutique, bundle: mod, next: null })}>
                  ↺ Follow plan
                </button>
              </div>
              <table className="sa-table">
                <thead><tr><th>Feature</th><th>State</th><th>Set by</th><th></th></tr></thead>
                <tbody>
                  {mod.features.map((k) => {
                    const f = featureOf(k);
                    const on = isOn(row, k);
                    const override = isOverride(row, k);
                    return (
                      <tr key={k}>
                        <td title={f?.description}>
                          {f?.label || k}{f?.addon ? <span className="sa-schema"> add-on</span> : null}
                        </td>
                        <td><Pill value={on ? 'on' : 'off'} tone={on ? 'ok' : 'off'} label={on ? 'on' : 'off'} /></td>
                        <td className="sa-muted">{override ? 'by hand' : `${planLabel(row.plan)} plan`}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <button className={`sa-btn${on ? ' danger' : ''}`}
                            onClick={() => setPending({ boutique: open.boutique, module: f, next: !on })}>
                            Switch {on ? 'off' : 'on'}
                          </button>
                          {override && (
                            <button className="sa-btn" style={{ marginLeft: 4 }}
                              title="Remove the hand-set value so this follows the plan again"
                              onClick={() => setPending({ boutique: open.boutique, module: f, next: null })}>
                              ↺
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div style={{ textAlign: 'right', marginTop: 12 }}>
                <button className="sa-btn" onClick={() => setOpen(null)}>Close</button>
              </div>
            </div>
          </div>
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
            <p style={{ marginTop: 8 }}>
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
            <p style={{ marginTop: 8 }}>{pending.module.description}</p>
          </>
        ) : (
          <>
            <p>
              Every request from <strong>{pending.boutique.name}</strong> to{' '}
              <span className="sa-schema">{pending.module.prefixes.join(' ')}</span> is refused
              by the server until you switch it back on.
            </p>
            <p style={{ marginTop: 8 }}>
              {pending.module.description} Their screens that call those URLs will fail rather
              than disappear. Nothing is deleted, and switching it back on restores it.
            </p>
            <p style={{ marginTop: 8 }}>
              <Info size={13} style={{ verticalAlign: '-2px', marginRight: 6 }} />
              Other server workers apply this within 5 minutes.
            </p>
          </>
        ))}
        onConfirm={apply}
        onCancel={() => setPending(null)}
      />
    </>
  );
}
