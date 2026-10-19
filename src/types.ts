export type ClientType = 'mesa' | 'tienda';

export type AccountType = 'semanal' | 'diaria' | 'mesa';

export type MenuType = 'menu_completo' | 'solo_segundo';

export type PaymentMethod = 'efectivo' | 'yape';

export type DayOfWeek = 'Lunes' | 'Martes' | 'Miércoles' | 'Jueves' | 'Viernes' | 'Sábado';

export type ExtraCategory = 'Bebidas' | 'Panes' | 'Extras' | 'Especial' | 'Dulces';

export interface ExtraItem {
  id: string;
  name: string;
  description?: string;
  price: number; // in Soles (S/.)
  category?: ExtraCategory;
}

export interface LunchItem {
  id: string;
  clientType: ClientType; // 'mesa' (S/ 13 o S/ 12) vs 'tienda' (S/ 12 o S/ 11)
  menuType: MenuType;     // 'menu_completo' vs 'solo_segundo'
  entrada?: string;       // Solo si es menu_completo
  segundo: string;
  notes?: string;
  quantity: number;
  unitPrice: number;      // Calculado según las reglas de precio
  totalPrice: number;
}

export interface OrderExtraItem {
  id: string;
  extraId?: string;
  name: string;
  description?: string;
  price: number;
  quantity: number;
  totalPrice: number;
}

export interface ClientRecord {
  id: string;
  name: string;
  piso: string; // ej. "Piso 1", "Piso 2", "Piso 3", "Piso 4", "Sótano"
  accountType: 'semanal' | 'diaria';
  phone?: string;
  notes?: string;
  active: boolean;
}

export interface ConsumptionRecord {
  id: string;
  clientId: string;
  clientName: string;
  piso: string;
  accountType: 'semanal' | 'diaria';
  date: string; // YYYY-MM-DD
  dayOfWeek: DayOfWeek;
  timestamp: string; // ISO
  lunches: LunchItem[];
  extras: OrderExtraItem[];
  total: number;
  paymentStatus: 'pagado' | 'pendiente';
  paymentMethod?: PaymentMethod | 'abono'; // 'abono': liquidado con abonos previos (no suma otra vez a caja)
  paymentDate?: string;
  notes?: string;
}

export interface PaymentRecord {
  id: string;
  clientId: string;
  clientName: string;
  piso: string;
  accountType: 'semanal' | 'diaria';
  date: string; // YYYY-MM-DD
  dayOfWeek: DayOfWeek;
  amount: number; // S/.
  method: PaymentMethod; // 'efectivo' | 'yape'
  notes?: string;
  timestamp: string;
  isDpPayment?: boolean;
  isDaPayment?: boolean;
}

export interface MesaCounterRecord {
  id: string;
  date: string; // YYYY-MM-DD
  dayOfWeek: DayOfWeek;
  menuCompletoCount: number; // S/ 13
  soloSegundoCount: number;   // S/ 12
  extras: OrderExtraItem[];
  efectivoAmount: number;
  yapeAmount: number;
  totalAmount: number;
  timestamp: string;
  notes?: string;
}

export interface Order {
  id: string;
  orderNumber: number;
  timestamp: string; // ISO string
  customerOrLocation: string; // ej. "Mesa", "Tienda Don Pepe (Piso 1)"
  clientType: ClientType;
  accountType?: 'semanal' | 'diaria' | 'mesa';
  piso?: string;
  clientId?: string;
  lunches: LunchItem[];
  extras: OrderExtraItem[];
  total: number;
  paymentMethod: PaymentMethod;
  paymentStatus: 'pagado' | 'pendiente';
  amountReceived?: number;
  change?: number;
  notes?: string;
}

export interface PriceRule {
  clientType: ClientType;
  menuType: MenuType;
  price: number;
}

export const BASE_PRICES: Record<ClientType, Record<MenuType, number>> = {
  mesa: {
    menu_completo: 13.0,
    solo_segundo: 12.0,
  },
  tienda: {
    menu_completo: 12.0,
    solo_segundo: 11.0,
  },
};

export const WORK_DAYS: DayOfWeek[] = [
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
];

export const DEFAULT_PISOS = [
  'Calle',
  '1ro',
  '2do',
  '3ro',
  '4to',
];

export function normalizePiso(piso?: string): string {
  if (!piso) return '1ro';
  const trimmed = piso.trim();
  if (/^(piso\s*1|1(?:er|ro)?\s*piso)$/i.test(trimmed)) return '1ro';
  if (/^(piso\s*2|2(?:do)?\s*piso)$/i.test(trimmed)) return '2do';
  if (/^(piso\s*3|3(?:er|ro)?\s*piso)$/i.test(trimmed)) return '3ro';
  if (/^(piso\s*4|4(?:to)?\s*piso)$/i.test(trimmed)) return '4to';
  if (/^calle$/i.test(trimmed)) return 'Calle';
  if (/^mesa(\s*\d+)?$/i.test(trimmed)) return 'Mesa';
  return trimmed;
}

