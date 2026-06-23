# Corriente — Port del prototipo al PWA de producción (Plan de ejecución)

> Documento para que un agente (Opus 4.8 u otro) lo tome y ejecute hasta que la app
> React real (`pwa/src/`) quede **visual y funcionalmente igual** al prototipo aprobado
> "Corriente". **No hacer deploy ni push a `main` sin aprobación explícita del usuario.**

## Objetivo y fuente de verdad

- **Objetivo:** que cada pantalla del PWA coincida con el prototipo.
- **Fuente de verdad visual:** `.tmp/propuesta_frontend/index.html` (prototipo aprobado) y la preview viva `https://corriente-skin.finanzas-abiertas.pages.dev`.
- **Lenguaje del diseño:** ya está en el PWA. NO reinventar tokens.

## Estado actual (al iniciar)

**HECHO (no repetir):**
- Re-skin global de paleta en `pwa/src/index.css` (`:root` claro + `[data-theme="dark"]` + `@media prefers dark`): claro = esmeralda `--blue:#0E6B4D` + papel `--surface:#F5F1EA`; **oscuro = noche `#0B0F14` + azul fosforescente `--blue:#00B4FF`** (ref. Bia). Arcilla `--orange:#B85C3A`. Mismos nombres de token (los 1.557 estilos inline los heredan).
- `FlowBackground.tsx` montado en `App.tsx` (canvas fijo, reactivo al tema, `prefers-reduced-motion`). Raíz transparente para que se vea.
- Fuentes: Space Grotesk (display) + Plus Jakarta Sans (body) + IBM Plex Mono — ya cargadas en `pwa/index.html`.
- `Home.tsx`: héroe prototipo (monto grande + barra de meta + delta), categorías en barras, **balance eliminado**.
- Build verde: `cd pwa && npm run build` (tsc strict) + `npm run test` (vitest 13/13).

**PENDIENTE (las tareas T1–T9 de abajo).**

## Reglas y constraints (léelo todo)

1. **CSS-var driven.** El sistema son custom properties en `pwa/src/index.css`. Reutilizá esos tokens (`var(--blue)`, `var(--surface)`, `var(--card)`, `var(--line)`, `var(--muted)`, `var(--ink)`, `var(--font-display)`, `var(--font-mono)`, etc.). **No uses clases utility de Tailwind** (no se usan en el app). Estilos inline + `framer-motion`, igual que el código existente.
2. **Imports relativos.** No hay alias `@/*` (tsconfig sin `paths`). Ej: `import { x } from '../lib/api'`.
3. **TypeScript estricto** (`strict:true`, `noEmit`). Tipá todo. `noUnusedLocals:false` (variables sin usar no rompen build).
4. **Gate de build después de CADA tarea:** `cd pwa && npm run lint && npm run build && npm run test`. Debe quedar verde antes de pasar a la siguiente. `lint` sale 0 aunque tenga warnings (no usa `--max-warnings`).
5. **No deploy.** No `wrangler deploy`, no push a `main`, no crear proyectos Cloudflare. El único proyecto es `finanzas-abiertas` (producción viva, NO tocar). Para previsualizar usá `cd pwa && npm run dev` (http://localhost:5173) + skill `/browse`.
6. **No romper funciones.** Las Pages Functions `functions/api/*.js` (proxy, ocr, etc.) y la capa de datos `pwa/src/lib/api.ts` son fuente de verdad. Las pantallas nuevas consumen `fetchTransactions`, `isGasto`, `getCategoryColor`, etc. — **nunca hardcodear datos demo**.
7. **No crear workflows ni skills nuevos** sin preguntar (CLAUDE.md).
8. **Idioma:** español (Colombia). Montos en COP, `formatCOP` de `lib/utils`.

## Tokens clave (ya definidos, reutilizar)

```
Claro: --blue:#0E6B4D (esmeralda) · --blue-2:#13805C · --blue-soft:#DDEBE3
       --surface:#F5F1EA (papel) · --card:#FCFAF5 (lino) · --line:#E4DDCF
       --ink:#1C1B17 · --muted:#6E6759 · --orange:#B85C3A (arcilla) · --good:#0E6B4D
Oscuro: --blue:#00B4FF (azul fosfo) · --blue-2:#3BD0FF · --surface:#0B0F14 (noche)
        --card:#161C24 · --ink:#E8F0F7 · --muted:#8A99A8
Tipos: --font-display (Space Grotesk) · --font-body (Plus Jakarta) · --font-mono (IBM Plex)
Radios: --r-sm 10 · --r-md 14 · --r-lg 16 · --r-xl 20 · --r-pill 999
Motion: --motion-fast 140 · --motion-base 220 · --motion-slow 360 · --ease-out cubic-bezier(.22,1,.36,1)
```

## Loop de convergencia (cómo sabés que una tarea está lista)

Para CADA pantalla:
1. `cd pwa && npm run dev` y abrí la pantalla (con login PIN de dev si hace falta).
2. Skill `/browse` → `screenshot` de la pantalla real.
3. Compará contra la pantalla equivalente del prototipo (`.tmp/propuesta_frontend/index.html`, o abrí ese archivo en el browser y navega a la misma pantalla).
4. Anotá deltas (layout, color, espaciado, tipografía, motion) y corregilos.
5. Repetí hasta match visual. Luego `npm run build && npm run test` verde.
6. Recién ahí avanzá a la siguiente tarea.

**Definition of Done global:** las 9 tareas pasan el loop de convergencia + build/test verde + `npm run lint` sin errores nuevos.

---

## Tareas

> Marcá `[GLM]` = probablemente ya hecho por GLM (verificá; si no está, hacelo). Las demás son para Opus.

### T1. Onboarding — 7 pasos "una decisión a la vez" `[Opus]`
**Archivos:** `pwa/src/components/Onboarding.tsx` (623 líneas, 5 pasos hoy), montado en `App.tsx:469-481`.
**Target (ver prototipo `<!-- ONBOARDING -->`):** overlay a pantalla completa con el flow de fondo visible, **7 pasos** con puntos de progreso, botones Atrás/Saltar/Continuar, transiciones con leve drift (`rotateY`+translate):
1. **Bienvenida** — wordmark "Corriente" (Space Grotesk) + tagline "tu dinero, en calma" + botón "Empezar".
2. **¿Cómo te llamas?** — input nombre + grilla de 6 avatars (íconos Lucide: user, sparkles, leaf, coffee, heart, plane).
3. **Tu meta mensual** — "¿Cuánto quieres gastar al mes?" + chips COP ($1.2M/$1.8M/$2.5M). Reusa `setMeta` de `lib/meta`.
4. **¿Cómo capturas tus gastos?** — multiselect de canales (SMS/voz/foto extracto/manual) con íconos Lucide.
5. **Crea tu PIN** — 4–6 dígitos con dots + numpad. (Hoy el PIN se hace en `SetupPin` antes del onboarding; podés moverlo acá o dejar el flujo — decisión de implementación, pero el STEP visual debe existir.)
6. **¿Tienes código de invitación?** — input opcional (multi-usuario), skip. Reusa `InviteRedeem`.
7. **Listo** — celebración calma + CTA "Registrar tu primer movimiento".
**Done cuando:** los 7 pasos se ven como el prototipo (calma, flow de fondo, tipografía display), progresan con Atrás/Saltar/Continuar, y persisten nombre/avatar/meta/PIN. Build verde.

### T2. Nav — 4 tabs + FAB + drawer `[Opus]`
**Archivos:** `pwa/src/components/BottomNav.tsx` (iconos + tabs), `pwa/src/App.tsx` (tab routing, `useState<Tab>` l74, render l360-433).
**Target:** bottom-nav de **4 tabs** (Inicio, Movimientos, Insights, Progreso) + **FAB central "Agregar"** + **drawer** (botón avatar top-right) con Cuentas, Asistente, Ajustes.
- Tabs: Inicio=`home`, Movimientos=`historial`, Insights=merge de `explorar`+`analisis` (hoy existen ambas — consolidá en una), Progreso=merge de `progreso`+`misiones`+`suenos`.
- FAB central: abre `Agregar` (hoy es un tab — pasalo a sheet/FAB).
- Drawer: avatar del topbar → panel lateral con Cuentas, Asistente (Chat), Ajustes (Settings), Exportar, Administrar usuarios.
- Iconos Lucide (ver T8) para los tabs; quitá los emoji/glifos unicode.
**Cuidado:** el routing es `useState` manual + `?tab=` URL param + lazy imports en App.tsx. No romper los `lazy(() => import(...))` ni los `?view=balance` shortcuts del manifest.
**Done cuando:** la nav tiene exactamente 4 tabs + FAB + drawer, todas las pantallas siguen alcanzables, `?tab=` sigue funcionando. Build + test verde (ojo con `BottomNav.test.tsx` — actualizalo si cambia la estructura de tabs).

### T3. Movimientos (Historial) — rango de fechas + logos + íconos `[Opus]`
**Archivos:** `pwa/src/pages/Historial.tsx`.
**Target:**
- Filtro **"Rango personalizado"** que despliega dos `<input type="date">` (Desde/Hasta). Filtra `transactions` por rango además de los chips existentes.
- **Logos reales de comercios** en cada fila (ya existe `MerchantLogo.tsx` con Clearbit→favicon→monograma; usalo; cambial el fallback monograma-letra por **ícono Lucide** de T8).
- Íconos Lucide por categoría (sin emojis).
**Done cuando:** el rango filtra correctly, los logos cargan (o caen a ícono Lucide), sin emojis. Build verde.

### T4. Agregar — dropdown de categorías + íconos `[Opus]`
**Archivos:** `pwa/src/pages/Agregar.tsx` (chips de categorías ~l453).
**Target:** reemplazar los chips por un **dropdown custom** (botón "Categoría" → popover con lista scrolleable de las 14 categorías, cada una con ícono Lucide + nombre + punto de color). Selección cierra el popover y muestra la elegida. Numpad amount-first se mantiene.
**Done cuando:** el selector es un dropdown (no chips), con íconos Lucide, sin emojis. Build verde.

### T5. Insights — barra de chat + FAB asistente + health meter `[Opus]`
**Archivos:** `pwa/src/pages/Explorar.tsx` (y `Analisis.tsx` si existe — consolidá).
**Target:**
- **Barra de chat fijada al pie** de Insights ("Pregunta sobre tu dinero…") → abre el Asistente (Chat).
- **FAB flotante "Pregúntale a Fino"** global (esquina inferior derecha, sobre la tab bar) → abre Chat. Montalo en `App.tsx` (global) además del drawer.
- **Health score** como medidor calmo (no anillo gamificado): valor 0–100 + label + subtexto. Reusa `analytics` existente.
**Done cuando:** chat bar + FAB visibles y abren el Asistente, health meter calmo. Build verde.

### T6. Cuentas — card art realista + 3D tilt + flip + cuota editable `[GLM — verificar]`
**Archivos:** `pwa/src/pages/Cuentas.tsx`, posiblemente nuevo `pwa/src/components/Card3D.tsx`.
**Target (ver prototipo `.card3d`):**
- Tarjeta **plata metalizada** (Banco de Bogotá Visa Platinum): `linear-gradient(135deg,#F2F4F7,#C9CFD8 38%,#E6E8EC 62%,#A9AFBA)` + brillo diagonal + chip + "VISA" en cursiva.
- Tarjeta **negra metal** (Itaú Mastercard Black): `radial-gradient(circle at 30% 20%,#26262b,#0a0a0c 70%)` + textura punteada (`radial-gradient` dots) + círculos Mastercard (rojo `#EB001B` + amarillo `#F79E1B` superpuestos).
- **3D tilt** al mover el dedo/mouse (rotateX/rotateY según posición), `perspective:1000-1200px`.
- **Flip 3D** (botón ↻): frente = card art; atrás = **cuota de manejo editable** (`<input>` con valor referencia Platinum `$43.190` / Black `Exonerada 6 periodos`) + optimizer (atribución, progreso exención, uso de cupo). Reusa `cardCatalog.ts`/`cardOptimizer.ts`.
- Banner "tarjeta sin registrar".
**Cuota de manejo referencia** (investigada, editable): Platinum "Gratis 6m → $43.190/mes"; Black "Exonerada 6 periodos". **Sin listas de beneficios** (muy variables).
**Done cuando:** las dos tarjetas se ven realistas, tilt responde, flip muestra la cuota editable, todo en la paleta nueva. Build verde.

### T7. Progreso — consolidación gamificación `[Opus]`
**Archivos:** `pwa/src/pages/Progreso.tsx`, `Misiones.tsx`, `Suenos.tsx` (mover a Progreso).
**Target:** **toda** la gamificación vive en Progreso: tarjeta de nivel (Hormiga→Maestro, gradient `var(--blue)→var(--blue-2)`), racha con calendario + freeze, galería de insignias (21, Lucide — sin emojis donde sea posible), sueños, retos, círculos de bienestar. En claro con esmeralda, en oscuro con azul fosforescente. Esta es la **única** pantalla donde la gamificación "habla fuerte".
**Done cuando:** Progreso contiene todo, las otras pantallas (Misiones/Suenos) se eliminan o redirigen, paleta correcta. Build verde.

### T8. Set de íconos Lucide (transversal) `[GLM — verificar]`
**Archivo nuevo:** `pwa/src/components/ui/icons.tsx` — exportar componentes inline SVG (Lucide-style: `viewBox="0 0 24 24"`, `fill="none"`, `stroke="currentColor"`, `stroke-width="2.1"`, round caps/joins), stroke ~2.1.
**Mapeo categoría→ícono:** Restaurantes=utensils, Domicilios=truck, Mercado=shopping-cart, Transporte=car, Hogar=home, Salud=heart-pulse, Deporte=dumbbell, Compras=shopping-bag, Suscripciones=repeat, Viajes=plane, Software=code, Bre-B=smartphone, Entretenimiento=film, Otro=more-horizontal. + fallbacks de comercio (store/receipt), nav (home/list/bar-chart/trophy), acciones (plus/check/search/arrow-right/chevron-down/mic/camera/file/qr), avatar options.
**Uso:** reemplazar **todos los emojis** de categorías y comercios (en Home, Historial, Agregar, Insights, Progreso) por estos íconos.
**Done cuando:** cero emojis en categorías/comercios, íconos Lucide consistentes, build verde. (El prototipo `.tmp/propuesta_frontend/index.html` tiene los paths SVG exactos en `const ICONS={...}` — copialos de ahí.)

### T9. Motion & 3D polish (la firma) `[GLM — verificar]`
**Archivos:** `pwa/src/lib/motion.ts`, `App.tsx` (transiciones de screen), `Home.tsx` (parallax hero), `Cuentas.tsx` (3D).
**Target:**
- **Transiciones de screen** con leve `rotateY`+translate (page-turn a lo largo del flow) en `pageVariants`/`AnimatePresence`.
- **Parallax del hero**: al mover pointer/scroll, las capas del hero se desplazan sutilmente (`perspective`+`rotateX/Y`).
- **Count-up** en todos los montos grandes (ya existe `useCountUp` en `lib/useCountUp.ts` — usalo en Insights stats también).
- **Reveal escalonado** de listas (stagger via `staggerContainer`/`riseItem` de `lib/motion`).
- **Micro press-scale** en botones (`whileTap={{scale:.97}}` — ya muy usado).
- Todo bajo `prefers-reduced-motion` (desactivar).
**Done cuando:** el motion se siente intencional y fluido, no genérico. Build verde.

---

## Verificación final (antes de reportar)

1. `cd pwa && npm run lint && npm run build && npm run test` → todo verde.
2. `/browse` screenshot de cada pantalla vs prototipo → match.
3. Probar toggles: tema claro/oscuro (azul fosfo), modo accesible.
4. Confirmar `/api/proxy` sigue funcionando (los datos reales cargan en dev con `VITE_WEBHOOK_URL`).
5. **NO deployar.** Reportar al usuario y esperar OK para preview/main.

## Notas de seguridad (repito)
- Un solo proyecto Cloudflare: `finanzas-abiertas`. No crear proyectos.
- `functions/api/` debe viajar con cualquier deploy (preview desde la raíz del repo: `wrangler pages deploy pwa/dist --project-name=finanzas-abiertas --branch <preview>`).
- Nunca `--branch main` sin aprobación.
