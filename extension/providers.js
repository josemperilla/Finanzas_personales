// Mapa dominio del portal → providerId del catálogo (pwa/src/lib/providers.ts).
// Mantener en sync con PROVIDERS cuando se agreguen portales.
const PROVIDER_DOMAINS = [
  { host: 'acueducto.com.co',  providerId: 'acueducto-bogota', nombre: 'Acueducto de Bogotá' },
  { host: 'grupovanti.com',    providerId: 'vanti',            nombre: 'Vanti' },
  { host: 'vanti.com.co',      providerId: 'vanti',            nombre: 'Vanti' },
  { host: 'enel.com',          providerId: 'enel-codensa',     nombre: 'Enel Codensa' },
  { host: 'etb.com',           providerId: 'etb',              nombre: 'ETB' },
  { host: 'epm.com.co',        providerId: 'epm',              nombre: 'EPM' },
  { host: 'celsia.com',        providerId: 'celsia',           nombre: 'Celsia' },
  { host: 'emcali.com.co',     providerId: 'emcali-energia',   nombre: 'Emcali' },
  { host: 'aaa.com.co',        providerId: 'triple-a',         nombre: 'Triple A' },
  { host: 'acuacar.com',       providerId: 'acuacar',          nombre: 'Aguas de Cartagena' },
  { host: 'surtigas.com.co',   providerId: 'surtigas',         nombre: 'Surtigas' },
  { host: 'gascaribe.com',     providerId: 'gases-caribe',     nombre: 'Gases del Caribe' },
  { host: 'claro.com.co',      providerId: 'claro',            nombre: 'Claro' },
  { host: 'movistar.co',       providerId: 'movistar',         nombre: 'Movistar' },
  { host: 'tigo.com.co',       providerId: 'tigo',             nombre: 'Tigo' },
];

function detectProvider(hostname) {
  const h = String(hostname || '').toLowerCase();
  return PROVIDER_DOMAINS.find(p => h.indexOf(p.host) !== -1) || null;
}
