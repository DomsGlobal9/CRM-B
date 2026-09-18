import { useCallback, useEffect, useState } from 'react';
import { Calculator, Pencil, Plus, Trash2, X } from 'lucide-react';

import { api } from '../../services/api';
import { LIMITS, cleanAmount, amountError } from '../../services/validate';
import { inventoryImage } from '../../services/inventoryImages';
import { useLanguage } from '../../i18n/LanguageContext.jsx';
import { Field, Modal } from './ItemFormModal';

/**
 * The boutique's cookbook: what goes into each garment they make.
 *
 * A recipe is a name and a list of materials with quantities -- the fabric,
 * the lining, the border, the buttons -- written in one sitting, on one
 * sheet, and saved once. An order reserves stock against it. Lines can also
 * carry a measurement formula (`0.15 * bust + 0.4`) and a waste allowance
 * from the earlier line-by-line editor; those are kept and shown, and
 * "Try it" still evaluates them, but the sheet asks for none of it.
 */

const panel = {
  background: 'var(--surface-color)',
  border: '1px solid var(--border-color)',
  borderRadius: 'var(--radius-lg)',
  boxShadow: 'var(--shadow-sm)',
};

const qty = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 });

// What a material is for, read off what it is: the recipe never asks.
const ROLE_BY_CATEGORY = {
  FABRIC: 'FABRIC', LINING: 'LINING', BORDER: 'ACCESSORY', EMBELLISHMENT: 'EMBROIDERY',
  STITCHING: 'THREAD', PACKAGING: 'PACKAGING', MAGGAM: 'EMBROIDERY', DESIGN: 'OTHER', OTHER: 'OTHER',
};
const roleFor = (item) => {
  const words = `${item?.name || ''} ${item?.sub_category || ''}`.toLowerCase();
  if (/\b(button|zip|zipper|hook|elastic|lace|tassel)s?\b/.test(words)) return 'ACCESSORY';
  if (/\b(interlining|fusing|canvas)\b/.test(words)) return 'INTERLINING';
  if (/\blabel/.test(words)) return 'LABEL';
  return ROLE_BY_CATEGORY[item?.category] || 'OTHER';
};

const blankLine = () => ({ key: Math.random().toString(36).slice(2), inventory_item: '', quantity: '', description: '', customer: false });

const linesFrom = (bom) => (bom?.lines || []).map((l) => ({
  key: l.id, id: l.id, inventory_item: l.inventory_item || '', quantity: String(l.quantity ?? ''),
  description: l.description || '', customer: Boolean(l.is_customer_supplied),
  quantity_formula: l.quantity_formula || '', waste_percent: l.waste_percent, is_optional: l.is_optional,
}));

export default function RecipesTab({ items, isOwner }) {
  const { t } = useLanguage();
  const [boms, setBoms] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null); // null | {} (new) | bom
  const [trying, setTrying] = useState(false);

  const refresh = useCallback(async (keepId) => {
    setLoading(true);
    try {
      const rows = await api.getBoms();
      setBoms(rows || []);
      const keep = (rows || []).find((b) => b.id === (keepId || selected?.id));
      setSelected(keep || (rows || [])[0] || null);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [selected?.id]);

  useEffect(() => { Promise.resolve().then(refresh); }, [refresh]);

  const remove = async (bom) => {
    if (!window.confirm(`${t('inventoryPage.removeRecipeConfirm', 'Remove this recipe?')} ${bom.name}`)) return;
    try { await api.deleteBom(bom.id); refresh(null); }
    catch (err) { setError(err.message); }
  };

  const byId = Object.fromEntries((items || []).map((i) => [i.id, i]));
  const hasFormula = (bom) => (bom?.lines || []).some((l) => l.quantity_formula);

  return (
    <div style={{ marginTop: '20px' }}>
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '16px' }}>
        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', flex: '1 1 auto' }}>
          {t('inventoryPage.recipesSubtitle', 'What each garment is made of. An order reserves against the recipe.')}
        </div>
        {isOwner && (
          <button type="button" className="btn-primary" style={{ fontSize: '13px' }} onClick={() => setEditing({})}>
            <Plus size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} /> {t('inventoryPage.newRecipe', 'New recipe')}
          </button>
        )}
      </div>

      {error && (
        <div style={{ ...panel, padding: '12px 16px', marginBottom: '12px', borderColor: 'var(--danger-color)', color: 'var(--danger-color)', fontSize: '13px' }}>
          {error}
        </div>
      )}

      {!loading && boms.length === 0 && (
        <div style={{ ...panel, padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
          {t('inventoryPage.noRecipes', 'No recipes yet. A recipe lists the materials a garment needs, so an order can reserve them.')}
        </div>
      )}

      {boms.length > 0 && (
        <div className="mobile-stack-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(min(220px, 100%), 260px) 1fr', gap: '16px' }}>
          <div style={{ ...panel, overflow: 'hidden', alignSelf: 'start' }}>
            {boms.map((bom) => (
              <button key={bom.id} type="button" onClick={() => setSelected(bom)}
                      style={{
                        display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
                        padding: '12px 14px', border: 'none', color: 'inherit',
                        borderTop: '1px solid var(--border-color)',
                        background: selected?.id === bom.id ? 'var(--accent-color, rgba(176,124,64,0.12))' : 'transparent',
                      }}>
                <div style={{ fontSize: '13px', fontWeight: 600 }}>{bom.name}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  {bom.line_count} {bom.line_count === 1 ? t('inventoryPage.material', 'material') : t('inventoryPage.materials', 'materials')}
                  {bom.is_active ? '' : ' · superseded'}
                </div>
              </button>
            ))}
          </div>

          {selected && (
            <div style={{ ...panel, overflow: 'hidden' }}>
              <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 auto' }}>
                  <div style={{ fontSize: '14px', fontWeight: 600 }}>{selected.name}</div>
                  {selected.template_name && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{selected.template_name}</div>}
                </div>
                {hasFormula(selected) && (
                  <button type="button" className="btn-secondary" style={{ fontSize: '12px' }} onClick={() => setTrying(true)}>
                    <Calculator size={13} style={{ marginRight: '4px', verticalAlign: 'middle' }} /> {t('inventoryPage.tryRecipe', 'Try it')}
                  </button>
                )}
                {isOwner && (
                  <>
                    <button type="button" className="btn-secondary" style={{ fontSize: '12px' }} onClick={() => setEditing(selected)}>
                      <Pencil size={13} style={{ marginRight: '4px', verticalAlign: 'middle' }} /> {t('common.edit', 'Edit')}
                    </button>
                    <button type="button" className="btn-secondary" style={{ fontSize: '12px' }} title={t('inventoryPage.removeRecipe', 'Remove recipe')}
                            aria-label={`${t('inventoryPage.removeRecipe', 'Remove recipe')} ${selected.name}`} onClick={() => remove(selected)}>
                      <Trash2 size={13} />
                    </button>
                  </>
                )}
              </div>
              {(selected.lines || []).length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                  {t('inventoryPage.noLines', 'Nothing in this recipe yet.')}
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <tbody>
                    {selected.lines.map((line) => {
                      const item = byId[line.inventory_item];
                      return (
                        <tr key={line.id} style={{ borderTop: '1px solid var(--border-color)' }}>
                          <td style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                            {line.is_customer_supplied
                              ? <span style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--background-secondary)', display: 'inline-block', flexShrink: 0 }} />
                              : <img src={inventoryImage(item || { category: 'OTHER', name: line.material_name })} alt="" style={{ width: 28, height: 28, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />}
                            <span>
                              {line.material_name || line.description}
                              <span style={{ color: 'var(--text-muted)', fontSize: '11px', marginLeft: '6px' }}>
                                {line.is_customer_supplied ? t('inventoryPage.customerBrings', 'customer brings it') : line.role_display}
                                {line.is_optional ? ` · ${t('inventoryPage.optional', 'optional')}` : ''}
                              </span>
                            </span>
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                            {line.quantity_formula ? <code style={{ fontSize: '12px' }}>{line.quantity_formula}</code> : qty(line.quantity)} {line.unit_display}
                            {Number(line.waste_percent) > 0 && <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}> +{qty(line.waste_percent)}%</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}

      {editing && (
        <RecipeSheet bom={editing.id ? editing : null} items={items}
                     onClose={() => setEditing(null)}
                     onSaved={(bom) => { setEditing(null); refresh(bom.id); }} />
      )}
      {trying && selected && <TryRecipeModal bom={selected} onClose={() => setTrying(false)} />}
    </div>
  );
}

/** The whole recipe on one sheet: a name, then material · quantity rows. */
function RecipeSheet({ bom, items, onClose, onSaved }) {
  const { t } = useLanguage();
  const [name, setName] = useState(bom?.name || '');
  const [lines, setLines] = useState(() => (bom ? linesFrom(bom) : [blankLine()]));
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const byId = Object.fromEntries((items || []).map((i) => [i.id, i]));
  const unitOf = (line) => byId[line.inventory_item]?.unit_display || byId[line.inventory_item]?.unit || '';

  const setLine = (key, patch) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const dropLine = (key) => setLines((ls) => ls.filter((l) => l.key !== key));
  const addLine = (customer = false) => setLines((ls) => [...ls, { ...blankLine(), customer }]);

  const submit = async (e) => {
    e.preventDefault();
    const clean = name.trim();
    if (!clean) { setError(t('inventoryPage.recipeNameRequired', 'Give the recipe a name — the garment it makes.')); return; }
    const kept = lines.filter((l) => l.customer ? l.description.trim() : l.inventory_item);
    if (!kept.length) { setError(t('inventoryPage.recipeNeedsMaterial', 'Add at least one material.')); return; }
    for (const l of kept) {
      if (l.quantity_formula) continue;
      const problem = amountError(l.quantity, { label: t('inventoryPage.quantity', 'Quantity'), max: LIMITS.quantity, allowZero: false, required: true });
      if (problem) { setError(`${l.customer ? l.description : byId[l.inventory_item]?.name}: ${problem}`); return; }
    }
    setError(null);
    setSaving(true);
    try {
      const payload = {
        name: clean,
        lines: kept.map((l) => {
          const item = byId[l.inventory_item];
          return l.customer ? {
            role: 'OTHER', inventory_item: null, description: l.description.trim(), is_customer_supplied: true,
            quantity: l.quantity_formula ? 0 : l.quantity, quantity_formula: l.quantity_formula || null,
            unit: 'PIECE', waste_percent: l.waste_percent || 0, is_optional: Boolean(l.is_optional),
          } : {
            role: roleFor(item), inventory_item: l.inventory_item, is_customer_supplied: false,
            quantity: l.quantity_formula ? 0 : l.quantity, quantity_formula: l.quantity_formula || null,
            unit: item?.unit || 'PIECE', waste_percent: l.waste_percent || 0, is_optional: Boolean(l.is_optional),
          };
        }),
      };
      onSaved(await api.saveBom(payload, bom?.id || null));
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const row = { display: 'grid', gridTemplateColumns: '1fr 110px 28px', gap: '8px', alignItems: 'center' };
  return (
    <Modal title={bom ? `${t('common.edit', 'Edit')} · ${bom.name}` : t('inventoryPage.newRecipe', 'New recipe')} onClose={onClose} width="600px">
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <Field label={t('inventoryPage.recipeName', 'Garment this makes')} required value={name} onChange={setName} maxLength={150} autoFocus
               placeholder={t('inventoryPage.recipeNamePlaceholder', 'e.g. Bridal blouse with maggam')} />

        <div className="at-field">
          <span className="ui-eyebrow">{t('inventoryPage.whatGoesIn', 'What goes in')}</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {lines.map((line) => (
              <div key={line.key} style={row}>
                {line.customer ? (
                  <input className="form-control" value={line.description} maxLength={200}
                         placeholder={t('inventoryPage.customerBringsPlaceholder', 'What the customer brings, e.g. her own gold border')}
                         onChange={(e) => setLine(line.key, { description: e.target.value })} />
                ) : (
                  <select className="form-control" value={line.inventory_item} onChange={(e) => setLine(line.key, { inventory_item: e.target.value })}>
                    <option value="">{t('inventoryPage.pickMaterial', 'Pick a material…')}</option>
                    {(items || []).map((i) => <option key={i.id} value={i.id}>{i.name}{i.color ? ` · ${i.color}` : ''}</option>)}
                  </select>
                )}
                {line.quantity_formula ? (
                  <code title={t('inventoryPage.formulaKept', 'Measured by formula; edit it in Try it')} style={{ fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{line.quantity_formula}</code>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <input className="form-control" inputMode="decimal" value={line.quantity} placeholder={t('inventoryPage.qty', 'Qty')}
                           onChange={(e) => setLine(line.key, { quantity: cleanAmount(e.target.value, { max: LIMITS.quantity, decimals: 3 }) })}
                           style={{ minWidth: 0 }} />
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{line.customer ? '' : unitOf(line)}</span>
                  </div>
                )}
                <button type="button" onClick={() => dropLine(line.key)} aria-label={t('inventoryPage.removeLine', 'Remove')}
                        style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)', padding: 0 }}>
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '14px', marginTop: '8px', fontSize: '12.5px' }}>
            <button type="button" className="at-link" onClick={() => addLine(false)} style={{ color: 'var(--accent-text)' }}>
              <Plus size={12} /> {t('inventoryPage.addMaterial', 'Add a material')}
            </button>
            <button type="button" className="at-link" onClick={() => addLine(true)} style={{ color: 'var(--text-muted)' }}>
              <Plus size={12} /> {t('inventoryPage.addCustomerMaterial', 'Something the customer brings')}
            </button>
          </div>
        </div>

        {error && <div style={{ color: 'var(--danger-color)', fontSize: '13px' }}>{error}</div>}
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button type="button" className="btn-secondary" onClick={onClose}>{t('common.cancel', 'Cancel')}</button>
          <button type="submit" className="btn-primary" disabled={saving}>{saving ? '…' : t('common.save', 'Save')}</button>
        </div>
      </form>
    </Modal>
  );
}

/** Evaluates a recipe with formulas against measurements typed here. */
function TryRecipeModal({ bom, onClose }) {
  const { t } = useLanguage();
  const [raw, setRaw] = useState('bust=36\nwaist=30\nlength=42');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    const variables = {};
    raw.split('\n').forEach((line) => {
      const [k, v] = line.split('=').map((s) => s.trim());
      if (k && v !== undefined && v !== '') variables[k] = Number(v);
    });
    setBusy(true);
    setError(null);
    try {
      setResult(await api.getBomRequirements(bom.id, { variables, include_optional: true }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`${t('inventoryPage.tryRecipe', 'Try it')} · ${bom.name}`} onClose={onClose}>
      <div className="at-field">
        <label className="at-field-label">{t('inventoryPage.measurements', 'Measurements (one per line, name=value)')}</label>
        <textarea className="form-control" rows={4} value={raw} onChange={(e) => setRaw(e.target.value)} />
      </div>
      {error && <div style={{ color: 'var(--danger-color)', fontSize: '13px', marginTop: '8px' }}>{error}</div>}
      {result && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', marginTop: '12px' }}>
          <tbody>
            {(result.requirements || []).map((r) => (
              <tr key={r.line_id} style={{ borderTop: '1px solid var(--border-color)' }}>
                <td style={{ padding: '8px 4px' }}>{r.material}</td>
                <td style={{ padding: '8px 4px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{qty(r.required_quantity)} {r.unit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '14px' }}>
        <button type="button" className="btn-secondary" onClick={onClose}>{t('common.close', 'Close')}</button>
        <button type="button" className="btn-primary" disabled={busy} onClick={run}>{busy ? '…' : t('inventoryPage.calculate', 'Calculate')}</button>
      </div>
    </Modal>
  );
}
