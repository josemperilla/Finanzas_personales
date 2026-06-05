# Configuración del iPhone — iOS Shortcuts

Hay dos tipos de automatizaciones. Configura ambas para cada banco.

- **Tipo A — SMS**: captura mensajes de texto del banco (canal existente, funcionando)
- **Tipo B — Notificación push**: captura notificaciones de la app del banco (canal nuevo)

Necesitas el **webhook URL** de Google Apps Script y el **_secret** antes de empezar.

---

## Cómo configurar una automatización (pasos base)

Estos pasos aplican a todos los Shortcuts. Solo cambia el trigger y el JSON según el banco.

### Paso 1 — Abrir Atajos

1. Abre **Atajos** en tu iPhone.
2. Toca la pestaña **Automatización** (ícono de reloj).
3. Toca **+** arriba a la derecha → **Crear automatización personal**.

### Paso 2 — Elegir el trigger

**Para SMS (Tipo A):**
1. Selecciona **Mensaje**.
2. En "Cuando recibo un mensaje que contiene", escribe el texto del banco (ver tabla abajo).
3. Activa **"Ejecutar inmediatamente"** (no "Preguntar antes de ejecutar").

**Para notificación push (Tipo B):**
1. Selecciona **App**.
2. Toca **Seleccionar** y busca la app del banco (ver tabla abajo).
3. Marca **"Se recibe una notificación"**.
4. Activa **"Ejecutar inmediatamente"**.

### Paso 3 — Agregar la acción POST

1. Toca **Agregar acción** → busca **Obtener contenido de URL**.
2. Configura:
   - **URL**: `{WEBHOOK_URL}?_secret={TU_SECRET}`
   - **Método**: POST
   - **Cuerpo de la solicitud**: JSON
   - **Cuerpo**: el JSON correspondiente al banco (ver secciones abajo)

### Paso 4 — Variables dinámicas

Para insertar variables en el JSON:
- Toca el campo de valor → toca **{x}** (varita mágica)
- **SMS** → "Contenido del mensaje"
- **Título de notificación** → "Título de notificación"
- **Cuerpo de notificación** → "Cuerpo de notificación"
- **Timestamp** → "Fecha actual" → formato ISO 8601

### Paso 5 — Guardar

Toca **Listo**. Cuando pregunte "¿Pedir antes de ejecutar?", elige **No preguntar**.

---

## Tabla de bancos y triggers

| Banco               | bank_code  | Trigger SMS (Tipo A)          | App para push (Tipo B)        |
|---------------------|-----------|-------------------------------|-------------------------------|
| Banco de Bogotá     | bogota    | `Banco de Bogota:`            | Banco de Bogotá               |
| Banco Itaú          | itau      | `ITAU Tel:`                   | Itaú Colombia                 |
| Bancolombia         | bancolombia | `Bancolombia:`              | Bancolombia App               |
| Davivienda          | davivienda | `DAVIVIENDA:`                | Mi Davivienda                 |
| Nequi               | nequi     | _(sin SMS)_                   | Nequi                         |
| Daviplata           | daviplata | `Daviplata:`                  | Daviplata                     |
| Banco de Occidente  | occidente | `Banco de Occidente:`         | Banco de Occidente Móvil      |
| Banco Popular       | popular   | `Banco Popular:`              | Banco Popular Colombia        |
| AV Villas           | avvillas  | `AV Villas:`                  | AV Villas App                 |
| dale!               | dale      | _(sin SMS)_                   | dale!                         |
| Rappi Pay           | rappi     | _(sin SMS)_                   | Rappi                         |

> Si no sabes cuál trigger usar para SMS, espera un mensaje del banco y copia exactamente las primeras palabras.

---

## JSONs por banco

Reemplaza `TU_USER_ID` con `jose` o `dani` según corresponda.

### Banco de Bogotá — SMS (Tipo A)
```json
{
  "bank": "bogota",
  "sms": "[Contenido del mensaje]",
  "userId": "TU_USER_ID",
  "timestamp": "[Fecha actual ISO 8601]"
}
```

### Banco de Bogotá — Notificación push (Tipo B)
```json
{
  "type": "notification",
  "bank": "bogota",
  "title": "[Título de notificación]",
  "body": "[Cuerpo de notificación]",
  "userId": "TU_USER_ID",
  "timestamp": "[Fecha actual ISO 8601]"
}
```

### Banco Itaú — SMS (Tipo A)
```json
{
  "bank": "itau",
  "sms": "[Contenido del mensaje]",
  "userId": "TU_USER_ID",
  "timestamp": "[Fecha actual ISO 8601]"
}
```

### Banco Itaú — Notificación push (Tipo B)
```json
{
  "type": "notification",
  "bank": "itau",
  "title": "[Título de notificación]",
  "body": "[Cuerpo de notificación]",
  "userId": "TU_USER_ID",
  "timestamp": "[Fecha actual ISO 8601]"
}
```

### Bancolombia — SMS (Tipo A)
```json
{
  "bank": "bancolombia",
  "sms": "[Contenido del mensaje]",
  "userId": "TU_USER_ID",
  "timestamp": "[Fecha actual ISO 8601]"
}
```

### Bancolombia — Notificación push (Tipo B)
```json
{
  "type": "notification",
  "bank": "bancolombia",
  "title": "[Título de notificación]",
  "body": "[Cuerpo de notificación]",
  "userId": "TU_USER_ID",
  "timestamp": "[Fecha actual ISO 8601]"
}
```

### Davivienda — SMS (Tipo A)
```json
{
  "bank": "davivienda",
  "sms": "[Contenido del mensaje]",
  "userId": "TU_USER_ID",
  "timestamp": "[Fecha actual ISO 8601]"
}
```

### Davivienda — Notificación push (Tipo B)
```json
{
  "type": "notification",
  "bank": "davivienda",
  "title": "[Título de notificación]",
  "body": "[Cuerpo de notificación]",
  "userId": "TU_USER_ID",
  "timestamp": "[Fecha actual ISO 8601]"
}
```

### Nequi — Notificación push (Tipo B, no tiene SMS)
```json
{
  "type": "notification",
  "bank": "nequi",
  "title": "[Título de notificación]",
  "body": "[Cuerpo de notificación]",
  "userId": "TU_USER_ID",
  "timestamp": "[Fecha actual ISO 8601]"
}
```

### Daviplata — SMS (Tipo A)
```json
{
  "bank": "daviplata",
  "sms": "[Contenido del mensaje]",
  "userId": "TU_USER_ID",
  "timestamp": "[Fecha actual ISO 8601]"
}
```

### Daviplata — Notificación push (Tipo B)
```json
{
  "type": "notification",
  "bank": "daviplata",
  "title": "[Título de notificación]",
  "body": "[Cuerpo de notificación]",
  "userId": "TU_USER_ID",
  "timestamp": "[Fecha actual ISO 8601]"
}
```

### Banco de Occidente — SMS (Tipo A)
```json
{
  "bank": "occidente",
  "sms": "[Contenido del mensaje]",
  "userId": "TU_USER_ID",
  "timestamp": "[Fecha actual ISO 8601]"
}
```

### Banco de Occidente — Notificación push (Tipo B)
```json
{
  "type": "notification",
  "bank": "occidente",
  "title": "[Título de notificación]",
  "body": "[Cuerpo de notificación]",
  "userId": "TU_USER_ID",
  "timestamp": "[Fecha actual ISO 8601]"
}
```

### Banco Popular — Notificación push (Tipo B)
```json
{
  "type": "notification",
  "bank": "popular",
  "title": "[Título de notificación]",
  "body": "[Cuerpo de notificación]",
  "userId": "TU_USER_ID",
  "timestamp": "[Fecha actual ISO 8601]"
}
```

### AV Villas — Notificación push (Tipo B)
```json
{
  "type": "notification",
  "bank": "avvillas",
  "title": "[Título de notificación]",
  "body": "[Cuerpo de notificación]",
  "userId": "TU_USER_ID",
  "timestamp": "[Fecha actual ISO 8601]"
}
```

### dale! — Notificación push (Tipo B, no tiene SMS)
```json
{
  "type": "notification",
  "bank": "dale",
  "title": "[Título de notificación]",
  "body": "[Cuerpo de notificación]",
  "userId": "TU_USER_ID",
  "timestamp": "[Fecha actual ISO 8601]"
}
```

### Rappi — Notificación push (Tipo B, no tiene SMS)
```json
{
  "type": "notification",
  "bank": "rappi",
  "title": "[Título de notificación]",
  "body": "[Cuerpo de notificación]",
  "userId": "TU_USER_ID",
  "timestamp": "[Fecha actual ISO 8601]"
}
```

---

## Verificación

Después de configurar un Shortcut:

1. Haz una transacción real (compra pequeña o transferencia).
2. Espera la notificación push o el SMS.
3. Abre el Google Sheet y confirma que apareció una fila nueva.
4. Verifica: **Banco**, **Monto**, **Comercio** y **Fuente** (`sms` o `notification`).

Si aparece con **Tipo = "NO RECONOCIDO"**: el parser no reconoció el formato de la notificación.
Copia el texto de la columna `SMS_Original` y guárdalo en `tools/notification_samples/{bank_code}.txt`
para que se pueda mejorar el parser.

---

## Notas importantes

- **"Ejecutar inmediatamente" DEBE estar activo.** Si lo desactivas, el Shortcut solo corre cuando tocas el banner.
- **iOS 16+** recomendado para push automático. En iOS 15 necesitas tocar el banner.
- Los datos **nunca** se comparten con terceros — el webhook es tu propio Google Apps Script.
- Si recibes una notificación que NO es una transacción (publicidad, alertas de seguridad), se guardará como "NO RECONOCIDO" — puedes eliminarla del Sheet manualmente.
- La columna **Fuente** indica el canal: `sms` o `notification`. Útil para saber qué canal está funcionando.
