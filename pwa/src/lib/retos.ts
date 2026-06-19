import { Transaction } from './api';
import { cleanMerchant } from './merchantCleaner';
import { normalizeCategory } from './config';
import { getWeekId } from './gamification';

export type RetoTipo = 'budget_limit' | 'frequency_limit' | 'no_spend';

export interface Reto {
  id: string;
  titulo: string;
  tipo: RetoTipo;
  categorias: string[];  // [] = todas las categorías
  comercios: string[];   // [] = todos los comercios (nombres limpios)
  categoria?: string;    // legacy — usado si categorias está vacío
  objetivo: number;      // COP o número de transacciones; 0 para no_spend
  fechaInicio: string;   // YYYY-MM-DD
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

// ── Retos semanales sugeridos ────────────────────────────────────────────────

export interface RetoSugerido {
  id: string;
  titulo: string;
  descripcion: string;
  tipo: RetoTipo;
  categorias: string[];
  objetivoCOP?: number;
  objetivoN?: number;
  emoji: string;
}

export const CATALOGO_RETOS_SEMANA: RetoSugerido[] = [
  { id: 'sr-domicilios',      titulo: 'Semana sin domicilios',       descripcion: 'Cocina en casa los 7 días y ahorra en delivery',     tipo: 'no_spend',        categorias: ['Domicilios'],       emoji: '🍳' },
  { id: 'sr-restaurantes',    titulo: 'Restaurantes bajo $150k',     descripcion: 'Disfruta salidas pero con un límite claro',          tipo: 'budget_limit',    categorias: ['Restaurantes'],     objetivoCOP: 150_000, emoji: '🥗' },
  { id: 'sr-compras',         titulo: 'Compras mínimas esta semana', descripcion: 'Solo lo esencial, cero compras impulsivas',          tipo: 'budget_limit',    categorias: ['Compras'],          objetivoCOP: 100_000, emoji: '🛍️' },
  { id: 'sr-entretenimiento', titulo: 'Semana sin entretenimiento',  descripcion: 'Encuentra diversión sin gastar ni un peso',          tipo: 'no_spend',        categorias: ['Entretenimiento'],  emoji: '📴' },
  { id: 'sr-cafes',           titulo: 'Sin cafés esta semana',       descripcion: 'Prepara tu café en casa y nota la diferencia',       tipo: 'no_spend',        categorias: ['Café', 'Cafés'],    emoji: '☕' },
  { id: 'sr-transporte',      titulo: 'Transporte bajo $80k',        descripcion: 'Usa transporte público o camina más esta semana',    tipo: 'budget_limit',    categorias: ['Transporte'],       objetivoCOP: 80_000,  emoji: '🚶' },
  { id: 'sr-frecuencia',      titulo: 'Máximo 5 compras',            descripcion: 'Menos transacciones, más intención en cada una',    tipo: 'frequency_limit', categorias: [],                   objetivoN: 5,         emoji: '✋' },
  { id: 'sr-deporte',         titulo: 'Sin gastos en deporte',       descripcion: 'Ejercítate al aire libre o en casa esta semana',     tipo: 'no_spend',        categorias: ['Deporte'],          emoji: '🏃' },
  { id: 'sr-mercado',         titulo: 'Mercado bajo $200k',          descripcion: 'Planea tu lista y evita compras extra en el súper',  tipo: 'budget_limit',    categorias: ['Mercado'],          objetivoCOP: 200_000, emoji: '🛒' },
  { id: 'sr-general',         titulo: 'Semana bajo $400k total',     descripcion: 'Pon a prueba tu disciplina financiera esta semana',  tipo: 'budget_limit',    categorias: [],                   objetivoCOP: 400_000, emoji: '💪' },
];

function weekSugeridoKey(userId: string) {
  return `fm_reto_semana_${userId}_${getWeekId()}`;
}

export function getRetoSemanalSugerido(userId: string, txs: Transaction[]): RetoSugerido | null {
  if (localStorage.getItem(weekSugeridoKey(userId)) === 'aceptado') return null;

  // Calcular categoría con mayor gasto en los últimos 7 días
  const hace7 = new Date();
  hace7.setDate(hace7.getDate() - 7);
  const gastoPorCat: Record<string, number> = {};
  for (const tx of txs) {
    const raw = (tx.Fecha || tx.Timestamp || '').replace(' ', 'T');
    const d = new Date(raw);
    if (isNaN(d.getTime()) || d < hace7) continue;
    const cat = normalizeCategory(tx.Categoría || '');
    if (!cat) continue;
    gastoPorCat[cat] = (gastoPorCat[cat] ?? 0) + Number(tx['Monto (COP)'] || 0);
  }

  // Categoría top del usuario esta semana
  const topCat = Object.entries(gastoPorCat).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';

  // Buscar reto del catálogo que coincida con esa categoría
  const match = CATALOGO_RETOS_SEMANA.find(r =>
    r.categorias.some(c => normalizeCategory(c) === normalizeCategory(topCat))
  );
  if (match) return match;

  // Fallback: rotar por semana del año
  const weekNum = Math.ceil(new Date().getDate() / 7);
  return CATALOGO_RETOS_SEMANA[weekNum % CATALOGO_RETOS_SEMANA.length];
}

export function aceptarRetoSemanal(userId: string, sugerido: RetoSugerido): void {
  const { fechaInicio, fechaFin } = periodDates('semana');
  const reto: Reto = {
    id: `semanal-${Date.now().toString(36)}`,
    titulo: sugerido.titulo,
    tipo: sugerido.tipo,
    categorias: sugerido.categorias,
    comercios: [],
    objetivo: sugerido.tipo === 'frequency_limit'
      ? (sugerido.objetivoN ?? 5)
      : (sugerido.objetivoCOP ?? 0),
    fechaInicio,
    fechaFin,
  };
  addReto(userId, reto);
  localStorage.setItem(weekSugeridoKey(userId), 'aceptado');
}

// ── Progreso de retos ────────────────────────────────────────────────────────

export function computeProgress(reto: Reto, txs: Transaction[]): RetoProgress {
  const start = new Date(reto.fechaInicio + 'T00:00:00');
  const end   = new Date(reto.fechaFin   + 'T23:59:59');
  const now   = new Date();

  // Backward compat: si reto viejo tiene categoria (string) en lugar de categorias (array)
  const cats  = reto.categorias?.length ? reto.categorias : (reto.categoria ? [reto.categoria] : []);
  const mercs = reto.comercios ?? [];

  const relevant = txs.filter(tx => {
    const raw = (tx.Fecha || tx.Timestamp || '').replace(' ', 'T');
    const d   = new Date(raw);
    if (!raw || isNaN(d.getTime()) || d < start || d > end) return false;
    // Sin filtro → todas las transacciones cuentan
    if (cats.length === 0 && mercs.length === 0) return true;
    // OR: cuenta si coincide con alguna categoría o algún comercio
    const txCat      = normalizeCategory(tx.Categoría || '');
    const matchesCat = cats.length > 0 && cats.some(c => normalizeCategory(c) === txCat);
    const cleaned    = cleanMerchant(tx.Comercio);
    const matchesMer = mercs.length > 0 && !!cleaned && mercs.some(m =>
      !!m && (
        cleaned.toLowerCase().includes(m.toLowerCase()) ||
        m.toLowerCase().includes(cleaned.toLowerCase())
      )
    );
    return matchesCat || matchesMer;
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
