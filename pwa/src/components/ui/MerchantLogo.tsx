import { useState } from 'react';
import { Icon, categoryIcon, type IconName } from './icons';

interface Props {
  domain: string | null;
  name: string;
  size?: number;
  color: string;
  /** Categoría de la transacción — define el ícono Lucide de fallback. */
  category?: string;
  /** Override directo del ícono de fallback (gana sobre `category`). */
  fallbackIcon?: IconName;
}

function getSources(domain: string): string[] {
  return [
    `https://logo.clearbit.com/${domain}?size=80`,
    `https://www.google.com/s2/favicons?domain=${domain}&sz=64`,
  ];
}

export function MerchantLogo({ domain, name, size = 38, color, category, fallbackIcon }: Props) {
  const [srcIndex, setSrcIndex] = useState(0);
  const sources = domain ? getSources(domain) : [];
  const src = sources[srcIndex];
  const icon: IconName = fallbackIcon ?? (category ? categoryIcon(category) : 'receipt');

  return (
    <div style={{
      position: 'relative',
      width: size,
      height: size,
      borderRadius: Math.round(size * 0.325),
      flexShrink: 0,
      background: src ? '#fff' : 'var(--surface)',
      border: src ? '1px solid var(--line)' : '1px solid var(--line)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: color,
      overflow: 'hidden',
    }}>
      {src ? (
        <img
          src={src}
          alt={name}
          onError={() => setSrcIndex(i => i + 1)}
          style={{ width: '76%', height: '76%', objectFit: 'contain' }}
        />
      ) : (
        <Icon name={icon} size={Math.round(size * 0.5)} />
      )}
    </div>
  );
}
