/**
 * Datos de demostración (antes vivían en src/db/database.ts).
 * Ya NO se siembran automáticamente en la nube: se conservan para pruebas
 * y para compatibilidad con imports existentes.
 */
import { ClientRecord, ConsumptionRecord, PaymentRecord, MesaCounterRecord, DayOfWeek } from '../types';
import { getDayOfWeekName, getTodayDateString } from '../utils/dates';

// Default initial clients organized by floor / location
export const INITIAL_CLIENTS: ClientRecord[] = [
  // Calle
  {
    id: 'cli-calle-1',
    name: 'Puesto Calzado Ramos (Calle)',
    piso: 'Calle',
    accountType: 'diaria',
    phone: '998877665',
    notes: 'Cliente de la calle, entrega rápida',
    active: true,
  },
  {
    id: 'cli-calle-2',
    name: 'Kiosko El Paso (Calle)',
    piso: 'Calle',
    accountType: 'semanal',
    phone: '987112233',
    notes: 'Paga con Yape todos los viernes',
    active: true,
  },
  // 1ro
  {
    id: 'cli-p1-1',
    name: 'Zapatería Marco',
    piso: '1ro',
    accountType: 'semanal',
    phone: '987654321',
    notes: 'Paga los sábados en la tarde',
    active: true,
  },
  {
    id: 'cli-p1-2',
    name: 'Bodega San Martín',
    piso: '1ro',
    accountType: 'diaria',
    phone: '991234567',
    notes: 'A veces paga al día siguiente',
    active: true,
  },
  {
    id: 'cli-p1-3',
    name: 'Farmacia Santa Rosa',
    piso: '1ro',
    accountType: 'semanal',
    phone: '984556677',
    notes: 'Paga con Yape',
    active: true,
  },
  // 2do
  {
    id: 'cli-p2-1',
    name: 'Boutique Betty',
    piso: '2do',
    accountType: 'semanal',
    phone: '976543210',
    notes: 'Almuerzan 2 personas fijo',
    active: true,
  },
  {
    id: 'cli-p2-2',
    name: 'Sastrería Don Lucho',
    piso: '2do',
    accountType: 'diaria',
    phone: '965432198',
    notes: 'Pide solo segundo casi siempre',
    active: true,
  },
  {
    id: 'cli-p2-3',
    name: 'Joyería La Esmeralda',
    piso: '2do',
    accountType: 'semanal',
    phone: '954321987',
    notes: 'Paga quincenal o fin de mes',
    active: true,
  },
  // 3ro
  {
    id: 'cli-p3-1',
    name: 'Técnicos Celulares Alex',
    piso: '3ro',
    accountType: 'semanal',
    phone: '943219876',
    notes: 'Suelen pedir gaseosa extra',
    active: true,
  },
  {
    id: 'cli-p3-2',
    name: 'Puesto 304 - Novedades Patty',
    piso: '3ro',
    accountType: 'diaria',
    phone: '932198765',
    notes: 'Paga al terminar el día',
    active: true,
  },
  // 4to
  {
    id: 'cli-p4-1',
    name: 'Oficina Contable Díaz',
    piso: '4to',
    accountType: 'semanal',
    phone: '921987654',
    notes: 'Cobro mensual acordado a fin de mes',
    active: true,
  },
  {
    id: 'cli-p4-2',
    name: 'Estudio Fotográfico Imagen',
    piso: '4to',
    accountType: 'diaria',
    phone: '910987654',
    notes: 'Paga interdiario',
    active: true,
  },
];

// Generate sample initial consumptions for the current week so the notebook is ready to show
export function generateInitialConsumptions(): ConsumptionRecord[] {
  const today = new Date();
  // Get Monday of this week
  const dayOfWeek = today.getDay(); // 0 is Sun
  const diffToMonday = today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1);
  const monday = new Date(today);
  monday.setDate(diffToMonday);

  const consumptions: ConsumptionRecord[] = [];

  const daysOffsets = [0, 1, 2, 3, 4, 5]; // Mon to Sat
  const dayNames: DayOfWeek[] = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

  daysOffsets.forEach((offset, idx) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + offset);
    if (d > today) return; // don't seed future days

    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dayStr = String(d.getDate()).padStart(2, '0');
    const dateFormatted = `${y}-${m}-${dayStr}`;
    const dayName = dayNames[idx];

    // Seed Zapatería Marco (Semanal 1ro)
    consumptions.push({
      id: `cons-seed-1-${idx}`,
      clientId: 'cli-p1-1',
      clientName: 'Zapatería Marco',
      piso: '1ro',
      accountType: 'semanal',
      date: dateFormatted,
      dayOfWeek: dayName,
      timestamp: `${dateFormatted}T13:15:00.000Z`,
      lunches: [
        {
          id: `ln-seed-1-${idx}`,
          clientType: 'tienda',
          menuType: 'menu_completo',
          entrada: 'Papa a la Huancaína',
          segundo: 'Lomo Saltado',
          quantity: 1,
          unitPrice: 12.0,
          totalPrice: 12.0,
        }
      ],
      extras: idx % 2 === 0 ? [
        {
          id: `ex-seed-1-${idx}`,
          extraId: 'ext-1',
          name: 'Gaseosa Inka Kola 500ml',
          price: 3.5,
          quantity: 1,
          totalPrice: 3.5,
        }
      ] : [],
      total: idx % 2 === 0 ? 15.5 : 12.0,
      paymentStatus: 'pendiente',
      notes: 'Entregar en puesto 104'
    });

    // Seed Boutique Betty (Semanal 2do)
    consumptions.push({
      id: `cons-seed-2-${idx}`,
      clientId: 'cli-p2-1',
      clientName: 'Boutique Betty',
      piso: '2do',
      accountType: 'semanal',
      date: dateFormatted,
      dayOfWeek: dayName,
      timestamp: `${dateFormatted}T13:30:00.000Z`,
      lunches: [
        {
          id: `ln-seed-2-${idx}`,
          clientType: 'tienda',
          menuType: 'menu_completo',
          entrada: 'Sopa de Pollo con Fideos',
          segundo: 'Seco de Pollo con Frejoles',
          quantity: 2,
          unitPrice: 12.0,
          totalPrice: 24.0,
        }
      ],
      extras: [],
      total: 24.0,
      paymentStatus: 'pendiente',
    });

    // Seed Bodega San Martín (Diaria 1ro)
    if (idx <= 2) {
      consumptions.push({
        id: `cons-seed-3-${idx}`,
        clientId: 'cli-p1-2',
        clientName: 'Bodega San Martín',
        piso: '1ro',
        accountType: 'diaria',
        date: dateFormatted,
        dayOfWeek: dayName,
        timestamp: `${dateFormatted}T12:45:00.000Z`,
        lunches: [
          {
            id: `ln-seed-3-${idx}`,
            clientType: 'tienda',
            menuType: 'solo_segundo',
            segundo: 'Arroz Chaufa de Pollo',
            quantity: 1,
            unitPrice: 11.0,
            totalPrice: 11.0,
          }
        ],
        extras: [
          {
            id: `ex-seed-3-${idx}`,
            extraId: 'ext-3',
            name: 'Huevo Frito',
            price: 1.5,
            quantity: 1,
            totalPrice: 1.5,
          }
        ],
        total: 12.5,
        paymentStatus: idx === 0 ? 'pagado' : 'pendiente',
        paymentMethod: idx === 0 ? 'efectivo' : undefined,
        paymentDate: idx === 0 ? dateFormatted : undefined,
        notes: idx === 0 ? 'Pagado en efectivo al entregar' : 'Pendiente de cobro'
      });
    }

    // Seed Sastrería Don Lucho (Diaria 2do)
    if (idx === 1 || idx === 3) {
      consumptions.push({
        id: `cons-seed-4-${idx}`,
        clientId: 'cli-p2-2',
        clientName: 'Sastrería Don Lucho',
        piso: '2do',
        accountType: 'diaria',
        date: dateFormatted,
        dayOfWeek: dayName,
        timestamp: `${dateFormatted}T13:00:00.000Z`,
        lunches: [
          {
            id: `ln-seed-4-${idx}`,
            clientType: 'tienda',
            menuType: 'solo_segundo',
            segundo: 'Milanesa de Pollo con Papas',
            quantity: 1,
            unitPrice: 11.0,
            totalPrice: 11.0,
          }
        ],
        extras: [],
        total: 11.0,
        paymentStatus: 'pendiente',
        notes: 'Aún no cancela'
      });
    }
  });

  return consumptions;
}

// Generate sample initial payments / abonos
export function generateInitialPayments(): PaymentRecord[] {
  const today = getTodayDateString();
  return [
    {
      id: 'pay-seed-1',
      clientId: 'cli-p1-1',
      clientName: 'Zapatería Marco',
      piso: '1ro',
      accountType: 'semanal',
      date: today,
      dayOfWeek: getDayOfWeekName(today),
      amount: 30.0,
      method: 'yape',
      notes: 'Abono a cuenta por Yape',
      timestamp: new Date().toISOString(),
    },
    {
      id: 'pay-seed-2',
      clientId: 'cli-p2-1',
      clientName: 'Boutique Betty',
      piso: '2do',
      accountType: 'semanal',
      date: today,
      dayOfWeek: getDayOfWeekName(today),
      amount: 40.0,
      method: 'efectivo',
      notes: 'Dejó S/ 40 en efectivo como adelanto',
      timestamp: new Date().toISOString(),
    }
  ];
}

// Generate sample initial mesa counter record
export function generateInitialMesaRecords(): MesaCounterRecord[] {
  const today = getTodayDateString();
  return [
    {
      id: `mesa-${today}`,
      date: today,
      dayOfWeek: getDayOfWeekName(today),
      menuCompletoCount: 8, // 8 * 13 = 104
      soloSegundoCount: 4,    // 4 * 12 = 48
      extras: [
        {
          id: 'ex-mesa-1',
          name: 'Vaso de Chicha Morada',
          price: 2.0,
          quantity: 6,
          totalPrice: 12.0,
        }
      ],
      efectivoAmount: 114.0,
      yapeAmount: 50.0,
      totalAmount: 164.0,
      timestamp: new Date().toISOString(),
      notes: 'Mesa única del salón atendida de 12:00 a 3:30 pm'
    }
  ];
}
