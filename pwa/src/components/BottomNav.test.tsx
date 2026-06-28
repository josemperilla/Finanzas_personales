import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BottomNav, type Tab } from './BottomNav';

describe('BottomNav', () => {
  it('marks the current destination and changes tabs', async () => {
    const user = userEvent.setup();
    let selected: Tab | undefined;
    render(<BottomNav active="home" onChange={tab => { selected = tab; }} />);

    expect(screen.getByRole('button', { name: 'Inicio' })).toHaveAttribute('aria-current', 'page');
    await user.click(screen.getByRole('button', { name: 'Facturas' }));
    expect(selected).toBe('facturas');
  });

  it('announces anomalies on the insights tab', () => {
    render(<BottomNav active="home" onChange={() => {}} hasAnomaly />);
    expect(screen.getByRole('button', { name: 'Insights — gasto inusual detectado' })).toBeInTheDocument();
  });
});
