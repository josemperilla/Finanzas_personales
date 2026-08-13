#!/usr/bin/env node
// Auditoría de productos (tarjetas/cuentas) de un usuario: lee `cards_<userId>`
// vía `?action=cards` y marca duplicados por plástico (ultimos4) y por
// `banco|ultimos4` normalizado. Solo lectura — no modifica nada.
//
// Uso:   node scripts/audit-cards.mjs [userId]   (por defecto: jose)
// Secreto: lee VITE_WEBHOOK_URL / VITE_WEBHOOK_SECRET de pwa/.env.local
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const userId = (process.argv[2] || 'jose').toLowerCase();

function loadEnv(path) {
  const txt = readFileSync(path, 'utf8');
  const out = {};
  for (const line of txt.split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return out;
}

// Normaliza el banco igual que banks.ts (NFD + lowercase + alias mínimos).
const ALIASES = {
  'banco de bogota': 'Banco de Bogotá', 'banco bogota': 'Banco de Bogotá',
  bogota: 'Banco de Bogotá', itau: 'Banco de Bogotá', ita: 'Banco de Bogotá',
  'av villas': 'AV Villas', 'ave villas': 'AV Villas',
  'banco av villas': 'AV Villas', 'banco ave villas': 'AV Villas',
};
function normBank(name) {
  const key = String(name ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  return ALIASES[key] || String(name ?? '').trim();
}

const env = loadEnv(resolve(process.cwd(), 'pwa/.env.local'));
if (!env.VITE_WEBHOOK_URL || !env.VITE_WEBHOOK_SECRET) {
  console.error('✗ Faltan VITE_WEBHOOK_URL/VITE_WEBHOOK_SECRET en pwa/.env.local');
  process.exit(1);
}

const url = `${env.VITE_WEBHOOK_URL}?action=cards&userId=${userId}&_secret=${encodeURIComponent(env.VITE_WEBHOOK_SECRET)}`;
const res = await fetch(url);
const json = await res.json();
if (!json.ok) { console.error('✗ Error del webhook:', json.error || json); process.exit(1); }

const cards = json.data;
console.log(`\nUsuario: ${userId}  —  ${cards.length} productos en cards_<userId>\n`);
for (const c of cards) {
  console.log(`  • ${normBank(c.banco)}|${c.ultimos4}  chasis="${c.chasis}"  alias="${c.alias || '—'}"  id=${c.id}`);
}

// Duplicados por plástico (ultimos4) — la señal más fuerte.
const byLast4 = new Map();
for (const c of cards) {
  const k = c.ultimos4;
  if (!byLast4.has(k)) byLast4.set(k, []);
  byLast4.get(k).push(c);
}
const dupPlastic = [...byLast4.entries()].filter(([, v]) => v.length > 1);
console.log(`\nPlásticos con >1 entrada: ${dupPlastic.length}`);
for (const [last4, group] of dupPlastic) {
  const bancos = [...new Set(group.map(c => normBank(c.banco)))];
  console.log(`  ✗ …${last4} aparece ${group.length}× — bancos: ${bancos.join(', ')}`);
}

// Duplicados por producto canónico (banco normalizado | ultimos4).
const byKey = new Map();
for (const c of cards) {
  const k = `${normBank(c.banco)}|${c.ultimos4}`;
  if (!byKey.has(k)) byKey.set(k, []);
  byKey.get(k).push(c);
}
const dupKey = [...byKey.entries()].filter(([, v]) => v.length > 1);
console.log(`\nProductos canónicos duplicados (mismo banco|ultimos4): ${dupKey.length}`);
for (const [k, group] of dupKey) {
  console.log(`  ✗ ${k} — ${group.length} entradas (ids: ${group.map(c => c.id).join(', ')})`);
}

console.log(`\nResumen: ${cards.length} productos, ${byLast4.size} plásticos únicos, ${dupPlastic.length} plásticos duplicados, ${dupKey.length} duplicados canónicos.`);
