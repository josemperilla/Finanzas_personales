import { useState } from 'react';

interface Props {
  domain: string | null;
  name: string;
  size?: number;
  color: string;
}

function getSources(domain: string): string[] {
  return [
    `https://logo.clearbit.com/${domain}?size=80`,
    `https://www.google.com/s2/favicons?domain=${domain}&sz=64`,
  ];
}

export function MerchantLogo({ domain, name, size = 38, color }: Props) {
  const [srcIndex, setSrcIndex] = useState(0);
  const sources = domain ? getSources(domain) : [];
  const src = sources[srcIndex];

  return (
    <div style={{
      width: size,
      height: size,
      borderRadius: Math.round(size * 0.29),
      flexShrink: 0,
      background: src ? '#fff' : color,
      border: src ? '1px solid var(--line)' : 'none',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#fff',
      fontFamily: 'var(--font-display)',
      fontWeight: 700,
      fontSize: Math.round(size * 0.39),
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
        name.charAt(0).toUpperCase()
      )}
    </div>
  );
}
