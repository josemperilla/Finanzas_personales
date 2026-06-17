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
  { name: 'Restaurantes',    color: '#f59e0b', is_income: false },
  { name: 'Domicilios',      color: '#fb923c', is_income: false },
  { name: 'Mercado',         color: '#10b981', is_income: false },
  { name: 'Transporte',      color: '#06b6d4', is_income: false },
  { name: 'Hogar',           color: '#f97316', is_income: false },
  { name: 'Salud',           color: '#f43f5e', is_income: false },
  { name: 'Deporte',         color: '#3b82f6', is_income: false },
  { name: 'Compras',         color: '#ec4899', is_income: false },
  { name: 'Suscripciones',   color: '#8b5cf6', is_income: false },
  { name: 'Viajes',          color: '#14b8a6', is_income: false },
  { name: 'Software',        color: '#a855f7', is_income: false },
  { name: 'Bre-B',           color: '#0ea5e9', is_income: false },
  { name: 'Entretenimiento', color: '#ef4444', is_income: false },
  { name: 'Ingreso',         color: '#22c55e', is_income: true  },
  { name: 'Depósito',        color: '#16a34a', is_income: true  },
  { name: 'Otro',            color: '#6366f1', is_income: false },
] as const;

export type CategoryName = typeof CATEGORIES[number]['name'];

export function getCategoryColor(name: string): string {
  return CATEGORIES.find(c => c.name === name)?.color ?? '#6366f1';
}

export function isIncomeCategory(name: string): boolean {
  return CATEGORIES.find(c => c.name === name)?.is_income ?? false;
}

// Mapa de nombres obsoletos → nuevos (para transacciones antes de la migración GAS)
const CATEGORY_ALIASES: Record<string, string> = {
  'Comida':      'Restaurantes',
  'Alojamiento': 'Hogar',
  'Ropa':        'Compras',
  'Belleza':     'Compras',
  'Trámites':    'Otro',
};

export function normalizeCategory(cat: string): string {
  if (!cat) return 'Otro';
  return CATEGORY_ALIASES[cat] ?? cat;
}
