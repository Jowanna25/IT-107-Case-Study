export const FLAVORS = [
  { id: 'honey-garlic', name: 'Honey Garlic' }, { id: 'butter', name: 'Butter' },
  { id: 'garlic', name: 'Garlic' }, { id: 'honey-butter', name: 'Honey Butter' }, { id: 'bbq', name: 'BBQ' }
];

export const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));
export const peso = (amount) => `₱${Number(amount || 0).toLocaleString('en-PH', { maximumFractionDigits: 2 })}`;
export const tableName = (id) => `Tbl ${Number(id)}`;
export const paddedTable = (id) => String(Number(id)).padStart(2, '0');
export const dateUS = (value = new Date()) => new Date(value).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
export const time12 = (value) => new Date(value).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

export async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status}).`);
  return payload;
}

export function notify(message, kind = 'success') {
  const host = document.getElementById('toastHost');
  if (!host) return;
  const node = document.createElement('div');
  node.className = `toast toast-${kind}`;
  node.setAttribute('role', 'status');
  node.textContent = message;
  host.append(node);
  setTimeout(() => node.remove(), 3600);
}

export function nav(active) {
  const pages = [
    ['tables.html', 'Table Management', 'tables'], ['order.html', 'Order Taking', 'order'],
    ['kitchen.htm', 'Kitchen Display', 'kitchen'], ['billing.html', 'Billing & Payment', 'billing'],
    ['menu.html', 'Menu & Promo Settings', 'menu'], ['sales.html', 'Sales Reports', 'sales']
  ];
  return `<nav class="nav" aria-label="Main navigation">${pages.map(([href, label, key]) =>
    `<a href="${href}"${active === key ? ' class="active" aria-current="page"' : ''}>${label}</a>`).join('')}</nav>`;
}

export function mount(active, content) {
  document.getElementById('siteNav').innerHTML = nav(active);
  document.getElementById('pageContent').innerHTML = content;
}

export function pageHeading(title, subtitle = '', actions = '') {
  return `<header class="page-heading"><div><h1>${escapeHtml(title)}</h1>${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ''}</div>${actions ? `<div class="heading-actions">${actions}</div>` : ''}</header>`;
}

export function pageError(error) {
  const host = document.getElementById('pageContent');
  host.innerHTML = `<section class="card error-card"><h2>We couldn’t load this page</h2><p>${escapeHtml(error.message || 'Please try again.')}</p><button class="btn btn-secondary" onclick="location.reload()">Retry</button></section>`;
}

export function lineTitle(item, state) {
  const menu = state.menuItems.find((entry) => entry.id === item.menuItemId);
  const flavor = state.flavors.find((entry) => entry.id === item.flavorId);
  const name = item.menuName || menu?.name || 'Menu item';
  if (!flavor) return name;
  if (name === 'Solo Sets') return `Solo Sets - ${flavor.name}`;
  if (name === 'ALL-YOU-CAN-EAT') return `${item.qty > 1 ? `AYCE ${item.qty}X` : 'AYCE'} - ${flavor.name}`;
  return `${name} - ${flavor.name}`;
}
