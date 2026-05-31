import { useId } from 'react';

interface Props {
  size?: number;
  look?: 'happy' | 'sad';
}

export function Fino({ size = 96, look = 'happy' }: Props) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" style={{ display: 'block' }}>
      <defs>
        <radialGradient id={`coin-${id}`} cx="38%" cy="32%" r="80%">
          <stop offset="0%" stopColor="#ffc785" />
          <stop offset="45%" stopColor="#fb923c" />
          <stop offset="100%" stopColor="#f97316" />
        </radialGradient>
        <linearGradient id={`rim-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffd9b0" />
          <stop offset="100%" stopColor="#ea580c" />
        </linearGradient>
      </defs>
      <ellipse cx="50" cy="92" rx="28" ry="5" fill="#0f172a" opacity="0.10" />
      <circle cx="50" cy="48" r="42" fill={`url(#rim-${id})`} />
      <circle cx="50" cy="48" r="37" fill={`url(#coin-${id})`} />
      <circle cx="50" cy="48" r="31" stroke="#fff" strokeOpacity="0.45" strokeWidth="2" />
      <ellipse cx="38" cy="34" rx="11" ry="7" fill="#fff" opacity="0.35" transform="rotate(-25 38 34)" />
      <circle cx="40" cy="46" r="4.4" fill="#11295f" />
      <circle cx="60" cy="46" r="4.4" fill="#11295f" />
      <circle cx="41.4" cy="44.6" r="1.5" fill="#fff" />
      <circle cx="61.4" cy="44.6" r="1.5" fill="#fff" />
      <circle cx="32" cy="55" r="3.6" fill="#ef5b1c" opacity="0.35" />
      <circle cx="68" cy="55" r="3.6" fill="#ef5b1c" opacity="0.35" />
      {look === 'happy'
        ? <path d="M41 57 Q50 66 59 57" stroke="#11295f" strokeWidth="3" strokeLinecap="round" fill="none" />
        : <path d="M42 60 Q50 56 58 60" stroke="#11295f" strokeWidth="3" strokeLinecap="round" fill="none" />}
    </svg>
  );
}
