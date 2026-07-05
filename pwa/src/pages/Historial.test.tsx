import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Historial } from './Historial';
import { Transaction } from '../lib/api';

function tx(overrides: Partial<Transaction>): Transaction {
  return {
    Timestamp: '2026-06-29 12:00:00',
    Fecha: '2026-06-29',
    Banco: 'Bancolombia',
    Tipo: 'Compra',
    'Monto (COP)': 10000,
    Comercio: 'Comercio de prueba',
    'Tarjeta/Cuenta': 'Tarjeta 1234',
    Categoría: 'Otro',
    ...overrides,
  };
}

const transactions: Transaction[] = [
  tx({ Timestamp: 't1', Comercio: 'Frisby',       Categoría: 'Restaurantes' }),
  tx({ Timestamp: 't2', Comercio: 'Rappi',        Categoría: 'Domicilios' }),
  tx({ Timestamp: 't3', Comercio: 'Carulla',      Categoría: 'Mercado' }),
  tx({ Timestamp: 't4', Comercio: 'Cine Colombia', Categoría: 'Entretenimiento' }),
  tx({ Timestamp: 't5', Comercio: 'Comercio Desconocido', Categoría: '' }),
  // Alias antiguo: debe agruparse bajo "Restaurantes" al filtrar
  tx({ Timestamp: 't6', Comercio: 'La Fonda',      Categoría: 'Comida' }),
];

describe('Historial — filtros por categoría', () => {
  it('muestra todas las transacciones con el filtro "Todas"', () => {
    render(<Historial transactions={transactions} loading={false} />);
    expect(screen.getByText('Frisby')).toBeInTheDocument();
    expect(screen.getByText('Rappi')).toBeInTheDocument();
    expect(screen.getByText('Carulla')).toBeInTheDocument();
    expect(screen.getByText('Cine Colombia')).toBeInTheDocument();
    expect(screen.getByText('Comercio Desconocido')).toBeInTheDocument();
    expect(screen.getByText('La Fonda')).toBeInTheDocument();
  });

  it('filtra por una categoría específica y oculta el resto', async () => {
    const user = userEvent.setup();
    render(<Historial transactions={transactions} loading={false} />);

    const chips = screen.getAllByText('Restaurantes');
    const chip = chips.find(el => el.closest('button'))!.closest('button')!;
    await user.click(chip);

    expect(screen.getByText('Frisby')).toBeInTheDocument();
    // Alias "Comida" → debe seguir apareciendo bajo el filtro "Restaurantes"
    expect(screen.getByText('La Fonda')).toBeInTheDocument();
    expect(screen.queryByText('Rappi')).not.toBeInTheDocument();
    expect(screen.queryByText('Carulla')).not.toBeInTheDocument();
    expect(screen.queryByText('Cine Colombia')).not.toBeInTheDocument();
    expect(screen.queryByText('Comercio Desconocido')).not.toBeInTheDocument();

    expect(screen.getByRole('status')).toHaveTextContent('2 resultados con filtros activos');
  });

  it('filtra "Sin categorizar" solo transacciones sin categoría', async () => {
    const user = userEvent.setup();
    render(<Historial transactions={transactions} loading={false} />);

    await user.click(screen.getByRole('button', { name: 'Sin categorizar' }));

    expect(screen.getByText('Comercio Desconocido')).toBeInTheDocument();
    expect(screen.queryByText('Frisby')).not.toBeInTheDocument();
    expect(screen.queryByText('Rappi')).not.toBeInTheDocument();
  });

  it('cambiar de categoría reemplaza el filtro anterior (no lo acumula)', async () => {
    const user = userEvent.setup();
    render(<Historial transactions={transactions} loading={false} />);

    await user.click(screen.getByRole('button', { name: 'Domicilios' }));
    expect(screen.getByText('Rappi')).toBeInTheDocument();
    expect(screen.queryByText('Frisby')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Entretenimiento' }));
    expect(screen.getByText('Cine Colombia')).toBeInTheDocument();
    expect(screen.queryByText('Rappi')).not.toBeInTheDocument();
  });

  it('combina el filtro de categoría con la búsqueda por comercio', async () => {
    const user = userEvent.setup();
    render(<Historial transactions={transactions} loading={false} />);

    await user.click(screen.getByRole('button', { name: 'Restaurantes' }));
    await user.type(screen.getByPlaceholderText('Buscar comercio...'), 'Fonda');

    expect(screen.getByText('La Fonda')).toBeInTheDocument();
    expect(screen.queryByText('Frisby')).not.toBeInTheDocument();
  });

  it('"Limpiar" resetea el filtro de categoría junto con los demás', async () => {
    const user = userEvent.setup();
    render(<Historial transactions={transactions} loading={false} />);

    await user.click(screen.getByRole('button', { name: 'Restaurantes' }));
    expect(screen.queryByText('Rappi')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Limpiar' }));

    expect(screen.getByText('Rappi')).toBeInTheDocument();
    expect(screen.getByText('Frisby')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('muestra estado vacío cuando la categoría no tiene transacciones', async () => {
    const user = userEvent.setup();
    render(<Historial transactions={transactions} loading={false} />);

    await user.click(screen.getByRole('button', { name: 'Software' }));

    expect(screen.queryByText('Frisby')).not.toBeInTheDocument();
    expect(screen.queryByText('Rappi')).not.toBeInTheDocument();
    expect(screen.getByText('Sin resultados')).toBeInTheDocument();
  });
});
