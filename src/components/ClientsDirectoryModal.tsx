import React, { useState, useMemo } from 'react';
import {
  Users,
  Search,
  UserPlus,
  Edit3,
  Trash2,
  Phone,
  Store,
  X,
  Building,
  GitMerge,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ShieldAlert,
  Sparkles,
  Check,
} from 'lucide-react';
import { ClientRecord, ConsumptionRecord, PaymentRecord } from '../types';
import { formatPhoneDisplay } from '../utils/phone';
import { normalizeClientName } from '../utils/clientUtils';

interface ClientsDirectoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  clients: ClientRecord[];
  consumptions: ConsumptionRecord[];
  payments: PaymentRecord[];
  onEditClient: (client: ClientRecord) => void;
  onNewClient: () => void;
  onDeleteClient: (clientId: string, clientName: string) => void;
  onMergeClients: (mainClientId: string, secondaryClientIds: string[]) => void;
}

export const ClientsDirectoryModal: React.FC<ClientsDirectoryModalProps> = ({
  isOpen,
  onClose,
  clients,
  consumptions,
  payments,
  onEditClient,
  onNewClient,
  onDeleteClient,
  onMergeClients,
}) => {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'semanal' | 'diaria'>('all');
  const [floorFilter, setFloorFilter] = useState<string>('all');

  // Merge Mode state
  const [isMergeMode, setIsMergeMode] = useState(false);
  const [selectedForMerge, setSelectedForMerge] = useState<string[]>([]);
  const [showConfirmMergeModal, setShowConfirmMergeModal] = useState(false);

  // Unique floors from clients
  const uniqueFloors = useMemo(() => {
    const set = new Set<string>();
    clients.forEach((c) => {
      if (c.piso) set.add(c.piso);
    });
    return Array.from(set).sort();
  }, [clients]);

  // Filter clients
  const filteredClients = useMemo(() => {
    const q = search.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return clients.filter((c) => {
      if (typeFilter !== 'all' && c.accountType !== typeFilter) return false;
      if (floorFilter !== 'all' && c.piso !== floorFilter) return false;
      if (!q) return true;

      const normName = c.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const normPiso = (c.piso || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const normNotes = (c.notes || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const normPhone = (c.phone || '').replace(/\D/g, '');

      return (
        normName.includes(q) ||
        normPiso.includes(q) ||
        normNotes.includes(q) ||
        normPhone.includes(q)
      );
    });
  }, [clients, search, typeFilter, floorFilter]);

  // Toggle client in merge selection
  const handleToggleMergeClient = (clientId: string) => {
    setSelectedForMerge((prev) => {
      if (prev.includes(clientId)) {
        return prev.filter((id) => id !== clientId);
      } else {
        return [...prev, clientId];
      }
    });
  };

  // Main client is the first one selected
  const mainClientId = selectedForMerge[0];
  const secondaryClientIds = selectedForMerge.slice(1);
  const mainClient = clients.find((c) => c.id === mainClientId);
  const secondaryClients = clients.filter((c) => secondaryClientIds.includes(c.id));

  // Count consumptions and payments that will be unified
  const mergeStats = useMemo(() => {
    if (!mainClient || secondaryClientIds.length === 0) return { consumptions: 0, payments: 0 };
    const secIdsSet = new Set(secondaryClientIds);
    const secNamesNorm = new Set(secondaryClients.map((c) => normalizeClientName(c.name)));

    const cCount = consumptions.filter(
      (c) => secIdsSet.has(c.clientId) || secNamesNorm.has(normalizeClientName(c.clientName))
    ).length;

    const pCount = payments.filter(
      (p) => secIdsSet.has(p.clientId) || secNamesNorm.has(normalizeClientName(p.clientName))
    ).length;

    return { consumptions: cCount, payments: pCount };
  }, [mainClient, secondaryClientIds, secondaryClients, consumptions, payments]);

  const handleExecuteMerge = () => {
    if (!mainClientId || secondaryClientIds.length === 0) return;
    onMergeClients(mainClientId, secondaryClientIds);
    setShowConfirmMergeModal(false);
    setSelectedForMerge([]);
    setIsMergeMode(false);
  };

  const handleCancelMergeMode = () => {
    setIsMergeMode(false);
    setSelectedForMerge([]);
    setShowConfirmMergeModal(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-4xl w-full shadow-2xl border border-stone-200 overflow-hidden my-auto flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-stone-900 text-white px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-600/30 border border-amber-500/40 rounded-xl text-amber-300">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-base sm:text-lg">Directorio de Clientes</h3>
                <span className="text-[11px] bg-amber-500/20 text-amber-300 font-bold px-2 py-0.5 rounded-full border border-amber-500/30">
                  {clients.length} registrados
                </span>
              </div>
              <p className="text-xs text-stone-400">
                Lista de clientes registrados para Cuentas Diarias y Semanales
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            {/* Button: Combinar Clientes */}
            <button
              type="button"
              onClick={() => {
                if (isMergeMode) {
                  handleCancelMergeMode();
                } else {
                  setIsMergeMode(true);
                  setSelectedForMerge([]);
                }
              }}
              className={`font-bold text-xs sm:text-sm px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition-colors shadow-xs ${
                isMergeMode
                  ? 'bg-amber-500 text-amber-950 font-black ring-2 ring-amber-300'
                  : 'bg-stone-800 hover:bg-stone-700 text-amber-300 border border-stone-700'
              }`}
              title="Fusionar cuentas duplicadas en un solo cliente principal"
            >
              <GitMerge className="w-4 h-4" />
              <span>{isMergeMode ? 'Cancelar Combinar' : 'Combinar Clientes'}</span>
            </button>

            {/* Button: Nuevo Cliente */}
            {!isMergeMode && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onNewClient();
                }}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm px-3.5 py-2 rounded-xl flex items-center gap-1.5 shadow-xs transition-colors"
              >
                <UserPlus className="w-4 h-4" />
                <span>+ Nuevo Cliente</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-stone-400 hover:text-white rounded-xl hover:bg-stone-800 transition-colors ml-auto sm:ml-0"
              title="Cerrar directorio"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Instructions banner when Merge Mode is active */}
        {isMergeMode && (
          <div className="bg-gradient-to-r from-amber-500/15 via-amber-400/10 to-indigo-500/15 border-b border-amber-300/60 p-3.5 shrink-0">
            <div className="flex items-start gap-2.5">
              <div className="p-1.5 bg-amber-500 text-amber-950 rounded-lg shrink-0 mt-0.5">
                <GitMerge className="w-4 h-4" />
              </div>
              <div className="text-xs text-stone-800 flex-1 space-y-1">
                <div className="font-black text-amber-950 text-sm flex items-center gap-2">
                  <span>Modo Combinar Clientes (Unificar Duplicados)</span>
                  <span className="text-[11px] font-bold px-2 py-0.5 bg-amber-200 text-amber-900 rounded-full">
                    {selectedForMerge.length} seleccionados
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-0.5 text-stone-700">
                  <div className="bg-white/80 p-2 rounded-xl border border-amber-200">
                    <span className="font-extrabold text-amber-900 block">
                      1. El primer cliente que selecciones será el PRINCIPAL (Main):
                    </span>
                    <span className="text-[11px] text-stone-600">
                      Mantendrá su ficha y recibirá todos los pedidos y pagos históricos.
                    </span>
                  </div>
                  <div className="bg-white/80 p-2 rounded-xl border border-indigo-200">
                    <span className="font-extrabold text-indigo-900 block">
                      2. Los siguientes clientes seleccionados se le sumarán:
                    </span>
                    <span className="text-[11px] text-stone-600">
                      Sus consumos se transferirán al principal y sus fichas duplicadas se eliminarán.
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Filter and Search Bar */}
        <div className="p-4 bg-stone-50 border-b border-stone-200 shrink-0 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nombre, piso, tienda o celular..."
                className="w-full text-xs sm:text-sm font-semibold pl-10 pr-4 py-2 bg-white border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-stone-400 hover:text-stone-700 font-bold"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Type Filter */}
            <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-stone-300 shrink-0">
              <button
                type="button"
                onClick={() => setTypeFilter('all')}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors ${
                  typeFilter === 'all'
                    ? 'bg-amber-800 text-white shadow-2xs'
                    : 'text-stone-600 hover:bg-stone-100'
                }`}
              >
                Todos ({clients.length})
              </button>
              <button
                type="button"
                onClick={() => setTypeFilter('semanal')}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors ${
                  typeFilter === 'semanal'
                    ? 'bg-amber-800 text-white shadow-2xs'
                    : 'text-stone-600 hover:bg-stone-100'
                }`}
              >
                Semanales ({clients.filter((c) => c.accountType === 'semanal').length})
              </button>
              <button
                type="button"
                onClick={() => setTypeFilter('diaria')}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors ${
                  typeFilter === 'diaria'
                    ? 'bg-amber-800 text-white shadow-2xs'
                    : 'text-stone-600 hover:bg-stone-100'
                }`}
              >
                Diarios ({clients.filter((c) => c.accountType === 'diaria').length})
              </button>
            </div>
          </div>

          {/* Floor filter chips */}
          {uniqueFloors.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
              <span className="text-stone-500 font-bold text-[11px] shrink-0 mr-1 flex items-center gap-1">
                <Building className="w-3.5 h-3.5 text-stone-400" />
                <span>Piso:</span>
              </span>
              <button
                type="button"
                onClick={() => setFloorFilter('all')}
                className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-colors shrink-0 ${
                  floorFilter === 'all'
                    ? 'bg-stone-800 text-white'
                    : 'bg-white border border-stone-200 text-stone-600 hover:bg-stone-100'
                }`}
              >
                Todos
              </button>
              {uniqueFloors.map((piso) => (
                <button
                  key={piso}
                  type="button"
                  onClick={() => setFloorFilter(piso)}
                  className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-colors shrink-0 ${
                    floorFilter === piso
                      ? 'bg-stone-800 text-white'
                      : 'bg-white border border-stone-200 text-stone-600 hover:bg-stone-100'
                  }`}
                >
                  {piso}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Clients List - Clean vertical list view without debt */}
        <div className="p-4 overflow-y-auto flex-1 space-y-2">
          {filteredClients.length === 0 ? (
            <div className="text-center py-12 text-stone-400">
              <Store className="w-12 h-12 mx-auto mb-2 text-stone-300 stroke-[1.5]" />
              <p className="font-bold text-sm text-stone-600">No se encontraron clientes</p>
              <p className="text-xs text-stone-400 mt-0.5">
                Prueba cambiando los filtros o agrega un nuevo cliente.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-stone-100 border border-stone-200 rounded-2xl bg-white overflow-hidden shadow-2xs">
              {filteredClients.map((client) => {
                const isSelected = selectedForMerge.includes(client.id);
                const isMain = selectedForMerge[0] === client.id;
                const mergeOrder = selectedForMerge.indexOf(client.id);

                return (
                  <div
                    key={client.id}
                    onClick={() => {
                      if (isMergeMode) {
                        handleToggleMergeClient(client.id);
                      }
                    }}
                    className={`p-3 sm:p-3.5 transition-all flex items-center justify-between gap-3 ${
                      isMergeMode ? 'cursor-pointer select-none' : ''
                    } ${
                      isMain
                        ? 'bg-amber-50/90 border-l-4 border-l-amber-600 ring-1 ring-amber-400/40'
                        : isSelected
                        ? 'bg-indigo-50/80 border-l-4 border-l-indigo-600 ring-1 ring-indigo-300/40'
                        : 'hover:bg-stone-50/80'
                    }`}
                  >
                    {/* Left: Indicator / Avatar + Client Information */}
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {/* Selection Checkbox for Merge Mode */}
                      {isMergeMode && (
                        <div className="shrink-0">
                          {isMain ? (
                            <div className="w-7 h-7 rounded-xl bg-amber-600 text-white flex items-center justify-center font-black text-xs shadow-xs" title="Cliente Principal">
                              ⭐ 1
                            </div>
                          ) : isSelected ? (
                            <div className="w-7 h-7 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-black text-xs shadow-xs" title={`A fusionar (#${mergeOrder + 1})`}>
                              #{mergeOrder + 1}
                            </div>
                          ) : (
                            <div className="w-7 h-7 rounded-xl border-2 border-stone-300 bg-white hover:border-amber-500 transition-colors" />
                          )}
                        </div>
                      )}

                      {/* Client Avatar / Icon */}
                      {!isMergeMode && (
                        <div className="w-9 h-9 rounded-xl bg-stone-100 border border-stone-200 text-stone-700 font-black text-xs flex items-center justify-center shrink-0">
                          {client.name.substring(0, 2).toUpperCase()}
                        </div>
                      )}

                      {/* Client text data */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-extrabold text-stone-900 text-sm truncate">
                            {client.name}
                          </h4>

                          {/* Piso / Floor badge */}
                          <span
                            className={`text-[10px] font-black px-2 py-0.5 rounded-md border ${
                              client.piso === 'Calle'
                                ? 'bg-blue-50 text-blue-900 border-blue-200'
                                : 'bg-amber-50 text-amber-900 border-amber-200'
                            }`}
                          >
                            📍 {client.piso || 'Sin piso'}
                          </span>

                          {/* Tipo de cuenta */}
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                              client.accountType === 'semanal'
                                ? 'bg-purple-100 text-purple-900'
                                : 'bg-emerald-100 text-emerald-900'
                            }`}
                          >
                            {client.accountType === 'semanal' ? 'Cuenta Semanal' : 'Cuenta Diaria'}
                          </span>

                          {/* Merge Role Badge */}
                          {isMergeMode && isMain && (
                            <span className="text-[10px] font-black bg-amber-600 text-white px-2 py-0.5 rounded-md shadow-2xs animate-pulse">
                              ⭐ PRINCIPAL (Main)
                            </span>
                          )}
                          {isMergeMode && isSelected && !isMain && (
                            <span className="text-[10px] font-black bg-indigo-600 text-white px-2 py-0.5 rounded-md shadow-2xs">
                              🔄 A fusionar
                            </span>
                          )}
                        </div>

                        {/* Extra info: Notes & Phone */}
                        <div className="flex items-center gap-3 mt-0.5 flex-wrap text-xs text-stone-500">
                          {client.phone && (
                            <div className="flex items-center gap-1 text-emerald-700 font-semibold">
                              <Phone className="w-3 h-3 text-emerald-600" />
                              <span>{formatPhoneDisplay(client.phone)}</span>
                            </div>
                          )}

                          {client.notes && (
                            <span className="italic text-stone-400 line-clamp-1">
                              "{client.notes}"
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right: Actions (only when not in merge mode) */}
                    {!isMergeMode ? (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onEditClient(client);
                          }}
                          className="px-2.5 py-1.5 bg-stone-100 hover:bg-amber-100 text-stone-700 hover:text-amber-950 font-bold text-xs rounded-xl border border-stone-200 flex items-center gap-1 transition-colors"
                          title="Editar piso, nombre, tienda o celular"
                        >
                          <Edit3 className="w-3.5 h-3.5 text-stone-500" />
                          <span className="hidden sm:inline">Editar</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => onDeleteClient(client.id, client.name)}
                          className="p-1.5 bg-stone-100 hover:bg-rose-100 text-stone-500 hover:text-rose-700 rounded-xl border border-stone-200 transition-colors"
                          title="Eliminar cliente del sistema"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="shrink-0">
                        {isMain ? (
                          <span className="text-xs font-black text-amber-800 bg-amber-100 px-2.5 py-1 rounded-lg">
                            Cliente Principal
                          </span>
                        ) : isSelected ? (
                          <span className="text-xs font-bold text-indigo-700 bg-indigo-100 px-2.5 py-1 rounded-lg">
                            Se sumará
                          </span>
                        ) : (
                          <span className="text-xs text-stone-400 font-medium">
                            Clic para sumar
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Sticky Merge Action Bar when in Merge Mode */}
        {isMergeMode && (
          <div className="bg-amber-50 border-t border-amber-300 p-3 sm:p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
            <div className="text-xs text-stone-800 w-full sm:w-auto">
              {mainClient ? (
                <div>
                  <span className="text-stone-500 font-bold block">
                    Cliente Principal: <strong className="text-amber-950 text-sm">{mainClient.name}</strong> ({mainClient.piso})
                  </span>
                  <span className="text-stone-600 text-[11px]">
                    {secondaryClientIds.length > 0 ? (
                      <span className="text-indigo-900 font-bold">
                        {secondaryClientIds.length} cliente(s) secundario(s) a unificar ({mergeStats.consumptions} pedidos y {mergeStats.payments} abonos pasarán a {mainClient.name}).
                      </span>
                    ) : (
                      'Selecciona ahora el o los clientes que deseas fusionarle.'
                    )}
                  </span>
                </div>
              ) : (
                <span className="text-stone-600 font-bold italic">
                  👉 Haz clic en la lista para elegir el cliente PRINCIPAL...
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={handleCancelMergeMode}
                className="px-3.5 py-2 bg-white hover:bg-stone-100 text-stone-700 font-bold rounded-xl border border-stone-300 text-xs transition-colors"
              >
                Cancelar
              </button>

              <button
                type="button"
                disabled={!mainClient || secondaryClientIds.length === 0}
                onClick={() => setShowConfirmMergeModal(true)}
                className={`px-4 py-2 font-black rounded-xl text-xs flex items-center gap-1.5 shadow-xs transition-colors ${
                  mainClient && secondaryClientIds.length > 0
                    ? 'bg-amber-800 hover:bg-amber-900 text-white cursor-pointer'
                    : 'bg-stone-300 text-stone-500 cursor-not-allowed'
                }`}
              >
                <GitMerge className="w-4 h-4" />
                <span>Confirmar y Unificar ({selectedForMerge.length})</span>
              </button>
            </div>
          </div>
        )}

        {/* Regular Footer when not merging */}
        {!isMergeMode && (
          <div className="bg-stone-50 px-5 py-3 border-t border-stone-200 flex items-center justify-between text-xs text-stone-500 shrink-0">
            <span>Mostrando {filteredClients.length} de {clients.length} clientes</span>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 bg-stone-200 hover:bg-stone-300 text-stone-800 font-bold rounded-xl transition-colors"
            >
              Cerrar
            </button>
          </div>
        )}
      </div>

      {/* Confirmation Modal for Client Merge */}
      {showConfirmMergeModal && mainClient && (
        <div className="fixed inset-0 z-60 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-100">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-stone-200 overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="p-4 bg-amber-800 text-white flex items-center gap-2.5">
              <div className="p-2 bg-amber-700 rounded-xl">
                <GitMerge className="w-5 h-5 text-amber-200" />
              </div>
              <div>
                <h4 className="font-black text-base">¿Combinar {secondaryClientIds.length + 1} Clientes?</h4>
                <p className="text-xs text-amber-200">Unificar registros y eliminar duplicados</p>
              </div>
            </div>

            <div className="p-5 space-y-3.5 text-xs text-stone-700">
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 space-y-1.5">
                <span className="font-black text-amber-950 text-sm block">
                  ⭐ Cliente Principal (Permanecerá):
                </span>
                <p className="font-extrabold text-stone-900 text-xs">
                  {mainClient.name} ({mainClient.piso}) • {mainClient.accountType === 'semanal' ? 'Cuenta Semanal' : 'Cuenta Diaria'}
                </p>
              </div>

              <div className="p-3 bg-indigo-50 rounded-xl border border-indigo-200 space-y-1.5">
                <span className="font-black text-indigo-950 text-sm block">
                  🔄 Clientes que se le sumarán (Se eliminarán sus fichas):
                </span>
                <ul className="list-disc list-inside space-y-0.5 text-stone-800 font-semibold">
                  {secondaryClients.map((c) => (
                    <li key={c.id}>
                      {c.name} ({c.piso})
                    </li>
                  ))}
                </ul>
              </div>

              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-950 space-y-1">
                <div className="font-black flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                  <span>Protección total de ventas:</span>
                </div>
                <p className="text-[11px] text-emerald-900 leading-relaxed">
                  Todos los <strong>{mergeStats.consumptions} pedidos</strong> y <strong>{mergeStats.payments} abonos</strong> registrados en los clientes duplicados se reasignarán automáticamente a <strong>{mainClient.name}</strong>. No se perderá ningún consumo ni cobro.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowConfirmMergeModal(false)}
                  className="w-full py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold rounded-xl text-xs transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleExecuteMerge}
                  className="w-full py-2.5 bg-amber-800 hover:bg-amber-900 text-white font-black rounded-xl text-xs shadow-xs transition-colors"
                >
                  Sí, Combinar y Unificar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
