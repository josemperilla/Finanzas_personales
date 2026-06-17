# Tutorial para Dani — Captura automática de gastos en iPhone

Este tutorial te ayuda a configurar tu iPhone para que **cada vez que recibes una
notificación de tu banco, la transacción se guarde automáticamente** en el Sheet de
finanzas compartido.

No necesitas pedirle nada a Jose — ya está todo aquí.

---

## Qué bancos puedes configurar

Configura un Shortcut por cada app bancaria que tengas instalada:

| App en tu iPhone          | Nombre para el campo `bank` |
|---------------------------|-----------------------------|
| Bancolombia App           | `bancolombia`               |
| Mi Davivienda             | `davivienda`                |
| Banco de Bogotá           | `bogota`                    |
| Itaú Colombia             | `itau`                      |
| Nequi                     | `nequi`                     |
| Daviplata                 | `daviplata`                 |
| Banco de Occidente Móvil  | `occidente`                 |
| Banco Popular Colombia    | `popular`                   |
| AV Villas App             | `avvillas`                  |
| dale!                     | `dale`                      |
| Rappi                     | `rappi`                     |

---

## Paso a paso — un banco a la vez

Sigue estos pasos para **cada** app bancaria que tengas. El ejemplo es con Bancolombia,
pero el proceso es idéntico para todos.

---

### Paso 1 — Abre la app Atajos

Busca la app **Atajos** en tu iPhone (viene instalada de fábrica, ícono naranja/azul).

Si no la encuentras, desliza hacia abajo desde la pantalla de inicio y búscala.

---

### Paso 2 — Crea una nueva automatización

1. Toca la pestaña **Automatización** en la parte inferior
2. Toca el botón **+** arriba a la derecha
3. Toca **Crear automatización personal**

---

### Paso 3 — Elige el trigger

1. Baja en la lista y toca **App**
2. Toca **Seleccionar** → busca la app de tu banco (ej: "Bancolombia App") → tócala
3. Asegúrate de que esté marcada la opción **"Se recibe una notificación"**
4. **Muy importante**: activa el toggle **"Ejecutar inmediatamente"**
   - Si no activas esto, el Shortcut te pedirá permiso cada vez y no funcionará solo
5. Toca **Siguiente**

---

### Paso 4 — Agrega la acción

1. Toca **Agregar acción**
2. En el buscador escribe **URL**
3. Selecciona **Obtener contenido de URL**

---

### Paso 5 — Pega la URL

Toca el campo URL y pega exactamente esto:

```
https://script.google.com/macros/s/AKfycbwT16zm7B30gu2tbyPiw3KNORPl7rEdS1WuX_8kSH5Kwem8LSov30M7oeQohbjB9Xpd/exec?_secret=de1469b78f0a2020a68ac2316a7acfb81cce5e58eaaa5dd055821bbce0f85fd3
```

Luego:

- Toca **GET** y cámbialo a **POST**
- Toca el tipo de cuerpo y selecciona **JSON**

---

### Paso 6 — Agrega los 6 campos del JSON

Toca **Agregar nuevo campo** para cada uno (son 6 en total):

**Campo 1**
- Clave: `type`
- Valor: `notification` ← escríbelo como texto fijo

**Campo 2**
- Clave: `bank`
- Valor: el nombre del banco según la tabla de arriba, ej: `bancolombia` ← texto fijo

**Campo 3**
- Clave: `userId`
- Valor: `dani` ← texto fijo

**Campo 4**
- Clave: `title`
- Valor: toca el campo → toca la varita **{x}** → selecciona **Título de notificación**

**Campo 5**
- Clave: `body`
- Valor: toca el campo → toca **{x}** → selecciona **Cuerpo de notificación**

**Campo 6**
- Clave: `timestamp`
- Valor: toca el campo → toca **{x}** → **Fecha actual** → formato **ISO 8601**

---

### Paso 7 — Guarda

1. Toca **Siguiente** arriba a la derecha
2. Cuando pregunte **"¿Pedir antes de ejecutar?"** → toca **No preguntar**
3. Toca **Listo**

¡Listo para ese banco!

---

### Paso 8 — Repite para cada banco

Vuelve al Paso 1 y repite todo para cada app bancaria que tengas.
En el Paso 6, Campo 2, cambia el valor de `bank` por el nombre correspondiente.

---

## Cómo saber si está funcionando

1. Haz una compra pequeña o pide que te transfieran algo
2. Cuando llegue la notificación del banco, el Shortcut corre solo en segundo plano (no verás nada)
3. Abre el Google Sheet que compartió Jose → busca tu pestaña "Dani"
4. Debe aparecer una fila nueva con el banco, el monto y la descripción

Si ves una fila con **"NO RECONOCIDO"** en la columna Tipo:
- El Shortcut funcionó bien (la fila llegó)
- El sistema no pudo leer el texto de la notificación
- Dile a Jose cuál banco fue y él lo ajusta

---

## Problemas frecuentes

**El Shortcut te pide permiso cada vez**
El toggle "Ejecutar inmediatamente" no quedó activado.
Ve a Atajos → Automatización → toca el Shortcut del banco → actívalo.

**No aparece nada en el Sheet**
Verifica que el Shortcut tenga los 6 campos del JSON y que la URL esté completa (es larga, asegúrate de que no se cortó al pegar).

**¿Se gasta batería?**
Casi nada. El Shortcut solo corre cuando llega una notificación del banco y dura menos de 1 segundo.

**¿Funciona con iOS 15?**
Sí, pero en cada notificación verás un banner preguntando si quieres correr el Shortcut. En iOS 16 en adelante es automático.

**¿Qué pasa si llega una notificación que no es una compra (publicidad, alertas)?**
Se guarda con tipo "NO RECONOCIDO" y monto 0. La puedes borrar manualmente desde la app.
