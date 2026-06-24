// Catálogo de referencia de beneficios de tarjetas de crédito (Colombia).
//
// ⚠️ VALORES DE REFERENCIA APROXIMADOS (2024–2025), PENDIENTES DE VERIFICACIÓN.
// La cuota de manejo y los umbrales de exención cambian por banco, franquicia y
// promoción vigente. Se exponen como referencia editable y SIEMPRE acompañados de
// un disclaimer en la UI ("confírmalo con tu banco"). No deben presentarse como
// dato definitivo. Ver plan estratégico: "el catálogo propone → el usuario confirma".
//
// Estructura DRY: defaults por tier (chasis) + overrides por banco que se rellenan a
// medida que se verifican datos reales de cada tarjeta. Arranca cubriendo los bancos
// que el sistema ya parsea: Bogotá, Itaú, Davivienda, Bancolombia, AV Villas.

export type ExencionTipo = 'compras' | 'monto' | 'ninguna';

export interface CardBenefits {
  cuotaManejo: number;      // cuota de manejo mensual en COP (referencia)
  exencionTipo: ExencionTipo;
  exencionUmbral: number;   // # de compras (tipo 'compras') o monto COP (tipo 'monto'); 0 si no aplica
  recompensas: string;      // descripción corta del programa de puntos/millas
  beneficios: string[];     // beneficios destacados del producto
}

// Normaliza variantes de chasis hacia una clave de tier conocida.
const TIER_ALIASES: Record<string, string> = {
  'clasica': 'Clásica', 'clásica': 'Clásica', 'classic': 'Clásica',
  'oro': 'Oro', 'gold': 'Oro',
  'platinum': 'Platinum', 'platino': 'Platinum',
  'signature': 'Signature',
  'black': 'Black',
  'infinite': 'Infinite', 'infinita': 'Infinite',
  'world': 'World', 'world elite': 'World',
};

// Defaults por tier — referencia aproximada, no por banco.
const TIER_DEFAULTS: Record<string, CardBenefits> = {
  'Clásica':   { cuotaManejo: 16000, exencionTipo: 'compras', exencionUmbral: 5,       recompensas: 'Puntos básicos por compra',          beneficios: ['Compra protegida'] },
  'Oro':       { cuotaManejo: 28000, exencionTipo: 'compras', exencionUmbral: 8,       recompensas: 'Acumulas puntos en cada compra',     beneficios: ['Asistencia en viajes', 'Seguro de compra'] },
  'Platinum':  { cuotaManejo: 38000, exencionTipo: 'monto',   exencionUmbral: 1500000, recompensas: 'Puntos acelerados + millas',          beneficios: ['Seguro de viaje', 'Asistencia premium', 'Descuentos seleccionados'] },
  'World':     { cuotaManejo: 45000, exencionTipo: 'monto',   exencionUmbral: 2500000, recompensas: 'Millas World',                        beneficios: ['Salas VIP', 'Seguro de viaje', 'Concierge'] },
  'Signature': { cuotaManejo: 48000, exencionTipo: 'monto',   exencionUmbral: 3000000, recompensas: 'Millas y puntos preferenciales',      beneficios: ['Salas VIP (limitadas)', 'Seguro de viaje', 'Concierge'] },
  'Infinite':  { cuotaManejo: 60000, exencionTipo: 'monto',   exencionUmbral: 5000000, recompensas: 'Máxima acumulación de millas',        beneficios: ['Salas VIP ilimitadas', 'Concierge 24/7', 'Seguros premium'] },
  'Black':     { cuotaManejo: 60000, exencionTipo: 'monto',   exencionUmbral: 5000000, recompensas: 'Máxima acumulación de millas',        beneficios: ['Salas VIP ilimitadas', 'Concierge 24/7', 'Seguros premium'] },
};

// Overrides por banco × tier. Rellenar a medida que se verifican datos reales.
// Ej: 'Bancolombia': { 'Platinum': { cuotaManejo: 39900, exencionUmbral: 1800000 } }
const BANK_OVERRIDES: Record<string, Record<string, Partial<CardBenefits>>> = {
  // Bogotá, Itaú, Davivienda, Bancolombia, AV Villas — pendientes de verificación.
};

function normalizeChasis(chasis: string): string | null {
  return TIER_ALIASES[chasis.trim().toLowerCase()] ?? null;
}

// Devuelve los beneficios de referencia para un banco + chasis, o null si el chasis
// no corresponde a una tarjeta de crédito conocida (p. ej. débito o cuenta de ahorros).
export function getCardBenefits(banco: string, chasis: string): CardBenefits | null {
  const tier = normalizeChasis(chasis);
  if (!tier) return null;
  const base = TIER_DEFAULTS[tier];
  if (!base) return null;
  const override = BANK_OVERRIDES[banco]?.[tier];
  return override ? { ...base, ...override } : base;
}
