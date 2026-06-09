# Shortcut: Recordatorio de categorización

Automatización diaria que revisa cuántas transacciones están sin categorizar
y te envía una notificación si hay pendientes.

## Requisitos

- iPhone con app Atajos (Shortcuts)
- La URL del webhook y el secreto (están en Ajustes → Canales dentro de la app)

## Pasos para crear el Shortcut

### 1. Crear el Shortcut

1. Abre **Atajos** → toca **+** para crear uno nuevo
2. Nómbralo: `Finanzas — Recordatorio`

### 2. Acción: Obtener contenido de URL

Agrega la acción **"Obtener contenido de URL"** con estos valores:

| Campo | Valor |
|-------|-------|
| URL | `https://TU_APP.pages.dev/api/proxy` |
| Método | POST |
| Cuerpo | JSON |

Cuerpo JSON:
```json
{
  "type": "uncategorizedCount",
  "userId": "TU_USUARIO"
}
```

> Reemplaza `TU_APP.pages.dev` con tu URL de Cloudflare y `TU_USUARIO` con tu ID (jose, dani, etc.)

### 3. Acción: Obtener valor del diccionario

- Acción: **"Obtener valor del diccionario"**
- Clave: `count`
- Del resultado de la acción anterior

### 4. Acción: Si (condicional)

- **Si** `Valor del diccionario` **es mayor que** `0`
- **Entonces** → agrega acción **"Mostrar notificación"**:
  - Título: `Finanzas — Pendientes`
  - Cuerpo: `Tienes [Valor del diccionario] transacciones sin categorizar`
  - (Activa "Reproducir sonido" si quieres)

### 5. Automatización diaria

1. Ve a la pestaña **Automatización** en Atajos
2. Toca **+** → **Automatización personal**
3. Selecciona **Hora del día** → elige p.ej. **9:00 AM**
4. Selecciona **Ejecutar inmediatamente** (sin confirmación)
5. Agrega la acción **"Ejecutar Shortcut"** → selecciona `Finanzas — Recordatorio`

## Resultado

Cada mañana a las 9am, si tienes transacciones con categoría "Otro" o sin categorizar,
recibirás una notificación como esta:

> **Finanzas — Pendientes**
> Tienes 5 transacciones sin categorizar

Toca la notificación para abrir la app directamente.
