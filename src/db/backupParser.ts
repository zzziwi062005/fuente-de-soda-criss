/**
 * Lectura y normalización de respaldos JSON (formato v2 de la app y variantes
 * antiguas: solo consumos, solo clientes, solo catálogo de extras).
 *
 * Lógica extraída sin cambios de comportamiento de la antigua
 * `importFullBackup` de IndexedDB, salvo:
 *  - el catálogo de respaldo ya no se lee de localStorage, se recibe como parámetro;
 *  - los abonos conservan `isDpPayment` / `isDaPayment`.
 */
import {
  ClientRecord,
  ConsumptionRecord,
  PaymentRecord,
  MesaCounterRecord,
  ExtraItem,
  DayOfWeek,
  normalizePiso,
} from '../types';
import { INITIAL_EXTRAS } from '../data/initialData';
import { getDayOfWeekName, getTodayDateString } from '../utils/dates';

export interface BackupCollections {
  clients: ClientRecord[];
  consumptions: ConsumptionRecord[];
  payments: PaymentRecord[];
  mesaRecords: MesaCounterRecord[];
  extras: ExtraItem[];
}

/** Devuelve las colecciones normalizadas, o null si el JSON no tiene un formato reconocible. Lanza si el JSON es inválido. */
export function parseBackup(jsonStr: string, fallbackExtras: ExtraItem[] = []): BackupCollections | null {
  const parsed = JSON.parse(jsonStr);
  let newClients: ClientRecord[] = [];
  let newConsumptions: ConsumptionRecord[] = [];
  let newPayments: PaymentRecord[] = [];
  let newMesaRecords: MesaCounterRecord[] = [];
  let newExtras: ExtraItem[] = [];

  // Helper to capture any unique extra items that exist inside order lines
  const collectFromOrderExtras = (orderExtras: any[]) => {
    if (!Array.isArray(orderExtras)) return;
    for (const oe of orderExtras) {
      if (!oe) continue;
      const name = String(oe.name || oe.nombre || '').trim();
      if (!name) continue;
      const id = String(oe.extraId || oe.id || `ext-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`);
      const price = Number(oe.price !== undefined ? oe.price : (oe.precio !== undefined ? oe.precio : 0)) || 0;
      const exists = newExtras.some(
        (ex) => ex.id === id || ex.name.trim().toLowerCase() === name.toLowerCase()
      );
      if (!exists) {
        newExtras.push({
          id,
          name,
          description: oe.description || oe.descripcion || '',
          price,
          category: (oe.category as any) || 'bebida',
        });
      }
    }
  };

  if (Array.isArray(parsed)) {
    if (parsed.length > 0) {
      const first = parsed[0];
      if (first && (first.lunches || first.menuType || (first.total !== undefined && first.dayOfWeek))) {
        newConsumptions = parsed.map((item: any, idx: number) => ({
          id: String(item.id || `cons-${Date.now()}-${idx}`),
          clientId: String(item.clientId || ''),
          clientName: String(item.clientName || 'Cliente'),
          piso: normalizePiso(item.piso || 'Piso 1'),
          date: String(item.date || getTodayDateString()),
          dayOfWeek: (item.dayOfWeek as DayOfWeek) || (getDayOfWeekName(item.date || getTodayDateString()) as DayOfWeek),
          timestamp: String(item.timestamp || (item.date ? new Date(item.date).toISOString() : new Date().toISOString())),
          lunches: Array.isArray(item.lunches) ? item.lunches : [],
          extras: Array.isArray(item.extras) ? item.extras : [],
          total: Number(item.total) || 0,
          paymentStatus: item.paymentStatus === 'pagado' ? 'pagado' : 'pendiente',
          paymentMethod: item.paymentMethod || undefined,
          paymentDate: item.paymentDate ? String(item.paymentDate) : undefined,
          accountType: item.accountType === 'semanal' ? 'semanal' : 'diaria',
          notes: item.notes || undefined,
        }));
        newConsumptions.forEach((c) => collectFromOrderExtras(c.extras));
      } else if (first && (first.price !== undefined || first.precio !== undefined) && (first.name || first.nombre)) {
        newExtras = parsed.map((item: any, idx: number) => ({
          id: String(item.id || `ext-${Date.now()}-${idx}`),
          name: String(item.name || item.nombre || `Adicional ${idx + 1}`),
          description: item.description || item.descripcion || '',
          price: Number(item.price !== undefined ? item.price : (item.precio !== undefined ? item.precio : 0)) || 0,
          category: item.category || item.categoria || 'bebida',
        }));
      } else {
        newClients = parsed.map((c: any, idx: number) => ({
          id: String(c.id || `client-${Date.now()}-${idx}`),
          name: String(c.name || `Cliente ${idx + 1}`),
          piso: normalizePiso(c.piso || 'Piso 1'),
          accountType: c.accountType === 'semanal' ? 'semanal' : 'diaria',
          phone: c.phone || undefined,
          notes: c.notes || undefined,
          active: c.active !== false,
        }));
      }
    }
  } else if (typeof parsed === 'object' && parsed !== null) {
    if (Array.isArray(parsed.clients)) {
      newClients = parsed.clients.map((c: any, idx: number) => ({
        id: String(c.id || `client-${Date.now()}-${idx}`),
        name: String(c.name || `Cliente ${idx + 1}`),
        piso: normalizePiso(c.piso || 'Piso 1'),
        accountType: c.accountType === 'semanal' ? 'semanal' : 'diaria',
        phone: c.phone || undefined,
        notes: c.notes || undefined,
        active: c.active !== false,
      }));
    }

    if (Array.isArray(parsed.consumptions)) {
      newConsumptions = parsed.consumptions.map((item: any, idx: number) => ({
        id: String(item.id || `cons-${Date.now()}-${idx}`),
        clientId: String(item.clientId || ''),
        clientName: String(item.clientName || 'Cliente'),
        piso: normalizePiso(item.piso || 'Piso 1'),
        date: String(item.date || getTodayDateString()),
        dayOfWeek: (item.dayOfWeek as DayOfWeek) || (getDayOfWeekName(item.date || getTodayDateString()) as DayOfWeek),
        timestamp: String(item.timestamp || (item.date ? new Date(item.date).toISOString() : new Date().toISOString())),
        lunches: Array.isArray(item.lunches) ? item.lunches : [],
        extras: Array.isArray(item.extras) ? item.extras : [],
        total: Number(item.total) || 0,
        paymentStatus: item.paymentStatus === 'pagado' ? 'pagado' : 'pendiente',
        paymentMethod: item.paymentMethod || undefined,
        paymentDate: item.paymentDate ? String(item.paymentDate) : undefined,
        accountType: item.accountType === 'semanal' ? 'semanal' : 'diaria',
        notes: item.notes || undefined,
        lonche: item.lonche && typeof item.lonche === 'object' ? item.lonche : undefined,
      }));
    }

    if (Array.isArray(parsed.payments)) {
      newPayments = parsed.payments.map((p: any, idx: number) => ({
        id: String(p.id || `pay-${Date.now()}-${idx}`),
        clientId: String(p.clientId || ''),
        clientName: String(p.clientName || 'Cliente'),
        piso: normalizePiso(p.piso || 'Piso 1'),
        amount: Number(p.amount) || 0,
        date: String(p.date || getTodayDateString()),
        dayOfWeek: (p.dayOfWeek as DayOfWeek) || (getDayOfWeekName(p.date || getTodayDateString()) as DayOfWeek),
        method: p.method === 'yape' ? 'yape' : 'efectivo',
        accountType: p.accountType === 'semanal' ? 'semanal' : 'diaria',
        notes: p.notes || undefined,
        timestamp: String(p.timestamp || (p.date ? new Date(p.date).toISOString() : new Date().toISOString())),
        // Antes se perdían al importar: se conservan las marcas de pago DP/DA
        isDpPayment: p.isDpPayment ? true : undefined,
        isDaPayment: p.isDaPayment ? true : undefined,
      }));
    }

    if (Array.isArray(parsed.mesaRecords)) {
      newMesaRecords = parsed.mesaRecords.map((m: any, idx: number) => ({
        id: String(m.id || `mesa-${m.date || idx}`),
        date: String(m.date || getTodayDateString()),
        dayOfWeek: (m.dayOfWeek as DayOfWeek) || (getDayOfWeekName(m.date || getTodayDateString()) as DayOfWeek),
        menuCompletoCount: Number(m.menuCompletoCount) || 0,
        soloSegundoCount: Number(m.soloSegundoCount) || 0,
        extras: Array.isArray(m.extras) ? m.extras : [],
        totalAmount: Number(m.totalAmount) || 0,
        efectivoAmount: Number(m.efectivoAmount) || 0,
        yapeAmount: Number(m.yapeAmount) || 0,
        notes: m.notes || undefined,
        timestamp: String(m.timestamp || (m.date ? new Date(m.date).toISOString() : new Date().toISOString())),
        updatedAt: m.updatedAt || undefined,
      }));
    }

    // Detect extras catalog from any naming convention in the backup
    const rawExtras = parsed.extras ||
                      parsed.adicionales ||
                      parsed.extrasCatalog ||
                      parsed.catalog ||
                      parsed.catalogoExtras ||
                      parsed.catalogo ||
                      parsed.listaExtras ||
                      parsed.itemsExtras;

    if (Array.isArray(rawExtras)) {
      newExtras = rawExtras.map((item: any, idx: number) => ({
        id: String(item.id || `ext-${Date.now()}-${idx}`),
        name: String(item.name || item.nombre || `Adicional ${idx + 1}`),
        description: item.description || item.descripcion || '',
        price: Number(item.price !== undefined ? item.price : (item.precio !== undefined ? item.precio : 0)) || 0,
        category: item.category || item.categoria || 'bebida',
      }));
    }

    // Also gather any extras that were logged in consumptions or mesaRecords so nothing is missed
    newConsumptions.forEach((c) => collectFromOrderExtras(c.extras));
    newMesaRecords.forEach((m) => collectFromOrderExtras(m.extras));

    // If not in JSON and no extras found in consumptions, fallback to existing or INITIAL_EXTRAS
    if (newExtras.length === 0 && !Array.isArray(rawExtras)) {
      newExtras = fallbackExtras.length > 0 ? fallbackExtras : INITIAL_EXTRAS;
    }
  } else {
    return null;
  }

  return {
    clients: newClients,
    consumptions: newConsumptions,
    payments: newPayments,
    mesaRecords: newMesaRecords,
    extras: newExtras,
  };
}
