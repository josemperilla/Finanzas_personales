import { Transaction } from './api';
import { cleanMerchant } from './merchantCleaner';

export function exportToCSV(transactions: Transaction[], filename = 'gastos.csv'): void {
  const headers = ['Fecha', 'Comercio', 'Banco', 'Tipo', 'Monto (COP)', 'Categoría', 'Tarjeta/Cuenta'];

  const escape = (s: string) => `"${String(s || '').replace(/"/g, '""')}"`;

  const rows = transactions.map(tx => [
    tx.Fecha || tx.Timestamp || '',
    escape(cleanMerchant(tx.Comercio) || tx.Comercio || ''),
    tx.Banco || '',
    tx.Tipo || '',
    String(tx['Monto (COP)'] || 0),
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

function downloadFallback(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
}
