# Configuración del iPhone — iOS Shortcuts

Solo necesitas **dos automatizaciones** — una para SMS y una para notificaciones push — y cubren todos los bancos. No hay que crear un Shortcut por banco.

---

## Automatización 1 — SMS universal (todos los bancos)

Este Shortcut captura cualquier SMS bancario que llegue a tu teléfono. El servidor detecta el banco automáticamente.

### Paso 1 — Crear la automatización

1. Abre **Atajos** en tu iPhone
2. Toca **Automatización** (ícono de reloj abajo)
3. Toca **+** → **Crear automatización personal**

### Paso 2 — Trigger

1. Selecciona **Mensaje**
2. En "Cuando recibo un mensaje que contiene" escribe: **`$`**
   - El signo `$` aparece en todos los SMS bancarios colombianos con un monto
3. Activa **"Ejecutar inmediatamente"** — desactiva "Preguntar antes de ejecutar"

### Paso 3 — Acción POST

1. Toca **Agregar acción** → busca **"Obtener contenido de URL"**
2. Configura:
   - **URL**: `https://finanzas-abiertas.pages.dev/api/sms`
   - **Método**: POST
   - **Cuerpo de la solicitud**: JSON

3. Agrega estos campos (toca **+** para cada uno):

| Clave | Valor |
|-------|-------|
| `userId` | `jose` (texto fijo) |
| `sms` | toca **{x}** → "Contenido del mensaje" |
| `timestamp` | toca **{x}** → "Fecha actual" → formato **ISO 8601** |

> No pongas el campo `bank` — el servidor lo detecta solo a partir del texto del SMS.

### Paso 4 — Guardar

Toca **Listo** → elige **No preguntar**.

---

## Automatización 2 — Notificaciones push (por app)

Para bancos que no mandan SMS (Nequi, Daviplata, dale!, Rappi) o cuando prefieres capturar la notificación en lugar del SMS.

Se crea **una automatización por app bancaria**. Los pasos son iguales, solo cambia la app seleccionada.

### Paso 1 — Crear la automatización

1. Atajos → **Automatización** → **+** → **Crear automatización personal**

### Paso 2 — Trigger

1. Selecciona **App**
2. Toca **Seleccionar** y elige la app del banco (Bancolombia, Itaú Colombia, etc.)
3. Marca **"Se recibe una notificación"**
4. Activa **"Ejecutar inmediatamente"**

### Paso 3 — Acción POST

1. Toca **Agregar acción** → **"Obtener contenido de URL"**
2. Configura:
   - **URL**: `https://finanzas-abiertas.pages.dev/api/sms`
   - **Método**: POST
   - **Cuerpo de la solicitud**: JSON

3. Campos:

| Clave | Valor |
|-------|-------|
| `type` | `notification` (texto fijo) |
| `userId` | `jose` (texto fijo) |
| `title` | toca **{x}** → "Título de notificación" |
| `body` | toca **{x}** → "Cuerpo de notificación" |
| `timestamp` | toca **{x}** → "Fecha actual" → formato **ISO 8601** |

> Tampoco pongas `bank` — el servidor lo infiere del título/cuerpo de la notificación.

### Paso 4 — Guardar

Toca **Listo** → **No preguntar**.

---

## Bancos y canales soportados

| Banco | SMS (`$` trigger) | Push (por app) |
|-------|:-----------------:|:--------------:|
| Banco de Bogotá | ✓ | ✓ |
| Banco Itaú | ✓ | ✓ |
| Bancolombia | ✓ | ✓ |
| Davivienda | ✓ | ✓ |
| AV Villas | ✓ | ✓ |
| Nequi | — | ✓ |
| Daviplata | ✓ | ✓ |
| dale! | — | ✓ |
| Rappi Pay | — | ✓ |

Para bancos no listados: si el SMS tiene un formato reconocible, el servidor usa IA para parsearlo automáticamente.

---

## Verificación

Después de configurar:

1. Haz una transacción real (compra pequeña).
2. Espera el SMS o la notificación push.
3. Abre la herramienta y confirma que apareció la transacción.
4. Verifica: **Banco**, **Monto**, **Comercio** y **Fuente** (`sms` o `notification`).

Si la transacción no aparece:
- Revisa que la automatización tenga "Ejecutar inmediatamente" activado
- Confirma que el SMS contenga `$`
- Verifica que la URL sea exactamente `https://finanzas-abiertas.pages.dev/api/sms`

---

## Notas

- **Un SMS con `$` que no sea bancario** (ej. mensaje personal): el servidor lo descarta automáticamente sin registrarlo.
- **"Ejecutar inmediatamente" es obligatorio.** Si está desactivado, el Shortcut solo corre si tocas el banner.
- Los datos van a tu propio Google Apps Script — nunca a terceros.
- La columna **Fuente** en el Sheet indica el canal: `sms` o `notification`.
