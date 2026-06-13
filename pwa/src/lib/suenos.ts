import type { Transaction } from './api';

export interface Sueno {
  id: string;
  nombre: string;
  emoji: string;
  monto: number;           // COP objetivo total
  fechaObjetivo: string;   // YYYY-MM-DD
  ahorrado: number;        // COP acumulado
  activo: boolean;
  creadoEn: string;        // ISO date
}

export interface RetoSugerido {
  titulo: string;
  descripcion: string;
  categoria: string;
  ahorroEstimado: number;      // COP/mes
  diasAdelantoEnMeta: number;
}

export interface SuenoCalculo {
  pctCompletado: number;
  ahorroMensualNecesario: number;
  mesesRestantes: number;
  diasRestantes: number;
  enPeligro: boolean;     // true si probabilidad de llegar a tiempo es < 70%
}

function key(userId: string) { return `fm_suenos_${userId}`; }

export function getSuenos(userId: string): Sueno[] {
  try {
    const raw = localStorage.getItem(key(userId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function setSuenos(userId: string, suenos: Sueno[]): void {
  localStorage.setItem(key(userId), JSON.stringify(suenos));
}

export function addSueno(
  userId: string,
  data: Omit<Sueno, 'id' | 'creadoEn' | 'ahorrado'>,
): Sueno {
  const sueno: Sueno = {
    ...data,
    id: crypto.randomUUID(),
    ahorrado: 0,
    creadoEn: new Date().toISOString().split('T')[0],
  };
  const suenos = getSuenos(userId);
  setSuenos(userId, [...suenos, sueno]);
  return sueno;
}

export function updateSueno(userId: string, id: string, changes: Partial<Sueno>): void {
  const suenos = getSuenos(userId).map(s => s.id === id ? { ...s, ...changes } : s);
  setSuenos(userId, suenos);
}

export function deleteSueno(userId: string, id: string): void {
  setSuenos(userId, getSuenos(userId).filter(s => s.id !== id));
}

export function actualizarAhorrado(userId: string, id: string, incremento: number): void {
  const suenos = getSuenos(userId).map(s =>
    s.id === id ? { ...s, ahorrado: Math.max(0, s.ahorrado + incremento) } : s,
  );
  setSuenos(userId, suenos);
}

export function calcularSueno(sueno: Sueno): SuenoCalculo {
  const hoy = new Date();
  const objetivo = new Date(sueno.fechaObjetivo);
  const msRestantes = objetivo.getTime() - hoy.getTime();
  const diasRestantes = Math.max(0, Math.ceil(msRestantes / (1000 * 60 * 60 * 24)));
  const mesesRestantes = Math.max(0, diasRestantes / 30);

  const falta = Math.max(0, sueno.monto - sueno.ahorrado);
  const pctCompletado = sueno.monto > 0 ? Math.min(1, sueno.ahorrado / sueno.monto) : 0;
  const ahorroMensualNecesario = mesesRestantes > 0 ? Math.ceil(falta / mesesRestantes) : falta;

  return {
    pctCompletado,
    ahorroMensualNecesario,
    mesesRestantes,
    diasRestantes,
    enPeligro: mesesRestantes < 1 && pctCompletado < 0.9,
  };
}

// Genera retos personalizados para acelerar el logro de un Sueño.
// Analiza el gasto histórico del usuario y sugiere reducciones específicas.
export function generarRetosParaSueno(
  sueno: Sueno,
  txs: Transaction[],
): RetoSugerido[] {
  const calc = calcularSueno(sueno);
  if (calc.ahorroMensualNecesario <= 0 || calc.mesesRestantes <= 0) return [];

  const hace3Meses = new Date();
  hace3Meses.setMonth(hace3Meses.getMonth() - 3);
  const txsRecientes = txs.filter(t => new Date(t.Fecha) >= hace3Meses);

  // Agrupar gasto por categoría
  const gastoPorCategoria: Record<string, number[]> = {};
  txsRecientes.forEach(t => {
    const cat = t.Categoría || 'Otro';
    if (!gastoPorCategoria[cat]) gastoPorCategoria[cat] = [];
    gastoPorCategoria[cat].push(t['Monto (COP)']);
  });

  // Calcular promedio mensual por categoría (3 meses de datos → dividir por 3)
  const promedioMensual: Record<string, number> = {};
  Object.entries(gastoPorCategoria).forEach(([cat, montos]) => {
    promedioMensual[cat] = montos.reduce((a, b) => a + b, 0) / 3;
  });

  // Categorías donde hay margen de reducción (excluir categorías fijas)
  const categoriasExcluidas = new Set(['Salud', 'Hogar', 'Bre-B']);
  const candidatas = Object.entries(promedioMensual)
    .filter(([cat]) => !categoriasExcluidas.has(cat) && promedioMensual[cat] > 20_000)
    .sort((a, b) => b[1] - a[1]); // mayor gasto primero

  const retos: RetoSugerido[] = [];

  for (const [cat, promedio] of candidatas) {
    // Sugerir reducción del 30% como objetivo realista
    const reduccion = Math.round(promedio * 0.30);
    if (reduccion < 10_000) continue; // no vale la pena si es muy poco

    const diasAvance = Math.round(
      (reduccion / calc.ahorroMensualNecesario) * calc.mesesRestantes * 30,
    );
    if (diasAvance < 3) continue;

    const titulo = `Reducir ${cat} ${formatCOP(reduccion)}/mes`;
    const descripcion = `Llegas ${diasAvance} días antes a tu ${sueno.nombre}`;

    retos.push({ titulo, descripcion, categoria: cat, ahorroEstimado: reduccion, diasAdelantoEnMeta: diasAvance });

    if (retos.length >= 5) break;
  }

  // Ordenar por impacto (mayor avance primero)
  return retos.sort((a, b) => b.diasAdelantoEnMeta - a.diasAdelantoEnMeta);
}

function formatCOP(monto: number): string {
  if (monto >= 1_000_000) return `$${(monto / 1_000_000).toFixed(1)}M`;
  if (monto >= 1_000) return `$${Math.round(monto / 1_000)}K`;
  return `$${monto}`;
}
