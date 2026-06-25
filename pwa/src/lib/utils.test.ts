import { describe, it, expect } from 'vitest';
import { formatCOP, getDateKey, formatDate, formatDateShort, todayInTZ } from './utils';

describe('formatCOP', () => {
  it('formatea con separador de miles colombiano y redondea', () => {
    expect(formatCOP(1234567)).toBe('$1.234.567');
    expect(formatCOP(1000)).toBe('$1.000');
    expect(formatCOP(999.6)).toBe('$1.000');
    expect(formatCOP(0)).toBe('$0');
  });

  it('redondea decimales antes de formatear', () => {
    expect(formatCOP(1500.4)).toBe('$1.500');
    expect(formatCOP(1500.5)).toBe('$1.501');
  });
});

describe('getDateKey', () => {
  it('extrae YYYY-MM-DD del inicio del string', () => {
    expect(getDateKey('2026-06-24 13:45:00')).toBe('2026-06-24');
    expect(getDateKey('2026-06-24T13:45:00.000Z')).toBe('2026-06-24');
  });

  it('devuelve cadena vacía para entrada vacía', () => {
    expect(getDateKey('')).toBe('');
  });
});

describe('formatDate / formatDateShort', () => {
  it('devuelven cadena vacía para entrada vacía', () => {
    expect(formatDate('')).toBe('');
    expect(formatDateShort('')).toBe('');
  });

  it('formatean una fecha válida sin lanzar', () => {
    expect(formatDate('2026-06-24 12:00:00')).toContain('junio');
    expect(formatDateShort('2026-06-24 12:00:00')).toContain('jun');
  });
});

describe('todayInTZ', () => {
  it('devuelve una fecha en formato YYYY-MM-DD', () => {
    expect(todayInTZ('America/Bogota')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
