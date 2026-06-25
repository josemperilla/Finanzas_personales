#!/usr/bin/env node
// check-category-drift.mjs
//
// Verifica que las categorías del UI (pwa/src/lib/config.ts → CATEGORIES) y las del
// backend vivo (apps_script/webhook.gs) estén alineadas.
//
// FUENTE DE VERDAD del backend = ALLOWED_CATEGORIES en webhook.gs. Es el allowlist que
// updateCategoryInSheet() usa como compuerta (cualquier categoría fuera de la lista se
// rechaza), así que define exactamente qué categorías puede PERSISTIR el backend.
//
// Nota: detectCategory() asigna categorías por keyword del comercio, pero NO es la lista
// completa — hay categorías que se asignan por otros caminos (campo Tipo, p.ej. "Bre-B";
// el prompt de Haiku; edición manual del usuario). Por eso anclamos en ALLOWED_CATEGORIES
// y usamos detectCategory() solo como chequeo de consistencia interna.
//
// Uso:  node scripts/check-category-drift.mjs
// Sale con código 1 si hay drift (para usar en CI).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const configSrc = readFileSync(resolve(root, 'pwa/src/lib/config.ts'), 'utf8');
const gsSrc = readFileSync(resolve(root, 'apps_script/webhook.gs'), 'utf8');

// --- UI: nombres declarados en CATEGORIES (config.ts) ---
const uiCats = new Set(
  [...configSrc.matchAll(/name:\s*['"]([^'"]+)['"]/g)].map((m) => m[1]),
);

// --- Backend: ALLOWED_CATEGORIES (allowlist autoritativo) ---
const allowMatch = gsSrc.match(/ALLOWED_CATEGORIES\s*=\s*\[([\s\S]*?)\]/);
if (!allowMatch) {
  console.error('✗ No se encontró ALLOWED_CATEGORIES en webhook.gs');
  process.exit(2);
}
const backendCats = new Set(
  [...allowMatch[1].matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1]),
);

// --- detectCategory(): solo para consistencia interna ---
// Toda categoría que detectCategory() pueda devolver DEBE estar en ALLOWED_CATEGORIES,
// si no, esa transacción se rechazaría al intentar persistirla.
const fnStart = gsSrc.indexOf('function detectCategory(');
const fnSlice = fnStart >= 0 ? gsSrc.slice(fnStart) : '';
const detectCats = new Set(
  [...fnSlice.matchAll(/cat:\s*['"]([^'"]+)['"]/g)].map((m) => m[1]),
);
const fallbackMatch = fnSlice.match(/return\s+['"]([^'"]+)['"]\s*;/);
if (fallbackMatch) detectCats.add(fallbackMatch[1]);

// --- Drift ---
const onlyInUi = [...uiCats].filter((c) => !backendCats.has(c));
const onlyInBackend = [...backendCats].filter((c) => !uiCats.has(c));
const detectNotAllowed = [...detectCats].filter((c) => !backendCats.has(c));

console.log(`UI (config.ts):               ${[...uiCats].sort().join(', ')}`);
console.log(`Backend (ALLOWED_CATEGORIES): ${[...backendCats].sort().join(', ')}`);
console.log('');

let drift = false;

if (onlyInUi.length) {
  drift = true;
  console.log(
    `✗ Solo en el UI (el backend las rechaza al persistir): ${onlyInUi.sort().join(', ')}`,
  );
}
if (onlyInBackend.length) {
  drift = true;
  console.log(
    `⚠ Solo en el backend (el picker del UI no las ofrece): ${onlyInBackend.sort().join(', ')}`,
  );
}
if (detectNotAllowed.length) {
  drift = true;
  console.log(
    `✗ detectCategory() devuelve categorías fuera de ALLOWED_CATEGORIES: ${detectNotAllowed.sort().join(', ')}`,
  );
}

if (!drift) {
  console.log('✓ Sin drift — UI y backend (ALLOWED_CATEGORIES) están alineados.');
  process.exit(0);
}

console.log('');
console.log(
  'Arregla: alinea pwa/src/lib/config.ts:CATEGORIES con webhook.gs:ALLOWED_CATEGORIES.',
);
process.exit(1);
