/**
 * Capa de datos de "Fuente de Soda Criss" sobre Supabase (PostgreSQL).
 *
 * Mantiene la MISMA API pública que la versión anterior con IndexedDB
 * (getX / saveX / exportFullBackup / importFullBackup), así que los
 * componentes de React no cambian. Además añade:
 *
 *  - Guardado por diferencias: `saveX(arrayCompleto)` solo envía las filas
 *    nuevas o modificadas y borra solo lo que ESTE usuario quitó. Así dos
 *    personas trabajando a la vez no se pisan los registros.
 *  - Cola global: los guardados se aplican en el orden en que se llamaron
 *    (p. ej. primero el cliente nuevo y luego su pedido).
 *  - Tiempo real: `subscribe()` avisa cuando otra pantalla cambia algo.
 *  - Reintento automático si se cae la conexión.
 */
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import {
  ClientRecord,
  ConsumptionRecord,
  PaymentRecord,
  MesaCounterRecord,
  ExtraItem,
  ExtraCategory,
  DayOfWeek,
  WORK_DAYS,
} from '../types';
import { INITIAL_EXTRAS } from '../data/initialData';
import { supabase, TABLES } from '../lib/supabase';
import { getDayOfWeekName, getTodayDateString } from '../utils/dates';
import { parseBackup, BackupCollections } from './backupParser';

// Re-exportaciones para no romper imports existentes (App.tsx, CuadernoLedger.tsx)
export { getDayOfWeekName, getTodayDateString } from '../utils/dates';
export {
  INITIAL_CLIENTS,
  generateInitialConsumptions,
  generateInitialPayments,
  generateInitialMesaRecords,
} from '../data/demoData';

/* =================================================================== */
/*  Normalizadores                                                       */
/* =================================================================== */

type Row = Record<string, any>;

const EXTRA_CATEGORIES: ExtraCategory[] = ['Bebidas', 'Panes', 'Extras', 'Especial', 'Dulces'];

const round2 = (n: unknown): number => Math.round((Number(n) || 0) * 100) / 100;

const toIsoTimestamp = (ts: unknown): string => {
  const d = ts ? new Date(String(ts)) : new Date();
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
};

/** 'YYYY-MM-DD' válido o, si no, la fecha de hoy. */
const toDateOnly = (value: unknown): string => {
  const s = String(value ?? '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : getTodayDateString();
};

const toOptionalDate = (value: unknown): string | null => {
  if (!value) return null;
  const s = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

const toDayOfWeek = (value: unknown, date: string): DayOfWeek =>
  WORK_DAYS.includes(value as DayOfWeek) ? (value as DayOfWeek) : getDayOfWeekName(date);

const toAccountType = (v: unknown): 'semanal' | 'diaria' => (v === 'semanal' ? 'semanal' : 'diaria');

const toMethod = (v: unknown): 'efectivo' | 'yape' => (v === 'yape' ? 'yape' : 'efectivo');

const toOptionalMethod = (v: unknown): 'efectivo' | 'yape' | null =>
  v === 'yape' || v === 'efectivo' ? v : null;

/**
 * Unifica variantes conocidas ('bebida' -> 'Bebidas', 'especial' -> 'Especial'…).
 * Categorías que no están en ExtraCategory (p. ej. 'postre', 'guarnicion') se conservan tal cual.
 */
const toCategory = (v: unknown): string | null => {
  if (v === undefined || v === null || String(v).trim() === '') return null;
  if (EXTRA_CATEGORIES.includes(v as ExtraCategory)) return v as ExtraCategory;
  const raw = String(v).trim();
  const k = raw.toLowerCase();
  if (k === 'bebida' || k === 'bebidas') return 'Bebidas';
  if (k === 'pan' || k === 'panes') return 'Panes';
  if (k === 'dulce' || k === 'dulces') return 'Dulces';
  if (k === 'especial' || k === 'especiales') return 'Especial';
  if (k === 'extra' || k === 'extras') return 'Extras';
  return raw;
};

const nullable = <T>(v: T | undefined | null | ''): T | null =>
  v === undefined || v === null || v === '' ? null : v;

const optional = <T>(v: T | null | undefined): T | undefined => (v === null || v === undefined ? undefined : v);

/** JSON estable (claves ordenadas) para comparar filas sin depender del orden de jsonb. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map((v) => (v === undefined ? 'null' : stableStringify(v))).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(',')}}`;
}

/* =================================================================== */
/*  Mapeo TypeScript (camelCase) <-> PostgreSQL (snake_case)             */
/* =================================================================== */

interface TableDef<T> {
  table: string;
  toRow: (item: T) => Row;
  fromRow: (row: Row) => T;
}

const clientsDef: TableDef<ClientRecord> = {
  table: TABLES.clients,
  toRow: (c) => ({
    id: String(c.id),
    name: String(c.name ?? ''),
    piso: String(c.piso || '1ro'),
    account_type: toAccountType(c.accountType),
    phone: nullable(c.phone),
    notes: nullable(c.notes),
    active: c.active !== false,
  }),
  fromRow: (r) => ({
    id: r.id,
    name: r.name,
    piso: r.piso,
    accountType: toAccountType(r.account_type),
    phone: optional(r.phone),
    notes: optional(r.notes),
    active: r.active !== false,
  }),
};

const extrasDef: TableDef<ExtraItem> = {
  table: TABLES.extras,
  toRow: (e) => ({
    id: String(e.id),
    name: String(e.name ?? ''),
    description: nullable(e.description),
    price: Math.max(0, round2(e.price)),
    category: toCategory(e.category),
  }),
  fromRow: (r) => ({
    id: r.id,
    name: r.name,
    description: optional(r.description),
    price: Number(r.price) || 0,
    category: optional(r.category) as ExtraCategory | undefined,
  }),
};

const consumptionsDef: TableDef<ConsumptionRecord> = {
  table: TABLES.consumptions,
  toRow: (c) => {
    const date = toDateOnly(c.date);
    return {
      id: String(c.id),
      client_id: nullable(c.clientId),
      client_name: String(c.clientName ?? ''),
      piso: String(c.piso || '1ro'),
      account_type: toAccountType(c.accountType),
      date,
      day_of_week: toDayOfWeek(c.dayOfWeek, date),
      recorded_at: toIsoTimestamp(c.timestamp),
      lunches: Array.isArray(c.lunches) ? c.lunches : [],
      extras: Array.isArray(c.extras) ? c.extras : [],
      total: round2(c.total),
      payment_status: c.paymentStatus === 'pagado' ? 'pagado' : 'pendiente',
      payment_method: toOptionalMethod(c.paymentMethod),
      payment_date: toOptionalDate(c.paymentDate),
      notes: nullable(c.notes),
    };
  },
  fromRow: (r) => ({
    id: r.id,
    clientId: r.client_id ?? '',
    clientName: r.client_name,
    piso: r.piso,
    accountType: toAccountType(r.account_type),
    date: r.date,
    dayOfWeek: r.day_of_week,
    timestamp: toIsoTimestamp(r.recorded_at),
    lunches: Array.isArray(r.lunches) ? r.lunches : [],
    extras: Array.isArray(r.extras) ? r.extras : [],
    total: Number(r.total) || 0,
    paymentStatus: r.payment_status === 'pagado' ? 'pagado' : 'pendiente',
    paymentMethod: optional(r.payment_method),
    paymentDate: optional(r.payment_date),
    notes: optional(r.notes),
  }),
};

const paymentsDef: TableDef<PaymentRecord> = {
  table: TABLES.payments,
  toRow: (p) => {
    const date = toDateOnly(p.date);
    return {
      id: String(p.id),
      client_id: nullable(p.clientId),
      client_name: String(p.clientName ?? ''),
      piso: String(p.piso || '1ro'),
      account_type: toAccountType(p.accountType),
      date,
      day_of_week: toDayOfWeek(p.dayOfWeek, date),
      amount: round2(p.amount),
      method: toMethod(p.method),
      notes: nullable(p.notes),
      recorded_at: toIsoTimestamp(p.timestamp),
      is_dp_payment: !!p.isDpPayment,
      is_da_payment: !!p.isDaPayment,
    };
  },
  fromRow: (r) => ({
    id: r.id,
    clientId: r.client_id ?? '',
    clientName: r.client_name,
    piso: r.piso,
    accountType: toAccountType(r.account_type),
    date: r.date,
    dayOfWeek: r.day_of_week,
    amount: Number(r.amount) || 0,
    method: toMethod(r.method),
    notes: optional(r.notes),
    timestamp: toIsoTimestamp(r.recorded_at),
    isDpPayment: r.is_dp_payment ? true : undefined,
    isDaPayment: r.is_da_payment ? true : undefined,
  }),
};

const mesaDef: TableDef<MesaCounterRecord> = {
  table: TABLES.mesaRecords,
  toRow: (m) => {
    const date = toDateOnly(m.date);
    return {
      id: String(m.id || `mesa-${date}`),
      date,
      day_of_week: toDayOfWeek(m.dayOfWeek, date),
      menu_completo_count: Math.max(0, Math.round(Number(m.menuCompletoCount) || 0)),
      solo_segundo_count: Math.max(0, Math.round(Number(m.soloSegundoCount) || 0)),
      extras: Array.isArray(m.extras) ? m.extras : [],
      efectivo_amount: round2(m.efectivoAmount),
      yape_amount: round2(m.yapeAmount),
      total_amount: round2(m.totalAmount),
      recorded_at: toIsoTimestamp(m.timestamp),
      notes: nullable(m.notes),
    };
  },
  fromRow: (r) => ({
    id: r.id,
    date: r.date,
    dayOfWeek: r.day_of_week,
    menuCompletoCount: Number(r.menu_completo_count) || 0,
    soloSegundoCount: Number(r.solo_segundo_count) || 0,
    extras: Array.isArray(r.extras) ? r.extras : [],
    efectivoAmount: Number(r.efectivo_amount) || 0,
    yapeAmount: Number(r.yape_amount) || 0,
    totalAmount: Number(r.total_amount) || 0,
    timestamp: toIsoTimestamp(r.recorded_at),
    notes: optional(r.notes),
  }),
};

/** Exportado solo para pruebas unitarias del mapeo. */
export const __tableDefs = { clientsDef, extrasDef, consumptionsDef, paymentsDef, mesaDef };

/* =================================================================== */
/*  Estado sincronizado de una tabla                                     */
/* =================================================================== */

type CollectionKey = 'clients' | 'consumptions' | 'payments' | 'mesaRecords' | 'extras';

class TableState<T> {
  /** Última versión confirmada por el servidor, por id (filas tal como vienen de PostgreSQL). */
  server = new Map<string, Row>();
  /**
   * Lo que la pantalla tiene ahora mismo: id -> forma canónica de la fila.
   * Es la "base" para saber qué cambió o borró ESTE usuario (diff a 3 vías),
   * así nunca se reenvía una copia vieja de algo que otra persona editó.
   */
  ui = new Map<string, string>();
  loaded = false;
  loading: Promise<void> | null = null;

  constructor(readonly def: TableDef<T>) {}

  items(): T[] {
    return [...this.server.values()].map(this.def.fromRow);
  }

  /** Forma canónica para comparar: pasa por fromRow→toRow para normalizar formatos. */
  canonFromServer(row: Row): string {
    return stableStringify(this.def.toRow(this.def.fromRow(row)));
  }

  /** Marca que la pantalla quedó mostrando exactamente la versión del servidor. */
  syncUiWithServer() {
    this.ui = new Map([...this.server.entries()].map(([id, r]) => [id, this.canonFromServer(r)]));
  }

  reset() {
    this.server.clear();
    this.ui.clear();
    this.loaded = false;
    this.loading = null;
  }
}

/* =================================================================== */
/*  Suscripción                                                          */
/* =================================================================== */

export interface DbSnapshot {
  clients?: ClientRecord[];
  consumptions?: ConsumptionRecord[];
  payments?: PaymentRecord[];
  mesaRecords?: MesaCounterRecord[];
  extras?: ExtraItem[];
}

export interface DbListener {
  /** Colecciones que cambiaron por acción de otra pantalla (o por una resincronización). */
  onChange?: (snapshot: DbSnapshot) => void;
  /** Mensaje listo para mostrar al usuario. */
  onError?: (message: string) => void;
}

const PAGE_SIZE = 1000; // límite por defecto de filas por consulta en Supabase
const CHUNK_SIZE = 500;
const RETRY_MS = 5000;

const chunk = <T>(arr: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

/* =================================================================== */
/*  Servicio                                                             */
/* =================================================================== */

class DatabaseService {
  private tables: { [K in CollectionKey]: TableState<any> } = {
    clients: new TableState(clientsDef),
    consumptions: new TableState(consumptionsDef),
    payments: new TableState(paymentsDef),
    mesaRecords: new TableState(mesaDef),
    extras: new TableState(extrasDef),
  };

  private byTableName = new Map<string, CollectionKey>(
    (Object.keys(this.tables) as CollectionKey[]).map((k) => [this.tables[k].def.table, k])
  );

  private queue: Promise<void> = Promise.resolve();
  private pending = 0;
  private dirty = new Set<CollectionKey>();
  private emitTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimers = new Map<CollectionKey, ReturnType<typeof setTimeout>>();
  private latestDesired = new Map<CollectionKey, unknown[]>();

  private listeners = new Set<DbListener>();
  private channel: RealtimeChannel | null = null;
  private generation = 0;
  private hasSubscribedOnce = false;

  /* --------------------------- Lectura ---------------------------- */

  private async fetchAll(key: CollectionKey): Promise<Row[]> {
    const { table } = this.tables[key].def;
    const rows: Row[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      rows.push(...(data ?? []));
      if (!data || data.length < PAGE_SIZE) break;
    }
    return rows;
  }

  private replaceServerState(key: CollectionKey, rows: Row[]) {
    const state = this.tables[key];
    state.server = new Map(rows.map((r) => [String(r.id), r]));
    state.loaded = true;
  }

  private async ensureLoaded(key: CollectionKey): Promise<void> {
    const state = this.tables[key];
    if (state.loaded) return;
    if (!state.loading) {
      const gen = this.generation;
      state.loading = this.fetchAll(key)
        .then((rows) => {
          if (gen === this.generation) this.replaceServerState(key, rows);
        })
        .finally(() => {
          if (gen === this.generation) state.loading = null;
        });
    }
    await state.loading;
  }

  private async getCollection<T>(key: CollectionKey): Promise<T[]> {
    try {
      await this.ensureLoaded(key);
      const state = this.tables[key];
      const items = state.items() as T[];
      state.syncUiWithServer();
      return items;
    } catch (e) {
      console.error(`[db] Error cargando ${key}`, e);
      this.notifyError('No se pudieron cargar los datos de la nube. Revisa tu conexión.');
      return [];
    }
  }

  async getClients(): Promise<ClientRecord[]> {
    return this.getCollection<ClientRecord>('clients');
  }

  async getConsumptions(): Promise<ConsumptionRecord[]> {
    return this.getCollection<ConsumptionRecord>('consumptions');
  }

  async getPayments(): Promise<PaymentRecord[]> {
    return this.getCollection<PaymentRecord>('payments');
  }

  async getMesaRecords(): Promise<MesaCounterRecord[]> {
    return this.getCollection<MesaCounterRecord>('mesaRecords');
  }

  async getExtras(): Promise<ExtraItem[]> {
    const extras = await this.getCollection<ExtraItem>('extras');
    if (extras.length > 0) return extras;
    // Catálogo vacío en la nube: se siembra el catálogo inicial (idempotente por id)
    if (this.tables.extras.loaded) void this.saveExtras(INITIAL_EXTRAS);
    return INITIAL_EXTRAS;
  }

  /* --------------------------- Escritura --------------------------- */

  /** Encola una tarea; las tareas se ejecutan de una en una, en orden de llegada. */
  private enqueue<R>(task: () => Promise<R>): Promise<R> {
    this.pending++;
    const run = this.queue.then(task);
    this.queue = run
      .then(
        () => undefined,
        () => undefined
      )
      .finally(() => {
        this.pending--;
        if (this.pending === 0) this.flushDirty();
      });
    return run;
  }

  /** Quita referencias a clientes que no existen en la nube (evita fallar por la FK). */
  private sanitizeClientRef(row: Row): Row {
    if (row.client_id && !this.tables.clients.server.has(String(row.client_id))) {
      return { ...row, client_id: null };
    }
    return row;
  }

  private buildRows(key: CollectionKey, items: unknown[]): Row[] {
    const state = this.tables[key];
    const byId = new Map<string, Row>();
    for (const item of items) {
      let row = state.def.toRow(item);
      if (key === 'consumptions' || key === 'payments') row = this.sanitizeClientRef(row);
      byId.set(String(row.id), row); // si hay ids repetidos, gana el último
    }
    let rows = [...byId.values()];
    if (key === 'mesaRecords') {
      // Un solo registro por día (restricción UNIQUE(date))
      const byDate = new Map<string, Row>();
      rows.forEach((r) => byDate.set(String(r.date), r));
      rows = [...byDate.values()];
    }
    return rows;
  }

  private async applySave(key: CollectionKey, items: unknown[]): Promise<void> {
    await this.ensureLoaded(key);
    if (key === 'consumptions' || key === 'payments') await this.ensureLoaded('clients');

    const state = this.tables[key];
    const table = state.def.table;
    const rows = this.buildRows(key, items);
    const newIds = new Set(rows.map((r) => String(r.id)));
    const canon = new Map(rows.map((r) => [String(r.id), stableStringify(r)]));

    // Solo filas que ESTE usuario creó o modificó (distintas de lo que su pantalla tenía)
    // y que además difieren de lo que ya hay en la nube.
    const changed = rows.filter((r) => {
      const id = String(r.id);
      const c = canon.get(id)!;
      if (state.ui.get(id) === c) return false; // el usuario no tocó esta fila
      const current = state.server.get(id);
      return !current || state.canonFromServer(current) !== c;
    });

    // Solo borra lo que esta pantalla tenía y el usuario quitó
    const removed = [...state.ui.keys()].filter((id) => !newIds.has(id) && state.server.has(id));

    for (const part of chunk(removed, CHUNK_SIZE)) {
      const { error } = await supabase.from(table).delete().in('id', part);
      if (error) throw error;
      part.forEach((id) => state.server.delete(id));
    }

    for (const part of chunk(changed, CHUNK_SIZE)) {
      const { data, error } = await supabase.from(table).upsert(part, { onConflict: 'id' }).select('*');
      if (error) throw error;
      (data ?? []).forEach((r: Row) => state.server.set(String(r.id), r));
    }

    state.ui = canon;
  }

  private save(key: CollectionKey, items: unknown[]): Promise<void> {
    this.latestDesired.set(key, items);
    const timer = this.retryTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.retryTimers.delete(key);
    }

    return this.enqueue(() => this.applySave(key, items)).catch((e) => {
      console.error(`[db] Error guardando ${key}`, e);
      this.notifyError('No se pudo guardar en la nube. Se reintentará automáticamente…');
      // Reintenta con la última versión que pidió la pantalla
      this.retryTimers.set(
        key,
        setTimeout(() => {
          this.retryTimers.delete(key);
          if (this.latestDesired.get(key) === items) void this.save(key, items);
        }, RETRY_MS)
      );
    });
  }

  async saveClients(clients: ClientRecord[]): Promise<void> {
    return this.save('clients', clients);
  }

  async saveConsumptions(consumptions: ConsumptionRecord[]): Promise<void> {
    return this.save('consumptions', consumptions);
  }

  async savePayments(payments: PaymentRecord[]): Promise<void> {
    return this.save('payments', payments);
  }

  async saveMesaRecords(records: MesaCounterRecord[]): Promise<void> {
    return this.save('mesaRecords', records);
  }

  async saveExtras(extras: ExtraItem[]): Promise<void> {
    return this.save('extras', extras);
  }

  /* ------------------------ Respaldo JSON -------------------------- */

  async exportFullBackup(): Promise<string> {
    const keys: CollectionKey[] = ['clients', 'consumptions', 'payments', 'mesaRecords', 'extras'];
    await Promise.all(keys.map((k) => this.ensureLoaded(k)));
    const [clients, consumptions, payments, mesaRecords, extras] = keys.map((k) => this.tables[k].items());

    return JSON.stringify(
      {
        app: 'Fuente de Soda Criss',
        version: 2,
        exportDate: new Date().toISOString(),
        clients,
        consumptions,
        payments,
        mesaRecords,
        extras,
      },
      null,
      2
    );
  }

  /**
   * Importa un respaldo y REEMPLAZA todo lo que hay en la nube.
   * Se ejecuta en una sola transacción en el servidor (función import_backup):
   * si algo falla, no se borra nada.
   */
  async importFullBackup(jsonStr: string): Promise<BackupCollections | null> {
    let parsed: BackupCollections | null;
    try {
      parsed = parseBackup(jsonStr, this.tables.extras.items());
    } catch (e) {
      console.error('Error leyendo el respaldo:', e);
      return null;
    }
    if (!parsed) return null;
    const data = parsed;

    try {
      return await this.enqueue(async () => {
        const clientRows = this.buildRowsFrom(clientsDef, data.clients);
        const clientIds = new Set(clientRows.map((r) => String(r.id)));
        const withClientRef = (r: Row) =>
          r.client_id && !clientIds.has(String(r.client_id)) ? { ...r, client_id: null } : r;

        const mesaByDate = new Map<string, Row>();
        this.buildRowsFrom(mesaDef, data.mesaRecords).forEach((r) => mesaByDate.set(String(r.date), r));

        const payload = {
          clients: clientRows,
          extras: this.buildRowsFrom(extrasDef, data.extras),
          consumptions: this.buildRowsFrom(consumptionsDef, data.consumptions).map(withClientRef),
          payments: this.buildRowsFrom(paymentsDef, data.payments).map(withClientRef),
          mesaRecords: [...mesaByDate.values()],
        };

        const { error } = await supabase.rpc('import_backup', { payload });
        if (error) throw error;

        // Recarga todo desde la nube para quedar 100% alineados
        const keys = Object.keys(this.tables) as CollectionKey[];
        const results = await Promise.all(keys.map((k) => this.fetchAll(k)));
        keys.forEach((k, i) => {
          this.replaceServerState(k, results[i]);
          this.tables[k].syncUiWithServer();
          this.dirty.delete(k);
        });

        return {
          clients: this.tables.clients.items(),
          consumptions: this.tables.consumptions.items(),
          payments: this.tables.payments.items(),
          mesaRecords: this.tables.mesaRecords.items(),
          extras: this.tables.extras.items(),
        };
      });
    } catch (e) {
      console.error('Error importando respaldo:', e);
      this.notifyError('No se pudo importar el respaldo a la nube. No se modificó nada.');
      return null;
    }
  }

  /** Igual que buildRows pero sin depender del estado actual (para importar). */
  private buildRowsFrom<T>(def: TableDef<T>, items: T[]): Row[] {
    const byId = new Map<string, Row>();
    items.forEach((item) => {
      const row = def.toRow(item);
      byId.set(String(row.id), row);
    });
    return [...byId.values()];
  }

  /* ------------------------- Tiempo real --------------------------- */

  /**
   * Escucha cambios hechos desde otras pantallas. Devuelve la función para
   * dejar de escuchar (ideal como retorno de un useEffect).
   */
  subscribe(listener: DbListener): () => void {
    this.listeners.add(listener);
    if (!this.channel) this.openChannel();
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) this.teardown();
    };
  }

  private openChannel() {
    const channel = supabase.channel('criss-db');
    for (const key of Object.keys(this.tables) as CollectionKey[]) {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: this.tables[key].def.table },
        (payload) => this.handleRealtime(payload)
      );
    }
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        // En la primera conexión y en cada reconexión: resincroniza por si
        // se perdió algún cambio mientras no había conexión.
        if (this.hasSubscribedOnce) void this.resync();
        this.hasSubscribedOnce = true;
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn('[db] Canal en tiempo real:', status);
      }
    });
    this.channel = channel;

    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.handleOnline);
      document.addEventListener('visibilitychange', this.handleVisibility);
    }
  }

  private handleOnline = () => {
    void this.resync();
    // Reintenta guardados pendientes de inmediato
    for (const [key, timer] of this.retryTimers) {
      clearTimeout(timer);
      this.retryTimers.delete(key);
      const items = this.latestDesired.get(key);
      if (items) void this.save(key, items);
    }
  };

  private handleVisibility = () => {
    // Al volver a la pestaña (p. ej. celular que estuvo bloqueado), se pone al día.
    if (document.visibilityState === 'visible') void this.resync();
  };

  private teardown() {
    if (this.channel) {
      void supabase.removeChannel(this.channel);
      this.channel = null;
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.handleOnline);
      document.removeEventListener('visibilitychange', this.handleVisibility);
    }
    this.retryTimers.forEach(clearTimeout);
    this.retryTimers.clear();
    this.latestDesired.clear();
    if (this.emitTimer) clearTimeout(this.emitTimer);
    this.emitTimer = null;
    this.dirty.clear();
    this.hasSubscribedOnce = false;
    this.generation++;
    Object.values(this.tables).forEach((t) => t.reset());
  }

  private handleRealtime(payload: RealtimePostgresChangesPayload<Row>) {
    const key = this.byTableName.get(payload.table);
    if (!key) return;
    const state = this.tables[key];
    if (!state.loaded) return; // aún cargando: la carga inicial ya traerá el dato

    if (payload.eventType === 'DELETE') {
      const id = String((payload.old as Row)?.id ?? '');
      if (id && state.server.delete(id)) this.markDirty(key);
      return;
    }

    const row = payload.new as Row;
    const id = String(row.id);
    const current = state.server.get(id);
    if (current) {
      const incoming = new Date(row.updated_at).getTime();
      const known = new Date(current.updated_at).getTime();
      if (incoming < known) return; // evento viejo
      if (incoming === known && state.canonFromServer(current) === state.canonFromServer(row)) return; // eco
    }
    state.server.set(id, row);
    this.markDirty(key);
  }

  private async resync() {
    if (this.listeners.size === 0) return;
    const gen = this.generation;
    try {
      const keys = Object.keys(this.tables) as CollectionKey[];
      const results = await Promise.all(keys.map((k) => this.fetchAll(k)));
      if (gen !== this.generation) return;
      keys.forEach((k, i) => {
        const state = this.tables[k];
        const before = stableStringify([...state.server.values()].map((r) => state.canonFromServer(r)));
        this.replaceServerState(k, results[i]);
        const after = stableStringify([...state.server.values()].map((r) => state.canonFromServer(r)));
        if (before !== after) this.markDirty(k);
      });
    } catch (e) {
      console.warn('[db] No se pudo resincronizar', e);
    }
  }

  private markDirty(key: CollectionKey) {
    this.dirty.add(key);
    this.flushDirty();
  }

  /** Emite cambios a la pantalla, agrupados y nunca mientras haya guardados en curso. */
  private flushDirty() {
    if (this.pending > 0 || this.dirty.size === 0 || this.emitTimer) return;
    this.emitTimer = setTimeout(() => {
      this.emitTimer = null;
      if (this.pending > 0) return; // se emitirá al terminar la cola
      const snapshot: DbSnapshot = {};
      for (const key of this.dirty) {
        const state = this.tables[key];
        (snapshot as Record<string, unknown>)[key] = state.items();
        state.syncUiWithServer();
        // La pantalla ya muestra la versión de la nube: se cancela cualquier reintento viejo
        const timer = this.retryTimers.get(key);
        if (timer) {
          clearTimeout(timer);
          this.retryTimers.delete(key);
        }
      }
      this.dirty.clear();
      this.listeners.forEach((l) => l.onChange?.(snapshot));
    }, 150);
  }

  private notifyError(message: string) {
    this.listeners.forEach((l) => l.onError?.(message));
  }
}

export const dbService = new DatabaseService();
