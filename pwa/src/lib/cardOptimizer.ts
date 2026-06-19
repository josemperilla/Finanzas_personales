// Optimizador de productos financieros.
// Atribuye el gasto del período a cada tarjeta registrada y deriva señales
// accionables: progreso hacia la exención de la cuota de manejo y uso del cupo.
// Corre 100% en el cliente sobre datos que ya existen (tarjetas + transacciones).

import { Card, Transaction, isGasto, extractLast4 } from './api';
import { getCardBenefits, ExencionTipo } from './cardCatalog';

export interface CardSpend {
  gastoPeriodo: number; // suma de gastos del período (COP)
  numCompras: number;   // # de compras (gastos) del período
}

function sameBanco(a: string, b: string): boolean {
  return a.trim().toLowerCase() === (b || '').trim().toLowerCase();
}

// Atribuye el gasto de un mes concreto a cada tarjeta, por banco + últimos 4 dígitos.
// Reutiliza extractLast4 (mismo criterio que getUnknownCards en api.ts).
export function attributeSpend(
  transactions: Transaction[],
  cards: Card[],
  year: number,
  month: number, // 0-11
): Map<string, CardSpend> {
  const result = new Map<string, CardSpend>();
  cards.forEach(c => result.set(c.id, { gastoPeriodo: 0, numCompras: 0 }));

  for (const tx of transactions) {
    if (!isGasto(tx)) continue;
    const monto = Number(tx['Monto (COP)']) || 0;
    if (monto <= 0) continue;
    const d = new Date((tx.Fecha || tx.Timestamp).replace(' ', 'T'));
    if (isNaN(d.getTime()) || d.getFullYear() !== year || d.getMonth() !== month) continue;
    const last4 = extractLast4(tx['Tarjeta/Cuenta'] || '');
    if (!last4) continue;
    const card = cards.find(c => c.ultimos4 === last4 && sameBanco(c.banco, tx.Banco));
    if (!card) continue;
    const agg = result.get(card.id)!;
    agg.gastoPeriodo += monto;
    agg.numCompras += 1;
  }
  return result;
}

export interface ExencionStatus {
  cuotaManejo: number;
  tipo: ExencionTipo;
  umbral: number;
  exenta: boolean;
  faltante: number; // cuánto falta para exonerar (monto COP o # compras); 0 si ya exenta o no aplica
  progreso: number; // 0..1
  recompensas: string;
  beneficios: string[];
}

// Progreso hacia la exención de la cuota de manejo del mes, según el gasto atribuido.
// Devuelve null si el chasis no corresponde a una tarjeta de crédito conocida.
export function computeExencion(card: Card, spend: CardSpend): ExencionStatus | null {
  const benefits = getCardBenefits(card.banco, card.chasis);
  if (!benefits) return null;

  const base = {
    cuotaManejo: benefits.cuotaManejo,
    recompensas: benefits.recompensas,
    beneficios: benefits.beneficios,
  };

  if (benefits.exencionTipo === 'ninguna' || benefits.exencionUmbral <= 0) {
    return { ...base, tipo: 'ninguna', umbral: 0, exenta: false, faltante: 0, progreso: 0 };
  }

  const actual = benefits.exencionTipo === 'compras' ? spend.numCompras : spend.gastoPeriodo;
  const exenta = actual >= benefits.exencionUmbral;
  return {
    ...base,
    tipo: benefits.exencionTipo,
    umbral: benefits.exencionUmbral,
    exenta,
    faltante: exenta ? 0 : benefits.exencionUmbral - actual,
    progreso: Math.min(1, actual / benefits.exencionUmbral),
  };
}

export interface CupoStatus {
  cupo: number;
  usado: number;      // gasto del mes como proxy del cupo usado
  disponible: number;
  pct: number;        // 0..1
}

// Uso del cupo: gasto del mes atribuido vs. cupo total. Null si no hay cupo registrado.
export function computeCupo(card: Card, spend: CardSpend): CupoStatus | null {
  if (!card.cupo || card.cupo <= 0) return null;
  const usado = spend.gastoPeriodo;
  return {
    cupo: card.cupo,
    usado,
    disponible: Math.max(0, card.cupo - usado),
    pct: Math.min(1, usado / card.cupo),
  };
}
