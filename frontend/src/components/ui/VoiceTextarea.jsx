import { useEffect, useRef, useState } from 'react';
import { Mic, Square, Volume2 } from 'lucide-react';

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
export default function VoiceTextarea({ value, defaultValue, onChange, style, onRecording, onRecordingChange, ...rest }) {
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

  const supported = onRecording ? (canRecord() || Boolean(recognitionClass())) : Boolean(recognitionClass());
  const textarea = (
    <textarea ref={ref} value={value} defaultValue={defaultValue} onChange={onChange}
              style={supported ? { ...style, paddingRight: '40px' } : style} {...rest} />
  );
  if (!supported) return textarea;

  const idle = onRecording ? 'Record a voice note (and dictate)' : 'Speak instead of typing';
  const busy = onRecording ? 'Stop' : 'Stop listening';
  return (
    <div style={{ position: 'relative' }}>
      {textarea}
      {listening && onRecording && (
        <span style={{
          position: 'absolute', top: '12px', right: '42px', fontSize: '11px', fontVariantNumeric: 'tabular-nums',
          padding: '1px 6px', borderRadius: '10px', background: '#dc2626', color: '#fff',
        }}>
          {mmss(elapsed)}
        </span>
      )}
      <button type="button" onClick={start}
              title={listening ? busy : idle}
              aria-label={listening ? busy : idle}
              aria-pressed={listening}
              style={{
                position: 'absolute', top: '8px', right: '8px', width: '28px', height: '28px',
                border: 'none', borderRadius: '50%', cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                background: listening ? '#dc2626' : 'var(--background-secondary, #f1f5f9)',
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
