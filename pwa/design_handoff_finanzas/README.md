# Handoff: Finanzas — Tema y flujo de onboarding (iOS + Web)

> **Para Claude Code:** Este paquete contiene **referencias de diseño hechas en HTML** — prototipos que muestran la apariencia y el comportamiento deseados, **no** código de producción para copiar tal cual. Tu tarea es **recrear este look & feel y estas pantallas dentro del entorno existente del proyecto** (React, Next, Vue, SwiftUI, etc.), usando sus patrones y librerías establecidos. Si el proyecto aún no tiene un sistema de UI, elige el enfoque más apropiado e implementa los tokens de `tokens.css` / `tailwind.tokens.js`.

---

## 1. Resumen

Tema visual y flujo de registro/onboarding para **Finanzas**, una app de finanzas personales cuyo foco es **ayudar a la persona a ver cuánto lleva gastado en el mes con sus tarjetas de crédito**. Tono cálido y alentador, en **español**. Estética **playful** (amable, redondeada, con una mascota tipo moneda) sobre un esquema **azul + naranja en blanco cálido**.

El paquete cubre:
- **8 pantallas iOS** (flujo completo: bienvenida → panel).
- **3 pantallas web/escritorio** (las clave, adaptadas a pantalla grande).
- **Tokens de diseño** (color, tipografía, radios, sombras, degradados).
- **Componentes reutilizables** y su anatomía.

## 2. Fidelidad

**Alta fidelidad (hi-fi).** Colores, tipografía, espaciados y estados son finales. Reprodúcelos con precisión usando las librerías/patrones del codebase. Los valores exactos están en `tokens.css` (variables CSS) y `tailwind.tokens.js` (si usas Tailwind).

## 3. Sistema de diseño

### Color
Esquema azul (primario/acción) + naranja (acento/alertas amables) sobre neutros slate cálidos. Valores completos en `tokens.css`. Resumen:

| Rol | Token | Hex |
|---|---|---|
| Acción principal (botones, links) | `--blue-700` | `#1d4ed8` |
| Foco / hover / degradados | `--blue-600` | `#2563eb` |
| Fondo suave / chip activo | `--blue-50` | `#eff6ff` |
| Acento / CTA secundario | `--orange-500` | `#f97316` |
| Fondo naranja suave | `--orange-50` | `#fff7ed` |
| Texto principal / títulos | `--ink` | `#0f172a` |
| Texto secundario | `--muted` | `#64748b` |
| Placeholders / terciario | `--muted-2` | `#94a3b8` |
| Bordes y separadores | `--line` | `#e9eef5` |
| Fondo de app | `--surface` | `#f6f8fc` |

Degradados de marca: `--grad-brand` (paneles azules), `--grad-card` (tarjeta de crédito, azul→naranja), `--grad-accent` (barras/anillo de progreso).

### Tipografía
- **Syne** (700/800) — títulos, wordmark, montos grandes de marca, números destacados de UI.
- **DM Sans** (400–700) — cuerpo, botones, formularios, etiquetas.
- **JetBrains Mono** (400/500) — montos monetarios, códigos OTP, fechas, rangos del slider.

Escala usada (móvil): título de pantalla 30px / Syne 800 / line-height 1.08 / letter-spacing -0.025em; subtítulo 16px / DM Sans / `--muted`; etiquetas de campo 13px/600; cuerpo de input 16px; montos grandes 46px JetBrains Mono 500.

`<link>` de fuentes:
```html
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
```

### Radios, sombras, espaciado
- Radios: chips 10px, campos 14px, botones 16px, cards de lista 20px, cards principales 24px, pills 999px.
- Sombras: ver `--shadow-card / --shadow-blue / --shadow-orange / --shadow-float`.
- Padding estándar de pantalla móvil: **24px** horizontal. Gap vertical entre bloques: 16–22px.
- Altura de objetivos táctiles: botones **54px**, campos **54px**, social/sub-botones 52px (nunca < 44px).

### Mascota — "Fino"
Una **moneda** circular con cara amable, construida **solo con círculos + un arco de sonrisa** (SVG geométrico, no ilustración compleja). Cuerpo con degradado naranja (`#ffc785 → #fb923c → #f97316`), aro interior blanco al 45%, ojos azul marino `#11295f`, rubor naranja. Código en `reference-files/ds.jsx` (componente `Fino`). Reutilízala en bienvenida, notificaciones, panel y paneles de marca. Tamaños usados: 40–160px.

### Imágenes / fondos
Sin fotografías. Decoración a base de **blobs con degradado radial** y desenfoque suave (`Blobs` en `ds.jsx`): azul claro + naranja claro sobre blanco, o blancos/naranjas translúcidos sobre fondo azul.

## 4. Componentes reutilizables

Referencia de implementación en `reference-files/ds.jsx`. Reconstruir como componentes del codebase:

- **`Btn`** — variantes: `primary` (azul `--blue-700`, texto blanco, `--shadow-blue`), `orange`, `dark` (`#0f172a`), `outline` (blanco, borde `--line`), `soft` (`--blue-50`), `ghost`. Altura 54px, radio 16px, DM Sans 600/16px, gap 9px para ícono.
- **`Field`** — etiqueta 13px/600 `--ink-2`; caja 54px, radio 14px, borde `--line` (foco: borde `--blue-600` + ring `0 0 0 4px rgba(37,99,235,0.12)`); ícono a la izquierda en `--muted`; `hint` opcional 12.5px `--muted`. Estado `password` con ícono ojo.
- **`Chip`** — pill 38px, activo = `--blue-50` + borde `--blue-600` + texto `--blue-700` (con check); inactivo = blanco + borde `--line`.
- **`Dots`** — indicador de paso del carrusel; punto activo se alarga a 22px en `--blue-700`.
- **`TopBar`** (móvil) — botón atrás (cuadro 38px radio 12px) + barra de progreso (degradado `--grad-accent`) + contador `n/6` en mono.
- **`CreditCard`** — tarjeta ratio 1.6:1, radio 20px, fondo `--grad-card`, chip dorado, número en JetBrains Mono, sombra azul. Círculo decorativo translúcido arriba a la derecha.
- **`SpendRing`** — anillo de progreso SVG (`stroke` degradado `--grad-accent`, grosor 14, `strokeLinecap round`); centro con monto (Mono) y "de $X".
- **`Wordmark` / `Mark`** — logo: cuadrado redondeado azul con moneda naranja y signo "$" + texto "Finanzas" en Syne 800.

## 5. Pantallas

> Copy exacto incluido. Layout móvil = columna con contenido `flex:1` y footer fijo de CTAs. Padding 24px. El status bar/Dynamic Island es del marco iOS (no implementar como UI propia salvo en web).

### iOS (390–402px de ancho de viewport)

1. **Bienvenida** — `--surface`/degradado claro + blobs. Wordmark arriba; centro: mascota grande (160px) con halo naranja, título **"Tus tarjetas, bajo control."** (Syne 33px), subtítulo "Mira cuánto llevas gastado este mes con tus tarjetas, en segundos.", `Dots` (1/3). Footer: `Btn primary` "Crear cuenta" + texto "Ya tengo cuenta · **Inicia sesión**".
2. **Crear cuenta** — `TopBar` 1/6. Título "Crea tu cuenta" + "Empieza gratis. Sin tarjetas guardadas hasta que tú quieras." Dos botones sociales en grid (Apple oscuro + Google outline). Divisor "o con tu correo". Campos: Correo (ícono mail), Contraseña (ícono lock, ojo, hint "Mínimo 8 caracteres."). Footer: `Btn primary` "Continuar" + legal "Al continuar aceptas los **Términos** y el **Aviso de Privacidad**."
3. **Verificación** — `TopBar` 2/6. Ícono mail en cuadro `--blue-50`. Título centrado "Revisa tu correo" + "Enviamos un código de 6 dígitos a **andrea@correo.com**". Seis cajas OTP (46×58, Mono 26px); la activa con borde azul + cursor. "¿No llegó? Reenviar en **0:42**". Footer: "Verificar".
4. **Perfil y moneda** — `TopBar` 3/6. "Un poco sobre ti". Avatar circular (degradado azul, inicial) con badge "+" naranja. Campo "¿Cómo te llamas?" (ícono usuario). Selector "Moneda principal" en grid 2×2 (MXN $, USD $, EUR €, COP $) — activo = `--blue-50` + check. Footer: "Continuar".
5. **Agrega tarjetas** — `TopBar` 4/6. "Agrega tus tarjetas" + "Conecta las tarjetas que quieres vigilar. Solo lectura — nunca movemos tu dinero." `CreditCard` (•••• 4242, ANDREA RÍOS, VISA). Lista: fila de tarjeta agregada (ícono, "Visa Oro", "•••• 4242", check) + botón punteado `--blue-50` "+ Agregar otra tarjeta". Footer: "Continuar".
6. **Límite mensual** — `TopBar` 5/6. "Pon tu límite del mes" + "Te avisamos cuando te acerques. Puedes cambiarlo cuando quieras." Monto grande centrado `$12,000` (Mono 46px) + "MXN por mes". Slider (track `--line`, relleno `--grad-accent`, thumb blanco borde azul) con rango $2,000–$30,000. "¿Qué quieres vigilar?" → fila de `Chip` (Comida, Transporte, Compras, Suscripciones, Salud, Ocio). Footer: "Guardar límite".
7. **Notificaciones** — fondo azul `--grad-brand` + blobs, **status bar claro**. Ícono campana en cuadro translúcido. Título blanco "¿Te avisamos antes de pasarte?" + "Una alerta amable cuando estés cerca de tu límite. Sin spam, lo prometemos." Tarjeta de previsualización de notificación (blanca, con mascota): "Vas al 78% de tu límite / Te quedan $2,640 para el día 31." Footer: `Btn orange` "Activar notificaciones" + "Ahora no".
8. **Panel del mes** (payoff) — fondo `--surface`. Header: avatar + "¡Todo listo, Andrea! 🎉" + "Mayo 2026" + botón campana. Card de anillo (`SpendRing` 70%): "Gastado este mes" → **$8,420** "de $12,000" + pill "Te quedan $3,580 · día 22". Sección "Movimientos" + "Ver todo" + lista (Spotify/Uber/Super Aurrera/Amazon con categoría y monto en Mono `−$…`). Tab bar inferior (Inicio, Tarjetas, **+** central elevado azul, Metas, Perfil).

### Web / Escritorio (1240px, dentro de chrome de navegador en el prototipo — en producción es la app web responsiva)

- **Landing** — Nav (wordmark + Producto/Precios/Seguridad/Entrar + `Btn primary` "Crear cuenta"). Hero a 2 columnas: izquierda = badge "Nuevo · Alertas inteligentes", título 58px "Tus tarjetas, bajo **control**.", subtítulo, CTAs "Empieza gratis" + "Ver demo", prueba social ("+24,000 personas…"); derecha = mascota + mini-card de gasto flotante + `CreditCard` flotante sobre blob.
- **Crear cuenta** — split 2 columnas: izquierda panel `--grad-brand` con wordmark, mascota, "Empieza a gastar con claridad." y 3 propuestas de valor (Solo lectura / Cifrado / Gratis); derecha formulario (Apple/Google + correo/contraseña + "Crear cuenta" + "¿Ya tienes cuenta? Inicia sesión").
- **Panel · Web app** — layout app: sidebar 240px (wordmark + nav Inicio/Tarjetas/Movimientos/Metas/Reportes + card "Mejora a Pro"); main con header (saludo + buscador + avatar) y grid: card de `SpendRing` + tres stat cards (Disponible/Tarjetas/Promedio·día) + tabla "Movimientos recientes".

## 6. Interacciones y comportamiento

- **Navegación del flujo:** lineal con barra de progreso (`n/6`); botón atrás vuelve al paso previo. "Inicia sesión" deriva al login (fuera de este alcance).
- **Validación:** correo con formato válido; contraseña ≥ 8 caracteres (hint visible). OTP de 6 dígitos con autofoco al siguiente input y reenvío con cuenta regresiva (42s).
- **Estados:** inputs con foco (borde `--blue-600` + ring azul). Chips/monedas/tarjetas con estado seleccionado. Botones con leve `transform` al presionar.
- **Slider de límite:** actualiza el monto grande en vivo; categorías son toggles.
- **Notificaciones:** "Activar" dispara el permiso del sistema; "Ahora no" continúa al panel.
- **Panel:** el `SpendRing` refleja gasto/límite; alerta amable al cruzar ~78%.
- **Responsive:** móvil = 1 columna, footer fijo de CTAs; escritorio = layouts a 2 columnas / app con sidebar. Anímate a colapsar el sidebar bajo ~1024px.

## 7. Estado / datos (referencia para backend)

Variables sugeridas: `email`, `password`, `otpCode`, `name`, `currency`, `cards[]` (red, últimos 4, banco), `monthlyLimit`, `watchedCategories[]`, `notificationsEnabled`. Datos del panel: `spentThisMonth`, `limit`, `remaining`, `transactions[]` (comercio, categoría, monto, fecha). La copy de ejemplo usa MXN; respeta la `currency` elegida para formato y símbolo.

## 8. Tokens

Ver `tokens.css` (variables CSS, listo para pegar) y `tailwind.tokens.js` (extensión de tema). Contienen todos los colores, fuentes, radios, sombras y degradados nombrados arriba.

## 9. Assets

- **Mascota "Fino", logo, tarjeta, anillo, íconos:** todos son **SVG inline** generados en código (no hay archivos de imagen externos). Ver `reference-files/ds.jsx`. Reimpleméntalos como componentes SVG/Icon.
- **Fuentes:** Google Fonts (Syne, DM Sans, JetBrains Mono).
- **Logos de marcas** (Apple, Google, comercios): usa los SVG oficiales/licenciados de cada marca en tu codebase; los del prototipo son aproximaciones.

## 10. Archivos de este paquete

- `Finanzas Onboarding.html` — prototipo navegable (ábrelo para ver todo en un canvas con zoom/pan).
- `reference-files/ds.jsx` — **tokens + mascota + componentes** (la fuente de verdad de la anatomía de cada componente).
- `reference-files/mobile-screens.jsx` — las 8 pantallas iOS.
- `reference-files/desktop-screens.jsx` — las 3 pantallas web.
- `reference-files/app.jsx` — cómo se ensamblan en el canvas (solo organización).
- `tokens.css` — variables CSS listas para producción.
- `tailwind.tokens.js` — tokens para `tailwind.config.js`.

> Los `.jsx` usan React + estilos inline a modo de **referencia legible**; no los importes tal cual. Extrae de ellos los valores y la estructura, y reconstruye con los componentes y convenciones de tu proyecto.
