import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowRight, Search, X as CloseIcon, Upload as UploadIcon, Camera as CameraIcon,
  Lightbulb as LightbulbIcon, CheckCircle2 as CheckIcon,
} from 'lucide-react';
import { imageFilesError } from '../../services/validate';

/**
 * The atelier design layer: the handful of shapes every workspace screen is
 * built from, so a stat reads the same on Orders as it does on Payroll.
 *
 *   PageHeader   what screen am I on, and what can I do here
 *   StatCard     one number, tinted by what kind of number it is
 *   SectionCard  a titled group with an optional "View all" way out
 *   Chips        one-of-many filter, each with its count
 *   AvatarInitials, IconTile, ProgressBar, SearchBox, Segmented
 *
 * Presentation only. Nothing here fetches, decides or stores.
 */



export function IconTile({ icon: Icon, tone = 'neutral', size = 44, iconSize = 20, className = '' }) {
  return (
    <span className={`at-tile at-tile--${tone} ${className}`} style={{ width: size, height: size }}>
      {Icon && <Icon size={iconSize} />}
    </span>
  );
}

export function StatCard({ icon, label, value, sub, tone = 'neutral', onClick, trailing }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`at-stat at-stat--${tone}${onClick ? ' at-stat--tap' : ''}`}
    >
      {icon && <IconTile icon={icon} tone={tone} />}
      <span className="at-stat-body">
        <span className="at-stat-label">{label}</span>
        <span className="at-stat-value">{value}</span>
        {sub != null && sub !== '' && <span className="at-stat-sub">{sub}</span>}
      </span>
      {trailing && <span className="at-stat-trailing">{trailing}</span>}
    </Tag>
  );
}

export function SectionCard({ icon, tone = 'neutral', title, subtitle, action, actionLabel, children, className = '', style }) {
  return (
    <section className={`at-section ${className}`} style={style}>
      {(title || action) && (
        <header className="at-section-head">
          <div className="at-section-heading">
            {icon && <IconTile icon={icon} tone={tone} size={38} iconSize={18} />}
            <div>
              <div className="at-section-title">{title}</div>
              {subtitle && <div className="at-section-sub">{subtitle}</div>}
            </div>
          </div>
          {action && (
            <button type="button" className="at-link" onClick={action}>
              {actionLabel || 'View all'} <ArrowRight size={14} />
            </button>
          )}
        </header>
      )}
      {children}
    </section>
  );
}

export function Chips({ options, value, onChange }) {
  return (
    <div className="at-chips" role="group">
      {options.map(({ key, label, count }) => (
        <button
          key={key}
          type="button"
          className={`at-chip${value === key ? ' at-chip--active' : ''}`}
          aria-pressed={value === key}
          onClick={() => onChange(key)}
        >
          {label}
          {count != null && <span className="at-chip-count">{count}</span>}
        </button>
      ))}
    </div>
  );
}

const AVATAR_TONES = ['green', 'amber', 'violet', 'blue', 'rose'];

export function AvatarInitials({ name, size = 40, tone }) {
  const initials = String(name || '?')
    .split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
  const hue = tone || AVATAR_TONES[[...String(name || '')].reduce((n, c) => n + c.charCodeAt(0), 0) % AVATAR_TONES.length];
  return (
    <span className={`at-avatar at-tile--${hue}`} style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }} aria-hidden="true">
      {initials}
    </span>
  );
}

export function ProgressBar({ pct, tone = 'green' }) {
  const width = Math.max(0, Math.min(100, Number(pct) || 0));
  return (
    <span className="at-progress" role="progressbar" aria-valuenow={width} aria-valuemin={0} aria-valuemax={100}>
      <i className={`at-progress-fill at-progress-fill--${tone}`} style={{ width: `${width}%` }} />
    </span>
  );
}

export function SearchBox({ value, onChange, placeholder, style }) {
  return (
    <label className="at-search" style={style}>
      <Search size={15} />
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </label>
  );
}

export function Segmented({ options, value, onChange, ariaLabel }) {
  return (
    <div className="at-seg" role="group" aria-label={ariaLabel}>
      {options.map(({ key, label, icon: Icon }) => (
        <button key={key} type="button" aria-pressed={value === key} onClick={() => onChange(key)}>
          {Icon && <Icon size={14} />}{label}
        </button>
      ))}
    </div>
  );
}

export function PageHeader({ icon: Icon, tone = 'neutral', title, subtitle, actions, aside, meta }) {
  return (
    <header className="at-page-head">
      <div className="at-page-head-left">
        {Icon && <span className={`at-page-icon at-tile at-tile--${tone}`}><Icon size={26} strokeWidth={1.6} /></span>}
        <div className="at-page-head-text">
          <h1 className="at-page-title">{title}</h1>
          {subtitle && <p className="at-page-sub">{subtitle}</p>}
          {meta && <div className="at-page-meta">{meta}</div>}
        </div>
      </div>
      <div className="at-page-head-right">
        {aside && <div className="at-page-aside">{aside}</div>}
        {actions && <div className="at-page-actions">{actions}</div>}
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Dialogs and forms                                                   */
/* ------------------------------------------------------------------ */

/**
 * A dialog with the same anatomy everywhere: a round icon, a serif title, a
 * one-line purpose, a close button; a scrolling body; a footer with the
 * actions. `width` is the card's maximum; on a phone it becomes a sheet.
 */
export function FormModal({ icon: Icon, tone = 'green', title, subtitle, onClose, children, footer, width = '640px', zIndex = 1200, bodyClassName = '' }) {
  return (
    <div className="at-modal-overlay" style={{ zIndex }} onClick={onClose}>
      <div className="at-modal" style={{ maxWidth: width }} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}
           onClick={(e) => e.stopPropagation()}>
        <header className="at-modal-head">
          {Icon && <span className={`at-modal-icon at-tile at-tile--${tone}`}><Icon size={26} strokeWidth={1.6} /></span>}
          <div className="at-modal-heading">
            <h3 className="at-modal-title">{title}</h3>
            {subtitle && <p className="at-modal-sub">{subtitle}</p>}
          </div>
          {onClose && (
            <button type="button" className="at-modal-close" onClick={onClose} aria-label="Close">
              <CloseIcon size={18} />
            </button>
          )}
        </header>
        <div className={`at-modal-body ${bodyClassName}`}>{children}</div>
        {footer && <footer className="at-modal-foot">{footer}</footer>}
      </div>
    </div>
  );
}

/** A label, the control, and the small print under it. `icon` puts a tinted
 *  box on the left of the control, the way the forms read. */
export function Field({ label, required, optional, hint, icon: Icon, children, htmlFor, style, className = '' }) {
  return (
    <div className={`at-field ${className}`} style={style}>
      {label && (
        <label className="at-field-label" htmlFor={htmlFor}>
          {label}
          {required && <span className="at-field-req" aria-hidden="true"> *</span>}
          {optional && <span className="at-field-opt"> (Optional)</span>}
        </label>
      )}
      <div className={`at-field-control${Icon ? ' at-field-control--icon' : ''}`}>
        {Icon && <span className="at-field-icon"><Icon size={17} /></span>}
        {children}
      </div>
      {hint && <div className="at-field-hint">{hint}</div>}
    </div>
  );
}

/**
 * The live camera behind every "Take photo": getUserMedia into a <video>, one
 * frame onto a canvas, out as a JPEG File through `onCapture`. The same path
 * the garment part picker takes, and for the same reason -- a `capture`
 * input is honoured by phones only; on a laptop it is just the file dialog,
 * which is exactly what a boutique saw when it pressed Take photo. Where the
 * camera cannot run (no permission, no camera, plain HTTP) `onUnavailable`
 * fires and the caller falls back to its capture input, so a phone still gets
 * its native camera and nothing is worse than before.
 *
 * Portalled to <body>: it is position:fixed, and a modal ancestor with a
 * transform would otherwise trap it inside the modal's box.
 */
// Why the camera would not open, in words the counter can act on. The
// browser's own names (NotAllowedError, NotFoundError...) mean nothing to a
// boutique, and a silent fall-through to the file dialog looked like the
// button was simply broken.
const cameraProblem = (err, siteState) => {
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    return 'The camera only works on a secure (https) address or on localhost. Open the app over https to use it.';
  }
  switch (err?.name) {
    case 'NotAllowedError': case 'PermissionDeniedError': case 'SecurityError':
      // The same error name covers two different situations, and the fix is
      // different for each. A site-level block shows a camera icon in the
      // address bar to undo it. A system-level block (Windows privacy
      // settings, or a device policy) shows nothing in the browser at all --
      // the icon the first message points at simply is not there.
      if (siteState === 'denied') {
        return 'Camera access is blocked for this site, so the browser will not ask again by itself. '
          + 'Click the camera (or lock) icon at the right end of the address bar, choose "Always allow", '
          + 'then press Reload page below.';
      }
      return 'The browser itself is not allowed to use the camera, so no permission bar or icon appears. '
        + 'On Windows: Settings › Privacy & security › Camera → turn on "Camera access" and '
        + '"Let desktop apps access your camera" (your browser is in that list). On a Mac: System Settings › '
        + 'Privacy & Security › Camera → allow the browser. Then press Reload page below.';
    case 'NotFoundError': case 'DevicesNotFoundError':
      return 'No camera was found on this device.';
    case 'NotReadableError': case 'TrackStartError':
      return 'The camera is in use by another app. Close it and try again.';
    default:
      return 'The camera could not be opened.';
  }
};

// One camera request at a time, shared by whoever asks while it is pending.
// React's StrictMode mounts an effect twice in development, and two back-to-
// back getUserMedia calls made the browser's "Allow camera?" bar appear for
// the first and vanish when the second replaced it -- the person never got to
// answer. The rear camera where there is one; a laptop webcam that refuses
// the facingMode hint gets a second, unconstrained ask before it counts as
// unavailable.
let cameraRequest = null;
const acquireCamera = () => {
  if (!cameraRequest) {
    cameraRequest = navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .catch((first) => (first?.name === 'NotAllowedError' || first?.name === 'PermissionDeniedError'
        ? Promise.reject(first)
        : navigator.mediaDevices.getUserMedia({ video: true, audio: false })))
      .finally(() => { cameraRequest = null; });
  }
  return cameraRequest;
};

export function CameraCapture({ onCapture, onClose, onUnavailable, label = 'Capture' }) {
  const [stream, setStream] = useState(null);
  const [problem, setProblem] = useState(null);
  const [blocked, setBlocked] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const videoRef = useRef(null);
  useEffect(() => {
    let live = null;
    let cancelled = false;
    setProblem(null);
    setBlocked(false);
    if (!navigator.mediaDevices?.getUserMedia) { setProblem(cameraProblem(null)); return undefined; }
    acquireCamera()
      // A mount that was cancelled before the answer leaves the stream to the
      // mount that replaced it (StrictMode's second run) rather than stopping
      // it under that one's feet; a stream nobody claims is stopped when its
      // last claimant unmounts.
      .then((s) => { if (cancelled) return; live = s; setStream(s); })
      .catch(async (err) => {
        if (cancelled) return;
        // The bar was closed without an answer (a click elsewhere, Esc): that
        // is not a block, just an unanswered question. Ask again.
        if (/dismiss/i.test(err?.message || '')) {
          setProblem('The camera request was closed before it was answered. Press Try again and choose Allow when the browser asks.');
          setBlocked(false);
          return;
        }
        // Which kind of refusal: the Permissions API knows whether THIS SITE
        // is blocked; if it is not, the block sits above the browser.
        let siteState = null;
        try { siteState = (await navigator.permissions.query({ name: 'camera' })).state; } catch { /* not supported */ }
        if (cancelled) return;
        const detail = err?.name ? ` (${err.name}${err.message ? `: ${err.message}` : ''})` : '';
        setProblem(cameraProblem(err, siteState) + detail);
        setBlocked(['NotAllowedError', 'PermissionDeniedError', 'SecurityError'].includes(err?.name));
      });
    // Every track stopped on the way out, or the camera light stays on.
    return () => { cancelled = true; live?.getTracks().forEach((t) => t.stop()); };
  }, [attempt]);  // eslint-disable-line react-hooks/exhaustive-deps

  const capture = async () => {
    const video = videoRef.current;
    if (!video?.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    const blob = await new Promise((done) => canvas.toBlob(done, 'image/jpeg', 0.92));
    if (blob) onCapture(new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' }));
    onClose();
  };

  if (problem) {
    // Say why, and offer the two ways on: ask again (after the person has
    // allowed the camera), or hand over to the file picker -- which on a
    // phone is its native camera, and on a laptop the folder.
    return createPortal(
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', zIndex: 20000,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '28px' }}
           onClick={onClose}>
        <div style={{ background: 'var(--surface-color, #fff)', color: 'var(--text-primary, #111)', borderRadius: '12px',
                      padding: '20px', maxWidth: '420px', width: '100%', display: 'flex', flexDirection: 'column', gap: '12px' }}
             onClick={(e) => e.stopPropagation()}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700 }}>
            <CameraIcon size={16} /> Camera not available
          </div>
          <div style={{ fontSize: '13px', lineHeight: 1.5, color: 'var(--text-secondary, #555)' }}>{problem}</div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button type="button" className="btn-secondary at-btn-sm" onClick={onClose}>Cancel</button>
            <button type="button" className="btn-secondary at-btn-sm" onClick={() => { onClose(); onUnavailable?.(); }}>
              <UploadIcon size={14} /> Choose a file instead
            </button>
            {blocked ? (
              <button type="button" className="btn-primary at-btn-sm" onClick={() => window.location.reload()}>
                <CameraIcon size={14} /> Reload page
              </button>
            ) : (
              <button type="button" className="btn-primary at-btn-sm" onClick={() => setAttempt((n) => n + 1)}>
                <CameraIcon size={14} /> Try again
              </button>
            )}
          </div>
        </div>
      </div>,
      document.body,
    );
  }
  if (!stream) {
    // Asking. The browser's permission bar is easy to miss, so say what is
    // being waited for rather than showing nothing until it is answered. No
    // close on the backdrop here: a click while the bar is up (often at the
    // bar itself) must not withdraw the question.
    return createPortal(
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', zIndex: 20000,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '28px' }}>
        <div style={{ background: 'var(--surface-color, #fff)', color: 'var(--text-primary, #111)', borderRadius: '12px',
                      padding: '20px', maxWidth: '420px', width: '100%', display: 'flex', flexDirection: 'column', gap: '12px' }}
             onClick={(e) => e.stopPropagation()}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700 }}>
            <CameraIcon size={16} /> Opening camera…
          </div>
          <div style={{ fontSize: '13px', lineHeight: 1.5, color: 'var(--text-secondary, #555)' }}>
            If the browser asks, choose <strong>Allow</strong> so the camera can be used here.
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="button" className="btn-secondary at-btn-sm" onClick={onClose}>Cancel</button>
          </div>
        </div>
      </div>,
      document.body,
    );
  }
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', zIndex: 20000,
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  justifyContent: 'center', gap: '14px', padding: '28px' }}
         onClick={onClose}>
      <video autoPlay playsInline muted
             ref={(el) => { videoRef.current = el; if (el && el.srcObject !== stream) el.srcObject = stream; }}
             onClick={(e) => e.stopPropagation()}
             style={{ maxWidth: '100%', maxHeight: '70vh', borderRadius: '8px', background: '#000' }} />
      <div style={{ display: 'flex', gap: '10px' }} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="btn-primary" style={{ padding: '6px 16px', fontSize: '12px' }} onClick={capture}>
          <CameraIcon size={13} /> {label}
        </button>
        <button type="button" className="btn-secondary" style={{ padding: '6px 14px', fontSize: '12px' }} onClick={onClose}>
          <CloseIcon size={13} /> Cancel
        </button>
      </div>
    </div>,
    document.body,
  );
}

/**
 * The one way to add a photo: a single button over a plain file input.
 *
 * Pass `onCamera` where the screen has its own live camera (the garment part
 * picker), or `camera` to open the shared live camera (CameraCapture), with the
 * `capture` input as its fallback:
 * either way the click asks "Take a photo" or "Choose from device". A phone
 * opens its camera straight away for the first; a laptop with a webcam gets
 * the browser's camera dialog. Without either prop it is one plain button.
 */
export function AddPhotoButton({ onFiles, multiple = false, label = 'Add photo', onCamera, camera = false,
                                 className = 'btn-secondary at-btn-sm',
                                 style, disabled = false, icon: Icon = CameraIcon, iconSize = 14 }) {
  const ref = useRef(null);
  const camRef = useRef(null);
  const [open, setOpen] = useState(false);
  const pick = (e) => {
    const files = [...(e.target.files || [])];
    e.target.value = '';        // so the same file can be picked twice
    if (!files.length) return;
    // Every photo picker in the product goes through here, so one check keeps
    // renamed .exe files and 40 MB scans out of every upload at once.
    const problem = imageFilesError(files);
    if (problem) { window.alert(problem); return; }
    onFiles(multiple ? files : files.slice(0, 1));
  };
  const input = <input ref={ref} type="file" accept="image/*" multiple={multiple} hidden onChange={pick} />;
  const [camOpen, setCamOpen] = useState(false);
  const camInput = camera && !onCamera
    ? (
      <>
        <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={pick} />
        {camOpen && (
          <CameraCapture onCapture={(file) => onFiles([file])} onClose={() => setCamOpen(false)}
                         onUnavailable={() => { setCamOpen(false); camRef.current?.click(); }} />
        )}
      </>
    )
    : null;
  const takePhoto = onCamera || (() => setCamOpen(true));
  if (!onCamera && !camera) {
    return (
      <>
        <button type="button" className={className} style={style} disabled={disabled} onClick={() => ref.current?.click()}>
          <Icon size={iconSize} /> {label}
        </button>
        {input}
      </>
    );
  }
  return (
    <span className="at-menu-anchor" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}>
      <button type="button" className={className} style={style} disabled={disabled}
              aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Icon size={iconSize} /> {label}
      </button>
      {open && (
        <span className="at-menu" role="menu">
          <button type="button" role="menuitem" onClick={() => { setOpen(false); takePhoto(); }}>
            <CameraIcon size={14} /> Take a photo
          </button>
          <button type="button" role="menuitem" onClick={() => { setOpen(false); ref.current?.click(); }}>
            <UploadIcon size={14} /> Choose from device
          </button>
        </span>
      )}
      {input}
      {camInput}
    </span>
  );
}

/**
 * A "Take photo" button on its own, for the forms that keep a plain
 * <input type="file"> as their way in: the same `onFiles` the input feeds,
 * reached through the device camera instead of the file dialog.
 */
export function CameraButton({ onFiles, multiple = false, label = 'Take photo', className = 'btn-secondary at-btn-sm', style, disabled = false }) {
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} style={style} disabled={disabled} onClick={() => setOpen(true)}>
        <CameraIcon size={14} /> {label}
      </button>
      {open && (
        <CameraCapture onCapture={(file) => onFiles([file])} onClose={() => setOpen(false)}
                       onUnavailable={() => { setOpen(false); ref.current?.click(); }} />
      )}
      <input ref={ref} type="file" accept="image/*" capture="environment" multiple={multiple} hidden
             onChange={(e) => { const files = [...(e.target.files || [])]; e.target.value = ''; if (files.length) onFiles(multiple ? files : files.slice(0, 1)); }} />
    </>
  );
}

/**
 * A drop area for files. Dropped or chosen files reach `onFiles` as an array;
 * the input resets itself so the same file can be picked twice. `camera` adds
 * a "Take photo" button beside "Choose file" that opens the device camera
 * (a `capture` input), for the counter that photographs rather than browses.
 * No icon above the title: the upload glyph already sits on the button, and
 * twice on one card read as two controls.
 */
export function Dropzone({ onFiles, accept = 'image/*', multiple = false, title, subtitle, chooseLabel = 'Choose file', hint, compact = false, camera = false }) {
  const [over, setOver] = useState(false);
  const [problem, setProblem] = useState('');
  const [camOpen, setCamOpen] = useState(false);
  const fileRef = useRef(null);
  const camRef = useRef(null);
  const take = (list) => {
    const files = [...(list || [])].filter(Boolean);
    if (!files.length) return;
    // A drop ignores `accept`, so the image rule is checked here for every
    // picker that asks for images; document pickers (PDF) keep their own rules.
    const error = accept === 'image/*' ? imageFilesError(files) : '';
    setProblem(error);
    if (error) return;
    onFiles(multiple ? files : files.slice(0, 1));
  };
  return (
    <div
      className={`at-drop${over ? ' at-drop--over' : ''}${compact ? ' at-drop--compact' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files); }}
    >
      <div className="at-drop-title">{title || (multiple ? 'Drag & drop photos here' : 'Drag & drop a file here')}</div>
      {subtitle !== null && <div className="at-drop-sub">{subtitle || 'or choose from your device'}</div>}
      <div className="at-drop-actions">
        <button type="button" className="btn-secondary at-btn-sm" onClick={() => fileRef.current?.click()}>
          <UploadIcon size={14} /> {chooseLabel}
        </button>
        {camera && (
          <button type="button" className="btn-secondary at-btn-sm" onClick={() => setCamOpen(true)}>
            <CameraIcon size={14} /> Take photo
          </button>
        )}
      </div>
      {hint && <div className="at-drop-hint">{hint}</div>}
      {problem && <div className="at-drop-hint" role="alert" style={{ color: '#dc2626' }}>{problem}</div>}
      <input ref={fileRef} type="file" accept={accept} multiple={multiple} hidden
             onChange={(e) => { take(e.target.files); e.target.value = ''; }} />
      {camera && (
        <input ref={camRef} type="file" accept="image/*" capture="environment" multiple={multiple} hidden
               onChange={(e) => { take(e.target.files); e.target.value = ''; }} />
      )}
      {camera && camOpen && (
        <CameraCapture onCapture={(file) => take([file])} onClose={() => setCamOpen(false)}
                       onUnavailable={() => { setCamOpen(false); camRef.current?.click(); }} />
      )}
    </div>
  );
}

/** One chosen photograph, with its remove button and an optional corner label. */
export function PhotoTile({ src, alt = '', onRemove, label, size = 96 }) {
  return (
    <span className="at-photo" style={{ width: size, height: Math.round(size * 1.25) }}>
      <img src={src} alt={alt} />
      {onRemove && (
        <button type="button" className="at-photo-remove" onClick={onRemove} aria-label="Remove photo">
          <CloseIcon size={12} />
        </button>
      )}
      {label && <span className="at-photo-label">{label}</span>}
    </span>
  );
}

/** A quiet note beside or below a form: a tip, a rule, a checklist. */
export function InfoNote({ icon: Icon = LightbulbIcon, tone = 'amber', title, children, items, onDismiss, style }) {
  return (
    <div className={`at-note at-note--${tone}`} style={style}>
      <span className="at-note-icon"><Icon size={20} strokeWidth={1.7} /></span>
      <div className="at-note-body">
        {title && <div className="at-note-title">{title}</div>}
        {children && <div className="at-note-text">{children}</div>}
        {items && (
          <ul className="at-note-list">
            {items.map((item) => <li key={item}><CheckIcon size={14} /> {item}</li>)}
          </ul>
        )}
      </div>
      {onDismiss && (
        <button type="button" className="at-modal-close" style={{ width: 28, height: 28 }} onClick={onDismiss} aria-label="Dismiss">
          <CloseIcon size={14} />
        </button>
      )}
    </div>
  );
}

/** A titled group inside a dialog: icon, serif title, gloss, then the fields. */
export function FormSection({ icon: Icon, tone = 'green', title, subtitle, aside, children, className = '', style }) {
  return (
    <section className={`at-form-section ${className}`} style={style}>
      <header className="at-form-section-head">
        {Icon && <IconTile icon={Icon} tone={tone} size={40} iconSize={18} />}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="at-section-title">{title}</div>
          {subtitle && <div className="at-section-sub">{subtitle}</div>}
        </div>
        {aside && <div className="at-form-section-aside">{aside}</div>}
      </header>
      {children}
    </section>
  );
}
