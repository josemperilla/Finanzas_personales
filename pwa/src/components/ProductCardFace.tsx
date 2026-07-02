import { Card } from '../lib/api';

interface Props {
  card: Card;
  compact?: boolean;
}

export function ProductCardFace({ card, compact = false }: Props) {
  const bank = card.banco.toLowerCase();
  const chassis = card.chasis.toLowerCase();
  const isAvVillas = bank.includes('av villas');
  const isBogota = bank.includes('bogot');
  const isItau = bank.includes('ita');
  const isSavings = chassis.includes('ahorros') || chassis.includes('cuenta');
  const imageSrc = getProductImage(card);

  if (imageSrc) {
    const needsLast4Overlay = isItau;
    return (
      <div style={{
        position: 'relative',
        width: compact ? 116 : 'min(100%, 360px)',
        aspectRatio: '1.585',
        borderRadius: compact ? 12 : 18,
        overflow: 'hidden',
        background: '#050505',
        boxShadow: compact ? '0 8px 18px rgba(16,18,28,.14)' : '0 16px 34px rgba(16,18,28,.18)',
        flexShrink: 0,
      }}>
        <img
          src={imageSrc}
          alt={`${card.alias || card.banco} terminada en ${card.ultimos4}`}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: 'center',
          }}
        />
        {needsLast4Overlay && (
          <div style={{
            position: 'absolute',
            left: compact ? 10 : 24,
            bottom: compact ? 8 : 18,
            padding: compact ? '2px 6px' : '3px 10px',
            borderRadius: compact ? 6 : 9,
            background: 'rgba(0,0,0,.74)',
            color: '#fff',
            fontFamily: 'var(--font-mono)',
            fontSize: compact ? 10 : 20,
            lineHeight: 1.1,
            letterSpacing: compact ? '.04em' : '.08em',
            textShadow: '0 1px 2px rgba(0,0,0,.45)',
            backdropFilter: 'blur(3px)',
            WebkitBackdropFilter: 'blur(3px)',
          }}>
            •••• {card.ultimos4}
          </div>
        )}
      </div>
    );
  }

  const surface = isSavings
    ? {
        background: 'linear-gradient(135deg,#f36f21 0%,#ffb000 46%,#f6f7fb 47%,#ffffff 100%)',
        color: '#1f2937',
      }
    : isAvVillas
      ? { background: '#050505', color: '#ffffff' }
      : isBogota
        ? {
            background: 'radial-gradient(circle at 50% 78%,#2aa7ff 0%,#153f87 34%,#0a1838 68%,#050812 100%)',
            color: '#ffffff',
          }
        : isItau
          ? {
              background: 'linear-gradient(135deg,#ff7a00 0%,#f2b705 44%,#0f172a 45%,#050816 100%)',
              color: '#ffffff',
            }
          : {
              background: 'linear-gradient(135deg,var(--blue-700),var(--blue-500))',
              color: '#ffffff',
            };

  return (
    <div style={{
      ...surface,
      position: 'relative',
      width: compact ? 116 : 'min(100%, 360px)',
      aspectRatio: '1.585',
      borderRadius: compact ? 12 : 18,
      overflow: 'hidden',
      boxShadow: compact ? '0 8px 18px rgba(16,18,28,.14)' : '0 16px 34px rgba(16,18,28,.18)',
      padding: compact ? 9 : 18,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      flexShrink: 0,
    }}>
      {isAvVillas && (
        <div style={{
          position: 'absolute', inset: 0, opacity: .38,
          backgroundImage: [
            'radial-gradient(ellipse at 20% 30%, transparent 0 22%, rgba(255,255,255,.45) 23%, transparent 24%)',
            'radial-gradient(ellipse at 70% 40%, transparent 0 28%, rgba(255,255,255,.35) 29%, transparent 30%)',
            'radial-gradient(ellipse at 44% 78%, transparent 0 32%, rgba(255,255,255,.32) 33%, transparent 34%)',
          ].join(','),
          backgroundSize: compact ? '90px 70px, 115px 80px, 130px 90px' : '150px 110px, 190px 130px, 210px 150px',
        }} />
      )}
      {isBogota && (
        <div style={{
          position: 'absolute', inset: 0, opacity: .42,
          backgroundImage: 'radial-gradient(#fff 1px, transparent 1px), linear-gradient(95deg,transparent 0 48%,rgba(255,255,255,.65) 50%,transparent 54%)',
          backgroundSize: compact ? '16px 16px, 100% 100%' : '22px 22px, 100% 100%',
        }} />
      )}
      <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <div>
          <div style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 850,
            fontSize: compact ? 9 : isBogota ? 19 : 17,
            lineHeight: 1,
          }}>
            {isAvVillas ? 'AV Villas' : isBogota ? 'Banco de Bogotá' : isItau ? 'Itaú' : card.banco}
          </div>
          {!compact && (
            <div style={{ marginTop: 8, fontSize: 10, fontWeight: 700, opacity: .78, textTransform: 'uppercase', letterSpacing: '.08em' }}>
              {isSavings ? 'Cuenta de ahorros' : card.alias || card.chasis || 'Tarjeta'}
            </div>
          )}
        </div>
        {!isSavings && !compact && (
          <div style={{ textAlign: 'right', fontWeight: 800, fontSize: 16, lineHeight: 1.05, opacity: .96, whiteSpace: 'pre-line' }}>
            {isAvVillas ? 'avianca\nlifemiles' : isBogota ? 'LATAM\nPASS' : 'Black'}
          </div>
        )}
      </div>

      <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          {!compact && <div style={{ fontSize: 26, lineHeight: 1, marginBottom: 24, opacity: .96 }}>))))</div>}
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: compact ? 11 : 19, letterSpacing: '.08em' }}>
            •••• {card.ultimos4}
          </div>
        </div>
        {!isSavings ? (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: 'Arial Black, var(--font-display)', fontStyle: 'italic', fontSize: compact ? 15 : 32, lineHeight: 1, fontWeight: 900 }}>
              VISA
            </div>
            {!compact && <div style={{ fontSize: 13, fontWeight: 500, opacity: .9 }}>{card.chasis || 'Signature'}</div>}
          </div>
        ) : (
          <div style={{
            width: compact ? 24 : 52,
            height: compact ? 16 : 34,
            borderRadius: compact ? 4 : 8,
            background: 'linear-gradient(135deg,#d8b45b,#fff2a8 45%,#b88a2e)',
            boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.12)',
          }} />
        )}
      </div>
    </div>
  );
}

function getProductImage(card: Card): string | null {
  const bank = card.banco.toLowerCase();
  const last4 = card.ultimos4;
  if (bank.includes('bogot') && last4 === '8645') return '/products/bogota-latam-8645.png';
  if (bank.includes('av villas') && last4 === '3403') return '/products/avvillas-lifemiles-3403.png';
  if (bank.includes('ita') && last4 === '8439') return '/products/itau-black-8439.png';
  return null;
}
