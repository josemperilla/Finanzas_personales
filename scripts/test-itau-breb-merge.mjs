#!/usr/bin/env node
// Regression test for _findBrebMergeMatch (apps_script/webhook.gs).
//
// Root cause: Itaú sends two separate SMS for one Bre-B transfer — a generic
// account-debit notification (comercio="Cuenta de Ahorros"/"Cuenta Corriente")
// and a Bre-B-specific one with the recipient key (comercio="Llave Bre-B <key>").
// Both parse successfully, so without a merge check the same real-world
// transaction gets appended twice. This test loads the pure decision function
// straight from webhook.gs (no GAS services needed) and asserts it enriches
// the generic row with the key (never discards the more informative row) and
// doesn't over-match legitimate same-amount transactions.
//
// Run: node scripts/test-itau-breb-merge.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(path.join(__dirname, "../apps_script/webhook.gs"), "utf8");

const match = source.match(/function _findBrebMergeMatch\([\s\S]*?\n}\n/);
if (!match) {
  console.error("FAIL: could not find _findBrebMergeMatch in webhook.gs");
  process.exit(1);
}

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(match[0] + "\nthis._findBrebMergeMatch = _findBrebMergeMatch;", sandbox);
const _findBrebMergeMatch = sandbox._findBrebMergeMatch;

const HDRS = [
  "Timestamp", "Fecha", "Banco", "Tipo", "Monto (COP)",
  "Comercio", "Tarjeta/Cuenta", "Categoría", "SMS_Original", "Fuente", "Nota"
];

function row({ banco, monto, tarjeta, fecha, comercio }) {
  const r = new Array(HDRS.length).fill("");
  r[HDRS.indexOf("Banco")] = banco;
  r[HDRS.indexOf("Monto (COP)")] = monto;
  r[HDRS.indexOf("Tarjeta/Cuenta")] = tarjeta;
  r[HDRS.indexOf("Fecha")] = fecha;
  r[HDRS.indexOf("Comercio")] = comercio;
  return r;
}

let pass = 0, fail = 0;
function assert(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    pass++;
    console.log(`PASS: ${name}`);
  } else {
    fail++;
    console.error(`FAIL: ${name} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// Scenario 1: real case — generic "Cuenta de Ahorros" row already recorded,
// then the Bre-B-specific SMS (with key) for the same transfer arrives 9s later.
// Must enrich the existing generic row (row 2 → 1-based index 2), never discard it.
{
  const data = [HDRS, row({
    banco: "Itaú", monto: 18000, tarjeta: "Cuenta de Ahorros ****8448",
    fecha: "2026-07-02 07:34:00", comercio: "Cuenta de Ahorros"
  })];
  const parsed = {
    banco: "Itaú", monto: 18000, tarjeta: "Cuenta de Ahorros ****8448",
    fecha: new Date("2026-07-02T07:34:09"),
    brebKey: "3001234567", comercio: "Llave Bre-B 3001234567", categoria: "Bre-B"
  };
  assert(
    "enriches the generic row when the keyed notification arrives second",
    _findBrebMergeMatch(parsed, data, HDRS),
    { rowIndex1Based: 2, action: "enrich" }
  );
}

// Scenario 2: reverse order — the Bre-B-specific row already exists, then the
// generic notification for the same transfer arrives. Must discard the
// generic one (the specific row is already the complete version) — never
// enrich (that would overwrite the good comercio with the generic one).
{
  const data = [HDRS, row({
    banco: "Itaú", monto: 18000, tarjeta: "Cuenta de Ahorros ****8448",
    fecha: "2026-07-02 07:34:09", comercio: "Llave Bre-B 3001234567"
  })];
  const parsed = {
    banco: "Itaú", monto: 18000, tarjeta: "Cuenta de Ahorros ****8448",
    fecha: new Date("2026-07-02T07:34:18"), comercio: "Cuenta de Ahorros"
  };
  assert(
    "discards the generic notification when the keyed row already exists",
    _findBrebMergeMatch(parsed, data, HDRS),
    { rowIndex1Based: 2, action: "discard" }
  );
}

// Scenario 3: different amount → not a match, caller must append normally.
{
  const data = [HDRS, row({
    banco: "Itaú", monto: 18000, tarjeta: "Cuenta de Ahorros ****8448",
    fecha: "2026-07-02 07:34:00", comercio: "Cuenta de Ahorros"
  })];
  const parsed = {
    banco: "Itaú", monto: 25000, tarjeta: "Cuenta de Ahorros ****8448",
    fecha: new Date("2026-07-02T07:34:09"), brebKey: "3001234567",
    comercio: "Llave Bre-B 3001234567", categoria: "Bre-B"
  };
  assert("different amount is not matched", _findBrebMergeMatch(parsed, data, HDRS), null);
}

// Scenario 4: same amount, different account (last 4 digits) → not a match.
{
  const data = [HDRS, row({
    banco: "Itaú", monto: 18000, tarjeta: "Cuenta de Ahorros ****8448",
    fecha: "2026-07-02 07:34:00", comercio: "Cuenta de Ahorros"
  })];
  const parsed = {
    banco: "Itaú", monto: 18000, tarjeta: "Cuenta Corriente ****1234",
    fecha: new Date("2026-07-02T07:34:09"), brebKey: "3001234567",
    comercio: "Llave Bre-B 3001234567", categoria: "Bre-B"
  };
  assert("different account (last 4 digits) is not matched", _findBrebMergeMatch(parsed, data, HDRS), null);
}

// Scenario 5: same amount + account, but outside the 90s window → real
// separate transfer, must not merge. Ventana angosta a propósito (ver
// comentario en _findBrebMergeMatch): reduce el riesgo de fusionar dos
// transferencias reales distintas que coincidan en monto.
{
  const data = [HDRS, row({
    banco: "Itaú", monto: 18000, tarjeta: "Cuenta de Ahorros ****8448",
    fecha: "2026-07-02 07:34:00", comercio: "Cuenta de Ahorros"
  })];
  const parsed = {
    banco: "Itaú", monto: 18000, tarjeta: "Cuenta de Ahorros ****8448",
    fecha: new Date("2026-07-02T07:41:00"), brebKey: "3001234567",
    comercio: "Llave Bre-B 3001234567", categoria: "Bre-B"
  };
  assert("outside the 90s window is not matched (real separate transfer)", _findBrebMergeMatch(parsed, data, HDRS), null);
}

// Scenario 5b: boundary — 85s apart (inside 90s window) must still merge.
{
  const data = [HDRS, row({
    banco: "Itaú", monto: 18000, tarjeta: "Cuenta de Ahorros ****8448",
    fecha: "2026-07-02 07:34:00", comercio: "Cuenta de Ahorros"
  })];
  const parsed = {
    banco: "Itaú", monto: 18000, tarjeta: "Cuenta de Ahorros ****8448",
    fecha: new Date("2026-07-02T07:35:25"), brebKey: "3001234567",
    comercio: "Llave Bre-B 3001234567", categoria: "Bre-B"
  };
  assert(
    "85s apart (inside window) still merges",
    _findBrebMergeMatch(parsed, data, HDRS),
    { rowIndex1Based: 2, action: "enrich" }
  );
}

// Scenario 5c: fecha inválida en la notificación entrante → nunca fusionar a
// ciegas (guard defensivo — sin esto, Math.abs(rowDate - NaN) es siempre
// false y el chequeo de ventana se saltaría silenciosamente).
{
  const data = [HDRS, row({
    banco: "Itaú", monto: 18000, tarjeta: "Cuenta de Ahorros ****8448",
    fecha: "2026-07-02 07:34:00", comercio: "Cuenta de Ahorros"
  })];
  const parsed = {
    banco: "Itaú", monto: 18000, tarjeta: "Cuenta de Ahorros ****8448",
    fecha: new Date("not-a-date"), brebKey: "3001234567",
    comercio: "Llave Bre-B 3001234567", categoria: "Bre-B"
  };
  assert("invalid incoming date never merges blindly", _findBrebMergeMatch(parsed, data, HDRS), null);
}

// Scenario 6: different bank → not a match (never merge across banks).
{
  const data = [HDRS, row({
    banco: "Bancolombia", monto: 18000, tarjeta: "Cuenta de Ahorros ****8448",
    fecha: "2026-07-02 07:34:00", comercio: "Cuenta de Ahorros"
  })];
  const parsed = {
    banco: "Itaú", monto: 18000, tarjeta: "Cuenta de Ahorros ****8448",
    fecha: new Date("2026-07-02T07:34:09"), brebKey: "3001234567",
    comercio: "Llave Bre-B 3001234567", categoria: "Bre-B"
  };
  assert("different bank is never merged", _findBrebMergeMatch(parsed, data, HDRS), null);
}

// Scenario 7: alias key (@usuario instead of numeric) — same enrich path.
{
  const data = [HDRS, row({
    banco: "Itaú", monto: 220000, tarjeta: "Cuenta de Ahorros ****8448",
    fecha: "2026-07-02 12:13:00", comercio: "Cuenta de Ahorros"
  })];
  const parsed = {
    banco: "Itaú", monto: 220000, tarjeta: "Cuenta de Ahorros ****8448",
    fecha: new Date("2026-07-02T12:13:03"),
    brebKey: "@usuario9237", comercio: "Llave Bre-B @usuario9237", categoria: "Bre-B"
  };
  assert(
    "alias key (@usuario) also enriches the generic row",
    _findBrebMergeMatch(parsed, data, HDRS),
    { rowIndex1Based: 2, action: "enrich" }
  );
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
