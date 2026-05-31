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
