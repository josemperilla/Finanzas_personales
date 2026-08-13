// Catálogo único de bancos/proveedores soportados como nombre de cuenta o
// banco de una transacción. Única fuente de verdad — si agregas un banco,
// solo hace falta tocar este archivo.
//
// Estos nombres TIENEN que coincidir con `CANONICAL_BANCO` en
// `apps_script/webhook.gs`: la PWA agrupa productos por `banco|ultimos4`
// (ver `productKey` en personalProducts.ts), así que un nombre distinto aquí
// parte el mismo plástico en dos productos. Pasó de verdad: "Itaú" en este
// selector contra "Banco de Bogotá" en la hoja duplicaba la tarjeta ****8439.
//
// "Itaú" ya no aparece: Banco de Bogotá lo compró en 2026 y sus productos
// (****8439, ****8448) pasaron a ser suyos. Lo que distingue un producto de
// otro es la tarjeta, no el banco.
export const BANKS = [
  'Banco de Bogotá', 'Davivienda', 'Bancolombia', 'Nequi', 'Daviplata',
  'AV Villas', 'Occidente', 'Popular', 'dale!', 'Rappi', 'Nubank', 'Otro',
] as const;

// Variantes → nombre canónico. Espejo de `BANCO_RENOMBRES_CLAVES` +
// `_normalizaNombreBanco` de `apps_script/webhook.gs`: en la hoja (y en el
// caché local) conviven "Itaú", "ITAU", "Bogotá" y "Banco de Bogotá" según de
// qué época venga la fila. Banco de Bogotá compró a Itaú (2026), así que sus
// transacciones viejas se agrupan bajo el mismo nombre.
const BANK_ALIASES: Record<string, string> = {
  'banco de bogota': 'Banco de Bogotá',
  'banco bogota': 'Banco de Bogotá',
  bogota: 'Banco de Bogotá',
  itau: 'Banco de Bogotá',
  ita: 'Banco de Bogotá',
  'av villas': 'AV Villas',
  'ave villas': 'AV Villas',
  'banco av villas': 'AV Villas',
  'banco ave villas': 'AV Villas',
  davivienda: 'Davivienda',
  bancolombia: 'Bancolombia',
  nequi: 'Nequi',
  daviplata: 'Daviplata',
  occidente: 'Occidente',
  popular: 'Popular',
  dale: 'dale!',
  'dale!': 'dale!',
  rappi: 'Rappi',
  nubank: 'Nubank',
};

// Devuelve el nombre canónico del banco (sin tildes ni mayúsculas al comparar),
// o null si el valor está vacío. Los nombres desconocidos se devuelven
// recortados tal cual para no perder datos.
export function normalizeBankName(name: string | null | undefined): string | null {
  const key = String(name ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .trim().toLowerCase();
  if (!key) return null;
  return BANK_ALIASES[key] ?? String(name).trim();
}
