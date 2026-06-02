const NOISE_PATTERNS: RegExp[] = [
  /^(compra en|pago pse|pago en l[ií]nea|compra internet|pago en|compra|pago)\s+/i,
  /\b(bogot[aá]|medell[ií]n|cali|barranquilla|bucaramanga|pereira|armenia|manizales|cartagena)\b/gi,
  /\*[a-z0-9_\-]+/gi,
  /\b[0-9]{4,}\b/g,
  /\b\d{2}\/\d{2}(\/\d{2,4})?\b/g,
  /\s{2,}/g,
];

const BRAND_RULES: { pattern: RegExp; canonical: string }[] = [
  // Pagos genéricos sin comercio identificable
  { pattern: /^payu\s+pagosonline$/i, canonical: '' },
  { pattern: /bre-?b/i, canonical: 'Transferencia por Bre-B' },

  // Apps de domicilios y transporte
  { pattern: /rappi/i, canonical: 'Rappi' },
  { pattern: /\buber\b/i, canonical: 'Uber' },
  { pattern: /\bdidi\b/i, canonical: 'DiDi' },
  { pattern: /cabify/i, canonical: 'Cabify' },
  { pattern: /tembici/i, canonical: 'Tembici' },
  { pattern: /taxis?\s*libres/i, canonical: 'Taxis Libres' },

  // E-commerce & suscripciones digitales
  { pattern: /amazon/i, canonical: 'Amazon' },
  { pattern: /mercado\s*libre/i, canonical: 'MercadoLibre' },
  { pattern: /apple\.com/i, canonical: 'Apple' },
  { pattern: /netflix/i, canonical: 'Netflix' },
  { pattern: /spotify/i, canonical: 'Spotify' },
  { pattern: /airbnb/i, canonical: 'Airbnb' },
  { pattern: /booking\.com/i, canonical: 'Booking.com' },
  { pattern: /new\s*york\s*times/i, canonical: 'New York Times' },
  { pattern: /youtube/i, canonical: 'YouTube' },
  { pattern: /google/i, canonical: 'Google' },
  { pattern: /\bclaude\b/i, canonical: 'Claude' },
  { pattern: /openai/i, canonical: 'OpenAI' },

  // Viajes
  { pattern: /latam/i, canonical: 'LATAM Airlines' },
  { pattern: /avianca/i, canonical: 'Avianca' },
  { pattern: /despegar/i, canonical: 'Despegar' },

  // Retail & moda
  { pattern: /temu/i, canonical: 'Temu' },
  { pattern: /falabella/i, canonical: 'Falabella' },
  { pattern: /shein/i, canonical: 'SHEIN' },
  { pattern: /adidas/i, canonical: 'Adidas' },
  { pattern: /arturo\s*calle/i, canonical: 'Arturo Calle' },
  { pattern: /pasarela\s*colombia/i, canonical: 'Pasarela Colombia' },

  // Supermercados & farmacias
  { pattern: /farmatodo/i, canonical: 'Farmatodo' },
  { pattern: /carulla/i, canonical: 'Carulla' },
  { pattern: /\bexito\b|éxito/i, canonical: 'Éxito' },
  { pattern: /tienda\s+d1\b/i, canonical: 'Tiendas D1' },
  { pattern: /tiendas?\s*ara\b/i, canonical: 'Tiendas Ara' },
  { pattern: /\bmetro\b/i, canonical: 'Metro' },

  // Entretenimiento
  { pattern: /cine\s*colombia|cinecolombia/i, canonical: 'Cine Colombia' },
  { pattern: /\bcine\b/i, canonical: 'Cine' },

  // Restaurantes & cafés
  { pattern: /osaki/i, canonical: 'Osaki' },
  { pattern: /\bonza\b/i, canonical: 'Onza' },
  { pattern: /central\s*cevicher[ií]a/i, canonical: 'Central Cevichería' },
  { pattern: /la\s*palma\s*y\s*el\s*tuc[aá]n|la\s*palma\s*y\s*el\s*t$/i, canonical: 'La Palma y El Tucán' },
  { pattern: /fruteria\s*la\s*cal/i, canonical: 'Frutería La Cal' },
  { pattern: /suculenta/i, canonical: 'Suculenta' },
  { pattern: /el\s*bandido/i, canonical: 'El Bandido Bistro' },
  { pattern: /casa\s*bel[eé]n/i, canonical: 'Casa Belén' },
  { pattern: /mao\s*licores/i, canonical: 'Mao Licores' },
  { pattern: /hin\s*chin/i, canonical: 'Hin Chin Glu Glu' },
  { pattern: /mr\.?\s*bum/i, canonical: 'Mr. Bum' },
  { pattern: /eyd\s*caf[eé]/i, canonical: 'EYD Cafés' },
  { pattern: /panaderia\s*arbol/i, canonical: 'Panadería Árbol del Pan' },
  { pattern: /cafe\s*18\b/i, canonical: 'Café 18' },
  { pattern: /el\s*mar\s*res/i, canonical: 'El Mar' },
  { pattern: /izakaya/i, canonical: 'Wok Izakaya' },
  { pattern: /restaurante\s*wok/i, canonical: 'Wok' },
  { pattern: /orso/i, canonical: 'Orso Heladería' },

  // Servicios & fitness
  { pattern: /bodytech/i, canonical: 'Bodytech' },
  { pattern: /club\s*los\s*lagartos/i, canonical: 'Club Los Lagartos' },
  { pattern: /park\s*elite/i, canonical: 'Park Elite' },
  { pattern: /hf\s*peluquer[ií]a/i, canonical: 'HF Peluquería' },

  // Libros & cultura
  { pattern: /librer[ií]a\s*nacional/i, canonical: 'Librería Nacional' },
];

function toTitleCase(s: string): string {
  return s.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

export function cleanMerchant(raw: string | undefined | null): string {
  // Return '' (not '—') so callers can do: cleanMerchant(x) || tx.Tipo
  if (!raw) return '';
  let s = raw.trim();

  // Strip payment aggregator prefixes — these are acquirers, not merchants.
  // DLO/DL = Davivienda gateway; SumUp = card terminal aggregator
  s = s.replace(/^(?:bold|vault|pyu|payu|dlo|dl|sumup)\*\s*/i, '').trim();
  // Mercado Pago: strip regardless of separator (*, space, or end-of-string)
  s = s.replace(/^mercado\s*pago[\s*]*/i, '').trim();

  // Brand normalization (run before noise stripping to preserve brand keywords)
  for (const { pattern, canonical } of BRAND_RULES) {
    if (pattern.test(s)) return canonical;
  }

  // Strip noise
  for (const re of NOISE_PATTERNS) {
    s = s.replace(re, ' ');
  }
  s = s.replace(/\s+/g, ' ').trim();

  // Do NOT fall back to raw — if nothing meaningful survived stripping
  // (e.g. input was just "MERCADO PAGO"), return '' so the caller can
  // fall back to tx.Tipo ("Compra", "Débito", etc.)
  return toTitleCase(s).slice(0, 40);
}
