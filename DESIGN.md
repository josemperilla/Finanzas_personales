# Sistema de diseño y assessment del frontend

## Objetivo

La PWA prioriza el registro cotidiano de gastos desde móvil, la lectura rápida del mes y la confianza en cada acción. La evolución conserva la identidad de marca (verde + terracota, con grises para la versión oscura) y evita animación decorativa que compita con los datos.

## Principios

1. **La acción principal siempre es evidente.** Agregar, guardar, reintentar y cerrar usan jerarquías repetibles.
2. **El movimiento explica cambios.** Se usa para entrada, selección, reordenamiento y confirmación; no como ruido constante.
3. **Los datos aparecen por capas.** Resumen primero, detalle y filtros después.
4. **Móvil primero.** Touch targets de al menos 44 px (`--touch-min`), safe areas, ancho mínimo de 320 px y controles utilizables con una mano.
5. **Accesibilidad por defecto.** Foco visible, nombres accesibles, estados anunciados y `prefers-reduced-motion`.

## Dónde viven los tokens

- `src/index.css` — `:root` define color, tipografía, espaciado, radios, sombras, capas y duraciones. El bloque `[data-theme="dark"]` (y `@media (prefers-color-scheme: dark)`) los redefine.
- `src/lib/motion.ts` — transiciones de Framer Motion (página, listas, overlays, sheets, confirmaciones).
- `src/components/ui/primitives.tsx` — encabezados, tarjetas, botones, skeletons, spinner y toast.
- `src/lib/useOverlayA11y.ts` — bloquea el fondo, mueve el foco y cierra overlays con `Escape`.

## Tokens — valores reales (tema claro)

### Color de marca
> ⚠️ **Nota de naming:** los tokens `--blue-*` contienen **verde-teal** en el tema claro
> (`--blue-600: #0E6B4D`). El nombre "blue" es histórico. En el tema oscuro sí viran a
> azul/cian (`--blue: #00B4FF`). Ver "Inconsistencias".

| Token | Claro | Oscuro | Uso |
|---|---|---|---|
| `--blue` / `--blue-600` | `#0E6B4D` | `#00B4FF` | Acción primaria, marca |
| `--blue-700` | `#0a5640` | — | Hover/presionado, barras |
| `--blue-soft` / `--blue-100` | `#DDEBE3` | `#10303D` | Fondos suaves de marca |
| `--orange` / `--orange-500` | `#B85C3A` | `#FF6B5C` | Acento secundario, alertas suaves |
| `--orange-soft` | `#F1E2D6` | `#2A1814` | Fondo de acento |

### Neutros y superficies
| Token | Claro | Oscuro |
|---|---|---|
| `--ink` | `#1C1B17` | `#E8F0F7` |
| `--muted` | `#6E6759` | `#8A99A8` |
| `--line` | `#E4DDCF` | `#222B36` |
| `--surface` | `#F5F1EA` | `#0B0F14` |
| `--card` | `#FCFAF5` | `#161C24` |

### Estado (semántico)
| Token | Valor | Fondo |
|---|---|---|
| `--success` | `#15a34a` | `--success-bg: #e4f6ea` |
| `--danger` | `#b91c1c` | `--danger-bg: #fee2e2` |
| `--warning` | `#c2410c` | `--warning-bg: #fdeadd` |

### Tipografía
- `--font-display`: **Space Grotesk** (títulos, cifras, headers de card)
- `--font-body`: **Plus Jakarta Sans** (cuerpo, labels, botones)
- `--font-mono`: **IBM Plex Mono** (montos)
- Escala (claro → oscuro/accesible escala más grande): `--text-2xs 11px` · `--text-xs 12px` · `--text-sm 14px` · `--text-base 15px` · `--text-lg 17px` · `--text-xl 20px` · `--text-2xl 24px` · `--text-3xl 32px`. El modo accesible sube toda la escala (2xs→13, base→18, 3xl→40) y `--touch-min` 44→52px.

### Espaciado, radios, sombras
- **Espaciado** (múltiplos de 4): `--space-1 4` … `--space-6 24` · `--space-8 32`.
- **Radios**: `--r-sm 10` · `--r-md 14` · `--r-lg 16` · `--r-xl 20` · `--r-2xl 24` · `--r-pill 999`.
- **Sombras**: `--shadow-card` (tarjetas), `--shadow-float` (overlays/drawer), `--shadow-blue`/`--shadow-orange` (botones de marca), `--shadow-nav` (barra inferior), `--shadow-focus` (anillo de foco `0 0 0 4px rgba(14,107,77,0.18)`).
- **Gradientes**: `--grad-brand`, `--grad-card`, `--grad-accent`, `--grad-orange`.

### Capas (z-index) y movimiento
- **z-index**: `--z-nav 100` · `--z-overlay 300` · `--z-toast 10000`. (No existe `--z-drawer` pese a usarse como fallback — ver Inconsistencias.)
- **Duraciones CSS**: `--motion-fast 140ms` · `--motion-base 220ms` · `--motion-slow 360ms`; `--ease-out: cubic-bezier(0.22, 1, 0.36, 1)`.
- **Framer (`motion.ts`)**: `softSpring` (spring 420/34/0.9 — sheets y confirmaciones), `quickEase` (220ms, mismo bezier que `--ease-out` — entradas rápidas), `pageVariants` (transición de página con leve rotateY), `staggerContainer`+`riseItem` (listas), `overlayVariants`/`sheetVariants`/`popVariants`.

## Patrones de interacción

- La barra inferior mantiene cinco destinos, anuncia la pestaña actual y deja **Agregar** como acción central.
- Historial muestra cantidad de filtros activos, resultados y una acción única para limpiar.
- Los formularios identifican campos obligatorios y anuncian estados de guardado.
- Chat usa una región `log` y comunica el estado del envío a tecnologías asistivas.
- **Overlays de pantalla completa** deben usar `role="dialog"`, `aria-modal="true"`, `aria-label`/título asociado y el hook `useOverlayA11y`. Patrón canónico: backdrop `aria-hidden` + panel con `ref` para el hook. (Aplicado en Onboarding, Drawer, CategorizarModal, MonthRecapModal.)
- Estados vacíos: `FriendlyEmptyState`. Animación de aparición: `riseItem` dentro de `staggerContainer`.

## Inconsistencias detectadas (auditoría 2026-06-24)

1. **`--blue-*` es verde en claro.** Naming engañoso: el código de marca usa `--blue` para verde-teal. Decisión: documentado y aceptado por ahora; renombrar sería un cambio masivo. No introducir literales verdes nuevos — usar el token.
2. **z-index de overlays inconsistente.** Conviven `var(--z-overlay)` (300), literales `zIndex: 400` (CategorizarModal, MonthRecapModal) y `var(--z-drawer, 9999)` con un `--z-drawer` **inexistente**. Acción sugerida: definir `--z-drawer`/`--z-modal` y migrar literales.
3. **Verde de éxito duplicado.** `--success: #15a34a` (token) vs `#16a34a` hardcodeado en `lib/healthScore.ts` (y otros hex de estado en componentes). Migrar a los tokens semánticos `--success/--danger/--warning`.
4. **Backdrops hardcodeados.** `rgba(0,0,0,0.5)` y `rgba(15,23,42,0.4)` aparecen inline en overlays sin token. Sugerido: `--scrim`.
5. **Dos sistemas de duración.** `motion.ts` (JS) y `--motion-*` (CSS) coexisten; `quickEase` replica `--ease-out`. Mantener `motion.ts` como fuente para Framer y `--motion-*` solo para transiciones CSS puras.

## Deuda técnica siguiente

- Extraer secciones presentacionales de Home, Historial, Agregar, Análisis y Ajustes.
- Migrar gradualmente estilos inline repetidos a las primitivas existentes y a tokens (scrim, z-layers, colores de estado).
- Aplicar `useOverlayA11y` a los sheets heredados restantes (BadgeGallery, CategorySheet, RetosPanel, QrScanner, ImportarExtracto*, ProfileSelector, InviteRedeem, TutorialCanales).
- Añadir pruebas de integración para guardar, filtrar, editar y cambiar de perfil.
