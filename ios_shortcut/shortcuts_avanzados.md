# Atajos iOS Avanzados

Recetas de Shortcuts para potenciar la app de finanzas en iPhone.
Estas son opciones adicionales al recordatorio básico de categorización.

---

## 1. Acceso directo al balance desde la pantalla de inicio

El shortcut más simple: abre el widget de balance con un solo toque.

### Configuración

1. Abre **Atajos** → toca **+**
2. Nómbralo: `Finanzas — Balance`
3. Agrega la acción **"Abrir URL"**
4. URL: `https://TU_APP.pages.dev/?view=balance`
5. Guárdalo y agrégalo a la pantalla de inicio como ícono

### Resultado

Un ícono en tu inicio que abre directamente el widget de balance del mes.

---

## 2. Agregar gasto por Siri

Di "Oye Siri, agregar gasto" y se abre la pantalla de agregar directamente.

### Configuración

1. Abre **Atajos** → toca **+**
2. Nómbralo: `Finanzas — Agregar gasto`
3. Agrega la acción **"Abrir URL"**
4. URL: `https://TU_APP.pages.dev/?tab=agregar`
5. Ve a **Configuración de Siri** → **Mis atajos** → asigna una frase
6. Frase sugerida: "Agregar gasto"

### Resultado

Al decir "Oye Siri, agregar gasto" se abre la app en la pestaña de agregar.

---

## 3. Resumen semanal los lunes

Recibe cada lunes el total gastado la semana anterior.

### Configuración

#### Paso 1: Crear el Shortcut

1. Abre **Atajos** → toca **+**
2. Nómbralo: `Finanzas — Resumen semanal`
3. Agrega **"Obtener contenido de URL"**:

| Campo | Valor |
|-------|-------|
| URL | `https://TU_APP.pages.dev/api/proxy` |
| Método | POST |
| Cuerpo | JSON |

Cuerpo JSON:
```json
{
  "type": "monthSummary",
  "userId": "TU_USUARIO"
}
```

4. Agrega **"Obtener valor del diccionario"** → clave: `total`
5. Agrega **"Mostrar notificación"**:
   - Título: `Finanzas — Resumen semanal`
   - Cuerpo: `Gastaste $[Valor del diccionario] esta semana`

#### Paso 2: Automatización semanal

1. Ve a **Automatización** → **+** → **Automatización personal**
2. Selecciona **Día de la semana** → **Lunes** → hora: **9:00 AM**
3. Ejecutar inmediatamente (sin confirmación)
4. Acción: **Ejecutar Shortcut** → `Finanzas — Resumen semanal`

---

## 4. Escanear QR de factura DIAN

Abre la app directamente en la pestaña de agregar para capturar una factura electrónica.

### Configuración

1. Abre **Atajos** → toca **+**
2. Nómbralo: `Finanzas — Escanear factura`
3. Agrega **"Escanear código QR"** (acción nativa de iOS)
4. Agrega **"Si** [Resultado del QR] contiene `dian.gov.co` **entonces:**"
5. Dentro del Si: agrega **"Abrir URL"** → `https://TU_APP.pages.dev/?tab=agregar`
6. **De lo contrario:** agrega **"Mostrar resultado"** → `[Resultado del QR]`

> También puedes usar el botón ▦ dentro de la app (pestaña Agregar) para escanear directamente.

---

## 5. Compartir imagen de extracto para importar

Permite importar transacciones directamente desde la app de Fotos o Safari.

### Configuración

1. Abre **Atajos** → toca **+**
2. Nómbralo: `Importar a Finanzas`
3. Activa **"Mostrar en hoja de compartir"** en la configuración del shortcut
4. Tipos de entrada: **Imágenes**
5. Agrega **"Abrir URL"** → `https://TU_APP.pages.dev/?tab=ajustes`

> Tip: En Ajustes → "Importar extracto por foto" podrás seleccionar la imagen manualmente con la cámara o galería.

---

## Variables comunes

Reemplaza en todos los atajos:

| Variable | Valor real |
|----------|------------|
| `TU_APP.pages.dev` | URL de Cloudflare (ej: `familia-finanzas.pages.dev`) |
| `TU_USUARIO` | Tu ID de usuario (`jose`, `dani`, etc.) |

La URL exacta la encuentras en Ajustes → Canales dentro de la app.
