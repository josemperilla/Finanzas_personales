export interface MetaMensual {
  monto: number;
  activo: boolean;
}

function key(userId: string) { return `fm_meta_${userId}`; }

export function getMeta(userId: string): MetaMensual {
  try {
    const raw = localStorage.getItem(key(userId));
    if (!raw) return { monto: 0, activo: false };
    return JSON.parse(raw) as MetaMensual;
  } catch {
    return { monto: 0, activo: false };
  }
}

export function setMeta(userId: string, meta: MetaMensual): void {
  localStorage.setItem(key(userId), JSON.stringify(meta));
}
