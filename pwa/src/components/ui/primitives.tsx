import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { AnimatePresence, motion, type HTMLMotionProps } from 'framer-motion';
import { quickEase, softSpring } from '../../lib/motion';

export function PageHeader({ eyebrow, title, action }: {
  eyebrow?: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <header style={{
      display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16,
      padding: 'max(20px, env(safe-area-inset-top)) 20px 14px',
    }}>
      <div>
        {eyebrow && <div style={{ color: 'var(--muted)', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 2 }}>{eyebrow}</div>}
        <h1 style={{ margin: 0, color: 'var(--ink)', fontFamily: 'var(--font-display)', fontSize: 'var(--text-2xl)', letterSpacing: '-0.025em' }}>{title}</h1>
      </div>
      {action}
    </header>
  );
}

export function Card({ children, style, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className="ui-card" style={style} {...props}>{children}</div>;
}

type ActionButtonProps = Omit<HTMLMotionProps<'button'>, 'children'> & {
  children?: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  busy?: boolean;
};

export const ActionButton = forwardRef<HTMLButtonElement, ActionButtonProps>(
  ({ variant = 'primary', busy, children, disabled, style, ...props }, ref) => {
    const palette = {
      primary: { background: 'var(--grad-orange)', color: '#fff', border: '1px solid transparent', shadow: '0 8px 20px rgba(234,88,12,.35)' },
      secondary: { background: 'var(--blue-50)', color: 'var(--blue)', border: '1px solid var(--blue-100)', shadow: 'none' },
      ghost: { background: 'transparent', color: 'var(--ink-2)', border: '1px solid var(--line)', shadow: 'none' },
      danger: { background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid color-mix(in srgb, var(--danger) 20%, transparent)', shadow: 'none' },
    }[variant];
    return (
      <motion.button
        ref={ref}
        whileTap={!disabled && !busy ? { scale: 0.97 } : undefined}
        transition={softSpring}
        disabled={disabled || busy}
        aria-busy={busy}
        style={{
          minHeight: 'var(--touch-min)', borderRadius: 16, padding: '0 20px',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '-0.01em',
          cursor: disabled || busy ? 'default' : 'pointer',
          opacity: disabled ? 0.55 : 1, boxShadow: palette.shadow,
          background: palette.background, color: palette.color, border: palette.border,
          ...style,
        }}
        {...props}
      >
        {busy && <Spinner />}
        {children}
      </motion.button>
    );
  },
);
ActionButton.displayName = 'ActionButton';

export function Spinner({ size = 16 }: { size?: number }) {
  return <span aria-hidden="true" style={{ width: size, height: size, borderRadius: '50%', border: '2px solid currentColor', borderRightColor: 'transparent', animation: 'spin .75s linear infinite' }} />;
}

export function Skeleton({ height = 16, radius = 12, style }: { height?: number | string; radius?: number; style?: React.CSSProperties }) {
  return <div aria-hidden="true" style={{
    height, borderRadius: radius,
    background: 'linear-gradient(90deg, var(--line) 25%, color-mix(in srgb, var(--line) 55%, var(--card)) 50%, var(--line) 75%)',
    backgroundSize: '200% 100%', animation: 'shimmer 1.8s ease-in-out infinite', ...style,
  }} />;
}

export function StatusToast({ message, tone = 'success' }: { message: string | null; tone?: 'success' | 'danger' | 'warning' }) {
  const colors = tone === 'success'
    ? ['var(--success-bg)', 'var(--success)']
    : tone === 'danger'
      ? ['var(--danger-bg)', 'var(--danger)']
      : ['var(--warning-bg)', 'var(--warning)'];
  return (
    <AnimatePresence>
      {message && (
        <motion.div
          role="status"
          aria-live="polite"
          initial={{ opacity: 0, y: 18, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10 }}
          transition={quickEase}
          style={{
            position: 'fixed', left: 16, right: 16,
            bottom: 'calc(92px + env(safe-area-inset-bottom))', zIndex: 'var(--z-toast)',
            maxWidth: 440, margin: '0 auto', padding: '13px 16px', borderRadius: 'var(--r-md)',
            background: colors[0], color: colors[1], boxShadow: 'var(--shadow-float)',
            fontSize: 13.5, fontWeight: 700, textAlign: 'center',
          }}
        >
          {message}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
