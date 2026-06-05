import { getUserAvatar } from './profiles';

const SIZE = 180;

// Generates a personalized 180x180 apple-touch-icon for the given user
// and sets it on the <link rel="apple-touch-icon"> element.
// iOS reads this tag at "Add to Home Screen" time, so updating it after
// login gives each user their own icon on the device.
export function applyPersonalizedAppIcon(userId: string, displayName: string): void {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const customAvatar = getUserAvatar(userId);

  if (customAvatar) {
    drawWithAvatar(ctx, customAvatar, () => finalize(canvas));
  } else {
    drawWithInitial(ctx, displayName);
    finalize(canvas);
  }
}

function drawBackground(ctx: CanvasRenderingContext2D) {
  const grad = ctx.createLinearGradient(0, 0, SIZE, SIZE);
  grad.addColorStop(0, '#1e40af');  // blue-800
  grad.addColorStop(1, '#2563eb');  // blue-600
  ctx.fillStyle = grad;
  // Rounded rect (iOS clips to rounded square anyway, but looks cleaner in preview)
  const r = 40;
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(SIZE - r, 0);
  ctx.quadraticCurveTo(SIZE, 0, SIZE, r);
  ctx.lineTo(SIZE, SIZE - r);
  ctx.quadraticCurveTo(SIZE, SIZE, SIZE - r, SIZE);
  ctx.lineTo(r, SIZE);
  ctx.quadraticCurveTo(0, SIZE, 0, SIZE - r);
  ctx.lineTo(0, r);
  ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.closePath();
  ctx.fill();
}

function drawWithInitial(ctx: CanvasRenderingContext2D, displayName: string) {
  drawBackground(ctx);
  const initial = (displayName || '?').charAt(0).toUpperCase();
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = `bold 88px -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(initial, SIZE / 2, SIZE / 2 + 4);
}

function drawWithAvatar(ctx: CanvasRenderingContext2D, avatarDataUrl: string, onDone: () => void) {
  drawBackground(ctx);

  const img = new Image();
  img.onload = () => {
    // Circular clip centered in canvas with a little padding
    const pad = 14;
    const r = (SIZE / 2) - pad;
    ctx.save();
    ctx.beginPath();
    ctx.arc(SIZE / 2, SIZE / 2, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(img, pad, pad, SIZE - pad * 2, SIZE - pad * 2);
    ctx.restore();

    // Thin white ring
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(SIZE / 2, SIZE / 2, r, 0, Math.PI * 2);
    ctx.stroke();

    onDone();
  };
  img.onerror = () => {
    // fallback — just use background + initial if avatar fails
    onDone();
  };
  img.src = avatarDataUrl;
}

function finalize(canvas: HTMLCanvasElement) {
  try {
    const dataUrl = canvas.toDataURL('image/png');
    // Update <link rel="apple-touch-icon">
    let link = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'apple-touch-icon';
      document.head.appendChild(link);
    }
    link.href = dataUrl;
  } catch {
    // SecurityError if canvas is tainted — silently ignore
  }
}

// Reset to the static default (called on logout / profile switch)
export function resetAppIcon(): void {
  const link = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
  if (link) link.href = '/apple-touch-icon.png';
}
