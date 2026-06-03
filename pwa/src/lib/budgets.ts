export type Budgets = Record<string, number>;

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
