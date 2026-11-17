import { useEffect, useRef, useState } from 'react';
import styles from './BarcodeScanner.module.css';

// Lee un código de barras con la cámara trasera y devuelve el texto
// (`onDetected(code)`). La librería se carga recién al abrir: no pesa en el
// resto de la app. Necesita HTTPS (o localhost) para usar la cámara.
export default function BarcodeScanner({ onDetected, onClose }) {
  const video = useRef(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let controls = null;
    let done = false;
    (async () => {
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        if (done) return;
        const reader = new BrowserMultiFormatReader();
        controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: 'environment' } } },
          video.current,
          (result) => {
            if (!result || done) return;
            done = true;
            controls?.stop();
            onDetected(result.getText().trim());
          },
        );
        if (done) controls.stop();
      } catch (err) {
        const denied = err?.name === 'NotAllowedError';
        setError(denied ? 'No hay permiso para usar la cámara: habilitalo en el navegador.' : `No se pudo abrir la cámara (${err?.message ?? err}).`);
      }
    })();
    return () => { done = true; controls?.stop(); };
  }, [onDetected]);

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.panel} role="dialog" aria-modal="true" aria-label="Leer código de barras" onClick={(e) => e.stopPropagation()}>
        <div className={styles.head}>
          <h2>Leer código de barras</h2>
          <button type="button" className="btn btn-ghost" onClick={onClose} aria-label="Cerrar">×</button>
        </div>
        {error
          ? <p className={styles.error}>{error}</p>
          : <video ref={video} className={styles.video} muted playsInline />}
        <p className={styles.hint}>Apuntá la cámara al código de la etiqueta.</p>
      </div>
    </div>
  );
}
