import { describe, it, expect } from 'vitest';
import { CATEGORIES, normalizeCategory, getCategoryColor } from './config';

describe('normalizeCategory', () => {
  it('deja pasar intactas las categorías canónicas', () => {
    for (const { name } of CATEGORIES) {
      expect(normalizeCategory(name)).toBe(name);
    }
  });

  it('traduce los nombres obsoletos al vigente', () => {
    expect(normalizeCategory('Comida')).toBe('Restaurantes');
    expect(normalizeCategory('Alojamiento')).toBe('Hogar');
    expect(normalizeCategory('Ropa')).toBe('Compras');
    expect(normalizeCategory('Belleza')).toBe('Compras');
    expect(normalizeCategory('Trámites')).toBe('Otro');
  });

  // Las dos variantes que dejó el import retroactivo de extractos. Sin alias, el
  // filtro del historial ofrece "Otro" y "Otros" como si fueran cosas distintas.
  it('colapsa "Otros" en "Otro"', () => {
    expect(normalizeCategory('Otros')).toBe('Otro');
  });

  it('colapsa el singular "Suscripción" en "Suscripciones"', () => {
    expect(normalizeCategory('Suscripción')).toBe('Suscripciones');
  });

  it('sin categoría cae en "Otro"', () => {
    expect(normalizeCategory('')).toBe('Otro');
  });

  // Están fuera de ALLOWED_CATEGORIES, pero son la decisión de alguien: el UI las
  // muestra tal cual en vez de inventarles un destino. Mismo criterio que
  // webhook.gs:_webcatSinCategoria.
  it('respeta las etiquetas de legado sin equivalente', () => {
    expect(normalizeCategory('Seguros')).toBe('Seguros');
    expect(normalizeCategory('Transferencia')).toBe('Transferencia');
  });

  // Un alias que apunte a algo que no existe rompería el color y el icono.
  it('todo alias resuelve a una categoría que existe en CATEGORIES', () => {
    const nombres = new Set<string>(CATEGORIES.map((c) => c.name));
    const alias = ['Comida', 'Alojamiento', 'Ropa', 'Belleza', 'Trámites', 'Otros', 'Suscripción'];
    for (const a of alias) {
      expect(nombres.has(normalizeCategory(a))).toBe(true);
    }
  });

  it('es idempotente: normalizar dos veces da lo mismo', () => {
    for (const a of ['Comida', 'Otros', 'Suscripción', 'Restaurantes', 'Seguros', '']) {
      expect(normalizeCategory(normalizeCategory(a))).toBe(normalizeCategory(a));
    }
  });
});

describe('getCategoryColor', () => {
  it('da un color propio a cada categoría canónica', () => {
    for (const { name, color } of CATEGORIES) {
      expect(getCategoryColor(name)).toBe(color);
    }
  });

  it('una categoría desconocida cae al color de fallback', () => {
    expect(getCategoryColor('Inexistente')).toBe('#6366f1');
  });
});
