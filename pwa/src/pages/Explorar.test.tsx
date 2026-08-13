import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Explorar } from './Explorar';
import type { Transaction } from '../lib/api';

// QA de los filtros de banco en la pestaña Insights. Cubre los tres bugs
// reportados: (1) colapsar variantes "Itaú"/"Bogotá" → "Banco de Bogotá",
// (2) no generar chip "Otro", (3) ocultar los widgets globales al filtrar.
// No requiere backend: HAS_WEBHOOK_URL es false en test → el useEffect que
// llama a fetchAnalytics/fetchCards no corre, y los chips salen del prop
// `transactions`.

function makeTx(Banco: string): Transaction {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const fecha = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} 12:00:00`;
  return {
    Timestamp: fecha,
    Fecha: fecha,
    Banco,
    Tipo: 'Compra',
    'Monto (COP)': 10000,
    Comercio: 'Comercio prueba',
    'Tarjeta/Cuenta': '1234',
    Categoría: 'Comida',
    Fuente: 'manual',
  };
}

// Variantes de nombre que deben colapsar + un banco "Otro" que NO debe salir
// como chip (solo se ve bajo "Todos").
const transactions: Transaction[] = [
  makeTx('Itaú'),
  makeTx('Bogotá'),
  makeTx('Banco de Bogotá'),
  makeTx('AV Villas'),
  makeTx('Ave Villas'),
  makeTx('Davivienda'),
  makeTx('Otro'),
];

function chipLabels(): string[] {
  // Los chips de banco viven junto al botón "Comparar"; sus textos son el
  // nombre canónico del banco (o "Todos").
  return screen.getAllByRole('button').map(b => (b.textContent || '').trim());
}

describe('Explorar — filtros de banco (Insights)', () => {
  it('colapsa variantes (Itaú/Bogotá → Banco de Bogotá) y omite el chip "Otro"', () => {
    render(<Explorar transactions={transactions} loading={false} userId="qa" />);

    const chips = chipLabels();
    expect(chips).toContain('Todos');
    expect(chips.filter(c => c === 'Banco de Bogotá')).toHaveLength(1); // Itaú + Bogotá + Banco de Bogotá → 1
    expect(chips.filter(c => c === 'AV Villas')).toHaveLength(1);       // AV Villas + Ave Villas → 1
    expect(chips).toContain('Davivienda');
    expect(chips).not.toContain('Otro');       // botón eliminado a pedido
    expect(chips).not.toContain('Itaú');       // colapsado en Banco de Bogotá
    expect(chips).not.toContain('Bogotá');     // colapsado en Banco de Bogotá
    expect(chips).not.toContain('Ave Villas'); // colapsado en AV Villas
  });

  it('muestra el Health Score en "Todos" y lo oculta al filtrar por un banco', async () => {
    const user = userEvent.setup();
    render(<Explorar transactions={transactions} loading={false} userId="qa" />);

    // Con "Todos" el Health Score (widget global) sí se renderiza.
    expect(screen.getByText(/Salud financiera/)).toBeInTheDocument();

    // Al seleccionar un banco, los widgets globales se ocultan (showGlobal=false).
    await user.click(screen.getByRole('button', { name: 'Banco de Bogotá' }));
    expect(screen.queryByText(/Salud financiera/)).not.toBeInTheDocument();
  });
});
