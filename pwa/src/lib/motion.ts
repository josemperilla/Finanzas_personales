import { Transition } from 'framer-motion';

export const softSpring: Transition = {
  type: 'spring',
  stiffness: 420,
  damping: 34,
  mass: 0.9,
};

export const quickEase: Transition = {
  duration: 0.22,
  ease: [0.22, 1, 0.36, 1],
};

export const pageVariants = {
  initial: { opacity: 0, y: 8, scale: 0.997 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -5, scale: 0.997 },
};

export const staggerContainer = {
  animate: {
    transition: {
      staggerChildren: 0.055,
      delayChildren: 0.04,
    },
  },
};

export const riseItem = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
};

export const overlayVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

export const sheetVariants = {
  initial: { opacity: 0.98, y: '100%' },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0.98, y: '100%' },
};

export const popVariants = {
  initial: { opacity: 0, scale: 0.96, y: 8 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.98, y: 4 },
};
