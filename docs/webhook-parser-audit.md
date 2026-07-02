# Auditoría de parsers de `webhook.gs` (Loop 2)

> Fecha: 2026-06-24 · Alcance: `parseBanco*`, `parseNotif*`, `parseMonto*`, `reverseTransaction`.
> **Modo reporte** — no se editó `webhook.gs`. Varios hallazgos dependen del formato
> exacto que envía cada banco; confirmar con 1 sample real antes de aplicar el parche.
> No se pudo ejecutar `.gs` localmente (Apps Script), así que los parches son por inspección.

## Resumen por severidad

| # | Severidad | Función | Síntoma |
|---|-----------|---------|---------|
| 1 | **P1** | `parseNotifBancolombia` | Monto inflado ×100 cuando el push trae decimales (`$45,900.00`) |
| 2 | **P1** | `parseNotifBogota` → `parseBogota` | Push sin fecha no parsea (cae a Haiku o se pierde) |
| 3 | P2 | `parseAvVillas` | `\w+` no matchea "CRÉDITO" con tilde → SMS no parsea |
| 4 | P2 | `_parseNotifAval` (fallback) | Puede capturar un fragmento de hora como monto |
| 5 | P3 | varios `parseNotif*` | `fecha: new Date()` → off-by-one cruzando medianoche |
| 6 | P3 | `parseItau` (débito/crédito) | `comercio` = "Cuenta de Ahorros" en transferencias |
| 7 | P3 | `parseMonto` / `parseMontoUS` | Sin guardia NaN; dos parsers divergentes para dinero |
| 8 | P3 | `reverseTransaction` | Solo reversa originales con `tipo === "Compra"` |

---

## P1 #1 — Bancolombia push: inflación ×100 con decimales

**Líneas 2123 y 2137.** El push hace:
```js
monto: parseMontoUS(mc[1].replace(/\./g, ""))
```
`parseMontoUS` ya quita las comas y deja el punto decimal. El `.replace(/\./g,"")`
extra **borra el punto decimal** antes de llamar a `parseMontoUS`:

- `"45,900"`     → `"45,900"`   → `parseMontoUS` → **45900** ✓
- `"45,900.00"`  → `"45,90000"` → `parseMontoUS` → **4590000** ✗ (×100)

El propio comentario del bloque documenta `"$45,900.00"` como formato conocido, así que
el caso roto es real. Nota: el SMS (`parseBancolombia`, línea 1252) usa `parseMontoUS`
directo **sin** el `.replace` y funciona — la inconsistencia es la pista.

**Ambigüedad a confirmar:** el `.replace(/\./g,"")` solo tiene sentido si el push usara
formato colombiano (`$45.900`, punto = miles). Hay que ver **un push real**:
- Si el push usa formato US (como el SMS) → eliminar el `.replace`. 
- Si mezcla formatos → usar el parser flexible (abajo).

**Parche propuesto (alinear con el SMS):**
```js
monto: parseMontoUS(mc[1]),   // sin .replace(/\./g,"")
```

## P1 #2 — Bogotá push no parsea sin fecha

**Líneas 2174–2178.** `parseNotifBogota` reusa `parseBogota` (línea 1342), cuyo regex
**exige** `el (\d{2}/\d{2}/\d{2}) (\d{2}:\d{2}:\d{2})`. El ejemplo de push documentado
("Tu compra por 130,456 fue aprobada con Tarjeta Crédito 8645 en COUNTRY CLUB") **no
trae fecha** → `parseBogota` devuelve `null` → la transacción cae al fallback de Haiku
(costo + latencia) o se pierde.

**Parche propuesto:** un regex de push dedicado con fecha opcional (usar `new Date()`
cuando falte), o hacer el bloque `el ... ` opcional en `parseBogota`:
```js
// ...8645\s*(?:el\s+(\d{2}\/\d{2}\/\d{2})\s+(\d{2}:\d{2}:\d{2}))?\s+en\s+(.+?)...
// y si no hay grupos de fecha → fecha = new Date()
```

## P2 #3 — AV Villas: tilde rompe el regex de tipo de tarjeta

**Línea 1122.** `...TARJETA\s+(\w+)\s+(\d{4})...`. `\w` no incluye `é`, así que con
"TARJETA CRÉDITO 1234" el grupo `(\w+)` matchea solo "CR" y el `\s+(\d{4})` siguiente
falla → **no hay match** → cae a fallback. Solo funciona si AV Villas manda "CREDITO"
sin tilde. Además `tipo` se infiere con `/credito/i.test(m[5])` sobre ese grupo frágil.

**Parche propuesto:** copiar el patrón robusto de Bogotá:
```js
...TARJETA\s+(Cr[eé]dito|D[eé]bito)\s+(\d{4})...
```

## P2 #4 — `_parseNotifAval` fallback captura la hora como monto

**Línea 2324.** `reGeneric = /\$?\s*([\d,.]+)\s+en\s+(.+)/i`. Si el regex principal
falla y el texto trae hora ("...15:11:08 en COUNTRY CLUB"), `[\d,.]+` puede capturar
"08" justo antes de " en" → `monto = 8`. Solo ocurre en fallback, pero produce un monto
silenciosamente falso.

**Parche propuesto:** anclar a `$` o exigir ≥3 dígitos / límite de palabra:
```js
/\$\s*([\d.,]{3,})\s+en\s+(.+)/i
```

## P3 #5 — `fecha: new Date()` en push

Todos los `parseNotif*` ponen `fecha: new Date()` (hora de llegada del push). Para
transacciones nocturnas el push puede llegar pasada la medianoche → fecha corrida un día.
Limitación aceptable (el payload de push no trae fecha), documentar nomás.

## P3 #6 — Itaú: `comercio` = tipo de cuenta en transferencias

**Líneas 1390–1391 y 1406–1407.** En débito/crédito de cuenta, `comercio` queda como
"Cuenta de Ahorros" en vez del contraparte. Si el SMS trae destinatario, extraerlo;
si no, dejar `comercio: ""` para que el UI muestre el tipo en vez de un comercio falso.

## P3 #7 — Parser de dinero: sin guardia NaN y dos variantes

`parseMonto` (quita `.` y `,`) y `parseMontoUS` (quita solo `,`) coexisten. Ninguno
valida NaN. Si un regex captura algo inesperado, se escribe `NaN` al Sheet. Propuesta:
un único parser flexible que detecte el separador decimal por posición:

```js
// Maneja "45,900.00" (US), "45.900,50" (CO), "45,900"/"45.900" (miles), "1.234.567".
function parseMontoFlexible(str) {
  var s = String(str == null ? '' : str).replace(/[^\d.,]/g, '');
  if (!s) return NaN;
  var lastSep = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','));
  if (lastSep === -1) return parseFloat(s);
  var decimals = s.length - lastSep - 1;
  if (decimals >= 1 && decimals <= 2) {           // separador final = decimal
    return parseFloat(s.slice(0, lastSep).replace(/[.,]/g, '') + '.' + s.slice(lastSep + 1));
  }
  return parseFloat(s.replace(/[.,]/g, ''));       // todos = miles
}
```
Migrar call-sites de forma incremental (empezar por Bancolombia push, P1 #1).

## P3 #8 — `reverseTransaction` solo reversa compras

**Línea 1315.** `if (String(row[tipoCol]).trim() !== "Compra") continue;`. Reversas de
transferencias/PSE no encuentran su original. Documentar; ampliar si aparece el caso.

---

## Recomendación de orden

1. Conseguir **1 sample real** de push Bancolombia y Bogotá → confirma P1 #1 y #2.
2. Aplicar P1 #1, P1 #2, P2 #3 (los de mayor impacto y parche claro).
3. Considerar `parseMontoFlexible` unificado en una iteración dedicada con tests.

> Tests: hoy no hay forma de testear `webhook.gs` localmente. Una opción futura es
> extraer los parsers puros (sin `PropertiesService`/`UrlFetchApp`) a un módulo y
> portarlos a vitest con fixtures de SMS/push reales (anonimizados).
