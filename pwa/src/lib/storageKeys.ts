// Claves de localStorage usadas en más de un archivo — única fuente de verdad
// para evitar strings sueltos repetidos y desincronizados.
export const STORAGE_KEYS = {
  activeProfile: 'fm_profile',
  defaultBank: 'fm_default_bank',
  tutorialSeen: (userId: string) => `fm_tutorial_seen_${userId}`,
} as const;
