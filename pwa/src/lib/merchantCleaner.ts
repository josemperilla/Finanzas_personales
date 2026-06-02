const NOISE_PATTERNS: RegExp[] = [
  /^(compra en|pago pse|pago en l[ií]nea|compra internet|pago en|compra|pago)\s+/i,
  /\b(bogot[aá]|medell[ií]n|cali|barranquilla|bucaramanga|pereira|armenia|manizales|cartagena)\b/gi,
  /\*[a-z0-9_\-]+/gi,
  /\b[0-9]{4,}\b/g,
  /\b\d{2}\/\d{2}(\/\d{2,4})?\b/g,
  /\s{2,}/g,
];

const BRAND_RULES: { pattern: RegExp; canonical: string }[] = [
  { pattern: /rappi/i, canonical: 'Rappi' },
  { pattern: /\buber\b/i, canonical: 'Uber' },
  { pattern: /\bdidi\b/i, canonical: 'DiDi' },
  { pattern: /amazon/i, canonical: 'Amazon' },
  { pattern: /mercado\s*libre/i, canonical: 'MercadoLibre' },
  { pattern: /apple\.com/i, canonical: 'Apple' },
  { pattern: /netflix/i, canonical: 'Netflix' },
  { pattern: /spotify/i, canonical: 'Spotify' },
  { pattern: /airbnb/i, canonical: 'Airbnb' },
  { pattern: /booking\.com/i, canonical: 'Booking.com' },
  { pattern: /latam/i, canonical: 'LATAM Airlines' },
  { pattern: /avianca/i, canonical: 'Avianca' },
  { pattern: /taxis\s*libres/i, canonical: 'Taxis Libres' },
  { pattern: /cabify/i, canonical: 'Cabify' },
  { pattern: /temu/i, canonical: 'Temu' },
  { pattern: /falabella/i, canonical: 'Falabella' },
  { pattern: /shein/i, canonical: 'SHEIN' },
  { pattern: /farmatodo/i, canonical: 'Farmatodo' },
  { pattern: /carulla/i, canonical: 'Carulla' },
  { pattern: /\bexito\b|éxito/i, canonical: 'Éxito' },
  { pattern: /cine\s*colombia|cinecolombia/i, canonical: 'Cine Colombia' },
  { pattern: /\bcine\b/i, canonical: 'Cine' },
  { pattern: /adidas/i, canonical: 'Adidas' },
  { pattern: /tienda\s+d1\b/i, canonical: 'Tiendas D1' },
  { pattern: /tembici/i, canonical: 'Tembici' },
  { pattern: /club\s*los\s*lagartos/i, canonical: 'Club Los Lagartos' },
  { pattern: /osaki/i, canonical: 'Osaki' },
  { pattern: /new\s*york\s*times/i, canonical: 'New York Times' },
  { pattern: /youtube/i, canonical: 'YouTube' },
  { pattern: /google/i, canonical: 'Google' },
  { pattern: /despegar/i, canonical: 'Despegar' },
];

function toTitleCase(s: string): string {
  return s.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

export function cleanMerchant(raw: string | undefined | null): string {
  if (!raw) return '—';
  let s = raw.trim();

  // Strip payment aggregator prefixes (BOLD*, VAULT*, PayU*, Mercado Pago)
  // Mercado Pago is an acquirer in Colombia, not a merchant — strip it regardless of separator
  s = s.replace(/^(?:bold|vault|pyu|payu)\*\s*/i, '').trim();
  s = s.replace(/^mercado\s*pago[\s*]*/i, '').trim();

  // Brand normalization (before stripping noise that might remove the brand keyword)
  for (const { pattern, canonical } of BRAND_RULES) {
    if (pattern.test(s)) return canonical;
  }

  // Strip noise
  for (const re of NOISE_PATTERNS) {
    s = s.replace(re, ' ');
  }
  s = s.replace(/\s+/g, ' ').trim();

  return toTitleCase(s).slice(0, 40) || raw.slice(0, 40);
}
