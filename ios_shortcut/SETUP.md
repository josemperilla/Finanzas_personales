# Configuración del iPhone — iOS Shortcuts

Solo necesitas **una automatización de SMS** que funciona para todos los bancos. El Shortcut detecta tu ID de usuario automáticamente la primera vez y lo guarda. Quien lo instale desde un link solo escribe su ID una vez.

---

## Automatización SMS universal

### Parte 1 — Crear la automatización

1. Abre la app **Atajos** en tu iPhone
2. Toca la pestaña **Automatización** (ícono de reloj, abajo)
3. Toca **+** → **Crear automatización personal**
4. Selecciona **Mensaje**
5. En "Cuando recibo un mensaje que contiene" escribe: **`$`**
6. Deja "De" en **Cualquiera**
7. Activa **"Ejecutar inmediatamente"** y desactiva "Preguntar antes de ejecutar"
8. Toca **Siguiente** — ahora estás en el editor de acciones

---

### Parte 2 — Agregar las acciones (en orden)

#### Acción 1 — Intentar leer el ID guardado

1. Toca **Agregar acción**
2. Busca **"Obtener archivo"** y selecciónalo
3. Toca el campo del archivo (donde dice "Atajos" o aparece un ícono de iCloud)
4. Escribe la ruta: `Atajos/finanzas_usuario.txt`
5. Busca la opción **"Error si no existe"** o **"Si el archivo no existe"** y **desactívala** (ponla en OFF o en "Continuar")

> Esta acción intenta leer el archivo donde se guarda el ID. Si el archivo no existe todavía, devuelve vacío sin fallar.

---

#### Acción 2 — Condición: ¿ya tenemos el ID?

1. Toca **Agregar acción**
2. Busca **"Si"** y selecciónalo
3. Aparece el bloque Si con campos de condición. Configúralo así:
   - Primer campo (el valor a evaluar): toca ahí → selecciona **"Archivos"** (el resultado de la acción anterior)
   - Operador: **"No tiene valor"**
4. Verás dos secciones: **"Si"** (arriba) y **"De lo contrario"** (abajo). Las acciones siguientes van DENTRO de la sección "Si"

---

#### Acción 3 — (dentro del "Si") Pedir el ID al usuario

1. Toca el **"+"** que aparece DENTRO del bloque "Si" (entre "Si" y "De lo contrario")
2. Agrega **"Solicitar entrada"**
3. Toca el campo de pregunta y escribe:
   `¿Cuál es tu ID de usuario en Finanzas Abiertas?`
4. Tipo: **Texto**

---

#### Acción 4 — (dentro del "Si") Guardar el ID para siempre

1. Toca el **"+"** dentro del bloque "Si" (debajo de "Solicitar entrada")
2. Agrega **"Guardar archivo"**
3. El campo de contenido debería decir automáticamente "Entrada proporcionada" (el resultado de la acción anterior). Si no, toca ese campo → `{x}` → selecciona **"Entrada proporcionada"**
4. Toca el campo de destino → selecciona **iCloud Drive**
5. Escribe la ruta: `Atajos/finanzas_usuario.txt`
6. Activa la opción **"Sobreescribir"**

---

> Las acciones 3 y 4 solo corren la primera vez. Después el archivo ya existe y el bloque "Si" se salta.

---

#### Acción 5 — Leer el ID (ahora sí existe siempre)

Esta acción va FUERA del bloque Si/De lo contrario, después del "Fin Si".

1. Toca el **"+"** debajo del bloque entero (después de "Fin Si")
2. Agrega otra vez **"Obtener archivo"**
3. Ruta: `Atajos/finanzas_usuario.txt`
4. Esta vez deja "Error si no existe" **activado** (es normal, el archivo ya existe)

> En la primera ejecución, el archivo acaba de crearse en la Acción 4. En las siguientes, ya estaba. En ambos casos esta acción lo lee correctamente.

---

#### Acción 6 — Enviar el SMS al servidor

1. Toca **"+"** → agrega **"Obtener contenido de URL"**
2. **URL**: `https://finanzas-abiertas.pages.dev/api/sms`
3. Toca **Mostrar más** para expandir la acción
4. **Método**: POST
5. **Cuerpo de la solicitud**: JSON
6. Agrega los campos con **"+"**:

**Campo 1 — userId:**
- Clave: escribe `userId`
- Valor: toca `{x}` → selecciona **"Archivos"** (resultado de la Acción 5)

**Campo 2 — sms:**
- Clave: escribe `sms`
- Valor: toca `{x}` → selecciona **"Contenido del Mensaje"**

**Campo 3 — timestamp:**
- Clave: escribe `timestamp`
- Valor: toca `{x}` → selecciona **"Fecha Actual"** → formato **ISO 8601**

---

### Parte 3 — Guardar

1. Toca **Siguiente**
2. Cuando pregunte → toca **No preguntar**
3. Toca **Listo**

---

## Cómo compartir el Shortcut

1. Abre **Atajos** → toca los **tres puntos (···)** sobre el Shortcut
2. Toca **Compartir** → **Copiar link de iCloud**
3. Comparte ese link

Quien lo instale verá una pantalla preguntando su ID la primera vez que llegue un SMS con `$`. Lo escribe una vez — el Shortcut lo guarda en iCloud Drive y nunca vuelve a preguntar.

Para cambiar el ID: borrar `finanzas_usuario.txt` en iCloud Drive / Atajos, y el Shortcut vuelve a preguntar.

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

- Confirma que la automatización tenga "Ejecutar inmediatamente" activado
- Verifica que la URL sea exactamente `https://finanzas-abiertas.pages.dev/api/sms`
- Revisa que el SMS contenga `$` y sea de un banco (mensajes personales o promocionales se descartan automáticamente)
