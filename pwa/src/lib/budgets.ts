export type Budgets = Record<string, number>;

const SHARED_KEY = 'fm_budgets_shared';

function key(userId: string) {
  return `fm_budgets_${userId}`;
}

export function getBudgets(userId: string): Budgets {
  try {
    return JSON.parse(localStorage.getItem(key(userId)) || '{}');
  } catch {
    return {};
  }
}

export function setBudget(userId: string, category: string, amount: number): void {
  const all = getBudgets(userId);
  all[category] = amount;
  localStorage.setItem(key(userId), JSON.stringify(all));
}

export function clearBudget(userId: string, category: string): void {
  const all = getBudgets(userId);
  delete all[category];
  localStorage.setItem(key(userId), JSON.stringify(all));
}

// ── Presupuestos compartidos (visibles para todos los usuarios) ──

export function getSharedBudgets(): Budgets {
  try {
    return JSON.parse(localStorage.getItem(SHARED_KEY) || '{}');
  } catch {
    return {};
  }
}

export function setSharedBudget(category: string, amount: number): void {
  const all = getSharedBudgets();
  all[category] = amount;
  localStorage.setItem(SHARED_KEY, JSON.stringify(all));
}

export function clearSharedBudget(category: string): void {
  const all = getSharedBudgets();
  delete all[category];
  localStorage.setItem(SHARED_KEY, JSON.stringify(all));
}
