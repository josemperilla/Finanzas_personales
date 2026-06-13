import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ActionButton, PageHeader, StatusToast } from './primitives';

describe('UI primitives', () => {
  it('renders a semantic page title', () => {
    render(<PageHeader eyebrow="Registro" title="Historial" />);
    expect(screen.getByRole('heading', { name: 'Historial' })).toBeInTheDocument();
    expect(screen.getByText('Registro')).toBeInTheDocument();
  });

  it('exposes busy button state and blocks interaction', async () => {
    const user = userEvent.setup();
    let calls = 0;
    render(<ActionButton busy onClick={() => calls++}>Guardar</ActionButton>);
    const button = screen.getByRole('button', { name: 'Guardar' });
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toBeDisabled();
    await user.click(button);
    expect(calls).toBe(0);
  });

  it('announces toast feedback', () => {
    render(<StatusToast message="Transacción guardada" />);
    expect(screen.getByRole('status')).toHaveTextContent('Transacción guardada');
  });
});
