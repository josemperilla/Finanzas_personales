import { listUsers } from './api';

export interface Profile {
  id: string;
  name: string;
  avatar: string;
  initial: string;
}

export const PROFILES: Profile[] = [
  { id: 'jose',  name: 'Jose',  avatar: '/profile-avatar.jpg', initial: 'J' },
  { id: 'dani', name: 'Dani', avatar: '/dani-avatar.jpg', initial: 'D' },
];

export function getProfile(id: string): Profile | undefined {
  return PROFILES.find(p => p.id === id);
}

// ── Personalización por usuario (localStorage) ────────────────

export function getUserNickname(userId: string): string {
  return localStorage.getItem(`fm_nickname_${userId}`) || '';
}
export function setUserNickname(userId: string, name: string): void {
  localStorage.setItem(`fm_nickname_${userId}`, name.trim());
}

export function getUserAvatar(userId: string): string | null {
  return localStorage.getItem(`fm_avatar_${userId}`);
}
export function setUserAvatar(userId: string, dataUrl: string): void {
  localStorage.setItem(`fm_avatar_${userId}`, dataUrl);
}

export const DEFAULT_TIMEZONE = 'America/Bogota';

export function getUserTimezone(userId: string): string {
  return localStorage.getItem(`fm_timezone_${userId}`) || DEFAULT_TIMEZONE;
}
export function setUserTimezone(userId: string, tz: string): void {
  localStorage.setItem(`fm_timezone_${userId}`, tz);
}

// ── Tab order (por usuario, excluyendo "agregar" que siempre es central) ─────

export const DEFAULT_TAB_ORDER = ['home', 'historial', 'suenos', 'analisis'] as const;
export type ReorderableTab = (typeof DEFAULT_TAB_ORDER)[number];

export function getUserTabOrder(userId: string): ReorderableTab[] {
  try {
    const stored = localStorage.getItem(`fm_tab_order_${userId}`);
    if (stored) {
      const parsed = JSON.parse(stored) as string[];
      const validSet = new Set<string>(DEFAULT_TAB_ORDER);
      if (Array.isArray(parsed) && parsed.length === 4 && parsed.every(t => validSet.has(t))) {
        return parsed as ReorderableTab[];
      }
    }
  } catch {}
  return [...DEFAULT_TAB_ORDER];
}

export function setUserTabOrder(userId: string, order: ReorderableTab[]): void {
  localStorage.setItem(`fm_tab_order_${userId}`, JSON.stringify(order));
}

export function getDisplayName(userId: string): string {
  const nick = getUserNickname(userId);
  if (nick) return nick;
  const profile = PROFILES.find(p => p.id === userId);
  if (profile) return profile.name;
  return userId.charAt(0).toUpperCase() + userId.slice(1);
}

// ── Perfiles recordados por dispositivo (privacidad al escalar) ───
// Solo se muestran en la landing los perfiles que han desbloqueado en ESTE
// dispositivo. No depende del listUsers admin-only.
const KNOWN_KEY = 'fm_known_profiles';

export function getKnownProfileIds(): string[] {
  try {
    const a = JSON.parse(localStorage.getItem(KNOWN_KEY) || '[]');
    return Array.isArray(a) ? a : [];
  } catch {
    return [];
  }
}

export function addKnownProfile(userId: string): void {
  const ids = getKnownProfileIds();
  if (!ids.includes(userId)) localStorage.setItem(KNOWN_KEY, JSON.stringify([...ids, userId]));
}

export function removeKnownProfile(userId: string): void {
  localStorage.setItem(KNOWN_KEY, JSON.stringify(getKnownProfileIds().filter(i => i !== userId)));
}

// Construye Profile[] solo con datos locales (nickname/avatar). Sin red.
export function getKnownProfiles(): Profile[] {
  return getKnownProfileIds().map(id => {
    const seed = PROFILES.find(p => p.id === id);
    const name = getUserNickname(id) || seed?.name || (id.charAt(0).toUpperCase() + id.slice(1));
    return {
      id,
      name,
      avatar: getUserAvatar(id) || seed?.avatar || '',
      initial: name.charAt(0).toUpperCase(),
    };
  });
}

// ── Carga dinámica de usuarios desde el webhook ───────────────
// Usa el array estático como fallback si el webhook falla.
export async function fetchProfiles(): Promise<Profile[]> {
  try {
    const adminId = localStorage.getItem('fm_profile') || 'jose';
    const ids = await listUsers(adminId);
    return ids.map(id => {
      const known = PROFILES.find(p => p.id === id);
      if (known) return known;
      const initial = id.charAt(0).toUpperCase();
      return { id, name: id.charAt(0).toUpperCase() + id.slice(1), avatar: '', initial };
    });
  } catch {
    return PROFILES;
  }
}
