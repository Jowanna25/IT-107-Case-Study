const statusNames = { available: 'Available', occupied: 'Occupied', reserved: 'Reserved', cleaning: 'Cleaning' };
const floorNames = { 1: 'First-floor seating', 2: 'Second-floor seating' };

async function renderTables() {
  let state = await api('/state');
  let floor = Number(routeParams().get('floor')) === 2 ? 2 : 1;
  let selectedId = null;
  const brand = '<div class="table-brand-actions"><div class="floor-switch" role="group" aria-label="Choose floor"><button class="btn btn-secondary" data-floor="1">1st Floor</button><button class="btn btn-secondary" data-floor="2">2nd Floor</button></div><img class="brand-logo" src="assets/wingsman-logo.png" alt="Wingsman"></div>';
  const legend = '<section class="card legend" aria-label="Table status legend"><span class="legend-item"><i class="legend-dot dot-available"></i>Available</span><span class="legend-item"><i class="legend-dot dot-occupied"></i>Occupied</span><span class="legend-item"><i class="legend-dot dot-reserved"></i>Reserved</span><span class="legend-item"><i class="legend-dot dot-cleaning"></i>Cleaning</span></section>';
  const seating = '<section class="card seating-panel"><div class="panel-heading"><h2 class="section-title" id="floorTitle"></h2><span class="subtle" id="floorCount"></span></div><div class="table-grid" id="tableGrid"></div><div class="floor-actions" id="tableActions"></div><div class="selection-hint" id="selectionHint" aria-live="polite"></div></section>';
  mount('tables', pageHeading('Table Management', 'Manage your first-floor seating and table status from a single, elegant dashboard.', brand) + legend + seating);
  document.querySelector('.page-heading').classList.add('table-page-heading');
  const pendingMessage = sessionStorage.getItem('wingsmanMessage');
  if (pendingMessage) { sessionStorage.removeItem('wingsmanMessage'); notify(pendingMessage, 'error'); }
  const floorText = { 1: '1st Floor', 2: '2nd Floor' };

  const render = () => {
    const tables = state.tables.filter((table) => table.floor === floor);
    if (!tables.some((table) => table.id === selectedId)) selectedId = tables[0]?.id ?? null;
    document.querySelectorAll('[data-floor]').forEach((button) => {
      button.classList.toggle('selected-floor', Number(button.dataset.floor) === floor);
      button.setAttribute('aria-pressed', String(Number(button.dataset.floor) === floor));
    });
    document.getElementById('floorTitle').textContent = floorNames[floor];
    document.querySelector('.page-heading p').textContent = 'Manage your ' + (floor === 1 ? 'first-floor' : 'second-floor') + ' seating and table status from a single, elegant dashboard.';
    document.getElementById('floorCount').textContent = tables.length + ' tables • ' + floorText[floor];
    document.getElementById('tableGrid').innerHTML = tables.map((table) => {
      const label = statusNames[table.status] || table.status;
      return '<button class="table-card' + (table.id === selectedId ? ' selected' : '') + '" data-table="' + table.id + '" aria-pressed="' + (table.id === selectedId) + '"><span class="table-name">' + escapeHtml(tableName(table.id)) + '</span><span class="status-pill status-' + escapeHtml(table.status) + '">' + escapeHtml(label) + '</span></button>';
    }).join('');
    const table = tables.find((entry) => entry.id === selectedId);
    const order = table?.currentOrderId ? state.orders.find((entry) => entry.id === table.currentOrderId) : null;
    const canAssign = table && ['available', 'reserved'].includes(table.status);
    const canRelease = table && ['cleaning', 'reserved'].includes(table.status)
      || table?.status === 'occupied' && (!order || order.status === 'cancelled' || order.status === 'open' && order.items.length === 0);
    const canContinue = table?.status === 'occupied' && order && ['open', 'preparing', 'ready'].includes(order.status);
    const primaryAction = canContinue ? 'continue' : 'assign';
    const primaryText = canContinue ? 'Continue Order' : 'Assign Table';
    document.getElementById('tableActions').innerHTML =
      '<button class="btn btn-primary" data-action="' + primaryAction + '"' + (canAssign || canContinue ? '' : ' disabled') + '>' + primaryText + '</button>' +
      '<button class="btn btn-secondary" data-action="release"' + (canRelease ? '' : ' disabled') + '>Release Table</button>' +
      (table?.status === 'available' ? '<button class="btn btn-link" data-action="reserve">Mark as Reserved</button>' : '');
    const hint = !table ? 'Select a table to continue.'
      : canContinue ? 'Active order #' + order.id + ' · ' + order.status.charAt(0).toUpperCase() + order.status.slice(1)
        : canAssign ? 'Select Assign Table to start an order.'
          : table.status === 'occupied' ? 'This table has an active order and cannot be released.'
            : table.status === 'cleaning' ? 'Release this table after cleaning.' : 'Release this reservation to make the table available.';
    document.getElementById('selectionHint').textContent = hint;
  };

  document.getElementById('pageContent').addEventListener('click', async (event) => {
    const floorButton = event.target.closest('[data-floor]');
    if (floorButton) {
      floor = Number(floorButton.dataset.floor);
      selectedId = null;
      render();
      return;
    }
    const tableButton = event.target.closest('[data-table]');
    if (tableButton) {
      selectedId = Number(tableButton.dataset.table);
      render();
      return;
    }
    const actionButton = event.target.closest('[data-action]');
    if (!actionButton || actionButton.disabled) return;
    const table = state.tables.find((entry) => entry.id === selectedId);
    if (!table) return;
    actionButton.disabled = true;
    try {
      if (actionButton.dataset.action === 'assign') {
        const result = await api('/tables/' + table.id + '/assign', { method: 'POST', body: '{}' });
        navigate('order', { tableId: table.id, orderId: result.order.id });
        return;
      }
      if (actionButton.dataset.action === 'continue') {
        navigate('order', { tableId: table.id, orderId: table.currentOrderId });
        return;
      }
      if (actionButton.dataset.action === 'reserve') {
        await api('/tables/' + table.id + '/status', { method: 'PATCH', body: JSON.stringify({ status: 'reserved' }) });
        state = await api('/state');
        notify(tableName(table.id) + ' marked as reserved.');
      } else if (actionButton.dataset.action === 'release') {
        if (!confirm('Release ' + tableName(table.id) + ' and make it available?')) return;
        await api('/tables/' + table.id + '/release', { method: 'POST', body: '{}' });
        state = await api('/state');
        notify(tableName(table.id) + ' is now available.');
      }
      render();
    } catch (error) {
      notify(error.message, 'error');
      actionButton.disabled = false;
    }
  });
  render();
}
