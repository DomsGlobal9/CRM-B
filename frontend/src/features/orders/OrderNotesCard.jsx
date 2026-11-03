import React, { useState, useRef } from 'react';
import { FileText } from 'lucide-react';
import { voiceNoteList } from '../../components/ui/voiceNotes';
import { api } from '../../services/api';
import useAutosave from '../../hooks/useAutosave';
import { IconTile } from '../../components/ui/Atelier';
import { VoiceRecorder, VoiceNotePlayer } from '../../components/ui/VoiceTextarea';

/**
 * The order's special instructions, where the boutique can edit the order.
 * Saved on blur and every minute like the rest of the product, through the
 * PATCH the master's checklist already uses. Keyed by order at the call site,
 * so a different order starts from its own text.
 */
export function OrderNotesCard({ order, canEdit, onSaved }) {
  const [text, setText] = useState(order.special_instructions || '');
  const [state, setState] = useState('idle');
  const savedRef = useRef(order.special_instructions || '');
  // Up to ten voice notes: each Send adds one, each Delete takes that one
  // away; the server stamps who sent a new one and when.
  const [voiceNotes, setVoiceNotes] = useState(() => voiceNoteList(order.instructions_voice_notes,
    order.instructions_voice_note
      ? { url: order.instructions_voice_note, by: order.instructions_voice_note_by || '', at: order.instructions_voice_note_at || null }
      : null));
  const saveVoiceNotes = async (next) => {
    const updated = await api.updateOrder(order.id, { instructions_voice_notes: next.map(n => ({ url: n.url })) });
    setVoiceNotes(voiceNoteList(updated?.instructions_voice_notes));
    if (onSaved) onSaved();
  };
  const sendVoice = async (blob) => {
    const url = await api.uploadVoiceNote(blob);
    await saveVoiceNotes([...voiceNotes, { url }]);
  };
  const deleteVoice = (index) => saveVoiceNotes(voiceNotes.filter((_, i) => i !== index));

  const save = async () => {
    const value = text.trim();
    if (value === savedRef.current) return;
    setState('saving');
    try {
      await api.updateOrder(order.id, { special_instructions: value });
      savedRef.current = value;
      setState('saved');
      if (onSaved) onSaved();
    } catch (err) {
      setState('error');
      throw err;
    }
  };
  useAutosave({ getSnapshot: () => (canEdit ? text.trim() : null), save, enabled: canEdit });

  if (!canEdit && !text) return null;
  return (
    <section className="at-section od-notes">
      <div className="od-section-head">
        <IconTile icon={FileText} tone="neutral" size={40} iconSize={18} />
        <div className="od-section-title od-section-title--stack">
          <h3>Special instructions</h3>
          <span className="od-section-sub">What the workroom should know about this order.</span>
        </div>
      </div>
      {canEdit ? (
        <>
          {/* A plain box: the recorder below is this note's voice input. */}
          <textarea className="form-control od-notes-input" rows={4} maxLength={500} value={text}
                    placeholder="Anything the workroom should know about this order…"
                    onChange={(e) => { setText(e.target.value); setState('idle'); }}
                    onBlur={() => save().catch(() => {})} />
          <VoiceRecorder notes={voiceNotes} onSend={sendVoice} onDelete={deleteVoice} />
          <div className="od-notes-foot">
            <span className={state === 'error' ? 'od-error' : 'od-hint'}>
              {state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved' : state === 'error' ? 'Could not save, will retry' : 'Saves on its own'}
            </span>
            <span className="od-hint">{text.length}/500</span>
          </div>
        </>
      ) : (
        <>
          <p className="od-notes-text">{text}</p>
          {voiceNotes.map((note, index) => (
            <React.Fragment key={`${note.url}:${index}`}>
              <VoiceNotePlayer src={note.url} />
              <div className="od-hint" style={{ marginTop: '4px' }}>
                Voice note from <strong>{note.by || 'someone'}</strong>
                {note.at ? ` · ${new Date(note.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}` : ''}
              </div>
            </React.Fragment>
          ))}
        </>
      )}
    </section>
  );
}
