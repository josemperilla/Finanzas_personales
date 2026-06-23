import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

/**
 * Ambient "flow field" background — particles drifting along a noise-based
 * vector field. Encarna la idea de que "el dinero fluye".
 *
 * Lee las CSS vars --surface (fondo) y --blue (acento), así se adapta solo:
 * claro = esmeralda sobre papel; oscuro = azul fosforescente sobre noche.
 * Respeta prefers-reduced-motion (un solo frame estático, sin loop).
 */
export default function FlowBackground() {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const root = document.documentElement;
    const vvar = (n: string) => getComputedStyle(root).getPropertyValue(n).trim();
    const hexRgb = (h: string): [number, number, number] => {
      h = (h || '').replace('#', '');
      if (h.length < 6) return [14, 107, 77];
      return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    };

    let W = 0, H = 0, DPR = 1, raf = 0, t = 0, run = false;
    let bg = '#F5F1EA', line = '#0E6B4D';
    const N = 150;
    type P = { x: number; y: number; px: number; py: number; life: number };
    const P: P[] = [];

    const resize = () => {
      DPR = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth; H = window.innerHeight;
      canvas.width = W * DPR; canvas.height = H * DPR;
      canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    };
    const ang = (x: number, y: number, tm: number) => {
      const s = 0.0022;
      return (Math.sin(x * s + tm * 0.30) + Math.sin(y * s * 1.1 - tm * 0.22) +
        Math.sin((x + y) * s * 0.6 + tm * 0.15) + Math.sin((x - y) * s * 0.7 - tm * 0.18)) * Math.PI;
    };
    const spawn = (p: P) => { p.x = Math.random() * W; p.y = Math.random() * H; p.px = p.x; p.py = p.y; p.life = 80 + Math.random() * 160; };
    const init = () => { P.length = 0; for (let i = 0; i < N; i++) { const p: P = { x: 0, y: 0, px: 0, py: 0, life: 0 }; spawn(p); P.push(p); } };
    const recolor = () => { bg = vvar('--surface') || bg; line = vvar('--blue') || line; };

    const stat = () => {
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
      const [lr, lg, lb] = hexRgb(line);
      ctx.lineWidth = 1.2;
      for (let i = 0; i < N; i++) {
        let x = Math.random() * W, y = Math.random() * H;
        ctx.strokeStyle = `rgba(${lr},${lg},${lb},0.05)`;
        ctx.beginPath();
        for (let s = 0; s < 30; s++) { const a = ang(x, y, 1.2); const nx = x + Math.cos(a) * 1.2, ny = y + Math.sin(a) * 1.2; ctx.moveTo(x, y); ctx.lineTo(nx, ny); x = nx; y = ny; }
        ctx.stroke();
      }
    };
    const step = () => {
      t += 0.012;
      const dark = root.getAttribute('data-theme') === 'dark';
      const [r, g, b] = hexRgb(bg);
      ctx.fillStyle = `rgba(${r},${g},${b},${dark ? 0.03 : 0.045})`;
      ctx.fillRect(0, 0, W, H);
      const [lr, lg, lb] = hexRgb(line);
      ctx.lineWidth = 1.2; ctx.lineCap = 'round';
      for (const p of P) {
        const a = ang(p.x, p.y, t);
        p.px = p.x; p.py = p.y;
        p.x += Math.cos(a) * 0.5; p.y += Math.sin(a) * 0.5;
        p.life--;
        const alpha = dark ? Math.min(0.42, p.life / 240) : Math.min(0.16, p.life / 600);
        ctx.strokeStyle = `rgba(${lr},${lg},${lb},${alpha})`;
        ctx.beginPath(); ctx.moveTo(p.px, p.py); ctx.lineTo(p.x, p.y); ctx.stroke();
        if (p.life <= 0 || p.x < -10 || p.x > W + 10 || p.y < -10 || p.y > H + 10) spawn(p);
      }
      raf = requestAnimationFrame(step);
    };

    recolor(); resize(); init();
    if (reduced) { stat(); } else { run = true; step(); }

    const onResize = () => { resize(); if (reduced) stat(); };
    const onVis = () => { if (reduced) return; if (document.hidden) { cancelAnimationFrame(raf); run = false; } else if (!run) { run = true; step(); } };
    const onTheme = () => { recolor(); ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H); if (reduced) stat(); };
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVis);
    const obs = new MutationObserver(onTheme);
    obs.observe(root, { attributes: true, attributeFilter: ['data-theme'] });

    return () => {
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVis);
      obs.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <canvas ref={ref} aria-hidden="true" style={{ position: 'fixed', inset: '0', zIndex: 0, pointerEvents: 'none' }} />,
    document.body,
  );
}
