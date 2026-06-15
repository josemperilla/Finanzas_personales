export type DarkPaletteName =
  | 'noir-dorado'
  | 'noir-esmeralda'
  | 'noir-azul-hielo'
  | 'noir-violeta'
  | 'noir-rosado';

export type LightPaletteName = 'crema-calida' | 'gris-frio' | 'papel';

export interface DarkPaletteConfig {
  id: DarkPaletteName;
  label: string;
  preview: { bg: string; card: string; accent: string };
}

export interface LightPaletteConfig {
  id: LightPaletteName;
  label: string;
  preview: { bg: string; card: string };
}

export const DARK_PALETTES: DarkPaletteConfig[] = [
  {
    id: 'noir-dorado',
    label: 'Noir Dorado',
    preview: { bg: '#000000', card: '#111111', accent: '#F59E0B' },
  },
  {
    id: 'noir-esmeralda',
    label: 'Noir Esmeralda',
    preview: { bg: '#000000', card: '#141414', accent: '#10B981' },
  },
  {
    id: 'noir-azul-hielo',
    label: 'Noir Azul Hielo',
    preview: { bg: '#000000', card: '#121212', accent: '#38BDF8' },
  },
  {
    id: 'noir-violeta',
    label: 'Noir Violeta',
    preview: { bg: '#000000', card: '#0D0D1A', accent: '#8B5CF6' },
  },
  {
    id: 'noir-rosado',
    label: 'Noir Rosado',
    preview: { bg: '#000000', card: '#130A0F', accent: '#F43F5E' },
  },
];

export const LIGHT_PALETTES: LightPaletteConfig[] = [
  {
    id: 'crema-calida',
    label: 'Crema Cálida',
    preview: { bg: '#FAF7F2', card: '#FFFEF9' },
  },
  {
    id: 'gris-frio',
    label: 'Gris Frío',
    preview: { bg: '#F3F4F6', card: '#FFFFFF' },
  },
  {
    id: 'papel',
    label: 'Papel',
    preview: { bg: '#FBF7ED', card: '#FFFEF7' },
  },
];

const DARK_KEY  = 'fm_dark_palette';
const LIGHT_KEY = 'fm_light_palette';

export function getDarkPalette(): DarkPaletteName | null {
  return localStorage.getItem(DARK_KEY) as DarkPaletteName | null;
}

export function getLightPalette(): LightPaletteName | null {
  return localStorage.getItem(LIGHT_KEY) as LightPaletteName | null;
}

export function saveDarkPalette(id: DarkPaletteName | null): void {
  if (id) localStorage.setItem(DARK_KEY, id);
  else localStorage.removeItem(DARK_KEY);
}

export function saveLightPalette(id: LightPaletteName | null): void {
  if (id) localStorage.setItem(LIGHT_KEY, id);
  else localStorage.removeItem(LIGHT_KEY);
}

export function applyPalettes(): void {
  const html = document.documentElement;
  const dark = getDarkPalette();
  if (dark) html.setAttribute('data-dark-palette', dark);
  else html.removeAttribute('data-dark-palette');
  const light = getLightPalette();
  if (light) html.setAttribute('data-light-palette', light);
  else html.removeAttribute('data-light-palette');
}
