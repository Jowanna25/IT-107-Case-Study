import { pageError } from './ui.js';
import { renderTables } from './pages/tables.js';
import { renderOrder } from './pages/order.js';
import { renderKitchen } from './pages/kitchen.js';
import { renderBilling } from './pages/billing.js';
import { renderMenu } from './pages/menu.js';
import { renderSales } from './pages/sales.js';

const pages = {
  tables: renderTables, order: renderOrder, kitchen: renderKitchen,
  billing: renderBilling, menu: renderMenu, sales: renderSales
};

const titles = {
  tables: 'Table Management', order: 'Order Taking', kitchen: 'Kitchen Order Display',
  billing: 'Billing & Payment', menu: 'Menu & Promo Settings', sales: 'Sales Reports'
};
let pendingRoute = null;
let rendering = false;

function readPage() {
  const name = location.hash.slice(1).split('?', 1)[0];
  return pages[name] ? name : 'tables';
}

function renderRoute() {
  pendingRoute = readPage();
  if (rendering) return;
  rendering = true;
  void (async () => {
    while (pendingRoute) {
      const currentPage = pendingRoute;
      pendingRoute = null;
      document.body.dataset.page = currentPage;
      document.title = `${titles[currentPage]} · Wingsman`;
      const oldContent = document.getElementById('pageContent');
      oldContent.replaceWith(oldContent.cloneNode(false));
      try {
        await pages[currentPage]();
      } catch (error) {
        pageError(error);
      }
      if (readPage() !== currentPage) pendingRoute = readPage();
    }
    rendering = false;
  })();
}

window.addEventListener('hashchange', renderRoute);
renderRoute();
