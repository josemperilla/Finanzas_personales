const KEY = 'fm_budgets';

export type Budgets = Record<string, number>;

export function getBudgets(): Budgets {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
}

export function setBudget(category: string, amount: number): void {
  const all = getBudgets();
  all[category] = amount;
  localStorage.setItem(KEY, JSON.stringify(all));
}

export function clearBudget(category: string): void {
  const all = getBudgets();
  delete all[category];
  localStorage.setItem(KEY, JSON.stringify(all));
}
