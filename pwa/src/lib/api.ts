import { WEBHOOK_URL } from './config';

export interface Transaction {
  Timestamp: string;
  Fecha: string;
  Banco: string;
  Tipo: string;
  'Monto (COP)': number;
  Comercio: string;
  'Tarjeta/Cuenta': string;
  Categoría: string;
}

export interface ManualTransaction {
  banco: string;
  tipo: string;
  monto: number;
  comercio: string;
  tarjeta?: string;
  categoria: string;
  fecha?: string;
}

export interface VoiceParsed {
  monto: number;
  comercio: string;
  categoria: string;
  banco: string;
  tipo: string;
}

export async function fetchTransactions(): Promise<Transaction[]> {
  const res = await fetch(`${WEBHOOK_URL}?action=transactions`);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Error al cargar transacciones');
  return json.data as Transaction[];
}

export async function saveTransaction(data: ManualTransaction): Promise<void> {
  const res = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ type: 'manual', ...data }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Error al guardar');
}

export async function parseVoice(text: string): Promise<VoiceParsed> {
  const res = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ type: 'voice', text }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Error al parsear voz');
  return json.data as VoiceParsed;
}

export async function askChat(question: string, context: object): Promise<string> {
  const res = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ type: 'chat', question, context }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Error al consultar el asistente');
  return json.data.answer as string;
}
