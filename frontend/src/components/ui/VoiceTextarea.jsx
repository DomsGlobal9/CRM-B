import React, { useEffect, useRef, useState } from 'react';
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
 * Needs HTTPS (or localhost) for the microphone, which the deployed site has.
 */

// Resolved on use, not at import: a polyfill or a browser that exposes the
// engine late would otherwise leave the mic hidden for the whole session.
const recognitionClass = () => (typeof window !== 'undefined'
  && (window.SpeechRecognition || window.webkitSpeechRecognition)) || null;

// App language (frontend/src/i18n) -> the BCP-47 tag the speech engines want.
// Indian locales for the Indian languages; the engine picks the closest voice.
const SPEECH_LANG = {
  en: 'en-IN', hi: 'hi-IN', te: 'te-IN', ta: 'ta-IN', kn: 'kn-IN', ml: 'ml-IN',
  mr: 'mr-IN', gu: 'gu-IN', ar: 'ar-SA', es: 'es-ES', de: 'de-DE',
};

export function speechLang() {
  let code = 'en';
  try { code = localStorage.getItem('app_language') || 'en'; } catch { /* private mode */ }
  return SPEECH_LANG[code] || 'en-IN';
}

/**
 * Drop-in for <textarea>: same props, same onChange(event.target.value).
 * Works controlled (value) and uncontrolled (defaultValue). Dictated words are
 * appended to whatever is already typed, so people can mix the two.
 */
export default function VoiceTextarea({ value, defaultValue, onChange, style, onRecording, ...rest }) {
  const ref = useRef(null);
  const recRef = useRef(null);
  // When `onRecording` is given, the microphone is also recorded (MediaRecorder)
  // for as long as recognition runs, and the clip is handed back on stop -- so
  // the reader can hear the person as well as read the words. Without it,
  // nothing is recorded: text is the only thing that leaves the browser.
  const mediaRef = useRef(null);
  const [listening, setListening] = useState(false);

  useEffect(() => () => {
    try { recRef.current?.stop(); } catch { /* already stopped */ }
    try { mediaRef.current?.stop(); } catch { /* not recording */ }
  }, []);

  const append = (transcript) => {
    const current = value !== undefined ? (value || '') : (ref.current?.value || '');
    const next = current ? `${current.replace(/\s+$/, '')} ${transcript}` : transcript;
    if (value === undefined && ref.current) ref.current.value = next;
    if (onChange) onChange({ target: { value: next } });
  };

  const start = () => {
    if (listening) { try { recRef.current?.stop(); } catch { /* noop */ } return; }
    const Recognition = recognitionClass();
    if (!Recognition) return;
    const rec = new Recognition();
    rec.lang = speechLang();
    rec.interimResults = false;
    rec.continuous = true;
    rec.onresult = (e) => {
      const said = Array.from(e.results).slice(e.resultIndex)
        .filter((r) => r.isFinal).map((r) => r[0].transcript.trim()).filter(Boolean).join(' ');
      if (said) append(said);
    };
    rec.onend = () => { setListening(false); stopRecording(); };
    rec.onerror = () => { setListening(false); stopRecording(); };
    recRef.current = rec;
    try { rec.start(); setListening(true); } catch { setListening(false); return; }
    if (onRecording) startRecording();
  };

  const startRecording = async () => {
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
    } catch { /* mic refused or busy: the words still arrive, only the clip is skipped */ }
  };

  const stopRecording = () => {
    const recorder = mediaRef.current;
    mediaRef.current = null;
    if (recorder && recorder.state !== 'inactive') { try { recorder.stop(); } catch { /* noop */ } }
  };

  const supported = Boolean(recognitionClass());
  const textarea = (
    <textarea ref={ref} value={value} defaultValue={defaultValue} onChange={onChange}
              style={supported ? { ...style, paddingRight: '40px' } : style} {...rest} />
  );
  if (!supported) return textarea;

  return (
    <div style={{ position: 'relative' }}>
      {textarea}
      <button type="button" onClick={start}
              title={listening ? 'Stop listening' : 'Speak instead of typing'}
              aria-label={listening ? 'Stop listening' : 'Speak instead of typing'}
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
