export type ThemeMode = 'auto' | 'light' | 'dark';

// ── Temas de color por usuario ─────────────────────────────────

export interface ColorPreset {
  id: string;
  name: string;
  swatch: string;
}

export const COLOR_PRESETS: ColorPreset[] = [
  { id: 'blue',   name: 'Azul',    swatch: '#1d4ed8' },
  { id: 'green',  name: 'Verde',   swatch: '#15803d' },
  { id: 'purple', name: 'Morado',  swatch: '#6d28d9' },
  { id: 'pink',   name: 'Rosa',    swatch: '#be185d' },
  { id: 'orange', name: 'Naranja', swatch: '#c2410c' },
];

interface ColorPatch {
  vars: Record<string, string>;
  darkVars: Record<string, string>;
}

const PALETTES: Record<string, ColorPatch> = {
  green: {
    vars: {
      '--blue-700': '#15803d', '--blue-600': '#16a34a', '--blue-500': '#22c55e',
      '--blue-300': '#86efac', '--blue-100': '#dcfce7', '--blue-50':  '#f0fdf4',
      '--shadow-blue':  '0 8px 20px rgba(21,128,61,0.28)',
      '--grad-brand':   'linear-gradient(150deg, #15803d, #22c55e 60%, #166534)',
      '--grad-card':    'linear-gradient(125deg, #15803d 0%, #22c55e 45%, #f97316 130%)',
      '--grad-accent':  'linear-gradient(90deg, #22c55e, #f97316)',
    },
    darkVars: { '--blue-50': '#052e16', '--blue-300': '#4ade80' },
  },
  purple: {
    vars: {
      '--blue-700': '#6d28d9', '--blue-600': '#7c3aed', '--blue-500': '#8b5cf6',
      '--blue-300': '#c4b5fd', '--blue-100': '#ede9fe', '--blue-50':  '#f5f3ff',
      '--shadow-blue':  '0 8px 20px rgba(109,40,217,0.28)',
      '--grad-brand':   'linear-gradient(150deg, #6d28d9, #7c3aed 60%, #5b21b6)',
      '--grad-card':    'linear-gradient(125deg, #6d28d9 0%, #7c3aed 45%, #f97316 130%)',
      '--grad-accent':  'linear-gradient(90deg, #7c3aed, #f97316)',
    },
    darkVars: { '--blue-50': '#2e1065', '--blue-300': '#a78bfa' },
  },
  pink: {
    vars: {
      '--blue-700': '#be185d', '--blue-600': '#db2777', '--blue-500': '#ec4899',
      '--blue-300': '#f9a8d4', '--blue-100': '#fce7f3', '--blue-50':  '#fdf2f8',
      '--shadow-blue':  '0 8px 20px rgba(190,24,93,0.28)',
      '--grad-brand':   'linear-gradient(150deg, #be185d, #ec4899 60%, #9d174d)',
      '--grad-card':    'linear-gradient(125deg, #be185d 0%, #ec4899 45%, #f97316 130%)',
      '--grad-accent':  'linear-gradient(90deg, #ec4899, #f97316)',
    },
    darkVars: { '--blue-50': '#500724', '--blue-300': '#f472b6' },
  },
  orange: {
    vars: {
      '--blue-700': '#c2410c', '--blue-600': '#ea580c', '--blue-500': '#f97316',
      '--blue-300': '#fdba74', '--blue-100': '#ffedd5', '--blue-50':  '#fff7ed',
      '--shadow-blue':  '0 8px 20px rgba(194,65,12,0.28)',
      '--grad-brand':   'linear-gradient(150deg, #c2410c, #f97316 60%, #9a3412)',
      '--grad-card':    'linear-gradient(125deg, #c2410c 0%, #f97316 45%, #eab308 130%)',
      '--grad-accent':  'linear-gradient(90deg, #f97316, #eab308)',
    },
    darkVars: { '--blue-50': '#431407', '--blue-300': '#fb923c' },
  },
};

const SCHEME_STYLE_ID = 'fm-color-scheme';

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function buildCustomCSS(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  const shadow = `0 8px 20px rgba(${r},${g},${b},0.28)`;
  const light50 = `rgba(${r},${g},${b},0.06)`;
  const light300 = `rgba(${r},${g},${b},0.45)`;
  return `:root{--blue-700:${hex};--blue-600:${hex};--blue-500:${hex};--blue-300:${light300};--blue-50:${light50};--shadow-blue:${shadow};--grad-brand:linear-gradient(150deg,${hex},${hex} 60%,${hex});--grad-card:linear-gradient(125deg,${hex} 0%,${hex} 45%,#f97316 130%);--grad-accent:linear-gradient(90deg,${hex},#f97316);}`;
}

function buildPresetCSS(patch: ColorPatch): string {
  const light = Object.entries(patch.vars).map(([k, v]) => `${k}:${v}`).join(';');
  const dark = Object.entries(patch.darkVars).map(([k, v]) => `${k}:${v}`).join(';');
  return `:root{${light}}[data-theme="dark"]{${dark}}@media(prefers-color-scheme:dark){:root:not([data-theme="light"]){${dark}}}`;
}

export function getUserColorScheme(userId: string): string {
  return localStorage.getItem(`fm_color_scheme_${userId}`) || 'blue';
}

export function setUserColorScheme(userId: string, scheme: string): void {
  localStorage.setItem(`fm_color_scheme_${userId}`, scheme);
}

export function applyColorScheme(userId: string): void {
  const scheme = getUserColorScheme(userId);
  const existing = document.getElementById(SCHEME_STYLE_ID);
  if (existing) existing.remove();
  if (scheme === 'blue') return;
  const style = document.createElement('style');
  style.id = SCHEME_STYLE_ID;
  if (PALETTES[scheme]) {
    style.textContent = buildPresetCSS(PALETTES[scheme]);
  } else if (scheme.startsWith('#')) {
    style.textContent = buildCustomCSS(scheme);
  }
  document.head.appendChild(style);
}

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
