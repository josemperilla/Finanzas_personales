export function formatCOP(amount: number): string {
  return '$' + Math.round(amount).toLocaleString('es-CO');
}

export function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr.replace(' ', 'T'));
  return d.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
}

export function formatDateShort(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr.replace(' ', 'T'));
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
}

export function getDateKey(dateStr: string): string {
  if (!dateStr) return '';
  return dateStr.slice(0, 10);
}

export function formatDateHeader(dateKey: string): string {
  const d = new Date(dateKey + 'T12:00:00');
  return d.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
}

export function currentMonthLabel(): string {
  return new Date().toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })
    .replace(/^\w/, c => c.toUpperCase());
}

// Returns today's date as YYYY-MM-DD in the given timezone (default: Colombia).
// Use this instead of new Date().toISOString().slice(0,10) which gives UTC date.
export function todayInTZ(tz = 'America/Bogota'): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: tz });
}

export const TIMEZONE_OPTIONS: { value: string; label: string }[] = [
  { value: 'America/Bogota',             label: 'Colombia (UTC-5)' },
  { value: 'America/Lima',               label: 'Perú / Ecuador (UTC-5)' },
  { value: 'America/Mexico_City',        label: 'México Centro (UTC-6)' },
  { value: 'America/Santiago',           label: 'Chile (UTC-4/-3)' },
  { value: 'America/Argentina/Buenos_Aires', label: 'Argentina (UTC-3)' },
  { value: 'America/Caracas',            label: 'Venezuela (UTC-4)' },
  { value: 'America/New_York',           label: 'USA Este (UTC-5/-4)' },
  { value: 'Europe/Madrid',              label: 'España (UTC+1/+2)' },
  { value: 'UTC',                        label: 'UTC' },
];
