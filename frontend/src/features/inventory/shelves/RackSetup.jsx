import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Eye, Layers, Pencil, Plus, Printer, Trash2 } from 'lucide-react';
import QRCode from 'qrcode';
import { api } from '../../../api';
import DescribeStore from './DescribeStore';
import { AddSpot, EditSpot, SpotView } from './SpotDialogs';

/** Set up racks: the list of areas, racks and shelves, and printing their labels. */

async function printLabels(location, spots) {
  const win = window.open('', '_blank');
  if (!win) { window.alert('Allow pop-ups to print the labels.'); return; }
  win.document.write('<p style="font-family:sans-serif">Preparing labels…</p>');
  try {
    const rows = await api.getShelfLabels(location.id, spots?.map((s) => s.id).join(','));
    const leaves = rows.filter((r) => !spots || spots.some((s) => s.id === r.id));
    const cards = await Promise.all(leaves.map(async (r) => {
      const qr = await QRCode.toDataURL(r.qr, { margin: 1, width: 240 });
      const esc = (t) => String(t || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
      return `<div class="l"><img src="${qr}" alt=""/><div><div class="a">${esc(r.address)}</div><div class="n">${esc(r.name || r.kind_label)}</div><div class="s">${esc(r.location_name)}</div></div></div>`;
    }));
    win.document.open();
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Shelf labels — ${location.name}</title>
<style>body{font-family:Arial,sans-serif;margin:12mm}.g{display:grid;grid-template-columns:repeat(2,1fr);gap:6mm}
.l{display:flex;align-items:center;gap:4mm;border:1px dashed #999;border-radius:3mm;padding:4mm;break-inside:avoid}
.l img{width:30mm;height:30mm}.a{font-size:20pt;font-weight:700;letter-spacing:.5pt}.n{font-size:10pt;margin-top:1mm}.s{font-size:8pt;color:#666;margin-top:1mm}
@media print{body{margin:8mm}}</style></head><body><div class="g">${cards.join('')}</div>
<script>window.onload=function(){setTimeout(function(){window.print()},200)}</${'script'}></body></html>`);
    win.document.close();
  } catch (err) {
    win.document.body.innerText = err.message || 'Could not prepare the labels.';
  }
}

export default function RackSetup({ location, tree, onDone }) {
  const [describing, setDescribing] = useState(false);
  const [adding, setAdding] = useState(null); // { parent } or {} for a new area
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [error, setError] = useState('');
  const byId = useMemo(() => Object.fromEntries(tree.map((s) => [s.id, s])), [tree]);

  const reorder = async (spot, dir) => {
    const siblings = tree.filter((s) => s.parent === spot.parent);
    const index = siblings.findIndex((s) => s.id === spot.id);
    const other = siblings[index + dir];
    if (!other) return;
    setError('');
    try {
      await api.updateShelfSpot(spot.id, { walk_order: other.walk_order });
      await api.updateShelfSpot(other.id, { walk_order: spot.walk_order === other.walk_order ? spot.walk_order + dir : spot.walk_order });
      await onDone();
    } catch (err) { setError(err.message); }
  };
  const remove = async (spot) => {
    if (!window.confirm(`Delete ${spot.address}?`)) return;
    setError('');
    try { await api.deleteShelfSpot(spot.id); await onDone(); } catch (err) { setError(err.message); }
  };

  return (
    <div className="sh-panel">
      <div className="sh-title-row">
        <h3 className="sh-title">Racks & shelves at {location.name}</h3>
        <div className="sh-actions sh-actions--top">
          <button type="button" className="btn-secondary" onClick={() => setAdding({})}><Plus size={15} /> Add an area</button>
          {tree.length > 0 && (
            <button type="button" className="btn-secondary" onClick={() => printLabels(location, tree.filter((s) => s.is_leaf))}>
              <Printer size={15} /> Print shelf labels
            </button>
          )}
          <button type="button" className="btn-primary" onClick={() => setDescribing(true)}><Layers size={15} /> Describe your store</button>
        </div>
      </div>
      <p className="sh-muted">An area (shop floor, back room, godown) holds racks or cupboards; they hold shelves, and a shelf can hold boxes. Stock sits on the last level.</p>
      {error && <div className="sh-error" role="alert">{error}</div>}
      {tree.length === 0 && <div className="sh-empty">Nothing yet. <b>Describe your store</b> makes it in one go.</div>}
      <div className="sh-tree">
        {tree.map((s) => {
          const siblings = tree.filter((x) => x.parent === s.parent);
          const index = siblings.findIndex((x) => x.id === s.id);
          return (
            <div key={s.id} className={`sh-node${s.active ? '' : ' is-off'}`} style={{ '--depth': s.depth - 1 }}>
              <div className="sh-node-main">
                <b className="sh-address">{s.address}</b>
                <span className="sh-muted">{s.kind_label}{s.name ? ` · ${s.name}` : ''}</span>
                {s.depth === 1 && <span className={`ui-badge ui-badge--${s.is_shop_floor ? 'success' : 'neutral'}`}>{s.is_shop_floor ? 'Shop floor' : 'Back room'}</span>}
                {!s.active && <span className="ui-badge ui-badge--neutral">Not in use</span>}
                <span className="sh-node-count">{s.item_count ? `${s.item_count} item(s)` : 'empty'}</span>
              </div>
              <div className="sh-node-actions">
                <button type="button" className="sh-mini sh-mini--view" onClick={() => setViewing(s)} aria-label={`See what is in ${s.address}`} title="See what is here">
                  <Eye size={14} /> <span>View</span>
                </button>
                <button type="button" className="sh-mini" disabled={index <= 0} onClick={() => reorder(s, -1)} aria-label="Earlier in the walk" title="Earlier in the walk"><ArrowUp size={14} /></button>
                <button type="button" className="sh-mini" disabled={index >= siblings.length - 1} onClick={() => reorder(s, 1)} aria-label="Later in the walk" title="Later in the walk"><ArrowDown size={14} /></button>
                {s.depth < 4 && !(s.is_leaf && s.item_count) && (
                  <button type="button" className="sh-mini" onClick={() => setAdding({ parent: s })} aria-label={`Add inside ${s.address}`} title="Add inside"><Plus size={14} /></button>
                )}
                <button type="button" className="sh-mini" onClick={() => setEditing(s)} aria-label={`Edit ${s.address}`} title="Edit"><Pencil size={14} /></button>
                {s.is_leaf && !s.item_count && (
                  <button type="button" className="sh-mini sh-mini--danger" onClick={() => remove(s)} aria-label={`Delete ${s.address}`} title="Delete"><Trash2 size={14} /></button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {describing && <DescribeStore location={location} onClose={() => setDescribing(false)} onDone={async () => { setDescribing(false); await onDone(); }} />}
      {adding && <AddSpot location={location} parent={adding.parent} onClose={() => setAdding(null)} onDone={async () => { setAdding(null); await onDone(); }} />}
      {editing && <EditSpot spot={editing} parent={byId[editing.parent]} onClose={() => setEditing(null)} onDone={async () => { setEditing(null); await onDone(); }} />}
      {viewing && <SpotView spot={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}
