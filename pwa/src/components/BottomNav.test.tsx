import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef } from 'react';
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

// ── Regresión: hide/show por scroll (fix de acumulación de delta) ──────────
//
// Antes del fix, `lastScrollTop` se reasignaba al valor actual en CADA evento de
// scroll, sin importar si se había cruzado el threshold. Eso significaba que un
// scroll lento y continuo (pocos px por frame, como en trackpads/inercia de iOS)
// nunca acumulaba suficiente delta para cruzar SCROLL_THRESHOLD (10px) y la barra
// jamás se ocultaba/mostraba. El fix solo mueve el ancla cuando se cruza el
// threshold, permitiendo que el delta se acumule entre frames.
//
// Estos tests montan un contenedor con scroll real (jsdom soporta asignar
// `scrollTop` y disparar el evento 'scroll') y esperan a que el rAF interno del
// handler (coalescing de eventos por frame) y la animación de framer-motion
// completen antes de aserta sobre la presencia del <nav>.
function ScrollHarness({ hasAnomaly }: { hasAnomaly?: boolean }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  return (
    <div>
      <div ref={scrollRef} data-testid="scroller" style={{ height: 200, overflow: 'auto' }}>
        <div style={{ height: 2000 }} />
      </div>
      <BottomNav active="home" onChange={() => {}} scrollRef={scrollRef} hasAnomaly={hasAnomaly} />
    </div>
  );
}

async function nextFrame() {
  await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
}

function scrollTo(el: HTMLElement, top: number) {
  el.scrollTop = top;
  el.dispatchEvent(new Event('scroll'));
}

describe('BottomNav — hide/show por scroll', () => {
  it('permanece visible en el tope (scrollTop 0)', async () => {
    render(<ScrollHarness />);
    expect(screen.getByRole('navigation')).toBeInTheDocument();
  });

  it('se oculta tras un scroll hacia abajo que cruza el threshold', async () => {
    render(<ScrollHarness />);
    const el = screen.getByTestId('scroller');

    scrollTo(el, 50);
    await nextFrame();

    await waitFor(() => {
      expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    });
  });

  it('regresión: acumula pasos de scroll pequeños y continuos hasta cruzar el threshold', async () => {
    render(<ScrollHarness />);
    const el = screen.getByTestId('scroller');

    // 4 incrementos de 3px (12px en total) — ninguno individualmente > SCROLL_THRESHOLD (10).
    // Con el bug original, el ancla se resetea cada frame y esto nunca ocultaría el nav.
    for (const top of [3, 6, 9, 12]) {
      scrollTo(el, top);
      await nextFrame();
    }

    await waitFor(() => {
      expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    });
  });

  it('reaparece al volver al tope (scrollTop <= 0) sin importar el estado previo', async () => {
    render(<ScrollHarness />);
    const el = screen.getByTestId('scroller');

    scrollTo(el, 50);
    await nextFrame();
    await waitFor(() => {
      expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    });

    scrollTo(el, 0);
    await nextFrame();
    await waitFor(() => {
      expect(screen.getByRole('navigation')).toBeInTheDocument();
    });
  });

  it('reaparece al hacer scroll hacia arriba más allá del threshold', async () => {
    render(<ScrollHarness />);
    const el = screen.getByTestId('scroller');

    scrollTo(el, 100);
    await nextFrame();
    await waitFor(() => {
      expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    });

    scrollTo(el, 80); // -20px desde el ancla (100) → cruza el threshold hacia arriba
    await nextFrame();
    await waitFor(() => {
      expect(screen.getByRole('navigation')).toBeInTheDocument();
    });
  });
});
