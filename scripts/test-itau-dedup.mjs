#!/usr/bin/env node
// Regression test for _isDuplicateItauSmsInRows (apps_script/webhook.gs).
//
// Root cause: Itaú sends two separate SMS for one Bre-B transfer — a generic
// account-debit notification and a Bre-B-specific one. Both parse successfully
// since PR #30 added the Bre-B pattern, so without a dedup check the same
// real-world transaction gets appended twice. This test loads the pure
// function straight from webhook.gs (no GAS services needed) and asserts it
// catches the real duplicate scenario without over-matching legitimate
// same-amount transactions.
//
// Run: node scripts/test-itau-dedup.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(path.join(__dirname, "../apps_script/webhook.gs"), "utf8");

const match = source.match(
  /function _isDuplicateItauSmsInRows\([\s\S]*?\n}\n/
);
if (!match) {
  console.error("FAIL: could not find _isDuplicateItauSmsInRows in webhook.gs");
  process.exit(1);
}

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(match[0] + "\nthis._isDuplicateItauSmsInRows = _isDuplicateItauSmsInRows;", sandbox);
const _isDuplicateItauSmsInRows = sandbox._isDuplicateItauSmsInRows;

const HDRS = [
  "Timestamp", "Fecha", "Banco", "Tipo", "Monto (COP)",
  "Comercio", "Tarjeta/Cuenta", "Categoría", "SMS_Original", "Fuente", "Nota"
];

function row({ banco, monto, tarjeta, fecha }) {
  const r = new Array(HDRS.length).fill("");
  r[HDRS.indexOf("Banco")] = banco;
  r[HDRS.indexOf("Monto (COP)")] = monto;
  r[HDRS.indexOf("Tarjeta/Cuenta")] = tarjeta;
  r[HDRS.indexOf("Fecha")] = fecha;
  return r;
}

let pass = 0, fail = 0;
function assert(name, actual, expected) {
  if (actual === expected) {
    pass++;
    console.log(`PASS: ${name}`);
  } else {
    fail++;
    console.error(`FAIL: ${name} — expected ${expected}, got ${actual}`);
  }
}

// Scenario 1: real screenshot case — "Cuenta de Ahorros" row already recorded,
// then the Bre-B-specific SMS for the same transfer arrives 9s later.
{
  const rows = [HDRS, row({
    banco: "Itaú", monto: 18000, tarjeta: "Cuenta de Ahorros ****8448",
    fecha: "2026-07-02 07:34:00"
  })];
  const parsed = {
    monto: 18000, tarjeta: "Cuenta de Ahorros ****8448",
    fecha: new Date("2026-07-02T07:34:09")
  };
  assert("catches the real Bre-B double-notification", _isDuplicateItauSmsInRows(parsed, rows, HDRS), true);
}

// Scenario 2: different amount → not a duplicate.
{
  const rows = [HDRS, row({
    banco: "Itaú", monto: 18000, tarjeta: "Cuenta de Ahorros ****8448",
    fecha: "2026-07-02 07:34:00"
  })];
  const parsed = {
    monto: 25000, tarjeta: "Cuenta de Ahorros ****8448",
    fecha: new Date("2026-07-02T07:34:09")
  };
  assert("different amount is not flagged", _isDuplicateItauSmsInRows(parsed, rows, HDRS), false);
}

// Scenario 3: same amount, different account → not a duplicate.
{
  const rows = [HDRS, row({
    banco: "Itaú", monto: 18000, tarjeta: "Cuenta de Ahorros ****8448",
    fecha: "2026-07-02 07:34:00"
  })];
  const parsed = {
    monto: 18000, tarjeta: "Cuenta Corriente ****1234",
    fecha: new Date("2026-07-02T07:34:09")
  };
  assert("different account is not flagged", _isDuplicateItauSmsInRows(parsed, rows, HDRS), false);
}

// Scenario 4: same amount + account, but outside the 3-minute window → real
// repeat purchase, must NOT be dropped.
{
  const rows = [HDRS, row({
    banco: "Itaú", monto: 18000, tarjeta: "Cuenta de Ahorros ****8448",
    fecha: "2026-07-02 07:34:00"
  })];
  const parsed = {
    monto: 18000, tarjeta: "Cuenta de Ahorros ****8448",
    fecha: new Date("2026-07-02T07:40:00") // 6 minutes later
  };
  assert("legit repeat purchase outside window is not flagged", _isDuplicateItauSmsInRows(parsed, rows, HDRS), false);
}

// Scenario 5: same amount/account/window but a different bank's row → ignored.
{
  const rows = [HDRS, row({
    banco: "Davivienda", monto: 18000, tarjeta: "****8448",
    fecha: "2026-07-02 07:34:00"
  })];
  const parsed = {
    monto: 18000, tarjeta: "Cuenta de Ahorros ****8448",
    fecha: new Date("2026-07-02T07:34:09")
  };
  assert("other banks are ignored", _isDuplicateItauSmsInRows(parsed, rows, HDRS), false);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
