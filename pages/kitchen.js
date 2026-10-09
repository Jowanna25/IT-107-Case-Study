async function renderKitchen() {
  let state = await api('/state');
  let saving = false;
  const page = document.getElementById('pageContent');
  mount('kitchen', pageHeading('Kitchen Order Display', 'Orders appear here as soon as they are sent.') + '<div class="kitchen-list" id="kitchenList"></div>');
  const statusClass = (status) => status === 'ready' ? 'status-ready' : 'status-preparing';

  const render = () => {
    const active = state.orders.filter((order) => ['preparing', 'ready'].includes(order.status))
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    const host = document.getElementById('kitchenList');
    if (!active.length) {
      host.innerHTML = '<section class="empty-state"><h2>No active kitchen orders</h2><p>New orders will appear here automatically.</p></section>';
      return;
    }
    host.innerHTML = active.map((order) => {
      const preparedCount = order.items.filter((item) => item.prepared).length;
      const allPrepared = order.items.length > 0 && preparedCount === order.items.length;
      const items = order.items.map((item) => {
        const title = lineTitle(item, state) + (item.qty > 1 && !String(item.menuName).startsWith('ALL-YOU-CAN-EAT') ? ' × ' + item.qty : '');
        const amount = peso(item.unitPrice * item.qty);
        const disabled = order.status !== 'preparing' || saving ? ' disabled' : '';
        return '<div class="kitchen-item"><input type="checkbox" id="check-' + escapeHtml(item.lineId) + '" data-prepared data-order="' + order.id + '" data-line="' + escapeHtml(item.lineId) + '" ' + (item.prepared ? 'checked' : '') + disabled + '><label for="check-' + escapeHtml(item.lineId) + '">' + escapeHtml(title) + '</label><span class="price">' + amount + '</span></div>';
      }).join('');
      const actions = order.status === 'preparing'
        ? '<button class="btn btn-primary" data-done="' + order.id + '"' + (allPrepared && !saving ? '' : ' disabled') + '>DONE</button><button class="btn btn-danger" data-cancel="' + order.id + '"' + (saving ? ' disabled' : '') + '>CANCEL ORDER</button>'
        : '<a class="btn btn-primary" href="#billing?orderId=' + order.id + '">Bill Order</a><button class="btn btn-danger" data-cancel="' + order.id + '"' + (saving ? ' disabled' : '') + '>CANCEL ORDER</button>';
      return '<article class="card kitchen-card"><div class="kitchen-card-heading"><h2>' + escapeHtml(tableName(order.tableId)) + ' · Order #' + order.id + '</h2><span class="status-pill ' + statusClass(order.status) + '">Table ' + paddedTable(order.tableId) + ' · ' + (order.status === 'ready' ? 'Ready to bill' : 'Preparing') + '</span></div><h3 class="section-title">Order Items</h3><div class="kitchen-items">' + items + '</div><div class="note-row"><span class="muted">Note:</span><span>' + escapeHtml(order.note || '—') + '</span></div><div class="kitchen-total"><span>SUBTOTAL:</span><span>' + peso(order.subtotal) + '</span></div><div class="kitchen-actions">' + actions + '</div></article>';
    }).join('');
  };

  page.addEventListener('change', async (event) => {
    const checkbox = event.target.closest('[data-prepared]');
    if (!checkbox || saving) return;
    saving = true;
    checkbox.disabled = true;
    try {
      await api('/orders/' + checkbox.dataset.order + '/items/' + encodeURIComponent(checkbox.dataset.line) + '/prepared', {
        method: 'PATCH', body: JSON.stringify({ prepared: checkbox.checked })
      });
      state = await api('/state');
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      saving = false;
      render();
    }
  });

  page.addEventListener('click', async (event) => {
    const done = event.target.closest('[data-done]');
    const cancel = event.target.closest('[data-cancel]');
    if (done && !done.disabled && !saving) {
      saving = true;
      done.disabled = true;
      try {
        await api('/orders/' + done.dataset.done + '/done', { method: 'POST', body: '{}' });
        state = await api('/state');
        notify('Order marked ready to bill.');
      } catch (error) { notify(error.message, 'error'); }
      finally { saving = false; render(); }
    } else if (cancel && !cancel.disabled && !saving) {
      const order = state.orders.find((entry) => entry.id === Number(cancel.dataset.cancel));
      if (!confirm('Cancel order #' + order.id + ' for ' + tableName(order.tableId) + '?')) return;
      saving = true;
      cancel.disabled = true;
      try {
        await api('/orders/' + order.id + '/cancel', { method: 'POST', body: '{}' });
        state = await api('/state');
        notify('Order cancelled.');
      } catch (error) { notify(error.message, 'error'); }
      finally { saving = false; render(); }
    }
  });

  const refresh = async () => {
    if (saving || document.hidden) return;
    try { state = await api('/state'); render(); }
    catch (error) { notify(error.message, 'error'); }
  };
  render();
  const refreshTimer = window.setInterval(() => {
    if (!page.isConnected) { window.clearInterval(refreshTimer); return; }
    refresh();
  }, 5000);
}
