import { describe, it, expect, beforeEach } from 'vitest';
import { getLevelProgress, addXP, getGamification, NIVELES } from './gamification';
import type { GamificationState } from './gamification';

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
