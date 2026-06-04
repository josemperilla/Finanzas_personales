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
