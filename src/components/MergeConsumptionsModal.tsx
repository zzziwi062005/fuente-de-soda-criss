import React, { useState, useMemo, useEffect } from 'react';
import { ConsumptionRecord, ClientRecord } from '../types';
import { formatCurrency } from '../utils/pricing';
import { GitMerge, Search, Check, AlertCircle, Calendar, X, Utensils, CheckCircle2 } from 'lucide-react';

interface MergeConsumptionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  consumptions: ConsumptionRecord[];
  clients: ClientRecord[];
  initialMainConsId?: string | null;
  onMergeConsumptions: (mainConsumptionId: string, secondaryConsumptionIds: string[]) => void;
}

export const MergeConsumptionsModal: React.FC<MergeConsumptionsModalProps> = ({
  isOpen,
  onClose,
  consumptions,
  clients,
  initialMainConsId,
  onMergeConsumptions,
}) => {
  const [selectedMainId, setSelectedMainId] = useState<string | null>(initialMainConsId || null);
  const [selectedSecondaryIds, setSelectedSecondaryIds] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<'todos' | 'solo_extras' | 'diarias' | 'semanales'>('todos');

  // Sincronizar initialMainConsId cuando cambia al abrir
  useEffect(() => {
    if (initialMainConsId) {
      setSelectedMainId(initialMainConsId);
    } else if (!selectedMainId && consumptions.length > 0) {
      // Si no hay ninguno preseleccionado, no fijamos para que el usuario elija
      setSelectedMainId(null);
    }
    setSelectedSecondaryIds([]);
    setSearchTerm('');
    setCategoryFilter('todos');
  }, [isOpen, initialMainConsId]);

  const mainCons = useMemo(() => {
    return consumptions.find((c) => c.id === selectedMainId) || null;
  }, [consumptions, selectedMainId]);

  // Lista de consumos disponibles como secundarios (excluye al principal seleccionado)
  const availableSecondaries = useMemo(() => {
    return consumptions.filter((c) => {
      if (c.id === selectedMainId) return false;

      // Filtro por categoría
      if (categoryFilter === 'solo_extras') {
        const hasOnlyExtras = c.extras.length > 0 && c.lunches.length === 0;
        const hasExtras = c.extras.length > 0;
        if (!hasExtras && !hasOnlyExtras) return false;
      } else if (categoryFilter === 'diarias' && c.accountType !== 'diaria') {
        return false;
      } else if (categoryFilter === 'semanales' && c.accountType !== 'semanal') {
        return false;
      }

      // Filtro por búsqueda
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const clientMatch = c.clientName.toLowerCase().includes(q);
        const pisoMatch = (c.piso || '').toLowerCase().includes(q);
        const dayMatch = (c.dayOfWeek || '').toLowerCase().includes(q);
        const dateMatch = (c.date || '').includes(q);
        const lunchMatch = c.lunches.some((l) =>
          (l.segundo || '').toLowerCase().includes(q) || (l.notes || '').toLowerCase().includes(q)
        );
        const extraMatch = c.extras.some((e) =>
          e.name.toLowerCase().includes(q) || (e.description || '').toLowerCase().includes(q)
        );
        if (!clientMatch && !pisoMatch && !dayMatch && !dateMatch && !lunchMatch && !extraMatch) {
          return false;
        }
      }

      return true;
    });
  }, [consumptions, selectedMainId, categoryFilter, searchTerm]);

  // Candidatos para elegir como Main si no hay uno seleccionado
  const candidateMains = useMemo(() => {
    if (!searchTerm.trim()) return consumptions.slice(0, 30);
    const q = searchTerm.toLowerCase();
    return consumptions.filter((c) => {
      return (
        c.clientName.toLowerCase().includes(q) ||
        (c.piso || '').toLowerCase().includes(q) ||
        c.date.includes(q) ||
        c.lunches.some((l) => (l.segundo || '').toLowerCase().includes(q)) ||
        c.extras.some((e) => e.name.toLowerCase().includes(q))
      );
    });
  }, [consumptions, searchTerm]);

  const toggleSecondary = (id: string) => {
    setSelectedSecondaryIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const selectedSecondaries = useMemo(() => {
    const set = new Set(selectedSecondaryIds);
    return consumptions.filter((c) => set.has(c.id));
  }, [consumptions, selectedSecondaryIds]);

  // Cálculo del resultado combinado
  const combinedSummary = useMemo(() => {
    if (!mainCons || selectedSecondaries.length === 0) return null;

    let totalLunches = [...mainCons.lunches];
    let totalExtras = [...mainCons.extras];

    selectedSecondaries.forEach((sec) => {
      totalLunches = [...totalLunches, ...sec.lunches];
      totalExtras = [...totalExtras, ...sec.extras];
    });

    const lTotal = totalLunches.reduce((s, l) => s + l.totalPrice, 0);
    const eTotal = totalExtras.reduce((s, e) => s + e.totalPrice, 0);
    const newTotal = lTotal + eTotal;
    const addedAmount = selectedSecondaries.reduce((s, c) => s + c.total, 0);

    return {
      newTotal,
      addedAmount,
      totalLunchesCount: totalLunches.reduce((s, l) => s + l.quantity, 0),
      totalExtrasCount: totalExtras.reduce((s, e) => s + e.quantity, 0),
      allExtrasNames: Array.from(new Set(totalExtras.map((e) => e.name))),
    };
  }, [mainCons, selectedSecondaries]);

  const handleConfirmMerge = () => {
    if (!selectedMainId || selectedSecondaryIds.length === 0) return;
    onMergeConsumptions(selectedMainId, selectedSecondaryIds);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-3xl w-full shadow-2xl border border-stone-200 overflow-hidden my-auto flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-stone-900 text-white px-5 py-4 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-600/30 border border-indigo-500/40 rounded-xl text-indigo-300">
              <GitMerge className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-base sm:text-lg">Combinar Pedidos y Adicionales</h3>
                <span className="text-[11px] bg-indigo-500/20 text-indigo-300 font-bold px-2 py-0.5 rounded-full border border-indigo-500/30">
                  Unificar en Main
                </span>
              </div>
              <p className="text-xs text-stone-400">
                Une adicionales (ej. palta, bebidas) a un pedido principal. El pedido principal conservará su día, cliente, piso y categoría.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-stone-400 hover:text-white hover:bg-stone-800 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5">
          {/* PASO 1: PEDIDO PRINCIPAL (MAIN) */}
          <div className="bg-stone-50 rounded-2xl p-4 border border-stone-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-black uppercase tracking-wider text-stone-700 flex items-center gap-1.5">
                <span>1. Pedido Principal (Main Target)</span>
                <span className="text-[10px] bg-amber-100 text-amber-900 font-bold px-1.5 py-0.2 rounded border border-amber-300">
                  Conservará día, cliente y piso
                </span>
              </span>
              {mainCons && (
                <button
                  type="button"
                  onClick={() => setSelectedMainId(null)}
                  className="text-xs text-indigo-700 hover:text-indigo-900 font-bold underline"
                >
                  Cambiar Main
                </button>
              )}
            </div>

            {mainCons ? (
              <div className="bg-white rounded-xl p-3 border-2 border-indigo-500/60 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-white bg-indigo-700 px-2 py-0.5 rounded-md">
                      ⭐ MAIN
                    </span>
                    <strong className="text-sm font-black text-stone-900">
                      {mainCons.clientName}
                    </strong>
                    <span className="text-xs font-semibold text-stone-500 bg-stone-100 px-2 py-0.5 rounded-md">
                      {mainCons.piso}
                    </span>
                    <span className="text-xs font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md capitalize">
                      {mainCons.accountType === 'semanal' ? 'Cuenta Semanal' : 'Cuenta Diaria'}
                    </span>
                  </div>
                  <div className="text-xs text-stone-600 flex items-center gap-2">
                    <span className="font-semibold text-indigo-950 flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-indigo-700" />
                      {mainCons.dayOfWeek} {mainCons.date}
                    </span>
                    <span>•</span>
                    <span>
                      {mainCons.lunches.map((l) => `${l.quantity}x ${l.menuType === 'menu_completo' ? 'Menú' : 'Segundo'}`).join(', ') || 'Sin menús'}
                      {mainCons.extras.length > 0 && ` + ${mainCons.extras.map((e) => `${e.quantity}x ${e.name}`).join(', ')}`}
                    </span>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <span className="text-xs text-stone-500 block">Subtotal Main:</span>
                  <span className="text-base font-black text-indigo-950">
                    {formatCurrency(mainCons.total)}
                  </span>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-stone-500">
                  Selecciona cuál será el pedido principal que absorberá a los demás:
                </p>
                <div className="relative">
                  <Search className="w-4 h-4 text-stone-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Buscar pedido por cliente, piso o fecha..."
                    className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  />
                </div>
                <div className="max-h-48 overflow-y-auto divide-y divide-stone-100 bg-white rounded-xl border border-stone-200">
                  {candidateMains.length === 0 ? (
                    <div className="p-3 text-center text-xs text-stone-400 italic">
                      No se encontraron pedidos con ese criterio.
                    </div>
                  ) : (
                    candidateMains.map((c) => (
                      <div
                        key={c.id}
                        onClick={() => {
                          setSelectedMainId(c.id);
                          setSearchTerm('');
                        }}
                        className="p-2.5 hover:bg-indigo-50/60 cursor-pointer flex items-center justify-between text-xs transition-colors"
                      >
                        <div>
                          <div className="flex items-center gap-1.5">
                            <strong className="text-stone-900">{c.clientName}</strong>
                            <span className="text-[10px] text-stone-500 bg-stone-100 px-1.5 py-0.2 rounded">
                              {c.piso}
                            </span>
                            <span className="text-[10px] text-amber-800 bg-amber-50 px-1 rounded">
                              {c.dayOfWeek} {c.date}
                            </span>
                          </div>
                          <div className="text-[11px] text-stone-500 mt-0.5 truncate max-w-md">
                            {c.lunches.map((l) => `${l.quantity}x ${l.menuType === 'menu_completo' ? 'Menú' : 'Segundo'}`).join(', ')}
                            {c.extras.length > 0 && ` + ${c.extras.map((e) => `${e.quantity}x ${e.name}`).join(', ')}`}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="font-black text-indigo-950 block">
                            {formatCurrency(c.total)}
                          </span>
                          <span className="text-[10px] text-indigo-700 font-bold hover:underline">
                            Elegir Main →
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* PASO 2: SELECCIONAR ADICIONALES O PEDIDOS A COMBINAR */}
          {mainCons && (
            <div className="bg-stone-50 rounded-2xl p-4 border border-stone-200 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <span className="text-xs font-black uppercase tracking-wider text-stone-700 block">
                    2. Selecciona los Adicionales o Pedidos Secundarios a Unificar
                  </span>
                  <p className="text-[11px] text-stone-500">
                    Marca los platos o extras (ej. "palta", bebidas u otros consumos) que pasarán al pedido principal.
                  </p>
                </div>
                <span className="text-xs font-bold text-indigo-800 bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded-lg shrink-0">
                  {selectedSecondaryIds.length} seleccionado(s)
                </span>
              </div>

              {/* Filtros rápidos & búsqueda */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Buscar producto (ej. 'palta', 'gaseosa') o cliente..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  />
                </div>

                <div className="flex items-center gap-1 text-[11px] font-bold">
                  <button
                    type="button"
                    onClick={() => setCategoryFilter('todos')}
                    className={`px-2 py-1 rounded-lg border transition-colors ${
                      categoryFilter === 'todos'
                        ? 'bg-indigo-700 text-white border-indigo-800'
                        : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-100'
                    }`}
                  >
                    Todos
                  </button>
                  <button
                    type="button"
                    onClick={() => setCategoryFilter('solo_extras')}
                    className={`px-2 py-1 rounded-lg border transition-colors ${
                      categoryFilter === 'solo_extras'
                        ? 'bg-indigo-700 text-white border-indigo-800'
                        : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-100'
                    }`}
                    title="Filtrar solo pedidos con adicionales o bebidas (ej. palta, gaseosa)"
                  >
                    🥤 Solo Adicionales / Extras
                  </button>
                  <button
                    type="button"
                    onClick={() => setCategoryFilter('diarias')}
                    className={`px-2 py-1 rounded-lg border transition-colors ${
                      categoryFilter === 'diarias'
                        ? 'bg-indigo-700 text-white border-indigo-800'
                        : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-100'
                    }`}
                  >
                    Diarias
                  </button>
                  <button
                    type="button"
                    onClick={() => setCategoryFilter('semanales')}
                    className={`px-2 py-1 rounded-lg border transition-colors ${
                      categoryFilter === 'semanales'
                        ? 'bg-indigo-700 text-white border-indigo-800'
                        : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-100'
                    }`}
                  >
                    Semanales
                  </button>
                </div>
              </div>

              {/* Lista de consumos secundarios para combinar */}
              <div className="max-h-60 overflow-y-auto divide-y divide-stone-100 bg-white rounded-xl border border-stone-200 shadow-2xs">
                {availableSecondaries.length === 0 ? (
                  <div className="p-4 text-center text-xs text-stone-400 italic">
                    No hay otros pedidos disponibles en este filtro para combinar.
                  </div>
                ) : (
                  availableSecondaries.map((sec) => {
                    const isChecked = selectedSecondaryIds.includes(sec.id);
                    const hasExtras = sec.extras.length > 0;
                    return (
                      <div
                        key={sec.id}
                        onClick={() => toggleSecondary(sec.id)}
                        className={`p-3 cursor-pointer flex items-center justify-between text-xs transition-colors ${
                          isChecked ? 'bg-indigo-50/80 ring-1 ring-inset ring-indigo-400' : 'hover:bg-stone-50'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {}}
                            className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-stone-300"
                          />
                          <div>
                            <div className="flex items-center gap-2">
                              <strong className="text-stone-900 font-bold">{sec.clientName}</strong>
                              <span className="text-[10px] text-stone-500 bg-stone-100 px-1.5 py-0.2 rounded font-medium">
                                {sec.piso}
                              </span>
                              <span className="text-[10px] text-amber-800 bg-amber-50 px-1.5 py-0.2 rounded font-bold">
                                {sec.dayOfWeek} {sec.date}
                              </span>
                              {hasExtras && (
                                <span className="text-[9px] bg-emerald-100 text-emerald-800 font-extrabold px-1.5 py-0.2 rounded border border-emerald-300">
                                  Contiene Adicional
                                </span>
                              )}
                            </div>

                            <div className="text-[11px] text-stone-600 mt-1 space-y-0.5">
                              {sec.lunches.length > 0 && (
                                <div>
                                  🍛 {sec.lunches.map((l) => `${l.quantity}x ${l.menuType === 'menu_completo' ? 'Menú' : 'Segundo'}`).join(', ')}
                                </div>
                              )}
                              {sec.extras.length > 0 && (
                                <div className="text-emerald-900 font-bold">
                                  🥤 {sec.extras.map((e) => `${e.quantity}x ${e.name} (${formatCurrency(e.totalPrice)})`).join(', ')}
                                </div>
                              )}
                              {sec.notes && (
                                <div className="text-[10px] text-stone-400 italic">
                                  "{sec.notes}"
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <span className="font-black text-amber-950 text-xs block">
                            +{formatCurrency(sec.total)}
                          </span>
                          <span className="text-[10px] text-stone-500">
                            {sec.paymentStatus === 'pagado' ? '✓ Pagado' : '⚠️ Pendiente'}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* PASO 3: RESUMEN Y VISTA PREVIA RESULTANTE */}
          {mainCons && combinedSummary && (
            <div className="bg-indigo-50/80 rounded-2xl p-4 border border-indigo-200 space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-indigo-700" />
                <h4 className="font-black text-sm text-indigo-950">
                  Vista Previa del Pedido Combinado
                </h4>
              </div>

              <div className="bg-white rounded-xl p-3 border border-indigo-200 text-xs space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-stone-100 pb-2">
                  <div>
                    <span className="text-stone-500">Asignado a:</span>{' '}
                    <strong className="text-stone-900 font-extrabold">{mainCons.clientName}</strong>{' '}
                    <span className="text-stone-500">({mainCons.piso})</span>
                  </div>
                  <div>
                    <span className="text-stone-500">Día y fecha:</span>{' '}
                    <strong className="text-indigo-950 font-bold">{mainCons.dayOfWeek} {mainCons.date}</strong>
                  </div>
                </div>

                <div className="text-stone-700">
                  <span className="font-bold text-stone-800 block mb-0.5">
                    Adicionales y platos unificados:
                  </span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {combinedSummary.allExtrasNames.map((name) => (
                      <span key={name} className="px-2 py-0.5 bg-emerald-50 text-emerald-900 border border-emerald-300 rounded-md font-bold text-[11px]">
                        +{name}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-stone-100">
                  <span className="text-stone-600 font-medium">
                    Total anterior: {formatCurrency(mainCons.total)} + Adicionales ({formatCurrency(combinedSummary.addedAmount)})
                  </span>
                  <div className="text-right">
                    <span className="text-[11px] text-stone-500 block">Nuevo Total Main:</span>
                    <strong className="text-base font-black text-indigo-950">
                      {formatCurrency(combinedSummary.newTotal)}
                    </strong>
                  </div>
                </div>
              </div>

              <p className="text-[11px] text-indigo-900 font-medium">
                ℹ️ Al confirmar, los adicionales adoptarán el día <strong>{mainCons.dayOfWeek} {mainCons.date}</strong> y el cliente <strong>{mainCons.clientName}</strong>. Los pedidos secundarios se integrarán y se limpiarán de la lista.
              </p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="bg-stone-100 px-5 py-3.5 border-t border-stone-200 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-white hover:bg-stone-200 text-stone-700 font-bold rounded-xl text-xs border border-stone-300 transition-colors shadow-2xs"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={handleConfirmMerge}
            disabled={!mainCons || selectedSecondaryIds.length === 0}
            className={`px-5 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all shadow-sm ${
              mainCons && selectedSecondaryIds.length > 0
                ? 'bg-indigo-700 hover:bg-indigo-800 text-white cursor-pointer active:scale-95 shadow-indigo-200'
                : 'bg-stone-200 text-stone-400 cursor-not-allowed opacity-60'
            }`}
          >
            <GitMerge className="w-4 h-4" />
            <span>
              Combinar {selectedSecondaryIds.length > 0 ? `(${selectedSecondaryIds.length}) Adicional(es) con Main` : 'con Main'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
