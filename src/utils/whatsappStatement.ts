/**
 * Estado de cuenta para compartir por WhatsApp.
 *
 * Reglas (semanas de LUNES a SÁBADO):
 *  - Deuda = pedidos pendientes (y los liquidados con 'abono', que se pagan con abonos).
 *    Los pedidos cobrados al momento (efectivo/yape) no son deuda y no se muestran.
 *  - Todo lo recibido del cliente (abonos, "Cancelo DP", "Cancelo DA", saldos) se aplica
 *    del pedido MÁS ANTIGUO al más nuevo. Las semanas pagadas por completo no se muestran
 *    (ni sus abonos).
 *  - Si se comparte en SÁBADO (o domingo): se detallan "Semana pasada" y "Esta semana";
 *    lo anterior se junta en "Cuenta pasada" (solo el monto que sigue debiendo).
 *  - Si se comparte de LUNES a VIERNES: se detallan "Semana antepasada" y "Semana pasada"
 *    (la semana en curso aún no cierra) más lo consumido esta semana; lo anterior va a
 *    "Cuenta pasada".
 *  - La sección de abonos solo aparece cuando un abono dejó una semana detallada pagada
 *    a medias (muestra cuánto dejó).
 */
import type { ConsumptionRecord, PaymentRecord } from '../types';

export interface StatementInput {
  clientName: string;
  consumptions: ConsumptionRecord[]; // del cliente
  payments: PaymentRecord[]; // del cliente
  /** Fecha en que se comparte (YYYY-MM-DD). */
  today: string;
}

const cents = (n: number) => Math.round((Number(n) || 0) * 100);
const money = (c: number) => `S/ ${(c / 100).toFixed(2)}`;
const ddmm = (date: string) => date.split('-').slice(1).reverse().join('/');

/** Fecha (YYYY-MM-DD) desplazada `days` días, sin problemas de zona horaria. */
const addDays = (date: string, days: number): string => {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
};
/** 0 = domingo … 6 = sábado */
const weekday = (date: string): number => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};
/** Lunes de la semana de `date` (el domingo pertenece a la semana que termina ese sábado). */
export const mondayOf = (date: string): string => {
  const dow = weekday(date);
  return addDays(date, dow === 0 ? -6 : 1 - dow);
};

const describeConsumption = (c: ConsumptionRecord): string => {
  const lunches = c.lunches
    .map((l) => {
      const name = l.menuType === 'menu_completo' ? 'Menú Completo' : 'Segundo Solo';
      const loc = l.clientType === 'mesa' ? ' (Mesa)' : '';
      return `${l.quantity}x ${name}${loc}`;
    })
    .join(', ');
  const extras = c.extras.map((e) => `${e.quantity}x ${e.name}`).join(', ');
  return [lunches, extras].filter(Boolean).join(' + ') || 'Consumo';
};

type SectionKey = 'pasada_acumulada' | 'antepasada' | 'pasada' | 'actual';

const SECTION_TITLE: Record<Exclude<SectionKey, 'pasada_acumulada'>, string> = {
  antepasada: 'SEMANA ANTEPASADA',
  pasada: 'SEMANA PASADA',
  actual: 'ESTA SEMANA',
};

export interface StatementResult {
  message: string;
  saldoCents: number;
}

export function buildWeeklyStatement({ clientName, consumptions, payments, today }: StatementInput): StatementResult {
  // 1) Deuda y pagos hasta hoy, en orden cronológico
  const debts = consumptions
    .filter((c) => c.date <= today)
    .filter((c) => c.paymentStatus === 'pendiente' || (c.paymentMethod as string) === 'abono')
    .filter((c) => cents(c.total) > 0)
    .sort((a, b) => a.date.localeCompare(b.date) || a.timestamp.localeCompare(b.timestamp));
  const pays = payments
    .filter((p) => p.date <= today && cents(p.amount) > 0)
    .sort((a, b) => a.date.localeCompare(b.date) || a.timestamp.localeCompare(b.timestamp));

  // 2) Semanas que se detallan según el día en que se comparte
  const dow = weekday(today);
  const weekClosed = dow === 6 || dow === 0; // sábado o domingo
  const thisMonday = mondayOf(today);
  const sectionMondays: Partial<Record<SectionKey, string>> = weekClosed
    ? { pasada: addDays(thisMonday, -7), actual: thisMonday }
    : { antepasada: addDays(thisMonday, -14), pasada: addDays(thisMonday, -7), actual: thisMonday };
  const firstDetailedMonday = weekClosed ? addDays(thisMonday, -7) : addDays(thisMonday, -14);

  const sectionOf = (date: string): SectionKey => {
    const m = mondayOf(date);
    if (m < firstDetailedMonday) return 'pasada_acumulada';
    if (m === sectionMondays.antepasada) return 'antepasada';
    if (m === sectionMondays.pasada) return 'pasada';
    return 'actual';
  };

  // 3) Aplicar los pagos del más antiguo al más nuevo (FIFO), registrando a qué semana va cada sol
  const remaining = debts.map((d) => cents(d.total));
  let di = 0;
  type Applied = { payment: PaymentRecord; byMonday: Map<string, number> };
  const applied: Applied[] = [];
  let creditCents = 0;
  for (const p of pays) {
    let left = cents(p.amount);
    const byMonday = new Map<string, number>();
    while (left > 0 && di < debts.length) {
      const take = Math.min(left, remaining[di]);
      remaining[di] -= take;
      left -= take;
      const m = mondayOf(debts[di].date);
      byMonday.set(m, (byMonday.get(m) || 0) + take);
      if (remaining[di] === 0) di++;
    }
    creditCents += left; // pagó de más (adelanto)
    applied.push({ payment: p, byMonday });
  }

  // 4) Semanas: total, lo que sigue debiendo y si se muestran
  const weeks = new Map<string, { gross: number; open: number; items: ConsumptionRecord[] }>();
  debts.forEach((d, i) => {
    const m = mondayOf(d.date);
    const w = weeks.get(m) || { gross: 0, open: 0, items: [] };
    w.gross += cents(d.total);
    w.open += remaining[i];
    w.items.push(d);
    weeks.set(m, w);
  });
  const openWeeks = [...weeks.entries()].filter(([, w]) => w.open > 0).sort(([a], [b]) => a.localeCompare(b));

  const cuentaPasada = openWeeks
    .filter(([m]) => sectionOf(m) === 'pasada_acumulada')
    .reduce((s, [, w]) => s + w.open, 0);
  const detailed = openWeeks.filter(([m]) => sectionOf(m) !== 'pasada_acumulada');
  const detailedMondays = new Set(detailed.map(([m]) => m));
  const saldo = openWeeks.reduce((s, [, w]) => s + w.open, 0);

  // 5) Abonos que pagaron en parte alguna semana detallada (para mostrar cuánto dejó)
  const abonoLines = applied
    .map(({ payment, byMonday }) => {
      const toDetailed = [...byMonday.entries()]
        .filter(([m]) => detailedMondays.has(m))
        .reduce((s, [, v]) => s + v, 0);
      return { payment, toDetailed };
    })
    .filter((a) => a.toDetailed > 0);
  const abonosTotal = abonoLines.reduce((s, a) => s + a.toDetailed, 0);

  // 6) Mensaje
  let msg = `*FUENTE DE SODA CRISS* 🍽️\n`;
  msg += `*ESTADO DE CUENTA - ${clientName.toUpperCase()}*\n`;
  msg += `📅 *Fecha:* ${ddmm(today)}/${today.slice(0, 4)}\n`;
  msg += `--------------------------------\n`;

  if (saldo === 0) {
    msg += `✅ *No tiene deuda pendiente.*\n`;
    if (creditCents > 0) msg += `💚 *Saldo a favor:* ${money(creditCents)}\n`;
    msg += `\n_¡Muchas gracias por su preferencia! Fuente de Soda Criss._`;
    return { message: msg, saldoCents: 0 };
  }

  if (cuentaPasada > 0) {
    msg += `🗂️ *CUENTA PASADA:* ${money(cuentaPasada)}\n`;
    msg += `--------------------------------\n`;
  }

  for (const [m, w] of detailed) {
    const key = sectionOf(m) as Exclude<SectionKey, 'pasada_acumulada'>;
    msg += `*${SECTION_TITLE[key]}* (${ddmm(m)} al ${ddmm(addDays(m, 5))})\n`;
    w.items.forEach((c) => {
      msg += `• ${c.dayOfWeek} ${ddmm(c.date)}: ${describeConsumption(c)} -> *${money(cents(c.total))}*\n`;
    });
    msg += `_Subtotal: ${money(w.gross)}_\n`;
    msg += `--------------------------------\n`;
  }

  if (abonoLines.length > 0) {
    msg += `*ABONOS A CUENTA:*\n`;
    abonoLines.forEach(({ payment: p, toDetailed }) => {
      const partial = toDetailed < cents(p.amount) ? ` (de un pago de ${money(cents(p.amount))})` : '';
      msg += `✅ ${p.dayOfWeek} ${ddmm(p.date)}: ${money(toDetailed)} (${p.method.toUpperCase()})${partial}\n`;
    });
    msg += `_Total abonado: ${money(abonosTotal)}_\n`;
    msg += `--------------------------------\n`;
  }

  msg += `⚠️ *SALDO PENDIENTE: ${money(saldo)}*\n\n`;
  msg += `_¡Muchas gracias por su preferencia! Fuente de Soda Criss._`;
  return { message: msg, saldoCents: saldo };
}
