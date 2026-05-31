# Configuración del iPhone — iOS Shortcut

Estos pasos conectan los SMS de tu banco con el webhook de Google Apps Script.
Necesitas tener el webhook URL antes de empezar (lo obtienes siguiendo `workflows/setup.md`).

---

## Automatización 1: Banco de Bogotá

### Paso 1 — Abrir Shortcuts

1. Abre la app **Atajos** (Shortcuts) en tu iPhone.
2. Toca la pestaña **Automatización** (ícono de reloj en la parte inferior).
3. Toca el botón **+** arriba a la derecha.

### Paso 2 — Crear el trigger

1. Selecciona **Crear automatización personal**.
2. Baja y selecciona **Mensaje**.
3. En "Cuando recibo un mensaje que contiene", escribe exactamente:
   ```
   Banco de Bogota:
   ```
4. En "De", deja en blanco (cualquier remitente) o agrega el número del banco si lo tienes guardado.
5. Asegúrate de que **"Ejecutar inmediatamente"** esté activado (no "Preguntar antes de ejecutar").
6. Toca **Siguiente**.

### Paso 3 — Agregar la acción

1. Toca **Agregar acción**.
2. Busca y selecciona **Obtener contenido de URL** (o "URL" en el buscador de acciones).
3. Configura la acción así:

   - **URL**: pega aquí el webhook URL de Google Apps Script
     _(lo obtienes en el paso 3 de `workflows/setup.md`)_
   - **Método**: POST
   - **Cuerpo de la solicitud**: JSON
   - **Cuerpo**:
     ```json
     {
       "bank": "bogota",
       "sms": "[Contenido del mensaje]",
       "timestamp": "[Fecha y hora actuales]"
     }
     ```

   Para insertar `[Contenido del mensaje]`:
   - Toca el campo de valor de `"sms"`
   - Toca la varita mágica **{x}** (variable dinámica)
   - Selecciona **Contenido del mensaje**

   Para insertar `[Fecha y hora actuales]`:
   - Toca el campo de valor de `"timestamp"`
   - Toca **{x}** → **Fecha actual** → formato **ISO 8601**

4. Toca **Listo** (arriba a la derecha).

### Paso 4 — Desactivar confirmación

Cuando el sistema te pregunte "¿Preguntar antes de ejecutar?", selecciona **No preguntar**.
Esto permite que el Shortcut corra en segundo plano sin interrumpirte.

---

## Automatización 2: Itaú

Repite exactamente los mismos pasos de arriba, cambiando solo:

- **Trigger**: el mensaje contiene `ITAU Tel:`
- **Cuerpo JSON**:
  ```json
  {
    "bank": "itau",
    "sms": "[Contenido del mensaje]",
    "timestamp": "[Fecha y hora actuales]"
  }
  ```

---

## Verificación

Para confirmar que funciona:

1. Espera el próximo SMS de cualquiera de los dos bancos.
   _(O pídele a alguien que haga una compra pequeña para probar.)_
2. Abre el Google Sheet "Finanzas Personales" en Safari.
3. Confirma que apareció una fila nueva con los datos de la transacción.
4. Revisa que los campos **Monto**, **Comercio**, **Banco** y **Tipo** estén correctos.

Si no aparece la fila, ve a la sección de **Troubleshooting** en `workflows/setup.md`.

---

## Notas importantes

- **"Preguntar antes de ejecutar" DEBE estar desactivado.** Si lo activas, el Shortcut solo corre cuando abres la notificación manualmente.
- Si el banco cambia el formato de sus SMS, los datos no se extraerán correctamente. El SMS original siempre queda guardado en la columna `SMS_Original` del Sheet, así que nada se pierde.
- Si recibes un SMS del banco que no sea de transacciones (publicidad, alertas de seguridad, etc.), el webhook lo guardará en el Sheet con tipo "NO RECONOCIDO" para que lo puedas ignorar o eliminar manualmente.
