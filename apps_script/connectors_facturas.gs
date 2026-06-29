/**
 * Conectores de consulta de facturas de servicios públicos colombianos.
 *
 * Punto de extensión usado por webhook.gs (_refreshFixedPayment / refreshAllFacturas).
 * Un conector recibe el número de cuenta/contrato (NO el número de factura mensual) y devuelve
 * { ok, monto, fechaVencimiento } — monto en COP, fechaVencimiento 'YYYY-MM-DD'.
 *
 * Registry vacío hoy: ningún portal colombiano (Enel, Acueducto, Vanti, ETB…) se deja consultar
 * de forma confiable vía UrlFetchApp — son SPAs con JavaScript y captcha/anti-bot que UrlFetchApp
 * no atraviesa. Mientras el registry esté vacío, consultarFactura devuelve ok:false y la PWA cae a
 * entrada manual: nunca se inventa un monto. Contrato y sincronización con
 * pwa/src/lib/providers.ts:tieneConector en docs/DATA_MODEL.md §6.
 *
 * Para habilitar un proveedor: implementar una fn `scrape<Proveedor>(numeroCuenta)` que devuelva
 * { ok:true, monto, fechaVencimiento } leyendo el endpoint real del portal, registrarla en
 * FACTURA_CONNECTORS bajo su providerId y poner tieneConector:true en providers.ts.
 */
var FACTURA_CONNECTORS = {};

function consultarFactura(providerId, numeroCuenta) {
  var connector = FACTURA_CONNECTORS[providerId];
  if (!connector) {
    return { ok: false, error: 'Sin consulta automática para este proveedor (ingresa el monto manualmente)' };
  }
  try {
    var res = connector(String(numeroCuenta || '').trim());
    if (!res || typeof res !== 'object') return { ok: false, error: 'Respuesta inválida del conector' };
    return res;
  } catch (e) {
    return { ok: false, error: 'Error consultando el portal: ' + (e && e.message ? e.message : e) };
  }
}
