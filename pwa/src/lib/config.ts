export const WEBHOOK_URL = import.meta.env.VITE_WEBHOOK_URL || "";
export const HAS_WEBHOOK_URL = WEBHOOK_URL.trim().length > 0;

export const CATEGORIES = [
  { name: 'Comida',         color: '#f59e0b' },
  { name: 'Transporte',     color: '#06b6d4' },
  { name: 'Suscripciones',  color: '#8b5cf6' },
  { name: 'Mercado',        color: '#10b981' },
  { name: 'Salud',          color: '#f43f5e' },
  { name: 'Deporte',        color: '#3b82f6' },
  { name: 'Compras',        color: '#ec4899' },
  { name: 'Alojamiento',    color: '#f97316' },
  { name: 'Viajes',         color: '#14b8a6' },
  { name: 'Software',       color: '#a855f7' },
  { name: 'Otro',           color: '#6366f1' },
] as const;

export type CategoryName = typeof CATEGORIES[number]['name'];

export function getCategoryColor(name: string): string {
  return CATEGORIES.find(c => c.name === name)?.color ?? '#6366f1';
}
