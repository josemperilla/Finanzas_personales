#!/usr/bin/env node
// check-provider-drift.mjs
//
// Verifica que los providerId declarados por la extensión (extension/providers.js →
// PROVIDER_DOMAINS) existan en el catálogo canónico (pwa/src/lib/providers.ts → PROVIDERS).
//
// FUENTE DE VERDAD del catálogo = pwa/src/lib/providers.ts:PROVIDERS. Es lo que la PWA usa
// para renderizar, y el backend (apps_script) recibe el `providerId` tal cual. Si la extensión
// envía un providerId que no existe en PROVIDERS, la factura se rechaza o se category-mal.
//
// La extensión es una 3ª fuente de providers (las otras dos son providers.ts y connectors_facturas.gs);
// este script mantiene la extensión alineada con providers.ts. No valida connectors_facturas.gs
// porque su registry (FACTURA_CONNECTORS) está vacío por diseño (ver docs/DATA_MODEL.md).
//
// Uso:  node scripts/check-provider-drift.mjs
// Sale con código 1 si hay drift real (providerId en extensión pero no en catálogo).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const providersSrc = readFileSync(resolve(root, 'pwa/src/lib/providers.ts'), 'utf8');
const extSrc = readFileSync(resolve(root, 'extension/providers.js'), 'utf8');

// --- Catálogo: ids declarados en PROVIDERS (providers.ts) ---
const catalogIds = new Set(
  [...providersSrc.matchAll(/id:\s*['"]([^'"]+)['"]/g)].map((m) => m[1]),
);

// --- Extensión: providerId declarados en PROVIDER_DOMAINS (providers.js) ---
const extIds = new Set(
  [...extSrc.matchAll(/providerId:\s*['"]([^'"]+)['"]/g)].map((m) => m[1]),
);

// --- Drift ---
// Solo-en-extensión = drift real: la extensión manda un id que el catálogo no conoce.
const onlyInExt = [...extIds].filter((id) => !catalogIds.has(id));
// Solo-en-catálogo = advertencia informativa: hay proveedores con portal que la extensión
// aún no detecta. No es bloqueante (la extensión no tiene por qué cubrir todos los portales).
const onlyInCatalog = [...catalogIds].filter((id) => !extIds.has(id));

console.log(`Catálogo (providers.ts):  ${catalogIds.size} proveedores`);
console.log(`Extensión (providers.js): ${extIds.size} proveedores (providerIds únicos)`);
console.log('');

let drift = false;

if (onlyInExt.length) {
  drift = true;
  console.log(
    `✗ Solo en la extensión (providerId que NO existe en el catálogo → factura se rechaza): ${onlyInExt.sort().join(', ')}`,
  );
}
if (onlyInCatalog.length) {
  console.log(
    `⚠ En el catálogo pero no en la extensión (la extensión no detecta su portal; info, no bloquea): ${onlyInCatalog.sort().join(', ')}`,
  );
}

if (!drift) {
  console.log('✓ Sin drift — todo providerId de la extensión existe en el catálogo.');
  process.exit(0);
}

console.log('');
console.log(
  'Arregla: agrega los providerId faltantes a pwa/src/lib/providers.ts:PROVIDERS, o quítalos de extension/providers.js.',
);
process.exit(1);
