# Extensión de captura de facturas

Lee el **monto** y la **fecha de vencimiento** de tu factura directamente en el portal del
proveedor (Acueducto, Vanti, Enel, ETB…) usando **tu sesión autenticada**, y los envía a tu
app de Finanzas. Como corre en tu navegador (ya pasaste el login/WAF), funciona donde el
scraping del servidor no puede.

## Cómo funciona

1. Inicias sesión en el portal de tu proveedor y abres la página de tu factura.
2. Abres la extensión: detecta el proveedor por el dominio y lee monto + fecha (heurística).
3. Confirmas/corriges en el popup y das **Enviar a Finanzas**.
4. El backend actualiza la factura de ese proveedor (debes haberla creado antes en el app,
   en el tab **Facturas**, para que haga match por proveedor).

## Instalar (modo desarrollador, sin Chrome Web Store)

1. Chrome → `chrome://extensions` → activa **Modo de desarrollador**.
2. **Cargar descomprimida** → selecciona esta carpeta `extension/`.
3. En el app: **Facturas → Conectar extensión** → copia el token.
4. Clic derecho en la extensión → **Opciones** → pega el token → Guardar.

## Limitaciones (MVP)

- Extracción **heurística** (busca "valor a pagar", "fecha límite"…); por eso confirmas antes
  de enviar. Si falla, escribe el monto/fecha a mano.
- Hace match por **proveedor** (no por número de cuenta); si tienes varias facturas del mismo
  proveedor, actualiza la primera.
- Dominios soportados en `providers.js` (ampliable).
