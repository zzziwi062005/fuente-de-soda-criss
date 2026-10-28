import { ConsumptionRecord, PaymentMethod, PaymentRecord } from '../types';
import { mondayOf } from './whatsappStatement';

/**
 * Libro de cuentas semanales.
 *
 * Deuda de un cliente semanal = pedidos − pagos. Cada pago (abono) se reparte entre los
 * pedidos para saber qué quedó pagado y pintarlo de verde:
 *   1. Pago de un pedido o de un día (id `pay-sem-<idPedido>-<n>`): cubre ese pedido.
 *   2. "Cancelo DA": cubre los pedidos de la semana en que se registró.
 *   3. El resto (abonos, "Cancelo DP" y lo que sobre de 1 y 2): del pedido más antiguo al
 *      más nuevo. Lo que sobra al final es saldo a favor.
 * Pedidos marcados como pagados en efectivo/Yape sin abono (forma antigua): no son deuda.
 * Si hay un abono que les corresponde (el "Abono transferido de cuenta diaria" de ese día) o
 * sobra plata, ese abono se usa en ellos en vez de quedar como saldo a favor.
 */

export type CoverageState = 'directo' | 'pagado' | 'abono' | 'parcial' | 'pendiente';

export interface ConsumptionCoverage {
  remaining: number; // S/ que falta pagar de este pedido
  covered: number; // S/ cubiertos por pagos
  state: CoverageState;
  linkedMethod?: PaymentMethod; // método del pago hecho para este pedido
}

export interface WeeklyLedger {
  coverage: Map<string, ConsumptionCoverage>;
  allocations: Map<string, { consumptionId: string; amount: number }[]>; // por pago
  debt: number;
  credit: number;
}

const LINK_RE = /^pay-sem-(.+)-\d+$/;

/** Id del pedido al que pertenece un pago hecho desde un pedido/día semanal (o null). */
export const linkedConsumptionId = (paymentId: string): string | null => {
  const m = paymentId.match(LINK_RE);
  return m ? m[1] : null;
};

export const linkedPaymentId = (consumptionId: string, suffix: string | number): string =>
  `pay-sem-${consumptionId}-${suffix}`;

/** Pedido pagado al instante sin registrar abono (forma antigua): no cuenta como deuda. */
export const isDirectlyPaid = (c: ConsumptionRecord): boolean =>
  c.paymentStatus === 'pagado' && c.paymentMethod !== 'abono';

export const isDaPaymentRecord = (p: PaymentRecord): boolean =>
  Boolean(p.isDaPayment || (p.notes && (p.notes.includes('DA') || p.notes.toLowerCase().includes('deuda actual'))));

const toCents = (n: number) => Math.round((Number(n) || 0) * 100);

const addDays = (date: string, days: number): string => {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
};

const byTime = <T extends { date: string; timestamp: string }>(a: T, b: T) =>
  a.date.localeCompare(b.date) || (a.timestamp || '').localeCompare(b.timestamp || '');

const TRANSFER_DATE_RE = /\((\d{4}-\d{2}-\d{2})\)/;

export function buildWeeklyLedger(consumptions: ConsumptionRecord[], payments: PaymentRecord[]): WeeklyLedger {
  const valid = consumptions.filter((c) => toCents(c.total) > 0);
  const owed = valid.filter((c) => !isDirectlyPaid(c)).sort(byTime);
  const direct = valid.filter((c) => isDirectlyPaid(c)).sort(byTime);
  // Los pagados al instante van al final: solo reciben abonos que les corresponden o que sobran
  const debts = [...owed, ...direct];
  const rem = new Map<string, number>(debts.map((c) => [c.id, toCents(c.total)]));
  const allocations = new Map<string, { consumptionId: string; amount: number }[]>();
  const linkedMethods = new Map<string, PaymentMethod>();

  const apply = (p: PaymentRecord, targets: ConsumptionRecord[], available: number): number => {
    let left = available;
    for (const c of targets) {
      if (left <= 0) break;
      const r = rem.get(c.id) || 0;
      if (r <= 0) continue;
      const used = Math.min(r, left);
      rem.set(c.id, r - used);
      left -= used;
      const list = allocations.get(p.id) || [];
      list.push({ consumptionId: c.id, amount: used / 100 });
      allocations.set(p.id, list);
    }
    return left;
  };

  const sortedPays = [...payments].filter((p) => toCents(p.amount) > 0).sort(byTime);
  const pool: { p: PaymentRecord; left: number }[] = [];

  // Abonos transferidos de cuenta diaria: corresponden al pedido pagado de esa fecha y monto
  const transferLinks = new Map<string, ConsumptionRecord>();
  const usedDirect = new Set<string>();
  sortedPays.forEach((p) => {
    if (!p.id.startsWith('pay-trans-')) return;
    const m = (p.notes || '').match(TRANSFER_DATE_RE);
    if (!m) return;
    const match = direct.find(
      (c) => !usedDirect.has(c.id) && c.date === m[1] && toCents(c.total) === toCents(p.amount)
    );
    if (match) {
      usedDirect.add(match.id);
      transferLinks.set(p.id, match);
    }
  });

  // 1. Pagos de un pedido o día
  // 2. Cancelo DA: pedidos de la semana del pago
  sortedPays.forEach((p) => {
    const linkedId = linkedConsumptionId(p.id);
    const linked = linkedId ? debts.find((c) => c.id === linkedId) : transferLinks.get(p.id);
    if (linked) {
      if (linkedId) linkedMethods.set(linked.id, p.method);
      pool.push({ p, left: apply(p, [linked], toCents(p.amount)) });
    } else if (isDaPaymentRecord(p)) {
      const monday = mondayOf(p.date);
      const sunday = addDays(monday, 6);
      const week = debts.filter((c) => c.date >= monday && c.date <= sunday);
      pool.push({ p, left: apply(p, week, toCents(p.amount)) });
    } else {
      pool.push({ p, left: toCents(p.amount) });
    }
  });

  // 3. Lo demás, del pedido más antiguo al más nuevo
  let credit = 0;
  pool.forEach(({ p, left }) => {
    credit += apply(p, debts, left);
  });

  const coverage = new Map<string, ConsumptionCoverage>();
  consumptions.forEach((c) => {
    if (isDirectlyPaid(c)) {
      coverage.set(c.id, { remaining: 0, covered: c.total, state: 'directo' });
      return;
    }
    const total = toCents(c.total);
    const r = rem.get(c.id) ?? total;
    const linkedMethod = linkedMethods.get(c.id);
    let state: CoverageState;
    if (total <= 0 || r <= 0) state = linkedMethod ? 'pagado' : 'abono';
    else if (r < total) state = 'parcial';
    else state = 'pendiente';
    coverage.set(c.id, { remaining: r / 100, covered: (total - r) / 100, state, linkedMethod });
  });

  const debtCents = owed.reduce((s, c) => s + (rem.get(c.id) || 0), 0);
  return { coverage, allocations, debt: debtCents / 100, credit: credit / 100 };
}
