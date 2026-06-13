import { Transaction } from './api';
import { cleanMerchant } from './merchantCleaner';

export function buildContext(txs: Transaction[]) {
  if (txs.length === 0) return { message: 'No hay transacciones disponibles.' };

  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 6);
  const base = txs.filter(tx => {
    const d = new Date((tx.Fecha || tx.Timestamp || '').replace(' ', 'T'));
    return !isNaN(d.getTime()) && d >= cutoff;
  });
  const used = base.length > 0 ? base : txs;

  const total = used.reduce((s, tx) => s + Number(tx['Monto (COP)'] || 0), 0);

  const byCat: Record<string, { total: number; count: number }> = {};
  for (const tx of used) {
    const cat = tx.Categoría || 'Otro';
    if (!byCat[cat]) byCat[cat] = { total: 0, count: 0 };
    byCat[cat].total += Number(tx['Monto (COP)'] || 0);
    byCat[cat].count += 1;
  }

  const byMerchantPerCat: Record<string, Record<string, { monto: number; count: number }>> = {};
  for (const tx of used) {
    const cat = tx.Categoría || 'Otro';
    const name = cleanMerchant(tx.Comercio) || tx.Tipo || 'Sin nombre';
    if (!byMerchantPerCat[cat]) byMerchantPerCat[cat] = {};
    if (!byMerchantPerCat[cat][name]) byMerchantPerCat[cat][name] = { monto: 0, count: 0 };
    byMerchantPerCat[cat][name].monto += Number(tx['Monto (COP)'] || 0);
    byMerchantPerCat[cat][name].count += 1;
  }
  const comerciosPorCategoria: Record<string, { comercio: string; monto: number; compras: number }[]> = {};
  for (const cat of Object.keys(byMerchantPerCat)) {
    comerciosPorCategoria[cat] = Object.entries(byMerchantPerCat[cat])
      .sort(([, a], [, b]) => b.monto - a.monto)
      .map(([comercio, { monto, count }]) => ({ comercio, monto: Math.round(monto), compras: count }));
  }

  const byMerchant: Record<string, { amount: number; count: number }> = {};
  for (const tx of used) {
    const name = cleanMerchant(tx.Comercio) || tx.Tipo;
    if (!byMerchant[name]) byMerchant[name] = { amount: 0, count: 0 };
    byMerchant[name].amount += Number(tx['Monto (COP)'] || 0);
    byMerchant[name].count += 1;
  }
  const topComerciosMonto = Object.entries(byMerchant)
    .sort(([, a], [, b]) => b.amount - a.amount).slice(0, 15)
    .map(([nombre, { amount, count }]) => ({ nombre, monto: Math.round(amount), compras: count }));
  const topComerciosFrecuencia = Object.entries(byMerchant)
    .sort(([, a], [, b]) => b.count - a.count).slice(0, 15)
    .map(([nombre, { amount, count }]) => ({ nombre, monto: Math.round(amount), compras: count }));

  const byMonth: Record<string, number> = {};
  for (const tx of used) {
    const key = (tx.Fecha || tx.Timestamp || '').slice(0, 7);
    if (key) byMonth[key] = (byMonth[key] || 0) + Number(tx['Monto (COP)'] || 0);
  }

  const dows = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const byDow: Record<string, number> = {};
  for (const tx of used) {
    const d = new Date((tx.Fecha || tx.Timestamp || '').replace(' ', 'T'));
    if (!isNaN(d.getTime())) {
      const dow = dows[d.getDay()];
      byDow[dow] = (byDow[dow] || 0) + Number(tx['Monto (COP)'] || 0);
    }
  }

  const transacciones = [...used]
    .sort((a, b) => {
      const da = new Date((a.Fecha || a.Timestamp || '').replace(' ', 'T'));
      const db = new Date((b.Fecha || b.Timestamp || '').replace(' ', 'T'));
      return db.getTime() - da.getTime();
    })
    .slice(0, 30)
    .map(tx => ({
      fecha: (tx.Fecha || tx.Timestamp || '').slice(0, 10),
      comercio: cleanMerchant(tx.Comercio) || tx.Tipo || '',
      monto: Math.round(Number(tx['Monto (COP)'] || 0)),
      categoria: tx.Categoría || 'Otro',
    }));

  return {
    periodo: '6 meses recientes',
    totalTransacciones: used.length,
    totalGastado: Math.round(total),
    ticketPromedio: used.length > 0 ? Math.round(total / used.length) : 0,
    gastoPorMes: Object.entries(byMonth).sort(([a], [b]) => a.localeCompare(b))
      .map(([mes, monto]) => ({ mes, monto: Math.round(monto) })),
    gastoPorCategoria: Object.entries(byCat).sort(([, a], [, b]) => b.total - a.total)
      .map(([cat, { total: t, count: c }]) => ({ categoria: cat, total: Math.round(t), compras: c })),
    comerciosPorCategoria,
    topComerciosMonto,
    topComerciosFrecuencia,
    gastoPorDiaSemana: Object.entries(byDow).sort(([, a], [, b]) => b - a)
      .map(([dia, monto]) => ({ dia, monto: Math.round(monto) })),
    transacciones,
  };
}
