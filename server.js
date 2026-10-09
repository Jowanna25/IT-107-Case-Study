const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const repository = require('./repository');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 8080);
const MIME = { '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };
const PUBLIC_FILES = new Set(['index.html', 'tables.html', 'order.html', 'kitchen.htm', 'billing.html', 'menu.html', 'sales.html', 'app.js', 'ui.js', 'tokens.css', 'app.css']);
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const roundMoney = (amount) => Math.round((Number(amount) + Number.EPSILON) * 100) / 100;
const nowStamp = () => new Date().toISOString();

function promoRules({ subtotal, promos }) {
  // Promo flags are stored, but Figma does not define discounts. Add future pricing rules here.
  void promos;
  return { subtotal, total: subtotal };
}

function orderTotals(state, items) {
  const subtotal = roundMoney(items.reduce((sum, item) => sum + item.unitPrice * item.qty, 0));
  return promoRules({ subtotal, promos: state.promos });
}

function findOrder(state, id) {
  const order = state.orders.find((entry) => Number(entry.id) === Number(id));
  if (!order) throw new HttpError(404, 'Order not found.');
  return order;
}

async function readBody(request) {
  let raw = '';
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 1024 * 1024) throw new HttpError(413, 'Request body is too large.');
  }
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { throw new HttpError(400, 'Request must contain valid JSON.'); }
}

function sendJson(response, status, value) {
  response.writeHead(status, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
}

function normalizeLines(state, lines, previous = []) {
  if (!Array.isArray(lines)) throw new HttpError(400, 'Order items must be a list.');
  return lines.map((line) => {
    const menu = state.menuItems.find((entry) => entry.id === line.menuItemId && entry.status === 'active');
    if (!menu) throw new HttpError(400, 'Choose a menu item that is currently active.');
    const qty = Number(line.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > 999) throw new HttpError(400, 'Each quantity must be a whole number greater than zero.');
    const flavorId = line.flavorId || null;
    if (flavorId && !menu.flavorIds.includes(flavorId)) throw new HttpError(400, `${menu.name} does not offer that flavor.`);
    const old = previous.find((entry) => entry.menuItemId === menu.id && (entry.flavorId || null) === flavorId);
    return {
      lineId: old?.lineId || line.lineId || randomUUID(), menuItemId: menu.id, menuName: menu.name,
      flavorId, qty, unitPrice: menu.price, prepared: old?.qty === qty ? Boolean(old.prepared) : false
    };
  });
}

function localDay(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function sellerLabel(state, item) {
  const menu = state.menuItems.find((entry) => entry.id === item.menuItemId);
  const flavor = state.flavors.find((entry) => entry.id === item.flavorId);
  const name = item.menuName || menu?.name || 'Menu item';
  if (name === 'Solo Sets' && flavor) return `Solo ${flavor.name}`;
  return name;
}

function reportSummary(state, now = new Date()) {
  const today = localDay(now);
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
  const paidToday = state.orders.filter((order) => order.status === 'paid' && localDay(new Date(order.paidAt || order.createdAt)) === today);
  const todayPayment = (payment) => localDay(new Date(payment.paidAt)) === today;
  const weekPayment = (payment) => new Date(payment.paidAt) >= monday && new Date(payment.paidAt) <= now;
  const counts = new Map();
  paidToday.forEach((order) => order.items.forEach((item) => {
    const name = sellerLabel(state, item);
    counts.set(name, (counts.get(name) || 0) + item.qty);
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
    todaySales: sales(state.payments.filter(todayPayment)),
    weekSales: sales(state.payments.filter(weekPayment)),
    topSellers: [...counts].map(([name, quantity]) => ({ name, quantity })).sort((a, b) => b.quantity - a.quantity).slice(0, 10),
    peakHours: [...peaks].map(([key, orders]) => {
      const [range, label] = key.split('|');
      return { range, label, orders };
    }).sort((a, b) => b.orders - a.orders).slice(0, 4)
  };
}

async function handleApi(request, response, url) {
  const parts = url.pathname.split('/').filter(Boolean).slice(1);
  const method = request.method;
  const body = ['POST', 'PUT', 'PATCH'].includes(method) ? await readBody(request) : {};
  if (method === 'GET' && parts[0] === 'state') return sendJson(response, 200, await repository.getState());
  if (method === 'GET' && parts[0] === 'reports') return sendJson(response, 200, reportSummary(await repository.getState()));

  if (parts[0] === 'tables' && parts.length === 1 && method === 'GET') return sendJson(response, 200, { tables: (await repository.getState()).tables });
  if (parts[0] === 'tables' && parts[1]) {
    const tableId = Number(parts[1]);
    if (method === 'POST' && parts[2] === 'assign') {
      const order = await repository.updateState((state) => {
        const table = state.tables.find((entry) => entry.id === tableId);
        if (!table) throw new HttpError(404, 'Table not found.');
        if (!['available', 'reserved'].includes(table.status)) throw new HttpError(409, 'Select an available or reserved table to assign.');
        const id = state.counters.nextOrderId++;
        const createdAt = nowStamp();
        const next = { id, tableId, status: 'open', note: '', items: [], subtotal: 0, total: 0, createdAt, sentAt: '', readyAt: '', paidAt: '' };
        state.orders.push(next);
        table.status = 'occupied';
        table.currentOrderId = id;
        return next;
      });
      return sendJson(response, 201, { order });
    }
    if (method === 'POST' && parts[2] === 'release') {
      const table = await repository.updateState((state) => {
        const entry = state.tables.find((item) => item.id === tableId);
        if (!entry) throw new HttpError(404, 'Table not found.');
        if (entry.status === 'cleaning' || entry.status === 'reserved') {
          entry.status = 'available'; entry.currentOrderId = null; return entry;
        }
        if (entry.status !== 'occupied') throw new HttpError(409, 'This table is already available.');
        const current = state.orders.find((order) => order.id === entry.currentOrderId);
        if (current && current.status !== 'cancelled' && !(current.status === 'open' && current.items.length === 0)) {
          throw new HttpError(409, 'This occupied table has an active order. Cancel the order or finish payment before releasing it.');
        }
        if (current?.status === 'open' && current.items.length === 0) {
          current.status = 'cancelled';
          current.cancelledAt = nowStamp();
        }
        entry.status = 'available'; entry.currentOrderId = null; return entry;
      });
      return sendJson(response, 200, { table });
    }
    if (method === 'PATCH' && parts[2] === 'status') {
      const table = await repository.updateState((state) => {
        const entry = state.tables.find((item) => item.id === tableId);
        if (!entry) throw new HttpError(404, 'Table not found.');
        if (body.status === 'reserved' && entry.status === 'available') entry.status = 'reserved';
        else if (body.status === 'available' && ['reserved', 'cleaning'].includes(entry.status)) entry.status = 'available';
        else throw new HttpError(409, 'That status change is not allowed.');
        return entry;
      });
      return sendJson(response, 200, { table });
    }
  }

  if (parts[0] === 'menu-items') {
    if (method === 'POST' && parts.length === 1) {
      const item = await repository.updateState((state) => {
        const name = String(body.name || '').trim();
        const price = Number(body.price);
        if (!name) throw new HttpError(400, 'Enter a menu item name.');
        if (state.menuItems.some((entry) => entry.name.toLocaleLowerCase() === name.toLocaleLowerCase())) throw new HttpError(409, 'Menu item names must be unique.');
        if (!(price > 0) || !Number.isFinite(price)) throw new HttpError(400, 'Price must be greater than zero.');
        if (!Array.isArray(body.flavorIds) || body.flavorIds.some((id) => !state.flavors.some((flavor) => flavor.id === id))) throw new HttpError(400, 'Choose flavors from the flavor list.');
        const id = name.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || randomUUID();
        if (state.menuItems.some((entry) => entry.id === id)) throw new HttpError(409, 'Choose a different menu item name.');
        const created = { id, name, shortName: name, price: roundMoney(price), flavorIds: [...new Set(body.flavorIds)], status: body.status === 'hidden' ? 'hidden' : 'active' };
        state.menuItems.push(created); return created;
      });
      return sendJson(response, 201, { item });
    }
    if (parts[1] && method === 'PUT') {
      const item = await repository.updateState((state) => {
        const current = state.menuItems.find((entry) => entry.id === parts[1]);
        if (!current) throw new HttpError(404, 'Menu item not found.');
        const name = String(body.name || '').trim();
        const price = Number(body.price);
        if (!name) throw new HttpError(400, 'Enter a menu item name.');
        if (state.menuItems.some((entry) => entry.id !== current.id && entry.name.toLocaleLowerCase() === name.toLocaleLowerCase())) throw new HttpError(409, 'Menu item names must be unique.');
        if (!(price > 0) || !Number.isFinite(price)) throw new HttpError(400, 'Price must be greater than zero.');
        if (!Array.isArray(body.flavorIds) || body.flavorIds.some((id) => !state.flavors.some((flavor) => flavor.id === id))) throw new HttpError(400, 'Choose flavors from the flavor list.');
        Object.assign(current, { name, shortName: name, price: roundMoney(price), flavorIds: [...new Set(body.flavorIds)], status: body.status === 'hidden' ? 'hidden' : 'active' });
        return current;
      });
      return sendJson(response, 200, { item });
    }
    if (parts[1] && method === 'DELETE') {
      await repository.updateState((state) => {
        const index = state.menuItems.findIndex((entry) => entry.id === parts[1]);
        if (index < 0) throw new HttpError(404, 'Menu item not found.');
        state.menuItems.splice(index, 1);
      });
      return sendJson(response, 200, { ok: true });
    }
  }

  if (parts[0] === 'promos') {
    if (method === 'GET') return sendJson(response, 200, { promos: (await repository.getState()).promos });
    if (method === 'PUT') {
      const promos = await repository.updateState((state) => {
        if (!Array.isArray(body.promos)) throw new HttpError(400, 'Promotions must be a list.');
        body.promos.forEach((promo) => {
          const entry = state.promos.find((item) => item.id === promo.id);
          if (entry) entry.active = Boolean(promo.active);
        });
        return state.promos;
      });
      return sendJson(response, 200, { promos });
    }
  }

  if (parts[0] === 'orders') {
    if (parts.length === 1 && method === 'GET') return sendJson(response, 200, { orders: (await repository.getState()).orders });
    const id = parts[1];
    if (id && parts.length === 2 && method === 'GET') {
      const state = await repository.getState();
      const order = findOrder(state, id);
      return sendJson(response, 200, { order, table: state.tables.find((table) => table.id === order.tableId) });
    }
    if (id && parts.length === 2 && method === 'PUT') {
      const order = await repository.updateState((state) => {
        const current = findOrder(state, id);
        if (!['open', 'preparing', 'ready'].includes(current.status)) throw new HttpError(409, 'This order can no longer be edited.');
        const items = normalizeLines(state, body.items, current.items);
        const changed = JSON.stringify(items.map(({ menuItemId, flavorId, qty }) => [menuItemId, flavorId, qty])) !== JSON.stringify(current.items.map(({ menuItemId, flavorId, qty }) => [menuItemId, flavorId, qty]));
        current.items = items;
        current.note = String(body.note || '').trim().slice(0, 500);
        Object.assign(current, orderTotals(state, items));
        if (current.status === 'ready' && changed) {
          current.status = 'preparing'; current.readyAt = '';
          current.items.forEach((item) => { item.prepared = false; });
        }
        return current;
      });
      return sendJson(response, 200, { order });
    }
    if (id && parts[2] === 'send' && method === 'POST') {
      const order = await repository.updateState((state) => {
        const current = findOrder(state, id);
        if (!['open', 'preparing', 'ready'].includes(current.status)) throw new HttpError(409, 'This order can no longer be sent.');
        const items = normalizeLines(state, body.items, current.items);
        if (!items.length) throw new HttpError(400, 'Add at least one item before sending to the kitchen.');
        current.items = items; current.note = String(body.note || '').trim().slice(0, 500);
        Object.assign(current, orderTotals(state, items));
        if (current.status === 'open' || current.status === 'ready') {
          current.status = 'preparing'; current.sentAt = nowStamp(); current.readyAt = '';
          items.forEach((item) => { item.prepared = false; });
        }
        return current;
      });
      return sendJson(response, 200, { order });
    }
    if (id && parts[2] === 'items' && parts[3] && method === 'PATCH') {
      const order = await repository.updateState((state) => {
        const current = findOrder(state, id);
        if (current.status !== 'preparing') throw new HttpError(409, 'Only preparing orders can be updated by the kitchen.');
        const item = current.items.find((line) => line.lineId === parts[3]);
        if (!item) throw new HttpError(404, 'Order item not found.');
        item.prepared = Boolean(body.prepared); return current;
      });
      return sendJson(response, 200, { order });
    }
    if (id && parts[2] === 'done' && method === 'POST') {
      const order = await repository.updateState((state) => {
        const current = findOrder(state, id);
        if (current.status !== 'preparing' || !current.items.length || current.items.some((item) => !item.prepared)) throw new HttpError(409, 'Mark every item prepared before completing this order.');
        current.status = 'ready'; current.readyAt = nowStamp(); return current;
      });
      return sendJson(response, 200, { order });
    }
    if (id && parts[2] === 'cancel' && method === 'POST') {
      const order = await repository.updateState((state) => {
        const current = findOrder(state, id);
        if (!['open', 'preparing', 'ready'].includes(current.status)) throw new HttpError(409, 'This order cannot be cancelled.');
        current.status = 'cancelled'; current.cancelledAt = nowStamp();
        const table = state.tables.find((entry) => entry.id === current.tableId);
        const remaining = state.orders.find((entry) => entry.tableId === current.tableId && entry.id !== current.id && ['open', 'preparing', 'ready'].includes(entry.status));
        if (table && !remaining && table.currentOrderId === current.id) { table.status = 'available'; table.currentOrderId = null; }
        else if (table && remaining && table.currentOrderId === current.id) table.currentOrderId = remaining.id;
        return current;
      });
      return sendJson(response, 200, { order });
    }
    if (id && parts[2] === 'pay' && method === 'POST') {
      const result = await repository.updateState((state) => {
        const order = findOrder(state, id);
        if (order.status !== 'ready') throw new HttpError(409, 'Only ready orders can be paid.');
        const amountReceived = roundMoney(Number(body.amountReceived));
        if (!Number.isFinite(amountReceived) || amountReceived < order.total) throw new HttpError(400, 'Insufficient amount. Enter at least the total due.');
        const change = roundMoney(amountReceived - order.total);
        const paidAt = nowStamp();
        const payment = { id: state.counters.nextPaymentId++, orderId: order.id, amountReceived, change, paidAt };
        state.payments.push(payment); order.status = 'paid'; order.paidAt = paidAt; order.paymentId = payment.id;
        const table = state.tables.find((entry) => entry.id === order.tableId);
        const remaining = state.orders.find((entry) => entry.tableId === order.tableId && entry.id !== order.id && ['open', 'preparing', 'ready'].includes(entry.status));
        if (table && !remaining) { table.status = 'cleaning'; table.currentOrderId = null; }
        else if (table && remaining) table.currentOrderId = remaining.id;
        return { order, payment };
      });
      return sendJson(response, 200, result);
    }
  }
  throw new HttpError(404, 'API route not found.');
}

async function serveStatic(response, url) {
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch { throw new HttpError(400, 'Invalid path.'); }
  if (pathname === '/') pathname = '/index.html';
  const file = path.resolve(ROOT, `.${pathname}`);
  if (!file.startsWith(`${ROOT}${path.sep}`)) throw new HttpError(403, 'Forbidden.');
  const relative = path.relative(ROOT, file).replace(/\\/g, '/');
  const isPublicPageModule = relative.startsWith('pages/') && path.extname(file) === '.js';
  const isPublicAsset = relative.startsWith('assets/') && ['.png', '.svg'].includes(path.extname(file).toLowerCase());
  if (!PUBLIC_FILES.has(relative) && !isPublicPageModule && !isPublicAsset) throw new HttpError(404, 'Page not found.');
  const content = await fs.readFile(file).catch(() => { throw new HttpError(404, 'Page not found.'); });
  response.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  response.end(content);
}

async function handle(request, response) {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) await handleApi(request, response, url);
    else await serveStatic(response, url);
  } catch (error) {
    sendJson(response, error.status || 500, { error: error.status ? error.message : 'The server could not complete that request.' });
    if (!error.status) console.error(error);
  }
}

async function start() {
  await repository.ensureDatabase();
  http.createServer(handle).listen(PORT, '127.0.0.1', () => console.log(`Wingsman POS is running at http://localhost:${PORT}`));
}
if (require.main === module) start().catch((error) => { console.error(error); process.exitCode = 1; });
module.exports = { reportSummary, sellerLabel };
