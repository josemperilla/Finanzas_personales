const DOMAINS: Record<string, string> = {
  rappi: 'rappi.com',
  'uber eats': 'ubereats.com',
  ubereats: 'ubereats.com',
  uber: 'uber.com',
  netflix: 'netflix.com',
  spotify: 'spotify.com',
  youtube: 'youtube.com',
  amazon: 'amazon.com',
  'mercado libre': 'mercadolibre.com',
  mercadolibre: 'mercadolibre.com',
  apple: 'apple.com',
  airbnb: 'airbnb.com',
  google: 'google.com',
  microsoft: 'microsoft.com',
  disney: 'disneyplus.com',
  'hbo max': 'max.com',
  hbomax: 'max.com',
  hbo: 'hbo.com',
  'mc donalds': 'mcdonalds.com',
  mcdonalds: 'mcdonalds.com',
  "mcdonald's": 'mcdonalds.com',
  'burger king': 'burgerking.com',
  subway: 'subway.com',
  kfc: 'kfc.com',
  'crepes & waffles': 'crepesywaffles.com',
  'crepes waffles': 'crepesywaffles.com',
  jumbo: 'jumbo.com.co',
  'almacenes exito': 'exito.com',
  'almacenes éxito': 'exito.com',
  éxito: 'exito.com',
  exito: 'exito.com',
  merqueo: 'merqueo.com',
  cabify: 'cabify.com',
  didi: 'didiglobal.com',
  tembici: 'tembici.com.br',
  adobe: 'adobe.com',
  canva: 'canva.com',
  notion: 'notion.so',
  'new york times': 'nytimes.com',
  'nytimes': 'nytimes.com',
  homecenter: 'homecenter.com.co',
  falabella: 'falabella.com',
  samsung: 'samsung.com',
  'tiendas d1': 'd1.com.co',
  d1: 'd1.com.co',
  'prime video': 'primevideo.com',
  'amazon prime': 'primevideo.com',
  compensar: 'compensar.com',
  colsubsidio: 'colsubsidio.com',
  'transmilenio': 'transmilenio.gov.co',
  avianca: 'avianca.com',
  latam: 'latam.com',
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
