import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  getLevelProgress,
  addXP,
  getGamification,
  NIVELES,
  updateRacha,
  checkBadgesSync,
  awardBadge,
  registrarVisita,
  getVisitasSemana,
  getWeekId,
} from './gamification';
import type { GamificationState } from './gamification';
import type { Sueno } from './suenos';

function state(partial: Partial<GamificationState>): GamificationState {
  return { xp: 0, nivel: 1, racha: 0, ultimoRegistro: '', streakFreezeUsado: false, badges: [], ...partial };
}

describe('getLevelProgress', () => {
  it('calcula progreso parcial dentro de un nivel', () => {
    // nivel 1 (xpMin 0) → nivel 2 (xpMin 200), con 100 XP = 50%
    const p = getLevelProgress(state({ xp: 100, nivel: 1 }));
    expect(p.pct).toBeCloseTo(0.5);
    expect(p.xpToNext).toBe(100);
    expect(p.nivelActual.nivel).toBe(1);
  });

  it('en el nivel máximo devuelve 100% sin xpToNext', () => {
    const maxNivel = NIVELES[NIVELES.length - 1].nivel;
    const p = getLevelProgress(state({ xp: 5000, nivel: maxNivel }));
    expect(p.pct).toBe(1);
    expect(p.xpToNext).toBe(0);
  });

  it('cap del progreso a 1 si el XP excede el rango', () => {
    const p = getLevelProgress(state({ xp: 199, nivel: 1 }));
    expect(p.pct).toBeLessThanOrEqual(1);
    expect(p.pct).toBeGreaterThan(0.9);
  });
});

describe('addXP', () => {
  beforeEach(() => localStorage.clear());

  it('acumula XP y persiste el estado', () => {
    addXP('u1', 'recategorizar'); // +5
    const s = getGamification('u1');
    expect(s.xp).toBe(5);
  });

  it('sube de nivel y otorga el badge correspondiente al cruzar el umbral', () => {
    // importarExtracto = 30 XP; necesitamos 200 para nivel 2
    for (let i = 0; i < 7; i++) addXP('u1', 'importarExtracto'); // 210 XP
    const s = getGamification('u1');
    expect(s.xp).toBe(210);
    expect(s.nivel).toBe(2);
    expect(s.badges).toContain('nivel-2');
  });
});

describe('updateRacha', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('primer registro dentro de presupuesto → racha = 1', () => {
    vi.setSystemTime(new Date('2026-06-03T12:00:00')); // miércoles
    expect(updateRacha('u1', true)).toBe(1);
  });

  it('llamar dos veces el mismo día no vuelve a incrementar (idempotente)', () => {
    // Mismo horario del día (solo cambia el minuto) para no cruzar medianoche UTC
    // por el huso horario de la máquina que corre el test.
    vi.setSystemTime(new Date('2026-06-03T12:00:00'));
    updateRacha('u1', true);
    vi.setSystemTime(new Date('2026-06-03T12:30:00'));
    expect(updateRacha('u1', true)).toBe(1);
  });

  it('un día fuera de presupuesto consume el freeze sin romper la racha', () => {
    vi.setSystemTime(new Date('2026-06-03T12:00:00'));
    updateRacha('u1', true); // racha=1
    vi.setSystemTime(new Date('2026-06-04T12:00:00'));
    const racha = updateRacha('u1', false); // se pierde el presupuesto, pero hay freeze disponible
    expect(racha).toBe(1); // no se rompe
    expect(getGamification('u1').streakFreezeUsado).toBe(true);
  });

  it('un segundo día fuera de presupuesto (freeze ya usado) resetea la racha a 0', () => {
    vi.setSystemTime(new Date('2026-06-03T12:00:00'));
    updateRacha('u1', true); // racha=1
    vi.setSystemTime(new Date('2026-06-04T12:00:00'));
    updateRacha('u1', false); // freeze consumido, racha=1
    vi.setSystemTime(new Date('2026-06-05T12:00:00'));
    expect(updateRacha('u1', false)).toBe(0);
  });

  it('el freeze se recarga el lunes siguiente aunque se haya consumido antes', () => {
    vi.setSystemTime(new Date('2026-06-03T12:00:00')); // miércoles
    updateRacha('u1', true);
    vi.setSystemTime(new Date('2026-06-04T12:00:00')); // jueves: consume freeze
    updateRacha('u1', false);
    expect(getGamification('u1').streakFreezeUsado).toBe(true);
    vi.setSystemTime(new Date('2026-06-08T12:00:00')); // lunes siguiente
    updateRacha('u1', true);
    expect(getGamification('u1').streakFreezeUsado).toBe(false);
  });

  it('otorga el badge racha-7 al llegar a 7 días seguidos', () => {
    for (let i = 0; i < 7; i++) {
      vi.setSystemTime(new Date(2026, 5, 1 + i, 12, 0, 0));
      updateRacha('u1', true);
    }
    expect(getGamification('u1').racha).toBe(7);
    expect(getGamification('u1').badges).toContain('racha-7');
  });
});

describe('checkBadgesSync', () => {
  beforeEach(() => localStorage.clear());

  function sueno(partial: Partial<Sueno>): Sueno {
    return {
      id: 's1', nombre: 'Viaje', emoji: '✈️', monto: 1000000,
      fechaObjetivo: '2027-01-01', ahorrado: 0, activo: true, creadoEn: '2026-01-01',
      ...partial,
    };
  }

  it('otorga primer-sueno y sueno-50 cuando hay un sueño a mitad de camino', () => {
    const nuevos = checkBadgesSync('u1', [sueno({ ahorrado: 500000, monto: 1000000 })], 0);
    expect(nuevos).toEqual(expect.arrayContaining(['primer-sueno', 'sueno-50']));
    expect(nuevos).not.toContain('sueno-completo');
  });

  it('otorga sueno-completo cuando el sueño llegó al 100%', () => {
    const nuevos = checkBadgesSync('u1', [sueno({ ahorrado: 1000000, monto: 1000000 })], 0);
    expect(nuevos).toContain('sueno-completo');
  });

  it('otorga primer-reto con 1 reto y reto-5 con 5', () => {
    expect(checkBadgesSync('u1', [], 1)).toContain('primer-reto');
    localStorage.clear();
    expect(checkBadgesSync('u1', [], 5)).toEqual(expect.arrayContaining(['primer-reto', 'reto-5']));
  });

  it('otorga cazador-suscripciones con 3+ suscripciones detectadas', () => {
    expect(checkBadgesSync('u1', [], 0, 3)).toContain('cazador-suscripciones');
    localStorage.clear();
    expect(checkBadgesSync('u1', [], 0, 2)).not.toContain('cazador-suscripciones');
  });

  it('no vuelve a otorgar un badge ya obtenido (idempotente)', () => {
    checkBadgesSync('u1', [], 1); // otorga primer-reto
    const segunda = checkBadgesSync('u1', [], 1);
    expect(segunda).not.toContain('primer-reto');
  });

  it('sin sueños/retos/suscripciones no otorga nada', () => {
    expect(checkBadgesSync('u1', [], 0)).toEqual([]);
  });
});

describe('awardBadge', () => {
  beforeEach(() => localStorage.clear());

  it('otorga un badge nuevo y devuelve true', () => {
    expect(awardBadge('u1', 'primer-pdf')).toBe(true);
    expect(getGamification('u1').badges).toContain('primer-pdf');
  });

  it('devuelve false si el badge ya estaba otorgado (sin duplicarlo)', () => {
    awardBadge('u1', 'primer-pdf');
    expect(awardBadge('u1', 'primer-pdf')).toBe(false);
    expect(getGamification('u1').badges.filter(b => b === 'primer-pdf')).toHaveLength(1);
  });
});

describe('registrarVisita / getVisitasSemana / getWeekId', () => {
  beforeEach(() => localStorage.clear());

  it('cuenta visitas dentro de la misma semana', () => {
    registrarVisita('u1');
    registrarVisita('u1');
    expect(getVisitasSemana('u1')).toBe(2);
  });

  it('getWeekId siempre devuelve el lunes de la semana actual', () => {
    const id = getWeekId();
    const d = new Date(id + 'T12:00:00');
    expect(d.getDay()).toBe(1);
  });

  // Regresión: la versión vieja hacía la aritmética en local y serializaba con
  // toISOString(). En Bogotá (UTC-5), de las 19:00 en adelante eso corría la
  // clave un día y partía la semana en dos. CI corre en UTC, donde local y UTC
  // coinciden, así que solo fallaba en la máquina del usuario y de noche.
  // Estos casos inyectan la hora, así que fallan en cualquier zona horaria.
  it('getWeekId no se corre de día por la tarde-noche (bug de UTC)', () => {
    // Miércoles 12-ago-2026. El lunes de esa semana es el 10.
    for (const hora of [0, 9, 18, 19, 21, 23]) {
      const id = getWeekId(new Date(2026, 7, 12, hora, 30, 0));
      expect(id, `a las ${hora}:30 debería seguir siendo el lunes 10`).toBe('2026-08-10');
    }
  });

  it('getWeekId trata el domingo como fin de la semana que empezó el lunes', () => {
    // Domingo 16-ago-2026 → lunes 10, no el 17.
    expect(getWeekId(new Date(2026, 7, 16, 23, 0, 0))).toBe('2026-08-10');
  });

  it('getWeekId cruza bien el cambio de mes y de año', () => {
    // Miércoles 1-jul-2026 → lunes 29-jun.
    expect(getWeekId(new Date(2026, 6, 1, 20, 0, 0))).toBe('2026-06-29');
    // Viernes 1-ene-2027 → lunes 28-dic-2026.
    expect(getWeekId(new Date(2027, 0, 1, 20, 0, 0))).toBe('2026-12-28');
  });
});
