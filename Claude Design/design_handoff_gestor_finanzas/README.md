# Handoff: Gestor de Finanzas Personales — Rediseño + Deploy a Cloudflare

## Resumen
Rediseño de una PWA mobile-first de finanzas personales para Colombia (es-CO). Mantiene la
identidad de marca **azul + naranja**, gamificación (XP Hormiga→Maestro, rachas, retos, sueños),
modo claro/oscuro y navegación inferior de 5 pestañas + botón central "Agregar".

Este documento explica **cómo desplegar en Cloudflare** y sirve de referencia de diseño para
reimplementar la app en un codebase real.

---

## Sobre los archivos de este paquete
Los archivos HTML aquí son **referencias de diseño creadas en HTML** — prototipos que muestran
la apariencia y el comportamiento buscados, **no** código de producción para copiar tal cual.

- `index.html` — Build standalone autocontenido (fuentes + runtime embebidos, funciona offline).
  Es el **lienzo de diseño**: todas las pantallas dispuestas una al lado de otra sobre fondo gris.
  No es una app navegable; es una vista de revisión.
- `source/Gestor Finanzas Definitiva.dc.html` — Fuente editable del diseño (Design Component).

## Fidelidad
**Alta fidelidad (hifi).** Colores, tipografía, espaciado e interacciones son finales. Al
reimplementar en el codebase, reproducir la UI con exactitud usando las librerías y patrones
existentes del proyecto.

---

# Despliegue en Cloudflare

Hay dos caminos. Elegí según qué querés publicar.

## Camino A — Publicar el prototipo estático (rápido, sin build)

El `index.html` es autocontenido. Cloudflare Pages lo sirve directo. Útil para una **URL de
revisión de diseño** compartible. (Recordá: es el lienzo con todas las pantallas, no una app navegable.)

```bash
# Desde la carpeta de este handoff, con la carpeta que contiene index.html:
npx wrangler pages deploy . --project-name=gestor-finanzas-diseno

# o creando el proyecto primero en el dashboard de Cloudflare y conectando un repo Git:
#   Build command:  (vacío — no hay build)
#   Output directory: /  (la raíz, donde está index.html)
```

Requisitos: cuenta de Cloudflare, `wrangler` autenticado (`npx wrangler login`).

## Camino B — Reconstruir la app real y desplegarla (recomendado)

El brief objetivo es una **PWA React 18 + TypeScript (Vite)**. La tarea es **recrear estos
diseños HTML** en ese entorno (o el más apropiado si aún no existe), con rutas, estado,
teclado/PIN funcionales, dark/light real, etc. Luego desplegar el build estático a Cloudflare Pages.

```bash
# 1. Crear la app (si no existe)
npm create vite@latest gestor-finanzas -- --template react-ts
cd gestor-finanzas && npm install

# 2. Implementar las pantallas (ver "Pantallas" y "Tokens" abajo)

# 3. Build de producción
npm run build            # genera /dist

# 4. Desplegar a Cloudflare Pages
npx wrangler pages deploy dist --project-name=gestor-finanzas

# Alternativa Git (CI automático en Cloudflare Pages):
#   Framework preset:  Vite
#   Build command:     npm run build
#   Output directory:  dist
```

PWA: configurar `vite-plugin-pwa` para manifest + service worker (instalable, offline).

---

# Sistema de diseño (tokens)

## Tipografía
- **Space Grotesk** (700) — display / títulos / niveles
- **Plus Jakarta Sans** (400–800) — cuerpo / UI / etiquetas
- **IBM Plex Mono** (500/600/700) — montos y datos numéricos (tabular)

Google Fonts:
```
https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@500;600;700&display=swap
```

## Color — Marca (no negociable)
| Token | Hex | Uso |
|---|---|---|
| `--blue` | `#2563EB` | Azul primario |
| `--blue-2` | `#3B82F6` | Azul acento |
| `--blue-soft` | `#E9F0FE` | Tinte azul (fondos/chips) |
| `--orange` | `#EA580C` | Naranja primario |
| `--orange-2` | `#F97316` | Naranja acento |
| `--orange-soft` | `#FDEADD` | Tinte naranja |

## Color — Modo claro
| Token | Hex |
|---|---|
| `--bg` | `#F5F5F2` |
| `--surface` | `#FFFFFF` |
| `--surface-2` | `#F0F0EC` |
| `--ink` | `#16171C` |
| `--ink-2` | `#4A4D56` |
| `--muted` | `#8D909A` |
| `--line` | `#ECECE6` |
| `--good` / `--good-soft` | `#15A34A` / `#E4F6EA` |
| `--neg` / `--neg-soft` | `#DC2626` / `#FDECEC` |

## Color — Modo oscuro
| Token | Hex |
|---|---|
| `--bg` | `#0A0D13` |
| `--surface` | `#141923` |
| `--surface-2` | `#1B212C` |
| `--ink` | `#F2F4F8` |
| `--ink-2` | `#A7ADBA` |
| `--muted` | `#697084` |
| `--line` | `#222A36` |
| `--blue` / `--blue-2` / `--blue-soft` | `#3B82F6` / `#60A5FA` / `#16243F` |
| `--orange` / `--orange-2` / `--orange-soft` | `#F97316` / `#FB923C` / `#2E1C10` |
| `--good` / `--good-soft` | `#22C55E` / `#13301F` |

## Radio de borde
`10px` (sm) · `14px` (md) · `16px` (lg) · `20px` (xl) · `24px` (2xl) · `999px` (pill)

## Sombras
- card (claro): `0 1px 2px rgba(16,18,28,.04), 0 8px 22px rgba(16,18,28,.06)`
- float (claro): `0 2px 4px rgba(16,18,28,.06), 0 16px 40px rgba(16,18,28,.14)`
- card (oscuro): `0 1px 2px rgba(0,0,0,.3), 0 8px 22px rgba(0,0,0,.35)`
- FAB naranja: `0 8px 20px rgba(234,88,12,.4)`

## Accesibilidad
- Hit targets ≥ 44px (52px en modo accesible).
- Viewport típico: max-width 430px (mobile-first).

---

# Pantallas incluidas

| # | Pantalla | Notas de implementación |
|---|---|---|
| 01 | **Fundamentos** | Paleta, tipografía, tokens de radio/sombra |
| 02 | **Home** | Orden: Donut (protagonista) → Reto activo → Balance del mes → Movimientos. Donut SVG por categoría, montos en IBM Plex Mono grandes |
| 03 | **Progreso** | Nivel/XP (Hormiga→Maestro), racha con llama, calendario 7 días, 3 Círculos de Bienestar |
| 04 | **Agregar** | Teclado numérico **funcional** (formatea COP en vivo), QR y micrófono arriba a la derecha, chips de categoría, selector de banco |
| 05 | **PIN Lock** | Interactivo (6 puntos), estados: normal / error (vibra + rojo) / límite de intentos (countdown) |
| 06 | **Crear PIN** | 2 pasos (crear + confirmar) con validación de coincidencia |
| 07 | **Onboarding** | 4 pasos: bienvenida, perfil+avatar, meta de gasto, código de invitación |
| 08 | **Código de invitación** | Estados: inactivo / validando (spinner) / éxito (animación) / error |
| 09 | **Selector de perfil** | Bottom sheet, hasta 5 perfiles, activo resaltado, cambiar bloquea sesión |
| 10 | **Misiones** | Conmutador Sueños / Retos. Sueños = metas con barra; Retos = 7/14/30 días con +XP |

**Pendientes** (sketch en el lienzo, no diseñados en detalle): Explorar/Análisis, Historial,
Chat, Cuentas, Ajustes.

## Interacciones clave a reproducir
- **Teclado Agregar y PIN**: actualización de estado en vivo; formateo de miles con puntos (COP).
- **Animaciones**: `shake` (error), `pop` (éxito), `spin` (loading). Pensadas para spring (Framer Motion).
- **Dark/light**: alternar el set de variables CSS en `:root` / `[data-theme="dark"]`.
- **Navegación inferior**: 5 tabs + FAB central elevado (tratamiento "Elevado").

## Iconografía
SVG en línea (Lucide-style, sin emoji). Usar una librería de iconos del codebase (p. ej.
`lucide-react`) en lugar de copiar los SVG crudos.

---

# Archivos
- `index.html` — prototipo standalone (referencia visual / deploy Camino A)
- `source/Gestor Finanzas Definitiva.dc.html` — fuente editable del diseño
