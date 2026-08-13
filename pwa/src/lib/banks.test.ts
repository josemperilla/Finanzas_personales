import { describe, it, expect } from 'vitest';
import { normalizeBankName, BANKS } from './banks';

describe('normalizeBankName', () => {
  it('deja pasar intactos los bancos canónicos', () => {
    for (const bank of BANKS) {
      if (bank === 'Otro') continue;
      expect(normalizeBankName(bank)).toBe(bank);
    }
  });

  // Banco de Bogotá compró a Itaú (2026): las variantes de la hoja según la
  // época (y el caché local) deben colapsar en el mismo chip. Espejo del
  // mapeo `BANCO_RENOMBRES_CLAVES` de webhook.gs.
  it('colapsa "Bogotá" e "Itaú" en "Banco de Bogotá"', () => {
    expect(normalizeBankName('Bogotá')).toBe('Banco de Bogotá');
    expect(normalizeBankName('bogota')).toBe('Banco de Bogotá');
    expect(normalizeBankName('Banco de Bogota')).toBe('Banco de Bogotá');
    expect(normalizeBankName('Itaú')).toBe('Banco de Bogotá');
    expect(normalizeBankName('ITAU')).toBe('Banco de Bogotá');
    expect(normalizeBankName('Itau')).toBe('Banco de Bogotá');
  });

  it('colapsa las variantes de AV Villas', () => {
    expect(normalizeBankName('AV Villas')).toBe('AV Villas');
    expect(normalizeBankName('Ave Villas')).toBe('AV Villas');
    expect(normalizeBankName('Banco Ave Villas')).toBe('AV Villas');
    expect(normalizeBankName('av villas')).toBe('AV Villas');
  });

  it('devuelve null para nombres vacíos', () => {
    expect(normalizeBankName('')).toBeNull();
    expect(normalizeBankName('   ')).toBeNull();
    expect(normalizeBankName(null)).toBeNull();
    expect(normalizeBankName(undefined)).toBeNull();
  });

  it('respeta los nombres desconocidos recortándolos', () => {
    expect(normalizeBankName('  Scotiabank  ')).toBe('Scotiabank');
    expect(normalizeBankName('Scotiabank')).toBe('Scotiabank');
  });
});
