// Catálogo semilla de prestadores de servicios para el inventario de facturas.
// NO es exhaustivo: cubre los proveedores más comunes en Colombia + entradas genéricas
// (arriendo, administración, seguros…) y un "Otro" libre. El picker de Facturas se arma
// sobre esta lista; `urlPago` alimenta el botón "Pagar" (deep-link al portal del proveedor).
//
// `tieneConector` marca los proveedores para los que el backend (apps_script/
// connectors_facturas.gs) intentará consultar monto + vencimiento automáticamente. El resto
// se maneja con entrada manual / monto fijo. Mantener en sync con FACTURA_CONNECTORS.

export type ServicioTipo =
  | 'energia' | 'agua' | 'gas' | 'aseo'
  | 'internet' | 'movil' | 'multiservicio'
  | 'fijo' | 'impuesto' | 'otro';

export interface Provider {
  id: string;              // slug estable (ej. 'enel-codensa')
  nombre: string;          // "Enel Codensa"
  servicio: ServicioTipo;
  categoria: string;       // categoría de la app (config.ts CATEGORIES)
  cobertura?: string;      // "Bogotá y Cundinamarca"
  urlPago?: string;        // portal de pago/consulta
  requiereCuenta?: boolean;// pide número de cuenta/contrato (servicios domiciliarios)
  tieneConector?: boolean; // el backend intenta consulta automática
}

export interface ServicioMeta {
  label: string;
  emoji: string;
}

// Metadatos de presentación por tipo de servicio.
export const SERVICIO_META: Record<ServicioTipo, ServicioMeta> = {
  energia:       { label: 'Energía',        emoji: '⚡️' },
  agua:          { label: 'Agua',           emoji: '💧' },
  gas:           { label: 'Gas',            emoji: '🔥' },
  aseo:          { label: 'Aseo',           emoji: '🗑️' },
  internet:      { label: 'Internet / TV',  emoji: '🌐' },
  movil:         { label: 'Móvil',          emoji: '📱' },
  multiservicio: { label: 'Multiservicio',  emoji: '🏠' },
  fijo:          { label: 'Pago fijo',      emoji: '📌' },
  impuesto:      { label: 'Impuesto',       emoji: '🏛️' },
  otro:          { label: 'Otro',           emoji: '🧾' },
};

// Categoría de la app por defecto según el tipo de servicio.
const HOGAR = 'Hogar';
const SUSCRIPCIONES = 'Suscripciones';

export const PROVIDERS: Provider[] = [
  // ── Energía ───────────────────────────────────────────────
  { id: 'enel-codensa', nombre: 'Enel Codensa', servicio: 'energia', categoria: HOGAR, cobertura: 'Bogotá y Cundinamarca', urlPago: 'https://www.enel.com.co/es/personas/pagos.html', requiereCuenta: true, tieneConector: false },
  { id: 'epm',          nombre: 'EPM',          servicio: 'multiservicio', categoria: HOGAR, cobertura: 'Antioquia (energía+agua+gas+aseo)', urlPago: 'https://www.epm.com.co/clientesyusuarios/atencion-al-cliente/pague-su-factura.html', requiereCuenta: true, tieneConector: false },
  { id: 'air-e',        nombre: 'Air-e',        servicio: 'energia', categoria: HOGAR, cobertura: 'Atlántico, Magdalena, La Guajira', urlPago: 'https://www.air-e.com', requiereCuenta: true, tieneConector: false },
  { id: 'afinia',       nombre: 'Afinia',       servicio: 'energia', categoria: HOGAR, cobertura: 'Bolívar, Córdoba, Sucre, Cesar', urlPago: 'https://www.afinia.com.co', requiereCuenta: true, tieneConector: false },
  { id: 'celsia',       nombre: 'Celsia',       servicio: 'energia', categoria: HOGAR, cobertura: 'Valle del Cauca, Tolima', urlPago: 'https://www.celsia.com', requiereCuenta: true, tieneConector: false },
  { id: 'emcali-energia', nombre: 'Emcali',     servicio: 'multiservicio', categoria: HOGAR, cobertura: 'Cali (energía+agua)', urlPago: 'https://www.emcali.com.co', requiereCuenta: true, tieneConector: false },
  { id: 'chec',         nombre: 'CHEC',         servicio: 'energia', categoria: HOGAR, cobertura: 'Caldas', urlPago: 'https://www.chec.com.co', requiereCuenta: true, tieneConector: false },
  { id: 'essa',         nombre: 'ESSA',         servicio: 'energia', categoria: HOGAR, cobertura: 'Santander', urlPago: 'https://www.essa.com.co', requiereCuenta: true, tieneConector: false },
  { id: 'cens',         nombre: 'CENS',         servicio: 'energia', categoria: HOGAR, cobertura: 'Norte de Santander', urlPago: 'https://www.cens.com.co', requiereCuenta: true, tieneConector: false },
  { id: 'ebsa',         nombre: 'EBSA',         servicio: 'energia', categoria: HOGAR, cobertura: 'Boyacá', urlPago: 'https://www.ebsa.com.co', requiereCuenta: true, tieneConector: false },
  { id: 'electrohuila', nombre: 'Electrohuila', servicio: 'energia', categoria: HOGAR, cobertura: 'Huila', urlPago: 'https://www.electrohuila.com.co', requiereCuenta: true, tieneConector: false },
  { id: 'cedenar',      nombre: 'Cedenar',      servicio: 'energia', categoria: HOGAR, cobertura: 'Nariño', urlPago: 'https://www.cedenar.com.co', requiereCuenta: true, tieneConector: false },

  // ── Acueducto / agua ──────────────────────────────────────
  { id: 'acueducto-bogota', nombre: 'Acueducto de Bogotá', servicio: 'agua', categoria: HOGAR, cobertura: 'Bogotá (EAAB)', urlPago: 'https://www.acueducto.com.co/wassigue6/PagosWeb', requiereCuenta: true, tieneConector: false },
  { id: 'triple-a',     nombre: 'Triple A',     servicio: 'agua', categoria: HOGAR, cobertura: 'Barranquilla y Atlántico', urlPago: 'https://www.aaa.com.co', requiereCuenta: true, tieneConector: false },
  { id: 'acuacar',      nombre: 'Aguas de Cartagena', servicio: 'agua', categoria: HOGAR, cobertura: 'Cartagena', urlPago: 'https://www.acuacar.com', requiereCuenta: true, tieneConector: false },
  { id: 'aguas-manizales', nombre: 'Aguas de Manizales', servicio: 'agua', categoria: HOGAR, cobertura: 'Manizales', urlPago: 'https://www.aguasdemanizales.com.co', requiereCuenta: true, tieneConector: false },

  // ── Gas natural ───────────────────────────────────────────
  { id: 'vanti',        nombre: 'Vanti',        servicio: 'gas', categoria: HOGAR, cobertura: 'Bogotá, Cundinamarca, Boyacá, Santanderes', urlPago: 'https://www.grupovanti.com/pagos', requiereCuenta: true, tieneConector: false },
  { id: 'surtigas',     nombre: 'Surtigas',     servicio: 'gas', categoria: HOGAR, cobertura: 'Bolívar, Córdoba, Sucre', urlPago: 'https://www.surtigas.com.co', requiereCuenta: true, tieneConector: false },
  { id: 'gases-caribe', nombre: 'Gases del Caribe', servicio: 'gas', categoria: HOGAR, cobertura: 'Atlántico, Magdalena, La Guajira', urlPago: 'https://www.gascaribe.com', requiereCuenta: true, tieneConector: false },
  { id: 'efigas',       nombre: 'Efigas',       servicio: 'gas', categoria: HOGAR, cobertura: 'Eje Cafetero', urlPago: 'https://www.efigas.com.co', requiereCuenta: true, tieneConector: false },
  { id: 'gases-occidente', nombre: 'Gases de Occidente', servicio: 'gas', categoria: HOGAR, cobertura: 'Valle del Cauca', urlPago: 'https://www.gasesdeoccidente.com', requiereCuenta: true, tieneConector: false },
  { id: 'alcanos',      nombre: 'Alcanos',      servicio: 'gas', categoria: HOGAR, cobertura: 'Huila, Tolima, Meta', urlPago: 'https://www.alcanos.com.co', requiereCuenta: true, tieneConector: false },

  // ── Aseo (cuando se factura aparte) ───────────────────────
  { id: 'promoambiental', nombre: 'Promoambiental', servicio: 'aseo', categoria: HOGAR, cobertura: 'Bogotá', urlPago: 'https://www.promoambientaldistrito.com', requiereCuenta: true, tieneConector: false },
  { id: 'ciudad-limpia', nombre: 'Ciudad Limpia', servicio: 'aseo', categoria: HOGAR, cobertura: 'Bogotá', urlPago: 'https://www.ciudadlimpia.com.co', requiereCuenta: true, tieneConector: false },
  { id: 'interaseo',    nombre: 'Interaseo',    servicio: 'aseo', categoria: HOGAR, cobertura: 'Varias ciudades', urlPago: 'https://www.interaseo.com.co', requiereCuenta: true, tieneConector: false },

  // ── Internet / TV / telefonía fija ────────────────────────
  { id: 'etb',          nombre: 'ETB',          servicio: 'internet', categoria: SUSCRIPCIONES, cobertura: 'Bogotá', urlPago: 'https://www.etb.com/hogar/pago-en-linea.aspx', requiereCuenta: true, tieneConector: false },
  { id: 'claro',        nombre: 'Claro',        servicio: 'internet', categoria: SUSCRIPCIONES, cobertura: 'Nacional', urlPago: 'https://www.claro.com.co/personas/pagos/', requiereCuenta: true, tieneConector: false },
  { id: 'movistar',     nombre: 'Movistar',     servicio: 'internet', categoria: SUSCRIPCIONES, cobertura: 'Nacional', urlPago: 'https://www.movistar.co/atencion-cliente/pagos', requiereCuenta: true, tieneConector: false },
  { id: 'tigo',         nombre: 'Tigo',         servicio: 'internet', categoria: SUSCRIPCIONES, cobertura: 'Nacional', urlPago: 'https://www.tigo.com.co/pagos', requiereCuenta: true, tieneConector: false },
  { id: 'wom',          nombre: 'WOM',          servicio: 'movil', categoria: SUSCRIPCIONES, cobertura: 'Nacional', urlPago: 'https://www.wom.co', requiereCuenta: true, tieneConector: false },
  { id: 'directv',      nombre: 'DirecTV',      servicio: 'internet', categoria: SUSCRIPCIONES, cobertura: 'Nacional', urlPago: 'https://www.directv.com.co/pagos', requiereCuenta: true, tieneConector: false },

  // ── Pagos fijos (sin consulta; solo día + monto) ──────────
  { id: 'arriendo',     nombre: 'Arriendo',     servicio: 'fijo', categoria: HOGAR, requiereCuenta: false, tieneConector: false },
  { id: 'administracion', nombre: 'Administración', servicio: 'fijo', categoria: HOGAR, cobertura: 'Propiedad horizontal', requiereCuenta: false, tieneConector: false },
  { id: 'pension-educativa', nombre: 'Pensión / Matrícula', servicio: 'fijo', categoria: HOGAR, requiereCuenta: false, tieneConector: false },
  { id: 'medicina-prepagada', nombre: 'Medicina prepagada / EPS', servicio: 'fijo', categoria: 'Salud', cobertura: 'Colsanitas, Sura, Medplus…', requiereCuenta: false, tieneConector: false },
  { id: 'seguro',       nombre: 'Seguro',       servicio: 'fijo', categoria: HOGAR, cobertura: 'SOAT, auto, vida…', requiereCuenta: false, tieneConector: false },
  { id: 'gimnasio',     nombre: 'Gimnasio',     servicio: 'fijo', categoria: SUSCRIPCIONES, cobertura: 'Bodytech, Smart Fit…', requiereCuenta: false, tieneConector: false },

  // ── Impuestos (cadencia anual/bimestral; solo recordatorio) ─
  { id: 'predial',      nombre: 'Impuesto predial', servicio: 'impuesto', categoria: HOGAR, requiereCuenta: false, tieneConector: false },
  { id: 'vehicular',    nombre: 'Impuesto vehicular', servicio: 'impuesto', categoria: 'Transporte', requiereCuenta: false, tieneConector: false },

  // ── Genérico ──────────────────────────────────────────────
  { id: 'otro',         nombre: 'Otro',         servicio: 'otro', categoria: 'Otro', requiereCuenta: false, tieneConector: false },
];

const PROVIDER_BY_ID: Record<string, Provider> = Object.fromEntries(
  PROVIDERS.map(p => [p.id, p])
);

export function getProvider(id: string): Provider | undefined {
  return PROVIDER_BY_ID[id];
}

/** El proveedor genérico libre ("Otro"). */
export const OTRO_PROVIDER = PROVIDER_BY_ID['otro'];
