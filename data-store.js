const STORAGE_KEY = 'wingsman-pos-state-v1';
let cachedState = null;

function copyData(value) {
  return JSON.parse(JSON.stringify(value));
}

function saveState(state) {
  cachedState = state;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch { /* The app remains usable for this session if browser storage is disabled. */ }
}

function readState() {
  if (cachedState) return cachedState;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      cachedState = JSON.parse(saved);
      return cachedState;
    }
  } catch { /* Continue with the bundled starting data. */ }
  if (!window.WINGSMAN_INITIAL_STATE) throw new Error('The Wingsman starting data could not be loaded.');
  cachedState = copyData(window.WINGSMAN_INITIAL_STATE);
  saveState(cachedState);
  return cachedState;
}

const localNow = () => new Date().toISOString();
const roundMoney = (amount) => Math.round((Number(amount) + Number.EPSILON) * 100) / 100;
const localDay = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const makeId = () => globalThis.crypto?.randomUUID?.() || `line-${Date.now()}-${Math.random().toString(16).slice(2)}`;

function findOrder(state, id) {
  const order = state.orders.find((entry) => Number(entry.id) === Number(id));
  if (!order) throw new Error('Order not found.');
  return order;
}

function normalizeLines(state, lines, previous = []) {
  if (!Array.isArray(lines)) throw new Error('Order items must be a list.');
  return lines.map((line) => {
    const menu = state.menuItems.find((entry) => entry.id === line.menuItemId && entry.status === 'active');
    if (!menu) throw new Error('Choose a menu item that is currently active.');
    const qty = Number(line.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > 999) throw new Error('Each quantity must be a whole number greater than zero.');
    const flavorId = line.flavorId || null;
    if (flavorId && !menu.flavorIds.includes(flavorId)) throw new Error(`${menu.name} does not offer that flavor.`);
    const old = previous.find((entry) => entry.menuItemId === menu.id && (entry.flavorId || null) === flavorId);
    return {
      lineId: old?.lineId || line.lineId || makeId(), menuItemId: menu.id, menuName: menu.name,
      flavorId, qty, unitPrice: menu.price, prepared: old?.qty === qty ? Boolean(old.prepared) : false
    };
  });
}

function totals(items) {
  const subtotal = roundMoney(items.reduce((sum, item) => sum + item.unitPrice * item.qty, 0));
  return { subtotal, total: subtotal };
}

function reportSummary(state, now = new Date()) {
  const today = localDay(now);
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
  const paidToday = state.orders.filter((order) => order.status === 'paid' && localDay(new Date(order.paidAt || order.createdAt)) === today);
  const counts = new Map();
  paidToday.forEach((order) => order.items.forEach((item) => {
    const menu = state.menuItems.find((entry) => entry.id === item.menuItemId);
    const flavor = state.flavors.find((entry) => entry.id === item.flavorId);
    const name = item.menuName || menu?.name || 'Menu item';
    const label = name === 'Solo Sets' && flavor ? `Solo ${flavor.name}` : name;
    counts.set(label, (counts.get(label) || 0) + item.qty);
  }));
  const peaks = new Map();
  state.orders.filter((order) => new Date(order.createdAt) >= monday && new Date(order.createdAt) <= now).forEach((order) => {
    const hour = new Date(order.createdAt).getHours();
    const [range, label] = hour >= 11 && hour < 13 ? ['11AM–1PM', 'Lunch']
      : hour >= 16 && hour < 19 ? ['4PM–7PM', 'After School']
        : hour < 11 ? ['Morning', 'Breakfast'] : hour < 16 ? ['1PM–4PM', 'Afternoon'] : ['7PM–10PM', 'Dinner'];
    const key = `${range}|${label}`;
    peaks.set(key, (peaks.get(key) || 0) + 1);
  });
  const sales = (payments) => roundMoney(payments.reduce((sum, payment) => sum + payment.amountReceived - payment.change, 0));
  return {
    period: today,
    todaySales: sales(state.payments.filter((payment) => localDay(new Date(payment.paidAt)) === today)),
    weekSales: sales(state.payments.filter((payment) => new Date(payment.paidAt) >= monday && new Date(payment.paidAt) <= now)),
    topSellers: [...counts].map(([name, quantity]) => ({ name, quantity })).sort((a, b) => b.quantity - a.quantity).slice(0, 10),
    peakHours: [...peaks].map(([key, orders]) => {
      const [range, label] = key.split('|');
      return { range, label, orders };
    }).sort((a, b) => b.orders - a.orders).slice(0, 4)
  };
}

async function api(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const parts = path.split('?')[0].split('/').filter(Boolean).map(decodeURIComponent);
  const body = typeof options.body === 'string' ? JSON.parse(options.body) : (options.body || {});
  const state = readState();
  if (method === 'GET' && parts[0] === 'state') return copyData(state);
  if (method === 'GET' && parts[0] === 'reports') return reportSummary(state);
  if (method === 'GET' && parts[0] === 'tables') return { tables: copyData(state.tables) };
  if (method === 'GET' && parts[0] === 'promos') return { promos: copyData(state.promos) };
  let result;

  if (parts[0] === 'tables' && parts[1]) {
    const id = Number(parts[1]);
    const table = state.tables.find((entry) => entry.id === id);
    if (!table) throw new Error('Table not found.');
    if (method === 'POST' && parts[2] === 'assign') {
      if (!['available', 'reserved'].includes(table.status)) throw new Error('Select an available or reserved table to assign.');
      const orderId = state.counters.nextOrderId++;
      const createdAt = localNow();
      result = { order: { id: orderId, tableId: id, status: 'open', note: '', items: [], subtotal: 0, total: 0, createdAt, sentAt: '', readyAt: '', paidAt: '' } };
      state.orders.push(result.order);
      table.status = 'occupied'; table.currentOrderId = orderId;
    } else if (method === 'POST' && parts[2] === 'release') {
      if (table.status === 'cleaning' || table.status === 'reserved') {
        table.status = 'available'; table.currentOrderId = null;
      } else if (table.status !== 'occupied') throw new Error('This table is already available.');
      else {
        const current = state.orders.find((order) => order.id === table.currentOrderId);
        if (current && current.status !== 'cancelled' && !(current.status === 'open' && current.items.length === 0)) {
          throw new Error('This occupied table has an active order. Cancel the order or finish payment before releasing it.');
        }
        if (current?.status === 'open' && current.items.length === 0) { current.status = 'cancelled'; current.cancelledAt = localNow(); }
        table.status = 'available'; table.currentOrderId = null;
      }
      result = { table };
    } else if (method === 'PATCH' && parts[2] === 'status') {
      if (body.status === 'reserved' && table.status === 'available') table.status = 'reserved';
      else if (body.status === 'available' && ['reserved', 'cleaning'].includes(table.status)) table.status = 'available';
      else throw new Error('That status change is not allowed.');
      result = { table };
    }
  }

  if (parts[0] === 'menu-items') {
    const id = parts[1];
    if (method === 'POST' && !id) {
      const name = String(body.name || '').trim();
      const price = Number(body.price);
      if (!name) throw new Error('Enter a menu item name.');
      if (state.menuItems.some((entry) => entry.name.toLocaleLowerCase() === name.toLocaleLowerCase())) throw new Error('Menu item names must be unique.');
      if (!(price > 0) || !Number.isFinite(price)) throw new Error('Price must be greater than zero.');
      if (!Array.isArray(body.flavorIds) || body.flavorIds.some((flavorId) => !state.flavors.some((flavor) => flavor.id === flavorId))) throw new Error('Choose flavors from the flavor list.');
      const slug = name.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || makeId();
      if (state.menuItems.some((entry) => entry.id === slug)) throw new Error('Choose a different menu item name.');
      result = { item: { id: slug, name, shortName: name, price: roundMoney(price), flavorIds: [...new Set(body.flavorIds)], status: body.status === 'hidden' ? 'hidden' : 'active' } };
      state.menuItems.push(result.item);
    } else if (method === 'PUT' && id) {
      const current = state.menuItems.find((entry) => entry.id === id);
      if (!current) throw new Error('Menu item not found.');
      const name = String(body.name || '').trim();
      const price = Number(body.price);
      if (!name) throw new Error('Enter a menu item name.');
      if (state.menuItems.some((entry) => entry.id !== current.id && entry.name.toLocaleLowerCase() === name.toLocaleLowerCase())) throw new Error('Menu item names must be unique.');
      if (!(price > 0) || !Number.isFinite(price)) throw new Error('Price must be greater than zero.');
      if (!Array.isArray(body.flavorIds) || body.flavorIds.some((flavorId) => !state.flavors.some((flavor) => flavor.id === flavorId))) throw new Error('Choose flavors from the flavor list.');
      Object.assign(current, { name, shortName: name, price: roundMoney(price), flavorIds: [...new Set(body.flavorIds)], status: body.status === 'hidden' ? 'hidden' : 'active' });
      result = { item: current };
    } else if (method === 'DELETE' && id) {
      const index = state.menuItems.findIndex((entry) => entry.id === id);
      if (index < 0) throw new Error('Menu item not found.');
      state.menuItems.splice(index, 1);
      result = { ok: true };
    }
  }

  if (parts[0] === 'promos' && method === 'PUT') {
    if (!Array.isArray(body.promos)) throw new Error('Promotions must be a list.');
    body.promos.forEach((promo) => {
      const entry = state.promos.find((item) => item.id === promo.id);
      if (entry) entry.active = Boolean(promo.active);
    });
    result = { promos: state.promos };
  }

  if (parts[0] === 'orders' && parts[1]) {
    const id = parts[1];
    const order = state.orders.find((entry) => Number(entry.id) === Number(id));
    if (!order) throw new Error('Order not found.');
    if (method === 'PUT' && parts.length === 2) {
      if (!['open', 'preparing', 'ready'].includes(order.status)) throw new Error('This order can no longer be edited.');
      const items = normalizeLines(state, body.items, order.items);
      const changed = JSON.stringify(items.map(({ menuItemId, flavorId, qty }) => [menuItemId, flavorId, qty])) !== JSON.stringify(order.items.map(({ menuItemId, flavorId, qty }) => [menuItemId, flavorId, qty]));
      order.items = items; order.note = String(body.note || '').trim().slice(0, 500); Object.assign(order, totals(items));
      if (order.status === 'ready' && changed) { order.status = 'preparing'; order.readyAt = ''; order.items.forEach((item) => { item.prepared = false; }); }
      result = { order };
    } else if (method === 'POST' && parts[2] === 'send') {
      if (!['open', 'preparing', 'ready'].includes(order.status)) throw new Error('This order can no longer be sent.');
      const items = normalizeLines(state, body.items, order.items);
      if (!items.length) throw new Error('Add at least one item before sending to the kitchen.');
      order.items = items; order.note = String(body.note || '').trim().slice(0, 500); Object.assign(order, totals(items));
      if (order.status === 'open' || order.status === 'ready') { order.status = 'preparing'; order.sentAt = localNow(); order.readyAt = ''; items.forEach((item) => { item.prepared = false; }); }
      result = { order };
    } else if (method === 'PATCH' && parts[2] === 'items' && parts[4] === 'prepared') {
      if (order.status !== 'preparing') throw new Error('Only preparing orders can be updated by the kitchen.');
      const item = order.items.find((line) => line.lineId === parts[3]);
      if (!item) throw new Error('Order item not found.');
      item.prepared = Boolean(body.prepared); result = { order };
    } else if (method === 'POST' && parts[2] === 'done') {
      if (order.status !== 'preparing' || !order.items.length || order.items.some((item) => !item.prepared)) throw new Error('Mark every item prepared before completing this order.');
      order.status = 'ready'; order.readyAt = localNow(); result = { order };
    } else if (method === 'POST' && parts[2] === 'cancel') {
      if (!['open', 'preparing', 'ready'].includes(order.status)) throw new Error('This order cannot be cancelled.');
      order.status = 'cancelled'; order.cancelledAt = localNow();
      const table = state.tables.find((entry) => entry.id === order.tableId);
      const remaining = state.orders.find((entry) => entry.tableId === order.tableId && entry.id !== order.id && ['open', 'preparing', 'ready'].includes(entry.status));
      if (table && !remaining && table.currentOrderId === order.id) { table.status = 'available'; table.currentOrderId = null; }
      else if (table && remaining && table.currentOrderId === order.id) table.currentOrderId = remaining.id;
      result = { order };
    } else if (method === 'POST' && parts[2] === 'pay') {
      if (order.status !== 'ready') throw new Error('Only ready orders can be paid.');
      const amountReceived = roundMoney(Number(body.amountReceived));
      if (!Number.isFinite(amountReceived) || amountReceived < order.total) throw new Error('Insufficient amount. Enter at least the total due.');
      const change = roundMoney(amountReceived - order.total); const paidAt = localNow();
      const payment = { id: state.counters.nextPaymentId++, orderId: order.id, amountReceived, change, paidAt };
      state.payments.push(payment); order.status = 'paid'; order.paidAt = paidAt; order.paymentId = payment.id;
      const table = state.tables.find((entry) => entry.id === order.tableId);
      const remaining = state.orders.find((entry) => entry.tableId === order.tableId && entry.id !== order.id && ['open', 'preparing', 'ready'].includes(entry.status));
      if (table && !remaining) { table.status = 'cleaning'; table.currentOrderId = null; }
      else if (table && remaining) table.currentOrderId = remaining.id;
      result = { order, payment };
    }
  }

  if (!result) throw new Error('The requested action is not supported.');
  saveState(state);
  return copyData(result);
}
