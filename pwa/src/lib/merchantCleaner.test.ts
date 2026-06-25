import { describe, it, expect } from 'vitest';
import { cleanMerchant } from './merchantCleaner';

describe('cleanMerchant', () => {
  it('devuelve "" para entradas vacías o nulas', () => {
    expect(cleanMerchant('')).toBe('');
    expect(cleanMerchant(null)).toBe('');
    expect(cleanMerchant(undefined)).toBe('');
  });

  it('normaliza marcas conocidas sin importar mayúsculas/ruido', () => {
    expect(cleanMerchant('RAPPI*COMERCIO 123')).toBe('Rappi');
    expect(cleanMerchant('NETFLIX.COM')).toBe('Netflix');
    expect(cleanMerchant('compra en SPOTIFY')).toBe('Spotify');
  });

  it('reconoce Éxito aunque venga con prefijo y ciudad', () => {
    expect(cleanMerchant('COMPRA EN EXITO BOGOTA')).toBe('Éxito');
  });

  it('elimina prefijos de agregadores de pago (Bold, SumUp, DLO)', () => {
    expect(cleanMerchant('BOLD*Tienda Naranja')).toBe('Tienda Naranja');
    expect(cleanMerchant('SUMUP*Cafe Local')).toBe('Cafe Local');
  });

  it('devuelve "" cuando solo queda el agregador sin comercio', () => {
    expect(cleanMerchant('MERCADO PAGO')).toBe('');
    expect(cleanMerchant('PAYU PAGOSONLINE')).toBe('');
  });

  it('limpia ruido: prefijo de compra, números largos y fechas', () => {
    expect(cleanMerchant('COMPRA EN TIENDA 1234 15/03')).toBe('Tienda');
  });

  it('trunca a 40 caracteres', () => {
    const largo = 'Comercio Con Un Nombre Extremadamente Largo Que Supera El Limite';
    expect(cleanMerchant(largo).length).toBeLessThanOrEqual(40);
  });
});
