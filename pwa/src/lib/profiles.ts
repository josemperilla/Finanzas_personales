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
