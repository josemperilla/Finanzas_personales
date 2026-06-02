const DOMAINS: Record<string, string> = {
  // ── Delivery & Ride-sharing ─────────────────────────────────────────────
  rappi: 'rappi.com',
  'uber eats': 'ubereats.com',
  ubereats: 'ubereats.com',
  uber: 'uber.com',
  cabify: 'cabify.com',
  didi: 'didiglobal.com',
  'taxis libres': 'taxislibres.com.co',
  taxislibres: 'taxislibres.com.co',
  indriver: 'indriver.com',
  'in driver': 'indriver.com',
  beat: 'thebeat.co',
  tembici: 'tembici.com.br',

  // ── Streaming & Suscripciones ───────────────────────────────────────────
  netflix: 'netflix.com',
  spotify: 'spotify.com',
  youtube: 'youtube.com',
  disney: 'disneyplus.com',
  'disney plus': 'disneyplus.com',
  'hbo max': 'max.com',
  hbomax: 'max.com',
  hbo: 'hbo.com',
  'prime video': 'primevideo.com',
  'amazon prime': 'primevideo.com',
  'apple tv': 'apple.com',

  // ── Big Tech ────────────────────────────────────────────────────────────
  google: 'google.com',
  apple: 'apple.com',
  'apple.com': 'apple.com',
  microsoft: 'microsoft.com',
  amazon: 'amazon.com',
  meta: 'meta.com',
  anthropic: 'anthropic.com',
  claude: 'claude.ai',
  openai: 'openai.com',
  chatgpt: 'openai.com',
  deepseek: 'deepseek.com',
  mistral: 'mistral.ai',
  samsung: 'samsung.com',
  adobe: 'adobe.com',
  canva: 'canva.com',
  notion: 'notion.so',
  dropbox: 'dropbox.com',
  github: 'github.com',
  zoom: 'zoom.us',
  slack: 'slack.com',
  linkedin: 'linkedin.com',
  paypal: 'paypal.com',

  // ── E-commerce ──────────────────────────────────────────────────────────
  'mercado libre': 'mercadolibre.com',
  mercadolibre: 'mercadolibre.com',
  temu: 'temu.com',
  shein: 'shein.com',
  aliexpress: 'aliexpress.com',
  linio: 'linio.com.co',

  // ── Supermercados & Retail Colombia ─────────────────────────────────────
  éxito: 'exito.com',
  exito: 'exito.com',
  'almacenes exito': 'exito.com',
  'almacenes éxito': 'exito.com',
  carulla: 'carulla.com',
  jumbo: 'jumbo.com.co',
  metro: 'metro.com.co',
  merqueo: 'merqueo.com',
  alkosto: 'alkosto.com',
  ktronix: 'ktronix.com',
  homecenter: 'homecenter.com.co',
  falabella: 'falabella.com',
  pricesmart: 'pricesmart.com',
  'tiendas d1': 'd1.com.co',
  d1: 'd1.com.co',
  'tiendas ara': 'tiendas-ara.com',
  ara: 'tiendas-ara.com',
  farmatodo: 'farmatodo.com',
  colsubsidio: 'colsubsidio.com',
  compensar: 'compensar.com',
  flamingo: 'flamingo.com.co',

  // ── Moda & Ropa ─────────────────────────────────────────────────────────
  'arturo calle': 'arturocalle.com',
  zara: 'zara.com',
  'h&m': 'hm.com',
  'studio f': 'studiof.com',
  adidas: 'adidas.com',
  nike: 'nike.com',
  reebok: 'reebok.com',
  decathlon: 'decathlon.com.co',
  'pull&bear': 'pullandbear.com',
  bershka: 'bershka.com',
  stradivarius: 'stradivarius.com',
  forever21: 'forever21.com',

  // ── Restaurantes & Cafés ─────────────────────────────────────────────────
  'juan valdez': 'juanvaldezcafe.com',
  'juan valdez cafe': 'juanvaldezcafe.com',
  starbucks: 'starbucks.com',
  'el corral': 'elcorral.com.co',
  'burger king': 'burgerking.com',
  "mcdonald's": 'mcdonalds.com',
  mcdonalds: 'mcdonalds.com',
  'mc donalds': 'mcdonalds.com',
  'dominos': 'dominos.com',
  "domino's": 'dominos.com',
  'pizza hut': 'pizzahut.com',
  subway: 'subway.com',
  kfc: 'kfc.com',
  'crepes & waffles': 'crepesywaffles.com',
  'crepes waffles': 'crepesywaffles.com',
  wok: 'wok.com.co',
  'wok izakaya': 'wok.com.co',
  osaki: 'osaki.com.co',
  'orso heladería': 'orso.com.co',
  orso: 'orso.com.co',
  'la palma y el tucan': 'lapalmayeltucan.com',
  'la palma y el tucán': 'lapalmayeltucan.com',
  'central cevicheria': 'centralcevicheria.com',
  'el bandido bistro': 'elbandido.com.co',

  // ── Telecomunicaciones Colombia ──────────────────────────────────────────
  claro: 'claro.com.co',
  movistar: 'movistar.com.co',
  tigo: 'tigo.com.co',
  directv: 'directv.com.co',

  // ── Fintech & Bancos ─────────────────────────────────────────────────────
  nequi: 'nequi.com',
  daviplata: 'daviplata.com',
  bancolombia: 'bancolombia.com',
  davivienda: 'davivienda.com',
  'bbva': 'bbva.com.co',
  colpatria: 'scotiabankcol.com',

  // ── Viajes ──────────────────────────────────────────────────────────────
  airbnb: 'airbnb.com',
  'booking.com': 'booking.com',
  booking: 'booking.com',
  despegar: 'despegar.com',
  latam: 'latam.com',
  avianca: 'avianca.com',

  // ── Entretenimiento & Cultura ────────────────────────────────────────────
  'cine colombia': 'cinecolombia.com',
  cinecolombia: 'cinecolombia.com',
  'new york times': 'nytimes.com',
  nytimes: 'nytimes.com',

  // ── Fitness ──────────────────────────────────────────────────────────────
  bodytech: 'bodytech.com.co',

  // ── Libros & cultura ────────────────────────────────────────────────────
  'librería nacional': 'librerianacional.com',
  'libreria nacional': 'librerianacional.com',

  // ── Otros ───────────────────────────────────────────────────────────────
  transmilenio: 'transmilenio.gov.co',
  'club los lagartos': 'clubloslagartos.com',
  'new balance': 'newbalance.com',
};

export function getMerchantDomain(name: string): string | null {
  if (!name) return null;
  const lower = name.toLowerCase().trim();
  if (DOMAINS[lower]) return DOMAINS[lower];
  for (const [key, domain] of Object.entries(DOMAINS)) {
    if (lower.includes(key)) return domain;
  }
  return null;
}
