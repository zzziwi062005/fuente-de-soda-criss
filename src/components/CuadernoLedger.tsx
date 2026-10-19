import React, { useState, useMemo } from 'react';
import { 
  ClientRecord, 
  ConsumptionRecord, 
  PaymentRecord, 
  MesaCounterRecord, 
  ExtraItem, 
  LunchItem,
  DayOfWeek, 
  WORK_DAYS, 
  DEFAULT_PISOS, 
  BASE_PRICES, 
  OrderExtraItem, 
  PaymentMethod,
  ClientType,
  MenuType,
  normalizePiso,
  ExtraCategory,
} from '../types';
import { formatCurrency } from '../utils/pricing';
import { getDayOfWeekName, getTodayDateString } from '../db/database';
import { formatPhoneForWhatsApp, formatPhoneDisplay } from '../utils/phone';
import { ClientsDirectoryModal } from './ClientsDirectoryModal';
import { MergeConsumptionsModal } from './MergeConsumptionsModal';
import { normalizeClientName, findClientByName, searchClientsAutocomplete } from '../utils/clientUtils';
import { 
  BookOpen, 
  Calendar, 
  DollarSign, 
  Smartphone, 
  Plus, 
  Check, 
  Clock, 
  AlertCircle, 
  UserPlus, 
  Users,
  Download, 
  Upload, 
  Share2, 
  Printer, 
  ChevronLeft, 
  ChevronRight, 
  ChevronDown,
  ChevronUp,
  Edit3, 
  Trash2, 
  Building2, 
  Utensils, 
  CheckCircle2, 
  Receipt,
  Search,
  ArrowRight,
  X,
  Phone,
  AlertTriangle,
  MapPin,
  Zap,
  Settings,
  RotateCcw,
  RefreshCw,
  Table,
  Maximize2,
  Minimize2,
  Filter,
  Coins,
  GitMerge
} from 'lucide-react';

export const EXTRA_CATEGORIES: ExtraCategory[] = ['Bebidas', 'Panes', 'Extras', 'Especial', 'Dulces'];

export function getCategoryIcon(cat?: string): string {
  if (!cat) return '🍳';
  const c = cat.toLowerCase();
  if (c.includes('bebida') || c.includes('gaseosa') || c.includes('agua') || c.includes('jugo') || c.includes('chicha')) return '🥤';
  if (c.includes('pan') || c.includes('sandwich') || c.includes('sanguche')) return '🥪';
  if (c.includes('especial') || c.includes('milanesa') || c.includes('presa')) return '⭐';
  if (c.includes('dulce') || c.includes('postre') || c.includes('alfajor') || c.includes('mazamorra')) return '🍰';
  return '🍳';
}

export function normalizeExtraCategory(cat?: string): ExtraCategory {
  if (!cat) return 'Extras';
  const c = cat.toLowerCase();
  if (c.includes('bebida') || c.includes('gaseosa') || c.includes('agua') || c.includes('refresco') || c.includes('jugo') || c.includes('chicha')) return 'Bebidas';
  if (c.includes('pan') || c.includes('sandwich') || c.includes('sanguche')) return 'Panes';
  if (c.includes('especial') || c.includes('plato') || c.includes('presa') || c.includes('milanesa')) return 'Especial';
  if (c.includes('dulce') || c.includes('postre') || c.includes('queque') || c.includes('torta') || c.includes('alfajor') || c.includes('mazamorra')) return 'Dulces';
  return 'Extras';
}

interface CuadernoLedgerProps {
  clients: ClientRecord[];
  consumptions: ConsumptionRecord[];
  payments: PaymentRecord[];
  mesaRecords: MesaCounterRecord[];
  extrasCatalog: ExtraItem[];
  entradas?: string[];
  segundos?: string[];
  onSaveConsumptions: (data: ConsumptionRecord[]) => void;
  onSavePayments: (data: PaymentRecord[]) => void;
  onSaveMesaRecords: (data: MesaCounterRecord[]) => void;
  onSaveExtras?: (data: ExtraItem[]) => void;
  onSaveClients: (data: ClientRecord[]) => void;
  openNewClientSignal?: number;
  onExportBackup: () => void;
  onImportBackup: (jsonStr: string) => void;
}

type CuadernoTab = 'semanales' | 'diarias' | 'caja' | 'cobro_mensual';

export interface DailyAccountProductItem {
  id: string;
  consumptionId: string;
  date: string;
  dayOfWeek: DayOfWeek;
  timestamp: string;
  type: 'lunch' | 'extra';
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  notes?: string;
  lunchItem?: LunchItem;
  extraItem?: OrderExtraItem;
  paymentStatus?: 'pagado' | 'pendiente';
  paymentMethod?: PaymentMethod | 'abono';
  paymentDate?: string;
}

export interface DailyClientAccount {
  clientId: string;
  clientName: string;
  piso: string;
  phone?: string;
  notes?: string;
  clientRecord?: ClientRecord;
  hasCarriedOverPending: boolean;
  earliestPendingDate?: string;
  earliestPendingDay?: DayOfWeek;
  consumptions: ConsumptionRecord[];
  items: DailyAccountProductItem[];
  totalConsumed: number;
  payments: PaymentRecord[];
  totalPaid: number;
  /** Abonos de la cuenta que todavía no se aplicaron a ningún pedido (se descuentan del saldo). */
  openAbono: number;
  saldoPendiente: number;
  isFullyPaid: boolean;
  paymentMethod?: PaymentMethod | 'mixto' | 'abono';
  paymentDate?: string;
  lastPaymentTimestamp?: string;
  isMesa: boolean;
}

export const isPaymentDp = (p: PaymentRecord): boolean =>
  Boolean(
    p.isDpPayment ||
    (p.notes && (p.notes.includes('DP') || p.notes.toLowerCase().includes('deuda pasada')))
  );

/** Redondeo a céntimos para evitar errores de coma flotante en montos (S/). */
export const roundMoney = (n: number): number => Math.round(n * 100) / 100;

export const isPaymentDa = (p: PaymentRecord): boolean =>
  Boolean(
    p.isDaPayment ||
    (p.notes && (p.notes.includes('DA') || p.notes.toLowerCase().includes('deuda actual')))
  );

export const CuadernoLedger: React.FC<CuadernoLedgerProps> = ({
  clients,
  consumptions,
  payments,
  mesaRecords,
  extrasCatalog,
  openNewClientSignal,
  onSaveConsumptions,
  onSavePayments,
  onSaveMesaRecords,
  onSaveExtras,
  onSaveClients,
  onExportBackup,
  onImportBackup,
}) => {
  // Navigation within the sales register (Registro de Ventas) - Persistente
  const [activeTab, setActiveTab] = useState<CuadernoTab>(() => {
    const saved = localStorage.getItem('criss_active_tab');
    if (saved === 'semanales' || saved === 'diarias' || saved === 'caja' || saved === 'fin_de_mes') {
      return saved as CuadernoTab;
    }
    return 'semanales';
  });

  // Selected floor filter ('todos' or specific piso) - Persistente
  const [selectedPiso, setSelectedPiso] = useState<string>(() => {
    return localStorage.getItem('criss_selected_piso') || 'todos';
  });

  // Current date for register operations
  const today = getTodayDateString();

  // Selected week offset (0 = current week, -1 = previous week, +1 = next week) - Persistente
  const [weekOffset, setWeekOffset] = useState<number>(() => {
    const saved = localStorage.getItem('criss_week_offset');
    return saved !== null ? Number(saved) || 0 : 0;
  });

  // Selected date for Daily Cash / Mesa calculations - Persistente
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    return localStorage.getItem('criss_selected_date') || today;
  });

  // Month selection for monthly billing (YYYY-MM)
  const currentYearMonth = today.substring(0, 7);
  const [selectedMonth, setSelectedMonth] = useState<string>(currentYearMonth);

  // Sub-view in Cobro a Fin de Mes: 'liquidaciones' (cuentas semanales en lista) vs 'resumen_diario' (total cobrado por día)
  const [finDeMesSubView, setFinDeMesSubView] = useState<'liquidaciones' | 'resumen_diario'>('liquidaciones');

  // Search term
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Selected client for statement modal / WhatsApp
  const [statementClient, setStatementClient] = useState<ClientRecord | null>(null);

  // Modal: Agregar / Editar Consumo
  const [showAddConsumptionModal, setShowAddConsumptionModal] = useState<boolean>(false);
  const [consumptionDraft, setConsumptionDraft] = useState<{
    id?: string;
    clientId: string;
    clientName: string;
    piso: string;
    accountType: 'semanal' | 'diaria';
    date: string;
    dayOfWeek: DayOfWeek;
    locationType: ClientType; // 'mesa' | 'tienda'
    menuType: MenuType;       // 'menu_completo' | 'solo_segundo'
    lunchQuantity: number;
    completoQuantity: number;
    segundoSoloQuantity: number;
    selectedExtras: { extra: ExtraItem; quantity: number }[];
    notes: string;
    paymentStatus: 'pagado' | 'pendiente';
    paymentMethod: PaymentMethod;
    phone?: string;
  } | null>(null);

  // Registro de vueltos pendientes en clientes cobrados
  const [debeVueltoMap, setDebeVueltoMap] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('criss_debe_vuelto_map');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const handleToggleDebeVuelto = (clientId: string) => {
    setDebeVueltoMap((prev) => {
      const next = { ...prev, [clientId]: !prev[clientId] };
      try {
        localStorage.setItem('criss_debe_vuelto_map', JSON.stringify(next));
      } catch (err) {
        console.error('Error saving debe_vuelto_map:', err);
      }
      return next;
    });
  };

  // Secciones expandibles de Cuentas Diarias: "Menus por cobrar" y "Menus cobrados" - Persistentes
  const [isPorCobrarExpanded, setIsPorCobrarExpanded] = useState<boolean>(() => {
    const saved = localStorage.getItem('criss_por_cobrar_expanded');
    return saved !== null ? saved === 'true' : true;
  });
  const [isCobradosExpanded, setIsCobradosExpanded] = useState<boolean>(() => {
    const saved = localStorage.getItem('criss_cobrados_expanded');
    return saved !== null ? saved === 'true' : true;
  });

  // Secciones expandibles de Cuentas Semanales: "Pendientes" y "Canceladas (DT=0)" - Persistentes
  const [isWeeklyPendientesExpanded, setIsWeeklyPendientesExpanded] = useState<boolean>(() => {
    const saved = localStorage.getItem('criss_weekly_pendientes_expanded');
    return saved !== null ? saved === 'true' : true;
  });
  const [isWeeklyCanceladasExpanded, setIsWeeklyCanceladasExpanded] = useState<boolean>(() => {
    const saved = localStorage.getItem('criss_weekly_canceladas_expanded');
    return saved !== null ? saved === 'true' : false;
  });

  // Modal: Directorio de Clientes (búsqueda, edición y eliminación)
  const [showClientsDirectoryModal, setShowClientsDirectoryModal] = useState<boolean>(false);

  // Modal: Registrar Abono / Pago
  const [showPaymentModal, setShowPaymentModal] = useState<boolean>(false);
  const [paymentDraft, setPaymentDraft] = useState<{
    clientId: string;
    clientName: string;
    piso: string;
    accountType: 'semanal' | 'diaria';
    amount: string;
    method: PaymentMethod;
    date: string;
    notes: string;
    pendingDebt?: number;
  } | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  // Modal: Cancelo DP (Deuda Pasada)
  const [showCancelDpModal, setShowCancelDpModal] = useState<boolean>(false);
  const [cancelDpDraft, setCancelDpDraft] = useState<{
    clientId: string;
    clientName: string;
    piso: string;
    deudaPasada: number;
    amount: string;
    method: PaymentMethod;
    targetDate: string;
    notes: string;
  } | null>(null);
  const [cancelDpError, setCancelDpError] = useState<string | null>(null);

  // Modal: Cancelo DA (Deuda Actual de la semana)
  const [showCancelDaModal, setShowCancelDaModal] = useState<boolean>(false);
  const [cancelDaDraft, setCancelDaDraft] = useState<{
    clientId: string;
    clientName: string;
    piso: string;
    deudaActual: number;
    amount: string;
    method: PaymentMethod;
    targetDate: string;
    notes: string;
  } | null>(null);
  const [cancelDaError, setCancelDaError] = useState<string | null>(null);

  // Modal: Combinar Pedidos y Adicionales (Unificar en Pedido Principal "Main")
  const [showMergeConsModal, setShowMergeConsModal] = useState<boolean>(false);
  const [mergeMainConsId, setMergeMainConsId] = useState<string | null>(null);

  const handleOpenMergeConsModal = (presetMainId?: string) => {
    setMergeMainConsId(presetMainId || null);
    setShowMergeConsModal(true);
  };

  // Modal: Gestionar Adicionales
  const [showManageExtrasModal, setShowManageExtrasModal] = useState<boolean>(false);
  const [newExtraName, setNewExtraName] = useState<string>('');
  const [newExtraPrice, setNewExtraPrice] = useState<string>('');
  const [newExtraCategory, setNewExtraCategory] = useState<ExtraCategory>('Bebidas');

  // Extras Category Filtering & Expandable Window State
  const [selectedExtraCategoryFilter, setSelectedExtraCategoryFilter] = useState<ExtraCategory | 'Todos'>('Todos');
  const [extraSearchQuery, setExtraSearchQuery] = useState<string>('');
  const [isExtrasSectionExpanded, setIsExtrasSectionExpanded] = useState<boolean>(true);
  const [showExtrasWindowModal, setShowExtrasWindowModal] = useState<boolean>(false);
  const [isExtrasWindowMaximized, setIsExtrasWindowMaximized] = useState<boolean>(false);

  // Mesa Staged Draft State (requiere presionar "Actualizar" para subir a caja/cobrado del día)
  const [mesaDraft, setMesaDraft] = useState<{
    date: string;
    menuCompletoCount: number;
    soloSegundoCount: number;
    extras: OrderExtraItem[];
    efectivoAmount: number;
    yapeAmount: number;
    notes: string;
    isDirty: boolean;
  }>({
    date: selectedDate,
    menuCompletoCount: 0,
    soloSegundoCount: 0,
    extras: [],
    efectivoAmount: 0,
    yapeAmount: 0,
    notes: '',
    isDirty: false,
  });
  const [mesaUpdateFeedback, setMesaUpdateFeedback] = useState<string | null>(null);

  // Modal: Confirmación Segura en la App (reemplaza confirm() para iframe)
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    detail?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    isDestructive?: boolean;
    onConfirm: () => void;
  } | null>(null);

  // Modal: Nuevo Cliente (Piso vacío por defecto y obligatorio)
  const [showNewClientModal, setShowNewClientModal] = useState<boolean>(false);
  const [newClientName, setNewClientName] = useState<string>('');
  const [newClientPiso, setNewClientPiso] = useState<string>('');
  const [isCustomPiso, setIsCustomPiso] = useState<boolean>(false);
  const [customPisoText, setCustomPisoText] = useState<string>('');
  const [newClientType, setNewClientType] = useState<'semanal' | 'diaria'>('semanal');
  const [newClientPhone, setNewClientPhone] = useState<string>('');
  const [newClientNotes, setNewClientNotes] = useState<string>('');

  const handleOpenNewClientModal = () => {
    setNewClientPiso('');
    setIsCustomPiso(false);
    setCustomPisoText('');
    setNewClientName('');
    setNewClientPhone('');
    setNewClientNotes('');
    setNewClientType(activeTab === 'diarias' ? 'diaria' : 'semanal');
    setShowNewClientModal(true);
  };

  // React to open new client signal from Navbar
  React.useEffect(() => {
    if (openNewClientSignal && openNewClientSignal > 0) {
      handleOpenNewClientModal();
    }
  }, [openNewClientSignal, activeTab, selectedPiso]);
  const [cajaViewMode, setCajaViewMode] = useState<'dia' | 'semana' | 'ambas'>('dia');
  const [cobroMensualSubView, setCobroMensualSubView] = useState<'semanales_lista' | 'totales_diarios'>('semanales_lista');
  const [cajaListFilter, setCajaListFilter] = useState<'todos' | 'mesa' | 'diarias' | 'abonos'>('todos');

  // Modal: Editar Cliente
  const [editingClient, setEditingClient] = useState<ClientRecord | null>(null);
  const [editClientName, setEditClientName] = useState<string>('');
  const [editClientPiso, setEditClientPiso] = useState<string>('Calle');
  const [editIsCustomPiso, setEditIsCustomPiso] = useState<boolean>(false);
  const [editCustomPisoText, setEditCustomPisoText] = useState<string>('');
  const [editClientType, setEditClientType] = useState<'semanal' | 'diaria'>('semanal');
  const [editClientPhone, setEditClientPhone] = useState<string>('');
  const [editClientNotes, setEditClientNotes] = useState<string>('');

  // Collapsible state for weekly and daily accounts (Persistentes)
  const [collapsedDailyAccounts, setCollapsedDailyAccounts] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('criss_collapsed_daily_accounts');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  const [collapsedWeeklyAccounts, setCollapsedWeeklyAccounts] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('criss_collapsed_weekly_accounts');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Estado para expandir abonos de semanas anteriores por cliente en Cuentas Semanales
  const [showAllPaymentsMap, setShowAllPaymentsMap] = useState<Record<string, boolean>>({});

  const toggleShowAllPayments = (clientId: string) => {
    setShowAllPaymentsMap((prev) => ({
      ...prev,
      [clientId]: !prev[clientId],
    }));
  };

  // Persistencia de estados de interfaz
  React.useEffect(() => {
    localStorage.setItem('criss_active_tab', activeTab);
  }, [activeTab]);

  React.useEffect(() => {
    localStorage.setItem('criss_selected_piso', selectedPiso);
  }, [selectedPiso]);

  React.useEffect(() => {
    localStorage.setItem('criss_selected_date', selectedDate);
  }, [selectedDate]);

  React.useEffect(() => {
    localStorage.setItem('criss_week_offset', String(weekOffset));
  }, [weekOffset]);

  React.useEffect(() => {
    localStorage.setItem('criss_por_cobrar_expanded', String(isPorCobrarExpanded));
  }, [isPorCobrarExpanded]);

  React.useEffect(() => {
    localStorage.setItem('criss_cobrados_expanded', String(isCobradosExpanded));
  }, [isCobradosExpanded]);

  React.useEffect(() => {
    localStorage.setItem('criss_weekly_pendientes_expanded', String(isWeeklyPendientesExpanded));
  }, [isWeeklyPendientesExpanded]);

  React.useEffect(() => {
    localStorage.setItem('criss_weekly_canceladas_expanded', String(isWeeklyCanceladasExpanded));
  }, [isWeeklyCanceladasExpanded]);

  React.useEffect(() => {
    try {
      localStorage.setItem('criss_collapsed_daily_accounts', JSON.stringify(collapsedDailyAccounts));
    } catch (e) {
      console.error(e);
    }
  }, [collapsedDailyAccounts]);

  React.useEffect(() => {
    try {
      localStorage.setItem('criss_collapsed_weekly_accounts', JSON.stringify(collapsedWeeklyAccounts));
    } catch (e) {
      console.error(e);
    }
  }, [collapsedWeeklyAccounts]);

  // Add Product to existing daily account modal state (Permite agregar múltiples almuerzos y extras a la vez)
  const [addProductTarget, setAddProductTarget] = useState<DailyClientAccount | null>(null);
  const [addProdItemType, setAddProdItemType] = useState<'menu_completo' | 'solo_segundo' | 'extra'>('menu_completo');
  const [addProdLocation, setAddProdLocation] = useState<ClientType>('tienda');
  const [addProdExtraId, setAddProdExtraId] = useState<string>('');
  const [addProdQuantity, setAddProdQuantity] = useState<number>(1);
  const [addProdPrice, setAddProdPrice] = useState<number>(12);
  const [addProdNotes, setAddProdNotes] = useState<string>('');
  const [addProdCompletoQty, setAddProdCompletoQty] = useState<number>(0);
  const [addProdSegundoQty, setAddProdSegundoQty] = useState<number>(0);
  const [addProdSelectedExtras, setAddProdSelectedExtras] = useState<{ extra: ExtraItem; quantity: number }[]>([]);
  const [addProdExtraCategoryFilter, setAddProdExtraCategoryFilter] = useState<string>('Todos');
  const [addProdExtraSearch, setAddProdExtraSearch] = useState<string>('');

  // Edit item in daily account modal state
  const [editingAccountItem, setEditingAccountItem] = useState<DailyAccountProductItem | null>(null);
  const [editItemClientName, setEditItemClientName] = useState<string>('');
  const [editItemQty, setEditItemQty] = useState<number>(1);
  const [editItemPrice, setEditItemPrice] = useState<number>(0);
  const [editItemNotes, setEditItemNotes] = useState<string>('');

  // Filtros específicos para Cuentas Diarias
  const [dailyCategoryFilter, setDailyCategoryFilter] = useState<'todos' | 'mesas' | 'tiendas'>('todos');
  const [dailyStatusFilter, setDailyStatusFilter] = useState<'todos' | 'pendientes' | 'cobrados'>('todos');

  // Modal: Tomar Pedido en Mesa (Registro individual de comanda por mesa)
  const [showAddMesaModal, setShowAddMesaModal] = useState<boolean>(false);
  const [mesaOrderDraft, setMesaOrderDraft] = useState<{
    mesaName: string;
    menuCompletoQty: number;
    soloSegundoQty: number;
    selectedExtras: { extra: ExtraItem; quantity: number }[];
    notes: string;
    paymentStatus: 'pendiente' | 'pagado';
    paymentMethod: PaymentMethod;
  }>({
    mesaName: 'Mesa 1',
    menuCompletoQty: 1,
    soloSegundoQty: 0,
    selectedExtras: [],
    notes: '',
    paymentStatus: 'pendiente',
    paymentMethod: 'efectivo',
  });

  // Modal: Transformar Cuenta Diaria a Cuenta Semanal
  const [showTransformModal, setShowTransformModal] = useState<boolean>(false);
  const [accountToTransform, setAccountToTransform] = useState<DailyClientAccount | null>(null);

  // Extract all unique floors (ensuring Calle, 1ro, 2do, 3ro, 4to are in canonical order, excluding Mesa, 5to, Sótano)
  const pisosList = useMemo(() => {
    const defaultList = [...DEFAULT_PISOS];
    const customList: string[] = [];
    const forbidden = new Set(['Mesa', '5to', '5to piso', 'Sótano', 'sotano', 'sótano']);
    clients.forEach((c) => {
      const norm = normalizePiso(c.piso);
      if (!forbidden.has(norm) && !defaultList.includes(norm) && !customList.includes(norm)) {
        customList.push(norm);
      }
    });
    return [...defaultList, ...customList].filter((p) => !forbidden.has(p));
  }, [clients]);

  // Counts of extras per category (strictly: Bebidas, Panes, Extras, Especial, Dulces)
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {
      Todos: extrasCatalog.length,
      Bebidas: 0,
      Panes: 0,
      Extras: 0,
      Especial: 0,
      Dulces: 0,
    };
    extrasCatalog.forEach((ex) => {
      const cat = normalizeExtraCategory(ex.category);
      if (counts[cat] !== undefined) {
        counts[cat]++;
      }
    });
    return counts;
  }, [extrasCatalog]);

  // Filtered extras list for order picking based on category and search query, sorted by price ascending
  const filteredExtras = useMemo(() => {
    return extrasCatalog
      .filter((extra) => {
        const normCategory = normalizeExtraCategory(extra.category);
        const matchesCategory =
          selectedExtraCategoryFilter === 'Todos' || normCategory === selectedExtraCategoryFilter;
        const matchesSearch =
          !extraSearchQuery.trim() ||
          extra.name.toLowerCase().includes(extraSearchQuery.trim().toLowerCase());
        return matchesCategory && matchesSearch;
      })
      .sort((a, b) => a.price - b.price);
  }, [extrasCatalog, selectedExtraCategoryFilter, extraSearchQuery]);

  // Extras agrupados por categorías exactas ("Bebidas", "Panes", "Extras", "Especial", "Dulces") y ordenados por precio ascendente
  const extrasByCategory = useMemo(() => {
    const groups: { category: ExtraCategory; items: ExtraItem[] }[] = [];
    EXTRA_CATEGORIES.forEach((cat) => {
      const items = extrasCatalog
        .filter((extra) => {
          const normCategory = normalizeExtraCategory(extra.category);
          const matchesCategory = normCategory === cat;
          const matchesSearch =
            !extraSearchQuery.trim() ||
            extra.name.toLowerCase().includes(extraSearchQuery.trim().toLowerCase());
          return matchesCategory && matchesSearch;
        })
        .sort((a, b) => a.price - b.price);
      if (items.length > 0) {
        groups.push({ category: cat, items });
      }
    });
    return groups;
  }, [extrasCatalog, extraSearchQuery]);

  // Lista de extras filtrados y ordenados por precio ascendente para el modal "+ Producto"
  const filteredExtrasForAddProd = useMemo(() => {
    return extrasCatalog
      .filter((extra) => {
        const normCategory = normalizeExtraCategory(extra.category);
        const matchesCategory =
          addProdExtraCategoryFilter === 'Todos' || normCategory === addProdExtraCategoryFilter;
        const matchesSearch =
          !addProdExtraSearch.trim() ||
          extra.name.toLowerCase().includes(addProdExtraSearch.trim().toLowerCase());
        return matchesCategory && matchesSearch;
      })
      .sort((a, b) => a.price - b.price);
  }, [extrasCatalog, addProdExtraCategoryFilter, addProdExtraSearch]);

  const addProdCategoryCounts = useMemo(() => {
    const counts: Record<string, number> = { Todos: extrasCatalog.length };
    EXTRA_CATEGORIES.forEach((cat) => {
      counts[cat] = 0;
    });
    extrasCatalog.forEach((extra) => {
      const normCat = normalizeExtraCategory(extra.category);
      if (counts[normCat] !== undefined) {
        counts[normCat]++;
      } else {
        counts['Extras'] = (counts['Extras'] || 0) + 1;
      }
    });
    return counts;
  }, [extrasCatalog]);

  // Calculate dates for the displayed week (Monday to Saturday)
  const currentWeekDays = useMemo(() => {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 is Sun, 1 is Mon
    const diffToMonday = now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1) + (weekOffset * 7);
    const monday = new Date(now);
    monday.setDate(diffToMonday);

    return WORK_DAYS.map((dayName, idx) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + idx);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${day}`;
      return {
        dayName,
        dateStr,
        display: `${dayName.substring(0, 3)} ${day}/${m}`,
      };
    });
  }, [weekOffset]);

  // Filtered clients list
  const filteredClients = useMemo(() => {
    return clients.filter((c) => {
      if (!c.active) return false;
      const clientPiso = normalizePiso(c.piso);
      if (selectedPiso !== 'todos' && clientPiso !== selectedPiso) return false;
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        return (
          c.name.toLowerCase().includes(term) ||
          clientPiso.toLowerCase().includes(term) ||
          (c.phone && c.phone.includes(term))
        );
      }
      return true;
    });
  }, [clients, selectedPiso, searchTerm]);

  // Weekly clients
  const weeklyClients = useMemo(() => {
    return filteredClients.filter((c) => c.accountType === 'semanal');
  }, [filteredClients]);

  // Daily clients
  const dailyClients = useMemo(() => {
    return filteredClients.filter((c) => c.accountType === 'diaria');
  }, [filteredClients]);

  // Daily consumptions list
  // Regla de Fechas para Cuentas Diarias:
  // 1. Pagados: Se quedan en el día en que se pagaron (paymentDate === selectedDate || (!paymentDate && date === selectedDate))
  // 2. Creados hoy: Si se consumió en selectedDate, se muestra (pagado o pendiente)
  // 3. Pendientes anteriores: Si se consumió antes de selectedDate (c.date < selectedDate) y SIGUE PENDIENTE, PASA al día seleccionado.
  const dailyConsumptionsList = useMemo(() => {
    return consumptions
      .filter((c) => c.accountType === 'diaria')
      .filter((c) => {
        const consPiso = normalizePiso(c.piso);
        if (selectedPiso !== 'todos' && consPiso !== selectedPiso) return false;
        if (searchTerm.trim()) {
          const term = searchTerm.toLowerCase();
          const match =
            c.clientName.toLowerCase().includes(term) ||
            consPiso.toLowerCase().includes(term);
          if (!match) return false;
        }

        const isPaidOnThisDate =
          c.paymentStatus === 'pagado' &&
          (c.paymentDate === selectedDate || (!c.paymentDate && c.date === selectedDate));

        const isConsumedOnThisDate = c.date === selectedDate;

        const isCarriedOverPending =
          c.paymentStatus === 'pendiente' && c.date < selectedDate;

        return isPaidOnThisDate || isConsumedOnThisDate || isCarriedOverPending;
      })
      .sort((a, b) => {
        // Pendientes arrastrados primero
        const aCarried = a.paymentStatus === 'pendiente' && a.date < selectedDate ? 1 : 0;
        const bCarried = b.paymentStatus === 'pendiente' && b.date < selectedDate ? 1 : 0;
        if (aCarried !== bCarried) return bCarried - aCarried;

        const aPending = a.paymentStatus === 'pendiente' ? 1 : 0;
        const bPending = b.paymentStatus === 'pendiente' ? 1 : 0;
        if (aPending !== bPending) return bPending - aPending;

        return b.date.localeCompare(a.date) || b.timestamp.localeCompare(a.timestamp);
      });
  }, [consumptions, selectedPiso, searchTerm, selectedDate]);

  // Cuentas Diarias Consolidadas por Cliente (Lista detallada de lo consumido con precios y cuenta final acumulada)
  const dailyAccountsList = useMemo<DailyClientAccount[]>(() => {
    // 1. Filtrar todos los consumos diarios relevantes para la fecha seleccionada:
    // - Consumidos en selectedDate
    // - Pagados en selectedDate (o sin paymentDate pero creados en selectedDate y pagados)
    // - Pendientes arrastrados de días anteriores (c.paymentStatus === 'pendiente' && c.date < selectedDate)
    const relevantConsumptions = consumptions.filter((c) => {
      if (c.accountType !== 'diaria') return false;
      const isPaidOnThisDate =
        c.paymentStatus === 'pagado' &&
        (c.paymentDate === selectedDate || (!c.paymentDate && c.date === selectedDate));
      const isConsumedOnThisDate = c.date === selectedDate;
      const isCarriedOverPending =
        c.paymentStatus === 'pendiente' && c.date < selectedDate;
      return isPaidOnThisDate || isConsumedOnThisDate || isCarriedOverPending;
    });

    // 2. Agrupar por cliente (preferir c.clientId o c.clientName normalizado)
    const groups: Record<string, {
      clientId: string;
      clientName: string;
      piso: string;
      consumptions: ConsumptionRecord[];
    }> = {};

    relevantConsumptions.forEach((c) => {
      const key = (c.clientId && c.clientId.trim()) ? c.clientId : c.clientName.trim().toLowerCase();
      if (!groups[key]) {
        groups[key] = {
          clientId: c.clientId || `diaria-${c.clientName.trim().toLowerCase()}`,
          clientName: c.clientName,
          piso: c.piso,
          consumptions: [],
        };
      } else if (c.piso) {
        groups[key].piso = c.piso;
      }
      groups[key].consumptions.push(c);
    });

    const accounts: DailyClientAccount[] = [];

    Object.values(groups).forEach((group) => {
      const clientRec = clients.find(
        (cl) =>
          cl.id === group.clientId ||
          cl.name.trim().toLowerCase() === group.clientName.trim().toLowerCase()
      );

      const finalName = clientRec?.name || group.clientName;
      const finalPiso = normalizePiso(group.piso || clientRec?.piso || '1ro');

      // Filtro por piso seleccionado
      if (selectedPiso !== 'todos' && finalPiso !== selectedPiso) return;

      // Filtro por búsqueda
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const match =
          finalName.toLowerCase().includes(term) ||
          finalPiso.toLowerCase().includes(term) ||
          (clientRec?.phone && clientRec.phone.includes(term));
        if (!match) return;
      }

      // Orden cronológico de los consumos del cliente
      const sortedCons = [...group.consumptions].sort(
        (a, b) => a.date.localeCompare(b.date) || a.timestamp.localeCompare(b.timestamp)
      );

      const items: DailyAccountProductItem[] = [];
      let hasCarriedOverPending = false;
      let earliestPendingDate: string | undefined;
      let earliestPendingDay: DayOfWeek | undefined;

      sortedCons.forEach((c) => {
        if (c.paymentStatus === 'pendiente' && c.date < selectedDate) {
          hasCarriedOverPending = true;
          if (!earliestPendingDate || c.date < earliestPendingDate) {
            earliestPendingDate = c.date;
            earliestPendingDay = c.dayOfWeek;
          }
        }

        c.lunches.forEach((l) => {
          items.push({
            id: l.id,
            consumptionId: c.id,
            date: c.date,
            dayOfWeek: c.dayOfWeek,
            timestamp: c.timestamp,
            type: 'lunch',
            name: l.segundo || (l.menuType === 'menu_completo' ? 'Menú Completo' : 'Solo Segundo'),
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            totalPrice: l.totalPrice,
            notes: l.notes,
            lunchItem: l,
            paymentStatus: c.paymentStatus,
            paymentMethod: c.paymentMethod,
            paymentDate: c.paymentDate,
          });
        });

        c.extras.forEach((e) => {
          items.push({
            id: e.id,
            consumptionId: c.id,
            date: c.date,
            dayOfWeek: c.dayOfWeek,
            timestamp: c.timestamp,
            type: 'extra',
            name: e.name,
            quantity: e.quantity,
            unitPrice: e.price,
            totalPrice: e.totalPrice,
            notes: e.description,
            extraItem: e,
            paymentStatus: c.paymentStatus,
            paymentMethod: c.paymentMethod,
            paymentDate: c.paymentDate,
          });
        });
      });

      const totalConsumed = sortedCons.reduce((s, c) => s + c.total, 0);

      const belongsToClient = (clientId: string | undefined, clientName: string) =>
        (!!clientId && (clientId === group.clientId || (!!clientRec && clientId === clientRec.id))) ||
        clientName.trim().toLowerCase() === finalName.trim().toLowerCase();

      const pendingCons = sortedCons.filter((c) => c.paymentStatus === 'pendiente');

      // Inicio del periodo de la cuenta: el pedido pendiente más antiguo (o, si ya está todo
      // pagado, el pedido más antiguo que se muestra). Los abonos registrados desde esa fecha
      // hasta el día que se está viendo SIGUEN contando aunque se cambie de día; antes solo se
      // sumaban los abonos del mismo día y al día siguiente "desaparecían" del saldo.
      const accountStart = (pendingCons.length > 0 ? pendingCons : sortedCons).reduce(
        (min, c) => (c.date < min ? c.date : min),
        selectedDate
      );

      // Pagos o abonos de la cuenta diaria dentro de ese periodo
      const clientPayments = payments.filter(
        (p) =>
          p.accountType === 'diaria' &&
          belongsToClient(p.clientId, p.clientName) &&
          p.date >= accountStart &&
          p.date <= selectedDate &&
          !isPaymentDp(p) &&
          !p.isDaPayment
      );
      const totalPaid = clientPayments.reduce((s, p) => s + p.amount, 0);

      // Abonos ya utilizados para liquidar pedidos (pedidos cobrados con método 'abono') en el periodo
      const consumedByAbono = consumptions
        .filter(
          (c) =>
            c.accountType === 'diaria' &&
            c.paymentStatus === 'pagado' &&
            (c.paymentMethod as string) === 'abono' &&
            !!c.paymentDate &&
            c.paymentDate >= accountStart &&
            c.paymentDate <= selectedDate &&
            belongsToClient(c.clientId, c.clientName)
        )
        .reduce((s, c) => s + c.total, 0);
      const openAbono = roundMoney(Math.max(0, totalPaid - consumedByAbono));

      const allMarkedPaid = sortedCons.length > 0 && sortedCons.every((c) => c.paymentStatus === 'pagado');
      let saldoPendiente = 0;
      let isFullyPaid = false;

      const pendingConsTotal = pendingCons.reduce((s, c) => s + c.total, 0);

      if (allMarkedPaid) {
        saldoPendiente = 0;
        isFullyPaid = true;
      } else {
        saldoPendiente = roundMoney(Math.max(0, pendingConsTotal - openAbono));
        isFullyPaid = saldoPendiente === 0 && sortedCons.length > 0;
      }

      const paidMethods = Array.from(new Set(sortedCons.map((c) => c.paymentMethod).filter(Boolean)));
      const paymentMethod = paidMethods.length === 1 ? paidMethods[0] : (paidMethods.length > 1 ? 'mixto' : undefined);

      const isMesa = finalPiso === 'Mesa' || finalName.trim().toLowerCase().startsWith('mesa');

      // Timestamp del último cobro registrado (para ordenar la sección de cobrados según quién fue el último)
      let lastPaymentTimestamp = '';
      if (clientPayments.length > 0) {
        const sortedPays = [...clientPayments].sort(
          (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
        lastPaymentTimestamp = sortedPays[0]?.timestamp || '';
      }
      if (!lastPaymentTimestamp) {
        const paidCons = sortedCons.filter((c) => c.paymentStatus === 'pagado');
        if (paidCons.length > 0) {
          const sortedPaidCons = [...paidCons].sort(
            (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          );
          lastPaymentTimestamp = sortedPaidCons[0]?.timestamp || '';
        }
      }

      accounts.push({
        clientId: clientRec?.id || group.clientId,
        clientName: finalName,
        piso: finalPiso,
        phone: clientRec?.phone,
        notes: clientRec?.notes,
        clientRecord: clientRec,
        hasCarriedOverPending,
        earliestPendingDate,
        earliestPendingDay,
        consumptions: sortedCons,
        items,
        totalConsumed,
        payments: clientPayments,
        totalPaid,
        openAbono,
        saldoPendiente,
        isFullyPaid,
        paymentMethod,
        paymentDate: sortedCons.find((c) => c.paymentDate)?.paymentDate,
        lastPaymentTimestamp,
        isMesa,
      });
    });

    // Orden de presentación:
    // 1. Cuentas con saldo pendiente anterior arrastrado (atención prioritaria)
    // 2. Cuentas con saldo pendiente de hoy
    // 3. Cuentas completamente pagadas y al día
    return accounts.sort((a, b) => {
      if (a.hasCarriedOverPending && !b.hasCarriedOverPending) return -1;
      if (!a.hasCarriedOverPending && b.hasCarriedOverPending) return 1;

      if (!a.isFullyPaid && b.isFullyPaid) return -1;
      if (a.isFullyPaid && !b.isFullyPaid) return 1;

      return a.clientName.localeCompare(b.clientName);
    });
  }, [consumptions, payments, clients, selectedDate, selectedPiso, searchTerm]);

  // Sublistas y filtros para Cuentas Diarias
  const filteredDailyAccounts = useMemo<DailyClientAccount[]>(() => {
    return dailyAccountsList.filter((account) => {
      if (dailyCategoryFilter === 'mesas' && !account.isMesa) return false;
      if (dailyCategoryFilter === 'tiendas' && account.isMesa) return false;
      if (dailyStatusFilter === 'pendientes' && account.isFullyPaid) return false;
      if (dailyStatusFilter === 'cobrados' && !account.isFullyPaid) return false;
      return true;
    });
  }, [dailyAccountsList, dailyCategoryFilter, dailyStatusFilter]);

  // 1. Zona: "Menus por cobrar" (Pendientes de pago)
  const porCobrarAccounts = useMemo(() => {
    return filteredDailyAccounts.filter((account) => !account.isFullyPaid);
  }, [filteredDailyAccounts]);

  // 2. Zona: "Menus cobrados" (Ordenados según quién fue el último al que cobraron)
  const cobradosAccounts = useMemo(() => {
    const paidList = filteredDailyAccounts.filter((account) => account.isFullyPaid);
    return [...paidList].sort((a, b) => {
      const timeA = new Date(a.lastPaymentTimestamp || a.paymentDate || 0).getTime();
      const timeB = new Date(b.lastPaymentTimestamp || b.paymentDate || 0).getTime();
      return timeB - timeA;
    });
  }, [filteredDailyAccounts]);

  const mesaDailyAccounts = useMemo(() => dailyAccountsList.filter((a) => a.isMesa), [dailyAccountsList]);
  const tiendaDailyAccounts = useMemo(() => dailyAccountsList.filter((a) => !a.isMesa), [dailyAccountsList]);
  const pendingDailyAccounts = useMemo(() => dailyAccountsList.filter((a) => !a.isFullyPaid), [dailyAccountsList]);
  const paidDailyAccounts = useMemo(() => dailyAccountsList.filter((a) => a.isFullyPaid), [dailyAccountsList]);

  // Current Mesa Record for selectedDate
  const currentMesaRecord = useMemo(() => {
    const found = mesaRecords.find((r) => r.date === selectedDate);
    if (found) return found;
    return {
      id: `mesa-${selectedDate}`,
      date: selectedDate,
      dayOfWeek: getDayOfWeekName(selectedDate),
      menuCompletoCount: 0,
      soloSegundoCount: 0,
      extras: [],
      efectivoAmount: 0,
      yapeAmount: 0,
      totalAmount: 0,
      timestamp: new Date().toISOString(),
      notes: '',
    };
  }, [mesaRecords, selectedDate]);

  // Sincronizar mesaDraft cuando cambia la fecha seleccionada o el registro guardado
  React.useEffect(() => {
    setMesaDraft({
      date: selectedDate,
      menuCompletoCount: currentMesaRecord.menuCompletoCount,
      soloSegundoCount: currentMesaRecord.soloSegundoCount,
      extras: currentMesaRecord.extras || [],
      efectivoAmount: currentMesaRecord.efectivoAmount,
      yapeAmount: currentMesaRecord.yapeAmount,
      notes: currentMesaRecord.notes || '',
      isDirty: false,
    });
    setMesaUpdateFeedback(null);
  }, [selectedDate, currentMesaRecord]);

  // Resumen Diario del Mes para Cobro a Fin de Mes (totales por día sin mostrar listas por persona)
  const daysInSelectedMonth = useMemo(() => {
    const [yearStr, monthStr] = selectedMonth.split('-');
    const year = parseInt(yearStr);
    const month = parseInt(monthStr);
    if (isNaN(year) || isNaN(month)) return [];

    const numDays = new Date(year, month, 0).getDate();
    const list = [];
    for (let d = 1; d <= numDays; d++) {
      const dayStr = String(d).padStart(2, '0');
      const date = `${yearStr}-${monthStr}-${dayStr}`;
      const dayOfWeek = getDayOfWeekName(date);
      const jsDay = new Date(year, month - 1, d).getDay();
      if (jsDay === 0) continue; // Domingo cerrado

      // Mesa de ese día
      const mesa = mesaRecords.find((m) => m.date === date);
      const mesaTotal = mesa ? mesa.totalAmount : 0;
      const mesaCash = mesa ? mesa.efectivoAmount : 0;
      const mesaYape = mesa ? mesa.yapeAmount : 0;

      // Consumos diarios cobrados en ese día
      let dailyCash = 0;
      let dailyYape = 0;
      let dailyCount = 0;
      consumptions
        .filter(
          (c) =>
            c.accountType === 'diaria' &&
            c.paymentStatus === 'pagado' &&
            c.paymentMethod !== 'abono' &&
            (c.paymentDate === date || (!c.paymentDate && c.date === date))
        )
        .forEach((c) => {
          dailyCount++;
          if (c.paymentMethod === 'yape') {
            dailyYape += c.total;
          } else {
            dailyCash += c.total;
          }
        });

      const dailyTotal = dailyCash + dailyYape;
      const totalDia = mesaTotal + dailyTotal;
      const totalCash = mesaCash + dailyCash;
      const totalYape = mesaYape + dailyYape;

      list.push({
        date,
        dayNumber: d,
        dayOfWeek,
        mesaTotal,
        mesaCash,
        mesaYape,
        dailyTotal,
        dailyCash,
        dailyYape,
        dailyCount,
        totalDia,
        totalCash,
        totalYape,
        hasActivity: totalDia > 0,
      });
    }
    return list;
  }, [selectedMonth, mesaRecords, consumptions]);

  // Calculations for Caja of the Selected Date
  const cajaDelDia = useMemo(() => {
    const rawMesaCash = currentMesaRecord ? currentMesaRecord.efectivoAmount : 0;
    const rawMesaYape = currentMesaRecord ? currentMesaRecord.yapeAmount : 0;

    const paidDailyConsumptions = consumptions.filter(
      (c) =>
        c.accountType === 'diaria' &&
        c.paymentStatus === 'pagado' &&
        c.paymentMethod !== 'abono' &&
        (c.paymentDate === selectedDate || (!c.paymentDate && c.date === selectedDate))
    );

    const paidMesaConsumptions = paidDailyConsumptions.filter(
      (c) => normalizePiso(c.piso) === 'Mesa' || c.clientName.trim().toLowerCase().startsWith('mesa')
    );
    const paidTiendaConsumptions = paidDailyConsumptions.filter(
      (c) => !(normalizePiso(c.piso) === 'Mesa' || c.clientName.trim().toLowerCase().startsWith('mesa'))
    );

    let mesaFromOrdersCash = 0;
    let mesaFromOrdersYape = 0;
    paidMesaConsumptions.forEach((c) => {
      if (c.paymentMethod === 'efectivo') mesaFromOrdersCash += c.total;
      else if (c.paymentMethod === 'yape') mesaFromOrdersYape += c.total;
    });

    const mesaCash = rawMesaCash + mesaFromOrdersCash;
    const mesaYape = rawMesaYape + mesaFromOrdersYape;
    const mesaTotal = mesaCash + mesaYape;

    let dailyCash = 0;
    let dailyYape = 0;
    paidTiendaConsumptions.forEach((c) => {
      if (c.paymentMethod === 'efectivo') dailyCash += c.total;
      else if (c.paymentMethod === 'yape') dailyYape += c.total;
    });

    let abonosCash = 0;
    let abonosYape = 0;
    const dayPayments = payments.filter((p) => p.date === selectedDate);
    dayPayments.forEach((p) => {
      if (p.method === 'efectivo') abonosCash += p.amount;
      else if (p.method === 'yape') abonosYape += p.amount;
    });

    const totalEfectivo = mesaCash + dailyCash + abonosCash;
    const totalYape = mesaYape + dailyYape + abonosYape;
    const totalGeneral = totalEfectivo + totalYape;

    return {
      mesaCash,
      mesaYape,
      mesaTotal,
      dailyCash,
      dailyYape,
      dailyTotal: dailyCash + dailyYape,
      abonosCash,
      abonosYape,
      abonosTotal: abonosCash + abonosYape,
      totalEfectivo,
      totalYape,
      totalGeneral,
      paidDailyConsumptions,
      paidMesaConsumptions,
      paidTiendaConsumptions,
      dayPayments,
    };
  }, [currentMesaRecord, consumptions, payments, selectedDate]);

  // Calculations for Caja Semanal (Lunes a Sábado de la semana actual/seleccionada)
  const cajaSemanal = useMemo(() => {
    const daysBreakdown = currentWeekDays.map((day) => {
      const mesaDay = mesaRecords.find((m) => m.date === day.dateStr);
      const mesaCash = mesaDay ? mesaDay.efectivoAmount : 0;
      const mesaYape = mesaDay ? mesaDay.yapeAmount : 0;
      const mesaTotal = mesaDay ? mesaDay.totalAmount : 0;

      let dailyCash = 0;
      let dailyYape = 0;
      consumptions
        .filter(
          (c) =>
            c.accountType === 'diaria' &&
            c.paymentStatus === 'pagado' &&
            c.paymentMethod !== 'abono' &&
            (c.paymentDate === day.dateStr || (!c.paymentDate && c.date === day.dateStr))
        )
        .forEach((c) => {
          if (c.paymentMethod === 'efectivo') dailyCash += c.total;
          else if (c.paymentMethod === 'yape') dailyYape += c.total;
        });

      let abonosCash = 0;
      let abonosYape = 0;
      payments
        .filter((p) => p.date === day.dateStr)
        .forEach((p) => {
          if (p.method === 'efectivo') abonosCash += p.amount;
          else if (p.method === 'yape') abonosYape += p.amount;
        });

      const efectivo = mesaCash + dailyCash + abonosCash;
      const yape = mesaYape + dailyYape + abonosYape;
      const total = efectivo + yape;

      return {
        dayName: day.dayName,
        dateStr: day.dateStr,
        display: day.display,
        mesaTotal,
        dailyTotal: dailyCash + dailyYape,
        abonosTotal: abonosCash + abonosYape,
        efectivo,
        yape,
        total,
      };
    });

    const totalEfectivo = daysBreakdown.reduce((sum, d) => sum + d.efectivo, 0);
    const totalYape = daysBreakdown.reduce((sum, d) => sum + d.yape, 0);
    const totalGeneral = totalEfectivo + totalYape;
    const totalMesa = daysBreakdown.reduce((sum, d) => sum + d.mesaTotal, 0);
    const totalDiarias = daysBreakdown.reduce((sum, d) => sum + d.dailyTotal, 0);
    const totalAbonos = daysBreakdown.reduce((sum, d) => sum + d.abonosTotal, 0);

    return {
      daysBreakdown,
      totalEfectivo,
      totalYape,
      totalGeneral,
      totalMesa,
      totalDiarias,
      totalAbonos,
    };
  }, [currentWeekDays, mesaRecords, consumptions, payments]);

  // Overall Revenue Metrics for the Banner (Hoy, Semana Actual, Mes Actual)
  const metricsBanner = useMemo(() => {
    // 1. Hoy
    const mesaToday = mesaRecords.find((m) => m.date === today);
    const mesaTodayCash = mesaToday ? mesaToday.efectivoAmount : 0;
    const mesaTodayYape = mesaToday ? mesaToday.yapeAmount : 0;

    let dailyTodayCash = 0;
    let dailyTodayYape = 0;
    consumptions
      .filter(
        (c) =>
          c.accountType === 'diaria' &&
          c.paymentStatus === 'pagado' &&
          c.paymentMethod !== 'abono' &&
          (c.paymentDate === today || (!c.paymentDate && c.date === today))
      )
      .forEach((c) => {
        if (c.paymentMethod === 'efectivo') dailyTodayCash += c.total;
        else if (c.paymentMethod === 'yape') dailyTodayYape += c.total;
      });

    let abonosTodayCash = 0;
    let abonosTodayYape = 0;
    payments
      .filter((p) => p.date === today)
      .forEach((p) => {
        if (p.method === 'efectivo') abonosTodayCash += p.amount;
        else if (p.method === 'yape') abonosTodayYape += p.amount;
      });

    const hoyEfectivo = mesaTodayCash + dailyTodayCash + abonosTodayCash;
    const hoyYape = mesaTodayYape + dailyTodayYape + abonosTodayYape;
    const hoyTotal = hoyEfectivo + hoyYape;

    // 2. Semana Actual (offset = 0)
    const now = new Date();
    const dayOfWeek = now.getDay();
    const diffToMonday = now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1);
    const monday = new Date(now);
    monday.setDate(diffToMonday);
    const curWeekDateSet = new Set<string>();
    for (let i = 0; i < 6; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      curWeekDateSet.add(`${y}-${m}-${day}`);
    }

    let semEfectivo = 0;
    let semYape = 0;
    mesaRecords.forEach((m) => {
      if (curWeekDateSet.has(m.date)) {
        semEfectivo += m.efectivoAmount;
        semYape += m.yapeAmount;
      }
    });
    consumptions
      .filter(
        (c) =>
          c.accountType === 'diaria' &&
          c.paymentStatus === 'pagado' &&
          curWeekDateSet.has(c.paymentDate || c.date)
      )
      .forEach((c) => {
        if (c.paymentMethod === 'efectivo') semEfectivo += c.total;
        else if (c.paymentMethod === 'yape') semYape += c.total;
      });
    payments.forEach((p) => {
      if (curWeekDateSet.has(p.date)) {
        if (p.method === 'efectivo') semEfectivo += p.amount;
        else if (p.method === 'yape') semYape += p.amount;
      }
    });
    const semTotal = semEfectivo + semYape;

    // 3. Mes Actual
    const monthPrefix = currentYearMonth;
    let mesEfectivo = 0;
    let mesYape = 0;
    mesaRecords.forEach((m) => {
      if (m.date.startsWith(monthPrefix)) {
        mesEfectivo += m.efectivoAmount;
        mesYape += m.yapeAmount;
      }
    });
    consumptions
      .filter(
        (c) =>
          c.accountType === 'diaria' &&
          c.paymentStatus === 'pagado' &&
          (c.paymentDate?.startsWith(monthPrefix) || (!c.paymentDate && c.date.startsWith(monthPrefix)))
      )
      .forEach((c) => {
        if (c.paymentMethod === 'efectivo') mesEfectivo += c.total;
        else if (c.paymentMethod === 'yape') mesYape += c.total;
      });
    payments.forEach((p) => {
      if (p.date.startsWith(monthPrefix)) {
        if (p.method === 'efectivo') mesEfectivo += p.amount;
        else if (p.method === 'yape') mesYape += p.amount;
      }
    });
    const mesTotal = mesEfectivo + mesYape;

    return {
      hoyTotal,
      hoyEfectivo,
      hoyYape,
      semTotal,
      semEfectivo,
      semYape,
      mesTotal,
      mesEfectivo,
      mesYape,
    };
  }, [mesaRecords, consumptions, payments, today, currentYearMonth]);

  // Estadísticas globales de deuda: cuánto falta cobrar en cuentas diarias y semanales
  const globalDebtStats = useMemo(() => {
    // 1. Deuda en cuentas diarias (de la fecha actual y arrastradas pendientes)
    const dailyDebt = dailyAccountsList.reduce((sum, acc) => sum + (acc.isFullyPaid ? 0 : acc.saldoPendiente), 0);

    // 2. Deuda en cuentas semanales
    let weeklyDebt = 0;
    clients
      .filter((c) => c.accountType === 'semanal')
      .forEach((c) => {
        const clientCons = consumptions.filter(
          (item) =>
            item.accountType === 'semanal' &&
            (item.clientId === c.id || item.clientName.trim().toLowerCase() === c.name.trim().toLowerCase())
        );
        const totalCons = clientCons.reduce((s, item) => s + item.total, 0);
        const clientPays = payments.filter(
          (p) =>
            p.clientId === c.id || p.clientName.trim().toLowerCase() === c.name.trim().toLowerCase()
        );
        const totalPays = clientPays.reduce((s, p) => s + p.amount, 0);
        const pending = Math.max(0, totalCons - totalPays);
        weeklyDebt += pending;
      });

    const totalDebt = dailyDebt + weeklyDebt;
    return {
      dailyDebt,
      weeklyDebt,
      totalDebt,
    };
  }, [dailyAccountsList, clients, consumptions, payments]);

  // Búsqueda inteligente de clientes en tiempo real para asignación de pedidos
  const matchingClientsForOrder = useMemo(() => {
    if (!consumptionDraft) return [];
    const query = (consumptionDraft.clientName || '').trim();
    if (!query) return [];

    // Si ya tiene un cliente asignado y el nombre coincide, no desplegamos la lista
    if (consumptionDraft.clientId) {
      const selected = clients.find((c) => c.id === consumptionDraft.clientId);
      if (selected && normalizeClientName(selected.name) === normalizeClientName(query)) {
        return [];
      }
    }

    return searchClientsAutocomplete(clients, query, 8);
  }, [consumptionDraft?.clientName, consumptionDraft?.clientId, clients]);

  // Handlers for Add & Edit Consumption
  const handleOpenAddConsumption = (client: ClientRecord, targetDate: string = today) => {
    setConsumptionDraft({
      clientId: client.id,
      clientName: client.name,
      piso: client.piso,
      accountType: client.accountType,
      date: targetDate,
      dayOfWeek: getDayOfWeekName(targetDate),
      locationType: 'tienda', // Default for floor clients
      menuType: 'menu_completo',
      lunchQuantity: 1,
      completoQuantity: 1,
      segundoSoloQuantity: 0,
      selectedExtras: [],
      notes: '',
      paymentStatus: 'pendiente',
      paymentMethod: 'efectivo',
      phone: client.phone || '',
    });
    setShowAddConsumptionModal(true);
  };

  // Handler para Anotar Nuevo Pedido Diario (permite elegir persona o crearla en el momento)
  const handleOpenNewDailyOrder = (targetDate: string = selectedDate, initialFloor?: string) => {
    const defaultFloor = initialFloor || (selectedPiso !== 'todos' && selectedPiso !== 'Mesa' ? selectedPiso : '1ro');
    setConsumptionDraft({
      clientId: '',
      clientName: '',
      piso: defaultFloor,
      accountType: 'diaria',
      date: targetDate,
      dayOfWeek: getDayOfWeekName(targetDate),
      locationType: 'tienda',
      menuType: 'menu_completo',
      lunchQuantity: 1,
      completoQuantity: 1,
      segundoSoloQuantity: 0,
      selectedExtras: [],
      notes: '',
      paymentStatus: 'pendiente',
      paymentMethod: 'efectivo',
      phone: '',
    });
    setShowAddConsumptionModal(true);
  };

  const handleOpenEditConsumption = (consumption: ConsumptionRecord) => {
    const primaryLunch = consumption.lunches[0];
    const completoQty = consumption.lunches
      .filter((l) => l.menuType === 'menu_completo')
      .reduce((s, l) => s + l.quantity, 0);
    const segundoQty = consumption.lunches
      .filter((l) => l.menuType === 'solo_segundo')
      .reduce((s, l) => s + l.quantity, 0);
    
    // Fallback if lunches array had single legacy item
    let initialCompleto = completoQty;
    let initialSegundo = segundoQty;
    if (completoQty === 0 && segundoQty === 0 && primaryLunch) {
      if (primaryLunch.menuType === 'solo_segundo') {
        initialSegundo = primaryLunch.quantity || 1;
      } else {
        initialCompleto = primaryLunch.quantity || 1;
      }
    }

    const selectedExtras = consumption.extras.map((ex) => {
      const catalogItem = extrasCatalog.find((c) => c.id === ex.extraId) || {
        id: ex.extraId || `ex-${Date.now()}`,
        name: ex.name,
        description: ex.description || '',
        price: ex.price,
        category: normalizeExtraCategory(ex.description) || 'Bebidas',
        available: true,
      };
      return {
        extra: catalogItem,
        quantity: ex.quantity,
      };
    });

    const clientPhone = clients.find((c) => c.id === consumption.clientId)?.phone || '';

    setConsumptionDraft({
      id: consumption.id,
      clientId: consumption.clientId,
      clientName: consumption.clientName,
      piso: consumption.piso,
      accountType: consumption.accountType,
      date: consumption.date,
      dayOfWeek: consumption.dayOfWeek,
      locationType: primaryLunch?.clientType || 'tienda',
      menuType: initialSegundo > 0 && initialCompleto === 0 ? 'solo_segundo' : 'menu_completo',
      lunchQuantity: initialCompleto + initialSegundo,
      completoQuantity: initialCompleto,
      segundoSoloQuantity: initialSegundo,
      selectedExtras,
      notes: consumption.notes || '',
      paymentStatus: consumption.paymentStatus || 'pendiente',
      paymentMethod: consumption.paymentMethod || 'efectivo',
      phone: clientPhone,
    });
    setShowAddConsumptionModal(true);
  };

  // Helper functions to modify extras in consumption draft
  const handleAddExtraToDraft = (extra: ExtraItem) => {
    if (!consumptionDraft) return;
    const existing = consumptionDraft.selectedExtras.find((i) => i.extra.id === extra.id);
    if (existing) {
      setConsumptionDraft({
        ...consumptionDraft,
        selectedExtras: consumptionDraft.selectedExtras.map((i) =>
          i.extra.id === extra.id ? { ...i, quantity: i.quantity + 1 } : i
        ),
      });
    } else {
      setConsumptionDraft({
        ...consumptionDraft,
        selectedExtras: [...consumptionDraft.selectedExtras, { extra, quantity: 1 }],
      });
    }
  };

  const handleDecrementExtraInDraft = (extraId: string) => {
    if (!consumptionDraft) return;
    const existing = consumptionDraft.selectedExtras.find((i) => i.extra.id === extraId);
    if (!existing) return;
    if (existing.quantity > 1) {
      setConsumptionDraft({
        ...consumptionDraft,
        selectedExtras: consumptionDraft.selectedExtras.map((i) =>
          i.extra.id === extraId ? { ...i, quantity: i.quantity - 1 } : i
        ),
      });
    } else {
      setConsumptionDraft({
        ...consumptionDraft,
        selectedExtras: consumptionDraft.selectedExtras.filter((i) => i.extra.id !== extraId),
      });
    }
  };

  const handleRemoveExtraFromDraft = (extraId: string) => {
    if (!consumptionDraft) return;
    setConsumptionDraft({
      ...consumptionDraft,
      selectedExtras: consumptionDraft.selectedExtras.filter((i) => i.extra.id !== extraId),
    });
  };

  // Configurar cantidad directa de un extra en el borrador
  const handleSetExtraQuantityInDraft = (extra: ExtraItem, quantity: number) => {
    if (!consumptionDraft) return;
    const targetQty = Math.max(0, quantity);
    const existing = consumptionDraft.selectedExtras.find((i) => i.extra.id === extra.id);
    if (targetQty === 0) {
      if (existing) {
        setConsumptionDraft({
          ...consumptionDraft,
          selectedExtras: consumptionDraft.selectedExtras.filter((i) => i.extra.id !== extra.id),
        });
      }
    } else {
      if (existing) {
        setConsumptionDraft({
          ...consumptionDraft,
          selectedExtras: consumptionDraft.selectedExtras.map((i) =>
            i.extra.id === extra.id ? { ...i, quantity: targetQty } : i
          ),
        });
      } else {
        setConsumptionDraft({
          ...consumptionDraft,
          selectedExtras: [...consumptionDraft.selectedExtras, { extra, quantity: targetQty }],
        });
      }
    }
  };

  // Agregar rápidamente +1, +2, +5 unidades
  const handleQuickAddExtraInDraft = (extra: ExtraItem, countToAdd: number) => {
    if (!consumptionDraft) return;
    const existing = consumptionDraft.selectedExtras.find((i) => i.extra.id === extra.id);
    const currentQty = existing ? existing.quantity : 0;
    handleSetExtraQuantityInDraft(extra, currentQty + countToAdd);
  };

  const handleSaveConsumption = (e: React.FormEvent) => {
    e.preventDefault();
    if (!consumptionDraft) return;

    const locType = consumptionDraft.locationType || 'tienda';
    const priceCompleto = BASE_PRICES[locType]['menu_completo'];
    const priceSegundo = BASE_PRICES[locType]['solo_segundo'];

    const completoCount = Math.max(0, consumptionDraft.completoQuantity ?? 0);
    const segundoCount = Math.max(0, consumptionDraft.segundoSoloQuantity ?? 0);
    const totalLunchQty = completoCount + segundoCount;

    const totalCompleto = priceCompleto * completoCount;
    const totalSegundo = priceSegundo * segundoCount;
    const lunchTotal = totalCompleto + totalSegundo;

    const extrasOrderList: OrderExtraItem[] = consumptionDraft.selectedExtras.map((item) => ({
      id: `ex-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      extraId: item.extra.id,
      name: item.extra.name,
      description: item.extra.description,
      price: item.extra.price,
      quantity: item.quantity,
      totalPrice: item.extra.price * item.quantity,
    }));

    const extrasTotal = extrasOrderList.reduce((sum, item) => sum + item.totalPrice, 0);
    const grandTotal = lunchTotal + extrasTotal;

    // Validación: debe haber al menos 1 menú (completo o segundo solo) o al menos 1 adicional/bebida
    if (totalLunchQty <= 0 && extrasOrderList.length === 0) {
      alert('Debes indicar al menos 1 menú (completo o segundo solo) o agregar al menos 1 bebida/adicional.');
      return;
    }

    const clientNameClean = consumptionDraft.clientName.trim();
    if (!clientNameClean) {
      alert('Debes ingresar o seleccionar el nombre de la persona o puesto para este pedido.');
      return;
    }

    const selectedFloor = normalizePiso(
      consumptionDraft.piso || (selectedPiso !== 'todos' ? selectedPiso : '1ro')
    );
    let finalClientId = consumptionDraft.clientId;
    let finalClientName = clientNameClean;
    let finalPiso = selectedFloor;
    const isDaily = consumptionDraft.accountType === 'diaria';

    // If it's a daily order:
    if (isDaily) {
      if (!finalClientId || finalClientId === '__new__' || !clients.some((c) => c.id === finalClientId)) {
        // Check if a client with the same name already exists (case and accent insensitive)
        const existingClient = findClientByName(clients, clientNameClean);

        if (existingClient) {
          finalClientId = existingClient.id;
          finalClientName = existingClient.name;
          finalPiso = selectedFloor;
          // Synchronize floor on existing client record if changed
          if (normalizePiso(existingClient.piso) !== selectedFloor) {
            onSaveClients(
              clients.map((c) => (c.id === existingClient.id ? { ...c, piso: selectedFloor } : c))
            );
          }
        } else {
          // Create new client in the moment AS DAILY CLIENT with the chosen floor!
          const newClientId = `cli-dia-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
          let cleanPhone = consumptionDraft.phone ? consumptionDraft.phone.trim() : undefined;
          if (cleanPhone) {
            cleanPhone = formatPhoneForWhatsApp(cleanPhone);
          }
          const newClient: ClientRecord = {
            id: newClientId,
            name: clientNameClean,
            piso: finalPiso,
            accountType: 'diaria', // CREATED STRICTLY FOR DIARIAS!
            phone: cleanPhone,
            active: true,
          };
          onSaveClients([...clients, newClient]);
          finalClientId = newClientId;
        }
      } else {
        // Existing client chosen: update floor in client record if changed!
        const existingClient = clients.find((c) => c.id === finalClientId);
        if (existingClient && normalizePiso(existingClient.piso) !== selectedFloor) {
          onSaveClients(
            clients.map((c) => (c.id === finalClientId ? { ...c, piso: selectedFloor } : c))
          );
        }
      }
    }

    const lunchItems: LunchItem[] = [];
    if (completoCount > 0) {
      lunchItems.push({
        id: `ln-comp-${Date.now()}`,
        clientType: locType,
        menuType: 'menu_completo',
        segundo: 'Menú Completo',
        quantity: completoCount,
        unitPrice: priceCompleto,
        totalPrice: totalCompleto,
      });
    }
    if (segundoCount > 0) {
      lunchItems.push({
        id: `ln-seg-${Date.now() + 1}`,
        clientType: locType,
        menuType: 'solo_segundo',
        segundo: 'Segundo Solo',
        quantity: segundoCount,
        unitPrice: priceSegundo,
        totalPrice: totalSegundo,
      });
    }

    if (consumptionDraft.id) {
      // Editar consumo existente
      const existing = consumptions.find((c) => c.id === consumptionDraft.id);
      const updatedConsumption: ConsumptionRecord = {
        ...(existing || {
          id: consumptionDraft.id,
          timestamp: new Date().toISOString(),
        }),
        clientId: finalClientId || consumptionDraft.clientId,
        clientName: finalClientName,
        piso: finalPiso,
        accountType: consumptionDraft.accountType,
        date: consumptionDraft.date,
        dayOfWeek: consumptionDraft.dayOfWeek,
        lunches: lunchItems,
        extras: extrasOrderList,
        total: grandTotal,
        paymentStatus: consumptionDraft.paymentStatus,
        paymentMethod: consumptionDraft.paymentStatus === 'pagado' ? consumptionDraft.paymentMethod : undefined,
        paymentDate: consumptionDraft.paymentStatus === 'pagado' ? consumptionDraft.date : undefined,
        notes: consumptionDraft.notes.trim() || undefined,
      };

      onSaveConsumptions(consumptions.map((c) => (c.id === consumptionDraft.id ? updatedConsumption : c)));
    } else {
      // Registrar nuevo consumo
      const newConsumption: ConsumptionRecord = {
        id: `cons-${Date.now()}`,
        clientId: finalClientId || consumptionDraft.clientId,
        clientName: finalClientName,
        piso: finalPiso,
        accountType: consumptionDraft.accountType,
        date: consumptionDraft.date,
        dayOfWeek: consumptionDraft.dayOfWeek,
        timestamp: new Date().toISOString(),
        lunches: lunchItems,
        extras: extrasOrderList,
        total: grandTotal,
        paymentStatus: consumptionDraft.paymentStatus,
        paymentMethod: consumptionDraft.paymentStatus === 'pagado' ? consumptionDraft.paymentMethod : undefined,
        paymentDate: consumptionDraft.paymentStatus === 'pagado' ? consumptionDraft.date : undefined,
        notes: consumptionDraft.notes.trim() || undefined,
      };

      onSaveConsumptions([newConsumption, ...consumptions]);
    }

    if (isDaily) {
      setActiveTab('diarias');
    }

    setShowAddConsumptionModal(false);
    setConsumptionDraft(null);
  };

  const handleDeleteConsumption = (id: string) => {
    const target = consumptions.find((c) => c.id === id);
    const desc = target
      ? `${target.clientName} (${target.dayOfWeek} ${target.date}): ${target.lunches.map((l) => `${l.quantity}x ${l.menuType === 'menu_completo' ? 'Menú' : 'Segundo'}`).join(', ')} — Total: ${formatCurrency(target.total)}`
      : undefined;

    setConfirmModal({
      isOpen: true,
      title: '¿Eliminar este pedido?',
      message: '¿Estás seguro de borrar este pedido del día? Se restará automáticamente del saldo y de la caja.',
      detail: desc,
      confirmLabel: 'Sí, eliminar pedido',
      cancelLabel: 'Cancelar',
      isDestructive: true,
      onConfirm: () => {
        onSaveConsumptions(consumptions.filter((c) => c.id !== id));
      },
    });
  };

  // Borrar todos los pedidos de un cliente en un día específico de la semana
  const handleClearDayOrders = (clientId: string, clientName: string, dateStr: string, dayName: string) => {
    const dayCons = consumptions.filter((c) => c.clientId === clientId && c.date === dateStr);
    const dayTotal = dayCons.reduce((s, c) => s + c.total, 0);

    setConfirmModal({
      isOpen: true,
      title: `¿Borrar pedidos del ${dayName}?`,
      message: `¿Deseas borrar todos los consumos anotados para ${clientName} el ${dayName} (${dateStr})?`,
      detail: `Total a eliminar: ${formatCurrency(dayTotal)} (${dayCons.length} pedido(s))`,
      confirmLabel: 'Sí, borrar pedidos del día',
      cancelLabel: 'Cancelar',
      isDestructive: true,
      onConfirm: () => {
        onSaveConsumptions(
          consumptions.filter((c) => !(c.clientId === clientId && c.date === dateStr))
        );
      },
    });
  };

  // Payment Handlers (Abonos)
  const handleOpenPaymentModal = (client: ClientRecord) => {
    const clientCons = consumptions
      .filter((c) => c.clientId === client.id)
      .reduce((s, c) => s + c.total, 0);
    const clientPays = payments
      .filter((p) => p.clientId === client.id)
      .reduce((s, p) => s + p.amount, 0);
    const pendingDebt = Math.max(0, clientCons - clientPays);

    setPaymentDraft({
      clientId: client.id,
      clientName: client.name,
      piso: client.piso,
      accountType: client.accountType,
      amount: '',
      method: 'efectivo',
      date: today,
      notes: '',
      pendingDebt,
    });
    setPaymentError(null);
    setShowPaymentModal(true);
  };

  const handleSavePayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentDraft) return;

    const amountNum = parseFloat(paymentDraft.amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setPaymentError('Por favor ingresa un monto válido mayor a 0');
      return;
    }

    const newPayment: PaymentRecord = {
      id: `pay-${Date.now()}`,
      clientId: paymentDraft.clientId,
      clientName: paymentDraft.clientName,
      piso: paymentDraft.piso,
      accountType: paymentDraft.accountType,
      date: paymentDraft.date,
      dayOfWeek: getDayOfWeekName(paymentDraft.date),
      amount: amountNum,
      method: paymentDraft.method,
      notes: paymentDraft.notes.trim() || undefined,
      timestamp: new Date().toISOString(),
    };

    onSavePayments([newPayment, ...payments]);
    setShowPaymentModal(false);
    setPaymentDraft(null);
    setPaymentError(null);
  };

  const handleDeletePayment = (id: string) => {
    const target = payments.find((p) => p.id === id);
    const desc = target
      ? `${target.clientName}: Abono de ${formatCurrency(target.amount)} en ${target.method} (${target.date})`
      : undefined;

    setConfirmModal({
      isOpen: true,
      title: '¿Eliminar registro de abono?',
      message: '¿Estás seguro de borrar este abono? El saldo por cobrar del cliente se actualizará.',
      detail: desc,
      confirmLabel: 'Sí, eliminar abono',
      cancelLabel: 'Cancelar',
      isDestructive: true,
      onConfirm: () => {
        onSavePayments(payments.filter((p) => p.id !== id));
      },
    });
  };

  // Cancelar Deuda Pasada (DP): se registra con la fecha del DÍA ACTUAL (hoy) para reflejar el cobro de hoy
  const handleOpenCancelDpModal = (client: ClientRecord, dpAmount: number) => {
    if (dpAmount <= 0) return;
    // Se registra con la fecha del día actual para que figure en la caja del día de hoy
    const targetDate = today;

    setCancelDpDraft({
      clientId: client.id,
      clientName: client.name,
      piso: client.piso,
      deudaPasada: dpAmount,
      amount: dpAmount.toFixed(2),
      method: 'efectivo',
      targetDate,
      notes: 'Canceló Deuda Pasada (DP)',
    });
    setCancelDpError(null);
    setShowCancelDpModal(true);
  };

  const handleConfirmCancelDp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancelDpDraft) return;

    const amountNum = parseFloat(cancelDpDraft.amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setCancelDpError('Por favor ingresa un monto válido mayor a 0');
      return;
    }

    const paymentDate = cancelDpDraft.targetDate || today;

    const newPayment: PaymentRecord = {
      id: `pay-${Date.now()}`,
      clientId: cancelDpDraft.clientId,
      clientName: cancelDpDraft.clientName,
      piso: cancelDpDraft.piso,
      accountType: 'semanal',
      date: paymentDate,
      dayOfWeek: getDayOfWeekName(paymentDate),
      amount: amountNum,
      method: cancelDpDraft.method,
      notes: cancelDpDraft.notes.trim() || 'Canceló Deuda Pasada (DP)',
      timestamp: new Date().toISOString(),
      isDpPayment: true,
    };

    onSavePayments([newPayment, ...payments]);
    setShowCancelDpModal(false);
    setCancelDpDraft(null);
    setCancelDpError(null);
  };

  // Cancelar Deuda Actual (DA): Liquida directamente los consumos pendientes de esta semana sin generar abono residual
  const handleOpenCancelDaModal = (client: ClientRecord, daAmount: number) => {
    if (daAmount <= 0) return;
    const targetDate = today;

    setCancelDaDraft({
      clientId: client.id,
      clientName: client.name,
      piso: client.piso,
      deudaActual: daAmount,
      amount: daAmount.toFixed(2),
      method: 'efectivo',
      targetDate,
      notes: 'Canceló Deuda Actual (DA)',
    });
    setCancelDaError(null);
    setShowCancelDaModal(true);
  };

  const handleConfirmCancelDa = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancelDaDraft) return;

    const amountNum = parseFloat(cancelDaDraft.amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setCancelDaError('Por favor ingresa un monto válido mayor a 0');
      return;
    }

    const paymentDate = cancelDaDraft.targetDate || today;

    const newPayment: PaymentRecord = {
      id: `pay-${Date.now()}`,
      clientId: cancelDaDraft.clientId,
      clientName: cancelDaDraft.clientName,
      piso: cancelDaDraft.piso,
      accountType: 'semanal',
      date: paymentDate,
      dayOfWeek: getDayOfWeekName(paymentDate),
      amount: amountNum,
      method: cancelDaDraft.method,
      notes: cancelDaDraft.notes.trim() || 'Canceló Deuda Actual (DA)',
      timestamp: new Date().toISOString(),
      isDaPayment: true,
    };

    onSavePayments([newPayment, ...payments]);
    setShowCancelDaModal(false);
    setCancelDaDraft(null);
    setCancelDaError(null);
  };

  // Quitar o eliminar cliente del registro
  const handleRemoveClient = (clientId: string, clientName: string) => {
    const clientConsumptions = consumptions.filter((c) => c.clientId === clientId);
    const clientPaymentsList = payments.filter((p) => p.clientId === clientId);
    const totalDebt =
      clientConsumptions.reduce((s, c) => s + c.total, 0) -
      clientPaymentsList.reduce((s, p) => s + p.amount, 0);

    setConfirmModal({
      isOpen: true,
      title: '¿Eliminar cliente del registro?',
      message: `¿Estás seguro de quitar a "${clientName}" del sistema?`,
      detail:
        totalDebt > 0
          ? `⚠️ Atención: Tiene un saldo pendiente de ${formatCurrency(totalDebt)}. Al eliminar al cliente, también se retirarán sus consumos y abonos registrados para mantener los balances limpios.`
          : 'Se retirará al cliente y se limpiarán sus registros asociados.',
      confirmLabel: 'Sí, eliminar cliente',
      cancelLabel: 'Cancelar',
      isDestructive: true,
      onConfirm: () => {
        onSaveClients(clients.filter((c) => c.id !== clientId));
        onSaveConsumptions(consumptions.filter((c) => c.clientId !== clientId));
        onSavePayments(payments.filter((p) => p.clientId !== clientId));
      },
    });
  };

  // Combinar clientes (Fusionar duplicados en un cliente principal "Main")
  const handleMergeClients = (mainClientId: string, secondaryClientIds: string[]) => {
    const mainClient = clients.find((c) => c.id === mainClientId);
    if (!mainClient || secondaryClientIds.length === 0) return;

    const secondaryClients = clients.filter((c) => secondaryClientIds.includes(c.id));
    const secondaryNamesNorm = new Set(
      secondaryClients.map((c) => normalizeClientName(c.name))
    );
    const secIdsSet = new Set(secondaryClientIds);

    // Separar consumos de clientes secundarios y principales
    const mainAndOtherCons: ConsumptionRecord[] = [];
    const secCons: ConsumptionRecord[] = [];

    consumptions.forEach((cons) => {
      const isSecMatch =
        secIdsSet.has(cons.clientId) ||
        secondaryNamesNorm.has(normalizeClientName(cons.clientName));
      if (isSecMatch) {
        secCons.push(cons);
      } else {
        mainAndOtherCons.push(cons);
      }
    });

    // Reasignar o fusionar consumos secundarios en el cliente principal
    const updatedConsumptions = [...mainAndOtherCons];

    secCons.forEach((sec) => {
      // Si el cliente principal ya tiene un consumo en la misma fecha, fusionar platos y adicionales
      const existingMainConsIdx = updatedConsumptions.findIndex(
        (c) => c.clientId === mainClient.id && c.date === sec.date
      );

      if (existingMainConsIdx >= 0) {
        const target = updatedConsumptions[existingMainConsIdx];
        const nextLunches = [...target.lunches, ...sec.lunches];
        const nextExtras = [...target.extras, ...sec.extras];
        const lTot = nextLunches.reduce((s, l) => s + l.totalPrice, 0);
        const eTot = nextExtras.reduce((s, e) => s + e.totalPrice, 0);
        const mergedNotes = [target.notes, sec.notes].filter(Boolean).join(' • ');

        updatedConsumptions[existingMainConsIdx] = {
          ...target,
          lunches: nextLunches,
          extras: nextExtras,
          total: lTot + eTot,
          notes: mergedNotes || undefined,
        };
      } else {
        // Asignar el consumo secundario a los datos del cliente principal
        updatedConsumptions.push({
          ...sec,
          clientId: mainClient.id,
          clientName: mainClient.name,
          piso: mainClient.piso,
          accountType: mainClient.accountType,
        });
      }
    });

    // Reasignar abonos / pagos
    const updatedPayments = payments.map((pay) => {
      const isSecMatch =
        secIdsSet.has(pay.clientId) ||
        secondaryNamesNorm.has(normalizeClientName(pay.clientName));
      if (isSecMatch) {
        return {
          ...pay,
          clientId: mainClient.id,
          clientName: mainClient.name,
          piso: mainClient.piso,
          accountType: mainClient.accountType,
        };
      }
      return pay;
    });

    // Eliminar los clientes secundarios de la lista de clientes
    const updatedClients = clients.filter((c) => !secIdsSet.has(c.id));

    onSaveClients(updatedClients);
    onSaveConsumptions(updatedConsumptions);
    onSavePayments(updatedPayments);
  };

  // Combinar Pedidos y Adicionales: Une platos y adicionales de pedidos secundarios en el Pedido Principal (Main)
  // El pedido principal conserva su día/fecha, cliente, piso y categoría, incorporando los adicionales de los demás.
  const handleExecuteMergeConsumptions = (mainId: string, secIds: string[]) => {
    if (!mainId || secIds.length === 0) return;

    const mainCons = consumptions.find((c) => c.id === mainId);
    if (!mainCons) return;

    const secIdsSet = new Set(secIds);
    const secondaryCons = consumptions.filter((c) => secIdsSet.has(c.id));
    if (secondaryCons.length === 0) return;

    let combinedLunches = [...mainCons.lunches];
    let combinedExtras = [...mainCons.extras];
    const combinedNotes: string[] = [];
    if (mainCons.notes) combinedNotes.push(mainCons.notes);

    secondaryCons.forEach((sec) => {
      sec.lunches.forEach((l) => {
        combinedLunches.push({
          ...l,
          id: `ln-mrg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        });
      });

      sec.extras.forEach((e) => {
        combinedExtras.push({
          ...e,
          id: `ex-mrg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        });
      });

      if (sec.notes && !combinedNotes.includes(sec.notes)) {
        combinedNotes.push(sec.notes);
      }
    });

    const lTotal = combinedLunches.reduce((s, l) => s + l.totalPrice, 0);
    const eTotal = combinedExtras.reduce((s, e) => s + e.totalPrice, 0);
    const newGrandTotal = lTotal + eTotal;

    const updatedMain: ConsumptionRecord = {
      ...mainCons,
      lunches: combinedLunches,
      extras: combinedExtras,
      total: newGrandTotal,
      notes: combinedNotes.length > 0 ? combinedNotes.join(' • ') : undefined,
    };

    const nextConsumptions = consumptions
      .filter((c) => !secIdsSet.has(c.id))
      .map((c) => (c.id === mainId ? updatedMain : c));

    onSaveConsumptions(nextConsumptions);
  };

  // Mark Daily Order as Paid immediately (fijado a la fecha seleccionada para que no brinque a otros días)
  const handleMarkDailyPaid = (consumptionId: string, method: PaymentMethod) => {
    const updated = consumptions.map((c) => {
      if (c.id === consumptionId) {
        return {
          ...c,
          paymentStatus: 'pagado' as const,
          paymentMethod: method,
          paymentDate: selectedDate, // Se queda registrado en la fecha seleccionada
        };
      }
      return c;
    });
    onSaveConsumptions(updated);
  };

  // Revertir consumo diario a estado Pendiente (por si se equivocaron al marcarlo pagado)
  const handleMarkDailyPending = (consumptionId: string) => {
    const updated = consumptions.map((c) => {
      if (c.id === consumptionId) {
        return {
          ...c,
          paymentStatus: 'pendiente' as const,
          paymentMethod: undefined,
          paymentDate: undefined,
        };
      }
      return c;
    });
    onSaveConsumptions(updated);
  };

  // Cobrar un producto/adicional individual de una cuenta diaria
  // =========================================================================
  // COBRO DE CUENTAS DIARIAS CON ABONOS PREVIOS
  // Si la cuenta tiene abonos sin aplicar, primero se usan esos abonos y solo
  // el resto entra a la caja del día. Los pedidos liquidados (total o
  // parcialmente) con abonos quedan con método 'abono' (la caja ya los cuenta
  // a través de los registros de abono) y el resto se registra como un pago
  // `pay-saldo-<idPedido>-…` con el método elegido.
  // =========================================================================
  const findDailyAccountOf = (consumptionId: string) =>
    dailyAccountsList.find((a) => a.consumptions.some((c) => c.id === consumptionId));

  const settleDailyConsumptions = (
    account: DailyClientAccount | undefined,
    toPay: ConsumptionRecord[],
    method: PaymentMethod
  ): { settled: ConsumptionRecord[]; extraPayments: PaymentRecord[] } => {
    let available = account ? account.openAbono : 0;
    const stamp = Date.now();
    const nowIso = new Date().toISOString();
    const settled: ConsumptionRecord[] = [];
    const extraPayments: PaymentRecord[] = [];

    [...toPay]
      .sort((a, b) => a.date.localeCompare(b.date) || a.timestamp.localeCompare(b.timestamp))
      .forEach((c, idx) => {
        const applied = roundMoney(Math.min(available, c.total));
        available = roundMoney(available - applied);
        const remainder = roundMoney(c.total - applied);

        if (applied > 0 && account) {
          settled.push({ ...c, paymentStatus: 'pagado', paymentMethod: 'abono', paymentDate: selectedDate });
          if (remainder > 0) {
            extraPayments.push({
              id: `pay-saldo-${c.id}-${stamp}${idx}`,
              clientId: account.clientId,
              clientName: account.clientName,
              piso: account.piso,
              accountType: 'diaria',
              date: selectedDate,
              dayOfWeek: getDayOfWeekName(selectedDate),
              amount: remainder,
              method,
              notes: 'Saldo restante al cobrar la cuenta',
              timestamp: nowIso,
            });
          }
        } else {
          settled.push({ ...c, paymentStatus: 'pagado', paymentMethod: method, paymentDate: selectedDate });
        }
      });

    return { settled, extraPayments };
  };

  /** Pagos `pay-saldo-…` generados al cobrar estos pedidos (se borran si se deshace el cobro). */
  const isSettlementPaymentOf = (p: PaymentRecord, consumptionIds: Set<string>) =>
    p.id.startsWith('pay-saldo-') &&
    [...consumptionIds].some((id) => p.id.startsWith(`pay-saldo-${id}-`));

  const handlePayAccountItem = (item: DailyAccountProductItem, method: PaymentMethod) => {
    const targetCons = consumptions.find((c) => c.id === item.consumptionId);
    if (!targetCons) return;
    const account = findDailyAccountOf(targetCons.id);

    const totalItemsInCons = targetCons.lunches.length + targetCons.extras.length;

    // Si el pedido solo contiene este producto, lo marcamos directamente como pagado hoy
    if (totalItemsInCons <= 1) {
      const { settled, extraPayments } = settleDailyConsumptions(account, [targetCons], method);
      if (extraPayments.length > 0) onSavePayments([...extraPayments, ...payments]);
      const updated = consumptions.map((c) => (c.id === targetCons.id ? settled[0] : c));
      onSaveConsumptions(updated);
      return;
    }

    // Si el pedido tiene múltiples productos (ej. Menú + Palta), separamos el producto pagado en su propio registro
    // para que ingrese de inmediato a la caja de hoy y los demás productos continúen como deuda pendiente.
    let targetLunch: LunchItem | undefined;
    let targetExtra: OrderExtraItem | undefined;
    let remainingLunches = [...targetCons.lunches];
    let remainingExtras = [...targetCons.extras];

    if (item.type === 'lunch') {
      targetLunch = targetCons.lunches.find((l) => l.id === item.id);
      remainingLunches = remainingLunches.filter((l) => l.id !== item.id);
    } else {
      targetExtra = targetCons.extras.find((e) => e.id === item.id);
      remainingExtras = remainingExtras.filter((e) => e.id !== item.id);
    }

    const remainingLunchesTotal = remainingLunches.reduce((s, l) => s + l.totalPrice, 0);
    const remainingExtrasTotal = remainingExtras.reduce((s, e) => s + e.totalPrice, 0);
    const remainingTotal = remainingLunchesTotal + remainingExtrasTotal;

    const updatedPendingCons: ConsumptionRecord = {
      ...targetCons,
      lunches: remainingLunches,
      extras: remainingExtras,
      total: remainingTotal,
    };

    const paidConsDraft: ConsumptionRecord = {
      id: `cons-${Date.now()}`,
      clientId: targetCons.clientId,
      clientName: targetCons.clientName,
      piso: targetCons.piso,
      accountType: targetCons.accountType,
      date: targetCons.date,
      dayOfWeek: targetCons.dayOfWeek,
      timestamp: new Date().toISOString(),
      lunches: targetLunch ? [targetLunch] : [],
      extras: targetExtra ? [targetExtra] : [],
      total: item.totalPrice,
      paymentStatus: 'pagado' as const,
      paymentMethod: method,
      paymentDate: selectedDate,
      notes: item.notes ? `${item.notes} (Cobrado individual)` : undefined,
    };
    const {
      settled: [paidCons],
      extraPayments,
    } = settleDailyConsumptions(account, [paidConsDraft], method);
    if (extraPayments.length > 0) onSavePayments([...extraPayments, ...payments]);

    const nextConsumptions = [
      paidCons,
      ...consumptions.map((c) => (c.id === targetCons.id ? updatedPendingCons : c)),
    ];
    onSaveConsumptions(nextConsumptions);
  };

  // Revertir un producto cobrado a estado pendiente
  const handleRevertAccountItem = (item: DailyAccountProductItem) => {
    // Si al cobrarlo se registró un pago por el saldo restante, se anula también
    const settlementIds = new Set([item.consumptionId]);
    if (payments.some((p) => isSettlementPaymentOf(p, settlementIds))) {
      onSavePayments(payments.filter((p) => !isSettlementPaymentOf(p, settlementIds)));
    }
    const updated = consumptions.map((c) => {
      if (c.id === item.consumptionId) {
        return {
          ...c,
          paymentStatus: 'pendiente' as const,
          paymentMethod: undefined,
          paymentDate: undefined,
        };
      }
      return c;
    });
    onSaveConsumptions(updated);
  };

  // Cobrar un pedido diario completo (con todos sus platos y adicionales)
  const handlePayDailyOrder = (consumptionId: string, method: PaymentMethod) => {
    const updated = consumptions.map((c) => {
      if (c.id === consumptionId) {
        return {
          ...c,
          paymentStatus: 'pagado' as const,
          paymentMethod: method,
          paymentDate: selectedDate,
        };
      }
      return c;
    });
    onSaveConsumptions(updated);
  };

  const handleRevertDailyOrder = (consumptionId: string) => {
    const updated = consumptions.map((c) => {
      if (c.id === consumptionId) {
        return {
          ...c,
          paymentStatus: 'pendiente' as const,
          paymentMethod: undefined,
          paymentDate: undefined,
        };
      }
      return c;
    });
    onSaveConsumptions(updated);
  };

  // Cobrar todos los pedidos de un día específico en una cuenta semanal
  const handlePayWeeklyDay = (
    client: ClientRecord,
    dayData: { dateStr: string; dayName: string; consumptions: ConsumptionRecord[]; total: number },
    method: PaymentMethod
  ) => {
    const pendingCons = dayData.consumptions.filter((c) => c.paymentStatus !== 'pagado');
    const amountToPay = pendingCons.reduce((s, c) => s + c.total, 0);
    if (amountToPay <= 0) return;

    const paymentDate = selectedDate || today;

    const pendingIds = new Set(pendingCons.map((c) => c.id));
    const updatedCons = consumptions.map((c) => {
      if (pendingIds.has(c.id)) {
        return {
          ...c,
          paymentStatus: 'pagado' as const,
          paymentMethod: method,
          paymentDate: paymentDate,
        };
      }
      return c;
    });

    onSaveConsumptions(updatedCons);
  };

  // Revertir pago de un día específico en una cuenta semanal
  const handleRevertWeeklyDay = (
    client: ClientRecord,
    dayData: { dateStr: string; dayName: string; consumptions: ConsumptionRecord[]; total: number }
  ) => {
    const dayIds = new Set(dayData.consumptions.map((c) => c.id));

    const updatedCons = consumptions.map((c) => {
      if (dayIds.has(c.id)) {
        return {
          ...c,
          paymentStatus: 'pendiente' as const,
          paymentMethod: undefined,
          paymentDate: undefined,
        };
      }
      return c;
    });

    onSaveConsumptions(updatedCons);
  };

  // Cobrar un pedido individual dentro de un día de cuenta semanal
  const handlePayWeeklyConsumption = (
    client: ClientRecord,
    cons: ConsumptionRecord,
    method: PaymentMethod
  ) => {
    const paymentDate = selectedDate || today;

    const updatedCons = consumptions.map((c) => {
      if (c.id === cons.id) {
        return {
          ...c,
          paymentStatus: 'pagado' as const,
          paymentMethod: method,
          paymentDate: paymentDate,
        };
      }
      return c;
    });

    onSaveConsumptions(updatedCons);
  };

  // Revertir cobro de un pedido individual dentro de un día de cuenta semanal
  const handleRevertWeeklyConsumption = (
    client: ClientRecord,
    cons: ConsumptionRecord
  ) => {
    const updatedCons = consumptions.map((c) => {
      if (c.id === cons.id) {
        return {
          ...c,
          paymentStatus: 'pendiente' as const,
          paymentMethod: undefined,
          paymentDate: undefined,
        };
      }
      return c;
    });

    onSaveConsumptions(updatedCons);
  };

  // Cobrar un producto/extra individual dentro de un día de cuenta semanal
  const handlePayWeeklyItem = (
    client: ClientRecord,
    cons: ConsumptionRecord,
    itemType: 'lunch' | 'extra',
    itemId: string,
    method: PaymentMethod
  ) => {
    const paymentDate = selectedDate || today;
    const totalItems = cons.lunches.length + cons.extras.length;

    if (totalItems <= 1) {
      handlePayWeeklyConsumption(client, cons, method);
      return;
    }

    let targetLunch: LunchItem | undefined;
    let targetExtra: OrderExtraItem | undefined;
    let remainingLunches = [...cons.lunches];
    let remainingExtras = [...cons.extras];
    let itemPrice = 0;

    if (itemType === 'lunch') {
      targetLunch = cons.lunches.find((l) => l.id === itemId);
      if (!targetLunch) return;
      remainingLunches = remainingLunches.filter((l) => l.id !== itemId);
      itemPrice = targetLunch.totalPrice;
    } else {
      targetExtra = cons.extras.find((e) => e.id === itemId);
      if (!targetExtra) return;
      remainingExtras = remainingExtras.filter((e) => e.id !== itemId);
      itemPrice = targetExtra.totalPrice;
    }

    const remainingTotal =
      remainingLunches.reduce((s, l) => s + l.totalPrice, 0) +
      remainingExtras.reduce((s, e) => s + e.totalPrice, 0);

    const updatedPendingCons: ConsumptionRecord = {
      ...cons,
      lunches: remainingLunches,
      extras: remainingExtras,
      total: remainingTotal,
    };

    const paidCons: ConsumptionRecord = {
      id: `cons-${Date.now()}`,
      clientId: cons.clientId,
      clientName: cons.clientName,
      piso: cons.piso,
      accountType: cons.accountType,
      date: cons.date,
      dayOfWeek: cons.dayOfWeek,
      timestamp: new Date().toISOString(),
      lunches: targetLunch ? [targetLunch] : [],
      extras: targetExtra ? [targetExtra] : [],
      total: itemPrice,
      paymentStatus: 'pagado' as const,
      paymentMethod: method,
      paymentDate: paymentDate,
      notes: cons.notes ? `${cons.notes} (Cobrado individual)` : undefined,
    };

    onSaveConsumptions([
      paidCons,
      ...consumptions.map((c) => (c.id === cons.id ? updatedPendingCons : c)),
    ]);
  };

  // Handlers para Cuentas Diarias Consolidadas (Contraer, Expandir, Agregar Producto, Modificar y Cobrar)
  const toggleCollapseDaily = (clientId: string) => {
    setCollapsedDailyAccounts((prev) => ({
      ...prev,
      [clientId]: !prev[clientId],
    }));
  };

  const collapseAllDaily = () => {
    const next: Record<string, boolean> = {};
    dailyAccountsList.forEach((acc) => {
      next[acc.clientId] = true;
    });
    setCollapsedDailyAccounts(next);
  };

  const expandAllDaily = () => {
    setCollapsedDailyAccounts({});
  };

  const toggleCollapseWeekly = (clientId: string) => {
    setCollapsedWeeklyAccounts((prev) => ({
      ...prev,
      [clientId]: !prev[clientId],
    }));
  };

  const collapseAllWeekly = () => {
    const next: Record<string, boolean> = {};
    weeklyClients.forEach((cl) => {
      next[cl.id] = true;
    });
    setCollapsedWeeklyAccounts(next);
  };

  const expandAllWeekly = () => {
    setCollapsedWeeklyAccounts({});
  };

  // Agregar Producto a Cuenta Diaria Existente
  const handleOpenAddProductModal = (account: DailyClientAccount) => {
    setAddProductTarget(account);
    const isMesa = account.isMesa || normalizePiso(account.piso) === 'Mesa' || account.clientName.trim().toLowerCase().startsWith('mesa');
    const loc: ClientType = isMesa ? 'mesa' : 'tienda';
    setAddProdLocation(loc);
    setAddProdCompletoQty(1); // Inicia con 1 Menú Completo seleccionado por defecto
    setAddProdSegundoQty(0);
    setAddProdSelectedExtras([]);
    setAddProdExtraCategoryFilter('Todos');
    setAddProdExtraSearch('');
    setAddProdNotes('');
  };

  const handleToggleExtraInAddProduct = (extra: ExtraItem, delta: number) => {
    setAddProdSelectedExtras((prev) => {
      const existing = prev.find((item) => item.extra.id === extra.id);
      if (!existing) {
        if (delta > 0) {
          return [...prev, { extra, quantity: delta }];
        }
        return prev;
      }
      const newQty = existing.quantity + delta;
      if (newQty <= 0) {
        return prev.filter((item) => item.extra.id !== extra.id);
      }
      return prev.map((item) => (item.extra.id === extra.id ? { ...item, quantity: newQty } : item));
    });
  };

  const handleSetExtraQtyInAddProduct = (extra: ExtraItem, qty: number) => {
    setAddProdSelectedExtras((prev) => {
      if (qty <= 0) {
        return prev.filter((item) => item.extra.id !== extra.id);
      }
      const existing = prev.find((item) => item.extra.id === extra.id);
      if (existing) {
        return prev.map((item) => (item.extra.id === extra.id ? { ...item, quantity: qty } : item));
      }
      return [...prev, { extra, quantity: qty }];
    });
  };

  const handleAddProductToAccount = () => {
    if (!addProductTarget) return;

    const targetAccount = addProductTarget;
    const nowIso = new Date().toISOString();
    const targetDate = selectedDate;
    const dayName = getDayOfWeekName(targetDate);

    const priceCompleto = addProdLocation === 'tienda' ? BASE_PRICES.tienda.menu_completo : BASE_PRICES.mesa.menu_completo;
    const priceSegundo = addProdLocation === 'tienda' ? BASE_PRICES.tienda.solo_segundo : BASE_PRICES.mesa.solo_segundo;

    const newLunchesToAdd: LunchItem[] = [];
    if (addProdCompletoQty > 0) {
      newLunchesToAdd.push({
        id: `lunch-comp-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        clientType: addProdLocation,
        menuType: 'menu_completo',
        segundo: addProdNotes.trim() || 'Menú Completo',
        quantity: addProdCompletoQty,
        unitPrice: priceCompleto,
        totalPrice: addProdCompletoQty * priceCompleto,
        notes: addProdNotes.trim() || undefined,
      });
    }

    if (addProdSegundoQty > 0) {
      newLunchesToAdd.push({
        id: `lunch-seg-${Date.now() + 1}-${Math.random().toString(36).substr(2, 4)}`,
        clientType: addProdLocation,
        menuType: 'solo_segundo',
        segundo: addProdNotes.trim() || 'Solo Segundo',
        quantity: addProdSegundoQty,
        unitPrice: priceSegundo,
        totalPrice: addProdSegundoQty * priceSegundo,
        notes: addProdNotes.trim() || undefined,
      });
    }

    const newExtrasToAdd: OrderExtraItem[] = addProdSelectedExtras.map((item, idx) => ({
      id: `extra-item-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 4)}`,
      extraId: item.extra.id,
      name: item.extra.name,
      description: item.extra.description,
      price: item.extra.price,
      quantity: item.quantity,
      totalPrice: item.quantity * item.extra.price,
    }));

    if (newLunchesToAdd.length === 0 && newExtrasToAdd.length === 0) {
      // Si no hay nada seleccionado, no guardar nada
      return;
    }

    // Buscar si ya existe un consumo diario pendiente para este cliente en la fecha seleccionada
    const existingCons = consumptions.find(
      (c) =>
        c.accountType === 'diaria' &&
        (c.clientId === targetAccount.clientId ||
          c.clientName.trim().toLowerCase() === targetAccount.clientName.trim().toLowerCase()) &&
        c.date === targetDate &&
        c.paymentStatus === 'pendiente'
    );

    let updatedConsumptions: ConsumptionRecord[];

    if (existingCons) {
      updatedConsumptions = consumptions.map((c) => {
        if (c.id === existingCons.id) {
          const nextLunches = [...c.lunches, ...newLunchesToAdd];
          const nextExtras = [...c.extras, ...newExtrasToAdd];
          const lunchesTotal = nextLunches.reduce((s, l) => s + l.totalPrice, 0);
          const extrasTotal = nextExtras.reduce((s, e) => s + e.totalPrice, 0);
          return {
            ...c,
            lunches: nextLunches,
            extras: nextExtras,
            total: lunchesTotal + extrasTotal,
          };
        }
        return c;
      });
    } else {
      const lunchesTotal = newLunchesToAdd.reduce((s, l) => s + l.totalPrice, 0);
      const extrasTotal = newExtrasToAdd.reduce((s, e) => s + e.totalPrice, 0);
      const newCons: ConsumptionRecord = {
        id: `cons-${Date.now()}`,
        clientId: targetAccount.clientId,
        clientName: targetAccount.clientName,
        piso: targetAccount.piso,
        accountType: 'diaria',
        date: targetDate,
        dayOfWeek: dayName,
        timestamp: nowIso,
        lunches: newLunchesToAdd,
        extras: newExtrasToAdd,
        total: lunchesTotal + extrasTotal,
        paymentStatus: 'pendiente',
        notes: addProdNotes.trim() || undefined,
      };
      updatedConsumptions = [newCons, ...consumptions];
    }

    onSaveConsumptions(updatedConsumptions);
    setAddProductTarget(null);
  };

  // Modificar ítem consumido de la cuenta
  const handleOpenEditAccountItem = (item: DailyAccountProductItem, clientName: string) => {
    setEditingAccountItem(item);
    setEditItemClientName(clientName);
    setEditItemQty(item.quantity);
    setEditItemPrice(item.unitPrice);
    setEditItemNotes(item.notes || '');
  };

  const handleSaveEditAccountItem = () => {
    if (!editingAccountItem) return;
    if (editItemQty <= 0) return;
    if (editItemPrice < 0) return;

    const updated = consumptions.map((c) => {
      if (c.id === editingAccountItem.consumptionId) {
        let nextLunches = [...c.lunches];
        let nextExtras = [...c.extras];

        if (editingAccountItem.type === 'lunch') {
          nextLunches = nextLunches.map((l) => {
            if (l.id === editingAccountItem.id) {
              return {
                ...l,
                quantity: editItemQty,
                unitPrice: editItemPrice,
                totalPrice: editItemQty * editItemPrice,
                notes: editItemNotes.trim() || undefined,
                segundo: editItemNotes.trim() || l.segundo,
              };
            }
            return l;
          });
        } else {
          nextExtras = nextExtras.map((e) => {
            if (e.id === editingAccountItem.id) {
              return {
                ...e,
                quantity: editItemQty,
                price: editItemPrice,
                totalPrice: editItemQty * editItemPrice,
                description: editItemNotes.trim() || e.description,
              };
            }
            return e;
          });
        }

        const lTotal = nextLunches.reduce((s, l) => s + l.totalPrice, 0);
        const eTotal = nextExtras.reduce((s, e) => s + e.totalPrice, 0);

        return {
          ...c,
          lunches: nextLunches,
          extras: nextExtras,
          total: lTotal + eTotal,
        };
      }
      return c;
    });

    onSaveConsumptions(updated);
    setEditingAccountItem(null);
  };

  // Eliminar ítem individual de una cuenta
  const handleDeleteAccountItem = (item: DailyAccountProductItem, clientName: string) => {
    setConfirmModal({
      isOpen: true,
      title: '¿Quitar producto de la cuenta?',
      message: `¿Deseas eliminar "${item.name}" (${item.quantity}x a ${formatCurrency(item.unitPrice)}) de la cuenta de ${clientName}?`,
      detail: `Subtotal a descontar: ${formatCurrency(item.totalPrice)}`,
      confirmLabel: 'Sí, quitar producto',
      cancelLabel: 'Cancelar',
      isDestructive: true,
      onConfirm: () => {
        let updated = consumptions.map((c) => {
          if (c.id === item.consumptionId) {
            const nextLunches = c.lunches.filter((l) => l.id !== item.id);
            const nextExtras = c.extras.filter((e) => e.id !== item.id);
            const lTotal = nextLunches.reduce((s, l) => s + l.totalPrice, 0);
            const eTotal = nextExtras.reduce((s, e) => s + e.totalPrice, 0);
            return {
              ...c,
              lunches: nextLunches,
              extras: nextExtras,
              total: lTotal + eTotal,
            };
          }
          return c;
        });

        // Si el consumo se quedó sin platos ni extras, eliminar el registro completo
        updated = updated.filter((c) => c.lunches.length > 0 || c.extras.length > 0);

        onSaveConsumptions(updated);
      },
    });
  };

  // Cobrar Cuenta Diaria Completa (con 1 solo clic en Efectivo o Yape)
  const handlePayDailyAccountFull = (account: DailyClientAccount, method: PaymentMethod) => {
    // Todos los consumos pendientes de la cuenta se marcan como pagados. Si había abonos
    // previos, se aplican primero y solo el saldo restante entra a la caja de hoy.
    const accountIds = new Set(account.consumptions.map((ac) => ac.id));
    const toPay = consumptions.filter((c) => accountIds.has(c.id) && c.paymentStatus === 'pendiente');
    const { settled, extraPayments } = settleDailyConsumptions(account, toPay, method);
    const settledById = new Map(settled.map((c) => [c.id, c]));

    if (extraPayments.length > 0) onSavePayments([...extraPayments, ...payments]);
    onSaveConsumptions(consumptions.map((c) => settledById.get(c.id) ?? c));
  };

  // Revertir todos los consumos de la cuenta diaria a pendiente (deshacer cobro)
  const handleRevertDailyAccount = (account: DailyClientAccount) => {
    // 1. Anular los pagos/abonos de la cuenta registrados en ESTE día (los abonos de días
    //    anteriores se conservan y vuelven a descontarse del saldo)
    const accountIds = new Set(account.consumptions.map((ac) => ac.id));
    const paymentIdsToRemove = new Set(
      account.payments.filter((p) => p.date === selectedDate).map((p) => p.id)
    );
    payments.forEach((p) => {
      if (isSettlementPaymentOf(p, accountIds)) paymentIdsToRemove.add(p.id);
    });
    if (paymentIdsToRemove.size > 0) {
      onSavePayments(payments.filter((p) => !paymentIdsToRemove.has(p.id)));
    }

    // 2. Revertir consumos a pendiente
    const updatedCons = consumptions.map((c) => {
      const isFromAccount = account.consumptions.some((ac) => ac.id === c.id);
      if (isFromAccount) {
        return {
          ...c,
          paymentStatus: 'pendiente' as const,
          paymentMethod: undefined,
          paymentDate: undefined,
        };
      }
      return c;
    });
    onSaveConsumptions(updatedCons);
  };

  // =========================================================================
  // HANDLERS: REGISTRO INDIVIDUAL DE COMANDAS EN MESA
  // =========================================================================
  const handleOpenAddMesaOrder = () => {
    // Detectar números de mesa usados hoy para sugerir la siguiente correlativa
    const usedNumbers: number[] = [];
    dailyAccountsList.forEach((acc) => {
      if (acc.isMesa) {
        const match = acc.clientName.match(/mesa\s*(\d+)/i);
        if (match) {
          usedNumbers.push(parseInt(match[1], 10));
        }
      }
    });
    let nextNum = 1;
    while (usedNumbers.includes(nextNum)) {
      nextNum++;
    }

    setMesaOrderDraft({
      mesaName: `Mesa ${nextNum}`,
      menuCompletoQty: 1,
      soloSegundoQty: 0,
      selectedExtras: [],
      notes: '',
      paymentStatus: 'pendiente',
      paymentMethod: 'efectivo',
    });
    setShowAddMesaModal(true);
  };

  const handleSaveMesaOrder = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = mesaOrderDraft.mesaName.trim();
    if (!trimmedName) return;

    // Buscar o registrar automáticamente el cliente tipo 'Mesa'
    let mesaClient = clients.find(
      (c) => c.name.trim().toLowerCase() === trimmedName.toLowerCase()
    );

    let updatedClients = [...clients];
    let clientId = mesaClient?.id;

    if (!mesaClient) {
      clientId = `mesa-cli-${Date.now()}`;
      mesaClient = {
        id: clientId,
        name: trimmedName,
        piso: 'Mesa',
        accountType: 'diaria',
        active: true,
        notes: 'Comensal en Mesa Salón',
      };
      updatedClients.push(mesaClient);
      onSaveClients(updatedClients);
    }

    const menuCompletoTotal = mesaOrderDraft.menuCompletoQty * BASE_PRICES.mesa.menu_completo;
    const soloSegundoTotal = mesaOrderDraft.soloSegundoQty * BASE_PRICES.mesa.solo_segundo;

    const lunches: LunchItem[] = [];
    if (mesaOrderDraft.menuCompletoQty > 0) {
      lunches.push({
        id: `ln-mc-${Date.now()}`,
        clientType: 'mesa',
        menuType: 'menu_completo',
        segundo: 'Menú Completo',
        quantity: mesaOrderDraft.menuCompletoQty,
        unitPrice: BASE_PRICES.mesa.menu_completo,
        totalPrice: menuCompletoTotal,
      });
    }

    if (mesaOrderDraft.soloSegundoQty > 0) {
      lunches.push({
        id: `ln-ss-${Date.now()}`,
        clientType: 'mesa',
        menuType: 'solo_segundo',
        segundo: 'Solo Segundo',
        quantity: mesaOrderDraft.soloSegundoQty,
        unitPrice: BASE_PRICES.mesa.solo_segundo,
        totalPrice: soloSegundoTotal,
      });
    }

    const extrasOrderList: OrderExtraItem[] = mesaOrderDraft.selectedExtras.map((item) => ({
      id: `ex-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      extraId: item.extra.id,
      name: item.extra.name,
      description: item.extra.description,
      price: item.extra.price,
      quantity: item.quantity,
      totalPrice: item.extra.price * item.quantity,
    }));

    const extrasTotal = extrasOrderList.reduce((sum, item) => sum + item.totalPrice, 0);
    const grandTotal = menuCompletoTotal + soloSegundoTotal + extrasTotal;

    if (lunches.length === 0 && extrasOrderList.length === 0) {
      alert('Debes indicar al menos 1 menú o 1 bebida para abrir la comanda de mesa.');
      return;
    }

    const nowIso = new Date().toISOString();
    const newConsumption: ConsumptionRecord = {
      id: `cons-${Date.now()}`,
      clientId: clientId || `mesa-${Date.now()}`,
      clientName: trimmedName,
      piso: 'Mesa',
      accountType: 'diaria',
      date: selectedDate,
      dayOfWeek: getDayOfWeekName(selectedDate),
      timestamp: nowIso,
      lunches,
      extras: extrasOrderList,
      total: grandTotal,
      paymentStatus: mesaOrderDraft.paymentStatus,
      paymentMethod: mesaOrderDraft.paymentStatus === 'pagado' ? mesaOrderDraft.paymentMethod : undefined,
      paymentDate: mesaOrderDraft.paymentStatus === 'pagado' ? selectedDate : undefined,
      notes: mesaOrderDraft.notes.trim() || undefined,
    };

    onSaveConsumptions([newConsumption, ...consumptions]);
    setShowAddMesaModal(false);
  };

  // =========================================================================
  // HANDLERS: TRANSFORMAR CUENTA DIARIA A CUENTA SEMANAL (Y VICEVERSA)
  // =========================================================================
  const handleOpenTransformToWeekly = (account: DailyClientAccount) => {
    setAccountToTransform(account);
    setShowTransformModal(true);
  };

  const handleConfirmTransformToWeekly = () => {
    if (!accountToTransform) return;

    const clientNameNorm = accountToTransform.clientName.trim().toLowerCase();
    let targetClient = clients.find(
      (c) => c.id === accountToTransform.clientId || c.name.trim().toLowerCase() === clientNameNorm
    );
    let updatedClients = [...clients];
    let finalClientId = accountToTransform.clientId;

    if (targetClient) {
      updatedClients = updatedClients.map((c) =>
        c.id === targetClient!.id ? { ...c, accountType: 'semanal' as const } : c
      );
      finalClientId = targetClient.id;
    } else {
      finalClientId = accountToTransform.clientId || `cli-${Date.now()}`;
      const newCl: ClientRecord = {
        id: finalClientId,
        name: accountToTransform.clientName,
        piso: accountToTransform.piso,
        accountType: 'semanal',
        phone: accountToTransform.phone,
        notes: accountToTransform.notes,
        active: true,
      };
      updatedClients.push(newCl);
    }

    // 2. Transferir todos los pedidos consumidos de este cliente a 'semanal'
    const newPaymentsToAdd: PaymentRecord[] = [];
    const updatedConsumptions = consumptions.map((c) => {
      const isMatch =
        c.clientId === finalClientId ||
        c.clientId === accountToTransform.clientId ||
        c.clientName.trim().toLowerCase() === clientNameNorm;

      if (isMatch) {
        if (c.paymentStatus === 'pagado') {
          const hasPayment = payments.some(
            (p) =>
              (p.clientId === finalClientId || p.clientName.trim().toLowerCase() === clientNameNorm) &&
              p.date === (c.paymentDate || c.date) &&
              p.amount === c.total
          );
          if (!hasPayment) {
            newPaymentsToAdd.push({
              id: `pay-trans-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
              clientId: finalClientId,
              clientName: accountToTransform.clientName,
              piso: accountToTransform.piso,
              accountType: 'semanal',
              amount: c.total,
              method: c.paymentMethod || 'efectivo',
              date: c.paymentDate || c.date,
              dayOfWeek: c.dayOfWeek,
              notes: `Abono transferido de cuenta diaria (${c.date})`,
              timestamp: new Date().toISOString(),
            });
          }
        }
        return {
          ...c,
          clientId: finalClientId,
          accountType: 'semanal' as const,
        };
      }
      return c;
    });

    // 3. Actualizar pagos existentes a 'semanal'
    const updatedPayments = payments.map((p) => {
      const isMatch =
        p.clientId === finalClientId ||
        p.clientId === accountToTransform.clientId ||
        p.clientName.trim().toLowerCase() === clientNameNorm;
      if (isMatch) {
        return { ...p, clientId: finalClientId, accountType: 'semanal' as const };
      }
      return p;
    });

    onSaveClients(updatedClients);
    onSaveConsumptions(updatedConsumptions);
    if (newPaymentsToAdd.length > 0) {
      onSavePayments([...newPaymentsToAdd, ...updatedPayments]);
    } else {
      onSavePayments(updatedPayments);
    }

    setShowTransformModal(false);
    setAccountToTransform(null);
    setActiveTab('semanales');
  };

  const handleOpenTransformWeeklyToDaily = (client: ClientRecord) => {
    const clientNameNorm = client.name.trim().toLowerCase();
    setConfirmModal({
      isOpen: true,
      title: '¿Revertir a Cuenta Diaria?',
      message: `¿Deseas cambiar a "${client.name}" de vuelta a Cuenta Diaria?`,
      detail: 'Sus consumos, pedidos y abonos registrados volverán a gestionarse de forma diaria e individual en la pestaña de Cuentas Diarias.',
      confirmLabel: 'Sí, revertir a Diaria',
      cancelLabel: 'Cancelar',
      onConfirm: () => {
        const updatedClients = clients.map((c) =>
          c.id === client.id ? { ...c, accountType: 'diaria' as const } : c
        );
        const updatedConsumptions = consumptions.map((c) =>
          c.clientId === client.id || c.clientName.trim().toLowerCase() === clientNameNorm
            ? { ...c, accountType: 'diaria' as const }
            : c
        );
        const updatedPayments = payments.map((p) =>
          p.clientId === client.id || p.clientName.trim().toLowerCase() === clientNameNorm
            ? { ...p, accountType: 'diaria' as const }
            : p
        );
        onSaveClients(updatedClients);
        onSaveConsumptions(updatedConsumptions);
        onSavePayments(updatedPayments);
        setActiveTab('diarias');
      },
    });
  };

  // Mesa Staged Handlers (no sube a caja hasta presionar "Actualizar")
  const handleUpdateMesaDraft = (field: 'menuCompletoCount' | 'soloSegundoCount' | 'efectivoAmount' | 'yapeAmount' | 'notes', value: any) => {
    setMesaDraft((prev) => {
      const next = { ...prev, [field]: value, isDirty: true };
      const completoTotal = next.menuCompletoCount * BASE_PRICES.mesa.menu_completo;
      const segundoTotal = next.soloSegundoCount * BASE_PRICES.mesa.solo_segundo;
      const extrasTotal = next.extras.reduce((s, e) => s + e.totalPrice, 0);
      const newTotal = completoTotal + segundoTotal + extrasTotal;

      if (field === 'menuCompletoCount' || field === 'soloSegundoCount') {
        // Ajustar efectivo automáticamente si no se ha configurado Yape personalizado
        if (prev.yapeAmount === 0 || prev.efectivoAmount === (prev.menuCompletoCount * 13 + prev.soloSegundoCount * 12 + prev.extras.reduce((s, e) => s + e.totalPrice, 0))) {
          next.efectivoAmount = newTotal;
          next.yapeAmount = 0;
        }
      }
      return next;
    });
    setMesaUpdateFeedback(null);
  };

  const handleAddExtraToMesa = (extra: ExtraItem) => {
    setMesaDraft((prev) => {
      const existing = prev.extras.find((e) => e.name === extra.name);
      let newExtras: OrderExtraItem[];
      if (existing) {
        newExtras = prev.extras.map((e) =>
          e.name === extra.name
            ? { ...e, quantity: e.quantity + 1, totalPrice: (e.quantity + 1) * e.price }
            : e
        );
      } else {
        newExtras = [
          ...prev.extras,
          {
            id: `mesa-ex-${Date.now()}`,
            extraId: extra.id,
            name: extra.name,
            price: extra.price,
            quantity: 1,
            totalPrice: extra.price,
          },
        ];
      }
      const completoTotal = prev.menuCompletoCount * BASE_PRICES.mesa.menu_completo;
      const segundoTotal = prev.soloSegundoCount * BASE_PRICES.mesa.solo_segundo;
      const extrasTotal = newExtras.reduce((s, e) => s + e.totalPrice, 0);
      const newTotal = completoTotal + segundoTotal + extrasTotal;

      return {
        ...prev,
        extras: newExtras,
        efectivoAmount: prev.yapeAmount === 0 ? newTotal : prev.efectivoAmount,
        isDirty: true,
      };
    });
  };

  const handleRemoveExtraFromMesa = (index: number) => {
    setMesaDraft((prev) => {
      const newExtras = prev.extras.filter((_, idx) => idx !== index);
      const completoTotal = prev.menuCompletoCount * BASE_PRICES.mesa.menu_completo;
      const segundoTotal = prev.soloSegundoCount * BASE_PRICES.mesa.solo_segundo;
      const extrasTotal = newExtras.reduce((s, e) => s + e.totalPrice, 0);
      const newTotal = completoTotal + segundoTotal + extrasTotal;

      return {
        ...prev,
        extras: newExtras,
        efectivoAmount: prev.yapeAmount === 0 ? newTotal : Math.min(prev.efectivoAmount, newTotal),
        isDirty: true,
      };
    });
  };

  // Botón ACTUALIZAR Mesa: Confirma los datos y los sube a lo cobrado en el precio del día
  const handleCommitMesaUpdate = () => {
    const completoTotal = mesaDraft.menuCompletoCount * BASE_PRICES.mesa.menu_completo;
    const segundoTotal = mesaDraft.soloSegundoCount * BASE_PRICES.mesa.solo_segundo;
    const extrasTotal = mesaDraft.extras.reduce((s, e) => s + e.totalPrice, 0);
    const calculatedTotal = completoTotal + segundoTotal + extrasTotal;

    let finalEfectivo = mesaDraft.efectivoAmount;
    let finalYape = mesaDraft.yapeAmount;

    // Si los montos de efectivo + yape no coinciden con el total calculado
    if (finalEfectivo + finalYape !== calculatedTotal) {
      if (finalYape > 0 && finalYape <= calculatedTotal) {
        finalEfectivo = calculatedTotal - finalYape;
      } else {
        finalEfectivo = calculatedTotal;
        finalYape = 0;
      }
    }

    const updatedRecord: MesaCounterRecord = {
      id: currentMesaRecord.id || `mesa-${selectedDate}`,
      date: selectedDate,
      dayOfWeek: getDayOfWeekName(selectedDate),
      menuCompletoCount: mesaDraft.menuCompletoCount,
      soloSegundoCount: mesaDraft.soloSegundoCount,
      extras: mesaDraft.extras,
      efectivoAmount: finalEfectivo,
      yapeAmount: finalYape,
      totalAmount: calculatedTotal,
      timestamp: new Date().toISOString(),
      notes: mesaDraft.notes,
    };

    const exists = mesaRecords.some((r) => r.date === selectedDate);
    let newRecords: MesaCounterRecord[];
    if (exists) {
      newRecords = mesaRecords.map((r) => (r.date === selectedDate ? updatedRecord : r));
    } else {
      newRecords = [...mesaRecords, updatedRecord];
    }

    onSaveMesaRecords(newRecords);
    setMesaDraft((prev) => ({
      ...prev,
      efectivoAmount: finalEfectivo,
      yapeAmount: finalYape,
      isDirty: false,
    }));
    setMesaUpdateFeedback('Cobro de mesa actualizado con éxito en caja del día');
    setTimeout(() => setMesaUpdateFeedback(null), 3000);
  };

  const handleResetMesaDraft = () => {
    setMesaDraft({
      date: selectedDate,
      menuCompletoCount: currentMesaRecord.menuCompletoCount,
      soloSegundoCount: currentMesaRecord.soloSegundoCount,
      extras: currentMesaRecord.extras || [],
      efectivoAmount: currentMesaRecord.efectivoAmount,
      yapeAmount: currentMesaRecord.yapeAmount,
      notes: currentMesaRecord.notes || '',
      isDirty: false,
    });
    setMesaUpdateFeedback(null);
  };

  // Eliminar o anular el cobro de mesa del día (por si hubo un error al subirlo o actualizarlo)
  const handleClearMesaRecord = () => {
    setConfirmModal({
      isOpen: true,
      title: '¿Anular cobro de mesa de este día?',
      message: `¿Estás seguro de quitar el registro de cobro de mesa para el ${getDayOfWeekName(selectedDate)} ${selectedDate}?`,
      detail: `Se eliminará el registro de mesa (${formatCurrency(currentMesaRecord.totalAmount)}) y se descontará inmediatamente de la caja del día.`,
      confirmLabel: 'Sí, anular cobro de mesa',
      cancelLabel: 'Cancelar',
      isDestructive: true,
      onConfirm: () => {
        const filtered = mesaRecords.filter((r) => r.date !== selectedDate);
        onSaveMesaRecords(filtered);
        setMesaDraft({
          date: selectedDate,
          menuCompletoCount: 0,
          soloSegundoCount: 0,
          extras: [],
          efectivoAmount: 0,
          yapeAmount: 0,
          notes: '',
          isDirty: false,
        });
        setMesaUpdateFeedback('Cobro de mesa eliminado de la caja del día.');
        setTimeout(() => setMesaUpdateFeedback(null), 3000);
      },
    });
  };

  // Gestión de Catálogo de Adicionales (Agregar y Quitar)
  const handleAddNewExtra = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newExtraName.trim() || !newExtraPrice) return;
    const priceNum = parseFloat(newExtraPrice);
    if (isNaN(priceNum) || priceNum < 0) return;

    const newItem: ExtraItem = {
      id: `ex-${Date.now()}`,
      name: newExtraName.trim(),
      price: priceNum,
      category: newExtraCategory,
    };

    const updated = [...extrasCatalog, newItem];
    if (onSaveExtras) {
      onSaveExtras(updated);
    }
    setNewExtraName('');
    setNewExtraPrice('');
  };

  const handleDeleteExtra = (extraId: string) => {
    const updated = extrasCatalog.filter((ex) => ex.id !== extraId);
    if (onSaveExtras) {
      onSaveExtras(updated);
    }
  };

  // Client Management Handlers
  const handleSaveNewClient = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newClientName.trim();
    if (!cleanName) {
      alert('⚠️ Ingresa el nombre del cliente o tienda.');
      return;
    }

    const finalPiso = isCustomPiso
      ? customPisoText.trim()
      : newClientPiso.trim();

    if (!finalPiso) {
      alert('⚠️ Es obligatorio seleccionar o especificar el piso / ubicación del cliente.');
      return;
    }

    // Check if client name already exists (case and accent insensitive)
    const existingClient = findClientByName(clients, cleanName);
    if (existingClient) {
      alert(`⚠️ Ya existe un cliente registrado como "${existingClient.name}" en el piso "${existingClient.piso}". Si deseas cambiar sus datos, puedes editarlo desde el Directorio de Clientes.`);
      return;
    }

    // Ensure phone has +51 format
    let cleanPhone = newClientPhone.trim();
    if (cleanPhone) {
      cleanPhone = formatPhoneForWhatsApp(cleanPhone);
    }

    const newClient: ClientRecord = {
      id: `cli-${Date.now()}`,
      name: cleanName,
      piso: normalizePiso(finalPiso),
      accountType: newClientType,
      phone: cleanPhone || undefined,
      notes: newClientNotes.trim() || undefined,
      active: true,
    };

    onSaveClients([...clients, newClient]);
    setShowNewClientModal(false);
    setNewClientName('');
    setNewClientPhone('');
    setNewClientNotes('');
    setIsCustomPiso(false);
    setCustomPisoText('');
    setNewClientPiso('');
    if (newClientType === 'diaria') {
      setActiveTab('diarias');
    } else {
      setActiveTab('semanales');
    }
  };

  // Open Edit Client Modal (Name, Piso/Calle, Phone, Notes)
  const handleOpenEditClient = (client: ClientRecord) => {
    setEditingClient(client);
    setEditClientName(client.name);
    const norm = normalizePiso(client.piso);
    const isStandard = ['Calle', '1ro', '2do', '3ro', '4to'].includes(norm);
    if (isStandard) {
      setEditClientPiso(norm);
      setEditIsCustomPiso(false);
      setEditCustomPisoText('');
    } else {
      setEditClientPiso('__custom__');
      setEditIsCustomPiso(true);
      setEditCustomPisoText(norm);
    }
    setEditClientType(client.accountType);
    setEditClientPhone(client.phone ? client.phone.replace(/\D/g, '') : '');
    setEditClientNotes(client.notes || '');
  };

  // Save Edit Client Modal
  const handleSaveEditClient = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClient) return;

    const cleanName = editClientName.trim();
    if (!cleanName) {
      alert('El nombre del cliente no puede estar vacío');
      return;
    }

    // Check duplicate name (case and accent insensitive)
    const duplicate = clients.find(
      (c) => c.id !== editingClient.id && normalizeClientName(c.name) === normalizeClientName(cleanName)
    );
    if (duplicate) {
      alert(`Ya existe otro cliente registrado con el nombre "${duplicate.name}" en el piso/ubicación "${duplicate.piso}".`);
      return;
    }

    const finalPiso = editIsCustomPiso
      ? (editCustomPisoText.trim() || 'Calle')
      : normalizePiso(editClientPiso);
    const cleanPhone = formatPhoneForWhatsApp(editClientPhone);

    const updatedClients = clients.map((c) =>
      c.id === editingClient.id
        ? {
            ...c,
            name: cleanName,
            piso: finalPiso,
            accountType: editClientType,
            phone: cleanPhone || undefined,
            notes: editClientNotes.trim() || undefined,
          }
        : c
    );
    onSaveClients(updatedClients);

    // Sync client name and floor in existing consumptions
    const updatedConsumptions = consumptions.map((cons) =>
      cons.clientId === editingClient.id
        ? {
            ...cons,
            clientName: editClientName.trim() || cons.clientName,
            piso: finalPiso,
            accountType: editClientType,
          }
        : cons
    );
    onSaveConsumptions(updatedConsumptions);

    // Sync client name and floor in existing payments
    const updatedPayments = payments.map((p) =>
      p.clientId === editingClient.id
        ? {
            ...p,
            clientName: editClientName.trim() || p.clientName,
            piso: finalPiso,
            accountType: editClientType,
          }
        : p
    );
    onSavePayments(updatedPayments);

    setEditingClient(null);
  };

  // Quick edit client phone (opens full client editor)
  const handleEditPhone = (client: ClientRecord) => {
    handleOpenEditClient(client);
  };

  // Send WhatsApp Statement
  const generateClientWhatsAppStatement = (client: ClientRecord, monthOrWeekStr?: string) => {
    const clientConsumptions = consumptions
      .filter((c) => c.clientId === client.id)
      .filter((c) => (monthOrWeekStr ? c.date.startsWith(monthOrWeekStr) : true))
      .sort((a, b) => a.date.localeCompare(b.date));

    const clientPayments = payments
      .filter((p) => p.clientId === client.id)
      .filter((p) => (monthOrWeekStr ? p.date.startsWith(monthOrWeekStr) : true))
      .sort((a, b) => a.date.localeCompare(b.date));

    const totalConsumo = clientConsumptions.reduce((s, c) => s + c.total, 0);
    const totalAbonado = clientPayments.reduce((s, p) => s + p.amount, 0);
    const saldoPendiente = Math.max(0, totalConsumo - totalAbonado);

    let msg = `*FUENTE DE SODA CRISS* 🍽️\n`;
    msg += `*ESTADO DE CUENTA - ${client.name.toUpperCase()}*\n`;
    msg += `📍 *Ubicación:* ${client.piso} (${client.accountType === 'semanal' ? 'Cuenta Semanal' : 'Cuenta Diaria'})\n`;
    msg += `📅 *Fecha:* ${new Date().toLocaleDateString('es-PE')}\n`;
    msg += `--------------------------------\n`;
    msg += `*DETALLE DE CONSUMOS:*\n`;

    if (clientConsumptions.length === 0) {
      msg += `No registra consumos en este período.\n`;
    } else {
      clientConsumptions.forEach((c) => {
        const d = c.date.split('-').slice(1).reverse().join('/');
        const lunchSummary = c.lunches.map((l) => {
          const name = l.menuType === 'menu_completo' ? 'Menú Completo' : 'Segundo Solo';
          const loc = l.clientType === 'mesa' ? ' (Mesa)' : '';
          return `${l.quantity}x ${name}${loc}`;
        }).join(', ');
        const extrasSummary = c.extras.length > 0 ? ` + ${c.extras.map((e) => `${e.quantity}x ${e.name}`).join(', ')}` : '';
        msg += `• ${c.dayOfWeek} ${d}: ${lunchSummary}${extrasSummary} -> *${formatCurrency(c.total)}*\n`;
      });
    }

    msg += `--------------------------------\n`;
    msg += `*HISTORIAL DE ABONOS:*\n`;
    if (clientPayments.length === 0) {
      msg += `Sin abonos registrados aún.\n`;
    } else {
      clientPayments.forEach((p) => {
        const d = p.date.split('-').slice(1).reverse().join('/');
        msg += `✅ ${p.dayOfWeek} ${d}: Abono de *${formatCurrency(p.amount)}* (${p.method.toUpperCase()})\n`;
      });
    }

    msg += `--------------------------------\n`;
    msg += `🍽️ *TOTAL CONSUMIDO:* ${formatCurrency(totalConsumo)}\n`;
    msg += `💵 *TOTAL ABONADO:* ${formatCurrency(totalAbonado)}\n`;
    msg += `⚠️ *SALDO PENDIENTE: ${formatCurrency(saldoPendiente)}*\n\n`;
    msg += `_¡Muchas gracias por su preferencia! Fuente de Soda Criss._`;

    return encodeURIComponent(msg);
  };

  const handleSendWhatsApp = (client: ClientRecord, monthOrWeekStr?: string) => {
    let rawPhone = client.phone ? client.phone.trim() : '';
    if (!rawPhone) {
      const userEntered = window.prompt(
        `Ingresa el número de celular / WhatsApp para ${client.name} (ej. 987654321):`
      );
      if (!userEntered || !userEntered.trim()) return;
      rawPhone = formatPhoneForWhatsApp(userEntered.trim());
      const updated = clients.map((c) =>
        c.id === client.id ? { ...c, phone: rawPhone } : c
      );
      onSaveClients(updated);
    }

    const waPhone = formatPhoneForWhatsApp(rawPhone);
    const msg = generateClientWhatsAppStatement({ ...client, phone: rawPhone }, monthOrWeekStr);
    const url = `https://wa.me/${waPhone}?text=${msg}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="max-w-7xl mx-auto px-2 sm:px-4 py-4 space-y-5">
      {/* Top Banner: Registro de Ventas Title */}
      <div className="bg-gradient-to-r from-amber-900 via-amber-800 to-amber-950 text-white rounded-2xl p-4 sm:p-5 shadow-md border border-amber-700/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-amber-500/20 border border-amber-400/30 text-amber-200">
            <BookOpen className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                Registro de Ventas
              </h2>
              <span className="text-xs bg-amber-500/30 text-amber-200 border border-amber-400/30 font-semibold px-2 py-0.5 rounded-full">
                Lunes a Sábado
              </span>
            </div>
          </div>
        </div>

        {/* 4 Metric Cards: Falta Cobrar, Cobrado Hoy, Cobrado en la Semana, Cobrado en el Mes */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-2.5 w-full md:w-auto">
          {/* 0. Falta Cobrar (Deuda Total Pendiente) */}
          <div className="bg-rose-950/80 border border-rose-500/60 rounded-xl px-3 py-2 shadow-xs min-w-[130px]">
            <span className="text-[10px] font-black uppercase tracking-wider text-rose-300 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 text-rose-400 shrink-0" />
              <span>Falta Cobrar</span>
            </span>
            <div className="text-base sm:text-lg font-black text-rose-100">
              {formatCurrency(globalDebtStats.totalDebt)}
            </div>
            <div className="text-[10px] text-rose-300/90 flex items-center gap-1.5 mt-0.5">
              <span>Diario: {formatCurrency(globalDebtStats.dailyDebt)}</span>
              <span>•</span>
              <span>Sem: {formatCurrency(globalDebtStats.weeklyDebt)}</span>
            </div>
          </div>

          {/* 1. Cobrado Hoy (Diario) */}
          <div className="bg-amber-950/70 border border-amber-500/40 rounded-xl px-3 py-2 shadow-xs min-w-[130px]">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300 block">
              Cobrado Hoy (Diario)
            </span>
            <div className="text-base sm:text-lg font-black text-white">
              {formatCurrency(metricsBanner.hoyTotal)}
            </div>
            <div className="text-[10px] text-amber-200/90 flex items-center gap-1.5 mt-0.5">
              <span>Ef: {formatCurrency(metricsBanner.hoyEfectivo)}</span>
              <span>•</span>
              <span>Yp: {formatCurrency(metricsBanner.hoyYape)}</span>
            </div>
          </div>

          {/* 2. Cobrado en la Semana */}
          <div className="bg-amber-950/70 border border-amber-500/40 rounded-xl px-3 py-2 shadow-xs min-w-[130px]">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300 block">
              Cobrado en la Semana
            </span>
            <div className="text-base sm:text-lg font-black text-white">
              {formatCurrency(metricsBanner.semTotal)}
            </div>
            <div className="text-[10px] text-amber-200/90 flex items-center gap-1.5 mt-0.5">
              <span>Ef: {formatCurrency(metricsBanner.semEfectivo)}</span>
              <span>•</span>
              <span>Yp: {formatCurrency(metricsBanner.semYape)}</span>
            </div>
          </div>

          {/* 3. Cobrado en el Mes */}
          <div className="bg-amber-950/70 border border-amber-500/40 rounded-xl px-3 py-2 shadow-xs min-w-[130px]">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300 block">
              Cobrado en el Mes
            </span>
            <div className="text-base sm:text-lg font-black text-white">
              {formatCurrency(metricsBanner.mesTotal)}
            </div>
            <div className="text-[10px] text-amber-200/90 flex items-center gap-1.5 mt-0.5">
              <span>Ef: {formatCurrency(metricsBanner.mesEfectivo)}</span>
              <span>•</span>
              <span>Yp: {formatCurrency(metricsBanner.mesYape)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Sub-tab Navigation (Cuentas Semanales, Cuentas Diarias con Mesa, Caja Día y Semana, Cobro a Fin de Mes) */}
      <div className="bg-white rounded-2xl p-1.5 border border-stone-200 shadow-xs">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
          <button
            type="button"
            onClick={() => setActiveTab('semanales')}
            className={`py-3 px-3 rounded-xl font-bold text-xs sm:text-sm flex flex-col sm:flex-row items-center justify-center gap-1.5 sm:gap-2 transition-all ${
              activeTab === 'semanales'
                ? 'bg-amber-700 text-white shadow-sm ring-2 ring-amber-600/30'
                : 'text-stone-700 hover:bg-stone-100'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>Cuentas Semanales</span>
            <span className="text-[10px] sm:text-xs opacity-80 font-normal">
              ({weeklyClients.length})
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('diarias')}
            className={`py-3 px-3 rounded-xl font-bold text-xs sm:text-sm flex flex-col sm:flex-row items-center justify-center gap-1.5 sm:gap-2 transition-all ${
              activeTab === 'diarias'
                ? 'bg-amber-700 text-white shadow-sm ring-2 ring-amber-600/30'
                : 'text-stone-700 hover:bg-stone-100'
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>Cuentas Diarias</span>
            <span className="text-[10px] sm:text-xs opacity-80 font-normal">
              • Con Mesa
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('caja')}
            className={`py-3 px-3 rounded-xl font-bold text-xs sm:text-sm flex flex-col sm:flex-row items-center justify-center gap-1.5 sm:gap-2 transition-all ${
              activeTab === 'caja'
                ? 'bg-emerald-800 text-white shadow-sm ring-2 ring-emerald-600/30'
                : 'text-stone-700 hover:bg-stone-100'
            }`}
          >
            <DollarSign className="w-4 h-4" />
            <span>Caja Día y Semana</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('cobro_mensual')}
            className={`py-3 px-3 rounded-xl font-bold text-xs sm:text-sm flex flex-col sm:flex-row items-center justify-center gap-1.5 sm:gap-2 transition-all ${
              activeTab === 'cobro_mensual'
                ? 'bg-stone-900 text-white shadow-sm'
                : 'text-stone-700 hover:bg-stone-100'
            }`}
          >
            <Receipt className="w-4 h-4 text-amber-400" />
            <span>Cobro a Fin de Mes</span>
          </button>
        </div>
      </div>

      {/* Global Filter Toolbar for Piso and Search */}
      {(activeTab === 'semanales' || activeTab === 'diarias' || activeTab === 'cobro_mensual') && (
        <div className="bg-white rounded-2xl p-3.5 border border-stone-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
          {/* Piso / Calle Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 max-w-full">
            <span className="text-xs font-bold text-stone-500 uppercase tracking-wider flex items-center gap-1 mr-1 shrink-0">
              <MapPin className="w-3.5 h-3.5 text-amber-800" />
              Pisos / Calle:
            </span>
            <button
              type="button"
              onClick={() => setSelectedPiso('todos')}
              className={`text-xs px-3 py-1.5 rounded-lg font-bold transition-all whitespace-nowrap ${
                selectedPiso === 'todos'
                  ? 'bg-amber-800 text-white shadow-xs'
                  : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
              }`}
            >
              Todos
            </button>
            {pisosList.map((piso) => {
              const isSelected = selectedPiso === piso;
              const isCalle = piso === 'Calle';
              return (
                <button
                  key={piso}
                  type="button"
                  onClick={() => setSelectedPiso(piso)}
                  className={`text-xs px-3 py-1.5 rounded-lg font-bold transition-all whitespace-nowrap flex items-center gap-1 ${
                    isSelected
                      ? isCalle
                        ? 'bg-blue-700 text-white shadow-xs ring-2 ring-blue-300'
                        : 'bg-amber-800 text-white shadow-xs ring-2 ring-amber-300'
                      : isCalle
                        ? 'bg-blue-50 text-blue-800 hover:bg-blue-100 border border-blue-200'
                        : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                  }`}
                >
                  {isCalle && <span>🚶</span>}
                  <span>{piso}</span>
                </button>
              );
            })}
          </div>

          {/* Actions: Search, Extras Catalog and New Client */}
          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">
            <div className="relative flex-1 sm:w-56">
              <Search className="w-4 h-4 text-stone-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar cliente..."
                className="w-full text-xs font-medium pl-9 pr-3 py-2 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-600 focus:bg-white"
              />
            </div>

            <button
              type="button"
              onClick={() => handleOpenMergeConsModal()}
              className="px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 rounded-xl text-xs font-bold border border-indigo-200 flex items-center gap-1.5 transition-colors whitespace-nowrap shadow-xs"
              title="Combinar pedidos y adicionales: fusionar extras (ej. palta) dentro de un pedido principal (Main)"
            >
              <GitMerge className="w-3.5 h-3.5 text-indigo-700" />
              <span>Combinar</span>
            </button>

            <button
              type="button"
              onClick={() => setShowManageExtrasModal(true)}
              className="px-3 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-bold border border-stone-300 flex items-center gap-1.5 transition-colors whitespace-nowrap shadow-xs"
              title="Administrar catálogo de bebidas, gaseosas y adicionales"
            >
              <Settings className="w-3.5 h-3.5 text-stone-500" />
              <span>Adicionales ({extrasCatalog.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setShowClientsDirectoryModal(true)}
              className="px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 rounded-xl text-xs font-bold border border-amber-300 flex items-center gap-1.5 transition-colors whitespace-nowrap shadow-xs"
              title="Directorio de clientes: buscar, editar y eliminar clientes registrados"
            >
              <Users className="w-3.5 h-3.5 text-amber-700" />
              <span>Clientes ({clients.length})</span>
            </button>

            <button
              type="button"
              onClick={() => handleOpenNewClientModal()}
              className="px-3.5 py-2 bg-amber-800 hover:bg-amber-900 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap shadow-xs"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>+ Cliente</span>
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. TAB: CUENTAS SEMANALES (Separadas por días de la semana: Lunes a Sábado) */}
      {/* ========================================================================= */}
      {activeTab === 'semanales' && (
        <div className="space-y-4">
          {/* Week Selector Bar */}
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5 flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setWeekOffset((prev) => prev - 1)}
                className="p-1.5 bg-white border border-amber-200 rounded-lg hover:bg-amber-100 text-amber-900 shadow-xs"
                title="Semana anterior"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs sm:text-sm font-extrabold text-amber-950">
                Semana del {currentWeekDays[0].display} al {currentWeekDays[5].display}
              </span>
              <button
                type="button"
                onClick={() => setWeekOffset((prev) => prev + 1)}
                className="p-1.5 bg-white border border-amber-200 rounded-lg hover:bg-amber-100 text-amber-900 shadow-xs"
                title="Semana siguiente"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {weekOffset !== 0 && (
              <button
                type="button"
                onClick={() => setWeekOffset(0)}
                className="text-xs font-bold text-amber-800 bg-amber-200/60 hover:bg-amber-200 px-3 py-1 rounded-lg transition-colors"
              >
                Volver a esta semana
              </button>
            )}
          </div>

          {/* Toolbar and List of Weekly Clients */}
          <div className="space-y-4">
            {weeklyClients.length > 0 && (
              <div className="bg-stone-100/80 border border-stone-200 rounded-xl px-4 py-2.5 flex items-center justify-between gap-2 flex-wrap">
                <div className="text-xs text-stone-700 font-bold">
                  <span>Cuentas Semanales ({weeklyClients.length}):</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={expandAllWeekly}
                    className="px-2.5 py-1 bg-white hover:bg-stone-200 text-stone-700 rounded-lg text-xs font-bold border border-stone-300 shadow-2xs transition-colors flex items-center gap-1"
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                    <span>Expandir Todos</span>
                  </button>
                  <button
                    type="button"
                    onClick={collapseAllWeekly}
                    className="px-2.5 py-1 bg-white hover:bg-stone-200 text-stone-700 rounded-lg text-xs font-bold border border-stone-300 shadow-2xs transition-colors flex items-center gap-1"
                  >
                    <ChevronUp className="w-3.5 h-3.5" />
                    <span>Contraer Todos</span>
                  </button>
                </div>
              </div>
            )}

            {weeklyClients.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 text-center border border-stone-200 text-stone-500">
                No hay clientes con cuenta semanal en este filtro. Presiona "+ Cliente" en la barra superior para registrar uno.
              </div>
            ) : (() => {
              const pendingWeeklyClients = weeklyClients.filter((client) => {
                const totalPaid = payments.filter((p) => p.clientId === client.id).reduce((s, p) => s + p.amount, 0);
                const totalCons = consumptions.filter((c) => c.clientId === client.id).reduce((s, c) => s + c.total, 0);
                return (totalCons - totalPaid) > 0.01;
              });

              const cancelledWeeklyClients = weeklyClients.filter((client) => {
                const totalPaid = payments.filter((p) => p.clientId === client.id).reduce((s, p) => s + p.amount, 0);
                const totalCons = consumptions.filter((c) => c.clientId === client.id).reduce((s, c) => s + c.total, 0);
                return (totalCons - totalPaid) <= 0.01;
              });

              const totalPendingWeeklyDebt = pendingWeeklyClients.reduce((sum, client) => {
                const totalPaid = payments.filter((p) => p.clientId === client.id).reduce((s, p) => s + p.amount, 0);
                const totalCons = consumptions.filter((c) => c.clientId === client.id).reduce((s, c) => s + c.total, 0);
                return sum + Math.max(0, totalCons - totalPaid);
              }, 0);

              const renderWeeklyCard = (client: ClientRecord) => {
                const isWeeklyCollapsed = !!collapsedWeeklyAccounts[client.id];
                // Calculate consumptions and payments for this client
                const clientWeekConsumptions = currentWeekDays.map((day) => {
                  const dayConsumptions = consumptions.filter(
                    (c) => c.clientId === client.id && c.date === day.dateStr
                  );
                  const dayTotal = dayConsumptions.reduce((s, c) => s + c.total, 0);
                  return {
                    ...day,
                    consumptions: dayConsumptions,
                    total: dayTotal,
                  };
                });

                const mondayDateStr = currentWeekDays[0].dateStr;
                const weekDatesSet = new Set(currentWeekDays.map((d) => d.dateStr));
                const clientPayments = payments.filter((p) => p.clientId === client.id);

                // Consumos de esta semana pendientes de pago
                const clientWeekPendingCons = clientWeekConsumptions
                  .flatMap((d) => d.consumptions)
                  .filter((c) => c.paymentStatus !== 'pagado');
                const baseDeudaActual = clientWeekPendingCons.reduce((s, c) => s + c.total, 0);

                // Consumos y pagos antes del lunes de esta semana (DP base)
                const consumptionsBeforeWeek = consumptions.filter(
                  (c) => c.clientId === client.id && c.date < mondayDateStr
                );
                const consumptionsBeforeWeekPending = consumptionsBeforeWeek.filter(
                  (c) => c.paymentStatus !== 'pagado'
                );
                const paymentsBeforeWeek = payments.filter(
                  (p) => p.clientId === client.id && p.date < mondayDateStr
                );

                const consumptionsBeforeWeekTotal = consumptionsBeforeWeek.reduce((s, c) => s + c.total, 0);
                const paymentsBeforeWeekTotal = paymentsBeforeWeek.reduce((s, p) => s + p.amount, 0);

                const baseDeudaPasada = Math.max(
                  0,
                  consumptionsBeforeWeekPending.length > 0 && consumptionsBeforeWeek.some((c) => c.paymentStatus === 'pagado')
                    ? consumptionsBeforeWeekPending.reduce((s, c) => s + c.total, 0) - paymentsBeforeWeekTotal
                    : consumptionsBeforeWeekTotal - paymentsBeforeWeekTotal
                );

                // Pagos y abonos registrados para esta semana
                const clientWeekPayments = clientPayments.filter(
                  (p) => weekDatesSet.has(p.date) || p.date >= mondayDateStr
                );
                const clientOtherPayments = clientPayments.filter(
                  (p) => !weekDatesSet.has(p.date) && p.date < mondayDateStr
                );

                // 1. Pagos directos de DP (Cancelo DP)
                const clientWeekDpPayments = clientWeekPayments.filter((p) => isPaymentDp(p));
                const dpPaidThisWeek = clientWeekDpPayments.reduce((s, p) => s + p.amount, 0);

                // 2. Pagos directos de DA (Cancelo DA)
                const clientWeekDaPayments = clientWeekPayments.filter((p) => isPaymentDa(p));
                const daPaidThisWeek = clientWeekDaPayments.reduce((s, p) => s + p.amount, 0);

                // 3. Abonos generales de esta semana (no son DP ni DA directos)
                const clientWeekRegularPayments = clientWeekPayments.filter(
                  (p) => !isPaymentDp(p) && !isPaymentDa(p)
                );

                // Reducción inicial por pagos directos de DP y DA
                let currentDP = Math.max(0, baseDeudaPasada - dpPaidThisWeek);
                let currentDA = Math.max(0, baseDeudaActual - daPaidThisWeek);

                // Cascada de Abonos solicitada:
                // El abono primero resta a DP. Si el abono supera la DP, liquida la DP a 0 y el saldo restante resta a DA.
                let totalAbonoAppliedToDp = 0;
                let totalAbonoAppliedToDa = 0;
                const abonosWithBreakdown = clientWeekRegularPayments.map((p) => {
                  const toDp = Math.min(currentDP, p.amount);
                  currentDP = Math.max(0, currentDP - toDp);
                  const leftover = p.amount - toDp;
                  const toDa = Math.min(currentDA, leftover);
                  currentDA = Math.max(0, currentDA - toDa);
                  totalAbonoAppliedToDp += toDp;
                  totalAbonoAppliedToDa += toDa;
                  return {
                    payment: p,
                    appliedToDp: toDp,
                    appliedToDa: toDa,
                  };
                });

                const deudaPasada = Math.max(0, currentDP);
                const deudaActual = Math.max(0, currentDA);
                const deudaTotal = deudaPasada + deudaActual;

                return (
                  <div
                    key={client.id}
                    className="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden transition-shadow hover:shadow-md"
                  >
                    {/* Header Card: Client Info & Balances */}
                    <div className="bg-stone-50/80 px-4 py-3.5 border-b border-stone-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span
                          className={`px-2.5 py-1 rounded-lg text-xs font-black border flex items-center gap-1 select-none ${
                            client.piso === 'Calle'
                              ? 'bg-blue-100 text-blue-950 border-blue-300'
                              : 'bg-amber-100 text-amber-900 border-amber-300'
                          }`}
                        >
                          {client.piso === 'Calle' ? '🚶 Calle' : `📍 ${client.piso}`}
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-extrabold text-base text-stone-900">
                              {client.name}
                            </h3>
                            {client.phone ? (
                              <button
                                type="button"
                                onClick={() => handleEditPhone(client)}
                                className="text-xs text-stone-600 font-medium hover:text-amber-800 flex items-center gap-1 group"
                                title="Editar WhatsApp"
                              >
                                <span>📞 {formatPhoneDisplay(client.phone)}</span>
                                <Edit3 className="w-3 h-3 text-stone-400 group-hover:text-amber-700 opacity-0 group-hover:opacity-100" />
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleEditPhone(client)}
                                className="text-[11px] text-amber-700 hover:text-amber-800 font-semibold underline"
                              >
                                + Agregar celular (+51)
                              </button>
                            )}
                          </div>
                          {client.notes && (
                            <p className="text-xs text-stone-500 italic mt-0.5">
                              {client.notes}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Acrónimos DP, DA, DT & Fast Actions */}
                      <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap sm:flex-nowrap">
                        {/* 3 Acrónimos: DP (Deuda Pasada), DA (Deuda Actual), DT (Deuda Total) */}
                        <div className="flex items-center gap-1 sm:gap-1.5 bg-stone-100/90 border border-stone-200 px-2.5 py-1 rounded-xl shrink-0">
                          {/* DP: Deuda Pasada */}
                          <button
                            type="button"
                            onClick={() => deudaPasada > 0 && handleOpenCancelDpModal(client, deudaPasada)}
                            disabled={deudaPasada <= 0}
                            className={`px-1.5 py-0.5 rounded text-center transition-colors ${
                              deudaPasada > 0
                                ? 'hover:bg-rose-100/80 cursor-pointer active:scale-95'
                                : 'cursor-default'
                            }`}
                            title={
                              deudaPasada > 0
                                ? `DP (Deuda Pasada): Saldo pendiente de ${formatCurrency(deudaPasada)}. Clic o usa "Cancelo DP" para liquidar.`
                                : 'DP (Deuda Pasada): Sin saldo pendiente arrastrado'
                            }
                          >
                            <span className="text-[10px] font-black text-stone-500 block leading-none">DP</span>
                            <span className={`text-xs font-black leading-tight ${deudaPasada > 0 ? 'text-rose-700 font-extrabold' : 'text-stone-600'}`}>
                              {formatCurrency(deudaPasada)}
                            </span>
                          </button>

                          <span className="text-stone-300 font-light select-none">|</span>

                          {/* DA: Deuda Actual (Clic para cancelar DA directamente) */}
                          <button
                            type="button"
                            onClick={() => deudaActual > 0 && handleOpenCancelDaModal(client, deudaActual)}
                            disabled={deudaActual <= 0}
                            className={`px-1.5 py-0.5 rounded text-center transition-colors ${
                              deudaActual > 0
                                ? 'hover:bg-amber-200/80 cursor-pointer active:scale-95'
                                : 'cursor-default'
                            }`}
                            title={
                              deudaActual > 0
                                ? `DA (Deuda Actual): Consumos pendientes de esta semana (${formatCurrency(deudaActual)}). Clic o usa "Cancelo DA" para liquidar directamente.`
                                : 'DA (Deuda Actual): Sin consumos pendientes esta semana'
                            }
                          >
                            <span className="text-[10px] font-black text-amber-800 block leading-none">DA</span>
                            <span className={`text-xs font-black leading-tight ${deudaActual > 0 ? 'text-amber-950 font-extrabold' : 'text-stone-600'}`}>
                              {formatCurrency(deudaActual)}
                            </span>
                          </button>

                          <span className="text-stone-300 font-light select-none">|</span>

                          {/* DT: Deuda Total */}
                          <div
                            className={`px-2 py-0.5 rounded-lg text-center cursor-help border ${
                              deudaTotal > 0
                                ? 'bg-rose-100/80 text-rose-900 border-rose-300 shadow-2xs'
                                : 'bg-emerald-100/80 text-emerald-900 border-emerald-300'
                            }`}
                            title="DT (Deuda Total): Saldo neto total pendiente por cobrar (DP + DA)"
                          >
                            <span className="text-[10px] font-black block leading-none">DT</span>
                            <span className="text-xs sm:text-sm font-black leading-tight">
                              {formatCurrency(deudaTotal)}
                            </span>
                          </div>
                        </div>

                        {/* Button: Add Payment (Abono) */}
                        <button
                          type="button"
                          onClick={() => handleOpenPaymentModal(client)}
                          className="px-2.5 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-800 font-bold rounded-xl flex items-center gap-1 shadow-2xs transition-colors text-xs border border-stone-300"
                          title="Registrar abono a cuenta"
                        >
                          <DollarSign className="w-3.5 h-3.5 text-stone-600" />
                          <span>+ Abono</span>
                        </button>

                        {/* Button: Cancelo DA (Liquidación Directa de Deuda Actual de la Semana) */}
                        <button
                          type="button"
                          onClick={() => handleOpenCancelDaModal(client, deudaActual)}
                          disabled={deudaActual <= 0}
                          className={`px-2.5 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1 text-xs shadow-xs border ${
                            deudaActual > 0
                              ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700 shadow-emerald-200/50 cursor-pointer active:scale-95'
                              : 'bg-stone-100 text-stone-400 border-stone-200 cursor-not-allowed opacity-60'
                          }`}
                          title={
                            deudaActual > 0
                              ? `Registrar que ${client.name} canceló directamente su Deuda Actual (DA) de ${formatCurrency(deudaActual)}`
                              : 'No tiene Deuda Actual pendiente en esta semana (DA S/ 0.00)'
                          }
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Cancelo DA</span>
                        </button>

                        {/* Button: Cancelo DP (Liquidación de Deuda Pasada) */}
                        <button
                          type="button"
                          onClick={() => handleOpenCancelDpModal(client, deudaPasada)}
                          disabled={deudaPasada <= 0}
                          className={`px-2.5 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1 text-xs shadow-xs border ${
                            deudaPasada > 0
                              ? 'bg-amber-600 hover:bg-amber-700 text-white border-amber-700 shadow-amber-200/50 cursor-pointer active:scale-95'
                              : 'bg-stone-100 text-stone-400 border-stone-200 cursor-not-allowed opacity-60'
                          }`}
                          title={
                            deudaPasada > 0
                              ? `Registrar que ${client.name} canceló su Deuda Pasada de ${formatCurrency(deudaPasada)}`
                              : 'No tiene Deuda Pasada pendiente (DP S/ 0.00)'
                          }
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Cancelo DP</span>
                        </button>

                        {/* Button: WhatsApp */}
                        <button
                          type="button"
                          onClick={() => handleSendWhatsApp(client)}
                          className="px-2.5 py-1.5 bg-emerald-50 border border-emerald-300 hover:bg-emerald-100 text-emerald-800 rounded-xl transition-colors flex items-center gap-1 text-xs font-bold shadow-xs"
                          title="Enviar estado de cuenta por WhatsApp (+51)"
                        >
                          <Share2 className="w-3.5 h-3.5 text-emerald-700" />
                          <span>WhatsApp</span>
                        </button>

                        {/* Button: Combinar Pedidos / Extras */}
                        <button
                          type="button"
                          onClick={() => {
                            const firstCons = consumptions.find((c) => c.clientId === client.id);
                            handleOpenMergeConsModal(firstCons?.id);
                          }}
                          className="px-2.5 py-1.5 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-900 font-bold rounded-xl transition-colors flex items-center gap-1 text-xs shadow-xs"
                          title="Combinar adicionales o pedidos de este cliente con un pedido principal"
                        >
                          <GitMerge className="w-3.5 h-3.5 text-indigo-700" />
                          <span className="hidden sm:inline">Combinar</span>
                        </button>

                        {/* Button: Pasar a Diaria (Revertir Cuenta) */}
                        <button
                          type="button"
                          onClick={() => handleOpenTransformWeeklyToDaily(client)}
                          className="px-2.5 py-1.5 bg-amber-50 border border-amber-300 hover:bg-amber-100 text-amber-900 font-bold rounded-xl transition-colors flex items-center gap-1 text-xs shadow-xs"
                          title="Revertir: Pasar esta cuenta semanal de vuelta a Cuenta Diaria"
                        >
                          <RotateCcw className="w-3.5 h-3.5 text-amber-800" />
                          <span className="hidden sm:inline">Pasar a Diaria</span>
                        </button>

                        {/* Button: Quitar Cliente */}
                        <button
                          type="button"
                          onClick={() => handleRemoveClient(client.id, client.name)}
                          className="px-2.5 py-1.5 bg-rose-50 border border-rose-200 hover:bg-rose-100 text-rose-700 font-bold rounded-xl transition-colors flex items-center gap-1 text-xs shadow-xs"
                          title="Quitar este cliente del registro"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                          <span>Quitar</span>
                        </button>

                        {/* Toggle Collapse/Expand */}
                        <button
                          type="button"
                          onClick={() => toggleCollapseWeekly(client.id)}
                          className="px-2.5 py-1.5 bg-stone-100 hover:bg-amber-100 hover:text-amber-950 text-stone-700 font-bold rounded-xl transition-colors flex items-center gap-1 text-xs border border-stone-200 shadow-2xs"
                          title={isWeeklyCollapsed ? "Expandir días de la semana" : "Contraer para facilitar el cobro"}
                        >
                          {isWeeklyCollapsed ? (
                            <>
                              <ChevronDown className="w-3.5 h-3.5 text-amber-800" />
                              <span className="hidden sm:inline">Ver</span>
                            </>
                          ) : (
                            <>
                              <ChevronUp className="w-3.5 h-3.5 text-stone-600" />
                              <span className="hidden sm:inline">Contraer</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Monday to Saturday Grid & Abonos (Collapsible) */}
                    {!isWeeklyCollapsed && (
                      <div className="p-3 sm:p-4">
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                        {clientWeekConsumptions.map((dayData) => {
                          const hasConsumption = dayData.consumptions.length > 0;
                          const isCurrentDay = dayData.dateStr === today;

                          return (
                            <div
                              key={dayData.dateStr}
                              className={`p-2 rounded-xl border flex flex-col justify-between min-h-[140px] transition-colors ${
                                isCurrentDay
                                  ? 'border-amber-500 bg-amber-50/40 ring-1 ring-amber-400'
                                  : hasConsumption
                                  ? 'border-stone-200 bg-white'
                                  : 'border-dashed border-stone-200 bg-stone-50/50'
                              }`}
                            >
                              {/* Day Header */}
                              <div>
                                <div className="flex items-center justify-between border-b border-stone-100 pb-1 mb-1">
                                  <span className={`text-[11px] font-extrabold ${isCurrentDay ? 'text-amber-900' : 'text-stone-700'}`}>
                                    {dayData.display}
                                  </span>
                                  {hasConsumption && (
                                    <button
                                      type="button"
                                      onClick={() => handleClearDayOrders(client.id, client.name, dayData.dateStr, dayData.dayName)}
                                      className="text-[10px] text-rose-600 hover:text-rose-800 hover:bg-rose-50 px-1 py-0.5 rounded transition-colors font-bold flex items-center gap-0.5"
                                      title={`Borrar pedidos del ${dayData.dayName}`}
                                    >
                                      <Trash2 className="w-2.5 h-2.5 text-rose-500" />
                                      <span>Borrar</span>
                                    </button>
                                  )}
                                </div>

                                {/* Consumption Content */}
                                {hasConsumption ? (
                                  <div className="space-y-1.5 my-1">
                                    {dayData.consumptions.map((cons) => {
                                      const isPaid = cons.paymentStatus === 'pagado';
                                      const totalItems = cons.lunches.length + cons.extras.length;

                                      return (
                                        <div
                                          key={cons.id}
                                          className={`text-[11px] p-1.5 rounded-lg border relative transition-colors ${
                                            isPaid
                                              ? 'bg-emerald-50/70 border-emerald-300'
                                              : 'bg-stone-50 border-stone-200'
                                          }`}
                                        >
                                          <div className="flex items-center justify-between gap-1">
                                            <div className="font-bold text-stone-900 leading-tight">
                                              {cons.lunches.map((l) => `${l.quantity}x ${l.menuType === 'menu_completo' ? 'Menú Completo' : 'Segundo Solo'}`).join(', ')}
                                            </div>
                                            {isPaid ? (
                                              <span className="text-[9px] bg-emerald-100 text-emerald-900 font-extrabold px-1.5 py-0.2 rounded border border-emerald-300 shrink-0 flex items-center gap-0.5">
                                                <Check className="w-2.5 h-2.5 text-emerald-700" />
                                                <span>{cons.paymentMethod?.toUpperCase() || 'PAGADO'}</span>
                                              </span>
                                            ) : (
                                              <span className="text-[9px] bg-amber-100 text-amber-900 font-bold px-1 py-0.2 rounded shrink-0">
                                                Pendiente
                                              </span>
                                            )}
                                          </div>

                                          {cons.extras.length > 0 && (
                                            <div className="text-[9px] text-emerald-800 font-semibold truncate mt-0.5">
                                              +{cons.extras.map((e) => `${e.quantity} ${e.name}`).join(', ')}
                                            </div>
                                          )}

                                          {/* Desglose individual de cobro por producto si tiene adicionales o varios platos y está pendiente */}
                                          {!isPaid && totalItems > 1 && (
                                            <div className="mt-1 pt-1 border-t border-dashed border-stone-200 space-y-0.5">
                                              <span className="text-[9px] text-stone-500 font-bold block">Pagar por producto:</span>
                                              {cons.lunches.map((l) => (
                                                <div key={l.id} className="flex items-center justify-between text-[10px] bg-white p-0.5 rounded border border-stone-100">
                                                  <span className="truncate max-w-[65px] font-medium">{l.quantity}x {l.menuType === 'menu_completo' ? 'Menú' : 'Segundo'}</span>
                                                  <div className="flex items-center gap-0.5">
                                                    <span className="font-black text-stone-700 text-[9px] mr-0.5">{formatCurrency(l.totalPrice)}</span>
                                                    <button
                                                      type="button"
                                                      onClick={() => handlePayWeeklyItem(client, cons, 'lunch', l.id, 'efectivo')}
                                                      className="px-1 py-0.2 bg-emerald-700 hover:bg-emerald-800 text-white rounded text-[8px] font-black"
                                                      title="Pagar este menú en Efectivo"
                                                    >
                                                      $
                                                    </button>
                                                    <button
                                                      type="button"
                                                      onClick={() => handlePayWeeklyItem(client, cons, 'lunch', l.id, 'yape')}
                                                      className="px-1 py-0.2 bg-purple-700 hover:bg-purple-800 text-white rounded text-[8px] font-black"
                                                      title="Pagar este menú con Yape"
                                                    >
                                                      Y
                                                    </button>
                                                  </div>
                                                </div>
                                              ))}
                                              {cons.extras.map((e) => (
                                                <div key={e.id} className="flex items-center justify-between text-[10px] bg-white p-0.5 rounded border border-stone-100">
                                                  <span className="truncate max-w-[65px] font-medium text-emerald-900">{e.quantity}x {e.name}</span>
                                                  <div className="flex items-center gap-0.5">
                                                    <span className="font-black text-stone-700 text-[9px] mr-0.5">{formatCurrency(e.totalPrice)}</span>
                                                    <button
                                                      type="button"
                                                      onClick={() => handlePayWeeklyItem(client, cons, 'extra', e.id, 'efectivo')}
                                                      className="px-1 py-0.2 bg-emerald-700 hover:bg-emerald-800 text-white rounded text-[8px] font-black"
                                                      title="Pagar este extra en Efectivo"
                                                    >
                                                      $
                                                    </button>
                                                    <button
                                                      type="button"
                                                      onClick={() => handlePayWeeklyItem(client, cons, 'extra', e.id, 'yape')}
                                                      className="px-1 py-0.2 bg-purple-700 hover:bg-purple-800 text-white rounded text-[8px] font-black"
                                                      title="Pagar este extra con Yape"
                                                    >
                                                      Y
                                                    </button>
                                                  </div>
                                                </div>
                                              ))}
                                            </div>
                                          )}

                                          <div className="flex items-center justify-between mt-1 pt-1 border-t border-stone-200">
                                            <span className={`font-black text-[11px] ${isPaid ? 'text-emerald-900' : 'text-amber-900'}`}>
                                              {formatCurrency(cons.total)}
                                            </span>
                                            <div className="flex items-center gap-1">
                                              {isPaid ? (
                                                <button
                                                  type="button"
                                                  onClick={() => handleRevertWeeklyConsumption(client, cons)}
                                                  className="text-[9px] text-stone-500 hover:text-rose-700 font-bold underline px-1 py-0.5"
                                                  title="Deshacer pago de este pedido"
                                                >
                                                  Deshacer
                                                </button>
                                              ) : (
                                                <>
                                                  <button
                                                    type="button"
                                                    onClick={() => handlePayWeeklyConsumption(client, cons, 'efectivo')}
                                                    className="px-1.5 py-0.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded text-[9px] font-bold flex items-center gap-0.5 shadow-2xs"
                                                    title="Cobrar este pedido completo en Efectivo"
                                                  >
                                                    <span>Efec</span>
                                                  </button>
                                                  <button
                                                    type="button"
                                                    onClick={() => handlePayWeeklyConsumption(client, cons, 'yape')}
                                                    className="px-1.5 py-0.5 bg-purple-700 hover:bg-purple-800 text-white rounded text-[9px] font-bold flex items-center gap-0.5 shadow-2xs"
                                                    title="Cobrar este pedido completo con Yape"
                                                  >
                                                    <span>Yape</span>
                                                  </button>
                                                </>
                                              )}
                                              <button
                                                type="button"
                                                onClick={() => handleOpenEditConsumption(cons)}
                                                className="p-1 bg-white hover:bg-amber-50 border border-stone-200 hover:border-amber-300 text-amber-700 rounded-md shadow-xs transition-colors"
                                                title="Editar pedido"
                                              >
                                                <Edit3 className="w-2.5 h-2.5" />
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() => handleDeleteConsumption(cons.id)}
                                                className="p-1 bg-white hover:bg-rose-50 border border-stone-200 hover:border-rose-300 text-rose-600 rounded-md shadow-xs transition-colors"
                                                title="Eliminar pedido"
                                              >
                                                <Trash2 className="w-2.5 h-2.5" />
                                              </button>
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })}

                                    {/* Si hay 2 o más pedidos en el día y hay saldo pendiente, botón para cobrar todo el día junto */}
                                    {dayData.consumptions.length > 1 && dayData.consumptions.some(c => c.paymentStatus !== 'pagado') && (
                                      <div className="bg-amber-50 border border-amber-300 p-1 rounded-lg flex items-center justify-between text-[10px]">
                                        <span className="font-bold text-amber-900">Cobrar día:</span>
                                        <div className="flex items-center gap-1">
                                          <button
                                            type="button"
                                            onClick={() => handlePayWeeklyDay(client, dayData, 'efectivo')}
                                            className="px-1.5 py-0.5 bg-emerald-700 text-white rounded text-[9px] font-bold shadow-2xs"
                                            title="Cobrar todo el día en Efectivo"
                                          >
                                            Efec
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => handlePayWeeklyDay(client, dayData, 'yape')}
                                            className="px-1.5 py-0.5 bg-purple-700 text-white rounded text-[9px] font-bold shadow-2xs"
                                            title="Cobrar todo el día con Yape"
                                          >
                                            Yape
                                          </button>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <div className="text-[11px] text-stone-400 italic py-3 text-center">
                                    Sin pedido
                                  </div>
                                )}
                              </div>

                              {/* Quick Add Button for that day */}
                              <button
                                type="button"
                                onClick={() => handleOpenAddConsumption(client, dayData.dateStr)}
                                className={`w-full text-[10px] font-bold py-1 px-1.5 rounded-lg border transition-colors flex items-center justify-center gap-1 ${
                                  hasConsumption
                                    ? 'border-stone-300 text-stone-600 hover:bg-stone-100'
                                    : 'border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900'
                                }`}
                              >
                                <Plus className="w-3 h-3" />
                                <span>Anotar</span>
                              </button>
                            </div>
                          );
                        })}
                      </div>

                      {/* Abonos de la semana actual y semanas anteriores */}
                      <div className="mt-2.5 pt-2.5 border-t border-stone-100 flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-[11px] text-stone-500 uppercase">
                            Abonos de esta semana ({clientWeekPayments.length}):
                          </span>
                          {clientWeekPayments.length === 0 ? (
                            <span className="text-stone-400 italic text-[11px]">Sin abonos en esta semana</span>
                          ) : (
                            <>
                              {/* Pagos dedicados: Canceló DP */}
                              {clientWeekDpPayments.map((p) => (
                                <span
                                  key={p.id}
                                  className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-950 border border-amber-300 px-2 py-0.5 rounded-lg text-[11px] font-semibold shadow-2xs"
                                  title="Pago de Deuda Pasada registrado hoy / esta semana"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5 text-amber-700" />
                                  <span>Canceló DP ({p.dayOfWeek} {p.date.substring(5)}):</span>
                                  <strong className="text-amber-900">{formatCurrency(p.amount)}</strong>
                                  <span className="uppercase text-[9px] px-1 bg-white rounded text-amber-900 font-bold border border-amber-200">
                                    {p.method}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleDeletePayment(p.id)}
                                    className="text-stone-400 hover:text-rose-600 ml-0.5 font-bold"
                                    title="Eliminar registro de pago DP"
                                  >
                                    ×
                                  </button>
                                </span>
                              ))}

                              {/* Pagos dedicados: Canceló DA */}
                              {clientWeekDaPayments.map((p) => (
                                <span
                                  key={p.id}
                                  className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-950 border border-emerald-300 px-2 py-0.5 rounded-lg text-[11px] font-semibold shadow-2xs"
                                  title="Pago de Deuda Actual registrado hoy / esta semana"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                                  <span>Canceló DA ({p.dayOfWeek} {p.date.substring(5)}):</span>
                                  <strong className="text-emerald-900">{formatCurrency(p.amount)}</strong>
                                  <span className="uppercase text-[9px] px-1 bg-white rounded text-emerald-900 font-bold border border-emerald-200">
                                    {p.method}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleDeletePayment(p.id)}
                                    className="text-stone-400 hover:text-rose-600 ml-0.5 font-bold"
                                    title="Eliminar registro de pago DA"
                                  >
                                    ×
                                  </button>
                                </span>
                              ))}

                              {/* Abonos regulares con desglose de resta a DP y DA */}
                              {abonosWithBreakdown.map(({ payment: p, appliedToDp, appliedToDa }) => (
                                <span
                                  key={p.id}
                                  className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-950 border border-blue-200 px-2.5 py-1 rounded-lg text-[11px] font-medium shadow-2xs"
                                  title={`Abono registrado el ${p.dayOfWeek} ${p.date}: ${formatCurrency(p.amount)} (${p.method})`}
                                >
                                  <DollarSign className="w-3.5 h-3.5 text-blue-700 shrink-0" />
                                  <span>Abono ({p.dayOfWeek} {p.date.substring(5)}):</span>
                                  <strong className="text-blue-950 font-bold">{formatCurrency(p.amount)}</strong>
                                  <span className="uppercase text-[9px] px-1 bg-white rounded text-blue-800 font-bold border border-blue-200">
                                    {p.method}
                                  </span>
                                  {appliedToDp > 0 && appliedToDa === 0 && (
                                    <span className="text-[10px] text-amber-900 bg-amber-100/90 border border-amber-300 px-1.5 py-0.2 rounded font-bold">
                                      Restó DP: {formatCurrency(appliedToDp)}
                                    </span>
                                  )}
                                  {appliedToDp > 0 && appliedToDa > 0 && (
                                    <span className="text-[10px] text-emerald-950 bg-emerald-100/90 border border-emerald-300 px-1.5 py-0.2 rounded font-bold">
                                      Restó DP: {formatCurrency(appliedToDp)} + DA: {formatCurrency(appliedToDa)}
                                    </span>
                                  )}
                                  {appliedToDp === 0 && appliedToDa > 0 && (
                                    <span className="text-[10px] text-blue-950 bg-blue-100/90 border border-blue-300 px-1.5 py-0.2 rounded font-bold">
                                      Restó DA: {formatCurrency(appliedToDa)}
                                    </span>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => handleDeletePayment(p.id)}
                                    className="text-stone-400 hover:text-rose-600 ml-0.5 font-bold"
                                    title="Eliminar abono"
                                  >
                                    ×
                                  </button>
                                </span>
                              ))}
                            </>
                          )}
                        </div>

                        {/* Abonos de semanas anteriores colapsados para evitar que se llene la tarjeta */}
                        {clientOtherPayments.length > 0 && (
                          <div>
                            <button
                              type="button"
                              onClick={() => toggleShowAllPayments(client.id)}
                              className="text-[11px] font-bold text-stone-500 hover:text-stone-800 underline flex items-center gap-1"
                            >
                              <span>
                                {showAllPaymentsMap[client.id]
                                  ? 'Ocultar abonos anteriores'
                                  : `Ver ${clientOtherPayments.length} abono(s) de semanas anteriores`}
                              </span>
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Lista expandible de abonos de semanas anteriores */}
                      {showAllPaymentsMap[client.id] && clientOtherPayments.length > 0 && (
                        <div className="mt-2 p-2 bg-stone-50 border border-stone-200 rounded-xl flex flex-wrap items-center gap-2 text-xs text-stone-600">
                          <span className="font-bold text-[10px] text-stone-500 uppercase">Abonos anteriores:</span>
                          {clientOtherPayments.map((p) => (
                            <span
                              key={p.id}
                              className="inline-flex items-center gap-1 bg-stone-100 text-stone-800 border border-stone-300 px-2 py-0.5 rounded-md text-[11px]"
                            >
                              <span>{p.dayOfWeek} {p.date}:</span>
                              <strong>{formatCurrency(p.amount)}</strong>
                              <span className="uppercase text-[9px] px-1 bg-white rounded text-stone-700 font-bold">{p.method}</span>
                              {p.notes && (
                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                  p.notes.toLowerCase().includes('dp') || p.notes.toLowerCase().includes('deuda pasada')
                                    ? 'bg-amber-100 text-amber-900 border border-amber-300 font-bold'
                                    : 'text-stone-500 italic'
                                }`}>
                                  {p.notes}
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => handleDeletePayment(p.id)}
                                className="text-stone-400 hover:text-rose-600 ml-0.5"
                                title="Eliminar abono"
                              >
                                ×
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            };

            return (
              <div className="space-y-6">
                {/* SECCIÓN 1: CUENTAS SEMANALES PENDIENTES */}
                <div className="space-y-3">
                  <div
                    onClick={() => setIsWeeklyPendientesExpanded((prev) => !prev)}
                    className="bg-amber-100/80 border border-amber-300 rounded-2xl px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-amber-100 transition-colors shadow-xs"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-600 animate-pulse" />
                      <h4 className="text-sm font-black text-amber-950 uppercase tracking-wide">
                        Cuentas Semanales Pendientes ({pendingWeeklyClients.length})
                      </h4>
                      <span className="text-xs bg-rose-600 text-white font-black px-2.5 py-0.5 rounded-lg shadow-2xs">
                        DT Total: {formatCurrency(totalPendingWeeklyDebt)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-xs font-bold text-amber-900">
                      <span>{isWeeklyPendientesExpanded ? 'Contraer' : 'Expandir'}</span>
                      {isWeeklyPendientesExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </div>
                  </div>

                  {isWeeklyPendientesExpanded && (
                    <div className="space-y-4 pl-1">
                      {pendingWeeklyClients.length === 0 ? (
                        <div className="bg-emerald-50/50 border border-emerald-200 rounded-xl p-6 text-center text-emerald-800 text-xs font-bold">
                          🎉 ¡Excelente! No hay cuentas semanales pendientes por cobrar. Todas están al día.
                        </div>
                      ) : (
                        pendingWeeklyClients.map(renderWeeklyCard)
                      )}
                    </div>
                  )}
                </div>

                {/* SECCIÓN 2: CUENTAS SEMANALES CANCELADAS / AL DÍA (DT = 0) */}
                <div className="space-y-3">
                  <div
                    onClick={() => setIsWeeklyCanceladasExpanded((prev) => !prev)}
                    className="bg-emerald-100/80 border border-emerald-300 rounded-2xl px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-emerald-100 transition-colors shadow-xs"
                  >
                    <div className="flex items-center gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                      <h4 className="text-sm font-black text-emerald-950 uppercase tracking-wide">
                        Cuentas Semanales Canceladas ({cancelledWeeklyClients.length})
                      </h4>
                      <span className="text-xs bg-emerald-700 text-white font-black px-2.5 py-0.5 rounded-lg shadow-2xs">
                        DT = {formatCurrency(0)} (Al día)
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-xs font-bold text-emerald-900">
                      <span>{isWeeklyCanceladasExpanded ? 'Contraer' : 'Expandir'}</span>
                      {isWeeklyCanceladasExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </div>
                  </div>

                  {isWeeklyCanceladasExpanded && (
                    <div className="space-y-4 pl-1">
                      {cancelledWeeklyClients.length === 0 ? (
                        <div className="bg-stone-50 border border-stone-200 rounded-xl p-6 text-center text-stone-500 text-xs">
                          Aún no hay cuentas canceladas en 0. Cuando un cliente abone la totalidad de su deuda (DT=00), aparecerá aquí.
                        </div>
                      ) : (
                        cancelledWeeklyClients.map(renderWeeklyCard)
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. TAB: CUENTAS DIARIAS (Registro con fecha exacta, pendiente de cobro)   */}
      {/* ========================================================================= */}
      {activeTab === 'diarias' && (
        <div className="space-y-4">
          {/* Barra Superior de Control de Cuentas Diarias y Mesas de Salón */}
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5 text-xs sm:text-sm text-amber-950 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="p-2 bg-amber-100 text-amber-900 rounded-xl">
                <Utensils className="w-5 h-5" />
              </div>
              <div>
                <span className="font-extrabold text-amber-950 text-sm sm:text-base block">
                  Registro Diario de Mesas y Clientes
                </span>
                <span className="text-[11px] text-stone-600">
                  Cada comanda en mesa o cliente se gestiona como cuenta individual modificable y cobrable
                </span>
              </div>
            </div>

            {/* Acciones principales y selector de fecha */}
            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="flex items-center gap-1.5 bg-white px-2.5 py-1.5 rounded-xl border border-stone-300">
                <label className="text-[11px] font-bold text-stone-600">Fecha:</label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="text-xs font-bold text-stone-900 focus:outline-none bg-transparent"
                />
              </div>

              <button
                type="button"
                onClick={handleOpenAddMesaOrder}
                className="bg-amber-800 hover:bg-amber-900 text-white font-black text-xs px-3.5 py-2.5 rounded-xl flex items-center gap-1.5 shadow-xs transition-colors"
                title="Tomar nueva orden para una mesa del salón"
              >
                <Utensils className="w-4 h-4" />
                <span>+ Tomar Pedido en Mesa</span>
              </button>

              <button
                type="button"
                onClick={() => handleOpenNewDailyOrder(selectedDate, selectedPiso !== 'todos' ? selectedPiso : undefined)}
                className="bg-white hover:bg-stone-100 text-stone-800 border border-stone-300 font-bold text-xs px-3 py-2.5 rounded-xl flex items-center gap-1.5 shadow-2xs transition-colors"
                title="Anotar pedido para cliente de tienda, oficina o calle"
              >
                <Plus className="w-4 h-4 text-amber-800" />
                <span>+ Anotar Pedido Diario{selectedPiso !== 'todos' ? ` (${selectedPiso})` : ''}</span>
              </button>
            </div>
          </div>

          {/* Tarjetas de Resumen Rápido del Salón y Cuentas Diarias */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white p-3.5 rounded-2xl border border-stone-200 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-stone-500 uppercase tracking-wide">Mesas Atendidas</span>
                <div className="p-1 bg-amber-100 text-amber-900 rounded-lg">
                  <Utensils className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="text-xl sm:text-2xl font-black text-stone-900 mt-1">
                {mesaDailyAccounts.length}
              </div>
              <div className="text-[11px] text-stone-500 mt-0.5">
                Mesas registradas hoy
              </div>
            </div>

            <div className="bg-white p-3.5 rounded-2xl border border-amber-200 shadow-2xs bg-amber-50/30">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-amber-900 uppercase tracking-wide">Mesas Abiertas</span>
                <span className="w-2 h-2 rounded-full bg-rose-600 animate-pulse"></span>
              </div>
              <div className="text-xl sm:text-2xl font-black text-rose-700 mt-1">
                {mesaDailyAccounts.filter((a) => !a.isFullyPaid).length}
              </div>
              <div className="text-[11px] text-stone-600 mt-0.5 truncate">
                Pendiente: <strong className="text-rose-700">{formatCurrency(mesaDailyAccounts.reduce((s, a) => s + a.saldoPendiente, 0))}</strong>
              </div>
            </div>

            <div className="bg-white p-3.5 rounded-2xl border border-emerald-200 shadow-2xs bg-emerald-50/20">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-emerald-900 uppercase tracking-wide">Cobrado en Mesas</span>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              </div>
              <div className="text-xl sm:text-2xl font-black text-emerald-900 mt-1">
                {formatCurrency(cajaDelDia.mesaTotal)}
              </div>
              <div className="text-[11px] text-stone-600 mt-0.5 truncate">
                Efec: {formatCurrency(cajaDelDia.mesaCash)} • Yape: {formatCurrency(cajaDelDia.mesaYape)}
              </div>
            </div>

            <div className="bg-white p-3.5 rounded-2xl border border-stone-200 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-stone-500 uppercase tracking-wide">Tiendas / Calle</span>
                <Clock className="w-3.5 h-3.5 text-blue-700" />
              </div>
              <div className="text-xl sm:text-2xl font-black text-stone-900 mt-1">
                {tiendaDailyAccounts.length}
              </div>
              <div className="text-[11px] text-stone-600 mt-0.5 truncate">
                Pendiente: <strong className="text-rose-700">{formatCurrency(tiendaDailyAccounts.reduce((s, a) => s + a.saldoPendiente, 0))}</strong>
              </div>
            </div>
          </div>



          {/* Consolidado del día en Caja */}
          <div className="bg-amber-900 text-white rounded-xl p-3.5 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs">
            <div className="text-xs">
              <span className="font-bold text-amber-200 uppercase tracking-wide">
                Cuentas del Día ({selectedDate}):
              </span>
              <span className="text-amber-100 ml-2">
                Mesas: {formatCurrency(cajaDelDia.mesaTotal)} • Diarias: {formatCurrency(cajaDelDia.dailyTotal)} • Abonos: {formatCurrency(cajaDelDia.abonosTotal)}
              </span>
              <div className="text-[11px] text-amber-300/90 mt-0.5">
                Saldo pendiente por cobrar hoy en diarias y mesas: <strong className="text-amber-100">{formatCurrency(dailyAccountsList.reduce((s, a) => s + a.saldoPendiente, 0))}</strong>
              </div>
            </div>
            <div className="text-right flex items-center gap-2">
              <span className="text-xs font-semibold text-amber-200">Total en Caja Hoy:</span>
              <span className="text-lg sm:text-xl font-black text-white">
                {formatCurrency(cajaDelDia.totalGeneral)}
              </span>
            </div>
          </div>

          {/* Cuentas Diarias y Mesas Consolidadas */}
          <div className="space-y-4">
            <div className="bg-stone-100/90 border border-stone-200 rounded-xl px-4 py-3 flex flex-col md:flex-row md:items-center justify-between gap-3 flex-wrap">
              {/* Filtros de Categoría */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => setDailyCategoryFilter('todos')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                    dailyCategoryFilter === 'todos'
                      ? 'bg-stone-900 text-white shadow-xs'
                      : 'bg-white text-stone-700 border border-stone-200 hover:bg-stone-50'
                  }`}
                >
                  📋 Todas ({dailyAccountsList.length})
                </button>
                <button
                  type="button"
                  onClick={() => setDailyCategoryFilter('mesas')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 ${
                    dailyCategoryFilter === 'mesas'
                      ? 'bg-amber-800 text-white shadow-xs'
                      : 'bg-white text-stone-700 border border-stone-200 hover:bg-stone-50'
                  }`}
                >
                  <Utensils className="w-3 h-3" />
                  <span>Mesas Salón ({mesaDailyAccounts.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDailyCategoryFilter('tiendas')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 ${
                    dailyCategoryFilter === 'tiendas'
                      ? 'bg-blue-800 text-white shadow-xs'
                      : 'bg-white text-stone-700 border border-stone-200 hover:bg-stone-50'
                  }`}
                >
                  🏢 Tiendas y Calle ({tiendaDailyAccounts.length})
                </button>
              </div>

              {/* Filtros de Estado & Expandir/Contraer */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1 text-xs">
                  <button
                    type="button"
                    onClick={() => setDailyStatusFilter('todos')}
                    className={`px-2 py-1 rounded-md font-bold text-[11px] ${
                      dailyStatusFilter === 'todos' ? 'bg-stone-800 text-white' : 'bg-stone-200/80 text-stone-700'
                    }`}
                  >
                    Todos
                  </button>
                  <button
                    type="button"
                    onClick={() => setDailyStatusFilter('pendientes')}
                    className={`px-2 py-1 rounded-md font-bold text-[11px] flex items-center gap-1 ${
                      dailyStatusFilter === 'pendientes' ? 'bg-rose-700 text-white' : 'bg-rose-50 text-rose-700 border border-rose-200'
                    }`}
                  >
                    🔴 Pendientes ({pendingDailyAccounts.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setDailyStatusFilter('cobrados')}
                    className={`px-2 py-1 rounded-md font-bold text-[11px] ${
                      dailyStatusFilter === 'cobrados' ? 'bg-emerald-700 text-white' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    }`}
                  >
                    ✓ Al Día ({paidDailyAccounts.length})
                  </button>
                </div>

                <div className="h-4 w-px bg-stone-300 hidden sm:block"></div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={expandAllDaily}
                    className="px-2.5 py-1 bg-white hover:bg-stone-200 text-stone-700 rounded-lg text-xs font-bold border border-stone-300 shadow-2xs transition-colors flex items-center gap-1"
                    title="Expandir todas las cuentas"
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                    <span>Expandir</span>
                  </button>
                  <button
                    type="button"
                    onClick={collapseAllDaily}
                    className="px-2.5 py-1 bg-white hover:bg-stone-200 text-stone-700 rounded-lg text-xs font-bold border border-stone-300 shadow-2xs transition-colors flex items-center gap-1"
                    title="Contraer todas las cuentas para ver solo el saldo y facilitar el cobro"
                  >
                    <ChevronUp className="w-3.5 h-3.5" />
                    <span>Contraer</span>
                  </button>
                </div>
              </div>
            </div>

            {(() => {
              const renderDailyAccountCard = (account: DailyClientAccount, isCobradoSection: boolean = false) => {
                const isCollapsed = !!collapsedDailyAccounts[account.clientId];
                const isPending = !account.isFullyPaid;
                const clientObj = account.clientRecord || clients.find((c) => c.id === account.clientId);
                const hasVueltoOwed = !!debeVueltoMap[account.clientId];

                // Formatear hora de último cobro si existe
                const paymentTimeFormatted = account.lastPaymentTimestamp
                  ? new Date(account.lastPaymentTimestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : '';

                return (
                  <div
                    key={account.clientId}
                    className={`bg-white rounded-2xl border transition-shadow hover:shadow-md overflow-hidden ${
                      isPending
                        ? 'border-amber-300 shadow-xs'
                        : hasVueltoOwed
                        ? 'border-rose-400 shadow-xs ring-1 ring-rose-400/40'
                        : 'border-stone-200 shadow-2xs'
                    }`}
                  >
                    {/* Header Card: Client, Piso, Status, Vuelto Alert & Fast Cobro */}
                    <div className="bg-stone-50/90 px-4 py-3 border-b border-stone-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span
                          className={`px-2.5 py-1 rounded-lg text-xs font-black border flex items-center gap-1 ${
                            account.piso === 'Calle'
                              ? 'bg-blue-100 text-blue-900 border-blue-200'
                              : 'bg-amber-100 text-amber-900 border-amber-200'
                          }`}
                        >
                          {account.piso === 'Calle' ? '🚶 Calle' : `📍 ${account.piso}`}
                        </span>

                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-black text-base text-stone-900">
                              {account.clientName}
                            </h3>

                            {clientObj?.phone ? (
                              <span className="text-xs text-stone-600 font-medium flex items-center gap-1">
                                📞 {formatPhoneDisplay(clientObj.phone)}
                              </span>
                            ) : null}

                            {/* Status tags */}
                            {account.hasCarriedOverPending && isPending && (
                              <span className="text-[11px] bg-rose-100 text-rose-800 border border-rose-300 font-extrabold px-2 py-0.5 rounded-md flex items-center gap-1">
                                <span>⚠️ Pasa pendiente desde el {account.earliestPendingDay} {account.earliestPendingDate}</span>
                              </span>
                            )}

                            {!isPending ? (
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-[11px] bg-emerald-100 text-emerald-800 border border-emerald-300 font-extrabold px-2 py-0.5 rounded-md flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-700" />
                                  <span>Cobrado • {account.paymentMethod?.toUpperCase() || 'AL DÍA'}</span>
                                  {paymentTimeFormatted && <span className="font-mono text-emerald-900 ml-0.5">({paymentTimeFormatted})</span>}
                                </span>

                                {hasVueltoOwed && (
                                  <span className="text-[11px] bg-rose-600 text-white font-black px-2.5 py-0.5 rounded-md flex items-center gap-1 shadow-2xs animate-pulse">
                                    <AlertCircle className="w-3 h-3" />
                                    <span>⚠️ SE LE DEBE VUELTO</span>
                                  </span>
                                )}
                              </div>
                            ) : account.totalPaid > 0 ? (
                              <span className="text-[11px] bg-blue-100 text-blue-900 border border-blue-300 font-extrabold px-2 py-0.5 rounded-md">
                                Abono parcial: {formatCurrency(account.totalPaid)}
                              </span>
                            ) : (
                              <span className="text-[11px] bg-amber-100 text-amber-900 border border-amber-300 font-bold px-2 py-0.5 rounded-md flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full bg-rose-600 animate-pulse"></span>
                                Pendiente
                              </span>
                            )}
                          </div>

                          <div className="text-xs text-stone-500 mt-0.5">
                            <span>{account.consumptions.length} pedido(s) registrado(s) • {account.items.length} producto(s) en lista</span>
                            {account.notes && <span className="italic ml-2 text-stone-600">"{account.notes}"</span>}
                          </div>
                        </div>
                      </div>

                      {/* Header Right: Balance & Action Buttons */}
                      <div className="flex items-center gap-2 sm:gap-3 flex-wrap lg:flex-nowrap justify-between lg:justify-end">
                        <div className="text-right mr-1">
                          <div className="text-xs text-stone-500">
                            Total: <strong className="text-stone-800">{formatCurrency(account.totalConsumed)}</strong>
                            {account.totalPaid > 0 && (
                              <span className="text-emerald-700 font-medium ml-1">
                                (Abonado: {formatCurrency(account.totalPaid)})
                              </span>
                            )}
                          </div>
                          <div className="text-xs">
                            <span className="text-stone-500 font-bold block text-[11px]">
                              {isPending ? 'Saldo por cobrar:' : 'Estado:'}
                            </span>
                            <span className={isPending ? 'text-rose-700 text-base sm:text-lg font-black block' : 'text-emerald-700 font-extrabold block'}>
                              {isPending ? formatCurrency(account.saldoPendiente) : '✓ Cancelado'}
                            </span>
                          </div>
                        </div>

                        {/* Botón rápido: Agregar producto a esta cuenta */}
                        <button
                          type="button"
                          onClick={() => handleOpenAddProductModal(account)}
                          className="px-2.5 py-1.5 bg-amber-700 hover:bg-amber-800 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1 transition-colors"
                          title="Agregar platos o bebidas a la cuenta de esta persona"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>+ Producto</span>
                        </button>

                        {/* Acciones de Cobro Rápido si tiene saldo */}
                        {isPending && (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handlePayDailyAccountFull(account, 'efectivo')}
                              className="px-2.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1 transition-colors"
                              title="Cobrar cuenta completa en Efectivo"
                            >
                              <DollarSign className="w-3.5 h-3.5" />
                              <span>Efectivo</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handlePayDailyAccountFull(account, 'yape')}
                              className="px-2.5 py-1.5 bg-purple-700 hover:bg-purple-800 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1 transition-colors"
                              title="Cobrar cuenta completa con Yape"
                            >
                              <Smartphone className="w-3.5 h-3.5" />
                              <span>Yape</span>
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                handleOpenPaymentModal(
                                  clientObj || {
                                    id: account.clientId,
                                    name: account.clientName,
                                    piso: account.piso,
                                    accountType: 'diaria',
                                    active: true,
                                  }
                                )
                              }
                              className="px-2 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-300 rounded-xl text-xs font-bold transition-colors"
                              title="Registrar abono parcial a cuenta"
                            >
                              + Abono
                            </button>
                          </div>
                        )}

                        {/* Botón de Vuelto y Deshacer cobro si está pagado */}
                        {!isPending && (
                          <div className="flex items-center gap-1.5">
                            {/* Botón: Marcar si le debes vuelto y cambiar al entregar */}
                            <button
                              type="button"
                              onClick={() => handleToggleDebeVuelto(account.clientId)}
                              className={`px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all border ${
                                hasVueltoOwed
                                  ? 'bg-rose-600 hover:bg-emerald-600 text-white border-rose-700 shadow-sm animate-pulse hover:animate-none'
                                  : 'bg-stone-100 hover:bg-amber-100 text-stone-700 hover:text-amber-950 border-stone-300 shadow-2xs'
                              }`}
                              title={
                                hasVueltoOwed
                                  ? '⚠️ Se le debe vuelto. Presiona aquí cuando ya le hayas dado su vuelto para marcarlo como entregado.'
                                  : 'Presiona aquí si le debes vuelto a este cliente para no olvidarte.'
                              }
                            >
                              {hasVueltoOwed ? (
                                <>
                                  <AlertCircle className="w-3.5 h-3.5" />
                                  <span>⚠️ Debe Vuelto (Clic al entregar)</span>
                                </>
                              ) : (
                                <>
                                  <span>💵 ¿Debe vuelto?</span>
                                </>
                              )}
                            </button>

                            <button
                              type="button"
                              onClick={() => handleRevertDailyAccount(account)}
                              className="px-2.5 py-1.5 bg-stone-100 hover:bg-amber-50 hover:text-amber-900 hover:border-amber-300 text-stone-700 rounded-xl text-xs font-bold flex items-center gap-1 border border-stone-300 transition-colors shadow-2xs"
                              title="Deshacer cobro y volver a poner en estado pendiente"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>Deshacer</span>
                            </button>
                          </div>
                        )}

                        {/* WhatsApp reminder */}
                        {clientObj && (
                          <button
                            type="button"
                            onClick={() => handleSendWhatsApp(clientObj)}
                            className="p-1.5 bg-emerald-50 border border-emerald-300 hover:bg-emerald-100 text-emerald-800 rounded-xl shadow-xs transition-colors"
                            title="Enviar resumen de cuenta por WhatsApp (+51)"
                          >
                            <Share2 className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {/* Combinar pedidos de este cliente */}
                        <button
                          type="button"
                          onClick={() => {
                            const firstCons = account.consumptions[0];
                            handleOpenMergeConsModal(firstCons?.id);
                          }}
                          className="px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200 rounded-xl text-xs font-bold flex items-center gap-1 transition-colors shadow-2xs"
                          title="Combinar adicionales o pedidos de este cliente con un pedido principal"
                        >
                          <GitMerge className="w-3.5 h-3.5 text-indigo-700" />
                          <span className="hidden sm:inline">Combinar</span>
                        </button>

                        {/* Transformar a cuenta semanal */}
                        <button
                          type="button"
                          onClick={() => handleOpenTransformToWeekly(account)}
                          className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-200 rounded-xl text-xs font-bold flex items-center gap-1 transition-colors shadow-2xs"
                          title="Transformar esta cuenta y sus pedidos diarios a Cuenta Semanal"
                        >
                          <Calendar className="w-3.5 h-3.5 text-blue-700" />
                          <span className="hidden sm:inline">Pasar a Semanal</span>
                        </button>

                        {/* Toggle Collapse/Expand */}
                        <button
                          type="button"
                          onClick={() => toggleCollapseDaily(account.clientId)}
                          className="px-2.5 py-1.5 bg-stone-100 hover:bg-amber-100 hover:text-amber-950 text-stone-700 font-bold rounded-xl transition-colors flex items-center gap-1 text-xs border border-stone-200 shadow-2xs"
                          title={isCollapsed ? "Ver lista de productos consumidos" : "Contraer lista para ver solo el saldo"}
                        >
                          {isCollapsed ? (
                            <>
                              <ChevronDown className="w-3.5 h-3.5 text-amber-800" />
                              <span className="hidden sm:inline">Ver</span>
                            </>
                          ) : (
                            <>
                              <ChevronUp className="w-3.5 h-3.5 text-stone-600" />
                              <span className="hidden sm:inline">Contraer</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Collapsible Body: Detailed items table with time, price, edit and delete */}
                    {!isCollapsed && (
                      <div className="p-3 sm:p-4 bg-stone-50/40 space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-extrabold text-stone-700 uppercase tracking-wider flex items-center gap-1.5">
                            <span>📋 Detalle de lo consumido ({account.items.length} ítems):</span>
                          </h4>
                        </div>

                        {/* Banner: Si tiene 2 o más pedidos separados, acceso rápido para combinarlos */}
                        {account.consumptions.length > 1 && (
                          <div className="bg-indigo-50/70 border border-indigo-200 rounded-xl px-3 py-2 text-xs flex flex-wrap items-center justify-between gap-2 shadow-2xs">
                            <div className="flex items-center gap-1.5 text-indigo-950 font-bold">
                              <GitMerge className="w-4 h-4 text-indigo-700 shrink-0" />
                              <span>Esta cuenta tiene {account.consumptions.length} pedidos anotados por separado.</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleOpenMergeConsModal(account.consumptions[0]?.id)}
                              className="px-2.5 py-1 bg-white hover:bg-indigo-100 text-indigo-900 border border-indigo-300 rounded-lg text-xs font-extrabold shadow-2xs transition-colors flex items-center gap-1"
                            >
                              <GitMerge className="w-3 h-3 text-indigo-700" />
                              <span>Combinar pedidos de este cliente</span>
                            </button>
                          </div>
                        )}

                        {/* Items Table */}
                        <div className="bg-white rounded-xl border border-stone-200 overflow-x-auto shadow-2xs">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-stone-100 text-stone-700 font-bold uppercase tracking-wider text-[11px] border-b border-stone-200">
                              <tr>
                                <th className="py-2.5 px-3">Cuándo se agregó</th>
                                <th className="py-2.5 px-3">Producto / Plato</th>
                                <th className="py-2.5 px-3 text-center">Cant.</th>
                                <th className="py-2.5 px-3 text-right">Precio Unit.</th>
                                <th className="py-2.5 px-3 text-right">Subtotal</th>
                                <th className="py-2.5 px-3 text-center">Estado / Cobro</th>
                                <th className="py-2.5 px-3 text-right">Acciones</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-stone-100">
                              {account.items.length === 0 ? (
                                <tr>
                                  <td colSpan={7} className="py-4 text-center text-stone-400">
                                    No hay productos en esta cuenta. Presiona "+ Agregar Producto".
                                  </td>
                                </tr>
                              ) : (
                                account.items.map((item) => {
                                  const itemDateStr = item.date;
                                  const isCarriedOver = itemDateStr < selectedDate;
                                  const isPaid = item.paymentStatus === 'pagado';
                                  const timeFormatted = item.timestamp
                                    ? new Date(item.timestamp).toLocaleTimeString([], {
                                        hour: '2-digit',
                                        minute: '2-digit',
                                      })
                                    : '';

                                  return (
                                    <tr
                                      key={item.id}
                                      className={`hover:bg-stone-50/80 transition-colors ${
                                        isPaid
                                          ? 'bg-emerald-50/30'
                                          : isCarriedOver
                                          ? 'bg-amber-50/40'
                                          : ''
                                      }`}
                                    >
                                      {/* Timestamp & Date */}
                                      <td className="py-2 px-3 whitespace-nowrap">
                                        <div className="flex items-center gap-1.5">
                                          {isCarriedOver ? (
                                            <span className="text-[10px] bg-rose-100 text-rose-900 border border-rose-200 font-bold px-1.5 py-0.5 rounded">
                                              {item.dayOfWeek} {item.date.substring(5)}
                                            </span>
                                          ) : (
                                            <span className="text-[10px] bg-stone-100 text-stone-700 font-semibold px-1.5 py-0.5 rounded">
                                              Hoy {item.dayOfWeek}
                                            </span>
                                          )}
                                          {timeFormatted && (
                                            <span className="text-[11px] text-stone-500 font-mono">
                                              {timeFormatted}
                                            </span>
                                          )}
                                        </div>
                                      </td>

                                      {/* Product Name & Type */}
                                      <td className="py-2 px-3">
                                        <div className="font-bold text-stone-900 flex items-center gap-1.5">
                                          <span>{item.type === 'lunch' ? '🍛' : '🥤'}</span>
                                          <span>{item.name}</span>
                                          {item.type === 'extra' && (
                                            <span className="text-[10px] bg-emerald-50 text-emerald-800 border border-emerald-200 px-1 py-0.2 rounded font-medium">
                                              Bebida / Extra
                                            </span>
                                          )}
                                        </div>
                                        {item.notes && (
                                          <div className="text-[11px] text-stone-500 italic mt-0.5">
                                            "{item.notes}"
                                          </div>
                                        )}
                                      </td>

                                      {/* Quantity */}
                                      <td className="py-2 px-3 text-center font-bold text-stone-800">
                                        {item.quantity}
                                      </td>

                                      {/* Unit Price */}
                                      <td className="py-2 px-3 text-right font-medium text-stone-700">
                                        {formatCurrency(item.unitPrice)}
                                      </td>

                                      {/* Subtotal */}
                                      <td className="py-2 px-3 text-right font-black text-amber-950">
                                        {formatCurrency(item.totalPrice)}
                                      </td>

                                      {/* Estado / Cobro Individual por Producto */}
                                      <td className="py-2 px-3 text-center whitespace-nowrap">
                                        {isPaid ? (
                                          <div className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-900 border border-emerald-300 px-2 py-0.5 rounded-lg text-[11px] font-extrabold shadow-2xs">
                                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                            <span>Cobrado ({item.paymentMethod?.toUpperCase() || 'PAGADO'})</span>
                                            <button
                                              type="button"
                                              onClick={() => handleRevertAccountItem(item)}
                                              className="text-[10px] text-stone-500 hover:text-rose-700 underline font-semibold ml-1"
                                              title="Deshacer cobro de este producto"
                                            >
                                              Deshacer
                                            </button>
                                          </div>
                                        ) : (
                                          <div className="inline-flex items-center gap-1">
                                            <span className="text-[10px] font-bold text-stone-500 mr-0.5 hidden sm:inline">Cobrar:</span>
                                            <button
                                              type="button"
                                              onClick={() => handlePayAccountItem(item, 'efectivo')}
                                              className="px-2 py-0.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-md text-[11px] font-bold shadow-2xs transition-colors flex items-center gap-0.5"
                                              title={`Cobrar ${item.name} en Efectivo (${formatCurrency(item.totalPrice)})`}
                                            >
                                              <DollarSign className="w-2.5 h-2.5" />
                                              <span>Efec</span>
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => handlePayAccountItem(item, 'yape')}
                                              className="px-2 py-0.5 bg-purple-700 hover:bg-purple-800 text-white rounded-md text-[11px] font-bold shadow-2xs transition-colors flex items-center gap-0.5"
                                              title={`Cobrar ${item.name} con Yape (${formatCurrency(item.totalPrice)})`}
                                            >
                                              <Smartphone className="w-2.5 h-2.5" />
                                              <span>Yape</span>
                                            </button>
                                          </div>
                                        )}
                                      </td>

                                      {/* Actions: Modificar & Quitar */}
                                      <td className="py-2 px-3 text-right whitespace-nowrap">
                                        <div className="flex items-center justify-end gap-1.5">
                                          <button
                                            type="button"
                                            onClick={() => handleOpenEditAccountItem(item, account.clientName)}
                                            className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-lg text-xs font-bold transition-colors flex items-center gap-1"
                                            title="Modificar cantidad, precio o notas"
                                          >
                                            <Edit3 className="w-3 h-3" />
                                            <span>Modificar</span>
                                          </button>

                                          <button
                                            type="button"
                                            onClick={() => handleDeleteAccountItem(item, account.clientName)}
                                            className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-bold transition-colors flex items-center gap-1"
                                            title="Quitar producto de la cuenta"
                                          >
                                            <Trash2 className="w-3 h-3" />
                                            <span>Quitar</span>
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })
                              )}
                            </tbody>
                          </table>
                        </div>

                        {/* Abonos parciales si existen */}
                        {account.payments.length > 0 && (
                          <div className="bg-emerald-50/80 border border-emerald-200 rounded-xl p-3 text-xs">
                            <div className="font-extrabold text-emerald-900 uppercase tracking-wider text-[11px] mb-1.5">
                              💵 Abonos Parciales Registrados ({account.payments.length}):
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              {account.payments.map((p) => (
                                <span
                                  key={p.id}
                                  className="inline-flex items-center gap-1.5 bg-white text-emerald-950 border border-emerald-300 px-2.5 py-1 rounded-lg font-medium shadow-2xs"
                                >
                                  <span>{p.dayOfWeek} {p.date.substring(5)}:</span>
                                  <strong>{formatCurrency(p.amount)}</strong>
                                  <span className="uppercase text-[10px] px-1.5 py-0.5 bg-emerald-100 text-emerald-900 rounded font-bold">
                                    {p.method}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleDeletePayment(p.id)}
                                    className="text-stone-400 hover:text-rose-600 ml-1 font-bold"
                                    title="Eliminar este abono"
                                  >
                                    ×
                                  </button>
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Card Footer: Cuenta Final Summary & Final Checkout */}
                        <div className="bg-stone-100/90 rounded-xl p-3 border border-stone-200 flex flex-col sm:flex-row items-center justify-between gap-3">
                          <div className="text-xs text-stone-700 space-y-0.5">
                            <div>
                              <span>Total Consumido: </span>
                              <strong className="text-stone-900">{formatCurrency(account.totalConsumed)}</strong>
                              {account.totalPaid > 0 && (
                                <span className="text-stone-500 ml-2">
                                  — Abonos Previos: <strong className="text-emerald-700">{formatCurrency(account.totalPaid)}</strong>
                                </span>
                              )}
                            </div>
                            <div className="text-sm font-black text-amber-950">
                              <span className="text-xs font-bold text-stone-600 block">Saldo por cobrar:</span>
                              <span className={isPending ? 'text-rose-700 text-base font-black block' : 'text-emerald-700 block'}>
                                {isPending ? formatCurrency(account.saldoPendiente) : '✓ Cancelado'}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 flex-wrap">
                            <button
                              type="button"
                              onClick={() => handleOpenAddProductModal(account)}
                              className="px-3 py-1.5 bg-white hover:bg-stone-200 text-stone-800 border border-stone-300 rounded-xl text-xs font-bold flex items-center gap-1 shadow-2xs transition-colors"
                            >
                              <Plus className="w-3.5 h-3.5 text-amber-800" />
                              <span>+ Agregar Producto</span>
                            </button>

                            {isPending && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handlePayDailyAccountFull(account, 'efectivo')}
                                  className="px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-black flex items-center gap-1 shadow-xs transition-colors"
                                  title="Cobrar el saldo total en Efectivo"
                                >
                                  <DollarSign className="w-3.5 h-3.5" />
                                  <span>Cobrar Total en Efectivo</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handlePayDailyAccountFull(account, 'yape')}
                                  className="px-3.5 py-1.5 bg-purple-700 hover:bg-purple-800 text-white rounded-xl text-xs font-black flex items-center gap-1 shadow-xs transition-colors"
                                  title="Cobrar el saldo total con Yape"
                                >
                                  <Smartphone className="w-3.5 h-3.5" />
                                  <span>Cobrar Total con Yape</span>
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              };

              if (filteredDailyAccounts.length === 0) {
                return (
                  <div className="bg-white rounded-2xl p-8 text-center border border-stone-200 text-stone-500 text-xs sm:text-sm">
                    No hay pedidos registrados en este filtro o fecha. Presiona "+ Tomar Pedido en Mesa" o "+ Anotar Pedido Diario" para comenzar.
                  </div>
                );
              }

              return (
                <div className="space-y-6">
                  {/* SECCIÓN 1: MENUS POR COBRAR */}
                  {(dailyStatusFilter === 'todos' || dailyStatusFilter === 'pendientes') && (
                    <div className="bg-stone-50/60 rounded-2xl border border-rose-200/80 overflow-hidden shadow-2xs">
                      <button
                        type="button"
                        onClick={() => setIsPorCobrarExpanded(!isPorCobrarExpanded)}
                        className="w-full px-4 py-3.5 bg-gradient-to-r from-rose-50 via-white to-stone-50 border-b border-rose-200 flex items-center justify-between text-left hover:bg-rose-100/40 transition-colors"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className={`p-1 rounded-lg text-rose-700 transition-transform ${isPorCobrarExpanded ? 'rotate-0' : '-rotate-90'}`}>
                            <ChevronDown className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="text-base sm:text-lg font-black text-rose-950 flex items-center gap-1.5">
                                <span>🔴 Menus por cobrar</span>
                              </h3>
                              <span className="px-2 py-0.5 rounded-full text-xs font-black bg-rose-100 text-rose-800 border border-rose-200">
                                {porCobrarAccounts.length} {porCobrarAccounts.length === 1 ? 'cuenta' : 'cuentas'}
                              </span>
                            </div>
                            <p className="text-xs text-stone-500 font-medium">
                              Pedidos del día con saldo pendiente de cobro
                            </p>
                          </div>
                        </div>

                        <div className="text-right">
                          <span className="text-[11px] text-stone-500 font-bold block uppercase tracking-wider">
                            Total Falta Cobrar:
                          </span>
                          <span className="text-base sm:text-lg font-black text-rose-700">
                            {formatCurrency(porCobrarAccounts.reduce((sum, a) => sum + a.saldoPendiente, 0))}
                          </span>
                        </div>
                      </button>

                      {isPorCobrarExpanded && (
                        <div className="p-3 sm:p-4 space-y-3.5">
                          {porCobrarAccounts.length === 0 ? (
                            <div className="bg-white rounded-xl p-6 text-center border border-dashed border-stone-300 text-stone-500 text-xs sm:text-sm">
                              🎉 ¡Al día! No hay pedidos pendientes de cobro para esta fecha.
                            </div>
                          ) : (
                            porCobrarAccounts.map((account) => renderDailyAccountCard(account, false))
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* SECCIÓN 2: MENUS COBRADOS (Ordenados según quién fue el último al que cobraron) */}
                  {(dailyStatusFilter === 'todos' || dailyStatusFilter === 'cobrados') && (
                    <div className="bg-stone-50/60 rounded-2xl border border-emerald-200/80 overflow-hidden shadow-2xs">
                      <button
                        type="button"
                        onClick={() => setIsCobradosExpanded(!isCobradosExpanded)}
                        className="w-full px-4 py-3.5 bg-gradient-to-r from-emerald-50 via-white to-stone-50 border-b border-emerald-200 flex items-center justify-between text-left hover:bg-emerald-100/40 transition-colors"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className={`p-1 rounded-lg text-emerald-700 transition-transform ${isCobradosExpanded ? 'rotate-0' : '-rotate-90'}`}>
                            <ChevronDown className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="text-base sm:text-lg font-black text-emerald-950 flex items-center gap-1.5">
                                <span>✓ Menus cobrados</span>
                              </h3>
                              <span className="px-2 py-0.5 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-200">
                                {cobradosAccounts.length} {cobradosAccounts.length === 1 ? 'cuenta' : 'cuentas'}
                              </span>
                              {cobradosAccounts.filter((a) => !!debeVueltoMap[a.clientId]).length > 0 && (
                                <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-rose-600 text-white shadow-2xs animate-pulse">
                                  ⚠️ {cobradosAccounts.filter((a) => !!debeVueltoMap[a.clientId]).length} con vuelto pendiente
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-stone-500 font-medium">
                              Ordenados según quién fue el último al que cobraron
                            </p>
                          </div>
                        </div>

                        <div className="text-right">
                          <span className="text-[11px] text-stone-500 font-bold block uppercase tracking-wider">
                            Total Cobrado:
                          </span>
                          <span className="text-base sm:text-lg font-black text-emerald-700">
                            {formatCurrency(cobradosAccounts.reduce((sum, a) => sum + a.totalConsumed, 0))}
                          </span>
                        </div>
                      </button>

                      {isCobradosExpanded && (
                        <div className="p-3 sm:p-4 space-y-3.5">
                          {cobradosAccounts.length === 0 ? (
                            <div className="bg-white rounded-xl p-6 text-center border border-dashed border-stone-300 text-stone-500 text-xs sm:text-sm">
                              Aún no se han registrado cobros para esta fecha.
                            </div>
                          ) : (
                            cobradosAccounts.map((account) => renderDailyAccountCard(account, true))
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. TAB: CAJA (Arqueo del Día y Caja de la Semana en el Mismo Apartado)   */}
      {/* ========================================================================= */}
      {activeTab === 'caja' && (
        <div className="space-y-5">
          {/* Sub-header selector: Caja del Día vs Caja de la Semana vs Ambas */}
          <div className="bg-white p-2.5 rounded-2xl border border-stone-200 shadow-xs flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 p-1 bg-stone-100 rounded-xl">
              <button
                type="button"
                onClick={() => setCajaViewMode('dia')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  cajaViewMode === 'dia'
                    ? 'bg-emerald-800 text-white shadow-xs'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                <DollarSign className="w-3.5 h-3.5" />
                <span>Caja del Día</span>
              </button>

              <button
                type="button"
                onClick={() => setCajaViewMode('semana')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  cajaViewMode === 'semana'
                    ? 'bg-emerald-800 text-white shadow-xs'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>Caja de la Semana</span>
              </button>

              <button
                type="button"
                onClick={() => setCajaViewMode('ambas')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  cajaViewMode === 'ambas'
                    ? 'bg-emerald-800 text-white shadow-xs'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                <span>Ver Ambas Cajas</span>
              </button>
            </div>

            <div className="text-xs text-stone-500 font-medium px-2">
              Visualizando ingresos de Mesa, Cuentas Diarias y Abonos Semanales
            </div>
          </div>

          {/* ================= SECCIÓN: CAJA DEL DÍA ================= */}
          {(cajaViewMode === 'dia' || cajaViewMode === 'ambas') && (
            <div className="space-y-4">
              <div className="bg-emerald-900 text-white rounded-2xl p-4 sm:p-5 shadow-md border border-emerald-700 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-5 h-5 text-emerald-300" />
                    <h3 className="text-base sm:text-lg font-black">
                      Arqueo de Caja del Día — {getDayOfWeekName(selectedDate)} {selectedDate}
                    </h3>
                  </div>
                  <p className="text-xs text-emerald-200 mt-0.5">
                    Suma consolidada de mesa + cuentas diarias cobradas + abonos de cuentas semanales.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-xs text-emerald-200">Fecha:</label>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="text-xs font-bold px-2.5 py-1.5 bg-emerald-950 border border-emerald-700 rounded-lg text-white focus:outline-none"
                  />
                </div>
              </div>

              {/* Big Totals Cards - Día */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div className="bg-white rounded-2xl p-4 sm:p-5 border border-stone-200 shadow-xs">
                  <span className="text-xs uppercase font-bold text-stone-500 block">Total Recaudado (Día)</span>
                  <div className="text-2xl sm:text-3xl font-black text-stone-900 mt-1">
                    {formatCurrency(cajaDelDia.totalGeneral)}
                  </div>
                  <p className="text-xs text-stone-500 mt-1">Suma de Efectivo + Yape hoy</p>
                </div>

                <div className="bg-white rounded-2xl p-4 sm:p-5 border border-emerald-300 shadow-xs bg-emerald-50/20">
                  <span className="text-xs uppercase font-bold text-emerald-700 flex items-center gap-1">
                    <DollarSign className="w-4 h-4" />
                    <span>Efectivo en Caja (Día)</span>
                  </span>
                  <div className="text-2xl sm:text-3xl font-black text-emerald-950 mt-1">
                    {formatCurrency(cajaDelDia.totalEfectivo)}
                  </div>
                  <p className="text-xs text-emerald-700 mt-1">Dinero físico a rendir en gaveta</p>
                </div>

                <div className="bg-white rounded-2xl p-4 sm:p-5 border border-purple-300 shadow-xs bg-purple-50/20">
                  <span className="text-xs uppercase font-bold text-purple-700 flex items-center gap-1">
                    <Smartphone className="w-4 h-4" />
                    <span>Yape en Celular (Día)</span>
                  </span>
                  <div className="text-2xl sm:text-3xl font-black text-purple-950 mt-1">
                    {formatCurrency(cajaDelDia.totalYape)}
                  </div>
                  <p className="text-xs text-purple-700 mt-1">Confirmar en aplicación Yape</p>
                </div>
              </div>

              {/* Breakdown by Origin - Día */}
              <div className="bg-white rounded-2xl border border-stone-200 shadow-xs p-4 sm:p-5 space-y-3">
                <h4 className="font-extrabold text-xs sm:text-sm text-stone-900 border-b border-stone-200 pb-2">
                  Desglose del Día por Origen
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* 1. Mesa */}
                  <div className="p-3.5 rounded-xl border border-stone-200 bg-stone-50/60 space-y-1.5">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-xs uppercase text-amber-900 flex items-center gap-1">
                        <Utensils className="w-3.5 h-3.5" />
                        <span>Mesa Salón</span>
                      </span>
                      <span className="font-black text-sm text-stone-900">
                        {formatCurrency(cajaDelDia.mesaTotal)}
                      </span>
                    </div>
                    <div className="text-xs text-stone-600 space-y-0.5">
                      <div className="flex justify-between">
                        <span>Efectivo:</span>
                        <span className="font-semibold text-emerald-800">{formatCurrency(cajaDelDia.mesaCash)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Yape:</span>
                        <span className="font-semibold text-purple-800">{formatCurrency(cajaDelDia.mesaYape)}</span>
                      </div>
                    </div>
                  </div>

                  {/* 2. Cuentas Diarias Cobradas */}
                  <div className="p-3.5 rounded-xl border border-stone-200 bg-stone-50/60 space-y-1.5">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-xs uppercase text-amber-900 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        <span>Cuentas Diarias Cobradas</span>
                      </span>
                      <span className="font-black text-sm text-stone-900">
                        {formatCurrency(cajaDelDia.dailyTotal)}
                      </span>
                    </div>
                    <div className="text-xs text-stone-600 space-y-0.5">
                      <div className="flex justify-between">
                        <span>Efectivo:</span>
                        <span className="font-semibold text-emerald-800">{formatCurrency(cajaDelDia.dailyCash)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Yape:</span>
                        <span className="font-semibold text-purple-800">{formatCurrency(cajaDelDia.dailyYape)}</span>
                      </div>
                    </div>
                  </div>

                  {/* 3. Abonos Semanales */}
                  <div className="p-3.5 rounded-xl border border-stone-200 bg-stone-50/60 space-y-1.5">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-xs uppercase text-amber-900 flex items-center gap-1">
                        <BookOpen className="w-3.5 h-3.5" />
                        <span>Abonos Semanales</span>
                      </span>
                      <span className="font-black text-sm text-stone-900">
                        {formatCurrency(cajaDelDia.abonosTotal)}
                      </span>
                    </div>
                    <div className="text-xs text-stone-600 space-y-0.5">
                      <div className="flex justify-between">
                        <span>Efectivo:</span>
                        <span className="font-semibold text-emerald-800">{formatCurrency(cajaDelDia.abonosCash)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Yape:</span>
                        <span className="font-semibold text-purple-800">{formatCurrency(cajaDelDia.abonosYape)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* LISTA DETALLADA DE COBROS DEL DÍA (AUDITORÍA Y CORRECCIÓN DE CAJA) */}
              {(() => {
                const hasMesaActivity =
                  currentMesaRecord &&
                  (currentMesaRecord.totalAmount > 0 ||
                    currentMesaRecord.menuCompletoCount > 0 ||
                    currentMesaRecord.soloSegundoCount > 0 ||
                    (currentMesaRecord.extras && currentMesaRecord.extras.length > 0));

                const totalCobrosCount =
                  (hasMesaActivity ? 1 : 0) +
                  cajaDelDia.paidDailyConsumptions.length +
                  cajaDelDia.dayPayments.length;

                const showMesa =
                  (cajaListFilter === 'todos' || cajaListFilter === 'mesa') && hasMesaActivity;
                const showDiarias =
                  cajaListFilter === 'todos' || cajaListFilter === 'diarias';
                const showAbonos =
                  cajaListFilter === 'todos' || cajaListFilter === 'abonos';

                const visibleItemsCount =
                  (showMesa ? 1 : 0) +
                  (showDiarias ? cajaDelDia.paidDailyConsumptions.length : 0) +
                  (showAbonos ? cajaDelDia.dayPayments.length : 0);

                return (
                  <div className="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden space-y-3">
                    {/* Header with Title and Filtering */}
                    <div className="p-4 border-b border-stone-200 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-stone-50/60">
                      <div>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-5 h-5 text-emerald-700" />
                          <h4 className="font-extrabold text-sm sm:text-base text-stone-900">
                            Lista de Cobros Registrados en el Día — {getDayOfWeekName(selectedDate)} {selectedDate}
                          </h4>
                        </div>
                      </div>

                      {/* Filter Badges */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setCajaListFilter('todos')}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${
                            cajaListFilter === 'todos'
                              ? 'bg-stone-900 text-white shadow-xs'
                              : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-100'
                          }`}
                        >
                          Todos ({totalCobrosCount})
                        </button>
                        <button
                          type="button"
                          onClick={() => setCajaListFilter('mesa')}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${
                            cajaListFilter === 'mesa'
                              ? 'bg-amber-800 text-white shadow-xs'
                              : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-100'
                          }`}
                        >
                          Mesa ({hasMesaActivity ? 1 : 0})
                        </button>
                        <button
                          type="button"
                          onClick={() => setCajaListFilter('diarias')}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${
                            cajaListFilter === 'diarias'
                              ? 'bg-blue-800 text-white shadow-xs'
                              : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-100'
                          }`}
                        >
                          Diarias ({cajaDelDia.paidDailyConsumptions.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setCajaListFilter('abonos')}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${
                            cajaListFilter === 'abonos'
                              ? 'bg-emerald-800 text-white shadow-xs'
                              : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-100'
                          }`}
                        >
                          Abonos ({cajaDelDia.dayPayments.length})
                        </button>
                      </div>
                    </div>

                    {/* Table / List */}
                    <div className="p-4 pt-0">
                      {visibleItemsCount === 0 ? (
                        <div className="py-8 text-center bg-stone-50 rounded-xl border border-stone-200/80 p-4">
                          <DollarSign className="w-8 h-8 text-stone-300 mx-auto mb-2" />
                          <p className="text-xs font-bold text-stone-700">
                            No hay cobros registrados en esta categoría para la fecha seleccionada ({selectedDate}).
                          </p>
                          <p className="text-[11px] text-stone-400 mt-1">
                            A medida que cobres en Mesa Salón, marques cuentas diarias como pagadas o registres abonos semanales, aparecerán listados aquí para que puedas revisarlos y corregir cualquier error.
                          </p>
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs border-collapse">
                            <thead>
                              <tr className="bg-stone-100/70 border-b border-stone-200 text-stone-600 font-bold uppercase tracking-wider text-[11px]">
                                <th className="py-2.5 px-3">Concepto / Cliente</th>
                                <th className="py-2.5 px-3">Origen</th>
                                <th className="py-2.5 px-3">Método de Pago</th>
                                <th className="py-2.5 px-3 text-right">Monto Cobrado</th>
                                <th className="py-2.5 px-3 text-center">Acciones para Corregir</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-stone-100">
                              {/* 1. MESA SALÓN */}
                              {showMesa && (
                                <tr className="hover:bg-amber-50/40 transition-colors bg-amber-50/15">
                                  <td className="py-3 px-3">
                                    <div className="flex items-center gap-1.5">
                                      <Utensils className="w-4 h-4 text-amber-800" />
                                      <span className="font-extrabold text-stone-900 text-sm">
                                        Mesa Salón (Comensales)
                                      </span>
                                    </div>
                                    <div className="text-[11px] text-stone-600 mt-0.5 space-y-0.5">
                                      <div>
                                        {currentMesaRecord.menuCompletoCount} Menú(s) Completo(s) (S/. 13) + {currentMesaRecord.soloSegundoCount} Segundo(s) Solo(s) (S/. 12)
                                      </div>
                                      {currentMesaRecord.extras && currentMesaRecord.extras.length > 0 && (
                                        <div className="text-amber-900 font-medium">
                                          + Extras: {currentMesaRecord.extras.map((e) => `${e.quantity}x ${e.name} (S/. ${e.totalPrice.toFixed(2)})`).join(', ')}
                                        </div>
                                      )}
                                      {currentMesaRecord.notes && (
                                        <div className="text-stone-500 italic">
                                          "{currentMesaRecord.notes}"
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                  <td className="py-3 px-3 whitespace-nowrap">
                                    <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-200">
                                      Mesa Salón
                                    </span>
                                  </td>
                                  <td className="py-3 px-3 whitespace-nowrap">
                                    <div className="flex flex-col gap-1 text-[11px]">
                                      {currentMesaRecord.efectivoAmount > 0 && (
                                        <span className="bg-emerald-100 text-emerald-900 border border-emerald-200 px-2 py-0.5 rounded font-bold">
                                          Efectivo: {formatCurrency(currentMesaRecord.efectivoAmount)}
                                        </span>
                                      )}
                                      {currentMesaRecord.yapeAmount > 0 && (
                                        <span className="bg-purple-100 text-purple-900 border border-purple-200 px-2 py-0.5 rounded font-bold">
                                          Yape: {formatCurrency(currentMesaRecord.yapeAmount)}
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="py-3 px-3 text-right whitespace-nowrap">
                                    <span className="font-black text-sm sm:text-base text-stone-900">
                                      {formatCurrency(currentMesaRecord.totalAmount)}
                                    </span>
                                  </td>
                                  <td className="py-3 px-3 text-center whitespace-nowrap">
                                    <div className="flex items-center justify-center gap-1.5">
                                      <button
                                        type="button"
                                        onClick={handleClearMesaRecord}
                                        className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl font-bold text-xs flex items-center gap-1 transition-colors shadow-xs"
                                        title="Eliminar o anular el cobro de mesa de la caja de hoy"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                        <span>Anular Cobro</span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setActiveTab('diario')}
                                        className="px-2 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 border border-stone-300 rounded-xl font-bold text-xs flex items-center gap-1 transition-colors"
                                        title="Ir a modificar cantidades o platos de Mesa"
                                      >
                                        <Edit3 className="w-3.5 h-3.5" />
                                        <span className="hidden sm:inline">Modificar</span>
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              )}

                              {/* 2. CUENTAS DIARIAS COBRADAS */}
                              {showDiarias &&
                                cajaDelDia.paidDailyConsumptions.map((item) => (
                                  <tr key={item.id} className="hover:bg-blue-50/30 transition-colors">
                                    <td className="py-3 px-3">
                                      <div className="flex items-center gap-2">
                                        <span className="font-extrabold text-stone-900 text-sm">
                                          {item.clientName}
                                        </span>
                                        <span
                                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                                            item.piso === 'Calle'
                                              ? 'bg-blue-100 text-blue-900 border-blue-200'
                                              : 'bg-stone-100 text-stone-800 border-stone-200'
                                          }`}
                                        >
                                          {item.piso === 'Calle' ? '🚶 Calle' : item.piso}
                                        </span>
                                      </div>
                                      <div className="text-[11px] text-stone-600 mt-0.5 space-y-0.5">
                                        {item.lunches.length > 0 && (
                                          <div>
                                            {item.lunches
                                              .map(
                                                (l) =>
                                                  `${l.quantity}x ${
                                                    l.menuType === 'menu_completo'
                                                      ? 'Menú Completo'
                                                      : 'Solo Segundo'
                                                  }`
                                              )
                                              .join(', ')}
                                          </div>
                                        )}
                                        {item.extras && item.extras.length > 0 && (
                                          <div className="text-stone-700">
                                            + Extras: {item.extras.map((e) => `${e.quantity}x ${e.name}`).join(', ')}
                                          </div>
                                        )}
                                        {item.paymentDate && item.paymentDate !== item.date && (
                                          <span className="text-[10px] bg-amber-50 text-amber-800 font-semibold px-1.5 py-0.5 rounded border border-amber-200 inline-block mt-0.5">
                                            Pedido original del {item.dayOfWeek} {item.date}
                                          </span>
                                        )}
                                      </div>
                                    </td>
                                    <td className="py-3 px-3 whitespace-nowrap">
                                      <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-blue-100 text-blue-900 border border-blue-200">
                                        Cuenta Diaria
                                      </span>
                                    </td>
                                    <td className="py-3 px-3 whitespace-nowrap">
                                      <span
                                        className={`px-2 py-0.5 rounded text-[11px] font-bold border ${
                                          item.paymentMethod === 'yape'
                                            ? 'bg-purple-100 text-purple-900 border-purple-200'
                                            : 'bg-emerald-100 text-emerald-900 border-emerald-200'
                                        }`}
                                      >
                                        {item.paymentMethod === 'yape' ? '🟣 Yape' : '💵 Efectivo'}
                                      </span>
                                    </td>
                                    <td className="py-3 px-3 text-right whitespace-nowrap">
                                      <span className="font-black text-sm sm:text-base text-stone-900">
                                        {formatCurrency(item.total)}
                                      </span>
                                    </td>
                                    <td className="py-3 px-3 text-center whitespace-nowrap">
                                      <div className="flex items-center justify-center gap-1.5">
                                        <button
                                          type="button"
                                          onClick={() => handleMarkDailyPending(item.id)}
                                          className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-xl font-bold text-xs flex items-center gap-1 transition-colors shadow-xs"
                                          title="Sacar de la caja del día y regresar a estado pendiente"
                                        >
                                          <RotateCcw className="w-3.5 h-3.5 text-amber-700" />
                                          <span>Deshacer Cobro</span>
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleDeleteConsumption(item.id)}
                                          className="p-1.5 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                          title="Eliminar este pedido por completo"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                ))}

                              {/* 3. ABONOS SEMANALES */}
                              {showAbonos &&
                                cajaDelDia.dayPayments.map((p) => (
                                  <tr key={p.id} className="hover:bg-emerald-50/30 transition-colors">
                                    <td className="py-3 px-3">
                                      <div className="font-extrabold text-stone-900 text-sm">
                                        {p.clientName}
                                      </div>
                                      <div className="text-[11px] text-stone-500 mt-0.5">
                                        {isPaymentDp(p) ? (
                                          <span className="font-semibold text-amber-900">
                                            Liquidación de Deuda Pasada (DP)
                                          </span>
                                        ) : (
                                          'Abono a cuenta semanal'
                                        )}
                                        {p.notes && <span className="italic"> — "{p.notes}"</span>}
                                        {p.timestamp && (
                                          <span className="text-[10px] text-stone-400 ml-1">
                                            ({new Date(p.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})
                                          </span>
                                        )}
                                      </div>
                                    </td>
                                    <td className="py-3 px-3 whitespace-nowrap">
                                      {isPaymentDp(p) ? (
                                        <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                                          Canceló DP
                                        </span>
                                      ) : (
                                        <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-200">
                                          Abono Semanal
                                        </span>
                                      )}
                                    </td>
                                    <td className="py-3 px-3 whitespace-nowrap">
                                      <span
                                        className={`px-2 py-0.5 rounded text-[11px] font-bold border ${
                                          p.method === 'yape'
                                            ? 'bg-purple-100 text-purple-900 border-purple-200'
                                            : 'bg-emerald-100 text-emerald-900 border-emerald-200'
                                        }`}
                                      >
                                        {p.method === 'yape' ? '🟣 Yape' : '💵 Efectivo'}
                                      </span>
                                    </td>
                                    <td className="py-3 px-3 text-right whitespace-nowrap">
                                      <span className="font-black text-sm sm:text-base text-emerald-900">
                                        {formatCurrency(p.amount)}
                                      </span>
                                    </td>
                                    <td className="py-3 px-3 text-center whitespace-nowrap">
                                      <button
                                        type="button"
                                        onClick={() => handleDeletePayment(p.id)}
                                        className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 rounded-xl font-bold text-xs flex items-center gap-1 transition-colors shadow-xs"
                                        title="Eliminar este abono y descontarlo de la caja de hoy"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                        <span>Eliminar Abono</span>
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* ================= SECCIÓN: CAJA DE LA SEMANA ================= */}
          {(cajaViewMode === 'semana' || cajaViewMode === 'ambas') && (
            <div className="space-y-4">
              <div className="bg-teal-900 text-white rounded-2xl p-4 sm:p-5 shadow-md border border-teal-700 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-teal-300" />
                    <h3 className="text-base sm:text-lg font-black">
                      Arqueo de Caja de la Semana — {currentWeekDays[0].display} al {currentWeekDays[5].display}
                    </h3>
                  </div>
                  <p className="text-xs text-teal-200 mt-0.5">
                    Control acumulado de lunes a sábado de Mesa, Cuentas Diarias cobradas y Abonos Semanales.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setWeekOffset((prev) => prev - 1)}
                    className="p-1.5 bg-teal-950 border border-teal-700 rounded-lg hover:bg-teal-800 text-teal-200 shadow-xs"
                    title="Semana anterior"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-xs font-bold text-teal-100">
                    Semana
                  </span>
                  <button
                    type="button"
                    onClick={() => setWeekOffset((prev) => prev + 1)}
                    className="p-1.5 bg-teal-950 border border-teal-700 rounded-lg hover:bg-teal-800 text-teal-200 shadow-xs"
                    title="Semana siguiente"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  {weekOffset !== 0 && (
                    <button
                      type="button"
                      onClick={() => setWeekOffset(0)}
                      className="text-xs font-bold text-teal-100 bg-teal-800 hover:bg-teal-700 px-2.5 py-1 rounded-lg transition-colors ml-1"
                    >
                      Esta semana
                    </button>
                  )}
                </div>
              </div>

              {/* Big Totals Cards - Semana */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div className="bg-white rounded-2xl p-4 sm:p-5 border border-stone-200 shadow-xs">
                  <span className="text-xs uppercase font-bold text-stone-500 block">Total Recaudado (Semana)</span>
                  <div className="text-2xl sm:text-3xl font-black text-stone-900 mt-1">
                    {formatCurrency(cajaSemanal.totalGeneral)}
                  </div>
                  <p className="text-xs text-stone-500 mt-1">Total ingresado en toda la semana</p>
                </div>

                <div className="bg-white rounded-2xl p-4 sm:p-5 border border-emerald-300 shadow-xs bg-emerald-50/20">
                  <span className="text-xs uppercase font-bold text-emerald-700 flex items-center gap-1">
                    <DollarSign className="w-4 h-4" />
                    <span>Efectivo Total (Semana)</span>
                  </span>
                  <div className="text-2xl sm:text-3xl font-black text-emerald-950 mt-1">
                    {formatCurrency(cajaSemanal.totalEfectivo)}
                  </div>
                  <p className="text-xs text-emerald-700 mt-1">Dinero físico a rendir en gaveta</p>
                </div>

                <div className="bg-white rounded-2xl p-4 sm:p-5 border border-purple-300 shadow-xs bg-purple-50/20">
                  <span className="text-xs uppercase font-bold text-purple-700 flex items-center gap-1">
                    <Smartphone className="w-4 h-4" />
                    <span>Yape Total (Semana)</span>
                  </span>
                  <div className="text-2xl sm:text-3xl font-black text-purple-950 mt-1">
                    {formatCurrency(cajaSemanal.totalYape)}
                  </div>
                  <p className="text-xs text-purple-700 mt-1">Total transferencias recibidas por Yape</p>
                </div>
              </div>

              {/* Tabla Detallada Día por Día de la Semana */}
              <div className="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden">
                <div className="p-4 border-b border-stone-200 flex items-center justify-between">
                  <h4 className="font-extrabold text-xs sm:text-sm text-stone-900">
                    Detalle Diario de la Semana (Lunes a Sábado)
                  </h4>
                  <span className="text-xs text-stone-500 font-medium">
                    Total Semana: <strong className="text-stone-900">{formatCurrency(cajaSemanal.totalGeneral)}</strong>
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-stone-50 text-stone-600 font-bold border-b border-stone-200 uppercase text-[10px]">
                      <tr>
                        <th className="py-2.5 px-3">Día</th>
                        <th className="py-2.5 px-3">Fecha</th>
                        <th className="py-2.5 px-3 text-right">Mesa</th>
                        <th className="py-2.5 px-3 text-right">Diarias Cobradas</th>
                        <th className="py-2.5 px-3 text-right">Abonos Semanales</th>
                        <th className="py-2.5 px-3 text-right text-emerald-800">Efectivo</th>
                        <th className="py-2.5 px-3 text-right text-purple-800">Yape</th>
                        <th className="py-2.5 px-3 text-right font-black text-stone-900">Total Día</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {cajaSemanal.daysBreakdown.map((row) => {
                        const isToday = row.dateStr === today;
                        return (
                          <tr
                            key={row.dateStr}
                            className={`hover:bg-stone-50/60 transition-colors ${
                              isToday ? 'bg-amber-50/40 font-semibold' : ''
                            }`}
                          >
                            <td className="py-2.5 px-3 font-bold text-stone-800">
                              {row.dayName} {isToday && <span className="text-[10px] text-amber-700 bg-amber-100 px-1 rounded ml-1">Hoy</span>}
                            </td>
                            <td className="py-2.5 px-3 text-stone-500">{row.dateStr}</td>
                            <td className="py-2.5 px-3 text-right text-stone-700 font-medium">{formatCurrency(row.mesaTotal)}</td>
                            <td className="py-2.5 px-3 text-right text-stone-700 font-medium">{formatCurrency(row.dailyTotal)}</td>
                            <td className="py-2.5 px-3 text-right text-stone-700 font-medium">{formatCurrency(row.abonosTotal)}</td>
                            <td className="py-2.5 px-3 text-right text-emerald-800 font-bold">{formatCurrency(row.efectivo)}</td>
                            <td className="py-2.5 px-3 text-right text-purple-800 font-bold">{formatCurrency(row.yape)}</td>
                            <td className="py-2.5 px-3 text-right font-black text-stone-900 text-sm">
                              {formatCurrency(row.total)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-stone-100 font-black border-t-2 border-stone-300 text-stone-900">
                      <tr>
                        <td colSpan={2} className="py-3 px-3 uppercase text-[11px] tracking-wider">
                          TOTAL SEMANA
                        </td>
                        <td className="py-3 px-3 text-right">{formatCurrency(cajaSemanal.totalMesa)}</td>
                        <td className="py-3 px-3 text-right">{formatCurrency(cajaSemanal.totalDiarias)}</td>
                        <td className="py-3 px-3 text-right">{formatCurrency(cajaSemanal.totalAbonos)}</td>
                        <td className="py-3 px-3 text-right text-emerald-800">{formatCurrency(cajaSemanal.totalEfectivo)}</td>
                        <td className="py-3 px-3 text-right text-purple-800">{formatCurrency(cajaSemanal.totalYape)}</td>
                        <td className="py-3 px-3 text-right text-base text-emerald-950 font-black">
                          {formatCurrency(cajaSemanal.totalGeneral)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. TAB: COBRO A FIN DE MES (Liquidación por cliente, estados de cuenta)   */}
      {/* ========================================================================= */}
      {activeTab === 'cobro_mensual' && (
        <div className="space-y-4">
          <div className="bg-stone-900 text-white rounded-2xl p-4 sm:p-5 shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Receipt className="w-6 h-6 text-amber-400" />
                <h3 className="text-lg sm:text-xl font-black">
                  Liquidación y Cobro a Fin de Mes
                </h3>
              </div>
              <p className="text-xs sm:text-sm text-stone-300 mt-1">
                Genera el cobro consolidado mensual con consumos, abonos recibidos y saldo pendiente para cada cliente o tienda.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs text-stone-300">Mes a liquidar:</label>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="text-xs font-bold px-3 py-1.5 bg-stone-800 border border-stone-700 rounded-lg text-white focus:outline-none"
              />
            </div>
          </div>

          {/* Subview Selector: Cuentas Semanales en Lista vs Totales Cobrados por Día */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-stone-200 shadow-xs">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCobroMensualSubView('semanales_lista')}
                className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 transition-all ${
                  cobroMensualSubView === 'semanales_lista'
                    ? 'bg-amber-800 text-white shadow-xs'
                    : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                }`}
              >
                <Users className="w-4 h-4" />
                <span>Liquidación Semanales (Lista)</span>
              </button>

              <button
                type="button"
                onClick={() => setCobroMensualSubView('totales_diarios')}
                className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 transition-all ${
                  cobroMensualSubView === 'totales_diarios'
                    ? 'bg-amber-800 text-white shadow-xs'
                    : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                }`}
              >
                <Calendar className="w-4 h-4" />
                <span>Total Cobrado por Día (Mes)</span>
              </button>
            </div>

            <div className="text-xs text-stone-500 font-medium">
              {cobroMensualSubView === 'semanales_lista'
                ? `Mostrando únicamente clientes semanales para liquidación`
                : `Resumen global diario (sin mostrar nombres de clientes diarios)`}
            </div>
          </div>

          {/* VISTA 1: LISTA DE LIQUIDACIÓN DE CLIENTES SEMANALES (SIN CUADROS, EN FORMATO LISTA) */}
          {cobroMensualSubView === 'semanales_lista' && (
            <div className="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden">
              <div className="p-4 border-b border-stone-200 flex items-center justify-between">
                <div>
                  <h4 className="font-extrabold text-stone-900 text-sm sm:text-base">
                    Cuentas Semanales a Liquidar — {selectedMonth}
                  </h4>
                  <p className="text-xs text-stone-500">
                    Lista ordenada de cobro de clientes semanales. Los que pagan diario no figuran aquí.
                  </p>
                </div>
                <div className="text-xs font-bold text-stone-600">
                  Total clientes semanales: {filteredClients.filter((c) => c.accountType === 'semanal').length}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-stone-50 border-b border-stone-200 text-stone-600 font-bold uppercase tracking-wider text-[11px]">
                      <th className="py-3 px-4">Cliente / Puesto</th>
                      <th className="py-3 px-3">Ubicación</th>
                      <th className="py-3 px-3 text-center">Pedidos Mes</th>
                      <th className="py-3 px-3 text-right">Total Consumido</th>
                      <th className="py-3 px-3 text-right">Abonos Recibidos</th>
                      <th className="py-3 px-3 text-right">Saldo Pendiente</th>
                      <th className="py-3 px-4 text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {filteredClients
                      .filter((c) => c.accountType === 'semanal')
                      .map((client) => {
                        const clientConsumptions = consumptions.filter(
                          (c) => c.clientId === client.id && c.date.startsWith(selectedMonth)
                        );
                        const totalConsumed = clientConsumptions.reduce((s, c) => s + c.total, 0);

                        const clientPayments = payments.filter(
                          (p) => p.clientId === client.id && p.date.startsWith(selectedMonth)
                        );
                        const totalPaid = clientPayments.reduce((s, p) => s + p.amount, 0);
                        const balance = totalConsumed - totalPaid;

                        return (
                          <tr key={client.id} className="hover:bg-amber-50/30 transition-colors">
                            <td className="py-3 px-4">
                              <div className="font-extrabold text-stone-900 text-sm">
                                {client.name}
                              </div>
                              {client.phone && (
                                <span className="text-[11px] text-stone-500">
                                  📞 {formatPhoneDisplay(client.phone)}
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-3 whitespace-nowrap">
                              <span
                                className={`px-2 py-0.5 rounded text-[11px] font-bold border ${
                                  client.piso === 'Calle'
                                    ? 'bg-blue-100 text-blue-900 border-blue-200'
                                    : 'bg-stone-100 text-stone-800 border-stone-200'
                                }`}
                              >
                                {client.piso === 'Calle' ? '🚶 Calle' : client.piso}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-center font-bold text-stone-700">
                              {clientConsumptions.length}
                            </td>
                            <td className="py-3 px-3 text-right font-black text-stone-900">
                              {formatCurrency(totalConsumed)}
                            </td>
                            <td className="py-3 px-3 text-right font-bold text-emerald-800">
                              {formatCurrency(totalPaid)}
                            </td>
                            <td className="py-3 px-3 text-right whitespace-nowrap">
                              <span
                                className={`text-sm font-black px-2 py-0.5 rounded-lg ${
                                  balance > 0
                                    ? 'bg-rose-100 text-rose-800'
                                    : 'bg-emerald-100 text-emerald-800'
                                }`}
                              >
                                {formatCurrency(Math.max(0, balance))}
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex items-center justify-center gap-1.5 whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={() => handleOpenPaymentModal(client)}
                                  className="py-1 px-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg font-bold text-[11px] shadow-xs flex items-center gap-1 transition-colors"
                                  title="Abonar a esta cuenta"
                                >
                                  <DollarSign className="w-3 h-3" />
                                  <span>+ Abono</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => setStatementClient(client)}
                                  className="py-1 px-2.5 bg-stone-800 hover:bg-stone-900 text-white rounded-lg font-bold text-[11px] transition-colors"
                                  title="Ver detalle del estado de cuenta"
                                >
                                  Estado
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleSendWhatsApp(client, selectedMonth)}
                                  className="p-1.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 rounded-lg transition-colors"
                                  title="Enviar detalle a WhatsApp (+51)"
                                >
                                  <Share2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* VISTA 2: TOTAL COBRADO POR DÍA EN EL MES (SIN MOSTRAR PERSONAS DIARIAS) */}
          {cobroMensualSubView === 'totales_diarios' && (
            <div className="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden space-y-4">
              <div className="p-4 border-b border-stone-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h4 className="font-extrabold text-stone-900 text-sm sm:text-base flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-amber-700" />
                    <span>Total Cobrado Cada Día en el Mes ({selectedMonth})</span>
                  </h4>
                  <p className="text-xs text-stone-500">
                    Muestra el total recaudado por día (Mesa + Cuentas Diarias cobradas) sin listar nombres de personas diarias.
                  </p>
                </div>

                <div className="text-right">
                  <span className="text-[11px] uppercase font-bold text-stone-500 block">Total Recaudado en el Mes:</span>
                  <span className="text-base sm:text-lg font-black text-amber-950">
                    {formatCurrency(daysInSelectedMonth.reduce((s, d) => s + d.totalDia, 0))}
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto px-4 pb-4">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-stone-100 border-b border-stone-200 text-stone-700 font-bold uppercase tracking-wider text-[11px]">
                      <th className="py-2.5 px-3">Fecha y Día</th>
                      <th className="py-2.5 px-3 text-right">Cobrado en Mesa</th>
                      <th className="py-2.5 px-3 text-right">Cuentas Diarias</th>
                      <th className="py-2.5 px-3 text-right text-stone-900">Total del Día</th>
                      <th className="py-2.5 px-3 text-right text-emerald-800">Efectivo</th>
                      <th className="py-2.5 px-3 text-right text-purple-800">Yape</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {daysInSelectedMonth.map((row) => (
                      <tr
                        key={row.date}
                        className={`hover:bg-amber-50/40 transition-colors ${
                          !row.hasActivity ? 'opacity-40' : ''
                        }`}
                      >
                        <td className="py-2.5 px-3 font-mono font-bold text-stone-800 whitespace-nowrap">
                          {row.dayOfWeek} {row.date.substring(8, 10)}/{row.date.substring(5, 7)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-medium text-stone-800">
                          {formatCurrency(row.mesaTotal)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-medium text-stone-800">
                          {formatCurrency(row.dailyTotal)}
                          {row.dailyCount > 0 && (
                            <span className="text-[10px] text-stone-500 ml-1">
                              ({row.dailyCount} cobros)
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-black text-stone-900 text-sm">
                          {formatCurrency(row.totalDia)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-emerald-800">
                          {formatCurrency(row.totalCash)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-purple-800">
                          {formatCurrency(row.totalYape)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-stone-200 border-t-2 border-stone-400 font-black text-stone-950">
                      <td className="py-3 px-3 uppercase">Total Acumulado del Mes:</td>
                      <td className="py-3 px-3 text-right">
                        {formatCurrency(daysInSelectedMonth.reduce((s, d) => s + d.mesaTotal, 0))}
                      </td>
                      <td className="py-3 px-3 text-right">
                        {formatCurrency(daysInSelectedMonth.reduce((s, d) => s + d.dailyTotal, 0))}
                      </td>
                      <td className="py-3 px-3 text-right text-base text-amber-950">
                        {formatCurrency(daysInSelectedMonth.reduce((s, d) => s + d.totalDia, 0))}
                      </td>
                      <td className="py-3 px-3 text-right text-emerald-900">
                        {formatCurrency(daysInSelectedMonth.reduce((s, d) => s + d.totalCash, 0))}
                      </td>
                      <td className="py-3 px-3 text-right text-purple-900">
                        {formatCurrency(daysInSelectedMonth.reduce((s, d) => s + d.totalYape, 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: ANOTAR CONSUMO (Con botones para Mesa vs Tienda y Menú Completo vs Solo Segundo) */}
      {/* ========================================================================= */}
      {showAddConsumptionModal && consumptionDraft && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-stone-200 overflow-hidden my-auto animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="bg-amber-800 text-white p-4 flex items-center justify-between">
              <div>
                <span className="text-xs text-amber-200 uppercase font-bold tracking-wider">
                  {consumptionDraft.accountType === 'semanal'
                    ? `${consumptionDraft.piso} • Cuenta Semanal`
                    : 'Cuenta Diaria (Tienda / Salón / Calle)'}
                </span>
                <h3 className="font-black text-base sm:text-lg">
                  {consumptionDraft.id
                    ? `Editar Pedido: ${consumptionDraft.clientName}`
                    : consumptionDraft.accountType === 'diaria' && !consumptionDraft.clientName
                    ? 'Anotar Nuevo Pedido Diario'
                    : `Anotar Pedido: ${consumptionDraft.clientName}`}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowAddConsumptionModal(false);
                  setConsumptionDraft(null);
                }}
                className="text-amber-200 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSaveConsumption} className="p-4 sm:p-5 space-y-4 max-h-[80vh] overflow-y-auto">
              {/* ASIGNACIÓN DE PERSONA O PUESTO (CUENTAS DIARIAS) */}
              {consumptionDraft.accountType === 'diaria' && (() => {
                const selectedOrderClient = clients.find((c) => c.id === consumptionDraft.clientId);
                return (
                  <div className="p-3.5 bg-amber-50/90 rounded-2xl border border-amber-300 space-y-3 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-black text-amber-950 uppercase tracking-wide flex items-center gap-1.5">
                        <UserPlus className="w-4 h-4 text-amber-800" />
                        <span>Asignar a Persona o Puesto:</span>
                      </label>
                      <span className="text-[10px] font-bold px-2 py-0.5 bg-amber-200 text-amber-950 rounded-md">
                        Cuenta Diaria
                      </span>
                    </div>

                    {/* Cliente Asignado O Buscador */}
                    {selectedOrderClient ? (
                      <div className="p-3 bg-white border-2 border-emerald-500 rounded-xl flex items-center justify-between shadow-2xs">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-xs">
                            ✓
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-extrabold text-xs text-stone-900">
                                {selectedOrderClient.name}
                              </span>
                              <span className="text-[10px] font-bold px-1.5 py-0.5 bg-amber-100 text-amber-900 rounded">
                                📍 {selectedOrderClient.piso}
                              </span>
                              <span className="text-[10px] font-bold px-1.5 py-0.5 bg-stone-100 text-stone-700 rounded">
                                {selectedOrderClient.accountType === 'semanal' ? 'Cuenta Semanal' : 'Cuenta Diaria'}
                              </span>
                            </div>
                            {selectedOrderClient.phone && (
                              <span className="text-[11px] text-stone-500 flex items-center gap-1 mt-0.5">
                                📱 {formatPhoneDisplay(selectedOrderClient.phone)}
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setConsumptionDraft({
                              ...consumptionDraft,
                              clientId: '',
                            });
                          }}
                          className="text-xs text-amber-900 hover:text-amber-950 font-bold underline px-2 py-1"
                        >
                          Cambiar
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div>
                          <label className="text-[11px] font-bold text-stone-700 block mb-1">
                            Buscar o escribir nombre del cliente / puesto: <span className="text-rose-600">*</span>
                          </label>
                          <div className="relative">
                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                            <input
                              type="text"
                              required
                              placeholder="Escribe para buscar entre tus clientes (ej. Juana, Pedro, Puesto 12)..."
                              value={consumptionDraft.clientName}
                              onChange={(e) =>
                                setConsumptionDraft({
                                  ...consumptionDraft,
                                  clientName: e.target.value,
                                  clientId: '',
                                })
                              }
                              className="w-full text-xs font-bold pl-9 pr-3 py-2 bg-white border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500"
                            />
                          </div>
                        </div>

                        {/* Lista desplegable de clientes coincidentes (solo en lista vertical) */}
                        {matchingClientsForOrder.length > 0 && (
                          <div className="space-y-1">
                            <span className="text-[10px] font-black uppercase text-amber-900 tracking-wider">
                              Clientes encontrados ({matchingClientsForOrder.length}) — Haz clic para asignar:
                            </span>
                            <div className="divide-y divide-stone-100 border border-amber-200 rounded-xl bg-white shadow-md max-h-48 overflow-y-auto">
                              {matchingClientsForOrder.map((client) => (
                                <button
                                  key={client.id}
                                  type="button"
                                  onClick={() => {
                                    setConsumptionDraft({
                                      ...consumptionDraft,
                                      clientId: client.id,
                                      clientName: client.name,
                                      piso: client.piso,
                                      phone: client.phone || '',
                                    });
                                  }}
                                  className="w-full text-left p-2.5 hover:bg-amber-50/90 flex items-center justify-between gap-2 transition-colors group cursor-pointer"
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="w-6 h-6 rounded-lg bg-amber-100 text-amber-900 text-xs font-bold flex items-center justify-center shrink-0">
                                      {client.name.substring(0, 1).toUpperCase()}
                                    </span>
                                    <div className="truncate">
                                      <span className="font-extrabold text-xs text-stone-900 group-hover:text-amber-950 block truncate">
                                        {client.name}
                                      </span>
                                      <span className="text-[10px] text-stone-500 font-medium">
                                        📍 {client.piso} • {client.accountType === 'semanal' ? 'Cuenta Semanal' : 'Cuenta Diaria'}
                                        {client.phone ? ` • 📱 ${formatPhoneDisplay(client.phone)}` : ''}
                                      </span>
                                    </div>
                                  </div>
                                  <span className="text-[10px] font-black bg-amber-100 text-amber-900 px-2 py-1 rounded-md shrink-0 group-hover:bg-amber-800 group-hover:text-white transition-colors">
                                    Asignar
                                  </span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Mensaje cuando no hay coincidencias y ya escribió algo */}
                        {consumptionDraft.clientName.trim().length > 1 && matchingClientsForOrder.length === 0 && (
                          <div className="p-2.5 bg-amber-100/60 border border-amber-200 rounded-xl text-xs text-amber-950 flex items-start gap-2">
                            <UserPlus className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                            <div className="space-y-0.5">
                              <p className="font-bold text-[11px]">
                                No se encontró ningún cliente existente similar a &quot;{consumptionDraft.clientName.trim()}&quot;.
                              </p>
                              <p className="text-[10px] text-stone-600">
                                Al guardar este pedido, se creará como un <strong>nuevo cliente</strong> con la ubicación y datos indicados abajo.
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Piso y Teléfono */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[11px] font-bold text-stone-600 block mb-1">
                          Piso / Ubicación:
                        </label>
                        <select
                          value={consumptionDraft.piso}
                          onChange={(e) =>
                            setConsumptionDraft({
                              ...consumptionDraft,
                              piso: e.target.value,
                            })
                          }
                          className="w-full text-xs font-semibold px-2.5 py-1.5 bg-white border border-stone-300 rounded-xl focus:outline-none"
                        >
                          <option value="1ro">🏢 1ro (1er Piso)</option>
                          <option value="2do">🏢 2do (2do Piso)</option>
                          <option value="3ro">🏢 3ro (3er Piso)</option>
                          <option value="4to">🏢 4to (4to Piso)</option>
                          <option value="Calle">🚶 Calle (Exterior / Envío)</option>
                          {pisosList
                            .filter((p) => !['Calle', '1ro', '2do', '3ro', '4to'].includes(p))
                            .map((p) => (
                              <option key={p} value={p}>{p}</option>
                            ))}
                        </select>
                      </div>

                      <div>
                        <label className="text-[11px] font-bold text-stone-600 block mb-1">
                          Celular / WhatsApp (opcional):
                        </label>
                        <input
                          type="text"
                          placeholder="Ej. 987654321"
                          value={consumptionDraft.phone || ''}
                          onChange={(e) =>
                            setConsumptionDraft({
                              ...consumptionDraft,
                              phone: e.target.value,
                            })
                          }
                          className="w-full text-xs font-semibold px-2.5 py-1.5 bg-white border border-stone-300 rounded-xl focus:outline-none"
                        />
                      </div>
                    </div>

                    <p className="text-[10px] text-amber-900 font-medium">
                      ℹ️ Esta persona se guardará en <strong>Cuentas Diarias</strong> al momento de anotar el pedido (no irá a cuentas semanales).
                    </p>
                  </div>
                );
              })()}
              {/* Date selection */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-stone-600 block mb-1">Fecha:</label>
                  <input
                    type="date"
                    value={consumptionDraft.date}
                    onChange={(e) => {
                      const d = e.target.value;
                      setConsumptionDraft({
                        ...consumptionDraft,
                        date: d,
                        dayOfWeek: getDayOfWeekName(d),
                      });
                    }}
                    className="w-full text-xs font-bold px-3 py-2 border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-stone-600 block mb-1">Día:</label>
                  <div className="text-xs font-black px-3 py-2 bg-stone-100 border border-stone-200 rounded-xl text-amber-900">
                    {consumptionDraft.dayOfWeek}
                  </div>
                </div>
              </div>

              {/* 1. SELECCIÓN DE ATENCIÓN: MESA O TIENDA (Botones de Selección) */}
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-stone-600 block mb-1.5">
                  Lugar de Consumo (Tarifa):
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setConsumptionDraft({ ...consumptionDraft, locationType: 'mesa' })}
                    className={`p-3 rounded-xl border text-center font-bold text-xs flex flex-col items-center justify-center gap-1 transition-all ${
                      consumptionDraft.locationType === 'mesa'
                        ? 'border-amber-600 bg-amber-50 text-amber-950 ring-2 ring-amber-500/40 shadow-xs'
                        : 'border-stone-200 text-stone-700 hover:bg-stone-50'
                    }`}
                  >
                    <span className="text-sm font-extrabold flex items-center gap-1.5">
                      🍽️ Mesa
                    </span>
                    <span className="text-[11px] font-medium text-amber-800">
                      Completo: S/ 13.00 • Solo: S/ 12.00
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setConsumptionDraft({ ...consumptionDraft, locationType: 'tienda' })}
                    className={`p-3 rounded-xl border text-center font-bold text-xs flex flex-col items-center justify-center gap-1 transition-all ${
                      consumptionDraft.locationType === 'tienda'
                        ? 'border-amber-600 bg-amber-50 text-amber-950 ring-2 ring-amber-500/40 shadow-xs'
                        : 'border-stone-200 text-stone-700 hover:bg-stone-50'
                    }`}
                  >
                    <span className="text-sm font-extrabold flex items-center gap-1.5">
                      🏪 Tienda
                    </span>
                    <span className="text-[11px] font-medium text-amber-800">
                      Completo: S/ 12.00 • Solo: S/ 11.00
                    </span>
                  </button>
                </div>
              </div>

              {/* 2. SELECCIÓN DE PLATOS: MENÚ COMPLETO Y SEGUNDO SOLO (Cantidades separadas) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black uppercase tracking-wider text-stone-700">
                    Almuerzos a Registrar:
                  </label>
                  <span className="text-[11px] text-stone-500 font-medium">
                    Puedes agregar completos y/o segundo solos
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {/* Tarjeta Menú Completo */}
                  <div className={`p-3 rounded-2xl border transition-all ${
                    (consumptionDraft.completoQuantity || 0) > 0
                      ? 'bg-amber-50/80 border-amber-500 ring-2 ring-amber-400/40 shadow-xs'
                      : 'bg-white border-stone-200'
                  }`}>
                    <div className="flex items-start justify-between gap-1 mb-2">
                      <div>
                        <span className="text-xs sm:text-sm font-black text-stone-900 flex items-center gap-1">
                          <span>🍽️</span>
                          <span>Menú Completo</span>
                        </span>
                        <span className="text-[10px] text-stone-500 block">
                          Segundo con sopa/entrada
                        </span>
                      </div>
                      <span className="text-xs font-black text-amber-900 bg-amber-100/80 px-2 py-0.5 rounded-lg">
                        {formatCurrency(BASE_PRICES[consumptionDraft.locationType].menu_completo)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-stone-100">
                      <div className="flex items-center">
                        <button
                          type="button"
                          onClick={() => {
                            const newQty = Math.max(0, (consumptionDraft.completoQuantity || 0) - 1);
                            setConsumptionDraft({
                              ...consumptionDraft,
                              completoQuantity: newQty,
                              lunchQuantity: newQty + (consumptionDraft.segundoSoloQuantity || 0),
                            });
                          }}
                          className="w-8 h-8 rounded-xl bg-stone-100 hover:bg-stone-200 border border-stone-200 text-stone-800 font-black flex items-center justify-center text-sm transition-colors"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          min="0"
                          value={consumptionDraft.completoQuantity ?? 0}
                          onChange={(e) => {
                            const val = Math.max(0, parseInt(e.target.value) || 0);
                            setConsumptionDraft({
                              ...consumptionDraft,
                              completoQuantity: val,
                              lunchQuantity: val + (consumptionDraft.segundoSoloQuantity || 0),
                            });
                          }}
                          className="w-12 h-8 text-center font-black text-sm text-stone-900 focus:outline-none bg-transparent"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const newQty = (consumptionDraft.completoQuantity || 0) + 1;
                            setConsumptionDraft({
                              ...consumptionDraft,
                              completoQuantity: newQty,
                              lunchQuantity: newQty + (consumptionDraft.segundoSoloQuantity || 0),
                            });
                          }}
                          className="w-8 h-8 rounded-xl bg-amber-700 hover:bg-amber-800 text-white font-black flex items-center justify-center text-sm shadow-2xs transition-colors"
                        >
                          +
                        </button>
                      </div>

                      <div className="text-right">
                        <span className="text-[10px] text-stone-500 font-semibold block">Subtotal:</span>
                        <span className="text-xs font-black text-stone-900">
                          {formatCurrency((consumptionDraft.completoQuantity || 0) * BASE_PRICES[consumptionDraft.locationType].menu_completo)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Tarjeta Segundo Solo */}
                  <div className={`p-3 rounded-2xl border transition-all ${
                    (consumptionDraft.segundoSoloQuantity || 0) > 0
                      ? 'bg-amber-50/80 border-amber-500 ring-2 ring-amber-400/40 shadow-xs'
                      : 'bg-white border-stone-200'
                  }`}>
                    <div className="flex items-start justify-between gap-1 mb-2">
                      <div>
                        <span className="text-xs sm:text-sm font-black text-stone-900 flex items-center gap-1">
                          <span>🍛</span>
                          <span>Segundo Solo</span>
                        </span>
                        <span className="text-[10px] text-stone-500 block">
                          Solamente plato de fondo
                        </span>
                      </div>
                      <span className="text-xs font-black text-amber-900 bg-amber-100/80 px-2 py-0.5 rounded-lg">
                        {formatCurrency(BASE_PRICES[consumptionDraft.locationType].solo_segundo)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-stone-100">
                      <div className="flex items-center">
                        <button
                          type="button"
                          onClick={() => {
                            const newQty = Math.max(0, (consumptionDraft.segundoSoloQuantity || 0) - 1);
                            setConsumptionDraft({
                              ...consumptionDraft,
                              segundoSoloQuantity: newQty,
                              lunchQuantity: (consumptionDraft.completoQuantity || 0) + newQty,
                            });
                          }}
                          className="w-8 h-8 rounded-xl bg-stone-100 hover:bg-stone-200 border border-stone-200 text-stone-800 font-black flex items-center justify-center text-sm transition-colors"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          min="0"
                          value={consumptionDraft.segundoSoloQuantity ?? 0}
                          onChange={(e) => {
                            const val = Math.max(0, parseInt(e.target.value) || 0);
                            setConsumptionDraft({
                              ...consumptionDraft,
                              segundoSoloQuantity: val,
                              lunchQuantity: (consumptionDraft.completoQuantity || 0) + val,
                            });
                          }}
                          className="w-12 h-8 text-center font-black text-sm text-stone-900 focus:outline-none bg-transparent"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const newQty = (consumptionDraft.segundoSoloQuantity || 0) + 1;
                            setConsumptionDraft({
                              ...consumptionDraft,
                              segundoSoloQuantity: newQty,
                              lunchQuantity: (consumptionDraft.completoQuantity || 0) + newQty,
                            });
                          }}
                          className="w-8 h-8 rounded-xl bg-amber-700 hover:bg-amber-800 text-white font-black flex items-center justify-center text-sm shadow-2xs transition-colors"
                        >
                          +
                        </button>
                      </div>

                      <div className="text-right">
                        <span className="text-[10px] text-stone-500 font-semibold block">Subtotal:</span>
                        <span className="text-xs font-black text-stone-900">
                          {formatCurrency((consumptionDraft.segundoSoloQuantity || 0) * BASE_PRICES[consumptionDraft.locationType].solo_segundo)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Resumen rápido de almuerzos seleccionados */}
                <div className="flex items-center justify-between px-3 py-2 bg-stone-100/90 rounded-xl border border-stone-200 text-xs">
                  <span className="text-stone-600 font-semibold">
                    Total Almuerzos: <strong className="text-stone-900">{(consumptionDraft.completoQuantity || 0) + (consumptionDraft.segundoSoloQuantity || 0)} plato(s)</strong>
                    {((consumptionDraft.completoQuantity || 0) === 0 && (consumptionDraft.segundoSoloQuantity || 0) === 0) && (
                      <span className="text-amber-800 ml-1.5 font-normal">(Solo extras / bebidas)</span>
                    )}
                  </span>
                  <span className="font-black text-amber-950">
                    Subtotal: {formatCurrency(
                      (consumptionDraft.completoQuantity || 0) * BASE_PRICES[consumptionDraft.locationType].menu_completo +
                      (consumptionDraft.segundoSoloQuantity || 0) * BASE_PRICES[consumptionDraft.locationType].solo_segundo
                    )}
                  </span>
                </div>
              </div>

              {/* Extras Selector: Expandable Window / Accordion with Categories */}
              <div className="rounded-2xl border border-stone-200 bg-white overflow-hidden shadow-2xs">
                {/* Header with expand button, window button & status */}
                <div className="p-3 bg-stone-50 border-b border-stone-200 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-base">🥤</span>
                    <div>
                      <span className="text-xs font-black uppercase tracking-wider text-stone-800 block">
                        Extras y Adicionales
                      </span>
                      <span className="text-[11px] text-stone-500">
                        {consumptionDraft.selectedExtras.length > 0 ? (
                          <span className="text-amber-800 font-bold">
                            {consumptionDraft.selectedExtras.reduce((s, i) => s + i.quantity, 0)} seleccionados • Subtotal: {formatCurrency(consumptionDraft.selectedExtras.reduce((s, i) => s + i.extra.price * i.quantity, 0))}
                          </span>
                        ) : (
                          'Bebidas, Panes, Extras, Especial, Dulces'
                        )}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setShowExtrasWindowModal(true)}
                      className="px-2.5 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors shadow-2xs"
                      title="Abrir ventana expansible para seleccionar extras"
                    >
                      <Maximize2 className="w-3.5 h-3.5 text-amber-800" />
                      <span className="hidden sm:inline">Ventana Expansible</span>
                      <span className="sm:hidden">Ampliar</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowManageExtrasModal(true)}
                      className="p-1.5 text-stone-500 hover:text-stone-800 hover:bg-stone-200 rounded-lg transition-colors"
                      title="Gestionar Catálogo de Extras"
                    >
                      <Settings className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsExtrasSectionExpanded(!isExtrasSectionExpanded)}
                      className="p-1.5 text-stone-600 hover:text-stone-900 hover:bg-stone-200 rounded-lg transition-colors"
                      title={isExtrasSectionExpanded ? 'Ocultar catálogo' : 'Mostrar catálogo'}
                    >
                      {isExtrasSectionExpanded ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Inline Content when expanded */}
                {isExtrasSectionExpanded && (
                  <div className="p-3 space-y-3 bg-stone-50/40">
                    {/* Category Selector Tabs */}
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
                      <button
                        type="button"
                        onClick={() => setSelectedExtraCategoryFilter('Todos')}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition-colors flex items-center gap-1 ${
                          selectedExtraCategoryFilter === 'Todos'
                            ? 'bg-amber-800 text-white shadow-2xs'
                            : 'bg-white text-stone-600 hover:bg-stone-100 border border-stone-200'
                        }`}
                      >
                        <span>Todos</span>
                        <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                          selectedExtraCategoryFilter === 'Todos' ? 'bg-amber-900 text-amber-100' : 'bg-stone-100 text-stone-600'
                        }`}>
                          {categoryCounts.Todos}
                        </span>
                      </button>

                      {EXTRA_CATEGORIES.map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setSelectedExtraCategoryFilter(cat)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition-colors flex items-center gap-1 ${
                            selectedExtraCategoryFilter === cat
                              ? 'bg-amber-800 text-white shadow-2xs'
                              : 'bg-white text-stone-600 hover:bg-stone-100 border border-stone-200'
                          }`}
                        >
                          <span>{getCategoryIcon(cat)}</span>
                          <span>{cat}</span>
                          <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                            selectedExtraCategoryFilter === cat ? 'bg-amber-900 text-amber-100' : 'bg-stone-100 text-stone-600'
                          }`}>
                            {categoryCounts[cat] || 0}
                          </span>
                        </button>
                      ))}
                    </div>

                    {/* Search bar inside */}
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
                      <input
                        type="text"
                        placeholder="Buscar extra (ej. Inka Kola, Pan, Huevo, Alfajor)..."
                        value={extraSearchQuery}
                        onChange={(e) => setExtraSearchQuery(e.target.value)}
                        className="w-full text-xs pl-8 pr-7 py-1.5 bg-white border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-600"
                      />
                      {extraSearchQuery && (
                        <button
                          type="button"
                          onClick={() => setExtraSearchQuery('')}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 text-xs"
                        >
                          ×
                        </button>
                      )}
                    </div>

                    {/* Catalog Grid for selected category */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1">
                      {filteredExtras.length === 0 ? (
                        <div className="col-span-full py-4 text-center text-xs text-stone-400">
                          No hay adicionales registrados en esta categoría.
                        </div>
                      ) : (
                        filteredExtras.map((extra) => {
                          const inCart = consumptionDraft.selectedExtras.find((i) => i.extra.id === extra.id);
                          return (
                            <div
                              key={extra.id}
                              className={`p-2 rounded-xl border transition-all text-left flex flex-col justify-between ${
                                inCart
                                  ? 'bg-amber-50/90 border-amber-500 shadow-2xs ring-1 ring-amber-400/40'
                                  : 'bg-white border-stone-200 hover:border-amber-400 hover:shadow-2xs'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-1 mb-1">
                                <span className="text-xs">{getCategoryIcon(extra.category)}</span>
                                <span className="text-[10px] font-bold text-stone-500 bg-stone-100 px-1.5 py-0.5 rounded">
                                  {formatCurrency(extra.price)}
                                </span>
                              </div>
                              <span className="text-xs font-extrabold text-stone-900 leading-tight mb-2 line-clamp-2">
                                {extra.name}
                              </span>

                              {inCart ? (
                                <div className="flex items-center justify-between pt-1 border-t border-amber-200">
                                  <button
                                    type="button"
                                    onClick={() => handleDecrementExtraInDraft(extra.id)}
                                    className="w-6 h-6 rounded-md bg-white border border-amber-300 font-black text-amber-900 hover:bg-amber-100 flex items-center justify-center text-xs"
                                    title="Disminuir"
                                  >
                                    -
                                  </button>
                                  <span className="font-black text-xs text-amber-950 px-1">
                                    {inCart.quantity}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleAddExtraToDraft(extra)}
                                    className="w-6 h-6 rounded-md bg-amber-700 text-white font-black hover:bg-amber-800 flex items-center justify-center text-xs"
                                    title="Aumentar"
                                  >
                                    +
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleAddExtraToDraft(extra)}
                                  className="w-full py-1 bg-stone-100 hover:bg-amber-600 hover:text-white text-stone-700 font-bold rounded-lg text-[11px] transition-colors flex items-center justify-center gap-1"
                                >
                                  + Agregar
                                </button>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}

                {/* Selected Extras Tray */}
                {consumptionDraft.selectedExtras.length > 0 && (
                  <div className="p-3 bg-amber-50/50 border-t border-stone-200 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-bold text-amber-900 mb-1">
                      <span>Extras Agregados al Pedido:</span>
                      <span>Subtotal: {formatCurrency(consumptionDraft.selectedExtras.reduce((s, i) => s + i.extra.price * i.quantity, 0))}</span>
                    </div>

                    <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                      {consumptionDraft.selectedExtras.map((item) => (
                        <div
                          key={item.extra.id}
                          className="flex items-center justify-between p-2 bg-white rounded-xl border border-stone-200 text-xs shadow-2xs"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-sm">{getCategoryIcon(item.extra.category)}</span>
                            <div>
                              <span className="font-extrabold text-stone-900 block leading-tight">
                                {item.extra.name}
                              </span>
                              <span className="text-[10px] text-stone-500 font-medium">
                                {formatCurrency(item.extra.price)} c/u • {normalizeExtraCategory(item.extra.category)}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <div className="flex items-center border border-stone-200 rounded-lg overflow-hidden">
                              <button
                                type="button"
                                onClick={() => handleDecrementExtraInDraft(item.extra.id)}
                                className="w-6 h-6 bg-stone-50 hover:bg-stone-100 text-stone-700 font-black flex items-center justify-center text-xs"
                              >
                                -
                              </button>
                              <span className="px-2 font-black text-xs text-stone-900">
                                {item.quantity}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleAddExtraToDraft(item.extra)}
                                className="w-6 h-6 bg-amber-50 hover:bg-amber-100 text-amber-900 font-black flex items-center justify-center text-xs"
                              >
                                +
                              </button>
                            </div>

                            <span className="font-black text-stone-900 min-w-[3.5rem] text-right">
                              {formatCurrency(item.extra.price * item.quantity)}
                            </span>

                            <button
                              type="button"
                              onClick={() => handleRemoveExtraFromDraft(item.extra.id)}
                              className="text-stone-400 hover:text-rose-600 p-1 font-bold text-base transition-colors"
                              title="Quitar este extra"
                            >
                              ×
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Payment state for daily */}
              {consumptionDraft.accountType === 'diaria' && (
                <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 space-y-2 text-xs">
                  <span className="font-bold text-stone-800 block">Estado del Cobro Diario:</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setConsumptionDraft({ ...consumptionDraft, paymentStatus: 'pendiente' })}
                      className={`flex-1 py-1.5 px-2 rounded-lg font-bold border transition-colors ${
                        consumptionDraft.paymentStatus === 'pendiente'
                          ? 'bg-rose-700 text-white border-rose-800'
                          : 'bg-white text-stone-700 border-stone-300'
                      }`}
                    >
                      🔴 Pendiente
                    </button>
                    <button
                      type="button"
                      onClick={() => setConsumptionDraft({ ...consumptionDraft, paymentStatus: 'pagado' })}
                      className={`flex-1 py-1.5 px-2 rounded-lg font-bold border transition-colors ${
                        consumptionDraft.paymentStatus === 'pagado'
                          ? 'bg-emerald-700 text-white border-emerald-800'
                          : 'bg-white text-stone-700 border-stone-300'
                      }`}
                    >
                      ✅ Pagado al instante
                    </button>
                  </div>

                  {consumptionDraft.paymentStatus === 'pagado' && (
                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setConsumptionDraft({ ...consumptionDraft, paymentMethod: 'efectivo' })}
                        className={`flex-1 py-1 px-2 rounded-md font-bold text-xs ${
                          consumptionDraft.paymentMethod === 'efectivo'
                            ? 'bg-emerald-800 text-white'
                            : 'bg-white text-stone-600 border border-stone-300'
                        }`}
                      >
                        💵 Efectivo
                      </button>
                      <button
                        type="button"
                        onClick={() => setConsumptionDraft({ ...consumptionDraft, paymentMethod: 'yape' })}
                        className={`flex-1 py-1 px-2 rounded-md font-bold text-xs ${
                          consumptionDraft.paymentMethod === 'yape'
                            ? 'bg-purple-800 text-white'
                            : 'bg-white text-stone-600 border border-stone-300'
                        }`}
                      >
                        📱 Yape
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="text-xs font-bold text-stone-600 block mb-1">Notas del pedido (opcional):</label>
                <input
                  type="text"
                  placeholder="Ej. Llevar a tienda 201, sin ají..."
                  value={consumptionDraft.notes}
                  onChange={(e) => setConsumptionDraft({ ...consumptionDraft, notes: e.target.value })}
                  className="w-full text-xs px-3 py-2 border border-stone-300 rounded-xl focus:outline-none"
                />
              </div>

              {/* Total Summary & Save */}
              <div className="p-3 bg-stone-100 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-3">
                <div>
                  <span className="text-xs text-stone-500 uppercase font-bold block">Total a Registrar:</span>
                  <span className="text-xl font-black text-amber-950">
                    {formatCurrency(
                      (consumptionDraft.completoQuantity || 0) * BASE_PRICES[consumptionDraft.locationType].menu_completo +
                      (consumptionDraft.segundoSoloQuantity || 0) * BASE_PRICES[consumptionDraft.locationType].solo_segundo +
                      consumptionDraft.selectedExtras.reduce((s, i) => s + i.extra.price * i.quantity, 0)
                    )}
                  </span>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                  {consumptionDraft.id && (
                    <button
                      type="button"
                      onClick={() => {
                        const idToDelete = consumptionDraft.id!;
                        setShowAddConsumptionModal(false);
                        setConsumptionDraft(null);
                        handleDeleteConsumption(idToDelete);
                      }}
                      className="px-3 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded-xl border border-rose-200 transition-colors flex items-center gap-1.5 text-xs shadow-xs"
                      title="Eliminar este pedido"
                    >
                      <Trash2 className="w-4 h-4 text-rose-600" />
                      <span>Eliminar</span>
                    </button>
                  )}

                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-amber-800 hover:bg-amber-900 text-white font-bold rounded-xl shadow-xs transition-colors text-xs sm:text-sm"
                  >
                    {consumptionDraft.id ? 'Guardar Cambios' : 'Guardar en Registro'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: VENTANA EXPANSIBLE DE EXTRAS Y ADICIONALES                         */}
      {/* ========================================================================= */}
      {showExtrasWindowModal && consumptionDraft && (
        <div className="fixed inset-0 z-60 bg-black/75 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-in fade-in duration-150">
          <div
            className={`bg-white rounded-2xl shadow-2xl border border-stone-200 overflow-hidden flex flex-col transition-all duration-200 ${
              isExtrasWindowMaximized
                ? 'w-full max-w-5xl h-[92vh]'
                : 'w-full max-w-2xl max-h-[85vh]'
            }`}
          >
            {/* Window Header */}
            <div className="bg-stone-900 text-white p-3.5 sm:p-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <span className="text-xl">🪟</span>
                <div>
                  <h3 className="font-black text-sm sm:text-base leading-tight">
                    Ventana de Extras y Adicionales
                  </h3>
                  <p className="text-[11px] text-amber-300 font-medium">
                    Cliente: <strong className="text-white">{consumptionDraft.clientName || 'Cliente'}</strong> ({consumptionDraft.piso}) • {consumptionDraft.accountType === 'semanal' ? 'Cuenta Semanal' : 'Cuenta Diaria'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setIsExtrasWindowMaximized(!isExtrasWindowMaximized)}
                  className="p-1.5 text-stone-300 hover:text-white hover:bg-stone-800 rounded-lg transition-colors flex items-center gap-1 text-xs font-bold"
                  title={isExtrasWindowMaximized ? 'Restaurar tamaño normal' : 'Maximizar ventana completa'}
                >
                  {isExtrasWindowMaximized ? (
                    <>
                      <Minimize2 className="w-4 h-4" />
                      <span className="hidden sm:inline">Restaurar</span>
                    </>
                  ) : (
                    <>
                      <Maximize2 className="w-4 h-4" />
                      <span className="hidden sm:inline">Maximizar</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setShowExtrasWindowModal(false)}
                  className="p-1.5 text-stone-300 hover:text-white hover:bg-stone-800 rounded-lg transition-colors"
                  title="Cerrar ventana"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Window Filter & Category Tabs */}
            <div className="p-3 sm:p-4 bg-stone-50 border-b border-stone-200 space-y-2.5 shrink-0">
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
                <button
                  type="button"
                  onClick={() => setSelectedExtraCategoryFilter('Todos')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-black whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                    selectedExtraCategoryFilter === 'Todos'
                      ? 'bg-amber-800 text-white shadow-xs'
                      : 'bg-white text-stone-600 hover:bg-stone-100 border border-stone-200'
                  }`}
                >
                  <span>Todos</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                    selectedExtraCategoryFilter === 'Todos' ? 'bg-amber-900 text-amber-100' : 'bg-stone-100 text-stone-600'
                  }`}>
                    {categoryCounts.Todos}
                  </span>
                </button>

                {EXTRA_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedExtraCategoryFilter(cat)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-black whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                      selectedExtraCategoryFilter === cat
                        ? 'bg-amber-800 text-white shadow-xs'
                        : 'bg-white text-stone-600 hover:bg-stone-100 border border-stone-200'
                    }`}
                  >
                    <span>{getCategoryIcon(cat)}</span>
                    <span>{cat}</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                      selectedExtraCategoryFilter === cat ? 'bg-amber-900 text-amber-100' : 'bg-stone-100 text-stone-600'
                    }`}>
                      {categoryCounts[cat] || 0}
                    </span>
                  </button>
                ))}
              </div>

              {/* Search Bar */}
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                <input
                  type="text"
                  placeholder="Buscar en el catálogo (Inca Kola, Pan con Pollo, Huevo frito, Alfajor)..."
                  value={extraSearchQuery}
                  onChange={(e) => setExtraSearchQuery(e.target.value)}
                  className="w-full text-xs sm:text-sm pl-9 pr-8 py-2 bg-white border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-600"
                />
                {extraSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setExtraSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 text-sm font-bold"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>

            {/* Product Cards Grid in Window */}
            <div className="p-3 sm:p-5 overflow-y-auto flex-1">
              <div className={`grid gap-3 ${
                isExtrasWindowMaximized
                  ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5'
                  : 'grid-cols-2 sm:grid-cols-3'
              }`}>
                {filteredExtras.length === 0 ? (
                  <div className="col-span-full py-12 text-center text-stone-400 text-sm">
                    No se encontraron adicionales en esta categoría.
                  </div>
                ) : (
                  filteredExtras.map((extra) => {
                    const inCart = consumptionDraft.selectedExtras.find((i) => i.extra.id === extra.id);
                    return (
                      <div
                        key={extra.id}
                        className={`p-3 rounded-2xl border transition-all flex flex-col justify-between ${
                          inCart
                            ? 'bg-amber-50/80 border-amber-500 shadow-sm ring-2 ring-amber-500/20'
                            : 'bg-white border-stone-200 hover:border-amber-400 hover:shadow-xs'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xl">{getCategoryIcon(extra.category)}</span>
                            <span className="text-[10px] font-bold text-stone-500 uppercase bg-stone-100 px-1.5 py-0.5 rounded">
                              {normalizeExtraCategory(extra.category)}
                            </span>
                          </div>
                          <h4 className="font-extrabold text-xs sm:text-sm text-stone-900 leading-snug line-clamp-2">
                            {extra.name}
                          </h4>
                          <span className="font-black text-amber-900 text-xs sm:text-sm block mt-1">
                            {formatCurrency(extra.price)}
                          </span>
                        </div>

                        <div className="pt-2.5 mt-2 border-t border-stone-100">
                          {inCart ? (
                            <div className="flex items-center justify-between">
                              <button
                                type="button"
                                onClick={() => handleDecrementExtraInDraft(extra.id)}
                                className="w-7 h-7 rounded-lg bg-white border border-amber-300 font-black text-amber-900 hover:bg-amber-100 flex items-center justify-center text-sm shadow-2xs"
                              >
                                -
                              </button>
                              <span className="font-black text-sm text-amber-950 px-2">
                                {inCart.quantity}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleAddExtraToDraft(extra)}
                                className="w-7 h-7 rounded-lg bg-amber-800 text-white font-black hover:bg-amber-900 flex items-center justify-center text-sm shadow-2xs"
                              >
                                +
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleAddExtraToDraft(extra)}
                              className="w-full py-1.5 bg-stone-100 hover:bg-amber-700 hover:text-white text-stone-800 font-bold rounded-xl text-xs transition-colors flex items-center justify-center gap-1"
                            >
                              + Agregar
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Window Sticky Footer */}
            <div className="p-3 sm:p-4 bg-stone-100 border-t border-stone-200 flex items-center justify-between gap-3 shrink-0">
              <div>
                <span className="text-[11px] font-bold text-stone-500 uppercase block">
                  Extras Seleccionados:
                </span>
                <span className="text-sm sm:text-base font-black text-amber-950">
                  {consumptionDraft.selectedExtras.reduce((s, i) => s + i.quantity, 0)} unidades • Subtotal: {formatCurrency(consumptionDraft.selectedExtras.reduce((s, i) => s + i.extra.price * i.quantity, 0))}
                </span>
              </div>

              <button
                type="button"
                onClick={() => setShowExtrasWindowModal(false)}
                className="px-5 py-2.5 bg-amber-800 hover:bg-amber-900 text-white font-bold rounded-xl shadow-xs transition-colors text-xs sm:text-sm flex items-center gap-2"
              >
                <Check className="w-4 h-4" />
                <span>Confirmar y Volver al Pedido</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CANCELO DP (Liquidación de Deuda Pasada del período anterior)     */}
      {/* ========================================================================= */}
      {showCancelDpModal && cancelDpDraft && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-stone-200 overflow-hidden my-auto animate-in zoom-in-95 duration-150">
            <div className="bg-gradient-to-r from-amber-900 via-amber-800 to-amber-950 text-white p-4 flex items-center justify-between">
              <div>
                <span className="text-[11px] bg-amber-700/60 border border-amber-500/40 text-amber-200 px-2 py-0.5 rounded-full font-bold uppercase">
                  {cancelDpDraft.piso} • Cuenta Semanal
                </span>
                <h3 className="font-bold text-base sm:text-lg mt-1 flex items-center gap-1.5">
                  <CheckCircle2 className="w-5 h-5 text-amber-300" />
                  <span>Cancelo DP: {cancelDpDraft.clientName}</span>
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowCancelDpModal(false);
                  setCancelDpDraft(null);
                  setCancelDpError(null);
                }}
                className="text-amber-200 hover:text-white p-1 rounded-lg transition-colors"
                title="Cerrar ventana"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmCancelDp} className="p-5 space-y-4">
              {cancelDpError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{cancelDpError}</span>
                </div>
              )}

              {/* Informative Card */}
              <div className="bg-amber-50/80 border-2 border-amber-300/80 rounded-xl p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-900 uppercase">
                    Deuda Pasada (DP) Acumulada:
                  </span>
                  <span className="text-lg font-black text-rose-700">
                    {formatCurrency(cancelDpDraft.deudaPasada)}
                  </span>
                </div>
                <p className="text-[11px] text-amber-950 leading-relaxed bg-white/80 p-2.5 rounded-lg border border-amber-200 shadow-2xs">
                  📅 <strong>Registro en el día actual ({cancelDpDraft.targetDate}):</strong> Este pago se asienta con la <strong>fecha de hoy</strong> para que quede reflejado en la <strong>caja, ingresos y arqueo de hoy</strong>. La <strong>Deuda Pasada (DP) quedará saldada</strong> y descontada de su saldo pendiente.
                </p>
              </div>

              {/* Fecha de Registro (Día Actual) */}
              <div>
                <label className="text-xs font-bold text-stone-700 block mb-1">
                  Fecha del Registro (Día Actual):
                </label>
                <input
                  type="date"
                  value={cancelDpDraft.targetDate}
                  onChange={(e) => setCancelDpDraft({ ...cancelDpDraft, targetDate: e.target.value })}
                  className="w-full text-xs font-bold px-3 py-2 border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-600 bg-stone-50 text-stone-900"
                  required
                />
              </div>

              {/* Monto Input */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-bold text-stone-700">Monto a Liquidar (S/.):</label>
                  {parseFloat(cancelDpDraft.amount) !== cancelDpDraft.deudaPasada && (
                    <button
                      type="button"
                      onClick={() =>
                        setCancelDpDraft({
                          ...cancelDpDraft,
                          amount: cancelDpDraft.deudaPasada.toFixed(2),
                        })
                      }
                      className="text-[11px] text-amber-700 font-bold hover:underline"
                    >
                      Liquidar total ({formatCurrency(cancelDpDraft.deudaPasada)})
                    </button>
                  )}
                </div>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  value={cancelDpDraft.amount}
                  onChange={(e) => setCancelDpDraft({ ...cancelDpDraft, amount: e.target.value })}
                  className="w-full text-2xl font-black px-3 py-2 border-2 border-amber-400 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-600 text-stone-900 bg-amber-50/20"
                  required
                  autoFocus
                />
              </div>

              {/* Método de Pago */}
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-stone-600 block mb-1.5">
                  Método de Pago:
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setCancelDpDraft({ ...cancelDpDraft, method: 'efectivo' })}
                    className={`p-3 rounded-xl border text-center font-bold text-xs flex items-center justify-center gap-1.5 transition-all ${
                      cancelDpDraft.method === 'efectivo'
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-900 ring-2 ring-emerald-500/20 shadow-xs'
                        : 'border-stone-200 text-stone-700 hover:bg-stone-50'
                    }`}
                  >
                    <DollarSign className="w-4 h-4 text-emerald-600" />
                    <span>Efectivo</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCancelDpDraft({ ...cancelDpDraft, method: 'yape' })}
                    className={`p-3 rounded-xl border text-center font-bold text-xs flex items-center justify-center gap-1.5 transition-all ${
                      cancelDpDraft.method === 'yape'
                        ? 'border-purple-600 bg-purple-50 text-purple-900 ring-2 ring-purple-500/20 shadow-xs'
                        : 'border-stone-200 text-stone-700 hover:bg-stone-50'
                    }`}
                  >
                    <Smartphone className="w-4 h-4 text-purple-600" />
                    <span>Yape</span>
                  </button>
                </div>
              </div>

              {/* Nota */}
              <div>
                <label className="text-xs font-bold text-stone-600 block mb-1">Detalle / Nota:</label>
                <input
                  type="text"
                  value={cancelDpDraft.notes}
                  onChange={(e) => setCancelDpDraft({ ...cancelDpDraft, notes: e.target.value })}
                  placeholder="Canceló Deuda Pasada (DP)"
                  className="w-full text-xs px-3 py-2 border border-stone-300 rounded-xl focus:outline-none"
                />
              </div>

              {/* Buttons */}
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setShowCancelDpModal(false);
                    setCancelDpDraft(null);
                    setCancelDpError(null);
                  }}
                  className="flex-1 py-2.5 px-3 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold rounded-xl text-xs transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-[2] py-2.5 px-4 bg-amber-700 hover:bg-amber-800 text-white font-bold rounded-xl shadow-xs transition-colors text-xs flex items-center justify-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Confirmar Canceló DP</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CANCELO DA (Liquidación Directa de Deuda Actual de la Semana)       */}
      {/* ========================================================================= */}
      {showCancelDaModal && cancelDaDraft && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-stone-200 overflow-hidden my-auto animate-in zoom-in-95 duration-150">
            <div className="bg-gradient-to-r from-emerald-900 via-emerald-800 to-emerald-950 text-white p-4 flex items-center justify-between">
              <div>
                <span className="text-[11px] bg-emerald-700/60 border border-emerald-500/40 text-emerald-200 px-2 py-0.5 rounded-full font-bold uppercase">
                  {cancelDaDraft.piso} • Cuenta Semanal
                </span>
                <h3 className="font-bold text-base sm:text-lg mt-1 flex items-center gap-1.5">
                  <CheckCircle2 className="w-5 h-5 text-emerald-300" />
                  <span>Cancelo DA: {cancelDaDraft.clientName}</span>
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowCancelDaModal(false);
                  setCancelDaDraft(null);
                  setCancelDaError(null);
                }}
                className="text-emerald-200 hover:text-white p-1 rounded-lg transition-colors"
                title="Cerrar ventana"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmCancelDa} className="p-5 space-y-4">
              {cancelDaError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{cancelDaError}</span>
                </div>
              )}

              {/* Informative Card */}
              <div className="bg-emerald-50/80 border-2 border-emerald-300/80 rounded-xl p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-900 uppercase">
                    Deuda Actual (DA) de la Semana:
                  </span>
                  <span className="text-lg font-black text-emerald-900">
                    {formatCurrency(cancelDaDraft.deudaActual)}
                  </span>
                </div>
                <p className="text-[11px] text-emerald-950 leading-relaxed bg-white/80 p-2.5 rounded-lg border border-emerald-200 shadow-2xs">
                  📅 <strong>Liquidación Directa:</strong> Los consumos pendientes de esta semana quedan registrados como <strong>PAGADOS</strong> directamente. No se genera como abono, evitando cualquier error o conflicto al crear o actualizar cuentas. El cobro ingresa de inmediato a la <strong>caja de hoy</strong>.
                </p>
              </div>

              {/* Fecha de Registro (Día Actual) */}
              <div>
                <label className="text-xs font-bold text-stone-700 block mb-1">
                  Fecha del Cobro (Entra a Caja):
                </label>
                <input
                  type="date"
                  value={cancelDaDraft.targetDate}
                  onChange={(e) => setCancelDaDraft({ ...cancelDaDraft, targetDate: e.target.value })}
                  className="w-full text-xs font-bold px-3 py-2 border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600 bg-stone-50 text-stone-900"
                  required
                />
              </div>

              {/* Monto Input */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-bold text-stone-700">Monto a Cancelar (S/.):</label>
                  {parseFloat(cancelDaDraft.amount) !== cancelDaDraft.deudaActual && (
                    <button
                      type="button"
                      onClick={() =>
                        setCancelDaDraft({
                          ...cancelDaDraft,
                          amount: cancelDaDraft.deudaActual.toFixed(2),
                        })
                      }
                      className="text-[11px] text-emerald-700 font-bold hover:underline"
                    >
                      Liquidar total DA ({formatCurrency(cancelDaDraft.deudaActual)})
                    </button>
                  )}
                </div>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  value={cancelDaDraft.amount}
                  onChange={(e) => setCancelDaDraft({ ...cancelDaDraft, amount: e.target.value })}
                  className="w-full text-2xl font-black px-3 py-2 border-2 border-emerald-400 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600 text-stone-900 bg-emerald-50/20"
                  required
                  autoFocus
                />
              </div>

              {/* Método de Pago */}
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-stone-600 block mb-1.5">
                  Método de Pago:
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setCancelDaDraft({ ...cancelDaDraft, method: 'efectivo' })}
                    className={`p-3 rounded-xl border text-center font-bold text-xs flex items-center justify-center gap-1.5 transition-all ${
                      cancelDaDraft.method === 'efectivo'
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-900 ring-2 ring-emerald-500/20 shadow-xs'
                        : 'border-stone-200 text-stone-700 hover:bg-stone-50'
                    }`}
                  >
                    <DollarSign className="w-4 h-4 text-emerald-600" />
                    <span>Efectivo</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCancelDaDraft({ ...cancelDaDraft, method: 'yape' })}
                    className={`p-3 rounded-xl border text-center font-bold text-xs flex items-center justify-center gap-1.5 transition-all ${
                      cancelDaDraft.method === 'yape'
                        ? 'border-purple-600 bg-purple-50 text-purple-900 ring-2 ring-purple-500/20 shadow-xs'
                        : 'border-stone-200 text-stone-700 hover:bg-stone-50'
                    }`}
                  >
                    <Smartphone className="w-4 h-4 text-purple-600" />
                    <span>Yape</span>
                  </button>
                </div>
              </div>

              {/* Nota */}
              <div>
                <label className="text-xs font-bold text-stone-600 block mb-1">Detalle / Nota:</label>
                <input
                  type="text"
                  value={cancelDaDraft.notes}
                  onChange={(e) => setCancelDaDraft({ ...cancelDaDraft, notes: e.target.value })}
                  placeholder="Canceló Deuda Actual (DA)"
                  className="w-full text-xs px-3 py-2 border border-stone-300 rounded-xl focus:outline-none"
                />
              </div>

              {/* Buttons */}
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setShowCancelDaModal(false);
                    setCancelDaDraft(null);
                    setCancelDaError(null);
                  }}
                  className="flex-1 py-2.5 px-3 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold rounded-xl text-xs transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-[2] py-2.5 px-4 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl shadow-xs transition-colors text-xs flex items-center justify-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Confirmar Canceló DA</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: REGISTRAR ABONO (Abono de cuenta semanal o diaria)                 */}
      {/* ========================================================================= */}
      {showPaymentModal && paymentDraft && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-stone-200 overflow-hidden my-auto animate-in zoom-in-95 duration-150">
            <div className="bg-emerald-800 text-white p-4 flex items-center justify-between">
              <div>
                <span className="text-xs text-emerald-200 uppercase font-bold">
                  {paymentDraft.piso}
                </span>
                <h3 className="font-bold text-base sm:text-lg">
                  Registrar Abono: {paymentDraft.clientName}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowPaymentModal(false);
                  setPaymentDraft(null);
                }}
                className="text-emerald-200 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePayment} className="p-5 space-y-4">
              {paymentError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{paymentError}</span>
                </div>
              )}

              {/* Date */}
              <div>
                <label className="text-xs font-bold text-stone-600 block mb-1">Fecha del Abono:</label>
                <input
                  type="date"
                  value={paymentDraft.date}
                  onChange={(e) => setPaymentDraft({ ...paymentDraft, date: e.target.value })}
                  className="w-full text-xs font-bold px-3 py-2 border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                />
                <span className="text-[11px] text-stone-500 mt-0.5 block">
                  Día: {getDayOfWeekName(paymentDraft.date)}
                </span>
              </div>

              {/* Amount */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-bold text-stone-600">Monto Abonado (S/.):</label>
                </div>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  placeholder="0.00"
                  value={paymentDraft.amount}
                  onChange={(e) => setPaymentDraft({ ...paymentDraft, amount: e.target.value })}
                  className="w-full text-2xl font-black px-3 py-2 border-2 border-emerald-400 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600 text-emerald-950"
                  required
                  autoFocus
                />
              </div>

              {/* Method (Efectivo o Yape) */}
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-stone-600 block mb-1.5">
                  Método de Pago:
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setPaymentDraft({ ...paymentDraft, method: 'efectivo' })}
                    className={`p-3 rounded-xl border text-center font-bold text-xs flex items-center justify-center gap-1.5 transition-all ${
                      paymentDraft.method === 'efectivo'
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-900 ring-2 ring-emerald-500/20 shadow-xs'
                        : 'border-stone-200 text-stone-700 hover:bg-stone-50'
                    }`}
                  >
                    <DollarSign className="w-4 h-4 text-emerald-600" />
                    <span>Efectivo</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentDraft({ ...paymentDraft, method: 'yape' })}
                    className={`p-3 rounded-xl border text-center font-bold text-xs flex items-center justify-center gap-1.5 transition-all ${
                      paymentDraft.method === 'yape'
                        ? 'border-purple-600 bg-purple-50 text-purple-900 ring-2 ring-purple-500/20 shadow-xs'
                        : 'border-stone-200 text-stone-700 hover:bg-stone-50'
                    }`}
                  >
                    <Smartphone className="w-4 h-4 text-purple-600" />
                    <span>Yape</span>
                  </button>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="text-xs font-bold text-stone-600 block mb-1">Nota (opcional):</label>
                <input
                  type="text"
                  value={paymentDraft.notes}
                  onChange={(e) => setPaymentDraft({ ...paymentDraft, notes: e.target.value })}
                  placeholder="Ej. Pago a cuenta, adelanto..."
                  className="w-full text-xs px-3 py-2 border border-stone-300 rounded-xl focus:outline-none"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl shadow-sm transition-colors text-sm"
              >
                Confirmar y Registrar Abono
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: NUEVO CLIENTE / PUESTO POR PISO (Con prefijo +51 en Teléfono)      */}
      {/* ========================================================================= */}
      {showNewClientModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-stone-200 overflow-hidden my-auto animate-in zoom-in-95 duration-150">
            <div className="bg-stone-900 text-white p-4 flex items-center justify-between">
              <h3 className="font-bold text-base sm:text-lg flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-amber-400" />
                <span>Agregar Nuevo Cliente o Puesto</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowNewClientModal(false)}
                className="text-stone-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveNewClient} className="p-5 space-y-4">
              <div>
                <label className="text-xs font-bold text-stone-700 block mb-1">
                  Nombre del Cliente o Tienda:
                </label>
                <input
                  type="text"
                  placeholder="Ej. Zapatería Marco, Puesto 204..."
                  value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)}
                  className="w-full text-sm font-bold px-3 py-2 border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500"
                  required
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-stone-700 block mb-1">Piso / Ubicación:</label>
                  <select
                    value={isCustomPiso ? '__custom__' : newClientPiso}
                    onChange={(e) => {
                      if (e.target.value === '__custom__') {
                        setIsCustomPiso(true);
                      } else {
                        setIsCustomPiso(false);
                        setNewClientPiso(e.target.value);
                      }
                    }}
                    className="w-full text-xs font-semibold px-3 py-2 border border-stone-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="1ro">🏢 1ro (1er Piso)</option>
                    <option value="2do">🏢 2do (2do Piso)</option>
                    <option value="3ro">🏢 3ro (3er Piso)</option>
                    <option value="4to">🏢 4to (4to Piso)</option>
                    <option value="Calle">🚶 Calle (Exterior / Envío)</option>
                    {pisosList
                      .filter((p) => !['Calle', '1ro', '2do', '3ro', '4to'].includes(p))
                      .map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    <option value="__custom__">➕ Otra ubicación / calle...</option>
                  </select>

                  {isCustomPiso && (
                    <input
                      type="text"
                      placeholder="Escribe la ubicación o calle..."
                      value={customPisoText}
                      onChange={(e) => setCustomPisoText(e.target.value)}
                      className="mt-2 w-full text-xs font-semibold px-3 py-2 border border-amber-400 bg-amber-50/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500"
                      autoFocus
                    />
                  )}
                </div>

                <div>
                  <label className="text-xs font-bold text-stone-700 block mb-1">Tipo de Cuenta:</label>
                  <select
                    value={newClientType}
                    onChange={(e) => setNewClientType(e.target.value as 'semanal' | 'diaria')}
                    className="w-full text-xs font-semibold px-3 py-2 border border-stone-300 rounded-xl bg-white focus:outline-none"
                  >
                    <option value="semanal">Cuenta Semanal</option>
                    <option value="diaria">Cuenta Diaria</option>
                  </select>
                </div>
              </div>

              {/* Phone with Peruvian +51 flag prefix */}
              <div>
                <label className="text-xs font-bold text-stone-700 block mb-1">
                  Teléfono / WhatsApp (opcional):
                </label>
                <div className="flex rounded-xl overflow-hidden border border-stone-300 focus-within:ring-2 focus-within:ring-amber-500">
                  <span className="bg-stone-100 px-3 py-2 text-stone-700 font-bold text-xs flex items-center border-r border-stone-300">
                    🇵🇪 +51
                  </span>
                  <input
                    type="tel"
                    placeholder="987654321"
                    value={newClientPhone}
                    onChange={(e) => setNewClientPhone(e.target.value)}
                    className="w-full text-xs px-3 py-2 focus:outline-none"
                  />
                </div>
                <p className="text-[10px] text-stone-500 mt-1">
                  Se agrega automáticamente el prefijo internacional de Perú (+51) para enviar a WhatsApp sin fallar.
                </p>
              </div>

              <div>
                <label className="text-xs font-bold text-stone-700 block mb-1">Nota adicional (opcional):</label>
                <input
                  type="text"
                  placeholder="Ej. Paga los sábados, pide siempre sopa..."
                  value={newClientNotes}
                  onChange={(e) => setNewClientNotes(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-stone-300 rounded-xl focus:outline-none"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-amber-800 hover:bg-amber-900 text-white font-bold rounded-xl shadow-xs transition-colors text-sm"
              >
                Guardar Cliente en Registro
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: EDITAR CLIENTE                                                     */}
      {/* ========================================================================= */}
      {editingClient && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-stone-200 overflow-hidden my-auto animate-in zoom-in-95 duration-150">
            <div className="bg-stone-900 text-white p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-amber-400" />
                <h3 className="font-extrabold text-base sm:text-lg">
                  Editar Cliente / Puesto
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingClient(null)}
                className="text-stone-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditClient} className="p-4 sm:p-5 space-y-4">
              <div>
                <label className="text-xs font-bold text-stone-700 block mb-1">
                  Nombre o Identificación:
                </label>
                <input
                  type="text"
                  value={editClientName}
                  onChange={(e) => setEditClientName(e.target.value)}
                  className="w-full text-sm font-bold px-3 py-2 border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500"
                  required
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-stone-700 block mb-1">Piso / Ubicación:</label>
                  <select
                    value={editIsCustomPiso ? '__custom__' : editClientPiso}
                    onChange={(e) => {
                      if (e.target.value === '__custom__') {
                        setEditIsCustomPiso(true);
                      } else {
                        setEditIsCustomPiso(false);
                        setEditClientPiso(e.target.value);
                      }
                    }}
                    className="w-full text-xs font-semibold px-3 py-2 border border-stone-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="1ro">🏢 1ro (1er Piso)</option>
                    <option value="2do">🏢 2do (2do Piso)</option>
                    <option value="3ro">🏢 3ro (3er Piso)</option>
                    <option value="4to">🏢 4to (4to Piso)</option>
                    <option value="Calle">🚶 Calle (Exterior / Envío)</option>
                    {pisosList
                      .filter((p) => !['Calle', '1ro', '2do', '3ro', '4to'].includes(p))
                      .map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    <option value="__custom__">➕ Otra ubicación / calle...</option>
                  </select>

                  {editIsCustomPiso && (
                    <input
                      type="text"
                      placeholder="Escribe la ubicación o calle..."
                      value={editCustomPisoText}
                      onChange={(e) => setEditCustomPisoText(e.target.value)}
                      className="mt-2 w-full text-xs font-semibold px-3 py-2 border border-amber-400 bg-amber-50/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500"
                      autoFocus
                    />
                  )}
                </div>

                <div>
                  <label className="text-xs font-bold text-stone-700 block mb-1">Tipo de Cuenta:</label>
                  <select
                    value={editClientType}
                    onChange={(e) => setEditClientType(e.target.value as 'semanal' | 'diaria')}
                    className="w-full text-xs font-semibold px-3 py-2 border border-stone-300 rounded-xl bg-white focus:outline-none"
                  >
                    <option value="semanal">Cuenta Semanal</option>
                    <option value="diaria">Cuenta Diaria</option>
                  </select>
                </div>
              </div>

              {/* Phone with Peruvian +51 flag prefix */}
              <div>
                <label className="text-xs font-bold text-stone-700 block mb-1">
                  Teléfono / WhatsApp:
                </label>
                <div className="flex rounded-xl overflow-hidden border border-stone-300 focus-within:ring-2 focus-within:ring-amber-500">
                  <span className="bg-stone-100 px-3 py-2 text-stone-700 font-bold text-xs flex items-center border-r border-stone-300">
                    🇵🇪 +51
                  </span>
                  <input
                    type="tel"
                    placeholder="987654321"
                    value={editClientPhone}
                    onChange={(e) => setEditClientPhone(e.target.value)}
                    className="w-full text-xs px-3 py-2 focus:outline-none"
                  />
                </div>
                <p className="text-[10px] text-stone-500 mt-1">
                  El número guardado se utiliza para abrir el WhatsApp directamente con el estado de cuenta y recibos.
                </p>
              </div>

              <div>
                <label className="text-xs font-bold text-stone-700 block mb-1">Nota adicional (opcional):</label>
                <input
                  type="text"
                  placeholder="Ej. Paga los sábados, horario de almuerzo..."
                  value={editClientNotes}
                  onChange={(e) => setEditClientNotes(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-stone-300 rounded-xl focus:outline-none"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingClient(null)}
                  className="w-1/3 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold rounded-xl transition-colors text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="w-2/3 py-2.5 bg-amber-800 hover:bg-amber-900 text-white font-bold rounded-xl shadow-xs transition-colors text-xs"
                >
                  Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: ESTADO DE CUENTA DETALLADO (Liquidación Mensual)                   */}
      {/* ========================================================================= */}
      {statementClient && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-stone-200 overflow-hidden my-auto animate-in zoom-in-95 duration-150">
            <div className="bg-stone-900 text-white p-4 flex items-center justify-between">
              <div>
                <span className="text-xs text-amber-400 font-bold uppercase">
                  Estado de Cuenta {selectedMonth}
                </span>
                <h3 className="font-extrabold text-base sm:text-lg">
                  {statementClient.name} ({statementClient.piso})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setStatementClient(null)}
                className="text-stone-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto text-xs">
              {/* Detailed Consumptions */}
              <div>
                <h4 className="font-bold text-stone-800 uppercase text-[11px] mb-2">
                  Consumos del Mes ({selectedMonth}):
                </h4>
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {consumptions
                    .filter((c) => c.clientId === statementClient.id && c.date.startsWith(selectedMonth))
                    .map((c) => (
                      <div key={c.id} className="p-2 bg-stone-50 rounded-lg border border-stone-200 flex justify-between">
                        <div>
                          <div className="font-bold text-stone-900">
                            {c.dayOfWeek} {c.date}: {c.lunches.map((l) => `${l.quantity}x ${l.menuType === 'menu_completo' ? 'Menú Completo' : 'Segundo Solo'}`).join(', ')}
                          </div>
                          {c.extras.length > 0 && (
                            <div className="text-[10px] text-emerald-800">
                              +{c.extras.map((e) => `${e.quantity} ${e.name}`).join(', ')}
                            </div>
                          )}
                        </div>
                        <span className="font-black text-amber-900">{formatCurrency(c.total)}</span>
                      </div>
                    ))}
                </div>
              </div>

              {/* Detailed Payments */}
              <div>
                <h4 className="font-bold text-stone-800 uppercase text-[11px] mb-2">
                  Abonos Realizados:
                </h4>
                <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                  {payments
                    .filter((p) => p.clientId === statementClient.id && p.date.startsWith(selectedMonth))
                    .map((p) => (
                      <div key={p.id} className="p-2 bg-emerald-50 rounded-lg border border-emerald-200 flex justify-between items-center text-emerald-950">
                        <div>
                          <span className="font-bold">{p.dayOfWeek} {p.date}:</span>{' '}
                          <span className="uppercase text-[10px] font-bold px-1 bg-white rounded border border-emerald-300">{p.method}</span>
                        </div>
                        <span className="font-black text-emerald-900">{formatCurrency(p.amount)}</span>
                      </div>
                    ))}
                </div>
              </div>

              {/* Totals Summary */}
              <div className="p-3 bg-stone-100 rounded-xl space-y-1 text-xs">
                {(() => {
                  const totalC = consumptions
                    .filter((c) => c.clientId === statementClient.id && c.date.startsWith(selectedMonth))
                    .reduce((s, c) => s + c.total, 0);
                  const totalP = payments
                    .filter((p) => p.clientId === statementClient.id && p.date.startsWith(selectedMonth))
                    .reduce((s, p) => s + p.amount, 0);
                  const balance = totalC - totalP;
                  return (
                    <>
                      <div className="flex justify-between text-stone-600">
                        <span>Total Consumos:</span>
                        <span className="font-bold">{formatCurrency(totalC)}</span>
                      </div>
                      <div className="flex justify-between text-emerald-800">
                        <span>Total Abonos Realizados:</span>
                        <span className="font-bold">{formatCurrency(totalP)}</span>
                      </div>
                      <div className="flex justify-between text-base font-black pt-2 border-t border-stone-300 text-stone-900">
                        <span>Saldo Pendiente de Cobro:</span>
                        <span className={balance > 0 ? 'text-rose-700' : 'text-emerald-700'}>
                          {formatCurrency(Math.max(0, balance))}
                        </span>
                      </div>
                    </>
                  );
                })()}
              </div>

              {/* Actions */}
              <div className="grid grid-cols-2 gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    handleOpenPaymentModal(statementClient);
                    setStatementClient(null);
                  }}
                  className="py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl text-center transition-colors"
                >
                  + Registrar Abono
                </button>

                <button
                  type="button"
                  onClick={() => handleSendWhatsApp(statementClient, selectedMonth)}
                  className="py-2.5 bg-stone-900 hover:bg-black text-white font-bold rounded-xl flex items-center justify-center gap-1.5 transition-colors"
                  title="Enviar por WhatsApp (+51)"
                >
                  <Share2 className="w-4 h-4 text-emerald-400" />
                  <span>Enviar x WhatsApp</span>
                </button>
              </div>

              {/* Botón Reversa a Cuenta Diaria */}
              <button
                type="button"
                onClick={() => {
                  const cl = statementClient;
                  setStatementClient(null);
                  handleOpenTransformWeeklyToDaily(cl);
                }}
                className="w-full mt-2 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-2xs"
                title="Revertir y cambiar este cliente a Cuenta Diaria"
              >
                <RotateCcw className="w-3.5 h-3.5 text-amber-800" />
                <span>Revertir a Cuenta Diaria</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: GESTIONAR CATÁLOGO DE ADICIONALES Y BEBIDAS                        */}
      {/* ========================================================================= */}
      {showManageExtrasModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-stone-200 overflow-hidden my-auto animate-in zoom-in-95 duration-150">
            <div className="bg-stone-900 text-white p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-amber-400" />
                <h3 className="font-extrabold text-base sm:text-lg">
                  Catálogo de Adicionales y Bebidas
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowManageExtrasModal(false)}
                className="text-stone-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 sm:p-5 space-y-4 max-h-[80vh] overflow-y-auto">
              {/* Formulario para agregar nuevo adicional */}
              <form onSubmit={handleAddNewExtra} className="bg-stone-50 border border-stone-200 rounded-xl p-3.5 space-y-3">
                <span className="text-xs font-black uppercase text-stone-800 block">
                  + Agregar Nuevo Adicional
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-[11px] font-bold text-stone-600 block mb-1">
                      Nombre del Producto:
                    </label>
                    <input
                      type="text"
                      placeholder="Ej. Inca Kola 500ml, Huevo..."
                      value={newExtraName}
                      onChange={(e) => setNewExtraName(e.target.value)}
                      className="w-full text-xs font-semibold px-3 py-2 border border-stone-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-amber-600"
                      required
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-stone-600 block mb-1">
                      Precio de Venta (S/.):
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      min="0.5"
                      placeholder="3.00"
                      value={newExtraPrice}
                      onChange={(e) => setNewExtraPrice(e.target.value)}
                      className="w-full text-xs font-black px-3 py-2 border border-stone-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-amber-600"
                      required
                    />
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                  <div className="flex items-center gap-2">
                    <label className="text-[11px] font-bold text-stone-600">Categoría:</label>
                    <select
                      value={newExtraCategory}
                      onChange={(e) => setNewExtraCategory(e.target.value as ExtraCategory)}
                      className="text-xs font-semibold px-2.5 py-1.5 border border-stone-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-amber-600"
                    >
                      <option value="Bebidas">🥤 Bebidas</option>
                      <option value="Panes">🥪 Panes</option>
                      <option value="Extras">🍳 Extras</option>
                      <option value="Especial">⭐ Especial</option>
                      <option value="Dulces">🍰 Dulces</option>
                    </select>
                  </div>

                  <button
                    type="submit"
                    className="px-4 py-2 bg-amber-800 hover:bg-amber-900 text-white font-bold rounded-xl text-xs shadow-xs transition-colors"
                  >
                    + Agregar al Catálogo
                  </button>
                </div>
              </form>

              {/* Lista de Adicionales Configurados */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase text-stone-700">
                    Productos Registrados ({extrasCatalog.length}):
                  </span>
                  <span className="text-[11px] text-stone-500">
                    Disponibles para pedidos y mesa
                  </span>
                </div>

                <div className="divide-y divide-stone-100 border border-stone-200 rounded-xl overflow-hidden bg-white">
                  {extrasCatalog.length === 0 ? (
                    <div className="p-4 text-center text-xs text-stone-400">
                      No hay productos adicionales registrados en el catálogo.
                    </div>
                  ) : (
                    extrasCatalog.map((extra) => (
                      <div key={extra.id} className="p-2.5 flex items-center justify-between hover:bg-stone-50 transition-colors">
                        <div className="flex items-center gap-2.5">
                          <span className="text-base">
                            {getCategoryIcon(extra.category)}
                          </span>
                          <div>
                            <span className="font-extrabold text-xs text-stone-900 block">
                              {extra.name}
                            </span>
                            <span className="text-[10px] font-bold text-stone-500 uppercase">
                              {normalizeExtraCategory(extra.category)}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <span className="font-black text-sm text-stone-900">
                            {formatCurrency(extra.price)}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleDeleteExtra(extra.id)}
                            className="p-1 text-stone-400 hover:text-rose-600 rounded hover:bg-rose-50 transition-colors"
                            title="Eliminar este producto del catálogo"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setShowManageExtrasModal(false)}
                  className="w-full py-2.5 bg-stone-800 hover:bg-stone-900 text-white font-bold rounded-xl text-xs transition-colors"
                >
                  Listo / Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: AGREGAR PRODUCTO A CUENTA DIARIA EXISTENTE                        */}
      {/* ========================================================================= */}
      {addProductTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-stone-200 overflow-hidden my-auto animate-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="bg-amber-900 p-4 text-white flex items-center justify-between shrink-0">
              <div>
                <span className="text-[11px] text-amber-200 uppercase font-bold tracking-wider">
                  Cuenta Diaria ({addProductTarget.piso})
                </span>
                <h3 className="font-extrabold text-base sm:text-lg leading-tight">
                  Agregar a la Cuenta: {addProductTarget.clientName}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setAddProductTarget(null)}
                className="text-amber-200 hover:text-white p-1 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">
              {/* Tarifa / Lugar de consumo */}
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-stone-600 block mb-1.5">
                  Tarifa / Lugar:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAddProdLocation('mesa')}
                    className={`p-2.5 rounded-xl border text-center font-bold text-xs flex flex-col items-center justify-center gap-0.5 transition-all ${
                      addProdLocation === 'mesa'
                        ? 'border-amber-600 bg-amber-50 text-amber-950 ring-2 ring-amber-500/40 shadow-xs'
                        : 'border-stone-200 text-stone-700 hover:bg-stone-50'
                    }`}
                  >
                    <span className="text-xs font-extrabold flex items-center gap-1">
                      🍽️ Mesa
                    </span>
                    <span className="text-[10px] font-medium text-amber-800">
                      Comp: {formatCurrency(BASE_PRICES.mesa.menu_completo)} • Solo: {formatCurrency(BASE_PRICES.mesa.solo_segundo)}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAddProdLocation('tienda')}
                    className={`p-2.5 rounded-xl border text-center font-bold text-xs flex flex-col items-center justify-center gap-0.5 transition-all ${
                      addProdLocation === 'tienda'
                        ? 'border-amber-600 bg-amber-50 text-amber-950 ring-2 ring-amber-500/40 shadow-xs'
                        : 'border-stone-200 text-stone-700 hover:bg-stone-50'
                    }`}
                  >
                    <span className="text-xs font-extrabold flex items-center gap-1">
                      🏪 Tienda / Salón
                    </span>
                    <span className="text-[10px] font-medium text-amber-800">
                      Comp: {formatCurrency(BASE_PRICES.tienda.menu_completo)} • Solo: {formatCurrency(BASE_PRICES.tienda.solo_segundo)}
                    </span>
                  </button>
                </div>
              </div>

              {/* 1. SELECCIÓN DE ALMUERZOS: Menú Completo y Solo Segundo simultáneos */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black uppercase tracking-wider text-stone-700">
                    Almuerzos (Puedes combinar ambos):
                  </label>
                  <span className="text-[11px] text-stone-500 font-medium">
                    Cantidad por tipo
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {/* Tarjeta Menú Completo */}
                  <div
                    className={`p-3 rounded-2xl border transition-all ${
                      addProdCompletoQty > 0
                        ? 'bg-amber-50/80 border-amber-500 ring-2 ring-amber-400/40 shadow-xs'
                        : 'bg-white border-stone-200'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-1 mb-2">
                      <div>
                        <span className="text-xs sm:text-sm font-black text-stone-900 flex items-center gap-1">
                          <span>🍽️</span>
                          <span>Menú Completo</span>
                        </span>
                        <span className="text-[10px] text-stone-500 block">
                          Segundo con sopa o entrada
                        </span>
                      </div>
                      <span className="text-xs font-black text-amber-900 bg-amber-100/80 px-2 py-0.5 rounded-lg">
                        {formatCurrency(BASE_PRICES[addProdLocation].menu_completo)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-stone-100">
                      <div className="flex items-center">
                        <button
                          type="button"
                          onClick={() => setAddProdCompletoQty((q) => Math.max(0, q - 1))}
                          className="w-8 h-8 rounded-xl bg-stone-100 hover:bg-stone-200 border border-stone-200 text-stone-800 font-black flex items-center justify-center text-sm transition-colors"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          min="0"
                          value={addProdCompletoQty}
                          onChange={(e) => setAddProdCompletoQty(Math.max(0, parseInt(e.target.value) || 0))}
                          className="w-10 h-8 text-center font-black text-sm text-stone-900 focus:outline-none bg-transparent"
                        />
                        <button
                          type="button"
                          onClick={() => setAddProdCompletoQty((q) => q + 1)}
                          className="w-8 h-8 rounded-xl bg-amber-700 hover:bg-amber-800 text-white font-black flex items-center justify-center text-sm shadow-2xs transition-colors"
                        >
                          +
                        </button>
                      </div>

                      <div className="text-right">
                        <span className="text-[10px] text-stone-500 font-semibold block">Subtotal:</span>
                        <span className="text-xs font-black text-stone-900">
                          {formatCurrency(addProdCompletoQty * BASE_PRICES[addProdLocation].menu_completo)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Tarjeta Solo Segundo */}
                  <div
                    className={`p-3 rounded-2xl border transition-all ${
                      addProdSegundoQty > 0
                        ? 'bg-amber-50/80 border-amber-500 ring-2 ring-amber-400/40 shadow-xs'
                        : 'bg-white border-stone-200'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-1 mb-2">
                      <div>
                        <span className="text-xs sm:text-sm font-black text-stone-900 flex items-center gap-1">
                          <span>🥘</span>
                          <span>Solo Segundo</span>
                        </span>
                        <span className="text-[10px] text-stone-500 block">
                          Solamente plato de fondo
                        </span>
                      </div>
                      <span className="text-xs font-black text-amber-900 bg-amber-100/80 px-2 py-0.5 rounded-lg">
                        {formatCurrency(BASE_PRICES[addProdLocation].solo_segundo)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-stone-100">
                      <div className="flex items-center">
                        <button
                          type="button"
                          onClick={() => setAddProdSegundoQty((q) => Math.max(0, q - 1))}
                          className="w-8 h-8 rounded-xl bg-stone-100 hover:bg-stone-200 border border-stone-200 text-stone-800 font-black flex items-center justify-center text-sm transition-colors"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          min="0"
                          value={addProdSegundoQty}
                          onChange={(e) => setAddProdSegundoQty(Math.max(0, parseInt(e.target.value) || 0))}
                          className="w-10 h-8 text-center font-black text-sm text-stone-900 focus:outline-none bg-transparent"
                        />
                        <button
                          type="button"
                          onClick={() => setAddProdSegundoQty((q) => q + 1)}
                          className="w-8 h-8 rounded-xl bg-amber-700 hover:bg-amber-800 text-white font-black flex items-center justify-center text-sm shadow-2xs transition-colors"
                        >
                          +
                        </button>
                      </div>

                      <div className="text-right">
                        <span className="text-[10px] text-stone-500 font-semibold block">Subtotal:</span>
                        <span className="text-xs font-black text-stone-900">
                          {formatCurrency(addProdSegundoQty * BASE_PRICES[addProdLocation].solo_segundo)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 2. SELECCIÓN DE EXTRAS: Categorizado y ordenado por precio */}
              <div className="rounded-2xl border border-stone-200 bg-white overflow-hidden shadow-2xs space-y-2">
                <div className="p-3 bg-stone-50 border-b border-stone-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-base">🥤</span>
                    <div>
                      <span className="text-xs font-black uppercase tracking-wider text-stone-800 block">
                        Extras y Bebidas
                      </span>
                      <span className="text-[11px] text-stone-500">
                        {addProdSelectedExtras.length > 0 ? (
                          <strong className="text-amber-800">
                            {addProdSelectedExtras.reduce((s, i) => s + i.quantity, 0)} extras seleccionados (Subtotal: {formatCurrency(addProdSelectedExtras.reduce((s, i) => s + i.extra.price * i.quantity, 0))})
                          </strong>
                        ) : (
                          'Bebidas, Panes, Extras, Especial, Dulces'
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="p-3 space-y-2.5">
                  {/* Category Pills */}
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
                    <button
                      type="button"
                      onClick={() => setAddProdExtraCategoryFilter('Todos')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition-colors flex items-center gap-1 ${
                        addProdExtraCategoryFilter === 'Todos'
                          ? 'bg-amber-800 text-white shadow-2xs'
                          : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                      }`}
                    >
                      <span>Todos</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                          addProdExtraCategoryFilter === 'Todos'
                            ? 'bg-amber-900 text-amber-100'
                            : 'bg-white text-stone-600'
                        }`}
                      >
                        {addProdCategoryCounts.Todos}
                      </span>
                    </button>

                    {EXTRA_CATEGORIES.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setAddProdExtraCategoryFilter(cat)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition-colors flex items-center gap-1 ${
                          addProdExtraCategoryFilter === cat
                            ? 'bg-amber-800 text-white shadow-2xs'
                            : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                        }`}
                      >
                        <span>{getCategoryIcon(cat)}</span>
                        <span>{cat}</span>
                        <span
                          className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                            addProdExtraCategoryFilter === cat
                              ? 'bg-amber-900 text-amber-100'
                              : 'bg-white text-stone-600'
                          }`}
                        >
                          {addProdCategoryCounts[cat] || 0}
                        </span>
                      </button>
                    ))}
                  </div>

                  {/* Search bar */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
                    <input
                      type="text"
                      placeholder="Buscar extra (ej. Inca Kola, Pan, Huevo, Alfajor)..."
                      value={addProdExtraSearch}
                      onChange={(e) => setAddProdExtraSearch(e.target.value)}
                      className="w-full text-xs pl-8 pr-7 py-1.5 bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-600"
                    />
                    {addProdExtraSearch && (
                      <button
                        type="button"
                        onClick={() => setAddProdExtraSearch('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 text-xs font-bold"
                      >
                        ×
                      </button>
                    )}
                  </div>

                  {/* Extras Grid: Sorted by price */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1">
                    {filteredExtrasForAddProd.length === 0 ? (
                      <div className="col-span-full py-4 text-center text-xs text-stone-400">
                        No hay adicionales en esta categoría.
                      </div>
                    ) : (
                      filteredExtrasForAddProd.map((extra) => {
                        const inCart = addProdSelectedExtras.find((i) => i.extra.id === extra.id);
                        return (
                          <div
                            key={extra.id}
                            className={`p-2 rounded-xl border transition-all text-left flex flex-col justify-between ${
                              inCart
                                ? 'bg-amber-50/90 border-amber-500 shadow-2xs ring-1 ring-amber-400/40'
                                : 'bg-stone-50/60 border-stone-200 hover:border-amber-400 hover:shadow-2xs'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-1 mb-1">
                              <span className="text-xs">{getCategoryIcon(extra.category)}</span>
                              <span className="text-[10px] font-bold text-stone-600 bg-white border border-stone-200 px-1.5 py-0.2 rounded">
                                {formatCurrency(extra.price)}
                              </span>
                            </div>
                            <span className="text-xs font-extrabold text-stone-900 leading-tight mb-2 line-clamp-2">
                              {extra.name}
                            </span>

                            {inCart ? (
                              <div className="flex items-center justify-between pt-1 border-t border-amber-200">
                                <button
                                  type="button"
                                  onClick={() => handleToggleExtraInAddProduct(extra, -1)}
                                  className="w-6 h-6 rounded-md bg-white border border-amber-300 font-black text-amber-900 hover:bg-amber-100 flex items-center justify-center text-xs"
                                >
                                  -
                                </button>
                                <span className="font-black text-xs text-amber-950 px-1">
                                  {inCart.quantity}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleToggleExtraInAddProduct(extra, 1)}
                                  className="w-6 h-6 rounded-md bg-amber-700 text-white font-black hover:bg-amber-800 flex items-center justify-center text-xs"
                                >
                                  +
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleToggleExtraInAddProduct(extra, 1)}
                                className="w-full py-1 bg-white hover:bg-amber-700 hover:text-white text-stone-700 border border-stone-200 font-bold rounded-lg text-[11px] transition-colors flex items-center justify-center gap-1"
                              >
                                + Agregar
                              </button>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Bandeja de Extras Seleccionados */}
                  {addProdSelectedExtras.length > 0 && (
                    <div className="p-2.5 bg-amber-50/70 border border-amber-200 rounded-xl space-y-1">
                      <div className="flex items-center justify-between text-[11px] font-bold text-amber-900">
                        <span>Extras a agregar:</span>
                        <span>
                          Subtotal: {formatCurrency(addProdSelectedExtras.reduce((s, i) => s + i.extra.price * i.quantity, 0))}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {addProdSelectedExtras.map((item) => (
                          <span
                            key={item.extra.id}
                            className="inline-flex items-center gap-1 bg-white px-2 py-0.5 rounded-lg border border-amber-300 text-xs font-bold text-stone-800"
                          >
                            <span>{item.quantity}x {item.extra.name}</span>
                            <button
                              type="button"
                              onClick={() => handleSetExtraQtyInAddProduct(item.extra, 0)}
                              className="text-stone-400 hover:text-rose-600 font-black ml-0.5"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Notes or Dish specification */}
              <div>
                <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1">
                  Detalle / Plato / Nota (opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ej: Seco de pollo, Inka Kola helada, sin ensalada..."
                  value={addProdNotes}
                  onChange={(e) => setAddProdNotes(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              {/* Total preview */}
              {(() => {
                const priceComp = BASE_PRICES[addProdLocation].menu_completo;
                const priceSeg = BASE_PRICES[addProdLocation].solo_segundo;
                const totalLunches = addProdCompletoQty * priceComp + addProdSegundoQty * priceSeg;
                const totalExtras = addProdSelectedExtras.reduce((s, i) => s + i.extra.price * i.quantity, 0);
                const totalSum = totalLunches + totalExtras;
                const totalCount = addProdCompletoQty + addProdSegundoQty + addProdSelectedExtras.reduce((s, i) => s + i.quantity, 0);

                return (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-amber-900 block">
                        Monto a sumar a su cuenta:
                      </span>
                      <span className="text-[11px] text-stone-500">
                        {totalCount === 0
                          ? 'No hay productos seleccionados'
                          : `${addProdCompletoQty > 0 ? `${addProdCompletoQty} Completo(s) ` : ''}${addProdSegundoQty > 0 ? `${addProdSegundoQty} Segundo(s) ` : ''}${addProdSelectedExtras.length > 0 ? `${addProdSelectedExtras.reduce((s, i) => s + i.quantity, 0)} Extra(s)` : ''}`}
                      </span>
                    </div>
                    <span className="text-lg font-black text-amber-950">
                      {formatCurrency(totalSum)}
                    </span>
                  </div>
                );
              })()}
            </div>

            {/* Action buttons */}
            <div className="p-4 bg-stone-50 border-t border-stone-200 grid grid-cols-2 gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setAddProductTarget(null)}
                className="w-full py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold rounded-xl text-xs transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleAddProductToAccount}
                disabled={addProdCompletoQty === 0 && addProdSegundoQty === 0 && addProdSelectedExtras.length === 0}
                className="w-full py-2.5 bg-amber-800 hover:bg-amber-900 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black rounded-xl text-xs shadow-xs transition-colors"
              >
                Guardar en Cuenta
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: EDITAR / MODIFICAR ÍTEM EN LA CUENTA                              */}
      {/* ========================================================================= */}
      {editingAccountItem && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-100">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-stone-200 overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="bg-stone-900 p-4 text-white flex items-center justify-between">
              <div>
                <h3 className="font-extrabold text-base sm:text-lg">
                  Modificar Ítem
                </h3>
                <p className="text-xs text-stone-300">
                  Cuenta de: <span className="font-bold text-white">{editItemClientName}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingAccountItem(null)}
                className="text-stone-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl">
                <span className="text-[11px] text-stone-500 font-bold uppercase tracking-wider block">
                  Producto:
                </span>
                <span className="font-extrabold text-sm text-stone-900">
                  {editingAccountItem.type === 'lunch' ? '🍛 ' : '🥤 '}
                  {editingAccountItem.name}
                </span>
                <span className="text-xs text-stone-500 block mt-0.5">
                  Agregado el {editingAccountItem.dayOfWeek} {editingAccountItem.date}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1">
                    Cantidad
                  </label>
                  <div className="flex items-center">
                    <button
                      type="button"
                      onClick={() => setEditItemQty((q) => Math.max(1, q - 1))}
                      className="w-8 h-9 bg-stone-100 hover:bg-stone-200 border border-r-0 border-stone-200 rounded-l-xl font-black text-stone-700"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      min={1}
                      value={editItemQty}
                      onChange={(e) => setEditItemQty(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-full h-9 text-center font-bold text-sm border border-stone-200 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                    <button
                      type="button"
                      onClick={() => setEditItemQty((q) => q + 1)}
                      className="w-8 h-9 bg-stone-100 hover:bg-stone-200 border border-l-0 border-stone-200 rounded-r-xl font-black text-stone-700"
                    >
                      +
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1">
                    Precio Unitario (S/)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min={0}
                    value={editItemPrice}
                    onChange={(e) => setEditItemPrice(parseFloat(e.target.value) || 0)}
                    className="w-full h-9 px-3 text-sm font-bold border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1">
                  Nota / Plato Específico
                </label>
                <input
                  type="text"
                  placeholder="Ej: Seco de pollo, etc."
                  value={editItemNotes}
                  onChange={(e) => setEditItemNotes(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="p-3 bg-stone-100 border border-stone-200 rounded-xl flex items-center justify-between">
                <span className="text-xs font-bold text-stone-700">Nuevo Subtotal:</span>
                <span className="text-base font-black text-stone-900">
                  {formatCurrency(editItemQty * editItemPrice)}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingAccountItem(null)}
                  className="w-full py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold rounded-xl text-xs transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveEditAccountItem}
                  className="w-full py-2.5 bg-amber-800 hover:bg-amber-900 text-white font-black rounded-xl text-xs shadow-xs transition-colors"
                >
                  Guardar Cambios
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: TOMAR PEDIDO EN MESA (Registro individual de comanda por mesa)      */}
      {/* ========================================================================= */}
      {showAddMesaModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-stone-200 overflow-hidden my-auto max-h-[92vh] flex flex-col animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 bg-amber-800 text-white flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-amber-700/80 border border-amber-500/50 flex items-center justify-center shadow-xs">
                  <Utensils className="w-5 h-5 text-amber-100" />
                </div>
                <div>
                  <h3 className="font-black text-base sm:text-lg">Tomar Pedido en Mesa</h3>
                  <p className="text-xs text-amber-200">Comanda individual para salón ({selectedDate})</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddMesaModal(false)}
                className="w-8 h-8 rounded-xl bg-amber-900/60 hover:bg-amber-900 text-amber-200 flex items-center justify-center transition-colors font-bold text-base"
              >
                ✕
              </button>
            </div>

            {/* Modal Form Content */}
            <form onSubmit={handleSaveMesaOrder} className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1">
              {/* Mesa selector / name */}
              <div>
                <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5">
                  Identificador de Mesa:
                </label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {['Mesa 1', 'Mesa 2', 'Mesa 3', 'Mesa 4', 'Mesa 5', 'Mesa 6', 'Mesa 7', 'Mesa 8'].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMesaOrderDraft((prev) => ({ ...prev, mesaName: m }))}
                      className={`px-3 py-1 rounded-xl text-xs font-bold transition-colors ${
                        mesaOrderDraft.mesaName.toLowerCase() === m.toLowerCase()
                          ? 'bg-amber-800 text-white shadow-xs'
                          : 'bg-stone-100 text-stone-700 hover:bg-stone-200 border border-stone-200'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  required
                  value={mesaOrderDraft.mesaName}
                  onChange={(e) => setMesaOrderDraft((prev) => ({ ...prev, mesaName: e.target.value }))}
                  placeholder="O escribe nombre personalizado (ej: Mesa 1, Barra, etc.)"
                  className="w-full text-sm font-bold px-3 py-2 border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              {/* Platillos de Mesa (Tarifas Salón) */}
              <div className="space-y-2.5">
                <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider">
                  Platos Solicitados (Tarifas de Mesa):
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {/* Menú Completo */}
                  <div className="p-3 bg-amber-50/60 border border-amber-200 rounded-2xl flex flex-col justify-between">
                    <div className="flex justify-between items-center mb-2">
                      <div>
                        <span className="font-extrabold text-stone-900 text-xs sm:text-sm block">🍽️ Menú Completo</span>
                        <span className="text-[11px] text-amber-800 font-semibold">{formatCurrency(BASE_PRICES.mesa.menu_completo)} c/u</span>
                      </div>
                      <span className="font-black text-xs text-amber-950">
                        {formatCurrency(mesaOrderDraft.menuCompletoQty * BASE_PRICES.mesa.menu_completo)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          setMesaOrderDraft((prev) => ({
                            ...prev,
                            menuCompletoQty: Math.max(0, prev.menuCompletoQty - 1),
                          }))
                        }
                        className="w-8 h-8 rounded-xl bg-white border border-stone-300 text-stone-700 font-bold flex items-center justify-center hover:bg-stone-100"
                      >
                        -
                      </button>
                      <span className="flex-1 text-center font-black text-base text-stone-900">
                        {mesaOrderDraft.menuCompletoQty}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setMesaOrderDraft((prev) => ({
                            ...prev,
                            menuCompletoQty: prev.menuCompletoQty + 1,
                          }))
                        }
                        className="w-8 h-8 rounded-xl bg-amber-700 hover:bg-amber-800 text-white font-bold flex items-center justify-center"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  {/* Segundo Solo */}
                  <div className="p-3 bg-amber-50/60 border border-amber-200 rounded-2xl flex flex-col justify-between">
                    <div className="flex justify-between items-center mb-2">
                      <div>
                        <span className="font-extrabold text-stone-900 text-xs sm:text-sm block">🍛 Segundo Solo</span>
                        <span className="text-[11px] text-amber-800 font-semibold">{formatCurrency(BASE_PRICES.mesa.solo_segundo)} c/u</span>
                      </div>
                      <span className="font-black text-xs text-amber-950">
                        {formatCurrency(mesaOrderDraft.soloSegundoQty * BASE_PRICES.mesa.solo_segundo)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          setMesaOrderDraft((prev) => ({
                            ...prev,
                            soloSegundoQty: Math.max(0, prev.soloSegundoQty - 1),
                          }))
                        }
                        className="w-8 h-8 rounded-xl bg-white border border-stone-300 text-stone-700 font-bold flex items-center justify-center hover:bg-stone-100"
                      >
                        -
                      </button>
                      <span className="flex-1 text-center font-black text-base text-stone-900">
                        {mesaOrderDraft.soloSegundoQty}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setMesaOrderDraft((prev) => ({
                            ...prev,
                            soloSegundoQty: prev.soloSegundoQty + 1,
                          }))
                        }
                        className="w-8 h-8 rounded-xl bg-amber-700 hover:bg-amber-800 text-white font-bold flex items-center justify-center"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Extras y Bebidas */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider">
                  Bebidas y Adicionales:
                </label>
                <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-1 bg-stone-50 border border-stone-200 rounded-xl">
                  {extrasCatalog.map((ex) => (
                    <button
                      key={ex.id}
                      type="button"
                      onClick={() => {
                        setMesaOrderDraft((prev) => {
                          const existingIdx = prev.selectedExtras.findIndex((item) => item.extra.id === ex.id);
                          if (existingIdx >= 0) {
                            const copy = [...prev.selectedExtras];
                            copy[existingIdx].quantity += 1;
                            return { ...prev, selectedExtras: copy };
                          }
                          return {
                            ...prev,
                            selectedExtras: [...prev.selectedExtras, { extra: ex, quantity: 1 }],
                          };
                        });
                      }}
                      className="px-2.5 py-1 bg-white hover:bg-amber-50 hover:border-amber-400 border border-stone-200 rounded-lg text-xs font-bold text-stone-800 shadow-2xs transition-colors"
                    >
                      + {ex.name} ({formatCurrency(ex.price)})
                    </button>
                  ))}
                </div>

                {mesaOrderDraft.selectedExtras.length > 0 && (
                  <div className="space-y-1 bg-stone-100/80 p-2.5 rounded-xl border border-stone-200 text-xs">
                    {mesaOrderDraft.selectedExtras.map((item, idx) => (
                      <div key={item.extra.id} className="flex justify-between items-center">
                        <span className="font-semibold text-stone-800">
                          {item.quantity}x {item.extra.name} ({formatCurrency(item.extra.price)} c/u)
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="font-black text-stone-900">
                            {formatCurrency(item.extra.price * item.quantity)}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setMesaOrderDraft((prev) => ({
                                ...prev,
                                selectedExtras: prev.selectedExtras.filter((_, i) => i !== idx),
                              }));
                            }}
                            className="text-stone-400 hover:text-rose-600 font-black px-1.5"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Nota / Indicaciones */}
              <div>
                <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1">
                  Nota / Preferencia (Opcional):
                </label>
                <input
                  type="text"
                  placeholder="Ej: Sin ensalada, bien cocido, gaseosa helada, etc."
                  value={mesaOrderDraft.notes}
                  onChange={(e) => setMesaOrderDraft((prev) => ({ ...prev, notes: e.target.value }))}
                  className="w-full text-xs px-3 py-2 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              {/* Estado de Cobro de la comanda */}
              <div className="p-3 bg-stone-50 border border-stone-200 rounded-2xl space-y-2">
                <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider">
                  Cobro de la Comanda:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setMesaOrderDraft((prev) => ({ ...prev, paymentStatus: 'pendiente' }))}
                    className={`py-2 px-3 rounded-xl text-xs font-bold transition-colors border ${
                      mesaOrderDraft.paymentStatus === 'pendiente'
                        ? 'bg-amber-800 text-white border-amber-800 shadow-xs'
                        : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-100'
                    }`}
                  >
                    🔴 Cobrar al final
                  </button>
                  <button
                    type="button"
                    onClick={() => setMesaOrderDraft((prev) => ({ ...prev, paymentStatus: 'pagado' }))}
                    className={`py-2 px-3 rounded-xl text-xs font-bold transition-colors border ${
                      mesaOrderDraft.paymentStatus === 'pagado'
                        ? 'bg-emerald-700 text-white border-emerald-700 shadow-xs'
                        : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-100'
                    }`}
                  >
                    ✓ Pagado de inmediato
                  </button>
                </div>

                {mesaOrderDraft.paymentStatus === 'pagado' && (
                  <div className="pt-2 flex items-center gap-2">
                    <span className="text-xs font-bold text-stone-600">Método:</span>
                    <button
                      type="button"
                      onClick={() => setMesaOrderDraft((prev) => ({ ...prev, paymentMethod: 'efectivo' }))}
                      className={`px-3 py-1 rounded-lg text-xs font-bold ${
                        mesaOrderDraft.paymentMethod === 'efectivo'
                          ? 'bg-emerald-700 text-white'
                          : 'bg-white border border-stone-200 text-stone-700'
                      }`}
                    >
                      💵 Efectivo
                    </button>
                    <button
                      type="button"
                      onClick={() => setMesaOrderDraft((prev) => ({ ...prev, paymentMethod: 'yape' }))}
                      className={`px-3 py-1 rounded-lg text-xs font-bold ${
                        mesaOrderDraft.paymentMethod === 'yape'
                          ? 'bg-purple-700 text-white'
                          : 'bg-white border border-stone-200 text-stone-700'
                      }`}
                    >
                      📱 Yape
                    </button>
                  </div>
                )}
              </div>

              {/* Total Comanda */}
              <div className="p-3 bg-amber-900 text-white rounded-2xl flex items-center justify-between shadow-xs">
                <span className="text-xs font-bold text-amber-200 uppercase tracking-wider">
                  Total de la Comanda:
                </span>
                <span className="text-xl font-black">
                  {formatCurrency(
                    mesaOrderDraft.menuCompletoQty * BASE_PRICES.mesa.menu_completo +
                      mesaOrderDraft.soloSegundoQty * BASE_PRICES.mesa.solo_segundo +
                      mesaOrderDraft.selectedExtras.reduce((sum, item) => sum + item.extra.price * item.quantity, 0)
                  )}
                </span>
              </div>

              {/* Actions */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddMesaModal(false)}
                  className="w-full py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold rounded-xl text-xs transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="w-full py-2.5 bg-amber-800 hover:bg-amber-900 text-white font-black rounded-xl text-xs shadow-xs transition-colors"
                >
                  Guardar Comanda
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: TRANSFORMAR CUENTA DIARIA A CUENTA SEMANAL                          */}
      {/* ========================================================================= */}
      {showTransformModal && accountToTransform && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-stone-200 overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="p-4 sm:p-5 bg-blue-900 text-white flex items-center gap-3">
              <div className="p-2.5 bg-blue-800 rounded-2xl">
                <Calendar className="w-6 h-6 text-blue-200" />
              </div>
              <div>
                <h3 className="font-black text-base sm:text-lg">Transformar a Cuenta Semanal</h3>
                <p className="text-xs text-blue-200">Convertir cliente y sus pedidos diarios</p>
              </div>
            </div>

            <div className="p-5 space-y-4">
              <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-2xl space-y-1">
                <div className="text-xs text-blue-950 font-bold">
                  Cliente: <span className="font-black text-sm">{accountToTransform.clientName}</span> ({accountToTransform.piso})
                </div>
                <div className="text-xs text-blue-900">
                  Total consumos anotados: <strong>{formatCurrency(accountToTransform.totalConsumed)}</strong> ({accountToTransform.consumptions.length} pedido(s))
                </div>
                <div className="text-xs text-blue-900">
                  Saldo pendiente actual: <strong className="text-rose-700">{formatCurrency(accountToTransform.saldoPendiente)}</strong>
                </div>
              </div>

              <p className="text-xs sm:text-sm text-stone-600 leading-relaxed font-medium">
                Al transformar esta cuenta a <strong>Cuenta Semanal</strong>, el cliente aparecerá en la pestaña principal de Cuentas Semanales. Todos sus consumos diarios se asignarán automáticamente al día de la semana correspondiente (Lunes a Sábado), manteniendo intacto cada plato, extra y saldo para liquidar al cierre de semana.
              </p>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowTransformModal(false);
                    setAccountToTransform(null);
                  }}
                  className="w-full py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold rounded-xl text-xs transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleConfirmTransformToWeekly();
                    setShowTransformModal(false);
                    setAccountToTransform(null);
                  }}
                  className="w-full py-2.5 bg-blue-800 hover:bg-blue-900 text-white font-black rounded-xl text-xs shadow-xs transition-colors"
                >
                  Sí, Transformar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {confirmModal && confirmModal.isOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-100">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-stone-200 overflow-hidden animate-in zoom-in-95 duration-150">
            <div className={`p-4 text-white flex items-center gap-3 ${confirmModal.isDestructive ? 'bg-rose-700' : 'bg-stone-900'}`}>
              <div className="p-2 bg-white/20 rounded-xl">
                <AlertTriangle className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="font-extrabold text-base sm:text-lg">{confirmModal.title}</h3>
              </div>
            </div>

            <div className="p-5 space-y-3">
              <p className="text-sm text-stone-700 leading-relaxed font-medium">
                {confirmModal.message}
              </p>

              {confirmModal.detail && (
                <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 text-xs text-stone-700 font-medium break-words">
                  {confirmModal.detail}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setConfirmModal(null)}
                  className="w-full py-2.5 px-4 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold rounded-xl transition-colors text-xs sm:text-sm"
                >
                  {confirmModal.cancelLabel || 'Cancelar'}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const action = confirmModal.onConfirm;
                    setConfirmModal(null);
                    action();
                  }}
                  className={`w-full py-2.5 px-4 font-bold rounded-xl transition-colors text-xs sm:text-sm shadow-xs ${
                    confirmModal.isDestructive
                      ? 'bg-rose-600 hover:bg-rose-700 text-white'
                      : 'bg-amber-800 hover:bg-amber-900 text-white'
                  }`}
                >
                  {confirmModal.confirmLabel || 'Confirmar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* ========================================================================= */}
      {/* MODAL: DIRECTORIO Y ADMINISTRACIÓN DE CLIENTES                            */}
      {/* ========================================================================= */}
      <ClientsDirectoryModal
        isOpen={showClientsDirectoryModal}
        onClose={() => setShowClientsDirectoryModal(false)}
        clients={clients}
        consumptions={consumptions}
        payments={payments}
        onEditClient={(client) => handleOpenEditClient(client)}
        onNewClient={() => {
          setShowNewClientModal(true);
        }}
        onDeleteClient={(clientId, clientName) => handleRemoveClient(clientId, clientName)}
        onMergeClients={(mainId, secIds) => handleMergeClients(mainId, secIds)}
      />

      {/* ========================================================================= */}
      {/* MODAL: COMBINAR PEDIDOS Y ADICIONALES (UNIFICAR EN PEDIDO PRINCIPAL)       */}
      {/* ========================================================================= */}
      <MergeConsumptionsModal
        isOpen={showMergeConsModal}
        onClose={() => {
          setShowMergeConsModal(false);
          setMergeMainConsId(null);
        }}
        consumptions={consumptions}
        clients={clients}
        initialMainConsId={mergeMainConsId}
        onMergeConsumptions={(mainId, secIds) => handleExecuteMergeConsumptions(mainId, secIds)}
      />
    </div>
  );
};
