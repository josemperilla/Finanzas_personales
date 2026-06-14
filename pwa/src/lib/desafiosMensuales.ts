import type { Transaction } from './api';
import { isGasto } from './api';
import { getMeta } from './meta';

export interface Desafio {
  mes: number; // 0-11
  titulo: string;
  descripcion: string;
  emoji: string;
  badgeId: string;
  tipo: 'sin-categoria' | 'dentro-meta';
  categorias?: string[]; // used when tipo === 'sin-categoria'
}

export const DESAFIOS_POR_MES: Record<number, Desafio> = {
  0:  { mes: 0,  titulo: 'Enero sin excesos',  descripcion: 'Cierra enero dentro de tu meta mensual',    emoji: '🌟', badgeId: 'desafio-2026-01', tipo: 'dentro-meta' },
  5:  { mes: 5,  titulo: 'Junio chef en casa', descripcion: 'Pasa junio sin ningún gasto en Domicilios', emoji: '🍳', badgeId: 'desafio-2026-06', tipo: 'sin-categoria', categorias: ['Domicilios'] },
  6:  { mes: 6,  titulo: 'Julio de contado',   descripcion: 'Cierra julio dentro de tu meta mensual',    emoji: '💰', badgeId: 'desafio-2026-07', tipo: 'dentro-meta' },
  7:  { mes: 7,  titulo: 'Agosto inteligente', descripcion: 'Cierra agosto dentro de tu meta mensual',   emoji: '📚', badgeId: 'desafio-2026-08', tipo: 'dentro-meta' },
  10: { mes: 10, titulo: 'Black Friday zen',   descripcion: 'Noviembre dentro de tu meta mensual',       emoji: '🛍️', badgeId: 'desafio-2026-11', tipo: 'dentro-meta' },
  11: { mes: 11, titulo: 'Navidad sin deudas', descripcion: 'Diciembre dentro de tu meta mensual',       emoji: '🎄', badgeId: 'desafio-2026-12', tipo: 'dentro-meta' },
};

function storeKey(userId: string, yearMonth: string) {
  return `fm_desafio_${userId}_${yearMonth}`;
}

function yearMonthOf(mes: number): string {
  const year = new Date().getFullYear();
  return `${year}-${String(mes + 1).padStart(2, '0')}`;
}

function filtrarMes(txs: Transaction[], yearMonth: string): Transaction[] {
  const [y, m] = yearMonth.split('-').map(Number);
  return txs.filter(tx => {
    const d = new Date((tx.Fecha || tx.Timestamp).replace(' ', 'T'));
    return d.getFullYear() === y && d.getMonth() === m - 1;
  });
}

export function getDesafioActual(): Desafio | null {
  return DESAFIOS_POR_MES[new Date().getMonth()] ?? null;
}

export function getDesafioCompletado(userId: string): boolean {
  const d = getDesafioActual();
  if (!d) return false;
  const raw = localStorage.getItem(storeKey(userId, yearMonthOf(d.mes)));
  return raw === 'completado';
}

function marcarCompletado(userId: string, desafio: Desafio) {
  localStorage.setItem(storeKey(userId, yearMonthOf(desafio.mes)), 'completado');
}

function estaEnUltimosDias(): boolean {
  const hoy = new Date();
  const ultimoDia = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
  return hoy.getDate() >= ultimoDia - 2;
}

// Returns true if badge should be awarded (first time detection).
export function verificarDesafio(userId: string, txs: Transaction[]): boolean {
  const desafio = getDesafioActual();
  if (!desafio) return false;
  if (getDesafioCompletado(userId)) return false; // ya otorgado

  const ym = yearMonthOf(desafio.mes);
  const mesTxs = filtrarMes(txs, ym);

  let completado = false;

  if (desafio.tipo === 'sin-categoria') {
    const cats = desafio.categorias ?? [];
    const tieneGasto = mesTxs.some(tx => cats.includes(tx.Categoría ?? ''));
    // "sin-categoria" se puede ganar a mitad de mes si ya hay 15+ días sin el gasto
    const diasPasados = new Date().getDate();
    completado = !tieneGasto && diasPasados >= 15;
  } else {
    // 'dentro-meta': solo verificar en los últimos 3 días del mes
    if (!estaEnUltimosDias()) return false;
    const meta = getMeta(userId);
    if (!meta.activo || meta.monto <= 0) return false;
    const total = mesTxs.filter(isGasto).reduce((s, tx) => s + Number(tx['Monto (COP)'] || 0), 0);
    completado = total <= meta.monto;
  }

  if (completado) {
    marcarCompletado(userId, desafio);
    return true;
  }
  return false;
}

export interface DesafioProgress {
  pct: number;     // 0–1 (1 = goal met)
  texto: string;   // human readable
  completado: boolean;
}

export function getDesafioProgress(userId: string, txs: Transaction[]): DesafioProgress | null {
  const desafio = getDesafioActual();
  if (!desafio) return null;

  const yaCompletado = getDesafioCompletado(userId);
  const ym = yearMonthOf(desafio.mes);
  const mesTxs = filtrarMes(txs, ym);

  if (desafio.tipo === 'sin-categoria') {
    const cats = desafio.categorias ?? [];
    const hoy = new Date();
    const diasMes = hoy.getDate();
    const diasConGasto = new Set(
      mesTxs
        .filter(tx => cats.includes(tx.Categoría ?? ''))
        .map(tx => (tx.Fecha || tx.Timestamp).slice(0, 10))
    ).size;
    const diasSin = diasMes - diasConGasto;
    return {
      pct: diasSin / diasMes,
      texto: yaCompletado ? '¡Desafío completado! 🎉' : `${diasSin} de ${diasMes} días sin ${cats.join('/')}`,
      completado: yaCompletado,
    };
  } else {
    const meta = getMeta(userId);
    if (!meta.activo || meta.monto <= 0) return null;
    const total = mesTxs.filter(isGasto).reduce((s, tx) => s + Number(tx['Monto (COP)'] || 0), 0);
    const pct = Math.max(0, 1 - total / meta.monto);
    const dentroMeta = total <= meta.monto;
    return {
      pct,
      texto: yaCompletado ? '¡Desafío completado! 🎉' : (dentroMeta ? 'Dentro de tu meta ✓' : `${Math.round((total / meta.monto - 1) * 100)}% sobre tu meta`),
      completado: yaCompletado,
    };
  }
}
