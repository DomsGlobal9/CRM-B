import { useEffect, useRef, useState } from 'react';
import { Mic, Square, Volume2, Send, Trash2 } from 'lucide-react';

/**
 * Voice on the update boxes, with nothing behind it but the browser.
 *
 * Speech -> text uses the Web Speech API (SpeechRecognition): Chrome, Edge,
 * Android Chrome, Samsung Internet, and Safari on Mac/iOS. Text -> speech uses
 * speechSynthesis, which every browser has. Neither touches the server: what is
 * saved is the same string the textarea always sent, so PDFs, WhatsApp
 * messages, search and history read it exactly as before -- and it costs
 * nothing per minute, on any number of boutiques. Where recognition is not
 * available (Firefox) the mic button is simply not rendered and the box is a
 * plain textarea.
 *
 * With `onRecording`, the same mic button also records a voice note through
 * MediaRecorder. There the clip is the point and dictation is best effort:
 * recognition failing, ending on silence or not existing at all never stops
 * the recording. Clips stop themselves at MAX_SECONDS (server caps 8 MB).
 *
 * Needs HTTPS (or localhost) for the microphone, which the deployed site has.
 */

// Resolved on use, not at import: a polyfill or a browser that exposes the
// engine late would otherwise leave the mic hidden for the whole session.
const recognitionClass = () => (typeof window !== 'undefined'
  && (window.SpeechRecognition || window.webkitSpeechRecognition)) || null;

const canRecord = () => typeof MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);

const MAX_SECONDS = 180;

// App language (frontend/src/i18n) -> the BCP-47 tag the speech engines want.
// Indian locales for the Indian languages; the engine picks the closest voice.
const SPEECH_LANG = {
  en: 'en-IN', hi: 'hi-IN', te: 'te-IN', ta: 'ta-IN', kn: 'kn-IN', ml: 'ml-IN',
  mr: 'mr-IN', gu: 'gu-IN', ar: 'ar-SA', es: 'es-ES', de: 'de-DE',
};

function speechLang() {
  let code = 'en';
  try { code = localStorage.getItem('app_language') || 'en'; } catch { /* private mode */ }
  return SPEECH_LANG[code] || 'en-IN';
}

const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/**
 * Drop-in for <textarea>: same props, same onChange(event.target.value).
 * Works controlled (value) and uncontrolled (defaultValue). Dictated words are
 * appended to whatever is already typed, so people can mix the two.
 */
// `onMic`: the mic button calls this instead of dictating -- for a box whose
// voice note is recorded by a VoiceRecorder beneath it, so one mic means one
// thing on that screen. Nothing else about the box changes.
export default function VoiceTextarea({ value, defaultValue, onChange, style, onRecording, onRecordingChange, onMic, ...rest }) {
  const ref = useRef(null);
  const recRef = useRef(null);
  const mediaRef = useRef(null);
  const timerRef = useRef(null);
  const activeRef = useRef(false);
  const [listening, setListening] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => () => {
    activeRef.current = false;
    clearInterval(timerRef.current);
    try { recRef.current?.stop(); } catch { /* already stopped */ }
    try { mediaRef.current?.stop(); } catch { /* not recording */ }
  }, []);

  const append = (transcript) => {
    // The DOM value, not the `value` prop: rec.onresult is bound once per
    // session, so the prop it closed over is the pre-dictation text and a
    // second sentence would overwrite the first.
    const current = ref.current?.value ?? (value || '');
    let next = current ? `${current.replace(/\s+$/, '')} ${transcript}` : transcript;
    // Browsers only apply maxLength to typing, not to a value set from code,
    // so dictation has to respect the box's own limit here.
    const limit = Number(rest.maxLength);
    if (limit > 0 && next.length > limit) next = next.slice(0, limit);
    if (value === undefined && ref.current) ref.current.value = next;
    if (onChange) onChange({ target: { value: next } });
  };

  const stopAll = () => {
    activeRef.current = false;
    clearInterval(timerRef.current);
    timerRef.current = null;
    const rec = recRef.current;
    recRef.current = null;
    try { rec?.stop(); } catch { /* noop */ }
    const recorder = mediaRef.current;
    mediaRef.current = null;
    if (recorder && recorder.state !== 'inactive') { try { recorder.stop(); } catch { /* noop */ } }
    setListening(false);
    setElapsed(0);
  };

  // Returns true when the engine started. `standalone` = pure dictation, where
  // the engine ending is the end of the session; otherwise the clip decides.
  const startRecognition = (standalone) => {
    const Recognition = recognitionClass();
    if (!Recognition) return false;
    const rec = new Recognition();
    rec.lang = speechLang();
    rec.interimResults = false;
    rec.continuous = true;
    rec.onresult = (e) => {
      const said = Array.from(e.results).slice(e.resultIndex)
        .filter((r) => r.isFinal).map((r) => r[0].transcript.trim()).filter(Boolean).join(' ');
      if (said) append(said);
    };
    rec.onend = rec.onerror = () => {
      if (recRef.current === rec) recRef.current = null;
      if (activeRef.current && (standalone || !mediaRef.current)) stopAll();
    };
    recRef.current = rec;
    try { rec.start(); return true; } catch { recRef.current = null; return false; }
  };

  const startRecording = async () => {
    if (!canRecord()) return false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!activeRef.current) { stream.getTracks().forEach((t) => t.stop()); return false; }
      const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']
        .find((t) => MediaRecorder.isTypeSupported(t)) || '';
      const recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      const chunks = [];
      recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (chunks.length) onRecording(new Blob(chunks, { type: recorder.mimeType || type || 'audio/webm' }));
      };
      recorder.start();
      mediaRef.current = recorder;
      return true;
    } catch { return false; /* mic refused or busy: the words may still arrive */ }
  };

  const start = async () => {
    if (listening) { stopAll(); return; }
    if (!onRecording) {
      activeRef.current = true;
      if (startRecognition(true)) setListening(true); else activeRef.current = false;
      return;
    }
    activeRef.current = true;
    setListening(true);
    const recording = await startRecording();
    if (!activeRef.current) return; // stopped while the mic prompt was up
    const dictating = startRecognition(false);
    if (!recording && !dictating) { stopAll(); return; }
    const startedAt = Date.now();
    timerRef.current = setInterval(() => {
      const s = Math.floor((Date.now() - startedAt) / 1000);
      setElapsed(s);
      if (s >= MAX_SECONDS) stopAll();
    }, 500);
  };

  useEffect(() => { if (onRecording && onRecordingChange) onRecordingChange(listening); }, [listening]); // eslint-disable-line react-hooks/exhaustive-deps

  const supported = onMic ? canRecord() : onRecording ? (canRecord() || Boolean(recognitionClass())) : Boolean(recognitionClass());
  const textarea = (
    <textarea ref={ref} value={value} defaultValue={defaultValue} onChange={onChange}
              style={supported ? { ...style, paddingRight: '40px' } : style} {...rest} />
  );
  if (!supported) return textarea;

  const idle = onMic ? 'Record a voice note' : onRecording ? 'Record a voice note (and dictate)' : 'Speak instead of typing';
  const busy = onRecording ? 'Stop' : 'Stop listening';
  // Classed so a bordered wrapper (.at-field-control) can treat this as the
  // control itself rather than a box inside it -- see index.css.
  return (
    <div className="voice-textarea" style={{ position: 'relative' }}>
      {textarea}
      {listening && onRecording && (
        <span style={{
          position: 'absolute', top: '12px', right: '42px', fontSize: '11px', fontVariantNumeric: 'tabular-nums',
          padding: '1px 6px', borderRadius: '10px', background: '#dc2626', color: '#fff',
        }}>
          {mmss(elapsed)}
        </span>
      )}
      <button type="button" onClick={onMic || start}
              title={listening ? busy : idle}
              aria-label={listening ? busy : idle}
              aria-pressed={listening}
              style={{
                position: 'absolute', top: '8px', right: '8px', width: '28px', height: '28px',
                border: 'none', borderRadius: '50%', cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                background: listening ? '#dc2626' : 'var(--surface-inset, #f1f5f9)',
                color: listening ? '#fff' : 'var(--text-secondary, #475569)',
              }}>
        {listening ? <Square size={12} /> : <Mic size={14} />}
      </button>
    </div>
  );
}

/** The recording behind a dictated note, when there is one. */
export function VoiceNotePlayer({ src, style }) {
  if (!src) return null;
  return (
    <audio controls preload="none" src={src}
           style={{ display: 'block', width: '100%', maxWidth: '360px', height: '36px', marginTop: '6px', ...style }} />
  );
}

/** A clip not yet saved (blob) or already saved (url), with an optional Remove. */
export function VoiceClipPreview({ blob, url, onRemove }) {
  // Made and revoked in one effect: StrictMode runs mount -> cleanup -> mount,
  // and a URL minted in useMemo would be revoked under the player's feet.
  const [objectUrl, setObjectUrl] = useState('');
  useEffect(() => {
    if (!blob) { setObjectUrl(''); return undefined; }
    const made = URL.createObjectURL(blob);
    setObjectUrl(made);
    return () => URL.revokeObjectURL(made);
  }, [blob]);
  const src = objectUrl || url;
  if (!src) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
      <VoiceNotePlayer src={src} style={{ flex: '1 1 200px' }} />
      {onRemove && (
        <button type="button" onClick={onRemove}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '2px',
                         fontSize: '12px', color: 'var(--text-secondary, #475569)', textDecoration: 'underline' }}>
          Remove
        </button>
      )}
    </div>
  );
}


/**
 * A voice note on its own: record, hear it back, send it or throw it away.
 *
 * Separate from the dictation mic on the textarea. Here nothing is
 * transcribed -- what the other person gets is the recording, under the name
 * of whoever sent it -- and nothing leaves the browser until Send is pressed.
 * While recording, a pulsing dot and bars show the mic is live; the clip stops
 * itself at MAX_SECONDS.
 *
 * `sent` is the recording already on the record ({url, by, at}); `onSend(blob)`
 * uploads and saves and resolves when the note is stored; `onDelete()` removes
 * the stored one. Both may throw; the button then just says so.
 */
const RECORDER_KEYFRAMES = `
@keyframes vn-pulse { 0%,100% { transform: scale(1); opacity: 1 } 50% { transform: scale(1.6); opacity: .45 } }
@keyframes vn-bar { 0%,100% { transform: scaleY(.3) } 50% { transform: scaleY(1) } }
`;

export function VoiceRecorder({ sent, onSend, onDelete, disabled = false, label = 'Record voice note', onRecordingChange, startToken = 0 }) {
  const [phase, setPhase] = useState('idle');   // idle | recording | preview | sending | deleting
  const [blob, setBlob] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState('');
  const mediaRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => () => {
    clearInterval(timerRef.current);
    try { mediaRef.current?.stop(); } catch { /* not recording */ }
  }, []);
  useEffect(() => { onRecordingChange?.(phase === 'recording'); }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const stop = () => {
    clearInterval(timerRef.current);
    const recorder = mediaRef.current;
    mediaRef.current = null;
    if (recorder && recorder.state !== 'inactive') { try { recorder.stop(); } catch { /* noop */ } }
  };

  const start = async () => {
    setError('');
    if (!canRecord()) { setError('This browser cannot record audio.'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']
        .find((t) => MediaRecorder.isTypeSupported(t)) || '';
      const recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      const chunks = [];
      recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (chunks.length) { setBlob(new Blob(chunks, { type: recorder.mimeType || type || 'audio/webm' })); setPhase('preview'); }
        else setPhase('idle');
      };
      recorder.start();
      mediaRef.current = recorder;
      setPhase('recording');
      setElapsed(0);
      const startedAt = Date.now();
      timerRef.current = setInterval(() => {
        const s = Math.floor((Date.now() - startedAt) / 1000);
        setElapsed(s);
        if (s >= MAX_SECONDS) stop();
      }, 500);
    } catch {
      setError('The microphone could not be opened. Allow it in the browser, then try again.');
    }
  };

  const discard = () => { setBlob(null); setPhase('idle'); setElapsed(0); };

  const send = async () => {
    if (!blob) return;
    setPhase('sending'); setError('');
    try { await onSend(blob); setBlob(null); setPhase('idle'); }
    catch (err) { setError(err?.message || 'Could not send the voice note.'); setPhase('preview'); }
  };

  const remove = async () => {
    if (!onDelete) return;
    setPhase('deleting'); setError('');
    try { await onDelete(); setPhase('idle'); }
    catch (err) { setError(err?.message || 'Could not delete the voice note.'); setPhase('idle'); }
  };

  // A bump of `startToken` is a press of the record button from elsewhere
  // (the notes box's mic). Only from rest: never over a take in progress.
  useEffect(() => {
    if (!startToken || phase !== 'idle' || disabled) return undefined;
    const id = setTimeout(start, 0);
    return () => clearTimeout(id);
  }, [startToken]); // eslint-disable-line react-hooks/exhaustive-deps

  const when = sent?.at ? new Date(sent.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';
  const small = { padding: '4px 10px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '5px' };

  return (
    <div className="voice-recorder" style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <style>{RECORDER_KEYFRAMES}</style>

      {phase === 'idle' && sent?.url && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <VoiceNotePlayer src={sent.url} style={{ flex: '1 1 200px', marginTop: 0 }} />
          <span style={{ fontSize: '12px', color: 'var(--text-secondary, #555)' }}>
            Voice note from <strong>{sent.by || 'someone'}</strong>{when ? ` · ${when}` : ''}
          </span>
          {onDelete && (
            <button type="button" className="btn-secondary" style={small} disabled={disabled} onClick={remove}
                    title="Delete this voice note">
              <Trash2 size={13} /> Delete
            </button>
          )}
        </div>
      )}

      {phase === 'idle' && (
        <div>
          <button type="button" className="btn-secondary" style={small} disabled={disabled || !canRecord()} onClick={start}>
            <Mic size={13} /> {sent?.url ? 'Record a new voice note' : label}
          </button>
        </div>
      )}

      {phase === 'recording' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', borderRadius: '10px',
                      background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.35)' }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#dc2626', display: 'inline-block',
                         animation: 'vn-pulse 1s ease-in-out infinite' }} />
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, height: 18 }} aria-hidden="true">
            {[0, 1, 2, 3, 4].map((i) => (
              <span key={i} style={{ width: 3, height: 18, background: '#dc2626', borderRadius: 2, transformOrigin: 'center',
                                     animation: `vn-bar ${0.7 + i * 0.13}s ease-in-out ${i * 0.1}s infinite` }} />
            ))}
          </span>
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#dc2626', fontVariantNumeric: 'tabular-nums' }}>
            Recording {mmss(elapsed)}
          </span>
          <button type="button" className="btn-primary" style={{ ...small, marginLeft: 'auto', background: '#dc2626', border: 'none' }} onClick={stop}>
            <Square size={12} /> Stop
          </button>
        </div>
      )}

      {(phase === 'preview' || phase === 'sending') && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <VoiceClipPreview blob={blob} />
          <button type="button" className="btn-primary" style={small} disabled={phase === 'sending'} onClick={send}>
            <Send size={13} /> {phase === 'sending' ? 'Sending…' : 'Send'}
          </button>
          <button type="button" className="btn-secondary" style={small} disabled={phase === 'sending'} onClick={discard}>
            <Trash2 size={13} /> Delete
          </button>
        </div>
      )}

      {phase === 'deleting' && <span style={{ fontSize: '12px', color: 'var(--text-secondary, #555)' }}>Deleting…</span>}
      {error && <span style={{ fontSize: '12px', color: 'var(--danger-color, #b91c1c)' }}>{error}</span>}
    </div>
  );
}

/** A small "read this aloud" control for any displayed note. */
export function SpeakButton({ text, style }) {
  const [speaking, setSpeaking] = useState(false);
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;

  useEffect(() => () => { if (speaking) synth?.cancel(); }, [speaking, synth]);

  if (!synth || !text) return null;

  const toggle = (e) => {
    e.stopPropagation();
    if (speaking) { synth.cancel(); setSpeaking(false); return; }
    const u = new SpeechSynthesisUtterance(String(text));
    u.lang = speechLang();
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    synth.cancel();
    synth.speak(u);
    setSpeaking(true);
  };

  return (
    <button type="button" onClick={toggle}
            title={speaking ? 'Stop' : 'Listen'} aria-label={speaking ? 'Stop reading' : 'Read aloud'}
            style={{
              border: 'none', background: 'transparent', cursor: 'pointer', padding: '2px',
              verticalAlign: 'middle', marginLeft: '6px',
              color: speaking ? '#dc2626' : 'var(--text-secondary, #475569)', ...style,
            }}>
      {speaking ? <Square size={12} /> : <Volume2 size={14} />}
    </button>
  );
}
