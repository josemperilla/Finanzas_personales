import { describe, expect, it } from 'vitest';
import { Transaction } from './api';
import { matchesCategoryFilter } from './historialFilters';

function tx(categoria: string): Transaction {
  return {
    Timestamp: '2026-06-29 12:00:00',
    Fecha: '2026-06-29',
    Banco: 'AV Villas',
    Tipo: 'Compra',
    'Monto (COP)': 1000,
    Comercio: 'Prueba',
    'Tarjeta/Cuenta': 'Tarjeta 3403',
    Categoría: categoria,
  };
}

describe('matchesCategoryFilter', () => {
  it('solo deja pasar transacciones de la categoria activa', () => {
    expect(matchesCategoryFilter(tx('Restaurantes'), 'Restaurantes')).toBe(true);
    expect(matchesCategoryFilter(tx('Entretenimiento'), 'Restaurantes')).toBe(false);
    expect(matchesCategoryFilter(tx('Software'), 'Restaurantes')).toBe(false);
    expect(matchesCategoryFilter(tx('Bre-B'), 'Restaurantes')).toBe(false);
    expect(matchesCategoryFilter(tx('Otro'), 'Restaurantes')).toBe(false);
  });

  it('mantiene compatibilidad con aliases antiguos de categoria', () => {
    expect(matchesCategoryFilter(tx('Comida'), 'Restaurantes')).toBe(true);
  });
});
