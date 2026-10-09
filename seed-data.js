const FLAVORS = [
  { id: 'honey-garlic', name: 'Honey Garlic' }, { id: 'butter', name: 'Butter' },
  { id: 'garlic', name: 'Garlic' }, { id: 'honey-butter', name: 'Honey Butter' }, { id: 'bbq', name: 'BBQ' }
];
const MENU = [
  { id: 'solo-sets', name: 'Solo Sets', shortName: 'Solo Sets', price: 89, flavorIds: ['honey-garlic', 'garlic', 'honey-butter', 'bbq'], status: 'active' },
  { id: 'all-you-can-eat', name: 'ALL-YOU-CAN-EAT', shortName: 'AYCE', price: 289, flavorIds: ['butter'], status: 'active' },
  { id: 'family-pack', name: 'Family Pack', shortName: 'Family Pack', price: 499, flavorIds: [], status: 'hidden' }
];
const PROMOS = [
  { id: 'lunch-special', name: 'Lunch Special (FREE Drinks)', active: true },
  { id: 'ayce-weekends', name: 'AYCE WEEKENDS', active: false }
];
const iso = (date) => date.toISOString();

function createSeedState(now = new Date()) {
  const menuItems = MENU.map((item) => ({ ...item, flavorIds: [...item.flavorIds] }));
  const tables = Array.from({ length: 10 }, (_, index) => {
    const id = index + 1;
    const status = id === 3 || id === 5 || id === 8 ? 'occupied'
      : id === 4 || id === 9 ? 'reserved' : id === 7 || id === 10 ? 'cleaning' : 'available';
    return { id, label: `Tbl ${id}`, floor: id <= 4 ? 1 : 2, status, currentOrderId: id === 3 ? 118 : id === 5 ? 117 : id === 8 ? 116 : null };
  });
  const orders = [];
  const payments = [];
  const targets = [[42, 37, 28, 20], [31, 30, 24, 18], [28, 26, 21, 15], [25, 24, 19, 14], [23, 22, 18, 13], [20, 19, 15, 12], [18, 17, 14, 10], [16, 15, 12, 9]];
  const sellers = [['all-you-can-eat', 'butter'], ['solo-sets', 'garlic'], ['solo-sets', 'honey-butter'], ['solo-sets', 'bbq']];
  let orderId = 1;
  let paymentId = 1;
  targets.forEach((daily, day) => {
    const ticketCount = Math.max(...daily.map((quantity) => Math.ceil(quantity / 3)));
    for (let ticket = 0; ticket < ticketCount; ticket += 1) {
      const createdAt = new Date(now);
      createdAt.setDate(createdAt.getDate() - day);
      const hour = day === 0 ? Math.min(12, Math.max(9, now.getHours() - 2)) : ticket % 2 ? 16 + (ticket % 3) : 11 + (ticket % 3);
      createdAt.setHours(hour, 6 + ((ticket * 13) % 50), 0, 0);
      const items = daily.flatMap((quantity, index) => {
        const qty = Math.max(0, Math.min(3, quantity - ticket * 3));
        if (!qty) return [];
        const [menuItemId, flavorId] = sellers[index];
        const menu = menuItems.find((entry) => entry.id === menuItemId);
        return [{ lineId: `seed-${orderId}-${index}`, menuItemId, menuName: menu.name, flavorId, qty, unitPrice: menu.price, prepared: true }];
      });
      const subtotal = Math.round(items.reduce((sum, item) => sum + item.unitPrice * item.qty, 0) * 100) / 100;
      const paidAt = iso(new Date(createdAt.getTime() + 32 * 60000));
      orders.push({ id: orderId, tableId: (orderId - 1) % 10 + 1, status: 'paid', note: '', items, subtotal, total: subtotal, createdAt: iso(createdAt), sentAt: iso(createdAt), readyAt: iso(new Date(createdAt.getTime() + 18 * 60000)), paidAt, paymentId });
      payments.push({ id: paymentId, orderId, amountReceived: subtotal + 100, change: 100, paidAt });
      orderId += 1;
      paymentId += 1;
    }
  });
  const activeOrders = [
    { id: 116, tableId: 8, status: 'preparing', note: '', items: [{ lineId: 'active-116-1', menuItemId: 'all-you-can-eat', menuName: 'ALL-YOU-CAN-EAT', flavorId: 'butter', qty: 2, unitPrice: 289, prepared: false }] },
    { id: 117, tableId: 5, status: 'preparing', note: '', items: [{ lineId: 'active-117-1', menuItemId: 'solo-sets', menuName: 'Solo Sets', flavorId: 'garlic', qty: 1, unitPrice: 89, prepared: false }] },
    { id: 118, tableId: 3, status: 'preparing', note: 'Extra rice', items: [
      { lineId: 'active-118-1', menuItemId: 'solo-sets', menuName: 'Solo Sets', flavorId: 'honey-garlic', qty: 1, unitPrice: 89, prepared: false },
      { lineId: 'active-118-2', menuItemId: 'all-you-can-eat', menuName: 'ALL-YOU-CAN-EAT', flavorId: 'butter', qty: 2, unitPrice: 289, prepared: false }
    ] }
  ];
  activeOrders.forEach((order) => {
    const createdAt = new Date(now.getTime() - (order.id === 118 ? 12 : 30) * 60000);
    const subtotal = order.items.reduce((sum, item) => sum + item.unitPrice * item.qty, 0);
    orders.push({ ...order, subtotal, total: subtotal, createdAt: iso(createdAt), sentAt: iso(createdAt), readyAt: '', paidAt: '' });
  });
  return {
    counters: { nextOrderId: 119, nextPaymentId: paymentId }, tables,
    flavors: FLAVORS.map((flavor) => ({ ...flavor })), menuItems,
    promos: PROMOS.map((promo) => ({ ...promo })), orders, payments
  };
}

function isValidState(value) {
  return Boolean(value && typeof value === 'object'
    && Number.isInteger(value.counters?.nextOrderId) && Number.isInteger(value.counters?.nextPaymentId)
    && Array.isArray(value.tables) && value.tables.every((table) => Number.isInteger(table.id) && [1, 2].includes(table.floor) && ['available', 'occupied', 'reserved', 'cleaning'].includes(table.status))
    && Array.isArray(value.flavors) && value.flavors.every((flavor) => typeof flavor.id === 'string' && typeof flavor.name === 'string')
    && Array.isArray(value.menuItems) && value.menuItems.every((item) => typeof item.id === 'string' && typeof item.name === 'string' && Number(item.price) > 0 && Array.isArray(item.flavorIds) && ['active', 'hidden'].includes(item.status))
    && Array.isArray(value.promos) && value.promos.every((promo) => typeof promo.id === 'string' && typeof promo.active === 'boolean')
    && Array.isArray(value.orders) && value.orders.every((order) => Number.isInteger(order.id) && Number.isInteger(order.tableId) && Array.isArray(order.items) && typeof order.status === 'string')
    && Array.isArray(value.payments) && value.payments.every((payment) => Number.isInteger(payment.id) && Number.isInteger(payment.orderId) && Number.isFinite(payment.amountReceived) && Number.isFinite(payment.change)));
}
module.exports = { createSeedState, isValidState };
