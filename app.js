import { pageError } from './ui.js';
import { renderTables } from './pages/tables.js';
import { renderOrder } from './pages/order.js';
import { renderKitchen } from './pages/kitchen.js';
import { renderBilling } from './pages/billing.js';
import { renderMenu } from './pages/menu.js';
import { renderSales } from './pages/sales.js';

const page = document.body.dataset.page;
const pages = {
  tables: renderTables, order: renderOrder, kitchen: renderKitchen,
  billing: renderBilling, menu: renderMenu, sales: renderSales
};

if (pages[page]) pages[page]().catch(pageError);
