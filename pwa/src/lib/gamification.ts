import type { Sueno } from './suenos';

export interface GamificationState {
  xp: number;
  nivel: number;
  racha: number;
  ultimoRegistro: string;
  streakFreezeUsado: boolean;
  badges: string[];
}

export const BADGES: Record<string, { emoji: string; nombre: string; hint: string }> = {
  'primer-reto':           { emoji: '💪', nombre: 'Primer reto',          hint: 'Ve a Misiones, crea un reto y complétalo antes de la fecha límite' },
  'primer-pdf':            { emoji: '🔍', nombre: 'Detective',             hint: 'Importa tu primer extracto bancario desde Agregar → Importar PDF' },
  'primera-meta':          { emoji: '🎯', nombre: 'Con propósito',         hint: 'Activa tu presupuesto mensual desde Ajustes o el onboarding' },
  'primer-sueno':          { emoji: '✈️', nombre: 'El viaje empieza',      hint: 'Crea tu primer Sueño en la sección Misiones' },
  'racha-7':               { emoji: '🔥', nombre: 'Semana perfecta',       hint: 'Gasta por debajo de tu presupuesto diario 7 días seguidos' },
  'racha-30':              { emoji: '🌋', nombre: 'Mes de fuego',          hint: 'Mantén el presupuesto diario 30 días sin interrupciones' },
  'reto-5':                { emoji: '🎖️', nombre: 'Reto maestro',          hint: 'Completa 5 retos en total (pueden ser de distintas semanas)' },
  'sueno-50':              { emoji: '🌊', nombre: 'A mitad del camino',    hint: 'Lleva cualquier Sueño al 50% de su meta de ahorro' },
  'sueno-completo':        { emoji: '🏆', nombre: '¡Lo lograste!',         hint: 'Alcanza el 100% de ahorro de cualquier Sueño' },
  'cazador-suscripciones': { emoji: '🕵️', nombre: 'Cazador',               hint: 'La app detecta 3 o más suscripciones en tus movimientos bancarios' },
  'presupuesto-perfecto':  { emoji: '💎', nombre: 'Presupuesto perfecto',  hint: 'Cierra un mes completo sin exceder tu meta mensual de gasto' },
  'nivel-2':               { emoji: '🌱', nombre: 'Ahorrador',             hint: 'Acumula 200 XP completando retos, importando extractos y más' },
  'nivel-3':               { emoji: '📊', nombre: 'Administrador',         hint: 'Acumula 600 XP — completa retos y mantén tu presupuesto mensual' },
  'nivel-4':               { emoji: '💹', nombre: 'Financiero',            hint: 'Acumula 1500 XP alcanzando metas de ahorro y retos avanzados' },
  'nivel-5':               { emoji: '👑', nombre: 'Maestro',               hint: 'Acumula 3000 XP — el nivel más alto de disciplina financiera' },
  'desafio-2026-01':       { emoji: '🌟', nombre: 'Enero sin excesos',     hint: 'Completa el desafío mensual "Enero sin excesos" en enero 2026' },
  'desafio-2026-06':       { emoji: '🍳', nombre: 'Chef en casa',          hint: 'Completa 15+ días sin domicilios en el desafío de junio 2026' },
  'desafio-2026-07':       { emoji: '💰', nombre: 'Julio de contado',      hint: 'Cierra julio 2026 dentro de tu meta mensual de gasto' },
  'desafio-2026-08':       { emoji: '📚', nombre: 'Agosto inteligente',    hint: 'Cierra agosto 2026 dentro de tu meta mensual de gasto' },
  'desafio-2026-11':       { emoji: '🛍️', nombre: 'Black Friday zen',      hint: 'Cierra noviembre 2026 dentro de tu meta pese al Black Friday' },
  'desafio-2026-12':       { emoji: '🎄', nombre: 'Navidad sin deudas',    hint: 'Cierra diciembre 2026 dentro de tu meta mensual de gasto' },
};

export const NIVELES = [
  { nivel: 1, nombre: 'Hormiga',         xpMin: 0 },
  { nivel: 2, nombre: 'Ahorrador',       xpMin: 200 },
  { nivel: 3, nombre: 'Administrador',   xpMin: 600 },
  { nivel: 4, nombre: 'Financiero',      xpMin: 1500 },
  { nivel: 5, nombre: 'Maestro',         xpMin: 3000 },
];

export const XP_POR_ACCION = {
  recategorizar:       5,
  registrarTransaccion: 2,
  configurarMeta:      20,
  importarExtracto:    30,
  completarReto:       50,
  mesDentroMeta:       200,
  alcanzarSueno:       500,
} as const;

const DEFAULT_STATE: GamificationState = {
  xp: 0,
  nivel: 1,
  racha: 0,
  ultimoRegistro: '',
  streakFreezeUsado: false,
  badges: [],
};

function key(userId: string) { return `fm_gamification_${userId}`; }

export function getGamification(userId: string): GamificationState {
  try {
    const raw = localStorage.getItem(key(userId));
    if (!raw) return { ...DEFAULT_STATE };
    return { ...DEFAULT_STATE, ...JSON.parse(raw) } as GamificationState;
  } catch {
    return { ...DEFAULT_STATE };
  }
}

function save(userId: string, state: GamificationState) {
  localStorage.setItem(key(userId), JSON.stringify(state));
}

function computeNivel(xp: number): number {
  for (let i = NIVELES.length - 1; i >= 0; i--) {
    if (xp >= NIVELES[i].xpMin) return NIVELES[i].nivel;
  }
  return 1;
}

export function getLevelProgress(state: GamificationState): { pct: number; xpToNext: number; nivelActual: typeof NIVELES[number] } {
  const nivelActual = NIVELES.find(n => n.nivel === state.nivel) ?? NIVELES[0];
  const nivelSig = NIVELES.find(n => n.nivel === state.nivel + 1);
  if (!nivelSig) return { pct: 1, xpToNext: 0, nivelActual };
  const rango = nivelSig.xpMin - nivelActual.xpMin;
  const progreso = state.xp - nivelActual.xpMin;
  return { pct: Math.min(progreso / rango, 1), xpToNext: nivelSig.xpMin - state.xp, nivelActual };
}

export function addXP(userId: string, accion: keyof typeof XP_POR_ACCION): GamificationState {
  const state = getGamification(userId);
  const gained = XP_POR_ACCION[accion];
  const newXp = state.xp + gained;
  const newNivel = computeNivel(newXp);
  const badges = [...state.badges];

  if (newNivel > state.nivel) {
    if (newNivel === 2 && !badges.includes('nivel-2')) badges.push('nivel-2');
    if (newNivel === 3 && !badges.includes('nivel-3')) badges.push('nivel-3');
    if (newNivel === 4 && !badges.includes('nivel-4')) badges.push('nivel-4');
    if (newNivel === 5 && !badges.includes('nivel-5')) badges.push('nivel-5');
  }

  const updated: GamificationState = { ...state, xp: newXp, nivel: newNivel, badges };
  save(userId, updated);
  return updated;
}

// Actualizar racha: llamar una vez por día cuando se evalúa presupuesto o completa reto.
// Retorna la nueva racha.
export function updateRacha(userId: string, dentroDelPresupuesto: boolean): number {
  const state = getGamification(userId);
  const today = new Date().toISOString().split('T')[0];
  const lastReg = state.ultimoRegistro;

  if (lastReg === today) return state.racha; // ya procesado hoy

  let newRacha = state.racha;
  let freezeUsado = state.streakFreezeUsado;

  // Recarga del freeze los lunes
  const dayOfWeek = new Date().getDay();
  if (dayOfWeek === 1) freezeUsado = false;

  if (!dentroDelPresupuesto) {
    // Perdida de racha — intentar aplicar freeze
    if (!freezeUsado) {
      freezeUsado = true; // freeze usado
      // racha continúa sin incrementar
    } else {
      newRacha = 0;
    }
  } else {
    newRacha = lastReg ? newRacha + 1 : 1;
  }

  const badges = [...state.badges];
  if (newRacha >= 7 && !badges.includes('racha-7')) badges.push('racha-7');
  if (newRacha >= 30 && !badges.includes('racha-30')) badges.push('racha-30');

  const updated: GamificationState = {
    ...state,
    racha: newRacha,
    ultimoRegistro: today,
    streakFreezeUsado: freezeUsado,
    badges,
  };
  save(userId, updated);
  return newRacha;
}

// Registrar visita a la app (para el círculo azul de "registro")
export function registrarVisita(userId: string): void {
  const weekKey = `fm_visits_${userId}_${getWeekId()}`;
  const count = Number(localStorage.getItem(weekKey) || '0');
  localStorage.setItem(weekKey, String(count + 1));
}

export function getVisitasSemana(userId: string): number {
  const weekKey = `fm_visits_${userId}_${getWeekId()}`;
  return Number(localStorage.getItem(weekKey) || '0');
}

export function getWeekId(): string {
  const d = new Date();
  const dayOfWeek = d.getDay();
  const diff = d.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  return monday.toISOString().split('T')[0];
}

// Revisar y otorgar badges basados en estado actual de transacciones y sueños.
// suscripcionesCount: cuántas suscripciones detectó el sistema (pásalo desde el componente).
export function checkBadgesSync(
  userId: string,
  suenos: Sueno[],
  retosCompletados: number,
  suscripcionesCount?: number,
): string[] {
  const state = getGamification(userId);
  const badges = new Set(state.badges);
  const newBadges: string[] = [];

  function award(id: string) {
    if (!badges.has(id)) { badges.add(id); newBadges.push(id); }
  }

  if (suenos.length > 0) award('primer-sueno');
  suenos.forEach(s => {
    const pct = s.monto > 0 ? s.ahorrado / s.monto : 0;
    if (pct >= 0.5) award('sueno-50');
    if (pct >= 1) award('sueno-completo');
  });

  if (retosCompletados >= 1) award('primer-reto');
  if (retosCompletados >= 5) award('reto-5');

  if ((suscripcionesCount ?? 0) >= 3) award('cazador-suscripciones');

  try {
    const metaRaw = localStorage.getItem(`fm_meta_${userId}`);
    if (metaRaw) {
      const meta = JSON.parse(metaRaw);
      if (meta?.activo && meta?.monto > 0) award('primera-meta');
    }
  } catch { /* noop */ }

  if (newBadges.length > 0) {
    save(userId, { ...state, badges: [...badges] });
  }
  return newBadges;
}

// Otorgar un badge puntual (para acciones como importar PDF)
export function awardBadge(userId: string, badgeId: string): boolean {
  const state = getGamification(userId);
  if (state.badges.includes(badgeId)) return false;
  save(userId, { ...state, badges: [...state.badges, badgeId] });
  return true;
}
