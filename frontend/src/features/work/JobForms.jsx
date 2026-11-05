import { useEffect, useMemo, useRef, useState } from 'react';
import { Image as ImageIcon, CheckCircle2, X as CloseIcon } from 'lucide-react';
import { imageFilesError } from '../../utils/validate';
import { useLanguage } from '../../i18n/LanguageContext.jsx';
import { VoiceRecorder } from '../../components/ui/VoiceTextarea';
import { PhotoTile, CameraButton } from '../../components/ui/Atelier';

/** The forms at the foot of a job: start, submit, add a note, and check. */

const MAX_PHOTOS = 5;

/* The sticky row at the foot of the sheet: the one thing to do, and why it can't be done yet. */
// Every job screen's buttons: compact and side by side (wk-actions--pair,
// work.css) -- the secondary choice on the left, the main one on the right;
// a lone button sits on the right on a computer and fills the row on a phone.
function ActionBar({ error, children, className = 'wk-actions--pair' }) {
  return (
    <div className={`wk-actions${className ? ` ${className}` : ''}`}>
      {error && <div className="wk-error" role="alert">{error}</div>}
      {children}
    </div>
  );
}

/* The voice note proper, the same as the stage review's: recorded on its own
   (nothing is transcribed into the box), heard back, then Send saves it on the
   stage under the sender's name -- with whatever text is in the box -- or
   Delete throws it away. */
function StageVoiceNote({ stage, busy, text, save, onRecordingChange, onTextSent }) {
  const { t } = useLanguage();
  // The job stays open (keepOpen): photos picked and not yet sent are kept,
  // and the typed note, sent along with the recording, leaves the box.
  return (
    <VoiceRecorder
      disabled={busy}
      onRecordingChange={onRecordingChange}
      sent={stage.voice_note ? { url: stage.voice_note, by: stage.voice_note_by, at: stage.voice_note_at } : null}
      onSend={async (blob) => {
        await save(stage.status, text, [], blob, t('workPage.voiceNoteSent', 'Voice note sent.'), false, true);
        onTextSent?.();
      }}
      onDelete={async () => {
        await save(stage.status, text, [], null, t('workPage.voiceNoteDeleted', 'Voice note deleted.'), true, true);
        onTextSent?.();
      }}
    />
  );
}

/* Photos + optional note, then "Send for checking" (work that is checked:
   a worker's, or a Master's own) or "Mark done" (everything else). */
export function SubmitForm({ stage, busy, error, submits, toLeads, save }) {
  const { t } = useLanguage();
  const [photos, setPhotos] = useState([]); // File[]
  const [text, setText] = useState('');
  const [recording, setRecording] = useState(false);
  const [problem, setProblem] = useState('');
  const galleryRef = useRef(null);

  const addFiles = (files) => {
    const all = [...photos, ...files];
    const err = imageFilesError(all, { max: MAX_PHOTOS });
    setProblem(err);
    if (!err) setPhotos(all);
  };

  const needPhoto = submits && photos.length === 0;
  const label = !submits ? t('workPage.markDone', 'Mark done')
    : stage.verification_note ? t('workPage.fixAndSend', 'Fix & send again') : t('workPage.sendForChecking', 'Send for checking');

  const submit = () => {
    if (recording) { setProblem(t('workPage.stopRecording', 'Stop the recording first.')); return; }
    save('COMPLETED', text, photos, null,
      !submits ? t('workPage.doneToast', 'Marked done.')
        : toLeads ? t('workPage.sentToLeadsToast', 'Sent to the Owner or Designer for checking.')
        : t('workPage.sentToast', 'Sent for checking.'));
  };

  return (
    <>
      <div className="wk-form">
        <div className="wk-pickers">
          <CameraButton onFiles={addFiles} className="btn-secondary" label={t('workPage.takePhoto', 'Take photo')} disabled={busy || photos.length >= MAX_PHOTOS} />
          <button type="button" className="btn-secondary" disabled={busy || photos.length >= MAX_PHOTOS} onClick={() => galleryRef.current?.click()}>
            <ImageIcon size={18} /> {t('workPage.addFromGallery', 'Add from gallery')}
          </button>
          <input ref={galleryRef} type="file" accept="image/*" multiple hidden
                 onChange={(e) => { const files = [...(e.target.files || [])]; e.target.value = ''; if (files.length) addFiles(files); }} />
        </div>
        {photos.length > 0 && (
          <div className="wk-photos wk-tiles">
            {photos.map((file, i) => <FilePreview key={`${file.name}-${file.lastModified}-${i}`} file={file} onRemove={() => setPhotos(photos.filter((_, n) => n !== i))} />)}
          </div>
        )}
        {problem && <div className="wk-error" role="alert">{problem}</div>}
        <div className="wk-note-box">
          <textarea className="form-control" rows={2} value={text} onChange={(e) => setText(e.target.value)}
                    placeholder={t('workPage.notePlaceholder', 'Anything the master should know (optional)')} />
          <StageVoiceNote stage={stage} busy={busy} text={text} save={save} onRecordingChange={setRecording} onTextSent={() => setText('')} />
        </div>
      </div>
      <ActionBar error={error}>
        {needPhoto && <div className="wk-hint">{t('workPage.addPhotoFirst', 'Add a photo of the finished work first')}</div>}
        <button type="button" className="btn-primary" disabled={busy || needPhoto || recording} onClick={submit}>
          <CheckCircle2 size={18} /> {busy ? t('workPage.saving', 'Saving…') : label}
        </button>
      </ActionBar>
    </>
  );
}

/* Not started yet: Start, and meanwhile a photo or a note to leave on the
   step (a question, the cloth as it came). A note keeps the status, as the
   server's note path does; Start carries whatever was typed or picked too. */
export function StartForm({ stage, busy, error, save }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [photos, setPhotos] = useState([]); // File[]
  const [text, setText] = useState('');
  const [recording, setRecording] = useState(false);
  const [problem, setProblem] = useState('');
  const galleryRef = useRef(null);

  const addFiles = (files) => {
    const all = [...photos, ...files];
    const err = imageFilesError(all, { max: MAX_PHOTOS });
    setProblem(err);
    if (!err) setPhotos(all);
  };
  const start = () => {
    if (recording) { setProblem(t('workPage.stopRecording', 'Stop the recording first.')); return; }
    save('IN_PROGRESS', text, photos, null, t('workPage.started', 'Started. Good luck!'));
  };

  return (
    <>
      {open && (
        <div className="wk-form">
          <div className="wk-pickers">
            <CameraButton onFiles={addFiles} className="btn-secondary" label={t('workPage.takePhoto', 'Take photo')} disabled={busy || photos.length >= MAX_PHOTOS} />
            <button type="button" className="btn-secondary" disabled={busy || photos.length >= MAX_PHOTOS} onClick={() => galleryRef.current?.click()}>
              <ImageIcon size={18} /> {t('workPage.addFromGallery', 'Add from gallery')}
            </button>
            <input ref={galleryRef} type="file" accept="image/*" multiple hidden
                   onChange={(e) => { const files = [...(e.target.files || [])]; e.target.value = ''; if (files.length) addFiles(files); }} />
          </div>
          {photos.length > 0 && (
            <div className="wk-photos wk-tiles">
              {photos.map((file, i) => <FilePreview key={`${file.name}-${file.lastModified}-${i}`} file={file} onRemove={() => setPhotos(photos.filter((_, n) => n !== i))} />)}
            </div>
          )}
          {problem && <div className="wk-error" role="alert">{problem}</div>}
          <div className="wk-note-box">
            <textarea className="form-control" rows={2} value={text} onChange={(e) => setText(e.target.value)} autoFocus
                      placeholder={t('workPage.notePlaceholder', 'Anything the master should know (optional)')} />
            <StageVoiceNote stage={stage} busy={busy} text={text} save={save} onRecordingChange={setRecording} onTextSent={() => setText('')} />
          </div>
        </div>
      )}
      <ActionBar error={error}>
        {!open ? (
          <button type="button" className="btn-secondary" disabled={busy} onClick={() => setOpen(true)}>
            <ImageIcon size={18} /> {t('workPage.addPhotoOrNote', 'Add photo or note')}
          </button>
        ) : (
          <button type="button" className="btn-secondary" disabled={busy || recording || !text.trim()}
                  title={text.trim() ? '' : t('workPage.writeNoteFirst', 'Write a note to save with the photos')}
                  onClick={() => save(stage.status, text, photos, null, t('workPage.noteSaved', 'Note saved.'))}>
            {busy ? t('workPage.saving', 'Saving…') : t('workPage.saveNote', 'Save note')}
          </button>
        )}
        <button type="button" className="btn-primary" disabled={busy || recording} onClick={start}>
          {t('workPage.start', 'Start')}
        </button>
      </ActionBar>
    </>
  );
}

/* A picked file as a tile. Revoked on unmount only, which under StrictMode's
   mount-cleanup-mount would kill a live URL, so the cleanup is skipped in dev
   (at most 5 small blobs, freed on page unload). */
function FilePreview({ file, onRemove }) {
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => { if (!import.meta.env.DEV) URL.revokeObjectURL(url); }, [url]);
  return <PhotoTile src={url} size={80} onRemove={onRemove} />;
}

/* Waiting for the master: a calm note and an optional extra note. */
export function NoteForm({ stage, busy, error, save }) {
  const { t } = useLanguage();
  const [openNote, setOpenNote] = useState(false);
  const [text, setText] = useState('');
  const [recording, setRecording] = useState(false);
  return (
    <>
      <div className="wk-form">
        <div className="wk-calm">{t('workPage.sentForChecking', 'Sent for checking. The master will look at it.')}</div>
        {openNote && (
          <div className="wk-note-box">
            <textarea className="form-control" rows={2} value={text} onChange={(e) => setText(e.target.value)}
                      placeholder={t('workPage.notePlaceholder', 'Anything the master should know (optional)')} autoFocus />
            <StageVoiceNote stage={stage} busy={busy} text={text} save={save} onRecordingChange={setRecording} onTextSent={() => setText('')} />
          </div>
        )}
      </div>
      <ActionBar error={error}>
        {!openNote
          ? <button type="button" className="btn-secondary" onClick={() => setOpenNote(true)}>{t('workPage.addNote', 'Add a note')}</button>
          : (
            <button type="button" className="btn-primary" disabled={busy || recording || !text.trim()}
                    onClick={() => save(stage.status, text, [], null, t('workPage.noteSaved', 'Note saved.'))}>
              {busy ? t('workPage.saving', 'Saving…') : t('workPage.saveNote', 'Save note')}
            </button>
          )}
      </ActionBar>
    </>
  );
}

/* Approve, or send back with a reason. */
export function CheckForm({ stage, busy, error, save }) {
  const { t } = useLanguage();
  const [sending, setSending] = useState(false);
  const [reason, setReason] = useState('');
  const [recording, setRecording] = useState(false);
  const boxRef = useRef(null);
  const who = stage.performed_by_name || stage.assigned_to_name || t('workPage.theWorker', 'the worker');
  // A voice note already sent on the stage counts as the reason.
  const ready = reason.trim().length > 0 || Boolean(stage.voice_note);

  useEffect(() => { if (sending) boxRef.current?.scrollIntoView({ block: 'nearest' }); }, [sending]);

  return (
    <>
      {sending && (
        <div className="wk-form" ref={boxRef}>
          <div className="wk-note-box">
            <textarea className="form-control" rows={3} value={reason} onChange={(e) => setReason(e.target.value)}
                      placeholder={t('workPage.sendBackReason', 'Say what needs to be redone')} autoFocus />
            <StageVoiceNote stage={stage} busy={busy} text={reason} save={save} onRecordingChange={setRecording} onTextSent={() => setReason('')} />
          </div>
        </div>
      )}
      {/* The check screen's two choices sit side by side (wk-actions--pair):
          Send back / Cancel on the left, Approve / Send back to … on the right. */}
      <ActionBar error={error} className="wk-actions--pair">
        {sending ? (
          <>
            {!ready && <div className="wk-hint">{t('workPage.reasonRequired', 'A reason is needed so the worker knows what to fix')}</div>}
            <button type="button" className="btn-primary" disabled={busy || recording || !ready}
                    onClick={() => save('IN_PROGRESS', reason.trim() || t('workPage.seeVoiceNote', 'See voice note'), [], null,
                      t('workPage.sentBackToast', 'Sent back to {who}.', { who }))}>
              {busy ? t('workPage.saving', 'Saving…') : t('workPage.sendBackTo', 'Send back to {who}', { who })}
            </button>
            <button type="button" className="btn-secondary" disabled={busy} onClick={() => setSending(false)}>
              <CloseIcon size={16} /> {t('workPage.cancel', 'Cancel')}
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn-primary" disabled={busy}
                    onClick={() => save('COMPLETED', '', [], null, t('workPage.approved', 'Approved.'))}>
              <CheckCircle2 size={18} /> {busy ? t('workPage.saving', 'Saving…') : t('workPage.approve', 'Approve')}
            </button>
            <button type="button" className="btn-secondary" disabled={busy} onClick={() => setSending(true)}>
              {t('workPage.sendBack', 'Send back')}
            </button>
          </>
        )}
      </ActionBar>
    </>
  );
}
