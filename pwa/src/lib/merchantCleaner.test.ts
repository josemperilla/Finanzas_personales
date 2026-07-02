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

  it('reconoce transferencias Bre-B con o sin guion', () => {
    expect(cleanMerchant('Llave Bre-B 1015471504')).toBe('Transferencia por Bre-B');
    expect(cleanMerchant('transferencia BREB natalia')).toBe('Transferencia por Bre-B');
  });

  it('elimina el prefijo Mercado Pago con distintos separadores', () => {
    expect(cleanMerchant('MERCADOPAGO*Tienda Andina')).toBe('Tienda Andina');
    expect(cleanMerchant('Mercado Pago Tienda Andina')).toBe('Tienda Andina');
  });

  it('elimina prefijos de agregador DLO/DL/Vault', () => {
    expect(cleanMerchant('DLO*Restaurante Central')).toBe('Restaurante Central');
    expect(cleanMerchant('DL*Cafe Andino')).toBe('Cafe Andino');
    expect(cleanMerchant('VAULT*Tienda Norte')).toBe('Tienda Norte');
  });

  it('quita nombres de ciudad aunque no matcheen ninguna marca conocida', () => {
    expect(cleanMerchant('TIENDA GENERICA MEDELLIN')).toBe('Tienda Generica');
  });

  it('respeta mayúsculas/minúsculas al aplicar title case', () => {
    expect(cleanMerchant('cafe DEL BARRIO')).toBe('Cafe Del Barrio');
  });

  it('colapsa espacios múltiples dejados por la limpieza de ruido', () => {
    expect(cleanMerchant('Tienda   Con    Espacios')).toBe('Tienda Con Espacios');
  });
});
