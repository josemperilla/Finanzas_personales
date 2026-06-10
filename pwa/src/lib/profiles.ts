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
  const stat = PROFILES.find(p => p.id === id);
  if (stat) return stat;
  // Fall back to registry profiles cached by fetchProfiles(), so newly
  // onboarded users show their real name/avatar on the PIN screen & Settings.
  try {
    const cached = JSON.parse(localStorage.getItem('fm_profiles_cache') || '[]') as
      { id: string; name: string; avatar?: string }[];
    const c = cached.find(p => p.id === id);
    if (c) return { id: c.id, name: c.name || c.id, avatar: c.avatar || '', initial: (c.name || c.id).charAt(0).toUpperCase() };
  } catch { /* noop */ }
  return undefined;
}

// Merge the static floor with registry profiles coming from the server.
// Static entries win on avatar (jose/dani have curated images); registry-only
// users are appended. Used by ProfileSelector once fetchProfiles() resolves.
export function mergeProfiles(
  remote: { id: string; name: string; avatar?: string }[] | null,
): Profile[] {
  if (!remote || remote.length === 0) return PROFILES;
  const byId = new Map<string, Profile>();
  for (const p of PROFILES) byId.set(p.id, p);
  for (const r of remote) {
    const existing = byId.get(r.id);
    if (existing) {
      // Keep curated static avatar; only fill a display name if provided.
      byId.set(r.id, { ...existing, name: r.name || existing.name });
    } else {
      byId.set(r.id, {
        id: r.id,
        name: r.name || r.id,
        avatar: r.avatar || '',
        initial: (r.name || r.id).charAt(0).toUpperCase(),
      });
    }
  }
  return Array.from(byId.values());
}
