import { Transaction } from './api';
import { cleanMerchant } from './merchantCleaner';
import { isIncomeCategory } from './config';

export function exportToCSV(transactions: Transaction[], filename = 'gastos.csv'): void {
  const headers = ['Fecha', 'Comercio', 'Banco', 'Tipo', 'Monto (COP)', 'Categoría', 'Tarjeta/Cuenta'];

  const escape = (s: string) => `"${String(s || '').replace(/"/g, '""')}"`;

  const rows = transactions.map(tx => [
    tx.Fecha || tx.Timestamp || '',
    escape(cleanMerchant(tx.Comercio) || tx.Comercio || ''),
    tx.Banco || '',
    tx.Tipo || '',
    String(isIncomeCategory(tx.Categoría) ? (tx['Monto (COP)'] || 0) : -(tx['Monto (COP)'] || 0)),
    tx.Categoría || '',
    escape(tx['Tarjeta/Cuenta'] || ''),
  ]);

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const file = new File([blob], filename, { type: 'text/csv' });

  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    navigator.share({ files: [file] }).catch(() => downloadFallback(blob, filename));
  } else {
    downloadFallback(blob, filename);
  }
}

export function exportToJSON(transactions: Transaction[], filename = 'backup.json'): void {
  const data = transactions.map(tx => ({
    fecha: tx.Fecha || tx.Timestamp || '',
    comercio: cleanMerchant(tx.Comercio) || tx.Comercio || '',
    banco: tx.Banco || '',
    tipo: tx.Tipo || '',
    monto: tx['Monto (COP)'] || 0,
    categoria: tx.Categoría || '',
    tarjeta: tx['Tarjeta/Cuenta'] || '',
    nota: tx.Nota || '',
  }));
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  downloadFallback(blob, filename);
}

function downloadFallback(blob: Blob, filename: string): void {
  const reader = new FileReader();
  reader.onload = ev => {
    const a = document.createElement('a');
    a.href = ev.target?.result as string;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => document.body.removeChild(a), 500);
  };
  reader.readAsDataURL(blob);
}
