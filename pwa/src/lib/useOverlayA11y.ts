import { RefObject, useEffect } from 'react';

export function useOverlayA11y<T extends HTMLElement>(
  open: boolean,
  onClose?: () => void,
  containerRef?: RefObject<T>,
) {
  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    const previousActive = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';

    const frame = requestAnimationFrame(() => {
      const first = containerRef?.current?.querySelector<HTMLElement>(
        '[autofocus], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      first?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && onClose) onClose();
    };
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
      previousActive?.focus();
    };
  }, [containerRef, onClose, open]);
}
