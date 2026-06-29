# Convenciones de código — Finanzas Personales

Reglas que **previenen drift**. Lee antes de escribir TS/GAS/CF. Detalle de arquitectura en
`docs/ARCHITECTURE.md`; de datos en `docs/DATA_MODEL.md`; de diseño en `DESIGN.md`.

## Principio rector: dónde vive la lógica

- **Persistencia + categorización + parsing de bancos + reglas de usuario** → `apps_script/webhook.gs`.
  Fuente de verdad (lo que persiste es lo que cuenta). El UI nunca decide categorías solo.
- **Llamadas a la red + token/secret** → `pwa/src/lib/api.ts` (`secureUrl`, `withUser`, `withAuth`).
  Las pantallas consumen esta capa; **nunca** hacen `fetch` directo ni conocen secretos.
- **Transformaciones puras** (analytics, gamification, healthScore, formatos) → `pwa/src/lib/*.ts`.
  Sin side effects, testeables con vitest. Acompaña con `*.test.ts`.
- **IA → Anthropic:** ¿desde el edge? → `functions/api/*.js` con patrón `validateToken`. ¿sobre datos del
  usuario? → GAS `_callClaudeAI`. `ANTHROPIC_API_KEY` y el **modelo** viven en env (server-side). **Usa
  slugs de modelo reales y vigentes** (no inventados).

## TypeScript (PWA) — `pwa/`

- `tsconfig.json`: `strict: true`, `noEmit`, `jsx: react-jsx`. **Tipa todo** explícitamente; evita `any`
  (ESLint `warn`). `noUnusedLocals:false` (no rompe build, pero límpialo).
- **Imports relativos, sin alias `@/*`**: `import { x } from '../lib/api'`.
- **Exports nombrados** en páginas (`export function Home()`); el lazy import en `App.tsx` los mapea.
- **`import.meta.env`**: solo `VITE_*` llega al bundle. Nada que sea secret server-side. Prod vs dev se
  decide con `import.meta.env.PROD` (ver `lib/config.ts`).
- **Funciones puras primero.** Si una pieza de UI tiene cálculo, extráelo a `lib/` y testéalo.

## Estilos — CSS-var driven (NO Tailwind utilities)

- Tokens en `pwa/src/index.css`. **Usa `var(--*)`** (`var(--blue)`, `var(--surface)`, `var(--card)`,
  `var(--line)`, `var(--ink)`, `var(--font-display)`, `var(--r-xl)`, `var(--touch-min)`…). **No hex literals**
  salvo donde no exista token (entonces considéralo deuda → `DESIGN.md`).
- Estilos inline + Framer Motion, como el código existente. **No uses clases utility de Tailwind.**
- Colores de estado: tokens semánticos `--success/--danger/--warning` (+ `-bg`).
- Reutiliza `components/ui/`: `Card`, `ActionButton`, `Skeleton`, `StatusToast`, `PageHeader`,
  `FriendlyEmptyState`, `Icon`, `useOverlayA11y`. Reusar > crear.
- Deuda de naming: `--blue-*` es **verde-teal** en claro (histórico). No introducir literales verdes
  nuevos — usa el token. Ver `DESIGN.md` §"Inconsistencias".

## Google Apps Script — `apps_script/`

- Sintaxis **ES5-style** con `var`/`function` y globals (`PropertiesService`, `CacheService`,
  `SpreadsheetApp`, `Utilities`, `UrlFetchApp`, `ScriptApp`). No ES modules.
- `_`-prefijo = helpers privados. Sin `_` = acción del webhook o función invocable desde un trigger.
- **`doPost` no lowercases `type`.** Los `if (type === "validatePin")` dependen del case original.
- **`userId` se lowercea** al entrar. Tabs de Sheets en minúsculas.
- Búsqueda por `Timestamp` con **tolerancia ±2s**. Montos: COL (`parseMonto`, punto=miles) vs US
  (`parseMontoUS`, coma=miles, punto=decimal). Bancolombia=US; Bogotá/Itaú=COL. Mezclar ×1000 el monto.
- Categorías: persistir siempre dentro de `ALLOWED_CATEGORIES`. Nuevo parser → caso en `testParsers()`.
- Deploy manual: **`cd apps_script && clasp push`** tras cada cambio (no toma efecto solo).

## Cloudflare Pages Functions — `functions/api/`

- JS plano, `export async function onRequest(context)` con `{ request, env }`.
- **Secretos desde `env`**, nunca del body del cliente (salvo fallback de retrocompat documentado).
  Patrón: `env.WEB_SECRET || env.WEBHOOK_SECRET`.
- Endpoints de IA: **validar `token` contra GAS `validateToken` antes** de llamar a Anthropic. Limitar
  tamaño de payload (`MAX_*_B64_LENGTH`). Stripped de fences ```` ```json ```` al parsear.
- Respuestas JSON con helper `json(data, status)`. Lecturas con `Cache-Control: no-store`.

## Naming

- TS: `PascalCase.tsx` (componentes/páginas), `camelCase.ts` (lib), `*.test.ts`.
- localStorage: prefijo `fm_` + `<recurso>` + opcional `_<userId>`.
- Script Properties: `SCREAMING_SNAKE_CASE` (+ sufijo `_<id>` por usuario). Sensibles a mayúsculas.
- Categorías/bancos: en español, exactamente como en `ALLOWED_CATEGORIES`/el dropdown de Agregar.

## Errores, vacío, carga, accesibilidad

- Vacío: `FriendlyEmptyState`. Carga: `<Skeleton/>`. Acciones: `<ActionButton variant busy>`.
- Overlays: `role="dialog"`, `aria-modal="true"`, `aria-label`, hook `useOverlayA11y` (fondo bloqueado,
  foco, `Escape`). Backdrops vía portal a `document.body`.
- A11y por defecto: foco visible (`--shadow-focus`), `prefers-reduced-motion`, touch targets ≥44px.

## Tests, commits y PRs

- **vitest** (`*.test.ts` junto al código). Prioriza funciones puras en `lib/`. El backend GAS no es
  testeable en local → tests de integración contra el endpoint (ver `TODOS.md` P1). Sin tests E2E todavía.
- Commits **conventional** en español (`feat`, `fix`, `test`, `docs`, `a11y`, `perf`, `refactor`).
- **Gate antes de PR:** `cd pwa && npm run lint && npm run build && npm run test`. Tras tocar categorías:
  `node scripts/check-category-drift.mjs`.
- **No deployar/pushear `main` sin aprobación** (prod vivo = `finanzas-abiertas`).