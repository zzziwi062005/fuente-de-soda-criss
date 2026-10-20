import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChefHat,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Edit3,
  Plus,
  RotateCcw,
  Sandwich,
} from 'lucide-react';
import { ConsumptionRecord, LoncheStatus, PaymentMethod } from '../types';
import { formatCurrency } from '../utils/pricing';
import { getDayOfWeekName, getTodayDateString } from '../utils/dates';

interface LonchesBoardProps {
  /** Todos los pedidos; el tablero toma solo los lonches del día elegido. */
  consumptions: ConsumptionRecord[];
  date: string;
  onChangeDate: (date: string) => void;
  onNewLonche: () => void;
  onEditLonche: (consumption: ConsumptionRecord) => void;
  onSetStatus: (consumptionId: string, status: LoncheStatus) => void;
  /** Cobra el lonche con la misma lógica de Cuentas Diarias / Semanales. */
  onPay: (consumptionId: string, method: PaymentMethod) => void;
}

interface LoncheLine {
  name: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

type FolderKey = 'anotados' | 'preparados' | 'listos' | 'nocobrados' | 'cobrados';
type FolderTone = 'amber' | 'sky' | 'emerald' | 'rose';

const FOLDER_DEFAULTS: Record<FolderKey, boolean> = {
  anotados: true,
  preparados: true,
  listos: true,
  nocobrados: true,
  cobrados: false,
};

const FOLDER_STYLES: Record<FolderTone, { box: string; head: string; title: string; chip: string; chev: string }> = {
  amber: {
    box: 'border-amber-200',
    head: 'from-amber-50 via-white to-stone-50 hover:bg-amber-100/40',
    title: 'text-amber-950',
    chip: 'bg-amber-100 text-amber-900 border-amber-200',
    chev: 'text-amber-700',
  },
  sky: {
    box: 'border-sky-200',
    head: 'from-sky-50 via-white to-stone-50 hover:bg-sky-100/40',
    title: 'text-sky-950',
    chip: 'bg-sky-100 text-sky-900 border-sky-200',
    chev: 'text-sky-700',
  },
  emerald: {
    box: 'border-emerald-200',
    head: 'from-emerald-50 via-white to-stone-50 hover:bg-emerald-100/40',
    title: 'text-emerald-950',
    chip: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    chev: 'text-emerald-700',
  },
  rose: {
    box: 'border-rose-200',
    head: 'from-rose-50 via-white to-stone-50 hover:bg-rose-100/40',
    title: 'text-rose-950',
    chip: 'bg-rose-100 text-rose-800 border-rose-200',
    chev: 'text-rose-700',
  },
};

const shiftDate = (dateStr: string, days: number): string => {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};

const formatTime = (iso?: string): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: true });
};

const readFolders = (): Record<FolderKey, boolean> => {
  try {
    const saved = JSON.parse(localStorage.getItem('criss_lonches_carpetas') || '{}');
    return { ...FOLDER_DEFAULTS, ...saved };
  } catch {
    return { ...FOLDER_DEFAULTS };
  }
};

const linesOf = (c: ConsumptionRecord): LoncheLine[] => [
  ...c.lunches.map((l) => ({
    name: l.menuType === 'menu_completo' ? 'Menú Completo' : 'Segundo Solo',
    quantity: l.quantity,
    unitPrice: l.unitPrice,
    subtotal: l.totalPrice,
  })),
  ...c.extras.map((e) => ({ name: e.name, quantity: e.quantity, unitPrice: e.price, subtotal: e.totalPrice })),
];

const sumTotal = (list: ConsumptionRecord[]) => list.reduce((s, c) => s + c.total, 0);
const plural = (n: number) => `${n} ${n === 1 ? 'lonche' : 'lonches'}`;

/**
 * Apartado "Lonches": seguimiento de los pedidos de la tarde.
 * Cada lonche es un pedido normal (ya sumado a la cuenta diaria o semanal del cliente);
 * aquí solo se avanza su fase: anotado → preparado → listo.
 * Arriba (Anotados / Preparados) no hay precios y el producto va en letra grande para
 * leerlo fácil en cocina. Los precios aparecen recién abajo, en "Listos".
 */
export const LonchesBoard: React.FC<LonchesBoardProps> = ({
  consumptions,
  date,
  onChangeDate,
  onNewLonche,
  onEditLonche,
  onSetStatus,
  onPay,
}) => {
  const today = getTodayDateString();
  const [open, setOpen] = useState<Record<FolderKey, boolean>>(readFolders);

  useEffect(() => {
    try {
      localStorage.setItem('criss_lonches_carpetas', JSON.stringify(open));
    } catch {
      /* almacenamiento no disponible: solo se pierde la preferencia */
    }
  }, [open]);

  const toggle = (key: FolderKey) => setOpen((prev) => ({ ...prev, [key]: !prev[key] }));

  const groups = useMemo(() => {
    const lonches = consumptions.filter((c) => c.lonche && c.date === date);
    const oldestFirst = (a: ConsumptionRecord, b: ConsumptionRecord) => a.timestamp.localeCompare(b.timestamp);
    // Listos: el último en quedar listo arriba
    const listos = lonches
      .filter((c) => c.lonche!.status === 'listo')
      .sort((a, b) => (b.lonche!.readyAt || b.timestamp).localeCompare(a.lonche!.readyAt || a.timestamp));
    return {
      anotados: lonches.filter((c) => c.lonche!.status === 'anotado').sort(oldestFirst),
      preparados: lonches.filter((c) => c.lonche!.status === 'preparado').sort(oldestFirst),
      noCobrados: listos.filter((c) => c.paymentStatus !== 'pagado'),
      cobrados: listos.filter((c) => c.paymentStatus === 'pagado'),
      listos,
    };
  }, [consumptions, date]);

  const dateLabel = `${getDayOfWeekName(date)} ${date.split('-').reverse().join('/')}`;

  // ------------------------------------------------------------------ piezas
  const renderHeader = (c: ConsumptionRecord, actions: React.ReactNode) => (
    <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-3 bg-stone-50/80 border-b border-stone-200">
      <div className="flex items-center gap-3 min-w-0">
        <div className="px-2.5 py-1.5 rounded-xl bg-amber-100 border border-amber-200 text-center shrink-0">
          <div className="text-sm leading-none">📍</div>
          <div className="text-sm font-black text-amber-950">{c.piso}</div>
        </div>
        <div className="min-w-0">
          <h4 className="text-xl font-black text-stone-900 leading-tight break-words">{c.clientName}</h4>
          <div className="flex flex-wrap items-center gap-1.5 mt-1">
            <span
              className={`text-xs font-bold px-2 py-0.5 rounded-md ${
                c.accountType === 'semanal' ? 'bg-indigo-100 text-indigo-900' : 'bg-amber-100 text-amber-900'
              }`}
            >
              {c.accountType === 'semanal' ? 'Cuenta Semanal' : 'Cuenta Diaria'}
            </span>
            <span className="text-xs font-semibold text-stone-500 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              Anotado {formatTime(c.timestamp)}
              {c.lonche!.preparedAt && <> · Preparado {formatTime(c.lonche!.preparedAt)}</>}
              {c.lonche!.readyAt && <> · Listo {formatTime(c.lonche!.readyAt)}</>}
            </span>
          </div>
        </div>
      </div>
      <div className="w-full sm:w-auto flex flex-wrap items-center gap-2">{actions}</div>
    </div>
  );

  const renderEdit = (c: ConsumptionRecord) => (
    <button
      type="button"
      onClick={() => onEditLonche(c)}
      className="px-3 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-900 text-sm font-bold flex items-center gap-1.5"
      title="Modificar lonche"
    >
      <Edit3 className="w-4 h-4" />
      <span>Modificar</span>
    </button>
  );

  const renderBack = (c: ConsumptionRecord, to: LoncheStatus) => (
    <button
      type="button"
      onClick={() => onSetStatus(c.id, to)}
      className="px-3 py-2 rounded-xl border border-stone-300 bg-white hover:bg-stone-100 text-stone-700 text-sm font-bold flex items-center gap-1.5"
      title="Regresar a la fase anterior"
    >
      <RotateCcw className="w-4 h-4" />
      <span>Regresar</span>
    </button>
  );

  /** Anotados / Preparados: solo producto y cantidad, en letra grande. Sin precios. */
  const renderKitchenCard = (c: ConsumptionRecord) => {
    const status = c.lonche!.status;
    return (
      <div key={c.id} data-lonche={c.id} className="bg-white rounded-2xl border border-amber-300 shadow-xs overflow-hidden">
        {renderHeader(
          c,
          <>
            {status === 'preparado' && renderBack(c, 'anotado')}
            {renderEdit(c)}
            {status === 'anotado' ? (
              <button
                type="button"
                onClick={() => onSetStatus(c.id, 'preparado')}
                className="order-first sm:order-none basis-full sm:basis-auto whitespace-nowrap justify-center px-4 py-3 sm:py-2.5 rounded-xl bg-sky-700 hover:bg-sky-800 text-white text-base font-black flex items-center gap-2 shadow-xs"
              >
                <ChefHat className="w-5 h-5" />
                <span>Pasar a Preparado</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onSetStatus(c.id, 'listo')}
                className="order-first sm:order-none basis-full sm:basis-auto whitespace-nowrap justify-center px-4 py-3 sm:py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-base font-black flex items-center gap-2 shadow-xs"
              >
                <CheckCircle2 className="w-5 h-5" />
                <span>Pasar a Listo</span>
              </button>
            )}
          </>
        )}
        <div className="p-3 sm:p-4">
          <div className="rounded-xl border border-stone-200 overflow-hidden">
            <div className="grid grid-cols-[1fr_auto] bg-stone-100 text-xs font-black uppercase tracking-wider text-stone-600">
              <span className="px-4 py-2">Producto</span>
              <span className="px-4 py-2 text-center w-24">Cant.</span>
            </div>
            {linesOf(c).map((line, i) => (
              <div key={i} className="grid grid-cols-[1fr_auto] items-center border-t border-stone-100">
                <span className="px-4 py-3 text-xl sm:text-2xl font-black text-stone-900 leading-snug">{line.name}</span>
                <span className="px-4 py-3 text-center w-24 text-2xl sm:text-3xl font-black text-amber-900">
                  {line.quantity}
                </span>
              </div>
            ))}
          </div>
          {c.notes && <p className="mt-2 text-lg font-bold text-rose-800">📝 {c.notes}</p>}
        </div>
      </div>
    );
  };

  /** Listos: con precio y subtotal, para cobrar al final en su cuenta. */
  const renderReadyCard = (c: ConsumptionRecord) => {
    const paid = c.paymentStatus === 'pagado';
    return (
      <div
        key={c.id}
        data-lonche={c.id}
        className={`bg-white rounded-2xl border shadow-xs overflow-hidden ${paid ? 'border-emerald-300' : 'border-rose-200'}`}
      >
        {renderHeader(
          c,
          <>
            {renderBack(c, 'preparado')}
            {renderEdit(c)}
          </>
        )}
        <div className="p-3 sm:p-4 space-y-2">
          <div className="rounded-xl border border-stone-200 overflow-hidden">
            <div className="grid grid-cols-[1fr_3.5rem_5.5rem] sm:grid-cols-[1fr_5rem_6rem_7rem] bg-stone-100 text-xs font-black uppercase tracking-wider text-stone-600">
              <span className="px-3 sm:px-4 py-2">Producto</span>
              <span className="px-2 py-2 text-center">Cant.</span>
              <span className="hidden sm:block px-2 py-2 text-right">Precio</span>
              <span className="px-3 sm:px-4 py-2 text-right">Subtotal</span>
            </div>
            {linesOf(c).map((line, i) => (
              <div
                key={i}
                className="grid grid-cols-[1fr_3.5rem_5.5rem] sm:grid-cols-[1fr_5rem_6rem_7rem] items-center border-t border-stone-100"
              >
                <span className="px-3 sm:px-4 py-2.5 min-w-0">
                  <span className="block text-lg font-black text-stone-900 leading-snug break-words">{line.name}</span>
                  <span className="sm:hidden block text-xs text-stone-500">{formatCurrency(line.unitPrice)} c/u</span>
                </span>
                <span className="px-2 py-2.5 text-center text-lg font-black text-amber-900">{line.quantity}</span>
                <span className="hidden sm:block px-2 py-2.5 text-right text-sm text-stone-600">{formatCurrency(line.unitPrice)}</span>
                <span className="px-3 sm:px-4 py-2.5 text-right text-base font-black text-stone-900">{formatCurrency(line.subtotal)}</span>
              </div>
            ))}
          </div>
          {c.notes && <p className="text-base font-bold text-stone-600">📝 {c.notes}</p>}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span
              className={`text-sm font-bold px-2.5 py-1 rounded-lg ${
                paid
                  ? 'bg-emerald-100 text-emerald-900'
                  : c.accountType === 'semanal'
                  ? 'bg-indigo-50 text-indigo-900'
                  : 'bg-rose-50 text-rose-800'
              }`}
            >
              {paid
                ? `✓ Cobrado • ${(c.paymentMethod || 'pagado').toUpperCase()}`
                : c.accountType === 'semanal'
                ? 'Pendiente • Cuenta Semanal'
                : 'Pendiente • Cuenta Diaria'}
            </span>
            {!paid && (
              <span className="flex items-center gap-1.5 text-xs font-bold text-stone-500">
                Cobrar:
                <button
                  type="button"
                  onClick={() => onPay(c.id, 'efectivo')}
                  className="px-2 py-1 rounded-md bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold"
                  title="Cobrar en efectivo"
                >
                  $ Efec
                </button>
                <button
                  type="button"
                  onClick={() => onPay(c.id, 'yape')}
                  className="px-2 py-1 rounded-md bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold"
                  title="Cobrar con Yape"
                >
                  Yape
                </button>
              </span>
            )}
            <span className="text-xl font-black text-stone-900">Total: {formatCurrency(c.total)}</span>
          </div>
        </div>
      </div>
    );
  };

  const renderFolder = (opts: {
    folder: FolderKey;
    title: string;
    subtitle: string;
    count: number;
    tone: FolderTone;
    amount?: { label: string; value: number; className: string };
    body: React.ReactNode;
  }) => {
    const s = FOLDER_STYLES[opts.tone];
    const isOpen = open[opts.folder];
    return (
      <div data-carpeta={opts.folder} className={`bg-stone-50/60 rounded-2xl border overflow-hidden shadow-2xs ${s.box}`}>
        <button
          type="button"
          onClick={() => toggle(opts.folder)}
          className={`w-full px-4 py-3.5 bg-gradient-to-r ${s.head} flex items-center justify-between gap-3 text-left transition-colors ${
            isOpen ? `border-b ${s.box}` : ''
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <ChevronDown className={`w-5 h-5 shrink-0 transition-transform ${s.chev} ${isOpen ? '' : '-rotate-90'}`} />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className={`text-lg sm:text-xl font-black ${s.title}`}>{opts.title}</h3>
                <span className={`px-2 py-0.5 rounded-full text-xs font-black border ${s.chip}`}>{plural(opts.count)}</span>
              </div>
              <p className="text-xs sm:text-sm text-stone-500 font-medium">{opts.subtitle}</p>
            </div>
          </div>
          {opts.amount && (
            <div className="text-right shrink-0">
              <span className="text-[11px] text-stone-500 font-bold block uppercase tracking-wider">{opts.amount.label}</span>
              <span className={`text-base sm:text-lg font-black ${opts.amount.className}`}>{formatCurrency(opts.amount.value)}</span>
            </div>
          )}
        </button>
        {isOpen && <div className="p-3 sm:p-4 space-y-3.5">{opts.body}</div>}
      </div>
    );
  };

  const renderEmpty = (text: string) => (
    <div className="bg-white rounded-xl p-6 text-center border border-dashed border-stone-300 text-stone-500 text-sm">{text}</div>
  );

  // ------------------------------------------------------------------ vista
  return (
    <div className="space-y-4">
      {/* Encabezado: fecha y botón para anotar */}
      <div className="bg-gradient-to-r from-amber-900 to-orange-800 text-white rounded-2xl p-4 shadow-md flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-white/10 border border-white/20">
            <Sandwich className="w-6 h-6 text-amber-200" />
          </div>
          <div>
            <h3 className="text-lg font-black leading-tight">Lonches</h3>
            <p className="text-xs text-amber-100/90">Se anotan en la cuenta del cliente; aquí se sigue su preparación.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center bg-white/10 border border-white/20 rounded-xl">
            <button type="button" onClick={() => onChangeDate(shiftDate(date, -1))} className="p-2 hover:bg-white/10 rounded-l-xl" title="Día anterior">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2 text-sm font-bold whitespace-nowrap">{dateLabel}</span>
            <button type="button" onClick={() => onChangeDate(shiftDate(date, 1))} className="p-2 hover:bg-white/10 rounded-r-xl" title="Día siguiente">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          {date !== today && (
            <button
              type="button"
              onClick={() => onChangeDate(today)}
              className="px-3 py-2 text-xs font-bold rounded-xl bg-white/10 border border-white/20 hover:bg-white/20"
            >
              Hoy
            </button>
          )}
          <button
            type="button"
            onClick={onNewLonche}
            className="px-4 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-amber-950 text-base font-black flex items-center gap-1.5 shadow-xs"
          >
            <Plus className="w-5 h-5" />
            <span>Anotar lonche</span>
          </button>
        </div>
      </div>

      {/* Arriba: lo que falta terminar (sin precios) */}
      {renderFolder({
        folder: 'anotados',
        title: '📝 Anotados',
        subtitle: 'Por preparar (el más antiguo primero)',
        count: groups.anotados.length,
        tone: 'amber',
        body: groups.anotados.length === 0 ? renderEmpty('No hay lonches por preparar.') : groups.anotados.map(renderKitchenCard),
      })}

      {renderFolder({
        folder: 'preparados',
        title: '👨‍🍳 Preparados',
        subtitle: 'En preparación, falta pasarlos a listo',
        count: groups.preparados.length,
        tone: 'sky',
        body: groups.preparados.length === 0 ? renderEmpty('Nada en preparación.') : groups.preparados.map(renderKitchenCard),
      })}

      {/* Abajo: los listos, con precios, separados por cobro */}
      {renderFolder({
        folder: 'listos',
        title: '✅ Listos',
        subtitle: 'Terminados — aquí se ven los precios para cobrar',
        count: groups.listos.length,
        tone: 'emerald',
        amount: { label: 'Total del día', value: sumTotal(groups.listos), className: 'text-emerald-800' },
        body: (
          <>
            {renderFolder({
              folder: 'nocobrados',
              title: '🔴 No cobrados',
              subtitle: 'Se cobran en la cuenta diaria o semanal del cliente',
              count: groups.noCobrados.length,
              tone: 'rose',
              amount: { label: 'Falta cobrar', value: sumTotal(groups.noCobrados), className: 'text-rose-700' },
              body: groups.noCobrados.length === 0 ? renderEmpty('Ninguno por cobrar.') : groups.noCobrados.map(renderReadyCard),
            })}
            {renderFolder({
              folder: 'cobrados',
              title: '✓ Cobrados',
              subtitle: 'Ya pagados',
              count: groups.cobrados.length,
              tone: 'emerald',
              amount: { label: 'Total cobrado', value: sumTotal(groups.cobrados), className: 'text-emerald-700' },
              body: groups.cobrados.length === 0 ? renderEmpty('Aún no hay lonches cobrados.') : groups.cobrados.map(renderReadyCard),
            })}
          </>
        ),
      })}
    </div>
  );
};
