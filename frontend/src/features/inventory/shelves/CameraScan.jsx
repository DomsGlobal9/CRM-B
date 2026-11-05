import { useEffect, useRef, useState } from 'react';
import { Modal } from '../inventoryForm';

/** The phone's camera reading a shelf QR (the browser's own BarcodeDetector). */
export function CameraScan({ onCode, onClose }) {
  const videoRef = useRef(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let stream; let timer; let stopped = false;
    const detector = new window.BarcodeDetector({ formats: ['qr_code', 'code_128', 'ean_13'] });
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      .then((s) => {
        stream = s;
        if (stopped || !videoRef.current) return;
        videoRef.current.srcObject = s;
        videoRef.current.play().catch(() => {});
        timer = setInterval(async () => {
          try {
            const found = await detector.detect(videoRef.current);
            if (found?.[0]?.rawValue) { clearInterval(timer); onCode(found[0].rawValue); }
          } catch { /* the next frame */ }
        }, 300);
      })
      .catch(() => setError('The camera could not be opened. Allow it in the browser, or type the address.'));
    return () => { stopped = true; clearInterval(timer); stream?.getTracks().forEach((t) => t.stop()); };
  }, [onCode]);
  return (
    <Modal title="Scan a shelf label" onClose={onClose} width="440px">
      {error ? <div className="sh-error">{error}</div> : <video ref={videoRef} className="sh-camera" muted playsInline />}
      <p className="sh-muted">Point the camera at the QR code on the shelf.</p>
    </Modal>
  );
}
