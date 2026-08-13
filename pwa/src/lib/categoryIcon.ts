import type { IconName } from '../components/ui/icons';

/**
 * Mapeo categoría → ícono (14 categorías de la app).
 *
 * Vive fuera de `icons.tsx` a propósito: ese archivo solo exporta componentes,
 * lo que deja funcionar el Fast Refresh de Vite. Mezclar componentes y helpers
 * en un mismo módulo obliga a recargar la página entera en cada edición.
 *
 * Las claves deben coincidir con `CATEGORIES` de `lib/config.ts`, que a su vez
 * es espejo de `ALLOWED_CATEGORIES` en `apps_script/webhook.gs`
 * (ver `scripts/check-category-drift.mjs`).
 */
const CATEGORY_ICON: Record<string, IconName> = {
  Restaurantes: 'utensils',
  Domicilios: 'truck',
  Mercado: 'cart',
  Transporte: 'car',
  Hogar: 'home',
  Salud: 'heart',
  Deporte: 'dumbbell',
  Compras: 'bag',
  Suscripciones: 'repeat',
  Viajes: 'plane',
  Software: 'code',
  'Bre-B': 'smartphone',
  Entretenimiento: 'film',
  Otro: 'more',
};

export function categoryIcon(category: string): IconName {
  return CATEGORY_ICON[category] ?? 'receipt';
}
