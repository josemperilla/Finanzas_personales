#!/usr/bin/env node
// Regression test for parseMonto (apps_script/webhook.gs).
//
// Root cause: from 2026-08-22 the Banco de Bogotá (ex-Itaú) SMS carry cents
// ("por $128,200.00"). parseMonto stripped every "." and ",", so the amount was
// stored 100 times too large (12,820,000 for a 128,200 cinema ticket). This test
// loads the pure function straight from webhook.gs and checks thousands
// separators still work while cents are dropped.
//
// Run: node scripts/test-parse-monto.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(path.join(__dirname, "../apps_script/webhook.gs"), "utf8");

const match = source.match(/function parseMonto\([\s\S]*?\n}\n/);
if (!match) {
  console.error("FAIL: could not find parseMonto in webhook.gs");
  process.exit(1);
}

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(match[0] + "\nthis.parseMonto = parseMonto;", sandbox);
const parseMonto = sandbox.parseMonto;

let pass = 0, fail = 0;
function assert(input, expected) {
  const actual = parseMonto(input);
  if (actual === expected) { pass++; return; }
  fail++;
  console.error(`FAIL: parseMonto(${JSON.stringify(input)}) = ${actual}, expected ${expected}`);
}

// Con centavos (el caso del bug)
assert("128,200.00", 128200);
assert("6,125.00", 6125);
assert("3,500.00", 3500);
assert("2000000.00", 2000000);
assert("128.200,00", 128200);
// Sin centavos: los separadores de miles siguen funcionando
assert("414,380", 414380);
assert("1,095,059", 1095059);
assert("50.000", 50000);
assert("847.430", 847430);
assert("250", 250);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
