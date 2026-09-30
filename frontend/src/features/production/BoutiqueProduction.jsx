/* Stitch for the boutique: garments made for our own stock, not for anybody.
   The same workroom and the same steps as a customer's order -- this form just
   skips the customer, the prices and the payment, because there is nobody on
   the other end. When the last step is signed off the garments land in stock.

   The garment itself is configured by GarmentConfigurator, which is the order
   wizard's own configuration on one panel, so a run for stock records exactly
   what a customer's order records. */
import { useEffect, useState } from 'react';
import { Factory } from 'lucide-react';
import { api } from '../../services/api';
import { FormModal } from '../../components/ui/Atelier';
import { splitSpec } from '../../services/templates';
import GarmentConfigurator from './GarmentConfigurator';

const PRIORITIES = [['MEDIUM', 'Normal'], ['HIGH', 'Soon'], ['URGENT', 'Rush'], ['LOW', 'Whenever there is time']];
const MAX_QUANTITY = 50;
const EMPTY_CONFIG = { values: {}, fabrics: {}, fabric_qty: {}, design: {}, purchases: [] };

/** The rolls picked on the fabric step, as the material lines a GarmentJob
 *  stores. The wizard's CUSTOMER and PURCHASE sources do not arise here:
 *  there is no customer to bring cloth. */
const materialLines = (config) => Object.entries(config.fabrics || {})
  .flatMap(([slot, ids]) => [...new Set((ids || []).map(String))].map((id) => ({
    field_key: slot, inventory_item: id, source: 'STORE',
    quantity: config.fabric_qty?.[`${slot}:${id}`],
  })))
  .filter((line) => Number(line.quantity) > 0);

export default function BoutiqueProductionDialog({ onClose, onCreated }) {
  const [templates, setTemplates] = useState([]);
  const [staff, setStaff] = useState([]);
  const [fabrics, setFabrics] = useState([]);
  const [form, setForm] = useState({
    template: '', quantity: 1, priority: 'MEDIUM', master_id: '', tailor_id: '', notes: '', ready_by: '',
  });
  const [config, setConfig] = useState(EMPTY_CONFIG);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  useEffect(() => {
    let alive = true;
    Promise.all([
      api.getGarmentTemplates().catch(() => []),
      api.getTailors().catch(() => []),
      api.getInventoryItems({ picker: 'true' }).catch(() => []),
    ]).then(([rows, people, rolls]) => {
      if (!alive) return;
      setTemplates(Array.isArray(rows) ? rows : []);
      setStaff(Array.isArray(people) ? people : []);
      setFabrics(Array.isArray(rolls) ? rolls : []);
    });
    return () => { alive = false; };
  }, []);

  const garment = templates.find((t) => String(t.id) === String(form.template));
  const count = Number(form.quantity) || 0;

  const submit = async (e) => {
    e.preventDefault();
    if (!garment) { setError('Choose what the boutique is making.'); return; }
    const quantity = Number(form.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
      setError(`Make between 1 and ${MAX_QUANTITY} at a time.`);
      return;
    }
    setBusy(true);
    setError(null);
    const { spec, measurements } = splitSpec(garment, config.values || {});
    try {
      const order = await api.createInternalProduction({
        template: form.template,
        quantity,
        priority: form.priority,
        master_id: form.master_id || undefined,
        tailor_id: form.tailor_id || undefined,
        notes: form.notes || undefined,
        ready_by: form.ready_by || undefined,
        garment: {
          spec,
          measurements,
          design: config.design || {},
          fabrics: config.fabrics || {},
          fabric_qty: config.fabric_qty || {},
          materials: materialLines(config),
          purchases: config.purchases || [],
        },
      });
      await onCreated?.(order);
    } catch (err) {
      setError(err.message || 'Could not start this production run.');
      setBusy(false);
    }
  };

  return (
    <FormModal icon={Factory} tone="green" title="Stitch for the boutique" width="920px"
               onClose={busy ? undefined : onClose}
               subtitle="Garments for our own stock or the showroom. No customer, no bill."
               footer={(
                 <>
                   <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
                   <button type="submit" form="boutique-production-form" className="btn-primary" disabled={busy}>
                     {busy ? 'Starting…' : 'Start production'}
                   </button>
                 </>
               )}>
      <form id="boutique-production-form" onSubmit={submit} noValidate
            style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="form-grid-2">
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" htmlFor="bp-template">What are we making? <span className="required">*</span></label>
            <select id="bp-template" className="form-control" value={form.template}
                    onChange={(e) => { set('template', e.target.value); setConfig(EMPTY_CONFIG); }}>
              <option value="">Choose a garment…</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" htmlFor="bp-quantity">How many? <span className="required">*</span></label>
            <input id="bp-quantity" type="number" className="form-control" min="1" max={MAX_QUANTITY} step="1"
                   value={form.quantity} onChange={(e) => set('quantity', e.target.value)} />
          </div>
        </div>

        {garment && (
          <div className="wz-garment" style={{ margin: 0 }}>
            <div className="wz-garment-head">
              <span className="wz-garment-num">1</span>
              <div>
                <div className="wz-garment-name">{garment.name}</div>
                <div className="wz-garment-sub">What does it need?</div>
              </div>
            </div>
            <GarmentConfigurator key={garment.id} template={garment} fabrics={fabrics}
                                 value={config} onChange={setConfig} />
          </div>
        )}

        {garment && count > 0 && (
          <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
            {count} {garment.name}{count === 1 ? '' : 's'} will go through the workroom one at a time,
            each made to what is set above, and land in stock when the last step is signed off.
          </p>
        )}

        <div className="form-grid-2">
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" htmlFor="bp-master">Master</label>
            <select id="bp-master" className="form-control" value={form.master_id}
                    onChange={(e) => set('master_id', e.target.value)}>
              <option value="">Not decided yet</option>
              {staff.filter((s) => s.role === 'Master').map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" htmlFor="bp-tailor">Tailor</label>
            <select id="bp-tailor" className="form-control" value={form.tailor_id}
                    onChange={(e) => set('tailor_id', e.target.value)}>
              <option value="">Not decided yet</option>
              {staff.filter((s) => s.role !== 'Master').map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>

        <div className="form-grid-2">
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" htmlFor="bp-priority">How urgent?</label>
            <select id="bp-priority" className="form-control" value={form.priority}
                    onChange={(e) => set('priority', e.target.value)}>
              {PRIORITIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" htmlFor="bp-ready">Wanted by <span className="od-hint">(optional)</span></label>
            <input id="bp-ready" type="date" className="form-control" value={form.ready_by}
                   onChange={(e) => set('ready_by', e.target.value)} />
          </div>
        </div>

        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label" htmlFor="bp-notes">Notes for the workroom <span className="od-hint">(optional)</span></label>
          <textarea id="bp-notes" className="form-control" rows={2} value={form.notes}
                    placeholder="e.g. For the front window, in the new green silk"
                    onChange={(e) => set('notes', e.target.value)} />
        </div>

        {error && <p role="alert" style={{ margin: 0, color: 'var(--danger, #b42318)', fontSize: 'var(--text-sm)' }}>{error}</p>}
      </form>
    </FormModal>
  );
}
