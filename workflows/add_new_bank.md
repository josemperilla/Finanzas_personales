# SOP: Agregar un Nuevo Banco

## Cuándo usar este workflow

Cuando necesites soportar notificaciones/extractos de un banco que la app aún no parsea.

## ⚠️ Fuente de verdad

El parsing de bancos **canónico y vivo** vive en `apps_script/webhook.gs` (funciones
`parseBogota`, `parseItau`, `parseDavivienda`, `parseBancolibia`, `parseAvVillas`).
Es por ahí donde entra la ingestion diaria (iOS Shortcuts → webhook). **Cualquier
parser nuevo se agrega ahí.**

> El pipeline Python de PDF/CSV (`pdfplumber`) que existía en `tools/ingest/parsers/`
> quedó archivado en `archive/tools/`. Si se revive esa vía (statements PDF batch),
> actualizar también ahí — pero hoy NO es la vía de ingestion del app.

## Pasos (canal vivo: SMS en webhook.gs)

### 1. Obtener muestras
Consigue 2-3 SMS/notificaciones reales del banco (texto completo, tal como llegan).

### 2. Inspeccionar el formato
Identifica cómo el banco codifica: monto, fecha, último 4 dígitos, tipo (compra/pago/abono),
y el comercio. Banco de Bogotá y Itaú usan formatos distintos — ver "Gotchas" abajo.

### 3. Agregar el parser en `apps_script/webhook.gs`
Crea una función `parseNuevoBanco(sms, userId)` siguiendo el patrón de las existentes
(retorna `{ banco, tipo, monto, fecha, comercio, tarjeta, smsOriginal }` o `null` si
no matchea).

### 4. Registrar en el dispatcher
En `detectBank`, agrega la condición de detección, y en `SMS_PARSERS` la entrada
del parser nuevo para que `parseAnyBank` lo pruebe como red de seguridad.

> **Detecta por la ESTRUCTURA del mensaje, no por la marca.** Un banco puede
> cambiar el encabezado o el pie del SMS sin cambiar el formato — y el nombre del
> banco puede desaparecer en una fusión. Pasó de verdad: Banco de Bogotá compró a
> Itaú y cambió el pie de `ITAU Tel: 5818181...` a `Si no fuiste tu, comunicate
> con la Servilinea de Banco de Bogota.`. `detectBank` buscaba `\bITAU\b`, dejó de
> reconocerlo, y **meses de transacciones cayeron al fallback de IA** con la
> tarjeta mal transcrita (`8439` pelado en vez de `Tarjeta Credito ****8439`),
> partiendo el producto en dos. Ancla el patrón a la forma
> (`Se realizo una compra en X desde tu Tarjeta ...`), no al pie.

### 4.1 Elegir el nombre visible del banco
Agrega el banco a `CANONICAL_BANCO` en `webhook.gs` **y** a `BANKS` en
`pwa/src/lib/banks.ts`, con exactamente la misma cadena. La PWA agrupa productos
por `banco|ultimos4`: si los dos nombres difieren, el mismo plástico aparece como
dos productos. Ver `docs/DATA_MODEL.md` §1.1 para la lista completa de los cinco
lugares que tienen que coincidir.

Si el banco tiene un `_bankKey` propio, úsalo en cualquier lógica que dependa del
**origen del parse** (como las guardas de `mergeBrebDuplicate`) en vez del nombre
visible, que puede cambiar.

### 5. Probar
- Desde el editor de Apps Script: llama `parseNuevoBanco("SMS de ejemplo", "userId")`
  con las muestras del paso 1 y verifica los campos extraídos.
- O envía un SMS de prueba por el webhook (`type=parseSms` o el canal que use el Shortcut).

### 6. Documentar gotchas
Agrega una sección abajo con los quirks específicos del banco.

## Gotchas por banco

### Banco de Bogotá
- Transacciones comprimidas en celdas multi-línea (en extractos PDF).
- Montos en formato US con coma como miles: `89,262` = 89.262 COP.
- Transacciones en moneda extranjera: segunda línea en descripción con `EUR 84,20`.

### Itaú (hoy Banco de Bogotá)
- **Banco de Bogotá lo compró en 2026.** El nombre visible de sus productos
  (`****8439`, `****8448`) es `Banco de Bogotá`; `Itaú` ya no es un valor válido
  de la columna `Banco`. El **formato** del SMS sigue siendo el de Itaú, y por eso
  `parseItau` y el `_bankKey: "itau"` siguen existiendo: identifican el formato,
  no la marca.
- Dos formas del mismo mensaje conviven en la historia: pie viejo
  `ITAU Tel: 5818181 Bta o 018000512633 Nal` y pie nuevo `Si no fuiste tu,
  comunicate con la Servilinea de Banco de Bogota.`. `detectBank` las cubre por
  estructura.
- El artículo es **opcional** en los débitos: llega tanto `Se realizo un debito
  de tu Cuenta...` como `Se realizo Transferencia de tu Cuenta...`. Exigirlo
  mandaba el segundo caso a la IA.
- Bre-B tiene cuatro formas: débito genérico, débito con llave, entrante con
  llave, y depósito. Las dos primeras se fusionan (`mergeBrebDuplicate`).
- Tablas limpias con bordes (en PDF) — `extract_tables()` funciona bien.
- Prefijo "COMPRA EN " en descripciones — se limpia con merchant_cleaner.

### AV Villas
- Algunos extractos son imágenes — tabula con lattice mode puede ayudar.
- Nombres de meses en español: "15 ene 2024".
