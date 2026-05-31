# Prompt para Lovable — Personal Finance Manager PWA

> Copia y pega todo lo que está debajo de la línea "--- PROMPT ---" en Lovable.
> Antes de hacer deploy, reemplaza `TU_WEBHOOK_URL` con tu URL real de Google Apps Script.

---

## --- PROMPT ---

Build a **Personal Finance Manager PWA** in React with a space/cosmic visual theme. The app reads and writes financial transactions from a Google Apps Script backend that proxies a Google Sheet.

---

### Step 1 — Install the SpaceBackground component

Create the file `src/components/ui/space-background.tsx` with exactly this code:

```tsx
"use client"

import { useEffect, useRef, useState } from "react"

interface Particle {
  color: string
  radius: number
  x: number
  y: number
  ring: number
  move: number
  random: number
}

interface SpaceBackgroundProps {
  particleCount?: number
  particleColor?: string
  backgroundColor?: string
  className?: string
}

function parseRGB(cssColor: string) {
  if (!cssColor) return null
  cssColor = cssColor.trim()
  if (cssColor[0] === "#") {
    let hex = cssColor.slice(1)
    if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("")
    const r = parseInt(hex.slice(0, 2), 16)
    const g = parseInt(hex.slice(2, 4), 16)
    const b = parseInt(hex.slice(4, 6), 16)
    return [r, g, b]
  }
  const m = cssColor.match(/rgba?\(([^)]+)\)/)
  if (m) {
    const parts = m[1].split(",").map((s) => parseFloat(s.trim()))
    return [parts[0], parts[1], parts[2]]
  }
  return null
}

function luminanceFromRgb([r, g, b]: number[]) {
  const srgb = [r / 255, g / 255, b / 255].map((v) =>
    v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  )
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2]
}

export function SpaceBackground({
  particleCount = 450,
  particleColor = "blue",
  backgroundColor = "transparent",
  className = "",
}: SpaceBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const animationRef = useRef<number | null>(null)
  const [resolvedColor, setResolvedColor] = useState<string | undefined>(undefined)

  const detectBackgroundColor = () => {
    if (backgroundColor && backgroundColor !== "transparent") return backgroundColor
    const candidates = [document.body, document.documentElement]
    for (const el of candidates) {
      if (!el) continue
      const cs = getComputedStyle(el)
      const bg = cs.backgroundColor || cs.background
      if (!bg) continue
      const rgb = parseRGB(bg)
      if (!rgb) continue
      if (/rgba/.test(bg)) {
        const alpha = parseFloat(bg.split(",").pop() || "1")
        if (isNaN(alpha) || alpha === 0) continue
      }
      return bg
    }
    const media = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)")
    return media && media.matches ? "black" : "white"
  }

  useEffect(() => {
    if (particleColor) { setResolvedColor(particleColor); return }
    const setContrast = () => {
      let bg = detectBackgroundColor()
      if (!bg || bg === "transparent") {
        const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches
        bg = isDark ? "black" : "white"
      }
      const rgb = parseRGB(bg)
      if (rgb) {
        const lum = luminanceFromRgb(rgb)
        setResolvedColor(lum < 0.5 ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.85)")
      } else {
        const media = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)")
        setResolvedColor(media && media.matches ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.85)")
      }
    }
    setContrast()
    const media = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)")
    const onMedia = () => setContrast()
    if (media && media.addEventListener) media.addEventListener("change", onMedia)
    const mo = new MutationObserver(() => setTimeout(setContrast, 10))
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] })
    mo.observe(document.body, { attributes: true, attributeFilter: ["class", "style"] })
    return () => {
      if (media && media.removeEventListener) media.removeEventListener("change", onMedia)
      mo.disconnect()
    }
  }, [particleColor, backgroundColor])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    if (!resolvedColor) return
    let ratio = window.innerHeight < 400 ? 0.6 : 1
    const state = { particles: [] as Particle[], r: 120, counter: 0 }
    const setupCanvas = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
      ctx.setTransform(ratio, 0, 0, -ratio, canvas.width / 2, canvas.height / 2)
    }
    setupCanvas()
    const createParticle = () => {
      state.particles.push({
        color: resolvedColor,
        radius: Math.random() * 5,
        x: Math.cos(Math.random() * 7 + Math.PI) * state.r,
        y: Math.sin(Math.random() * 7 + Math.PI) * state.r,
        ring: Math.random() * state.r * 3,
        move: (Math.random() * 4 + 1) / 500,
        random: Math.random() * 7,
      })
    }
    for (let i = 0; i < particleCount; i++) createParticle()
    const moveParticle = (p: Particle) => {
      p.ring = Math.max(p.ring - 1, state.r)
      p.random += p.move
      p.x = Math.cos(p.random + Math.PI) * p.ring
      p.y = Math.sin(p.random + Math.PI) * p.ring
    }
    const resetParticle = (p: Particle) => { p.ring = Math.random() * state.r * 3; p.radius = Math.random() * 5 }
    const disappear = (p: Particle) => { if (p.radius < 0.8) resetParticle(p); p.radius *= 0.994 }
    const draw = (p: Particle) => {
      ctx.beginPath(); ctx.fillStyle = p.color
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2); ctx.fill()
    }
    const loop = () => {
      ctx.clearRect(-canvas.width, -canvas.height, canvas.width * 2, canvas.height * 2)
      if (state.counter < state.particles.length) state.counter++
      for (let i = 0; i < state.counter; i++) { disappear(state.particles[i]); moveParticle(state.particles[i]); draw(state.particles[i]) }
      animationRef.current = requestAnimationFrame(loop)
    }
    animationRef.current = requestAnimationFrame(loop)
    const handleResize = () => { ratio = window.innerHeight < 400 ? 0.6 : 1; setupCanvas() }
    window.addEventListener("resize", handleResize)
    return () => { window.removeEventListener("resize", handleResize); if (animationRef.current) cancelAnimationFrame(animationRef.current) }
  }, [particleCount, resolvedColor])

  return (
    <canvas ref={canvasRef} className={className} style={{
      position: "fixed", top: 0, left: 0, zIndex: -1, display: "block",
      width: "100%", height: "100%", background: backgroundColor, pointerEvents: "none",
    }} />
  )
}
```

---

### Step 2 — Global layout

Wrap the entire app in a root layout that renders `<SpaceBackground>` as a persistent fixed background behind all screens:

```tsx
<SpaceBackground
  particleCount={450}
  particleColor="rgba(99,102,241,0.7)"
  backgroundColor="#0a0f1e"
/>
```

The page background color is `#0a0f1e` (deep space navy). All content sits on top of the animated particles.

---

### Step 3 — Configuration

At the top of a config file (`src/lib/config.ts`):

```ts
export const WEBHOOK_URL = "TU_WEBHOOK_URL";
```

---

### Step 4 — API calls

**CORS rule (critical):** All POST calls must use `Content-Type: text/plain` with a JSON-stringified body to avoid preflight errors with Google Apps Script.

**Read transactions:**
```
GET ${WEBHOOK_URL}?action=transactions
Response: { ok: true, data: [ ...rows ] }
```

Each transaction row fields:
- `Timestamp` — string "2026-05-30 15:11:08"
- `Fecha` — string "2026-05-30 15:11:08"
- `Banco` — "Bogotá" | "Itaú"
- `Tipo` — "Compra" | "Débito" | "Transferencia"
- `Monto (COP)` — number 130456
- `Comercio` — string "COUNTRY CLUB DE BOGOTA"
- `Tarjeta/Cuenta` — string "Tarjeta Crédito 8645"
- `Categoría` — string "Deporte"
- `SMS_Original` — string (do not display in UI)

**Save manual transaction:**
```
POST ${WEBHOOK_URL}
Headers: { "Content-Type": "text/plain" }
Body: JSON.stringify({ type: "manual", banco, tipo, monto, comercio, tarjeta, categoria, fecha })
```

**Parse voice note:**
```
POST ${WEBHOOK_URL}
Headers: { "Content-Type": "text/plain" }
Body: JSON.stringify({ type: "voice", text: "transcript" })
Response: { ok: true, data: { monto, comercio, categoria, banco, tipo } }
```

---

### Step 5 — Design system

**Colors:**
```
Background:       #0a0f1e  (deep space)
Surface/cards:    rgba(15, 23, 42, 0.7)  (glass dark)
Accent indigo:    #6366f1
Accent violet:    #8b5cf6
Glow indigo:      rgba(99,102,241,0.4)
Text primary:     #f1f5f9
Text secondary:   #94a3b8
Success:          #22c55e  (neon green)
Amounts/red:      #f87171
Border:           rgba(99,102,241,0.2)
```

**Glassmorphism cards** — all cards use:
```css
background: rgba(15, 23, 42, 0.65);
backdrop-filter: blur(16px);
border: 1px solid rgba(99, 102, 241, 0.2);
border-radius: 16px;
box-shadow: 0 0 20px rgba(99,102,241,0.08);
```

**Glow effects** — interactive elements and active states use:
```css
box-shadow: 0 0 12px rgba(99,102,241,0.5), 0 0 24px rgba(99,102,241,0.2);
```

---

### Step 6 — Bottom navigation bar (space glassmorphism)

Fixed bottom bar with 3 tabs: **Inicio** | **Historial** | **Agregar**.

Style:
```css
position: fixed;
bottom: 0;
width: 100%;
background: rgba(10, 15, 30, 0.8);
backdrop-filter: blur(20px);
border-top: 1px solid rgba(99, 102, 241, 0.25);
box-shadow: 0 -4px 30px rgba(99,102,241,0.1);
padding: 12px 0 20px;  /* extra bottom for iPhone home indicator */
```

Each tab:
- Icon + label below
- Inactive: `#475569` (muted)
- Active: `#6366f1` with a subtle glow dot above the icon and `text-shadow: 0 0 8px rgba(99,102,241,0.8)`

The **Agregar** tab has a floating circular button (56px, indigo gradient `from #6366f1 to #8b5cf6`, glow shadow) instead of a flat icon.

---

### Step 7 — Screen 1: Home (Dashboard)

Header: "Finanzas" bold left, current month right (`Mayo 2026`). Both in `#f1f5f9`.

**Main KPI card** (glassmorphism):
- Label: "Gasto del mes" in secondary text
- Amount: huge bold number in COP format (`$1.234.567`), color `#f1f5f9`
- Trend chip below the number: green with `↓ 12% vs abril` or red `↑ 8% vs abril`. Pill shape with matching glow.

**Donut chart** (SVG, no external library):
- Dark background circle with indigo/violet/cyan/emerald/rose glowing segments
- Each segment has a soft outer glow (`filter: drop-shadow(0 0 6px <color>)`)
- Center shows the top category name and its amount
- Legend below: colored dot + category name + amount, one per row

**"Últimas transacciones"** section header with a "Ver todo →" link.
5 transaction cards (glassmorphism), each:
- Left: colored category dot (glowing), merchant name bold, bank + date in secondary
- Right: amount in `#f87171` bold

---

### Step 8 — Screen 2: Historial

**Filter row at the top** — horizontal scrollable pill chips, one per category + "Todas":
```css
/* each chip */
background: rgba(99,102,241,0.1);
border: 1px solid rgba(99,102,241,0.3);
border-radius: 999px;
padding: 6px 16px;
color: #94a3b8;

/* active chip */
background: rgba(99,102,241,0.25);
border-color: #6366f1;
color: #f1f5f9;
box-shadow: 0 0 10px rgba(99,102,241,0.4);
```

Transactions grouped by date. Date header: `"Sábado, 30 de mayo"` in secondary + day total on right.

Each transaction row (glassmorphism card, slightly less padding):
- Colored glowing dot for category (left)
- Merchant name bold, bank label (small pill: "Bogotá" or "Itaú" in indigo)
- Amount right-aligned in red, type below in secondary

Tapping opens a **bottom sheet** (slides up, dark glassmorphism, `border-radius: 20px 20px 0 0`) with all details.

Empty state: star icon + "El universo de tus finanzas está vacío" in secondary text.

---

### Step 9 — Screen 3: Agregar

**Toggle** at top — two pill buttons side by side: "Formulario" and "Voz". Active has indigo glow fill, inactive is ghost.

**Mode A — Formulario:**

Fields styled as glassmorphism inputs:
```css
background: rgba(15,23,42,0.5);
border: 1px solid rgba(99,102,241,0.2);
border-radius: 12px;
color: #f1f5f9;
/* on focus: */
border-color: #6366f1;
box-shadow: 0 0 0 3px rgba(99,102,241,0.2);
```

1. **Monto** — large input, auto-formats as `$130.456` while typing. Currency sign glows indigo on focus.
2. **Comercio** — text input
3. **Banco** — custom select: Bogotá / Itaú / Otro
4. **Categoría** — custom select with colored glowing dot per option
5. **Tipo** — select: Compra / Débito / Transferencia / Otro
6. **Fecha** — date picker, defaults to today

Submit button: full-width, indigo gradient, glow shadow, "Guardar transacción". Shows spinner on loading. On success: green toast slides up from bottom "✓ Transacción guardada".

**Mode B — Voz:**

Center of screen: large circular mic button (80px).
- Idle: indigo border glow, mic icon, label "Toca para hablar"
- Recording: pulsing animation (scale 1 → 1.15 → 1), red glow, label "Escuchando..."
- Processing: spinning indigo ring, label "Analizando con IA..."

Transcript text appears below as italic secondary text while listening.

Implementation:
```tsx
const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)()
recognition.lang = 'es-CO'
recognition.continuous = false
recognition.interimResults = true
```

On speech end → POST `{ type: "voice", text: transcript }` → switch to Form mode with fields pre-filled. Pre-filled fields briefly highlight with indigo glow animation to show they were auto-populated.

If Speech API not supported → show message "Tu navegador no soporta entrada de voz. Usa el formulario."

---

### Step 10 — Currency formatting

All amounts use Colombian peso format: `$1.234.567` (dots as thousand separators, no decimals):

```ts
function formatCOP(amount: number): string {
  return '$' + Math.round(amount).toLocaleString('es-CO')
}
```

---

### Step 11 — PWA configuration

1. `manifest.json`:
```json
{
  "name": "Finanzas Personales",
  "short_name": "Finanzas",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0a0f1e",
  "theme_color": "#6366f1",
  "icons": [{ "src": "/icon.png", "sizes": "192x192", "type": "image/png" }]
}
```

2. In `index.html` `<head>`:
```html
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="theme-color" content="#6366f1">
<link rel="manifest" href="/manifest.json">
```

3. Basic service worker for offline shell caching.

---

### Step 12 — Error states and loading

- **Loading transactions**: skeleton cards with shimmer animation (`background: linear-gradient(90deg, rgba(99,102,241,0.05) 25%, rgba(99,102,241,0.15) 50%, rgba(99,102,241,0.05) 75%)`, animated)
- **API error**: red toast "Error al conectar con el servidor"
- **WEBHOOK_URL not configured**: indigo banner at top "Configura tu WEBHOOK_URL para conectar con Google Sheets"
- **Voice parse fallback**: if Claude response has missing fields, leave those fields empty for manual fill

---

### Notes

- Dark mode only — no light mode toggle
- `SMS_Original` field must never be shown in the UI
- All dates displayed in Spanish locale (`es-CO`)
- Keep bundle lean — no heavy chart libraries, use SVG/Canvas directly
- The SpaceBackground canvas must have `pointer-events: none` so it never blocks touch interactions
