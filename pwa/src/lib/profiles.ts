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

export function getDisplayName(userId: string): string {
  const nick = getUserNickname(userId);
  if (nick) return nick;
  const profile = PROFILES.find(p => p.id === userId);
  if (profile) return profile.name;
  return userId.charAt(0).toUpperCase() + userId.slice(1);
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
