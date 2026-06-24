#!/usr/bin/env node
// check-category-drift.mjs
//
// Verifica que las categorías del UI (pwa/src/lib/config.ts → CATEGORIES) y las del
// backend vivo (apps_script/webhook.gs → detectCategory) estén alineadas.
//
// webhook.gs:detectCategory() es la FUENTE DE VERDAD (es lo que persiste en Sheets).
// Cualquier categoría que el UI muestre pero el backend no reconozca → el usuario la ve
// pero las transacciones caen a "Otro". Cualquier categoría del backend que el UI no liste
// → el picker no la ofrece para edición.
//
// Uso:  node scripts/check-category-drift.mjs
// Sale con código 1 si hay drift (para usar en CI).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const configSrc = readFileSync(
  resolve(root, 'pwa/src/lib/config.ts'),
  'utf8',
);
const gsSrc = readFileSync(
  resolve(root, 'apps_script/webhook.gs'),
  'utf8',
);

// --- UI: nombres declarados en CATEGORIES (config.ts) ---
const uiCats = new Set(
  [...configSrc.matchAll(/name:\s*['"]([^'"]+)['"]/g)].map((m) => m[1]),
);

// --- Backend: cats que detectCategory puede devolver (webhook.gs) ---
// Limita al cuerpo de detectCategory() para no capturar otras funciones.
const fnStart = gsSrc.indexOf('function detectCategory(');
const fnSlice = fnStart >= 0 ? gsSrc.slice(fnStart) : gsSrc;
const ruleCats = new Set(
  [...fnSlice.matchAll(/cat:\s*['"]([^'"]+)['"]/g)].map((m) => m[1]),
);
// Fallback final: return "Otro" (categoría por defecto cuando nada matchea).
const fallbackMatch = fnSlice.match(/return\s+['"]([^'"]+)['"]\s*;/);
if (fallbackMatch) ruleCats.add(fallbackMatch[1]);

// --- Drift ---
const onlyInUi = [...uiCats].filter((c) => !ruleCats.has(c));
const onlyInBackend = [...ruleCats].filter((c) => !uiCats.has(c));

console.log(`UI (config.ts):        ${[...uiCats].sort().join(', ')}`);
console.log(`Backend (webhook.gs):  ${[...ruleCats].sort().join(', ')}`);
console.log('');

if (onlyInUi.length === 0 && onlyInBackend.length === 0) {
  console.log('✓ Sin drift — UI y backend declaran las mismas categorías.');
  process.exit(0);
}

if (onlyInUi.length) {
  console.log(
    `✗ Solo en el UI (el backend las mandaría a "Otro"): ${onlyInUi.sort().join(', ')}`,
  );
}
if (onlyInBackend.length) {
  console.log(
    `⚠ Solo en el backend (el picker del UI no las ofrece): ${onlyInBackend.sort().join(', ')}`,
  );
}
console.log('');
console.log(
  'Arregla: agrega/quita la categoría en webhook.gs:detectCategory() Y en config.ts:CATEGORIES.',
);
process.exit(1);
