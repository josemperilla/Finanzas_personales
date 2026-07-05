// Catálogo único de bancos/proveedores soportados como nombre de cuenta o
// banco de una transacción. Única fuente de verdad — si agregas un banco,
// solo hace falta tocar este archivo.
export const BANKS = [
  'Bogotá', 'Itaú', 'Davivienda', 'Bancolombia', 'Nequi', 'Daviplata',
  'AV Villas', 'Occidente', 'Popular', 'dale!', 'Rappi', 'Otro',
] as const;
