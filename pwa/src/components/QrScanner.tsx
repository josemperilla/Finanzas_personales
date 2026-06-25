import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { quickEase, softSpring } from '../lib/motion';

export interface QrResult {
  rawText: string;
  merchant?: string;
  amount?: number;
  date?: string;
  isDian: boolean;
}

interface Props {
  onScanned: (result: QrResult) => void;
  onClose: () => void;
}

// Parse DIAN factura electrónica QR URL.
// documentKey format: NIT_PREFIJO_NRO_YYYYMMDD_MONTO_CUFE
function parseDian(url: string): Omit<QrResult, 'rawText'> {
  const isDian = url.includes('dian.gov.co');
  if (!isDian) return { isDian: false };
  try {
    const u = new URL(url);
    const key = u.searchParams.get('documentKey') ?? '';
    const parts = key.split('_');
    // parts[3] = date YYYYMMDD, parts[4] = amount in COP
    const dateRaw = parts[3] ?? '';
    const date = dateRaw.length === 8
      ? `${dateRaw.slice(0, 4)}-${dateRaw.slice(4, 6)}-${dateRaw.slice(6, 8)}`
      : undefined;
    const amount = Number(parts[4]);
    return { isDian: true, date, amount: isNaN(amount) ? undefined : amount };
  } catch {
    return { isDian: true };
  }
}

declare class BarcodeDetector {
  constructor(options?: { formats: string[] });
  detect(source: HTMLVideoElement | HTMLCanvasElement | ImageBitmap): Promise<{ rawValue: string }[]>;
  static getSupportedFormats(): Promise<string[]>;
}

export function QrScanner({ onScanned, onClose }: Props) {
  const videoRef  = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef    = useRef<number>(0);
  const [hasBarcodeDetector, setHasBarcodeDetector] = useState(false);
  const [cameraError, setCameraError] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [flashMsg, setFlashMsg] = useState<string | null>(null);

  useEffect(() => {
    setHasBarcodeDetector('BarcodeDetector' in window);
    return () => {
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  async function startCamera() {
    if (!('BarcodeDetector' in window)) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setScanning(true);
        scanLoop();
      }
    } catch {
      setCameraError(true);
    }
  }

  function scanLoop() {
    if (!videoRef.current) return;
    const detector = new BarcodeDetector({ formats: ['qr_code'] });
    const tick = async () => {
      try {
        if (videoRef.current && videoRef.current.readyState >= 2) {
          const results = await detector.detect(videoRef.current);
          if (results.length > 0) {
            const raw = results[0].rawValue;
            handleResult(raw);
            return; // stop loop after hit
          }
        }
      } catch { /* ignore */ }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }

  function handleResult(raw: string) {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    setScanning(false);
    setFlashMsg('QR detectado');
    const parsed = parseDian(raw);
    setTimeout(() => onScanned({ rawText: raw, ...parsed }), 600);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = async () => {
      URL.revokeObjectURL(url);
      if (!('BarcodeDetector' in window)) {
        // No BarcodeDetector: hand off the raw file url as text fallback
        onScanned({ rawText: '(imagen cargada — escaneo no disponible)', isDian: false });
        return;
      }
      try {
        const bmp = await createImageBitmap(img);
        const detector = new BarcodeDetector({ formats: ['qr_code'] });
        const results = await detector.detect(bmp);
        if (results.length > 0) {
          handleResult(results[0].rawValue);
        } else {
          setFlashMsg('No se encontró un código QR en la imagen');
        }
      } catch {
        setFlashMsg('Error al leer la imagen');
      }
    };
    img.src = url;
    e.target.value = '';
  }

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9990,
        background: 'rgba(15,23,42,0.7)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        padding: '0 0 env(safe-area-inset-bottom)',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={softSpring}
        style={{
          width: '100%', maxWidth: 480,
          background: 'var(--card)',
          borderRadius: '24px 24px 0 0',
          padding: '24px 20px 36px',
          display: 'flex', flexDirection: 'column', gap: 16,
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--text-lg)', color: 'var(--ink)' }}>
              Escanear factura
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)', marginTop: 2 }}>
              Código QR DIAN de facturas electrónicas
            </div>
          </div>
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 20, padding: 6 }}
          >
            ✕
          </motion.button>
        </div>

        {/* Camera viewfinder */}
        {hasBarcodeDetector && !cameraError && (
          <div style={{ position: 'relative', borderRadius: 16, overflow: 'hidden', background: '#000', aspectRatio: '1' }}>
            <video
              ref={videoRef}
              playsInline
              muted
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
            {/* Viewfinder overlay */}
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <div style={{
                width: '60%', aspectRatio: '1',
                border: '2px solid rgba(255,255,255,0.6)',
                borderRadius: 12,
                boxShadow: '0 0 0 9999px rgba(0,0,0,0.4)',
              }} />
            </div>
            {scanning && (
              <div style={{
                position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
                background: 'rgba(0,0,0,0.55)', borderRadius: 20, padding: '5px 14px',
                color: '#fff', fontSize: 12, fontFamily: 'var(--font-body)',
              }}>
                Apunta el QR de tu factura electrónica
              </div>
            )}
          </div>
        )}

        {/* Flash message */}
        <AnimatePresence>
          {flashMsg && (
            <motion.div
              initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              transition={quickEase}
              style={{
                textAlign: 'center', padding: '10px 16px',
                background: flashMsg.includes('detectado') ? 'var(--blue-50)' : '#fef2f2',
                borderRadius: 12, fontSize: 'var(--text-sm)',
                color: flashMsg.includes('detectado') ? 'var(--blue-700)' : '#b91c1c',
                fontFamily: 'var(--font-body)',
              }}
            >
              {flashMsg}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {hasBarcodeDetector && !cameraError && !scanning && (
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={startCamera}
              style={{
                height: 50, background: 'var(--blue-700)', border: 'none',
                borderRadius: 14, color: '#fff', fontSize: 'var(--text-base)',
                fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)',
              }}
            >
              Abrir cámara
            </motion.button>
          )}

          {/* File input fallback */}
          <label style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            height: 50, background: 'var(--surface)', border: '1.5px solid var(--line)',
            borderRadius: 14, color: 'var(--ink)', fontSize: 'var(--text-base)',
            fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font-body)', gap: 8,
          }}>
            <span>📁</span>
            <span>{hasBarcodeDetector ? 'Cargar imagen' : 'Seleccionar imagen con QR'}</span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: 'none' }}
              onChange={handleFileInput}
            />
          </label>

          {cameraError && (
            <div style={{ textAlign: 'center', fontSize: 'var(--text-xs)', color: 'var(--muted)', fontFamily: 'var(--font-body)' }}>
              No se pudo acceder a la cámara. Usa "Cargar imagen" o toma una captura de pantalla de la factura.
            </div>
          )}
        </div>

        <div style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center', fontFamily: 'var(--font-body)', lineHeight: 1.5 }}>
          Escanea el código QR que aparece en la parte inferior de tu factura electrónica DIAN.
          El monto y la fecha se rellenarán automáticamente.
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}
