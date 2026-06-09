import { Transaction } from './api';

export type RetoTipo = 'budget_limit' | 'frequency_limit' | 'no_spend';

export interface Reto {
  id: string;
  titulo: string;
  tipo: RetoTipo;
  categoria: string;   // '' = todas las categorías
  objetivo: number;    // COP o número de transacciones; 0 para no_spend
  fechaInicio: string; // YYYY-MM-DD
  fechaFin: string;
}

export interface RetoProgress {
  reto: Reto;
  current: number;
  pct: number;         // 0–1 (qué tan cerca del límite)
  failed: boolean;
  completed: boolean;
  diasRestantes: number;
}

function storageKey(userId: string) { return `fm_retos_${userId}`; }

export function getRetos(userId: string): Reto[] {
  try { return JSON.parse(localStorage.getItem(storageKey(userId)) || '[]'); }
  catch { return []; }
}

function save(userId: string, retos: Reto[]) {
  localStorage.setItem(storageKey(userId), JSON.stringify(retos));
}

export function addReto(userId: string, reto: Reto) {
  save(userId, [...getRetos(userId), reto]);
}

export function deleteReto(userId: string, id: string) {
  save(userId, getRetos(userId).filter(r => r.id !== id));
}

export function periodDates(tipo: 'mes' | 'semana'): { fechaInicio: string; fechaFin: string } {
  const now = new Date();
  if (tipo === 'mes') {
    const y = now.getFullYear(), m = now.getMonth();
    const last = new Date(y, m + 1, 0);
    return {
      fechaInicio: `${y}-${String(m + 1).padStart(2, '0')}-01`,
      fechaFin:    `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`,
    };
  }
  const day = now.getDay();
  const mon = new Date(now); mon.setDate(now.getDate() - ((day + 6) % 7));
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { fechaInicio: fmt(mon), fechaFin: fmt(sun) };
}

export function computeProgress(reto: Reto, txs: Transaction[]): RetoProgress {
  const start = new Date(reto.fechaInicio + 'T00:00:00');
  const end   = new Date(reto.fechaFin   + 'T23:59:59');
  const now   = new Date();

  const relevant = txs.filter(tx => {
    const d = new Date(tx.Fecha || tx.Timestamp);
    return d >= start && d <= end && (!reto.categoria || tx.Categoría === reto.categoria);
  });

  const current = reto.tipo === 'frequency_limit'
    ? relevant.length
    : relevant.reduce((s, tx) => s + Number(tx['Monto (COP)'] || 0), 0);

  const diasRestantes = Math.max(0, Math.ceil((end.getTime() - now.getTime()) / 86_400_000));
  const isOver = now > end;

  let pct: number, failed: boolean, completed: boolean;

  if (reto.tipo === 'no_spend') {
    failed    = current > 0;
    completed = isOver && !failed;
    pct       = failed ? 1 : 0;
  } else {
    pct       = reto.objetivo > 0 ? Math.min(current / reto.objetivo, 1) : 0;
    failed    = current > reto.objetivo;
    completed = isOver && !failed;
  }

  return { reto, current, pct, failed, completed, diasRestantes };
}
