# Jose QA — Revisión de calidad del sistema Finance Manager

## Objetivo

Antes de dar por terminado cualquier cambio significativo (nuevo usuario, nuevo banco, nuevo feature), correr esta lista. Identifica los errores recurrentes del proyecto para no repetirlos.

---

## 1. Apps Script (Webhook)

### 1.1 ¿El código local está desplegado online?
- Los cambios en `apps_script/webhook.gs` **no se despliegan solos**.
- Hay que copiar manualmente el contenido al editor online de Apps Script y hacer un nuevo deploy.
- **Error que produce si se omite:** `_getSheet is not defined`, `parseDavivienda is not defined`, o cualquier función nueva retorna 500.

### 1.2 ¿Las Script Properties están configuradas?
Verificar que existan exactamente estas 5 propiedades (sin typos, sin mayúsculas extras):
```
SHEET_ID
APP_PIN_jose
APP_PIN_dani
WEBHOOK_SECRET
ANTHROPIC_API_KEY
```
- Los nombres son case-sensitive. `APP_PIN_Jose` ≠ `APP_PIN_jose`.
- **Error que produce si falta:** `APP_PIN_jose no configurado en Script Properties`, `Unauthorized`, o `SHEET_ID no configurado`.

### 1.3 ¿Las pestañas del Sheet tienen el nombre correcto?
- La pestaña del usuario Jose debe llamarse exactamente `Jose` (capital J).
- La pestaña de Dani debe llamarse exactamente `Dani`.
- **Error que produce si el nombre es incorrecto:** la app muestra 0 transacciones (retorno silencioso de `[]`).

### 1.4 ¿reverseTransaction tiene null check para el sheet?
```javascript
var sheet = ref.sheet;
if (!sheet) return false;  // ← debe existir
var data = sheet.getDataRange().getValues();
```
- **Error que produce si falta:** crash completo del webhook con 500 cuando llega una reversión y la pestaña no existe.

### 1.5 ¿`type` en doPost NO está lowercased?
```javascript
var type = payload.type || "";  // ✓ — preserva el case original
// NO: var type = (payload.type || "").toLowerCase();  // ✗ — rompe "validatePin" y "updateCategory"
```
- Los if-blocks usan `"validatePin"` y `"updateCategory"` con mayúsculas; si se lowercase el type nunca coinciden.
- **Error que produce:** `"empty sms"` al intentar validar el PIN, o categorías que no se actualizan.

### 1.6 ¿La comparación de montos usa tolerancia?
```javascript
if (Math.abs(parseFloat(row[montoCol]) - parsed.monto) > 0.01) continue;  // ✓
// NO: if (parseFloat(row[montoCol]) !== parsed.monto) continue;  // ✗
```
- **Error que produce si falta:** reversiones no se encuentran aunque el monto sea igual.

---

## 2. Cloudflare Pages (Deploy)

### 2.1 ¿Hay un `requirements.txt` en la raíz del repo?
- Si existe `requirements.txt` en la raíz, Cloudflare detecta Python y ejecuta `pip install` en vez de `npm run build`.
- Los requirements del backend van en `api/requirements.txt`.
- Los requirements de herramientas van en `tools/requirements.txt`.
- **Error que produce:** build falla con `metadata-generation-failed` compilando pandas. Todo el código nuevo queda sin desplegar.

### 2.2 ¿Las variables de entorno están en el proyecto correcto?
Hay un único proyecto de Cloudflare Pages:
- **`finanzas-abiertas`** → rama de producción **`main`** → `https://finanzas-abiertas.pages.dev`
  (cualquier otra rama genera un deploy de Preview con URL propia, no producción).

Las variables `WEBHOOK_URL` y `WEBHOOK_SECRET` se configuran en Settings → Variables and Secrets.
- **Error que produce:** `WEBHOOK_URL not configured on server` aunque el usuario jure que las configuró.

### 2.3 ¿Las variables tienen el nombre correcto (sin prefijo VITE_)?
| Variable | Uso | Nombre correcto |
|----------|-----|----------------|
| URL del webhook | Runtime (proxy.js) | `WEBHOOK_URL` |
| Secreto del webhook | Runtime (proxy.js) | `WEBHOOK_SECRET` |
| URL para dev local | Build (Vite) | `VITE_WEBHOOK_URL` |
| Secreto para dev local | Build (Vite) | `VITE_WEBHOOK_SECRET` |

- Las variables `VITE_*` **no están disponibles en el proxy** — solo en el bundle del frontend durante build.
- **Error que produce:** `WEBHOOK_URL not configured on server` aunque la variable esté "puesta".

### 2.4 ¿Las variables de entorno requieren un nuevo deployment?
- En Cloudflare Pages, agregar o cambiar variables de entorno **no toma efecto hasta el siguiente deployment**.
- Después de cambiar variables, hacer push de cualquier commit para forzar un nuevo build.

---

## 3. Frontend (PWA)

### 3.1 ¿validatePin pasa userId explícitamente?
```typescript
validatePin(next.join(''), userId)  // ✓ — pasa userId desde el prop
// NO: validatePin(next.join(''))   // ✗ — depende de _activeUserId que puede ser null
```
- **Error que produce:** PIN rechazado silenciosamente aunque sea correcto. El error en pantalla dice "PIN incorrecto".

### 3.2 ¿El effect de carga incluye userId en sus dependencias?
```typescript
useEffect(() => { if (unlocked) load(); }, [load, unlocked, userId]);  // ✓
// NO: }, [load, unlocked]);  // ✗ — no recarga al cambiar de usuario
```
- **Error que produce:** al cambiar de perfil, se siguen mostrando las transacciones del usuario anterior.

### 3.3 ¿El dropdown de banco incluye todos los bancos activos?
- Lista actual válida: `['Bogotá', 'Itaú', 'Davivienda', 'Bancolombia', 'Otro']`
- Si se añade un nuevo banco con parser en el webhook, hay que añadirlo también en `Agregar.tsx`.

---

## 4. Parsers de SMS

### 4.1 ¿Los nuevos parsers tienen test en `testParsers()`?
- `apps_script/webhook.gs` tiene una función `testParsers()` al final que se puede correr desde el editor.
- Cada nuevo formato de SMS debe tener un caso en esa función.

### 4.2 ¿`detectBank()` cubre el nuevo banco?
```javascript
function detectBank(sms) {
  if (/^DAVIVIENDA:/i.test(sms))        return "davivienda";
  if (/^Bancolombia:/i.test(sms))        return "bancolombia";
  if (/^Banco\s+de\s+Bogot/i.test(sms)) return "bogota";
  if (/\bITAU\b/i.test(sms))            return "itau";
  return null;
}
```
- Un nuevo banco sin entrada aquí nunca será procesado.

### 4.3 ¿Los montos en formato americano usan `parseMontoUS()`?
- Bancolombia usa `100,000.00` (coma = miles, punto = decimales).
- Bogotá e Itaú usan `100.000` (punto = miles, sin decimales).
- Usar el parser equivocado da montos multiplicados por 1000.

---

## 5. Checklist rápido antes de hacer push

- [ ] Código de Apps Script copiado al editor online y redesplegado
- [ ] Script Properties verificadas (5 propiedades, nombres exactos)
- [ ] Pestañas del Sheet con nombres correctos (`Jose`, `Dani`)
- [ ] No hay `requirements.txt` en la raíz del repo
- [ ] Variables en Cloudflare Pages → proyecto `finanzas-abiertas` → Variables and Secrets (sin `VITE_`)
- [ ] `testParsers()` pasa para todos los bancos en el editor de Apps Script
