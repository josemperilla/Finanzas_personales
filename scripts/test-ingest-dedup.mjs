#!/usr/bin/env node
// Tests de los arreglos de duplicación y unificación de productos (webhook.gs).
//
// Contexto: Banco de Bogotá compró a Itaú. El pie del SMS cambió y con él se
// rompió el ruteo de parsers, mandando meses de transacciones al fallback de IA
// (tarjeta "8439" pelada, banco mal atribuido, comercio no determinista).
// Aparte, el iPhone reenvía el mismo SMS: en los datos reales hay pares con
// SMS_Original idéntico separados por 6 ms a 5 s.
//
// Las funciones puras se cargan directo de webhook.gs (sin servicios de GAS),
// igual que scripts/test-itau-breb-merge.mjs.
//
// Run: node scripts/test-ingest-dedup.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(path.join(__dirname, "../apps_script/webhook.gs"), "utf8");

function grabFn(name) {
  const m = source.match(new RegExp(`\\nfunction ${name}\\([\\s\\S]*?\\n}\\n`));
  if (!m) throw new Error(`no se encontró function ${name} en webhook.gs`);
  return m[0];
}
function grabVar(name) {
  const m = source.match(new RegExp(`\\nvar ${name} = [\\s\\S]*?;\\n`));
  if (!m) throw new Error(`no se encontró var ${name} en webhook.gs`);
  return m[0];
}

const ctx = { Logger: { log() {} }, console };
vm.createContext(ctx);
vm.runInContext(
  [
    grabVar("BANCO_BOGOTA"),
    grabVar("CANONICAL_BANCO"),
    grabVar("VETO_RULES"),
    grabVar("BANCO_RENOMBRES_CLAVES"),
    grabFn("_normalizaNombreBanco"),
    grabFn("_renombreBanco"),
    grabVar("SMS_PARSERS"),
    grabFn("detectBank"),
    grabFn("parseAnyBank"),
    grabFn("isVetoed"),
    grabFn("normalizeTipo"),
    grabFn("parseMonto"),
    grabFn("parseMontoUS"),
    grabFn("normalizeComercio"),
    grabFn("parseFechaBogota"),
    grabFn("parseFechaItau"),
    grabFn("parseBogota"),
    grabFn("parseItau"),
    grabFn("parseDavivienda"),
    grabFn("parseBancolombia"),
    grabFn("parseAvVillas"),
    grabFn("_normalizeIngestText"),
    grabFn("_planMigracionProductos"),
  ].join("\n"),
  ctx
);

let fallos = 0;
function check(nombre, cond, detalle) {
  if (cond) { console.log(`  ✓ ${nombre}`); }
  else { console.log(`  ✗ ${nombre}${detalle ? " → " + detalle : ""}`); fallos++; }
}

// ── SMS reales del Sheet ────────────────────────────────────────────────
const SMS_NUEVO_BOGOTA =
  "Se realizo una compra en RAPPI COLOMBIA*DL desde tu Tarjeta Credito ****8439 por $32,990  el 2026/08/10 06:01:38 Si no fuiste tu, comunicate con la Servilinea de Banco de Bogota.";
const SMS_ITAU_LEGACY =
  "Se realizo una compra en RAPPI COLOMBIA*DL desde tu Tarjeta Credito ****8439 por $24,200  el 2026/06/22 09:56:37 ITAU Tel: 5818181 Bta o 018000512633 Nal";
const SMS_BOGOTA_PROPIO =
  "Banco de Bogota: Tu compra por 36,119 fue aprobada con Tarjeta Crédito 8645 el 13/06/26 11:40:24 en ANTHROPIC ¿Dudas? Llama a la Servilinea ...";
const SMS_TRANSF_SIN_ARTICULO =
  "Se realizo Transferencia de tu Cuenta de Ahorros ****8448 por $205,966 el 2026/07/29 16:29:59  ITAU Tel: 5818181 Bta o 018000512633 Nal";
const SMS_BREB_ENTRANTE =
  "ITAU: has recibido una transferencia a tu cuenta AHO 8448 asociada a la llave Bre-B 3007183487 por $ 61000.00 el 2026-07-30 a las 21:12:02.";
const SMS_AVVILLAS =
  "AVVillas. 01/08/26 01:03 COMPRA CON TU TARJETA CREDITO 3403 POR $ 50,000 EN I AM SCI BOGOTA SAS";
const SMS_DALE_PROMO =
  "dale!: Jose, es hora del cafe. Compra tu combo dale! por $14.900 en Cafe Quindio con tu Tarjeta Debito dale!. AplicaTyC  https://smsdale.com.co/JCMdKIXU";

// ── 1. Ruteo: el formato manda, no el pie del mensaje ───────────────────
console.log("\n1. Detección de banco tras la compra de Itaú por Banco de Bogotá");
check("el SMS con pie de Bogotá se rutea al parser de Itaú",
  ctx.detectBank(SMS_NUEVO_BOGOTA) === "itau", `dio ${ctx.detectBank(SMS_NUEVO_BOGOTA)}`);
check("el SMS legacy de Itaú sigue detectándose",
  ctx.detectBank(SMS_ITAU_LEGACY) === "itau");
check("el formato propio de Bogotá NO se desvía a Itaú",
  ctx.detectBank(SMS_BOGOTA_PROPIO) === "bogota", `dio ${ctx.detectBank(SMS_BOGOTA_PROPIO)}`);
check("AV Villas intacto", ctx.detectBank(SMS_AVVILLAS) === "avvillas");

// ── 2. El parseo produce el producto correcto, no una tarjeta pelada ────
console.log("\n2. Producto correcto (la causa de que 8439 apareciera fragmentado)");
const pNuevo = ctx.parseItau(SMS_NUEVO_BOGOTA);
check("tarjeta completa, no '8439' pelado",
  pNuevo && pNuevo.tarjeta === "Tarjeta Credito ****8439", JSON.stringify(pNuevo && pNuevo.tarjeta));
check("banco unificado a Banco de Bogotá",
  pNuevo && pNuevo.banco === "Banco de Bogotá", JSON.stringify(pNuevo && pNuevo.banco));
check("el legacy de Itaú da EXACTAMENTE el mismo producto (mismo grupo)",
  ctx.parseItau(SMS_ITAU_LEGACY).tarjeta === pNuevo.tarjeta &&
  ctx.parseItau(SMS_ITAU_LEGACY).banco === pNuevo.banco);
check("Bogotá 8645 queda en el mismo banco pero distinto producto",
  ctx.parseBogota(SMS_BOGOTA_PROPIO).banco === "Banco de Bogotá" &&
  ctx.parseBogota(SMS_BOGOTA_PROPIO).tarjeta !== pNuevo.tarjeta);

const pTransf = ctx.parseItau(SMS_TRANSF_SIN_ARTICULO);
check("'Se realizo Transferencia' (sin artículo) ya parsea",
  pTransf && pTransf.tarjeta === "Cuenta de Ahorros ****8448", JSON.stringify(pTransf && pTransf.tarjeta));

const pBreb = ctx.parseItau(SMS_BREB_ENTRANTE);
check("Bre-B entrante parsea y se marca como ingreso",
  pBreb && pBreb.tarjeta === "Cuenta de Ahorros ****8448" && pBreb.income === true && pBreb.monto === 61000,
  JSON.stringify(pBreb));

check("parseAnyBank rescata aunque el banco declarado sea el equivocado",
  (() => { const r = ctx.parseAnyBank(SMS_NUEVO_BOGOTA, "bogota"); return r && r.tarjeta === "Tarjeta Credito ****8439"; })());

// ── 3. Promos de dale! ──────────────────────────────────────────────────
console.log("\n3. Publicidad que entraba como compra");
check("la promo de dale! queda vetada", ctx.isVetoed(SMS_DALE_PROMO) === true);
check("un SMS transaccional real NO se veta", ctx.isVetoed(SMS_NUEVO_BOGOTA) === false);

// ── 4. Huella de idempotencia ───────────────────────────────────────────
console.log("\n4. Normalización para detectar el reenvío");
check("el doble espacio real del SMS no rompe la comparación",
  ctx._normalizeIngestText("por $32,990  el 2026") === ctx._normalizeIngestText("por $32,990 el 2026"));
check("dos compras reales del mismo comercio NO colisionan (hora distinta en el texto)",
  ctx._normalizeIngestText(SMS_NUEVO_BOGOTA) !== ctx._normalizeIngestText(SMS_ITAU_LEGACY));
check("texto vacío no produce huella", ctx._normalizeIngestText("   ") === "");

// ── 5. Migración sobre una muestra real del Sheet ───────────────────────
console.log("\n5. Migración de la base (muestra real)");
const H = ["Timestamp","Fecha","Banco","Tipo","Monto (COP)","Comercio","Tarjeta/Cuenta","Categoría","SMS_Original","Fuente","Nota"];
const fila = (ts, banco, monto, comercio, tarjeta, sms) =>
  [ts, "", banco, "Compra", monto, comercio, tarjeta, "Otro", sms, "sms", ""];

const muestra = [H,
  // par duplicado real (938 ms) — texto idéntico
  fila("2026-08-10 06:02:18.172", "Banco de Bogotá", 32990, "RAPPI COLOMBIA*DL", "8439", SMS_NUEVO_BOGOTA),
  fila("2026-08-10 06:02:19.110", "Banco de Bogotá", 32990, "RAPPI COLOMBIA*DL", "8439", SMS_NUEVO_BOGOTA),
  // par duplicado real de AV Villas (6 ms)
  fila("2026-08-01 02:04:35.257", "AV Villas", 74296, "I AM SCI BOGOTA SAS", "Tarjeta 3403", SMS_AVVILLAS),
  fila("2026-08-01 02:04:35.263", "AV Villas", 74296, "I AM SCI BOGOTA SAS", "Tarjeta 3403", SMS_AVVILLAS),
  // histórico con etiqueta completa: es la fuente del catálogo de últimos-4
  fila("2026-06-22 09:56:47", "Itaú", 24200, "RAPPI COLOMBIA*DL", "Tarjeta Credito ****8439", SMS_ITAU_LEGACY),
  // Bogotá propio, otro producto del mismo banco
  fila("2026-06-13 11:40:41", "Bogotá", 36119, "ANTHROPIC", "Tarjeta Crédito 8645", SMS_BOGOTA_PROPIO),
  // transferencia con cuenta pelada
  fila("2026-07-29 16:31:28", "Itaú", 205966, "Transferencia", "8448", SMS_TRANSF_SIN_ARTICULO),
  fila("2026-06-16 19:19:06", "ITAU", 1000, "Cuenta de Ahorros", "Cuenta de Ahorros ****8448",
       "Se realizo un debito de tu Cuenta de Ahorros ****8448 por $1,000 el 2026/06/16 19:18:00 ITAU"),
  fila("2026-06-19 16:53:56", "Itaú", 170560, "Factura Luz", "Cuenta de Ahorros ****8448",
       "Se realizo un debito de tu Cuenta de Ahorros ****8448 por $170,560 el 2026/06/19 16:51:44 ITAU"),
  // promo
  fila("2026-08-01 13:10:03", "Dale", 14900, "Cafe Quindio", "Débito", SMS_DALE_PROMO),
  // dos compras REALES del mismo monto y comercio, minutos distintos → no tocar
  fila("2026-08-04 21:42:27", "Bogotá", 77766, "WOK CL 90", "Tarjeta Crédito 8645",
       "Banco de Bogota: Tu compra por 77,766 fue aprobada con Tarjeta Crédito 8645 el 04/08/26 21:42:16 en WOK CL 90"),
  fila("2026-08-04 21:42:36", "Bogotá", 77766, "WOK CL 90", "Tarjeta Crédito 8645",
       "Banco de Bogota: Tu compra por 77,766 fue aprobada con Tarjeta Crédito 8645 el 04/08/26 21:42:29 en WOK CL 90"),
  // importación manual repetida → NO se toca (el texto no identifica la transacción)
  fila("2026-06-04 18:59:44", "Bogotá", 87230, "Mad Records Sas", "", "MANUAL"),
  fila("2026-06-04 18:59:42", "Bogotá", 87230, "Mad Records Sas", "", "MANUAL"),
];

const plan = ctx._planMigracionProductos(muestra, H);
check("borra exactamente los 2 duplicados por reenvío",
  plan.resumen.duplicados === 2, `dio ${plan.resumen.duplicados}`);
check("borra la promo de dale!", plan.resumen.promos === 1, `dio ${plan.resumen.promos}`);
check("NO borra las dos compras reales de WOK ni las manuales repetidas",
  plan.deletes.length === 3, `borraría ${plan.deletes.length} filas: ${plan.deletes}`);
check("unifica '8439' → 'Tarjeta Credito ****8439'",
  plan.updates.some(u => u.col1 === H.indexOf("Tarjeta/Cuenta") + 1 && u.valor === "Tarjeta Credito ****8439"));
check("unifica '8448' → 'Cuenta de Ahorros ****8448'",
  plan.updates.some(u => u.col1 === H.indexOf("Tarjeta/Cuenta") + 1 && u.valor === "Cuenta de Ahorros ****8448"));
check("'ITAU' en mayúsculas también se renombra",
  ctx._renombreBanco("ITAU") === "Banco de Bogotá" && ctx._renombreBanco("Itaú") === "Banco de Bogotá" &&
  ctx._renombreBanco("Bogotá") === "Banco de Bogotá" && ctx._renombreBanco("Banco de Bogotá") === null &&
  ctx._renombreBanco("AV Villas") === null);
check("renombra Itaú y Bogotá a Banco de Bogotá",
  plan.updates.filter(u => u.col1 === H.indexOf("Banco") + 1 && u.valor === "Banco de Bogotá").length === plan.resumen.banco &&
  plan.resumen.banco >= 5, `renombró ${plan.resumen.banco}`);
check("los borrados van en orden descendente (no corren los índices)",
  plan.deletes.every((v, i, a) => i === 0 || a[i - 1] > v), JSON.stringify(plan.deletes));

// idempotencia: aplicar el plan y volver a planear no debe encontrar nada
const migrada = muestra.map(r => r.slice());
for (const u of plan.updates) migrada[u.row1 - 1][u.col1 - 1] = u.valor;
for (const r of plan.deletes) migrada.splice(r - 1, 1);
const plan2 = ctx._planMigracionProductos(migrada, H);
check("correr la migración dos veces no cambia nada la segunda",
  plan2.updates.length === 0 && plan2.deletes.length === 0,
  `2ª pasada: ${plan2.updates.length} updates, ${plan2.deletes.length} deletes`);

console.log(fallos === 0 ? "\n✅ Todo pasa\n" : `\n❌ ${fallos} fallo(s)\n`);
process.exit(fallos === 0 ? 0 : 1);
