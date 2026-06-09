// En producción la PWA llama al proxy de Cloudflare Pages (/api/proxy).
// El proxy guarda WEBHOOK_URL + WEBHOOK_SECRET server-side — nunca viajan en el bundle JS.
// En desarrollo (npm run dev), configura VITE_WEBHOOK_URL y VITE_WEBHOOK_SECRET en .env.
export const WEBHOOK_URL = import.meta.env.PROD
  ? '/api/proxy'
  : (import.meta.env.VITE_WEBHOOK_URL || '');

export const WEBHOOK_SECRET = import.meta.env.PROD
  ? '' // proxy handles auth — never expose secret in client bundle
  : (import.meta.env.VITE_WEBHOOK_SECRET || '');

export const HAS_WEBHOOK_URL = WEBHOOK_URL.trim().length > 0;

export const CATEGORIES = [
  { name: 'Restaurantes',   color: '#f59e0b' },
  { name: 'Domicilios',     color: '#fb923c' },
  { name: 'Mercado',        color: '#10b981' },
  { name: 'Transporte',     color: '#06b6d4' },
  { name: 'Hogar',          color: '#f97316' },
  { name: 'Salud',          color: '#f43f5e' },
  { name: 'Deporte',        color: '#3b82f6' },
  { name: 'Compras',        color: '#ec4899' },
  { name: 'Suscripciones',  color: '#8b5cf6' },
  { name: 'Viajes',         color: '#14b8a6' },
  { name: 'Software',       color: '#a855f7' },
  { name: 'Bre-B',          color: '#0ea5e9' },
  { name: 'Entretenimiento', color: '#ef4444' },
  { name: 'Otro',           color: '#6366f1' },
] as const;

export type CategoryName = typeof CATEGORIES[number]['name'];

export function getCategoryColor(name: string): string {
  return CATEGORIES.find(c => c.name === name)?.color ?? '#6366f1';
}
