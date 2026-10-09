async function renderOrder() {
  const params = routeParams();
  let tableId = Number(params.get('tableId'));
  let orderId = Number(params.get('orderId'));
  if (!tableId) {
    sessionStorage.setItem('wingsmanMessage', 'Select or assign a table before taking an order.');
    navigate('tables');
    return;
  }
  let state = await api('/state');
  const table = state.tables.find((entry) => entry.id === tableId);
  if (!table) {
    sessionStorage.setItem('wingsmanMessage', 'The selected table is no longer available.');
    navigate('tables');
    return;
  }
  if (!orderId) orderId = table.currentOrderId;
  let order = state.orders.find((entry) => entry.id === orderId && entry.tableId === tableId);
  if (!order) {
    sessionStorage.setItem('wingsmanMessage', 'Assign this table before starting an order.');
    navigate('tables');
    return;
  }
  let draft = order.items.map((item) => ({ ...item }));
  let noteValue = order.note || '';
  let focusedMenuId = state.menuItems.find((item) => item.status === 'active')?.id || '';
  const selections = Object.create(null);
  state.menuItems.forEach((item) => {
    selections[item.id] = draft.find((line) => line.menuItemId === item.id)?.flavorId || item.flavorIds[0] || '';
  });
  let editMode = false;
  let saving = false;

  const originalDraft = () => JSON.stringify(draft.map((item) => [item.menuItemId, item.flavorId || '', item.qty]).sort());
  let savedLines = originalDraft();
  let savedNote = noteValue;
  const isDirty = () => originalDraft() !== savedLines || noteValue !== savedNote;
  const heading = pageHeading('Order Taking', '', '<span class="current-table-pill">Current Table: ' + escapeHtml(tableName(tableId)) + '</span>');
  const content = heading + '<div class="order-layout"><div class="menu-column" id="menuColumn"></div><aside class="card order-summary" id="orderSummary"></aside></div>';
  mount('order', content);

  const availableFlavors = (item) => item.flavorIds.map((id) => state.flavors.find((flavor) => flavor.id === id)).filter(Boolean);
  const lineFor = (menuItemId, flavorId) => draft.find((line) => line.menuItemId === menuItemId && (line.flavorId || '') === (flavorId || ''));
  const qtyFor = (menuItemId, flavorId) => lineFor(menuItemId, flavorId)?.qty || 0;

  const render = () => {
    const activeItems = state.menuItems.filter((item) => item.status === 'active');
    const disabled = saving ? ' disabled' : '';
    const menuHtml = activeItems.map((item) => {
      const flavors = availableFlavors(item);
      if (!flavors.some((flavor) => flavor.id === selections[item.id])) selections[item.id] = flavors[0]?.id || '';
      const selectedFlavor = selections[item.id] || '';
      const qty = qtyFor(item.id, selectedFlavor);
      const flavorButtons = flavors.length ? '<div class="flavor-set" aria-label="' + escapeHtml(item.name) + ' flavors">' + flavors.map((flavor) =>
        '<button class="chip' + (selectedFlavor === flavor.id ? ' selected' : '') + '" data-item-flavor="' + escapeHtml(item.id) + '" data-flavor="' + escapeHtml(flavor.id) + '" aria-pressed="' + (selectedFlavor === flavor.id) + '"' + disabled + '>' + escapeHtml(flavor.name) + '</button>'
      ).join('') + '</div>' : '<span></span>';
      const shownName = item.shortName || item.name;
      return '<section class="card menu-group"><div class="panel-heading"><h2 class="section-title">' + escapeHtml(shownName) + '</h2></div>' +
        '<div class="menu-row" data-menu-row="' + escapeHtml(item.id) + '"><div><div class="menu-item-name">' + escapeHtml(shownName) + '</div><div class="menu-price">' + peso(item.price) + '</div></div>' + flavorButtons +
        '<div class="stepper"><button data-qty="down" data-item="' + escapeHtml(item.id) + '" data-flavor="' + escapeHtml(selectedFlavor) + '" aria-label="Remove one ' + escapeHtml(shownName) + '" ' + (qty && !saving ? '' : 'disabled') + '>−</button><output>' + qty + '</output><button class="plus" data-qty="up" data-item="' + escapeHtml(item.id) + '" data-flavor="' + escapeHtml(selectedFlavor) + '" aria-label="Add one ' + escapeHtml(shownName) + '"' + disabled + '>+</button></div></div></section>';
    }).join('');
    const flavorChoices = '<section class="card flavor-panel"><h2 class="section-title">Flavors</h2><div class="flavor-set">' + state.flavors.map((flavor) =>
      '<button class="chip' + (selections[focusedMenuId] === flavor.id ? ' selected' : '') + '" data-global-flavor="' + escapeHtml(flavor.id) + '" aria-pressed="' + (selections[focusedMenuId] === flavor.id) + '"' + disabled + '>' + escapeHtml(flavor.name) + '</button>'
    ).join('') + '</div><p class="subtle">Choose a menu item first. Only assigned flavors can be selected.</p></section>';
    document.getElementById('menuColumn').innerHTML = menuHtml + flavorChoices;

    const subtotal = draft.reduce((sum, item) => sum + item.unitPrice * item.qty, 0);
    const orderLines = draft.length ? draft.map((item) => {
      const menu = state.menuItems.find((entry) => entry.id === item.menuItemId);
      const title = lineTitle(item, state);
      const editable = editMode ? '<div class="order-line-controls"><button class="chip" data-cart-step="-1" data-line="' + escapeHtml(item.lineId || '') + '" aria-label="Decrease quantity"' + disabled + '>−</button><span>Qty: ' + item.qty + '</span><button class="chip" data-cart-step="1" data-line="' + escapeHtml(item.lineId || '') + '" aria-label="Increase quantity"' + disabled + '>+</button><button class="btn btn-link danger" data-remove-line="' + escapeHtml(item.lineId || '') + '" aria-label="Remove ' + escapeHtml(title) + '"' + disabled + '>Remove</button></div>' : '<div class="order-line-meta">Qty: ' + item.qty + ' · ' + peso(item.unitPrice) + ' each</div>';
      return '<div class="order-line"><div><div class="order-line-title">' + escapeHtml(title) + '</div>' + editable + '</div><div class="order-line-total">' + peso(item.unitPrice * item.qty) + '</div></div>';
    }).join('') : '<p class="muted small">Your order is empty. Add items from the menu.</p>';
    const dirty = isDirty();
    const stateNote = order.status === 'preparing' ? '<p class="subtle">This order has been sent. Changes are sent to the kitchen when you save.</p>'
      : order.status === 'ready' ? '<p class="subtle">This order is ready. Saving changes sends it back to the kitchen.</p>' : '';
    document.getElementById('orderSummary').innerHTML =
      '<h2>YOUR ORDER</h2><div class="order-lines">' + orderLines + '</div><hr class="order-divider">' +
      '<label class="note-field">Note<textarea id="orderNote" maxlength="500" placeholder="e.g. Extra rice"' + disabled + '>' + escapeHtml(noteValue) + '</textarea></label>' +
      '<div class="order-subtotal"><span>Subtotal</span><span>' + peso(subtotal) + '</span></div>' + stateNote +
      '<div class="summary-actions"><button class="btn btn-secondary" data-clear ' + (draft.length || noteValue ? disabled : ' disabled') + '>Clear</button>' +
      '<button class="btn btn-secondary" data-edit' + disabled + '>' + (editMode ? 'Done Editing' : 'Edit') + '</button>' +
      '<button class="btn btn-primary" data-send ' + (saving || !draft.length || order.status === 'ready' && !dirty ? 'disabled' : '') + '>' + (saving ? 'Saving…' : 'Send to Kitchen') + '</button></div>';
    const note = document.getElementById('orderNote');
    note.addEventListener('input', () => {
      noteValue = note.value;
      const sendButton = document.querySelector('[data-send]');
      if (sendButton) sendButton.disabled = saving || !draft.length || order.status === 'ready' && !isDirty();
    });
  };

  document.getElementById('pageContent').addEventListener('click', async (event) => {
    const globalFlavor = event.target.closest('[data-global-flavor]');
    if (globalFlavor) {
      const menu = state.menuItems.find((item) => item.id === focusedMenuId);
      if (!menu?.flavorIds.includes(globalFlavor.dataset.globalFlavor)) {
        notify('That flavor is not assigned to the selected item.', 'error');
        return;
      }
      selections[menu.id] = globalFlavor.dataset.globalFlavor;
      render();
      return;
    }
    const flavorButton = event.target.closest('[data-item-flavor]');
    if (flavorButton) {
      focusedMenuId = flavorButton.dataset.itemFlavor;
      selections[focusedMenuId] = flavorButton.dataset.flavor;
      render();
      return;
    }
    const quantityButton = event.target.closest('[data-qty]');
    if (quantityButton) {
      const item = state.menuItems.find((entry) => entry.id === quantityButton.dataset.item);
      if (!item) return;
      focusedMenuId = item.id;
      const flavorId = quantityButton.dataset.flavor || '';
      const existing = lineFor(item.id, flavorId);
      if (quantityButton.dataset.qty === 'up') {
        selections[item.id] = flavorId;
        if (existing) existing.qty += 1;
        else draft.push({ lineId: makeId(), menuItemId: item.id, menuName: item.name, flavorId: flavorId || null, qty: 1, unitPrice: item.price, prepared: false });
      } else if (existing) {
        existing.qty -= 1;
        if (existing.qty <= 0) draft = draft.filter((line) => line !== existing);
      }
      render();
      return;
    }
    const editButton = event.target.closest('[data-edit]');
    if (editButton) { editMode = !editMode; render(); return; }
    const removeButton = event.target.closest('[data-remove-line]');
    if (removeButton) {
      draft = draft.filter((line) => line.lineId !== removeButton.dataset.removeLine);
      render();
      return;
    }
    const cartStep = event.target.closest('[data-cart-step]');
    if (cartStep) {
      const line = draft.find((item) => (item.lineId || '') === cartStep.dataset.line);
      if (line) {
        line.qty += Number(cartStep.dataset.cartStep);
        if (line.qty <= 0) draft = draft.filter((item) => item !== line);
        render();
      }
      return;
    }
    const menuRow = event.target.closest('[data-menu-row]');
    if (menuRow) {
      focusedMenuId = menuRow.dataset.menuRow;
      render();
      return;
    }
    const clearButton = event.target.closest('[data-clear]');
    if (clearButton && !clearButton.disabled) {
      if (!confirm('Clear all items and the order note?')) return;
      draft = [];
      noteValue = '';
      editMode = false;
      render();
      return;
    }
    const sendButton = event.target.closest('[data-send]');
    if (sendButton && !sendButton.disabled && !saving) {
      noteValue = document.getElementById('orderNote').value;
      saving = true;
      render();
      try {
        const result = await api('/orders/' + order.id + '/send', {
          method: 'POST', body: JSON.stringify({ items: draft, note: noteValue })
        });
        order = result.order;
        draft = order.items.map((item) => ({ ...item }));
        savedLines = originalDraft();
        savedNote = noteValue;
        editMode = false;
        notify('Order sent to the kitchen.');
      } catch (error) {
        notify(error.message, 'error');
      } finally {
        saving = false;
        render();
      }
    }
  });

  render();
}
