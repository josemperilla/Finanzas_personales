# Sistema de diseño y assessment del frontend

## Objetivo

La PWA prioriza el registro cotidiano de gastos desde móvil, la lectura rápida del mes y la confianza en cada acción. La evolución conserva la identidad azul/naranja y evita animación decorativa que compita con los datos.

## Hallazgos

- La aplicación ya tenía una identidad consistente, dark mode, modo accesible y buen uso inicial de Framer Motion.
- Las páginas principales concentran entre 600 y 850 líneas y repiten estilos inline para tarjetas, botones, campos, skeletons y overlays.
- Los overlays no compartían manejo de foco, cierre por `Escape` ni bloqueo de scroll.
- Filtros y estados activos podían quedar ocultos, especialmente en Historial.
- Todas las pantallas se incluían en el bundle inicial aunque el usuario solo viera una pestaña.
- El movimiento perpetuo no siempre consultaba `prefers-reduced-motion`.
- No existía una suite de pruebas del frontend.

## Principios

1. **La acción principal siempre es evidente.** Agregar, guardar, reintentar y cerrar usan jerarquías repetibles.
2. **El movimiento explica cambios.** Se usa para entrada, selección, reordenamiento y confirmación; no como ruido constante.
3. **Los datos aparecen por capas.** Resumen primero, detalle y filtros después.
4. **Móvil primero.** Touch targets de al menos 44 px, safe areas, ancho mínimo de 320 px y controles utilizables con una mano.
5. **Accesibilidad por defecto.** Foco visible, nombres accesibles, estados anunciados y reduced motion.

## Tokens y componentes

- `src/index.css` contiene color, tipografía, espaciado, radios, sombras, capas y duraciones.
- `src/lib/motion.ts` centraliza transiciones de página, listas, overlays, sheets y confirmaciones.
- `src/components/ui/primitives.tsx` ofrece encabezados, tarjetas, botones, skeletons, spinner y toast.
- `src/lib/useOverlayA11y.ts` bloquea el fondo, mueve el foco y permite cerrar overlays con `Escape`.

## Patrones de interacción

- La barra inferior mantiene cinco destinos, anuncia la pestaña actual y deja Agregar como acción central.
- Historial muestra cantidad de filtros activos, resultados y una acción única para limpiar.
- Los formularios identifican campos obligatorios y anuncian estados de guardado.
- Chat usa una región `log` y comunica el estado del envío a tecnologías asistivas.
- Los overlays de pantalla completa deben usar `role="dialog"`, `aria-modal`, título asociado y `useOverlayA11y`.

## Deuda técnica siguiente

- Extraer secciones presentacionales de Home, Historial, Agregar, Análisis y Ajustes.
- Migrar gradualmente estilos inline repetidos a las primitivas existentes.
- Aplicar el hook de overlay a todos los sheets heredados.
- Añadir pruebas de integración para guardar, filtrar, editar y cambiar de perfil.
- Revisar dependencias reportadas por `npm audit` antes de una actualización mayor.
