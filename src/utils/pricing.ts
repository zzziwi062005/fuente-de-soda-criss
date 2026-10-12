import { ClientType, MenuType, BASE_PRICES, Order } from '../types';

export function getLunchUnitPrice(clientType: ClientType, menuType: MenuType): number {
  return BASE_PRICES[clientType][menuType];
}

export function formatCurrency(amount: number): string {
  return `S/ ${amount.toFixed(2)}`;
}

export function generateWhatsAppMessage(order: Order): string {
  const date = new Date(order.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  let text = `*FUENTE DE SODA CRISS* 🍽️\n`;
  text += `*Comanda N° #${order.orderNumber}* (${date})\n`;
  text += `📍 *Destino:* ${order.customerOrLocation} (${order.clientType === 'mesa' ? 'Mesa / Local' : 'Tienda / Delivery'})\n`;
  text += `--------------------------------\n`;

  order.lunches.forEach((lunch, idx) => {
    const tipo = lunch.menuType === 'menu_completo' ? 'Menú Completo (Entrada + Segundo)' : 'Solo Segundo';
    text += `${lunch.quantity}x ${tipo} - ${formatCurrency(lunch.totalPrice)}\n`;
    if (lunch.menuType === 'menu_completo' && lunch.entrada) {
      text += `   🥣 Entrada: ${lunch.entrada}\n`;
    }
    text += `   🍛 Segundo: ${lunch.segundo}\n`;
    if (lunch.notes) {
      text += `   📝 Nota: ${lunch.notes}\n`;
    }
  });

  if (order.extras.length > 0) {
    text += `\n*Extras:*\n`;
    order.extras.forEach((ext) => {
      text += `➕ ${ext.quantity}x ${ext.name} (${formatCurrency(ext.price)}) = ${formatCurrency(ext.totalPrice)}\n`;
      if (ext.description) {
        text += `   _${ext.description}_\n`;
      }
    });
  }

  text += `--------------------------------\n`;
  text += `*TOTAL A PAGAR: ${formatCurrency(order.total)}*\n`;
  text += `💳 Método: ${order.paymentMethod.toUpperCase()} | Estado: ${order.paymentStatus === 'pagado' ? 'PAGADO ✅' : 'PENDIENTE DE PAGO ⏳'}\n`;

  if (order.paymentMethod === 'efectivo' && order.amountReceived) {
    text += `💵 Recibido: ${formatCurrency(order.amountReceived)} | Vuelto: ${formatCurrency(order.change || 0)}\n`;
  }

  text += `\n¡Muchas gracias por su preferencia! ✨`;
  return encodeURIComponent(text);
}
