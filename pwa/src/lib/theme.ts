export type ThemeMode = 'auto' | 'light' | 'dark';

export function getTheme(): ThemeMode {
  return (localStorage.getItem('fm_theme') as ThemeMode) || 'auto';
}

export function applyTheme(mode: ThemeMode) {
  const html = document.documentElement;
  if (mode === 'auto') {
    html.removeAttribute('data-theme');
  } else {
    html.setAttribute('data-theme', mode);
  }
  localStorage.setItem('fm_theme', mode);
}

// ── Modo Accesible (por usuario, persiste en localStorage) ────

export function getAccessibleMode(userId: string): boolean {
  return localStorage.getItem(`fm_accessible_${userId}`) === '1';
}

export function setAccessibleMode(userId: string, on: boolean): void {
  localStorage.setItem(`fm_accessible_${userId}`, on ? '1' : '0');
  document.documentElement.dataset.mode = on ? 'accessible' : '';
}

export function applyAccessibleMode(userId: string): void {
  const on = getAccessibleMode(userId);
  document.documentElement.dataset.mode = on ? 'accessible' : '';
}
