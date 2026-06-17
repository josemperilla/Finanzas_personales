# Configuración del iPhone — Atajo "Finanzas SMS"

Capturar tus SMS bancarios en iPhone son **dos pasos separados**. El error más común es
hacer solo el primero:

1. **Instalar el atajo** → queda en *Mis Atajos / My Shortcuts*. **Por sí solo NO captura nada.**
2. **Crear la Automatización** → es la que ejecuta el atajo cuando llega un SMS. **Sin esto, nada se reenvía.**

> 💡 La app tiene un **asistente guiado** (Ajustes → *Ver tutorial de canales* → SMS) que te lleva
> por estos dos pasos y al final hace una **prueba en vivo** que confirma si quedó funcionando.
> Esta guía es el respaldo escrito (incluye etiquetas en español **y en inglés**, porque muchos
> iPhone están en inglés).

---

## Paso 1 — Instalar el atajo (link)

1. Abre este link en tu iPhone:
   **https://www.icloud.com/shortcuts/57a54a9b81264b9eb74a676be144f858**
2. Toca **Agregar atajo / Add Shortcut**.
3. Si te lo pide al instalar, escribe tu **ID de Finanzas** (te lo muestra la app). Queda guardado.

Esto agrega *Finanzas SMS* a **Mis Atajos / My Shortcuts**. Falta el Paso 2.

> **¿Cuál es mi ID?** App → Ajustes → tu perfil, o en el asistente de canales (lo muestra y se copia).

---

## Paso 2 — Crear la Automatización (el paso que SIEMPRE se olvida)

1. Abre **Atajos / Shortcuts** → pestaña **Automatización / Automation** (ícono de reloj, abajo).
2. Toca **+** → **Nueva automatización / New Automation** → **Mensaje / Message**.
3. En **Contiene / Contains** escribe **`$`** — deja **De / Sender** en **Cualquiera / Any**.
4. Toca **Siguiente / Next**.
5. Agrega la acción **Ejecutar atajo / Run Shortcut** → elige **Finanzas SMS**.
6. Toca **Listo / Done**.

### ⚠️ Los 2 ajustes críticos

| Ajuste (es / EN) | Debe quedar | Por qué |
|---|---|---|
| **Ejecutar inmediatamente / Run Immediately** | ✅ **ACTIVADO** | Si no, te pregunta cada vez y nunca corre solo |
| **Preguntar antes de ejecutar / Run After Confirmation** | ❌ **DESACTIVADO** | Si queda activo, cada SMS muestra un aviso que debes confirmar |

> Atajo para llegar rápido: abrir `shortcuts://create-automation` salta directo a la pantalla de
> Nueva Automatización (igual el trigger se elige a mano — iOS no permite preconfigurarlo).

---

## Paso 3 — Probar

1. En el asistente de la app, toca **Iniciar prueba**.
2. Desde **Mensajes**, envíate a tu propio número un SMS con el texto: **`$1 prueba`**.
3. La app detecta que tu iPhone reenvió el SMS y muestra ✅ **¡Funcionó!** (puede tardar hasta ~1 min).

El mensaje de prueba no necesita parsearse como transacción: el servidor solo confirma que **recibió**
el SMS desde tu teléfono, que es justo lo que valida que la Automatización dispara.

---

## Construir el atajo "Finanzas SMS" desde cero (admin)

Solo si hay que regenerar el atajo (p. ej. el link de iCloud murió). El atajo es deliberadamente simple:

1. **Atajos → +** (nuevo atajo). Renómbralo **Finanzas SMS** (nombre claro: facilita elegirlo en el Paso 2).
2. Acción **Texto / Text** con tu ID. Mantén pulsado el valor → **Import Question / Pregunta al importar**
   con el texto *"¿Cuál es tu ID de Finanzas?"*. Así iOS pide el ID **al instalar** (una vez, explícito) en
   vez de esperar al primer SMS.
3. Acción **Obtener contenido de URL / Get Contents of URL**:
   - URL: `https://finanzas-abiertas.pages.dev/api/sms`
   - **Mostrar más / Show More** → Método **POST** → Cuerpo **JSON**:

   | Key | Value |
   |-----|-------|
   | `userId` | el **Texto** del paso 2 |
   | `sms` | **Entrada del atajo / Shortcut Input** (el contenido del mensaje que pasa la automatización) |
   | `timestamp` | **Fecha actual / Current Date** → formato ISO 8601 |

4. Guardar. Luego **Compartir → Copiar enlace de iCloud / Copy iCloud Link** y reemplazar el link en:
   - `pwa/src/lib/config.ts` → constante **`IOS_SHORTCUT_URL`** (única fuente de verdad en el código)
   - este archivo (`ios_shortcut/SETUP.md`, Paso 1)

> El servidor inyecta el secreto automáticamente (Cloudflare `functions/api/sms.js`) — el atajo nunca
> necesita conocerlo. El contrato del POST (`userId`, `sms`, `timestamp`) lo espera ese mismo archivo.

---

## Bancos soportados

| Banco | Canal |
|-------|-------|
| Banco Itaú | SMS |
| Bancolombia | SMS |
| Davivienda | SMS |
| Banco de Bogotá | SMS |
| AV Villas | SMS |
| Daviplata | SMS |
| Nequi | Push (por app) |
| dale! | Push (por app) |
| Rappi Pay | Push (por app) |

Para bancos no listados: el servidor usa IA para parsear el SMS automáticamente.

---

## Si la transacción no aparece

- **El atajo está en Mis Atajos pero la Automatización no existe** → es el error #1. Vuelve al Paso 2.
- Confirma **"Ejecutar inmediatamente / Run Immediately"** activado y **"Preguntar antes / Run After
  Confirmation"** desactivado.
- Si no puedes seleccionar el atajo (aparece en gris), ejecuta una vez cualquier atajo de la Galería
  para habilitar atajos de terceros.
- Algunos modos de **Concentración / No molestar** pausan las automatizaciones.
- El SMS debe contener **`$`** (los promocionales/OTP se descartan automáticamente).
- Para cambiar tu ID: si usaste la versión con archivo, borra `finanzas_usuario.txt` en iCloud Drive →
  Shortcuts; si usaste *Import Question*, reinstala el atajo desde el link.
