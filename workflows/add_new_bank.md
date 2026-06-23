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
En la función que enruta SMS por banco (buscar `parseBogota`/`parseItau` en el mismo
archivo), agrega la condición de detección para el nuevo banco.

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

### Itaú
- Tablas limpias con bordes (en PDF) — `extract_tables()` funciona bien.
- Prefijo "COMPRA EN " en descripciones — se limpia con merchant_cleaner.

### AV Villas
- Algunos extractos son imágenes — tabula con lattice mode puede ayudar.
- Nombres de meses en español: "15 ene 2024".
