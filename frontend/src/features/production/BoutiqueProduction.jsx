/* Stitch for the boutique: garments made for our own stock, not for anybody.
   The same workroom and the same steps as a customer's order -- this form just
   skips the customer, the prices and the payment, because there is nobody on
   the other end. When the last step is signed off the garments land in stock. */
import { useEffect, useMemo, useState } from 'react';
import { Factory } from 'lucide-react';
import { api } from '../../services/api';
import { FormModal } from '../../components/ui/Atelier';
import { inventoryImage, inventoryTile } from '../../services/inventoryImages';
import ThumbPicker from './ThumbPicker';

const PRIORITIES = [['MEDIUM', 'Normal'], ['HIGH', 'Soon'], ['URGENT', 'Rush'], ['LOW', 'Whenever there is time']];
const MAX_QUANTITY = 50;

const unitShort = (item) => (
  !item?.unit || item.unit === 'METER' ? 'm' : item.unit === 'PIECE' ? 'pcs' : String(item.unit).toLowerCase());

const qty = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 });

const stockLabel = (fabric) => {
  const left = Number(fabric?.available_stock ?? 0);
  return left > 0 ? `${qty(left)} ${unitShort(fabric)} left` : 'Out of stock';
};

export default function BoutiqueProductionDialog({ onClose, onCreated }) {
  const [templates, setTemplates] = useState([]);
  const [staff, setStaff] = useState([]);
  const [fabrics, setFabrics] = useState([]);
  const [designs, setDesigns] = useState([]);
  const [form, setForm] = useState({
    template: '', design: '', fabric: '', fabric_quantity: '',
    quantity: 1, priority: 'MEDIUM', master_id: '', tailor_id: '', notes: '', ready_by: '',
  });
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

  // The design library, narrowed to the garment being made -- the same call
  // the order wizard's design step makes.
  const garmentKey = templates.find((t) => String(t.id) === String(form.template))?.key;
  useEffect(() => {
    if (!garmentKey) { setDesigns([]); return undefined; }
    let alive = true;
    api.getDesignLibrary({ template: garmentKey, status: 'ACTIVE' })
      .then((rows) => { if (alive) setDesigns(Array.isArray(rows) ? rows : (rows?.results || [])); })
      .catch(() => { if (alive) setDesigns([]); });
    return () => { alive = false; };
  }, [garmentKey]);

  // A design the boutique has not filed yet: uploaded through the design
  // library's own endpoint, so it lands there for next time as well.
  const addDesign = async ({ title, file }) => {
    const created = await api.uploadDesign(
      { title, template: form.template }, [file], ['overall']);
    setDesigns((prev) => [created, ...prev]);
    return created;
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.template) { setError('Choose what the boutique is making.'); return; }
    const quantity = Number(form.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
      setError(`Make between 1 and ${MAX_QUANTITY} at a time.`);
      return;
    }
    if (form.fabric && !(Number(form.fabric_quantity) > 0)) {
      setError('Enter how much fabric each garment takes.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const order = await api.createInternalProduction({
        template: form.template,
        design: form.design || undefined,
        fabric: form.fabric || undefined,
        fabric_quantity: form.fabric ? (form.fabric_quantity || 1) : undefined,
        quantity,
        priority: form.priority,
        master_id: form.master_id || undefined,
        tailor_id: form.tailor_id || undefined,
        notes: form.notes || undefined,
        ready_by: form.ready_by || undefined,
      });
      await onCreated?.(order);
    } catch (err) {
      setError(err.message || 'Could not start this production run.');
      setBusy(false);
    }
  };

  const garment = templates.find((t) => String(t.id) === String(form.template));
  const count = Number(form.quantity) || 0;
  const roll = fabrics.find((f) => String(f.id) === String(form.fabric));
  const fabricNeeded = Number(((Number(form.fabric_quantity) || 0) * count).toFixed(2));
  const short = roll && fabricNeeded > Number(roll.available_stock);

  const fabricRows = useMemo(() => fabrics.map((f) => ({
    id: f.id,
    title: f.name,
    code: f.item_code,
    tag: f.category,
    meta: `${qty(f.available_stock)} ${f.unit_display || unitShort(f)} available`
          + (f.color ? ` · ${f.color}` : ''),
    sub: `${qty(f.current_stock)} in stock · ${qty(f.reserved_stock)} reserved`,
    warn: !(Number(f.available_stock) > 0),
    image: inventoryImage(f),
    fallback: inventoryTile(f),
  })), [fabrics]);

  const designRows = useMemo(() => designs.map((d) => ({
    id: d.id,
    title: d.title,
    tag: d.source_display || 'Design',
    meta: d.collection_name || '',
    sub: d.designer_name || '',
    image: d.image_url || inventoryTile({ category: 'DESIGN' }),
    fallback: inventoryTile({ category: 'DESIGN' }),
  })), [designs]);

  return (
    <FormModal icon={Factory} tone="green" title="Stitch for the boutique" width="640px"
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
                    onChange={(e) => setForm((prev) => ({ ...prev, template: e.target.value, design: '' }))}>
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

        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label" htmlFor="bp-design">Design <span className="od-hint">(optional)</span></label>
          <ThumbPicker id="bp-design" rows={designRows} value={form.design} disabled={!form.template}
                       placeholder={form.template ? 'No particular design' : 'Choose a garment first'}
                       emptyLabel={form.template ? 'Nothing in the library for this garment yet' : 'Choose a garment first'}
                       onChange={(id) => set('design', id)}
                       onAdd={addDesign} addLabel="Add a design"
                       addDisabled={!form.template} addDisabledHint="Choose a garment first" />
        </div>

        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label" htmlFor="bp-fabric">Fabric <span className="od-hint">(optional)</span></label>
          <ThumbPicker id="bp-fabric" rows={fabricRows} value={form.fabric}
                       placeholder="Not decided yet" emptyLabel="No fabric in the inventory yet"
                       onChange={(id) => set('fabric', id)} />
        </div>

        {form.fabric && (
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" htmlFor="bp-fabric-qty">
              How much of it per garment? <span className="required">*</span>
            </label>
            <input id="bp-fabric-qty" type="number" className="form-control" min="0" step="0.01"
                   value={form.fabric_quantity} placeholder="e.g. 2.5"
                   onChange={(e) => set('fabric_quantity', e.target.value)} />
            {fabricNeeded > 0 && (
              <p style={{ margin: '6px 0 0', fontSize: 'var(--text-sm)',
                          color: short ? 'var(--danger-color, #b42318)' : 'var(--text-secondary)' }}>
                {fabricNeeded} {unitShort(roll)} needed in all · {stockLabel(roll)}
                {short ? ' — the run can still start, and the shortfall is reported.' : ''}
              </p>
            )}
          </div>
        )}

        {garment && count > 0 && (
          <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
            {count} {garment.name}{count === 1 ? '' : 's'} will go through the workroom one at a time,
            and land in stock when the last step is signed off.
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
