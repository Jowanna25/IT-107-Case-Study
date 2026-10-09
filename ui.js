const FLAVORS = [
  { id: 'honey-garlic', name: 'Honey Garlic' }, { id: 'butter', name: 'Butter' },
  { id: 'garlic', name: 'Garlic' }, { id: 'honey-butter', name: 'Honey Butter' }, { id: 'bbq', name: 'BBQ' }
];

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));
const peso = (amount) => `₱${Number(amount || 0).toLocaleString('en-PH', { maximumFractionDigits: 2 })}`;
const tableName = (id) => `Tbl ${Number(id)}`;
const paddedTable = (id) => String(Number(id)).padStart(2, '0');
const dateUS = (value = new Date()) => new Date(value).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
const time12 = (value) => new Date(value).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

function routeParams() {
  const hash = location.hash.slice(1);
  const separator = hash.indexOf('?');
  return new URLSearchParams(separator < 0 ? '' : hash.slice(separator + 1));
}

function navigate(page, params = {}) {
  const query = new URLSearchParams(Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')).toString();
  location.hash = `#${page}${query ? `?${query}` : ''}`;
}

function notify(message, kind = 'success') {
  const host = document.getElementById('toastHost');
  if (!host) return;
  const node = document.createElement('div');
  node.className = `toast toast-${kind}`;
  node.setAttribute('role', 'status');
  node.textContent = message;
  host.append(node);
  setTimeout(() => node.remove(), 3600);
}

function nav(active) {
  const pages = [
    ['#tables', 'Table Management', 'tables'], ['#order', 'Order Taking', 'order'],
    ['#kitchen', 'Kitchen Display', 'kitchen'], ['#billing', 'Billing & Payment', 'billing'],
    ['#menu', 'Menu & Promo Settings', 'menu'], ['#sales', 'Sales Reports', 'sales']
  ];
  return `<nav class="nav" aria-label="Main navigation">${pages.map(([href, label, key]) =>
    `<a href="${href}"${active === key ? ' class="active" aria-current="page"' : ''}>${label}</a>`).join('')}</nav>`;
}

function mount(active, content) {
  document.getElementById('siteNav').innerHTML = nav(active);
  document.getElementById('pageContent').innerHTML = content;
}

function pageHeading(title, subtitle = '', actions = '') {
  return `<header class="page-heading"><div><h1>${escapeHtml(title)}</h1>${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ''}</div>${actions ? `<div class="heading-actions">${actions}</div>` : ''}</header>`;
}

function pageError(error) {
  const host = document.getElementById('pageContent');
  host.innerHTML = `<section class="card error-card"><h2>We couldn’t load this page</h2><p>${escapeHtml(error.message || 'Please try again.')}</p><button class="btn btn-secondary" onclick="location.reload()">Retry</button></section>`;
}

function lineTitle(item, state) {
  const menu = state.menuItems.find((entry) => entry.id === item.menuItemId);
  const flavor = state.flavors.find((entry) => entry.id === item.flavorId);
  const name = item.menuName || menu?.name || 'Menu item';
  if (!flavor) return name;
  if (name === 'Solo Sets') return `Solo Sets - ${flavor.name}`;
  if (name === 'ALL-YOU-CAN-EAT') return `${item.qty > 1 ? `AYCE ${item.qty}X` : 'AYCE'} - ${flavor.name}`;
  return `${name} - ${flavor.name}`;
}
