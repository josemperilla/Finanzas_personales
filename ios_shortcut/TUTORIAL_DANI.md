# Tutorial para Dani — Captura automática de gastos en iPhone

Este tutorial te ayuda a configurar tu iPhone para que **cada vez que recibes una
notificación de tu banco, la transacción se guarde automáticamente** en el Sheet de
finanzas compartido.

Necesitas pedirle a Jose:
- El **link del webhook** (una URL larga de Google)
- El **código secreto** (_secret)

---

## Qué bancos puedes configurar

Configura un Shortcut por cada app bancaria que tengas instalada:

| App en tu iPhone          | Nombre para el JSON  |
|---------------------------|----------------------|
| Bancolombia App           | `bancolombia`        |
| Mi Davivienda             | `davivienda`         |
| Banco de Bogotá           | `bogota`             |
| Itaú Colombia             | `itau`               |
| Nequi                     | `nequi`              |
| Daviplata                 | `daviplata`          |
| Banco de Occidente Móvil  | `occidente`          |
| Banco Popular Colombia    | `popular`            |
| AV Villas App             | `avvillas`           |
| dale!                     | `dale`               |
| Rappi                     | `rappi`              |

---

## Paso a paso — un banco a la vez

Sigue estos pasos para **cada** app bancaria que tengas. Ejemplo con Bancolombia.

---

### Paso 1 — Abre la app Atajos

Busca la app **Atajos** en tu iPhone (viene instalada de fábrica, ícono de color naranja/azul).

Si no la encuentras, desliza hacia abajo desde la pantalla de inicio y búscala.

---

### Paso 2 — Crea una nueva automatización

1. Toca la pestaña **Automatización** en la parte inferior de la pantalla
2. Toca el botón **+** arriba a la derecha
3. Toca **Crear automatización personal**

---

### Paso 3 — Elige el trigger (qué lo activa)

1. Baja en la lista y toca **App**
2. Toca **Seleccionar** → busca la app de tu banco (ej: "Bancolombia App") → tócala
3. Asegúrate de que esté marcada la opción **"Se recibe una notificación"**
4. **Muy importante**: activa el toggle **"Ejecutar inmediatamente"**
   - Si este toggle está desactivado, el Shortcut te pedirá permiso cada vez y no funcionará solo
5. Toca **Siguiente**

---

### Paso 4 — Agrega la acción

1. Toca **Agregar acción**
2. En el buscador escribe **URL**
3. Selecciona **Obtener contenido de URL**

---

### Paso 5 — Configura el envío

Ahora configuras cómo se envía la información. Hazlo así:

**URL:**
Toca donde dice "URL" y pega esto (Jose te da los valores):
```
URL_DEL_WEBHOOK?_secret=CODIGO_SECRETO
```

**Método:**
Toca **GET** y cámbialo a **POST**

**Cuerpo de la solicitud:**
Toca donde dice el tipo de cuerpo y selecciona **JSON**

---

### Paso 6 — Agrega los campos del JSON

Ahora agregas los datos que se van a enviar. Toca **Agregar nuevo campo** para cada uno:

**Campo 1:**
- Clave: `type`
- Valor: escribe `notification` (texto fijo)

**Campo 2:**
- Clave: `bank`
- Valor: escribe el nombre del banco según la tabla de arriba, ej: `bancolombia` (texto fijo)

**Campo 3:**
- Clave: `userId`
- Valor: escribe `dani` (texto fijo)

**Campo 4:**
- Clave: `title`
- Valor: toca el campo → toca la varita mágica **{x}** → selecciona **Título de notificación**

**Campo 5:**
- Clave: `body`
- Valor: toca el campo → toca **{x}** → selecciona **Cuerpo de notificación**

**Campo 6:**
- Clave: `timestamp`
- Valor: toca el campo → toca **{x}** → **Fecha actual** → selecciona el formato **ISO 8601**

---

### Paso 7 — Guarda

1. Toca **Siguiente** arriba a la derecha
2. Cuando pregunte **"¿Pedir antes de ejecutar?"** → toca **No preguntar**
3. Toca **Listo**

¡Listo! Ya está configurado para ese banco.

---

### Paso 8 — Repite para cada banco

Vuelve al Paso 1 y repite el proceso para cada app bancaria que tengas instalada.
En el Paso 5 cambia el nombre del banco en el campo `bank`.

---

## Cómo saber si está funcionando

1. Haz una compra pequeña o pide que te transfieran algo
2. Cuando llegue la notificación del banco a tu iPhone, el Shortcut corre solo en segundo plano
3. Abre el Google Sheet que te compartió Jose → busca tu pestaña "Dani"
4. Debe aparecer una fila nueva con tu compra, el banco y el monto

Si ves una fila con **"NO RECONOCIDO"** en la columna Tipo:
- El Shortcut funcionó (la fila llegó bien)
- El sistema no pudo leer el texto de la notificación
- Dile a Jose cuál banco fue y él lo arregla

---

## Si el Shortcut te pide permiso cada vez

Significa que **"Ejecutar inmediatamente"** no quedó activado.

1. Ve a **Atajos** → **Automatización**
2. Toca el Shortcut del banco
3. Activa el toggle **"Ejecutar inmediatamente"**

---

## Preguntas frecuentes

**¿Se gasta batería?**
Casi nada. El Shortcut solo corre cuando llega una notificación del banco, dura menos de 1 segundo.

**¿Mis datos van a algún lado raro?**
No. Todo va directo al Sheet de Google de Jose. Nadie más tiene acceso.

**¿Qué pasa si desinstalo la app del banco?**
El Shortcut deja de funcionar automáticamente (no hay notificaciones sin la app).

**¿Funciona con iOS 15?**
Funciona, pero cada vez que llegue una notificación verás un banner en la pantalla preguntándote si quieres correr el Shortcut. Toca "Ejecutar" para que funcione. En iOS 16 en adelante esto es automático.

**¿Qué pasa si llega una notificación del banco que no es una compra (publicidad, alertas)?**
Se guarda en el Sheet con tipo "NO RECONOCIDO" y monto 0. Puedes borrarla manualmente desde la app.
