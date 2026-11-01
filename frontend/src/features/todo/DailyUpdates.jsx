/**
 * To-do: each staff member's daily update -- a note, photos, a voice note, a
 * video, any mix. Staff post and read their own month; the owner, Masters and
 * Designers read everyone's, with a filter by person. The owner does not post.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Film, Send, Trash2, X } from 'lucide-react';
import { api } from '../../services/api';
import { resolveMediaUrl, shrinkImage } from '../../services/media';
import { LIMITS } from '../../services/validate';
import { AddPhotoButton, PhotoTile, SectionCard, InfoNote } from '../../components/ui/Atelier';
import { VoiceRecorder, VoiceNotePlayer } from '../../components/ui/VoiceTextarea';
import Loader from '../../components/ui/Loader';
import './dailyUpdates.css';

const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const shiftMonth = (key, by) => {
  const [y, m] = key.split('-').map(Number);
  return monthKey(new Date(y, m - 1 + by, 1));
};
const monthLabel = (key) => {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
};
const dayLabel = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' });
const timeLabel = (iso) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

function Composer({ onPosted }) {
  const [note, setNote] = useState('');
  const [photos, setPhotos] = useState([]);
  const [video, setVideo] = useState(null);
  const [voice, setVoice] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const videoRef = useRef(null);

  const previews = useMemo(() => photos.map((f) => URL.createObjectURL(f)), [photos]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  const addPhotos = (files) => {
    setError('');
    setPhotos((prev) => {
      const next = [...prev, ...files];
      if (next.length > LIMITS.imagesPerUpload) setError(`At most ${LIMITS.imagesPerUpload} photos in one update.`);
      return next.slice(0, LIMITS.imagesPerUpload);
    });
  };

  const pickVideo = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!(file.type || '').startsWith('video/')) { setError('That file is not a video.'); return; }
    if (file.size > MAX_VIDEO_BYTES) { setError('That video is too big. Keep it under 50 MB (about a minute).'); return; }
    setError('');
    setVideo(file);
  };

  const empty = !note.trim() && !photos.length && !video && !voice;

  const post = async () => {
    if (empty || busy) return;
    setBusy(true);
    setError('');
    try {
      const body = new FormData();
      if (note.trim()) body.append('note', note.trim());
      if (voice) body.append('voice_note', voice);
      for (const file of photos) body.append('photos', await shrinkImage(file));
      if (video) body.append('video', video);
      await api.postDailyUpdate(body);
      setNote(''); setPhotos([]); setVideo(null); setVoice('');
      onPosted();
    } catch (err) {
      setError(err.message || 'Could not post the update.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionCard title="Today's update" subtitle="What did you work on today? Add a note, photos, a voice note or a video.">
      <div className="du-composer">
        <textarea className="du-note" rows={3} value={note} disabled={busy} maxLength={2000}
                  placeholder="Write your update…" onChange={(e) => setNote(e.target.value)} />

        {(photos.length > 0 || video) && (
          <div className="du-attachments">
            {previews.map((src, i) => (
              <PhotoTile key={src} src={src} size={72} onRemove={busy ? undefined : () => setPhotos((p) => p.filter((_, j) => j !== i))} />
            ))}
            {video && (
              <span className="du-video-chip">
                <Film size={14} /> <span className="du-video-name">{video.name}</span>
                {!busy && (
                  <button type="button" aria-label="Remove video" onClick={() => setVideo(null)}><X size={12} /></button>
                )}
              </span>
            )}
          </div>
        )}

        <VoiceRecorder sent={voice ? { url: voice, by: 'you' } : null} disabled={busy}
                       onSend={async (blob) => setVoice(await api.uploadVoiceNote(blob))}
                       onDelete={() => setVoice('')} />

        <div className="du-actions">
          <AddPhotoButton multiple camera label="Photo" onFiles={addPhotos}
                          disabled={busy || photos.length >= LIMITS.imagesPerUpload} />
          <button type="button" className="btn-secondary at-btn-sm" disabled={busy} onClick={() => videoRef.current?.click()}>
            <Film size={14} /> {video ? 'Change video' : 'Video'}
          </button>
          <input ref={videoRef} type="file" accept="video/*" hidden onChange={pickVideo} />
          <button type="button" className="btn-primary du-post" disabled={empty || busy} onClick={post}>
            <Send size={14} /> {busy ? 'Posting…' : 'Post update'}
          </button>
        </div>
        {error && <p className="du-error" role="alert">{error}</p>}
      </div>
    </SectionCard>
  );
}

function UpdateCard({ row, showAuthor, onDelete }) {
  const [deleting, setDeleting] = useState(false);
  const remove = async () => {
    if (!window.confirm('Delete this update?')) return;
    setDeleting(true);
    try { await onDelete(row.id); } catch (err) { window.alert(err.message); setDeleting(false); }
  };
  return (
    <article className="du-card">
      <header className="du-card-head">
        <div className="du-card-who">
          {showAuthor && <strong>{row.author_name || 'Someone'}</strong>}
          {showAuthor && row.author_role && <span className="du-role">{row.author_role}</span>}
          <span className="du-time">{timeLabel(row.created_at)}</span>
        </div>
        {row.mine && (
          <button type="button" className="du-delete" disabled={deleting} onClick={remove} aria-label="Delete update" title="Delete update">
            <Trash2 size={14} />
          </button>
        )}
      </header>
      {row.note && <p className="du-text">{row.note}</p>}
      {row.photos?.length > 0 && (
        <div className="du-photos">
          {row.photos.map((url) => (
            <a key={url} href={resolveMediaUrl(url)} target="_blank" rel="noreferrer">
              <img src={resolveMediaUrl(url)} alt="Update photo" loading="lazy" />
            </a>
          ))}
        </div>
      )}
      {row.voice_note && <VoiceNotePlayer src={resolveMediaUrl(row.voice_note)} />}
      {row.video && <video className="du-video" src={resolveMediaUrl(row.video)} controls preload="metadata" />}
    </article>
  );
}

export default function DailyUpdates() {
  const [month, setMonth] = useState(() => monthKey(new Date()));
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [person, setPerson] = useState('');
  const thisMonth = monthKey(new Date());

  const load = useCallback(() => (
    api.getDailyUpdates({ month })
      .then((d) => { setError(''); setData(d); })
      .catch((err) => setError(err.message || 'Could not load the updates.'))
  ), [month]);
  useEffect(() => { load(); }, [load]);
  const goMonth = (by) => { setData(null); setError(''); setMonth((m) => shiftMonth(m, by)); };

  const rows = useMemo(() => data?.results || [], [data]);
  const people = useMemo(() => {
    const seen = new Map();
    rows.forEach((r) => { if (r.author && !seen.has(r.author)) seen.set(r.author, r.author_name || 'Someone'); });
    return [...seen].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);
  const shown = useMemo(() => (person ? rows.filter((r) => String(r.author) === person) : rows), [rows, person]);
  const byDay = useMemo(() => {
    const map = new Map();
    shown.forEach((r) => map.set(r.date, [...(map.get(r.date) || []), r]));
    return [...map];
  }, [shown]);

  const remove = async (id) => {
    await api.deleteDailyUpdate(id);
    setData((d) => ({ ...d, results: d.results.filter((r) => r.id !== id) }));
  };

  const everyone = Boolean(data?.sees_everyone);

  return (
    <div className="du">
      {data?.can_post && month === thisMonth && <Composer onPosted={load} />}

      <div className="du-toolbar">
        <div className="du-month">
          <button type="button" className="btn-secondary at-btn-sm" aria-label="Previous month" onClick={() => goMonth(-1)}>
            <ChevronLeft size={16} />
          </button>
          <span className="du-month-label">{monthLabel(month)}</span>
          <button type="button" className="btn-secondary at-btn-sm" aria-label="Next month" disabled={month >= thisMonth}
                  onClick={() => goMonth(1)}>
            <ChevronRight size={16} />
          </button>
        </div>
        {everyone && (
          <select className="du-person" value={person} onChange={(e) => setPerson(e.target.value)} aria-label="Staff member">
            <option value="">All staff</option>
            {people.map(([id, name]) => <option key={id} value={String(id)}>{name}</option>)}
          </select>
        )}
      </div>

      {error && <InfoNote tone="amber" title="Could not load">{error}</InfoNote>}
      {!data && !error && <Loader />}
      {data && !byDay.length && (
        <p className="du-empty">
          {everyone ? 'No updates from the team in this month yet.' : 'You have not posted any updates in this month yet.'}
        </p>
      )}

      {byDay.map(([day, list]) => (
        <section key={day} className="du-day">
          <h3 className="du-day-title">{dayLabel(day)}</h3>
          {list.map((row) => <UpdateCard key={row.id} row={row} showAuthor={everyone} onDelete={remove} />)}
        </section>
      ))}
    </div>
  );
}
