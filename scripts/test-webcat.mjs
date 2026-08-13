#!/usr/bin/env node
// Tests de la categorización de comercios nuevos por búsqueda web (webhook.gs).
//
// Lo que se puede probar sin red es la mitad que importa que no se rompa: la
// normalización del nombre del comercio (determina si dos recibos comparten
// entrada de caché), la vigencia de la caché negativa, y el parseo de la
// respuesta del modelo (que valida contra ALLOWED_CATEGORIES y descarta
// cualquier cosa fuera de la lista).
//
// La llamada a la API no se prueba acá — para eso está la verificación contra
// comercios reales, que sí pega contra Anthropic.
//
// Run: node scripts/test-webcat.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
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
  // Tolera el alineado de los `=` en columna que usa webhook.gs.
  const m = source.match(new RegExp(`\\nvar ${name}\\s*=[\\s\\S]*?;\\n`));
  if (!m) throw new Error(`no se encontró var ${name} en webhook.gs`);
  return m[0];
}

// Propiedades de script simuladas: lo que el diccionario usa como almacén.
const props = {};
const ctx = {
  Logger: { log() {} },
  console,
  PropertiesService: {
    getScriptProperties: () => ({
      getProperty: (k) => (k in props ? props[k] : null),
      setProperty: (k, v) => { props[k] = String(v); },
      getProperties: () => ({ ...props }),
    }),
  },
  Utilities: {
    Charset: { UTF_8: "utf8" },
    DigestAlgorithm: { MD5: "MD5" },
    computeDigest: (_alg, text) => {
      // MD5 con signo, como lo devuelve GAS (bytes -128..127).
      const buf = createHash("md5").update(text, "utf8").digest();
      return Array.from(buf).map((b) => (b > 127 ? b - 256 : b));
    },
  },
};
vm.createContext(ctx);

vm.runInContext(
  [
    grabVar("ALLOWED_CATEGORIES"),
    grabVar("WEBCAT_PREFIX"),
    grabVar("WEBCAT_QUEUE_KEY"),
    grabVar("WEBCAT_DESCONOCIDO"),
    grabVar("WEBCAT_REINTENTO_D"),
    grabVar("WEBCAT_MAX_POR_RUN"),
    grabVar("WEBCAT_MAX_COLA"),
    grabVar("WEBCAT_SIN_CATEGORIA"),
    grabVar("_webcatMemo"),
    grabFn("_webcatSinCategoria"),
    grabFn("_webcatCargar"),
    grabFn("_webcatClave"),
    grabFn("_webcatNormalizar"),
    grabFn("_webcatGet"),
    grabFn("_webcatIntentado"),
    grabFn("_webcatPut"),
    grabFn("_encolarComercioDesconocido"),
  ].join("\n"),
  ctx,
);

let pass = 0, fail = 0;
function ok(cond, label) {
  if (cond) { pass++; console.log("  ✓ " + label); }
  else { fail++; console.log("  ✗ " + label); }
}
function eq(actual, expected, label) {
  ok(actual === expected, `${label}  (esperado ${JSON.stringify(expected)}, dio ${JSON.stringify(actual)})`);
}
function reset() {
  for (const k of Object.keys(props)) delete props[k];
  ctx._webcatMemo = null;
}

console.log("\n── Normalización del nombre del comercio ──");
{
  const n = ctx._webcatNormalizar;
  eq(n("RAPPI COLOMBIA*DL"), "RAPPI COLOMBIA", "quita el sufijo de canal del adquirente");
  eq(n("  rappi   colombia  "), "RAPPI COLOMBIA", "mayúsculas y espacios colapsados");
  eq(n("EXITO SUPERM 1234"), "EXITO SUPERM", "quita el número de sucursal del final");
  eq(n("CINE COLOMBIA BOGOTA"), "CINE COLOMBIA", "quita el código de ciudad del final");
  eq(n("DIDI RIDES*DL"), "DIDI RIDES", "el caso real que el fallback de IA transcribía de dos formas");
  eq(n("DIDI RIDES"), "DIDI RIDES", "…y la otra forma cae en la misma clave");
  eq(n("CAFÉ QUINDÍO"), "CAFÉ QUINDÍO", "conserva las tildes y la ñ");
  eq(n(""), "", "vacío no revienta");
  eq(n(null), "", "null no revienta");
  ok(ctx._webcatClave("RAPPI COLOMBIA*DL") === ctx._webcatClave("rappi colombia"),
     "dos formas del mismo comercio comparten clave de caché");
  ok(ctx._webcatClave("RAPPI") !== ctx._webcatClave("UBER"),
     "comercios distintos no colisionan");
  eq(ctx._webcatClave(""), null, "sin nombre no hay clave");
}

console.log("\n── Qué cuenta como \"sin categorizar\" ──");
{
  const sin = ctx._webcatSinCategoria;

  // Los tres que sí. Anclarse solo a "Otro" dejaba fuera a más de la mitad del
  // histórico: el import retroactivo de extractos escribe la celda vacía y una
  // tanda vieja quedó en "Otros" (plural).
  ok(sin("Otro"), '"Otro" está sin categorizar');
  ok(sin(""), "la celda vacía está sin categorizar");
  ok(sin("Otros"), '"Otros" (plural, legado del import) está sin categorizar');
  ok(sin(null), "null no revienta y cuenta como sin categorizar");
  ok(sin(undefined), "undefined tampoco revienta");
  ok(sin("   "), "solo espacios cuenta como vacío");
  ok(sin(" Otro "), "los espacios alrededor no esconden un \"Otro\"");

  // Los que NO: pisar esto sería perder información que alguien puso.
  ok(!sin("Restaurantes"), "una categoría válida no se toca");
  ok(!sin("Seguros"), '"Seguros" no está en el allowlist, pero es la decisión de alguien: no se toca');
  ok(!sin("Transferencia"), '"Transferencia" (legado) tampoco se toca');
  ok(!sin("Suscripción "), '"Suscripción " con espacio al final tampoco: trimmed sigue siendo una etiqueta');
  ok(!sin("Bre-B"), "Bre-B no se toca");

  // Ninguna categoría del allowlist —salvo "Otro"— puede contar como vacía, o
  // el relleno pisaría trabajo ya hecho.
  const pisables = ctx.ALLOWED_CATEGORIES.filter((c) => c !== "Otro" && sin(c));
  ok(pisables.length === 0,
     `ninguna categoría válida se considera vacía${pisables.length ? " (pisables: " + pisables.join(", ") + ")" : ""}`);
}

console.log("\n── Diccionario: lectura y escritura ──");
{
  reset();
  eq(ctx._webcatGet("KONNYE"), "", "comercio nunca visto no devuelve nada");
  ok(!ctx._webcatIntentado("KONNYE"), "…y figura como no intentado");

  ctx._webcatPut("KONNYE", "Restaurantes", "web");
  eq(ctx._webcatGet("KONNYE"), "Restaurantes", "lo guardado se lee de vuelta");
  eq(ctx._webcatGet("konnye"), "Restaurantes", "la lectura también normaliza");
  ok(ctx._webcatIntentado("KONNYE"), "queda marcado como intentado");

  // El diccionario es sospechoso por defecto: una categoría fuera de la lista
  // canónica se descarta al leer, no al escribir.
  reset();
  ctx._webcatPut("ALGO", "Mascotas", "web");
  eq(ctx._webcatGet("ALGO"), "", "una categoría fuera de ALLOWED_CATEGORIES se descarta al leer");
}

console.log("\n── Caché negativa y su vencimiento ──");
{
  reset();
  ctx._webcatPut("COMERCIO RARO", "", "web");
  eq(ctx._webcatGet("COMERCIO RARO"), "", "un desconocido no devuelve categoría");
  ok(ctx._webcatIntentado("COMERCIO RARO"), "pero no se vuelve a buscar de inmediato");

  // Envejecer la entrada más allá de la ventana de reintento.
  const clave = ctx._webcatClave("COMERCIO RARO");
  const viejo = JSON.parse(props[clave]);
  viejo.t = Date.now() - (ctx.WEBCAT_REINTENTO_D + 1) * 86400000;
  props[clave] = JSON.stringify(viejo);
  ctx._webcatMemo = null;
  ok(!ctx._webcatIntentado("COMERCIO RARO"),
     `pasados ${ctx.WEBCAT_REINTENTO_D} días sí se reintenta`);

  // Un comercio resuelto no se reintenta nunca, por viejo que sea.
  reset();
  ctx._webcatPut("EXITO", "Mercado", "web");
  const c2 = ctx._webcatClave("EXITO");
  const v2 = JSON.parse(props[c2]);
  v2.t = Date.now() - 999 * 86400000;
  props[c2] = JSON.stringify(v2);
  ctx._webcatMemo = null;
  ok(ctx._webcatIntentado("EXITO"), "un resuelto no caduca");
  eq(ctx._webcatGet("EXITO"), "Mercado", "…y sigue resolviendo");
}

console.log("\n── Cola de pendientes ──");
{
  reset();
  ctx._encolarComercioDesconocido("KONNYE");
  ctx._encolarComercioDesconocido("konnye");
  ctx._encolarComercioDesconocido("KONNYE*DL");
  eq(JSON.parse(props[ctx.WEBCAT_QUEUE_KEY]).length, 1,
     "el mismo comercio en tres formas se encola una sola vez");

  ctx._encolarComercioDesconocido("OTRA COSA");
  eq(JSON.parse(props[ctx.WEBCAT_QUEUE_KEY]).length, 2, "otro comercio sí entra");

  reset();
  ctx._webcatPut("YA VISTO", "Salud", "web");
  ctx._encolarComercioDesconocido("YA VISTO");
  ok(!props[ctx.WEBCAT_QUEUE_KEY] || JSON.parse(props[ctx.WEBCAT_QUEUE_KEY]).length === 0,
     "un comercio ya resuelto no se encola");

  reset();
  ctx._webcatPut("SIN SUERTE", "", "web");
  ctx._encolarComercioDesconocido("SIN SUERTE");
  ok(!props[ctx.WEBCAT_QUEUE_KEY] || JSON.parse(props[ctx.WEBCAT_QUEUE_KEY]).length === 0,
     "un desconocido reciente tampoco se re-encola");

  reset();
  ctx._encolarComercioDesconocido("");
  ctx._encolarComercioDesconocido(null);
  ok(!props[ctx.WEBCAT_QUEUE_KEY] || JSON.parse(props[ctx.WEBCAT_QUEUE_KEY]).length === 0,
     "nombres vacíos no entran a la cola");

  // Ojo con los nombres del fixture: "COMERCIO 100" y "COMERCIO 224" normalizan
  // los dos a "COMERCIO" (el normalizador quita sufijos numéricos de sucursal),
  // así que un contador numérico colapsa la cola en vez de llenarla. Letras.
  reset();
  const nombre = (i) => "COMERCIO " + String.fromCharCode(65 + (i % 26)).repeat(1 + Math.floor(i / 26));
  const distintos = new Set();
  for (let i = 0; i < ctx.WEBCAT_MAX_COLA + 25; i++) {
    distintos.add(ctx._webcatNormalizar(nombre(i)));
    ctx._encolarComercioDesconocido(nombre(i));
  }
  ok(distintos.size === ctx.WEBCAT_MAX_COLA + 25, "el fixture genera nombres realmente distintos");
  eq(JSON.parse(props[ctx.WEBCAT_QUEUE_KEY]).length, ctx.WEBCAT_MAX_COLA,
     "la cola tiene techo (nada la puede inundar)");
}

console.log("\n── Parseo de la respuesta del modelo ──");
{
  // Réplica exacta del parseo de _categorizeViaWebSearch, para poder
  // ejercitarlo sin pegarle a la API.
  const ALLOWED = ctx.ALLOWED_CATEGORIES;
  const parse = (texto) => {
    const m = /CATEGORIA:\s*([A-Za-zÁÉÍÓÚÑáéíóúñ\- ]+)/.exec(texto || "");
    if (!m) return "";
    const cat = m[1].trim();
    if (/^DESCONOCIDO$/i.test(cat)) return "";
    return ALLOWED.indexOf(cat) !== -1 && cat !== "Otro" ? cat : "";
  };

  eq(parse("Busqué y es una cadena de comida.\nCATEGORIA: Restaurantes"), "Restaurantes",
     "extrae la categoría de la última línea");
  eq(parse("CATEGORIA: Mercado"), "Mercado", "funciona sin preámbulo");
  eq(parse("No pude identificarlo.\nCATEGORIA: DESCONOCIDO"), "",
     "DESCONOCIDO se traduce a sin-categoría");
  eq(parse("CATEGORIA: desconocido"), "", "…sin importar mayúsculas");
  eq(parse("CATEGORIA: Otro"), "",
     "'Otro' se rechaza: es el valor por defecto, no una respuesta");
  eq(parse("CATEGORIA: Mascotas"), "",
     "una categoría inventada fuera de la lista se descarta");
  eq(parse("Creo que es un restaurante"), "", "sin la línea marcador no devuelve nada");
  eq(parse(""), "", "respuesta vacía no revienta");
  eq(parse(null), "", "respuesta nula no revienta");
  eq(parse("CATEGORIA: Bre-B"), "Bre-B",
     "acepta la categoría con guion (aunque el prompt la prohíba para comercios)");

  // Toda categoría válida tiene que sobrevivir el ida y vuelta.
  let todas = true;
  for (const c of ALLOWED) {
    if (c === "Otro") continue;
    if (parse("CATEGORIA: " + c) !== c) { todas = false; console.log("      falló: " + c); }
  }
  ok(todas, `las ${ALLOWED.length - 1} categorías válidas sobreviven el parseo`);
}

console.log(`\n${pass} pasaron, ${fail} fallaron\n`);
process.exit(fail ? 1 : 0);
