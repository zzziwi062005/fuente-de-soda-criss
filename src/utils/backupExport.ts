import JSZip from 'jszip';
import { ClientRecord, ConsumptionRecord, PaymentRecord, MesaCounterRecord, ExtraItem } from '../types';

export interface FullBackupPayload {
  app: string;
  version: number;
  exportDate: string;
  clients: ClientRecord[];
  consumptions: ConsumptionRecord[];
  payments: PaymentRecord[];
  mesaRecords: MesaCounterRecord[];
  extras?: ExtraItem[];
}

/**
 * Generates an Excel-friendly CSV with UTF-8 BOM.
 */
export function generateExcelCSV(data: FullBackupPayload): string {
  const BOM = '\uFEFF';
  const lines: string[] = [];

  // Title Section
  lines.push('FUENTE DE SODA CRISS - REGISTRO DE VENTAS');
  lines.push(`Fecha de Exportación:,"${new Date(data.exportDate).toLocaleString('es-PE')}"`);
  lines.push('');

  // 1. CLIENTES REGISTRADOS
  lines.push('--- CLIENTES Y PUESTOS REGISTRADOS ---');
  lines.push('ID,Nombre / Tienda,Piso,Tipo de Cuenta,Celular WhatsApp,Estado,Notas');
  data.clients.forEach((c) => {
    const activeStr = c.active ? 'Activo' : 'Inactivo';
    lines.push(
      `"${c.id}","${c.name.replace(/"/g, '""')}","${c.piso}","${c.accountType === 'semanal' ? 'Semanal' : 'Diaria'}","${c.phone || ''}","${activeStr}","${(c.notes || '').replace(/"/g, '""')}"`
    );
  });
  lines.push('');

  // 2. DETALLE DE CONSUMOS
  lines.push('--- REGISTRO DE CONSUMOS ---');
  lines.push('ID,Fecha Pedido,Día,Fecha Cobro,Cliente,Piso,Tipo Cuenta,Lugar,Platos,Extras,Total (S/.),Estado de Cobro,Método,Notas');
  data.consumptions.forEach((c) => {
    const dishes = c.lunches
      .map((l) => `${l.quantity}x ${l.menuType === 'menu_completo' ? 'Menú Completo' : 'Segundo Solo'} [${l.clientType}]`)
      .join(' | ');
    const extrasStr = c.extras
      .map((e) => `${e.quantity}x ${e.name}`)
      .join(' | ');
    const loc = c.lunches[0]?.clientType || 'tienda';
    const payDate = c.paymentDate || (c.paymentStatus === 'pagado' ? c.date : '');
    lines.push(
      `"${c.id}","${c.date}","${c.dayOfWeek}","${payDate}","${c.clientName.replace(/"/g, '""')}","${c.piso}","${c.accountType}","${loc}","${dishes.replace(/"/g, '""')}","${extrasStr.replace(/"/g, '""')}",${c.total.toFixed(2)},"${c.paymentStatus}","${c.paymentMethod || ''}","${(c.notes || '').replace(/"/g, '""')}"`
    );
  });
  lines.push('');

  // 3. REGISTRO DE ABONOS
  lines.push('--- REGISTRO DE ABONOS Y PAGOS ---');
  lines.push('ID,Fecha,Día,Cliente,Piso,Tipo Cuenta,Monto Abonado (S/.),Método de Pago,Notas');
  data.payments.forEach((p) => {
    lines.push(
      `"${p.id}","${p.date}","${p.dayOfWeek}","${p.clientName.replace(/"/g, '""')}","${p.piso}","${p.accountType}",${p.amount.toFixed(2)},"${p.method.toUpperCase()}","${(p.notes || '').replace(/"/g, '""')}"`
    );
  });
  lines.push('');

  // 4. MESA ÚNICA DE SALÓN
  lines.push('--- REGISTRO DE VENTAS MESA SALÓN ---');
  lines.push('Fecha,Día,Menús Completos,Segundos Solos,Extras Cantidad,Total Mesa (S/.),Efectivo (S/.),Yape (S/.),Notas');
  data.mesaRecords.forEach((m) => {
    const extrasCount = m.extras.reduce((sum, e) => sum + e.quantity, 0);
    lines.push(
      `"${m.date}","${m.dayOfWeek}",${m.menuCompletoCount},${m.soloSegundoCount},${extrasCount},${m.totalAmount.toFixed(2)},${m.efectivoAmount.toFixed(2)},${m.yapeAmount.toFixed(2)},"${(m.notes || '').replace(/"/g, '""')}"`
    );
  });
  lines.push('');

  // 5. CATÁLOGO DE ADICIONALES Y BEBIDAS
  if (data.extras && data.extras.length > 0) {
    lines.push('--- CATÁLOGO DE ADICIONALES Y BEBIDAS ---');
    lines.push('ID,Nombre,Categoría,Precio (S/.),Descripción');
    data.extras.forEach((e) => {
      lines.push(
        `"${e.id}","${e.name.replace(/"/g, '""')}","${e.category || 'bebida'}",${e.price.toFixed(2)},"${(e.description || '').replace(/"/g, '""')}"`
      );
    });
    lines.push('');
  }

  return BOM + lines.join('\r\n');
}

/**
 * Creates and triggers download of a ZIP containing both JSON backup and Excel CSV.
 */
export async function downloadZipBackup(payload: FullBackupPayload, dateStr: string): Promise<void> {
  const zip = new JSZip();

  // 1. JSON backup
  const jsonContent = JSON.stringify(payload, null, 2);
  zip.file(`fuente_de_soda_criss_backup_${dateStr}.json`, jsonContent);

  // 2. Excel CSV backup
  const csvContent = generateExcelCSV(payload);
  zip.file(`fuente_de_soda_criss_excel_${dateStr}.csv`, csvContent);

  // Generate ZIP blob
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `fuente_de_soda_criss_backup_${dateStr}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
