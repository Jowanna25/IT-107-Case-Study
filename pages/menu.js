import { api, escapeHtml, mount, pageHeading, notify, peso } from '../ui.js';

export async function renderMenu() {
  let state = await api('/state');
  let stagedPromos = state.promos.map((promo) => ({ ...promo }));
  let saving = false;
  const page = document.getElementById('pageContent');
  mount('menu', '');

  const render = () => {
    const menuRows = state.menuItems.length ? state.menuItems.map((item) => {
      const flavors = item.flavorIds.map((id) => state.flavors.find((flavor) => flavor.id === id)?.name).filter(Boolean);
      const flavorText = flavors.length ? flavors.map(escapeHtml).join(', ') : 'No assigned flavors';
      return '<tr><td><div class="item-main">' + escapeHtml(item.name) + '</div><div class="item-sub">' + flavorText + '</div></td><td><strong>' + peso(item.price) + '</strong></td><td><span class="status-pill status-' + escapeHtml(item.status) + '">' + (item.status === 'active' ? 'ACTIVE' : 'HIDDEN') + '</span></td><td><div class="data-actions"><button class="btn btn-link" data-edit="' + escapeHtml(item.id) + '">Edit</button><button class="btn btn-link danger" data-delete="' + escapeHtml(item.id) + '">Delete</button></div></td></tr>';
    }).join('') : '<tr><td colspan="4" class="muted">No menu items yet.</td></tr>';
    const promoRows = stagedPromos.map((promo) => '<tr><td><div class="item-main">' + escapeHtml(promo.name) + '</div></td><td><span class="status-pill status-' + (promo.active ? 'on' : 'off') + '">' + (promo.active ? 'ON' : 'OFF') + '</span></td><td><button class="btn btn-link ' + (promo.active ? 'danger' : 'success') + '" data-promo="' + escapeHtml(promo.id) + '">' + (promo.active ? 'Turn Off' : 'Turn On') + '</button></td></tr>').join('');
    const unsaved = JSON.stringify(stagedPromos) !== JSON.stringify(state.promos);
    page.innerHTML = pageHeading('Menu & Promo Settings', 'Manage your menu items and promotional offers from a single, elegant dashboard.') +
      '<div class="settings-stack"><section class="card settings-card"><div class="settings-card-header"><h2>Manage Menu Items</h2><button class="btn btn-primary" data-add>＋ Add New Item</button></div><div class="data-table-wrap"><table class="data-table"><thead><tr><th>ITEM NAME</th><th>PRICE</th><th>STATUS</th><th>ACTIONS</th></tr></thead><tbody>' + menuRows + '</tbody></table></div></section>' +
      '<section class="card settings-card"><div class="settings-card-header"><h2>Promo Management</h2><div class="btn-row"><span class="unsaved-message" id="unsavedLabel">' + (unsaved ? 'Unsaved changes' : '') + '</span><button class="btn btn-primary" data-save-promos ' + (saving || !unsaved ? 'disabled' : '') + '>Save Changes</button></div></div><div class="data-table-wrap"><table class="data-table promo-table"><thead><tr><th>PROMO NAME</th><th>STATUS</th><th>ACTIONS</th></tr></thead><tbody>' + promoRows + '</tbody></table></div></section></div>' +
      '<dialog id="itemDialog" aria-labelledby="dialogTitle"><form id="itemForm"><div class="dialog-head"><h2 id="dialogTitle">Add New Item</h2><button type="button" class="btn btn-secondary" data-close-dialog aria-label="Close dialog">Close</button></div><div class="dialog-body"><input type="hidden" id="itemId"><label class="field">Item name<input id="itemName" name="name" required maxlength="80" autocomplete="off"></label><label class="field">Price in pesos<input id="itemPrice" name="price" type="number" min="0.01" step="0.01" required></label><fieldset class="field" style="border:0;padding:0;margin:0"><legend>Assigned flavors</legend><div class="flavor-checks">' + state.flavors.map((flavor) => '<label class="flavor-check"><input type="checkbox" name="flavorIds" value="' + escapeHtml(flavor.id) + '">' + escapeHtml(flavor.name) + '</label>').join('') + '</div></fieldset><label class="field">Status<select id="itemStatus" name="status"><option value="active">Active</option><option value="hidden">Hidden</option></select></label><p class="field-error" id="formError" role="alert"></p></div><div class="dialog-actions"><button class="btn btn-secondary" type="button" data-close-dialog>Cancel</button><button class="btn btn-primary" type="submit" id="saveItem">Save Item</button></div></form></dialog>';
  };

  const dialog = () => document.getElementById('itemDialog');
  const closeDialog = () => { if (dialog()?.open) dialog().close(); };
  const openDialog = (item = null) => {
    const form = document.getElementById('itemForm');
    form.reset();
    document.getElementById('itemId').value = item?.id || '';
    document.getElementById('dialogTitle').textContent = item ? 'Edit Menu Item' : 'Add New Item';
    document.getElementById('itemName').value = item?.name || '';
    document.getElementById('itemPrice').value = item?.price ?? '';
    document.getElementById('itemStatus').value = item?.status || 'active';
    document.querySelectorAll('input[name="flavorIds"]').forEach((checkbox) => { checkbox.checked = Boolean(item?.flavorIds.includes(checkbox.value)); });
    document.getElementById('formError').textContent = '';
    dialog().showModal();
    document.getElementById('itemName').focus();
  };

  page.addEventListener('click', async (event) => {
    const add = event.target.closest('[data-add]');
    const edit = event.target.closest('[data-edit]');
    const remove = event.target.closest('[data-delete]');
    const toggle = event.target.closest('[data-promo]');
    const savePromos = event.target.closest('[data-save-promos]');
    const close = event.target.closest('[data-close-dialog]');
    if (add) { openDialog(); return; }
    if (edit) { openDialog(state.menuItems.find((item) => item.id === edit.dataset.edit)); return; }
    if (close) { closeDialog(); return; }
    if (remove) {
      const item = state.menuItems.find((entry) => entry.id === remove.dataset.delete);
      if (!item || !confirm('Delete ' + item.name + '? This cannot be undone.')) return;
      remove.disabled = true;
      try {
        await api('/menu-items/' + encodeURIComponent(item.id), { method: 'DELETE' });
        state = await api('/state');
        notify(item.name + ' deleted.');
        render();
      } catch (error) { notify(error.message, 'error'); remove.disabled = false; }
      return;
    }
    if (toggle) {
      stagedPromos = stagedPromos.map((promo) => promo.id === toggle.dataset.promo ? { ...promo, active: !promo.active } : promo);
      render();
      return;
    }
    if (savePromos && !savePromos.disabled) {
      savePromos.disabled = true;
      savePromos.textContent = 'Saving…';
      try {
        const result = await api('/promos', { method: 'PUT', body: JSON.stringify({ promos: stagedPromos }) });
        state.promos = result.promos;
        stagedPromos = result.promos.map((promo) => ({ ...promo }));
        notify('Promotion settings saved.');
      } catch (error) { notify(error.message, 'error'); }
      render();
    }
  });

  page.addEventListener('submit', async (event) => {
    if (event.target.id !== 'itemForm') return;
    event.preventDefault();
    if (saving) return;
    const id = document.getElementById('itemId').value;
    const name = document.getElementById('itemName').value.trim();
    const price = Number(document.getElementById('itemPrice').value);
    const flavorIds = [...document.querySelectorAll('input[name="flavorIds"]:checked')].map((checkbox) => checkbox.value);
    const status = document.getElementById('itemStatus').value;
    const errorBox = document.getElementById('formError');
    if (!name || !(price > 0) || !Number.isFinite(price)) {
      errorBox.textContent = 'Enter a unique name and a price greater than zero.';
      return;
    }
    if (state.menuItems.some((item) => item.id !== id && item.name.toLowerCase() === name.toLowerCase())) {
      errorBox.textContent = 'Menu item names must be unique.';
      return;
    }
    saving = true;
    const button = document.getElementById('saveItem');
    button.disabled = true;
    button.textContent = 'Saving…';
    try {
      const payload = { name, price, flavorIds, status };
      await api(id ? '/menu-items/' + encodeURIComponent(id) : '/menu-items', { method: id ? 'PUT' : 'POST', body: JSON.stringify(payload) });
      state = await api('/state');
      stagedPromos = state.promos.map((promo) => ({ ...promo }));
      closeDialog();
      notify(id ? 'Menu item updated.' : 'Menu item added.');
      render();
    } catch (error) {
      errorBox.textContent = error.message;
      button.disabled = false;
      button.textContent = 'Save Item';
    } finally { saving = false; }
  });

  render();
}
