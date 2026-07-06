# Extensión de captura de facturas

Lee el **monto**, la **fecha de vencimiento** y el **número de cuenta/contrato** directamente
en el portal del proveedor (Acueducto, Vanti, Enel, ETB…) usando **tu sesión autenticada**,
y los envía a tu app de Finanzas. Como corre en tu navegador (ya pasaste el login/WAF),
funciona donde el scraping del servidor no puede.

## Proveedores soportados

La extensión **detecta** 14 portales por dominio (configurable en `providers.js`), pero solo
**4 tienen extracción afinada** — keywords específicas del portal en `PER_PROVIDER` (`popup.js`).
Los demás caen a una heurística genérica ("valor a pagar", "fecha límite"…) que suele funcionar
pero puede requerir corrección manual.

**Extracción afinada** (keywords específicas por portal):

| Servicio      | Proveedor            | Dominio del portal                |
|---------------|----------------------|-----------------------------------|
| Agua          | Acueducto de Bogotá  | `acueducto.com.co`                |
| Gas           | Vanti                | `grupovanti.com`, `vanti.com.co`  |
| Electricidad  | Enel Codensa         | `enel.com.co`, `enel.com`         |
| Internet      | ETB                  | `etb.com`                         |

**Detectados con heurística genérica** (sin afinar): EPM, Celsia, Emcali, Triple A, Aguas de
Cartagena, Surtigas, Gases del Caribe, Claro, Movistar, Tigo. Para afinar alguno, ver
[Afinar la extracción](#afinar-la-extracción-para-un-portal) abajo.

> El catálogo canónico de proveedores vive en `pwa/src/lib/providers.ts:PROVIDERS`.
> `scripts/check-provider-drift.mjs` valida que todo `providerId` de la extensión exista en
> el catálogo (run tras editar `providers.js`).

## Cómo funciona

1. Inicias sesión en el portal de tu proveedor y abres la página de tu factura.
2. Abres la extensión: detecta el proveedor por el dominio y aplica **intentos de
   extracción específicos** por portal (busca "valor a pagar", "fecha límite"… con los
   textos exactos que usa cada uno). Si no coinciden, cae a una heurística genérica.
3. Lee monto + fecha + número de cuenta y los pre-llena en el popup.
4. Confirmas/corriges y das **Enviar a Finanzas**.
5. El backend actualiza la factura de ese proveedor (debes haberla creado antes en el app,
   tab **Facturas**). El match es por `providerId` **y** por `numeroCuenta` cuando este
   último coincide, así si tienes dos facturas del mismo proveedor se actualiza la correcta.

## Instalar (modo desarrollador, sin Chrome Web Store)

1. Chrome → `chrome://extensions` → activa **Modo de desarrollador**.
2. **Cargar descomprimida** → selecciona esta carpeta `extension/`.
3. En el app: **Facturas → Conectar extensión** → copia el token.
4. Clic derecho en la extensión → **Opciones** → pega el token → Guardar.

## Afinar la extracción para un portal

`extractBillFromPage(providerId)` en `popup.js` tiene un objeto `PER_PROVIDER` con las
keywords de monto y fecha ordenadas por prioridad para cada portal. Si la captura falla
para un proveedor:

1. Abre el portal, ve a la factura, y con **DevTools (F12)** busca en el texto visible el
   label exacto del monto (p. ej. "Total a pagar") y de la fecha (p. ej. "Fecha límite de
   pago oportuno").
2. Ajusta el array correspondiente en `PER_PROVIDER[providerId]` (`.amt` / `.date`).
3. Recarga la extensión (`chrome://extensions` → ↻) y prueba de nuevo.

No hace falta recompilar nada: la extensión se carga desde esta carpeta tal cual.

## Limitaciones (MVP)

- La extracción es heurística sobre `document.body.innerText`; por eso **confirmas antes**
  de enviar. Si falla, escribe monto/fecha a mano.
- Los portales son SPAs: si cambian su maquetación o labels, la captura puede degradarse.
  Las keywords en `PER_PROVIDER` son el punto de afinamiento.
- No hay captura en segundo plano: tú abres el portal y la extensión lee la pestaña activa.
