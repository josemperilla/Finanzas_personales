type BlobVariant = 'a' | 'b' | 'blue';

interface BlobDef {
  t: number;
  l: number;
  s: number;
  c: string;
}

const BLOB_SETS: Record<BlobVariant, BlobDef[]> = {
  a: [
    { t: -60, l: -50, s: 220, c: 'radial-gradient(circle at 30% 30%, #dbeafe, #93c5fd00)' },
    { t: 280, l: 230, s: 200, c: 'radial-gradient(circle at 30% 30%, #ffedd5, #fdba7400)' },
  ],
  b: [
    { t: -40, l: 200, s: 200, c: 'radial-gradient(circle at 30% 30%, #fde3c4, #fb923c00)' },
    { t: 420, l: -70, s: 220, c: 'radial-gradient(circle at 30% 30%, #dbeafe, #60a5fa00)' },
  ],
  blue: [
    { t: -80, l: -60, s: 300, c: 'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.18), transparent 70%)' },
    { t: 300, l: 180, s: 260, c: 'radial-gradient(circle at 30% 30%, rgba(249,115,22,0.45), transparent 70%)' },
  ],
};

export function Blobs({ variant = 'a' }: { variant?: BlobVariant }) {
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      {BLOB_SETS[variant].map((b, i) => (
        <div key={i} style={{
          position: 'absolute', top: b.t, left: b.l, width: b.s, height: b.s,
          borderRadius: '50%', background: b.c, filter: 'blur(8px)',
        }} />
      ))}
    </div>
  );
}
