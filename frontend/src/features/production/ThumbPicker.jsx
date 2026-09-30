/* Picking a roll of cloth or a design by its photograph, laid out as the
   inventory screen lays its items out: a picture, its code and category on
   the corners, the name and what is left underneath. Native <select> options
   cannot hold an image, so this is a popover of cards instead. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, ImagePlus, Plus, Search, X } from 'lucide-react';

//: Above this many cards the picker offers a search box.
const SEARCHABLE_FROM = 8;

const panel = {
  background: 'var(--surface-color)',
  border: '1px solid var(--border-color)',
  borderRadius: 'var(--radius-lg)',
  boxShadow: 'var(--shadow-sm)',
};

const pill = {
  position: 'absolute', top: 8, padding: '3px 8px', borderRadius: 6, fontSize: '9px', fontWeight: 700,
  letterSpacing: '0.06em', textTransform: 'uppercase', background: '#1a1a1a', color: '#fff',
  maxWidth: '55%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
};

function Picture({ row, ratio = '4 / 5', bare = false, children }) {
  return (
    <div style={{ position: 'relative', aspectRatio: ratio, background: 'var(--surface-inset, #f3f2ee)' }}>
      <img src={row.image} alt="" loading="lazy"
           onError={(e) => { if (row.fallback && e.currentTarget.src !== row.fallback) e.currentTarget.src = row.fallback; }}
           style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      {!bare && row.code && <span style={{ ...pill, left: 8 }} title={row.code}>{row.code}</span>}
      {!bare && row.tag && <span style={{ ...pill, right: 8 }} title={row.tag}>{row.tag}</span>}
      {children}
    </div>
  );
}

/** `rows`: { id, title, code, tag, sub, meta, warn, image, fallback }.
 *  `onAdd`: given one, the picker offers to add a row of its own -- a name
 *  and a photograph -- for when the list has nothing to choose from. */
export default function ThumbPicker({
  id, rows = [], value, placeholder, emptyLabel, disabled, onChange,
  onAdd, addLabel = 'Add new', addDisabled = false, addDisabledHint = '',
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(null); // { title, file, preview, busy, error }
  const box = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const chosen = rows.find((r) => String(r.id) === String(value));
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => `${r.title} ${r.sub || ''} ${r.code || ''}`.toLowerCase().includes(q));
  }, [rows, query]);

  const pick = (row) => { onChange(row ? String(row.id) : ''); setQuery(''); setAdding(null); setOpen(false); };

  const save = async (e) => {
    e.preventDefault();
    const title = (adding.title || '').trim();
    if (!title) { setAdding((a) => ({ ...a, error: 'Give it a name.' })); return; }
    if (!adding.file) { setAdding((a) => ({ ...a, error: 'Choose a photograph.' })); return; }
    setAdding((a) => ({ ...a, busy: true, error: null }));
    try {
      const created = await onAdd({ title, file: adding.file });
      if (adding.preview) URL.revokeObjectURL(adding.preview);
      pick(created);
    } catch (err) {
      setAdding((a) => ({ ...a, busy: false, error: err.message || 'Could not save that.' }));
    }
  };

  return (
    <div ref={box} style={{ position: 'relative' }}>
      <button id={id} type="button" className="form-control" disabled={disabled}
              aria-haspopup="listbox" aria-expanded={open}
              onClick={() => !disabled && setOpen((v) => !v)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', height: 'auto',
                       minHeight: 48, textAlign: 'left', cursor: disabled ? 'not-allowed' : 'pointer',
                       opacity: disabled ? 0.6 : 1 }}>
        {chosen ? (
          <>
            <div style={{ width: 36, flexShrink: 0, borderRadius: 6, overflow: 'hidden' }}>
              <Picture row={chosen} ratio="1 / 1" bare />
            </div>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontWeight: 600, overflow: 'hidden',
                             textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{chosen.title}</span>
              {chosen.meta && (
                <span style={{ display: 'block', fontSize: '11.5px',
                               color: chosen.warn ? 'var(--danger-color)' : 'var(--text-muted)' }}>
                  {chosen.meta}
                </span>
              )}
            </span>
            <span role="button" tabIndex={0} aria-label={`Clear ${chosen.title}`}
                  onClick={(e) => { e.stopPropagation(); pick(null); }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); pick(null); }
                  }}
                  style={{ display: 'inline-flex', color: 'var(--text-secondary)' }}>
              <X size={14} />
            </span>
          </>
        ) : (
          <>
            <span style={{ flex: 1, color: 'var(--text-muted, #9ca3af)' }}>
              {rows.length === 0 && emptyLabel ? emptyLabel : placeholder}
            </span>
            <ChevronDown size={16} style={{ color: 'var(--text-secondary)' }} />
          </>
        )}
      </button>

      {open && (
        <div role="listbox"
             style={{ position: 'absolute', zIndex: 40, top: 'calc(100% + 4px)', left: 0, right: 0,
                      maxHeight: 360, overflowY: 'auto', background: 'var(--surface-1, #fff)',
                      border: '1px solid var(--border-color, #e5e7eb)', borderRadius: 12,
                      boxShadow: '0 12px 28px rgba(0,0,0,0.16)' }}>
          <div style={{ position: 'sticky', top: 0, zIndex: 1, padding: 10,
                        background: 'var(--surface-1, #fff)',
                        borderBottom: '1px solid var(--border-color, #e5e7eb)',
                        display: 'flex', alignItems: 'center', gap: 8 }}>
            {rows.length >= SEARCHABLE_FROM && (
              <div style={{ position: 'relative', flex: 1 }}>
                <Search size={14} style={{ position: 'absolute', left: 10, top: '50%',
                                           transform: 'translateY(-50%)', color: 'var(--text-tertiary, #9ca3af)' }} />
                <input type="text" className="form-control" value={query} autoFocus placeholder="Search by name or code"
                       onChange={(e) => setQuery(e.target.value)}
                       style={{ paddingLeft: 32, height: 34, fontSize: 'var(--text-sm)' }} />
              </div>
            )}
            <button type="button" className="btn-secondary at-btn-sm" onClick={() => pick(null)}
                    style={{ flexShrink: 0 }}>
              {placeholder}
            </button>
            {onAdd && !adding && (
              <button type="button" className="btn-secondary at-btn-sm" disabled={addDisabled}
                      title={addDisabled ? addDisabledHint : undefined} style={{ flexShrink: 0 }}
                      onClick={() => setAdding({ title: '', file: null, preview: '', busy: false, error: null })}>
                <Plus size={14} /> {addLabel}
              </button>
            )}
          </div>

          {adding && (
            <div style={{ padding: 12, borderBottom: '1px solid var(--border-color, #e5e7eb)',
                          display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <label style={{ width: 84, flexShrink: 0, aspectRatio: '4 / 5', borderRadius: 10,
                                border: '1px dashed var(--border-color, #d4d4d4)', cursor: 'pointer',
                                background: 'var(--surface-inset, #f3f2ee)', position: 'relative',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                overflow: 'hidden', color: 'var(--text-muted)' }}>
                  {adding.preview
                    ? <img src={adding.preview} alt=""
                           style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <ImagePlus size={20} />}
                  <input type="file" accept="image/*" style={{ display: 'none' }}
                         onChange={(e) => {
                           const file = e.target.files?.[0];
                           e.target.value = '';
                           if (!file) return;
                           setAdding((a) => {
                             if (a.preview) URL.revokeObjectURL(a.preview);
                             return { ...a, file, preview: URL.createObjectURL(file), error: null };
                           });
                         }} />
                </label>
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input type="text" className="form-control" value={adding.title} autoFocus maxLength={200}
                         placeholder="What is this design called?"
                         onChange={(e) => setAdding((a) => ({ ...a, title: e.target.value, error: null }))} />
                  <p style={{ margin: 0, fontSize: '11.5px', color: 'var(--text-muted)' }}>
                    A name and one photograph. It joins the design library, so it can be used again.
                  </p>
                  {adding.error && (
                    <p role="alert" style={{ margin: 0, fontSize: '11.5px', color: 'var(--danger-color)' }}>
                      {adding.error}
                    </p>
                  )}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" className="btn-primary at-btn-sm" onClick={save} disabled={adding.busy}>
                      {adding.busy ? 'Saving…' : 'Save and use it'}
                    </button>
                    <button type="button" className="btn-secondary at-btn-sm" disabled={adding.busy}
                            onClick={() => {
                              if (adding.preview) URL.revokeObjectURL(adding.preview);
                              setAdding(null);
                            }}>
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {matches.length === 0 ? (
            <p style={{ margin: 0, padding: '14px', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
              {rows.length === 0 ? (emptyLabel || 'Nothing to choose from.') : 'Nothing matches that.'}
            </p>
          ) : (
            <div style={{ padding: 12, display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
              {matches.map((row) => {
                const picked = String(row.id) === String(value);
                return (
                  <div key={row.id} role="option" aria-selected={picked} tabIndex={0}
                       onClick={() => pick(row)}
                       onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(row); } }}
                       style={{ ...panel, overflow: 'hidden', display: 'flex', flexDirection: 'column',
                                borderRadius: 12, cursor: 'pointer',
                                borderColor: picked ? 'var(--brand-primary, #047857)' : 'var(--border-color)',
                                boxShadow: picked ? '0 0 0 2px var(--brand-border, #a7f3d0)' : 'var(--shadow-sm)' }}>
                    <Picture row={row}>
                      {picked && (
                        <span style={{ position: 'absolute', right: 8, bottom: 8, width: 26, height: 26,
                                       borderRadius: '50%', background: 'var(--brand-primary, #047857)',
                                       color: '#fff', display: 'inline-flex', alignItems: 'center',
                                       justifyContent: 'center' }}>
                          <Check size={14} />
                        </span>
                      )}
                    </Picture>
                    <div style={{ padding: '10px 10px 12px', display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <div style={{ fontWeight: 700, fontSize: '13px', overflow: 'hidden',
                                    textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.title}>
                        {row.title}
                      </div>
                      {row.meta && (
                        <div style={{ fontSize: '11px', fontVariantNumeric: 'tabular-nums',
                                      color: row.warn ? 'var(--danger-color)' : 'var(--text-muted)',
                                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {row.meta}
                        </div>
                      )}
                      {row.sub && (
                        <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', overflow: 'hidden',
                                      textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.sub}>
                          {row.sub}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
