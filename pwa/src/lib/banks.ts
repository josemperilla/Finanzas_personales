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
