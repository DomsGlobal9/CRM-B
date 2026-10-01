/* To-do: small pieces of work a person takes on or is given.

   Everyone can add their own to-do and post updates on it -- a note, photos of
   the day's work, a voice note -- and move it between Open, In progress and
   Closed. The Owner, a Master and a Designer can also give a to-do to someone
   else. The server decides who sees which to-do and what each person may do;
   this screen only reads the can_* flags it sends back. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ListTodo, Plus, Calendar, Trash2, Send, UserCheck, CircleDot, Loader2, CheckCircle2, Image as ImageIcon, Mic,
} from 'lucide-react';

import { api } from '../../services/api';
import { formatDate, formatDateTime } from '../../services/format';
import { LIMITS, imageFilesError } from '../../services/validate';
import {
  AvatarInitials, PageHeader, Segmented, FormModal, Field, AddPhotoButton, PhotoTile,
} from '../../components/ui/Atelier';
import VoiceTextarea, { VoiceRecorder, VoiceNotePlayer } from '../../components/ui/VoiceTextarea';
import Loader from '../../components/ui/Loader';

const MAX_TITLE = 200;
const MAX_PHOTOS = 10;

const STATUSES = [
  { key: 'OPEN', label: 'Open', badge: 'info', icon: CircleDot },
  { key: 'IN_PROGRESS', label: 'In progress', badge: 'warning', icon: Loader2 },
  { key: 'CLOSED', label: 'Closed', badge: 'success', icon: CheckCircle2 },
];
const statusOf = (key) => STATUSES.find((s) => s.key === key) || STATUSES[0];

const panel = {
  background: 'var(--surface-color)',
  border: '1px solid var(--border-color)',
  borderRadius: 'var(--radius-lg)',
  boxShadow: 'var(--shadow-sm)',
};

const errorBox = {
  background: 'var(--danger-bg)',
  border: '1px solid var(--danger-color)',
  color: 'var(--danger-color)',
  borderRadius: 'var(--radius-md)',
  padding: '10px 12px',
  fontSize: 'var(--text-sm)',
  marginBottom: 'var(--space-3)',
};

const muted = { fontSize: '12px', color: 'var(--text-muted)' };

function StatusBadge({ status }) {
  const s = statusOf(status);
  return <span className={`ui-badge ui-badge--${s.badge}`}>● {s.label}</span>;
}

/* Photos chosen but not yet sent, with a remove button on each. */
function PendingPhotos({ files, onRemove }) {
  const [urls, setUrls] = useState([]);
  useEffect(() => {
    const made = files.map((f) => URL.createObjectURL(f));
    const t = setTimeout(() => setUrls(made), 0);
    return () => { clearTimeout(t); made.forEach((u) => URL.revokeObjectURL(u)); };
  }, [files]);
  if (!files.length) return null;
  return (
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
      {urls.map((url, i) => (
        <PhotoTile key={url} src={url} size={72} onRemove={() => onRemove(i)} />
      ))}
    </div>
  );
}

/* Photos and a voice note, shared by the new to-do form and the update box. */
function Attachments({ photos, setPhotos, voice, setVoice, setError }) {
  const addPhotos = (files) => {
    const next = [...photos, ...files];
    const problem = imageFilesError(next, { max: MAX_PHOTOS });
    if (problem) { setError(problem); return; }
    setError(null);
    setPhotos(next);
  };
  return (
    <>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        <AddPhotoButton multiple camera label="Add photos" onFiles={addPhotos}
                        disabled={photos.length >= MAX_PHOTOS} />
        <span style={muted}>{photos.length ? `${photos.length} photo(s) chosen` : `Up to ${MAX_PHOTOS} photos`}</span>
      </div>
      <PendingPhotos files={photos} onRemove={(i) => setPhotos(photos.filter((_, n) => n !== i))} />
      <div style={{ marginTop: '10px' }}>
        <VoiceRecorder
          sent={voice ? { url: voice, by: 'you' } : null}
          onSend={async (blob) => setVoice(await api.uploadVoiceNote(blob))}
          onDelete={async () => setVoice('')}
        />
      </div>
    </>
  );
}

function AssigneeSelect({ id, people, value, onChange, meId }) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      {people.map((p) => (
        <option key={p.id} value={p.id}>
          {p.id === meId ? `Me (${p.name})` : `${p.name}${p.role ? ` — ${p.role}` : ''}`}
        </option>
      ))}
    </select>
  );
}

function AddTodoForm({ people, canAssign, meId, onCancel, onSaved }) {
  const [form, setForm] = useState({ title: '', description: '', due_date: '', assigned_to: String(meId || '') });
  const [photos, setPhotos] = useState([]);
  const [voice, setVoice] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) { setError('Give the to-do a title.'); return; }
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.append('title', form.title.trim());
      body.append('description', form.description.trim());
      if (form.due_date) body.append('due_date', form.due_date);
      if (canAssign && form.assigned_to) body.append('assigned_to', form.assigned_to);
      if (voice) body.append('voice_note', voice);
      photos.forEach((file) => body.append('photos', file));
      onSaved(await api.createTodo(body));
    } catch (err) {
      setError(err.message || 'Could not save this to-do.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormModal
      icon={ListTodo}
      title="Add to-do"
      subtitle="What needs doing, with photos or a voice note if they help."
      onClose={onCancel}
      width="620px"
      footer={(
        <>
          <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
          <button type="submit" form="add-todo-form" className="btn-primary" disabled={busy}>
            <Plus size={16} /> {busy ? 'Saving…' : 'Add to-do'}
          </button>
        </>
      )}
    >
      <form id="add-todo-form" onSubmit={submit}>
        {error && <div style={errorBox} role="alert">{error}</div>}
        <Field label="Title" required htmlFor="todo-title">
          <input id="todo-title" value={form.title} onChange={set('title')} maxLength={MAX_TITLE}
                 placeholder="e.g. Finish the hand work on the blue blouse" autoFocus />
        </Field>
        <Field label="Details" optional htmlFor="todo-details">
          <VoiceTextarea id="todo-details" rows={3} maxLength={LIMITS.note} value={form.description}
                         onChange={set('description')} placeholder="Anything that helps get it done…" />
        </Field>
        <div className="mobile-stack-grid"
             style={{ display: 'grid', gridTemplateColumns: canAssign ? '1fr 1fr' : '1fr', gap: '14px' }}>
          {canAssign && (
            <Field label="Assign to" icon={UserCheck} htmlFor="todo-assignee">
              <AssigneeSelect id="todo-assignee" people={people} meId={meId}
                              value={form.assigned_to}
                              onChange={(v) => setForm({ ...form, assigned_to: v })} />
            </Field>
          )}
          <Field label="Due date" optional icon={Calendar} htmlFor="todo-due">
            <input id="todo-due" type="date" value={form.due_date} onChange={set('due_date')} />
          </Field>
        </div>
        <Field label="Photos and voice note" optional>
          <Attachments photos={photos} setPhotos={setPhotos} voice={voice} setVoice={setVoice} setError={setError} />
        </Field>
      </form>
    </FormModal>
  );
}

/* One entry in a to-do's history. */
function UpdateRow({ update }) {
  if (update.kind !== 'NOTE') {
    return (
      <div style={{ ...muted, padding: '6px 0' }}>
        <strong style={{ color: 'var(--text-secondary)' }}>{update.author_name || 'Someone'}</strong>
        {' · '}{update.text}{' · '}{formatDateTime(update.created_at)}
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', gap: '10px', padding: '10px 0' }}>
      <AvatarInitials name={update.author_name} size={32} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '13px' }}>
          <strong>{update.author_name || 'Someone'}</strong>
          <span style={muted}> · {formatDateTime(update.created_at)}</span>
        </div>
        {update.text && (
          <p style={{ margin: '4px 0 0', fontSize: 'var(--text-sm)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            {update.text}
          </p>
        )}
        {update.photos?.length > 0 && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
            {update.photos.map((photo) => (
              <a key={photo.id} href={photo.url} target="_blank" rel="noreferrer" title="Open photo">
                <PhotoTile src={photo.url} size={72} />
              </a>
            ))}
          </div>
        )}
        <VoiceNotePlayer src={update.voice_note} />
      </div>
    </div>
  );
}

function TodoDetail({ todo, people, canAssign, meId, onClose, onChanged, onDeleted }) {
  const [text, setText] = useState('');
  const [photos, setPhotos] = useState([]);
  const [voice, setVoice] = useState('');
  const [busy, setBusy] = useState(null);   // 'status' | 'update' | 'assign' | 'delete'
  const [error, setError] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const run = async (kind, work) => {
    setBusy(kind);
    setError(null);
    try {
      await work();
    } catch (err) {
      setError(err.message || 'That did not go through. Try again.');
    } finally {
      setBusy(null);
    }
  };

  const changeStatus = (status) => run('status', async () => {
    onChanged(await api.setTodoStatus(todo.id, status));
  });

  const postUpdate = () => run('update', async () => {
    const body = new FormData();
    if (text.trim()) body.append('text', text.trim());
    if (voice) body.append('voice_note', voice);
    photos.forEach((file) => body.append('photos', file));
    onChanged(await api.addTodoUpdate(todo.id, body));
    setText(''); setPhotos([]); setVoice('');
  });

  const reassign = (userId) => run('assign', async () => {
    onChanged(await api.updateTodo(todo.id, { assigned_to: userId }));
  });

  const remove = () => run('delete', async () => {
    await api.deleteTodo(todo.id);
    onDeleted(todo.id);
  });

  const nothingToPost = !text.trim() && !photos.length && !voice;
  // The current assignee may be someone this person cannot assign to (a Master
  // looking at a designer's to-do), so they are added to keep the select true.
  const options = people.some((p) => p.id === todo.assigned_to) || !todo.assigned_to
    ? people
    : [...people, { id: todo.assigned_to, name: todo.assigned_to_name, role: todo.assigned_to_role }];

  return (
    <FormModal
      icon={ListTodo}
      title={todo.title}
      subtitle={`Added by ${todo.created_by_name || 'someone'} · ${formatDateTime(todo.created_at)}`}
      onClose={onClose}
      width="680px"
      footer={(
        <>
          {todo.can_delete && (confirmDelete ? (
            <>
              <span style={{ ...muted, marginRight: 'auto' }}>Delete this to-do and its updates?</span>
              <button type="button" className="btn-secondary" onClick={() => setConfirmDelete(false)}>Keep</button>
              <button type="button" className="btn-secondary at-btn-danger" onClick={remove} disabled={busy === 'delete'}>
                <Trash2 size={16} /> {busy === 'delete' ? 'Deleting…' : 'Delete'}
              </button>
            </>
          ) : (
            <button type="button" className="btn-secondary at-btn-danger" style={{ marginRight: 'auto' }}
                    onClick={() => setConfirmDelete(true)}>
              <Trash2 size={16} /> Delete
            </button>
          ))}
          {!confirmDelete && <button type="button" className="btn-primary" onClick={onClose}>Done</button>}
        </>
      )}
    >
      {error && <div style={errorBox} role="alert">{error}</div>}

      {todo.description && (
        <p style={{ margin: '0 0 14px', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)',
                    whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', lineHeight: 1.6 }}>
          {todo.description}
        </p>
      )}

      <div className="mobile-stack-grid"
           style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
        <div>
          <div style={muted}>Assigned to</div>
          {todo.can_edit && canAssign ? (
            <AssigneeSelect people={options} meId={meId} value={String(todo.assigned_to || '')}
                            onChange={reassign} />
          ) : (
            <div style={{ fontWeight: 600 }}>
              {todo.assigned_to_name || '—'}
              {todo.assigned_to_role && <span style={muted}> · {todo.assigned_to_role}</span>}
            </div>
          )}
        </div>
        <div>
          <div style={muted}>Due</div>
          <div style={{ fontWeight: 600 }}>{todo.due_date ? formatDate(todo.due_date) : '—'}</div>
        </div>
      </div>

      <div style={{ ...muted, marginBottom: '6px' }}>Status</div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}>
        {STATUSES.map(({ key, label, icon: Icon }) => {
          const active = todo.status === key;
          return (
            <button key={key} type="button"
                    className={active ? 'btn-primary' : 'btn-secondary'}
                    aria-pressed={active}
                    disabled={!todo.can_change_status || busy === 'status' || active}
                    style={active ? { opacity: 1, cursor: 'default' } : undefined}
                    onClick={() => changeStatus(key)}>
              <Icon size={15} /> {label}
            </button>
          );
        })}
      </div>
      {!todo.can_change_status && (
        <div style={muted}>Only the person it is assigned to, its creator, the owner or a Master can change the status.</div>
      )}

      <h4 style={{ fontSize: '14px', fontWeight: 600, margin: '18px 0 4px' }}>Updates</h4>
      {todo.updates?.length ? (
        <div style={{ borderTop: '1px solid var(--border-color)' }}>
          {todo.updates.map((update) => (
            <div key={update.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
              <UpdateRow update={update} />
            </div>
          ))}
        </div>
      ) : (
        <div style={muted}>No updates yet. Add a note, photos of the work or a voice note below.</div>
      )}

      <div style={{ ...panel, padding: '14px', marginTop: '16px', boxShadow: 'none' }}>
        <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>Add an update</div>
        <VoiceTextarea rows={2} maxLength={LIMITS.note} value={text}
                       onChange={(e) => setText(e.target.value)}
                       placeholder="What was done today…" />
        <div style={{ marginTop: '10px' }}>
          <Attachments photos={photos} setPhotos={setPhotos} voice={voice} setVoice={setVoice} setError={setError} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
          <button type="button" className="btn-primary" onClick={postUpdate}
                  disabled={nothingToPost || busy === 'update'}>
            <Send size={15} /> {busy === 'update' ? 'Posting…' : 'Post update'}
          </button>
        </div>
      </div>
    </FormModal>
  );
}

function TodoCard({ todo, onOpen }) {
  const notes = (todo.updates || []).filter((u) => u.kind === 'NOTE');
  const last = notes[notes.length - 1];
  const photoCount = notes.reduce((n, u) => n + (u.photos?.length || 0), 0);
  const voiceCount = notes.filter((u) => u.voice_note).length;
  const overdue = todo.due_date && todo.status !== 'CLOSED'
    && todo.due_date < new Date().toLocaleDateString('en-CA');
  return (
    <button type="button" onClick={onOpen}
            style={{ ...panel, padding: '16px', textAlign: 'left', cursor: 'pointer', width: '100%',
                     display: 'flex', flexDirection: 'column', gap: '10px', font: 'inherit', color: 'inherit' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'flex-start' }}>
        <div style={{ fontWeight: 600, fontSize: '15px', overflowWrap: 'anywhere' }}>{todo.title}</div>
        <StatusBadge status={todo.status} />
      </div>
      {(last?.text || todo.description) && (
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', overflow: 'hidden',
                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflowWrap: 'anywhere' }}>
          {last?.text || todo.description}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: 'auto' }}>
        <AvatarInitials name={todo.assigned_to_name} size={26} />
        <span style={{ fontSize: '13px' }}>{todo.assigned_to_name || 'Unassigned'}</span>
        <span style={{ ...muted, marginLeft: 'auto', display: 'inline-flex', gap: '10px', alignItems: 'center' }}>
          {photoCount > 0 && <span style={{ display: 'inline-flex', gap: '4px', alignItems: 'center' }}><ImageIcon size={12} /> {photoCount}</span>}
          {voiceCount > 0 && <span style={{ display: 'inline-flex', gap: '4px', alignItems: 'center' }}><Mic size={12} /> {voiceCount}</span>}
          {todo.due_date && (
            <span style={{ display: 'inline-flex', gap: '4px', alignItems: 'center',
                           color: overdue ? 'var(--danger-color)' : undefined }}>
              <Calendar size={12} /> {formatDate(todo.due_date)}
            </span>
          )}
        </span>
      </div>
    </button>
  );
}

export default function TodoPanel({ currentUser }) {
  const [todos, setTodos] = useState([]);
  const [people, setPeople] = useState([]);
  const [canAssign, setCanAssign] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [filter, setFilter] = useState('ACTIVE');
  const [who, setWho] = useState('');
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState(null);

  const meId = currentUser?.id;
  const role = currentUser?.role;
  const seesEveryone = !role || role === 'Owner' || role === 'Master';

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [rows, roster] = await Promise.all([
        api.getTodos(),
        api.getTodoPeople().catch(() => ({ can_assign: false, people: [] })),
      ]);
      setTodos(Array.isArray(rows) ? rows : []);
      setPeople(Array.isArray(roster?.people) ? roster.people : []);
      setCanAssign(Boolean(roster?.can_assign));
    } catch (err) {
      setLoadError(err.message || 'Could not load the to-do list.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(refresh, 0);
    return () => clearTimeout(t);
  }, [refresh]);

  const replace = (todo) => setTodos((list) => list.map((t) => (t.id === todo.id ? todo : t)));

  const counts = useMemo(() => {
    const c = { OPEN: 0, IN_PROGRESS: 0, CLOSED: 0 };
    todos.forEach((t) => { c[t.status] = (c[t.status] || 0) + 1; });
    return c;
  }, [todos]);

  // Everyone a to-do on this list is assigned to, for the person filter.
  const assignees = useMemo(() => {
    const map = new Map();
    todos.forEach((t) => { if (t.assigned_to) map.set(t.assigned_to, t.assigned_to_name); });
    return [...map.entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1])));
  }, [todos]);

  const shown = useMemo(() => todos.filter((t) => {
    if (filter === 'ACTIVE' && t.status === 'CLOSED') return false;
    if (filter !== 'ACTIVE' && filter !== 'ALL' && t.status !== filter) return false;
    if (who && String(t.assigned_to) !== who) return false;
    return true;
  }), [todos, filter, who]);

  const open = todos.find((t) => t.id === openId) || null;

  return (
    <div>
      <PageHeader
        icon={ListTodo}
        tone="green"
        title="To-do"
        subtitle={seesEveryone
          ? 'Work the team has taken on or been given, with photos, notes and voice notes.'
          : 'Your to-dos. Add photos, notes and voice notes as the work moves along.'}
        actions={(
          <button type="button" className="btn-primary" onClick={() => setAdding(true)}>
            <Plus size={16} /> Add to-do
          </button>
        )}
      />

      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', margin: '0 0 16px' }}>
        <Segmented
          ariaLabel="Filter to-dos by status"
          value={filter}
          onChange={setFilter}
          options={[
            { key: 'ACTIVE', label: `Active (${counts.OPEN + counts.IN_PROGRESS})` },
            { key: 'OPEN', label: `Open (${counts.OPEN})` },
            { key: 'IN_PROGRESS', label: `In progress (${counts.IN_PROGRESS})` },
            { key: 'CLOSED', label: `Closed (${counts.CLOSED})` },
            { key: 'ALL', label: `All (${todos.length})` },
          ]}
        />
        {seesEveryone && assignees.length > 1 && (
          <select value={who} onChange={(e) => setWho(e.target.value)} aria-label="Filter by person"
                  style={{ width: 'auto', minWidth: '180px' }}>
            <option value="">Everyone</option>
            {assignees.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        )}
      </div>

      {loadError && <div style={errorBox} role="alert">{loadError}</div>}

      {loading ? (
        <Loader />
      ) : shown.length === 0 ? (
        <div className="ui-card" style={{ padding: 'var(--space-10) var(--space-6)', textAlign: 'center', color: 'var(--text-secondary)' }}>
          {todos.length === 0
            ? 'No to-dos yet. Add one with the button above.'
            : 'Nothing here for this filter.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '14px' }}>
          {shown.map((todo) => (
            <TodoCard key={todo.id} todo={todo} onOpen={() => setOpenId(todo.id)} />
          ))}
        </div>
      )}

      {adding && (
        <AddTodoForm
          people={people}
          canAssign={canAssign}
          meId={meId}
          onCancel={() => setAdding(false)}
          onSaved={(todo) => { setTodos((list) => [todo, ...list]); setAdding(false); }}
        />
      )}

      {open && (
        <TodoDetail
          key={open.id}
          todo={open}
          people={people}
          canAssign={canAssign}
          meId={meId}
          onClose={() => setOpenId(null)}
          onChanged={replace}
          onDeleted={(id) => { setTodos((list) => list.filter((t) => t.id !== id)); setOpenId(null); }}
        />
      )}
    </div>
  );
}
