const readAmount = (value) => {
  const amount = Number(String(value || '').replace(/,/g, '').replace(/[₱\s]/g, ''));
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
};

async function renderBilling() {
  let state = await api('/state');
  const params = routeParams();
  const linkedTableId = Number(params.get('tableId')) || 0;
  const linkedTableOrder = state.tables.find((table) => table.id === linkedTableId)?.currentOrderId || 0;
  let selectedId = Number(params.get('orderId')) || linkedTableOrder;
  let paidOrder = null;
  let paymentSaving = false;
  const page = document.getElementById('pageContent');
  mount('billing', '');

  const render = () => {
    const readyOrders = state.orders.filter((order) => order.status === 'ready')
      .sort((a, b) => new Date(a.readyAt || a.createdAt) - new Date(b.readyAt || b.createdAt));
    let current = readyOrders.find((order) => order.id === selectedId);
    if (!current && !selectedId) current = readyOrders[0] || null;
    if (current) selectedId = current.id;
    const options = readyOrders.map((order) => '<option value="' + order.id + '"' + (current?.id === order.id ? ' selected' : '') + '>' +
      escapeHtml(tableName(order.tableId) + ' · Order #' + order.id + ' · ' + peso(order.total)) + '</option>').join('');
    const selector = '<select class="form-control order-select" id="orderSelect" aria-label="Choose a ready order"><option value="">Choose a ready order</option>' + options + '</select>';
    let content = pageHeading('BILLING & PAYMENT', '', selector);
    if (paidOrder) {
      content += '<section class="card empty-state"><h2>Payment complete</h2><p>Order #' + paidOrder.id + ' for ' + escapeHtml(tableName(paidOrder.tableId)) + ' is paid. The table is now marked for cleaning.</p><div class="btn-row" style="justify-content:center;margin-top:16px"><a class="btn btn-primary" href="#tables?floor=' + (paidOrder.tableId <= 4 ? 1 : 2) + '">Return to Table Management</a></div></section>';
      page.innerHTML = content;
      return;
    }
    if (!current) {
      content += '<section class="empty-state"><h2>No ready orders to bill</h2><p>Orders appear here after the kitchen marks them done.</p></section>';
      page.innerHTML = content;
      return;
    }
    const items = current.items.map((item) => '<div class="billing-item"><strong>' + escapeHtml(lineTitle(item, state)) + '</strong><span class="qty">Qty: ' + item.qty + '</span><span class="amount">' + peso(item.unitPrice * item.qty) + '</span></div>').join('');
    const meta = '<div class="billing-meta"><div><span class="eyebrow">Table No:</span><strong>' + paddedTable(current.tableId) + '</strong></div><div><span class="eyebrow">Order #:</span><strong>' + current.id + '</strong></div><div><span class="eyebrow">Date:</span><strong>' + dateUS(new Date()) + '</strong></div></div>';
    const orderCard = '<div class="billing-layout"><section class="card billing-card"><h2>ITEMS ORDERED</h2>' + items +
      '<div class="billing-totals"><div class="billing-total-row"><span>SUBTOTAL</span><strong>' + peso(current.subtotal) + '</strong></div><div class="billing-total-row final"><span>TOTAL AMOUNT</span><strong>' + peso(current.total) + '</strong></div></div></section>' +
      '<section class="card billing-card"><h2>PAYMENT DETAILS</h2><label class="field">Amount Received<div class="amount-wrap"><span class="currency-mark">₱</span><input id="amountReceived" type="text" inputmode="decimal" autocomplete="off" placeholder="0" aria-label="Amount received"></div></label>' +
      '<div class="payment-change"><span>Change</span><strong id="changeAmount">' + peso(0) + '</strong></div><div class="field-error" id="paymentError" aria-live="polite"></div>' +
      '<div class="billing-actions"><button class="btn btn-primary" data-print>PRINT RECEIPT</button><button class="btn btn-secondary" data-pay' + (paymentSaving ? ' disabled' : '') + '>COMPLETE PAYMENT</button></div></section></div>';
    content += meta + orderCard;
    page.innerHTML = content;
    document.getElementById('orderSelect').addEventListener('change', (event) => {
      selectedId = Number(event.target.value) || 0;
      navigate('billing', selectedId ? { orderId: selectedId } : {});
    });
    const received = document.getElementById('amountReceived');
    received.addEventListener('input', () => {
      const amount = readAmount(received.value);
      document.getElementById('changeAmount').textContent = peso(Math.max(0, amount - current.total));
      document.getElementById('paymentError').textContent = '';
    });
    received.addEventListener('blur', () => {
      if (received.value.trim()) received.value = readAmount(received.value).toLocaleString('en-PH', { maximumFractionDigits: 2 });
    });
  };

  page.addEventListener('click', async (event) => {
    const printButton = event.target.closest('[data-print]');
    if (printButton) {
      const current = state.orders.find((order) => order.id === selectedId);
      if (!current) return;
      const received = readAmount(document.getElementById('amountReceived')?.value);
      const change = Math.max(0, received - current.total);
      const lines = current.items.map((item) => '<tr><td>' + escapeHtml(lineTitle(item, state) + ' × ' + item.qty) + '</td><td>' + peso(item.unitPrice * item.qty) + '</td></tr>').join('');
      document.getElementById('printArea').innerHTML = '<h1>Wingsman Food &amp; Table</h1><p>Billing &amp; Payment Receipt</p><p>Table ' + paddedTable(current.tableId) + ' · Order #' + current.id + '</p><p>' + dateUS(new Date()) + '</p><table>' + lines + '</table><p class="print-total">TOTAL: ' + peso(current.total) + '</p><p>Amount Received: ' + peso(received) + '</p><p>Change: ' + peso(change) + '</p><p>Thank you for dining with Wingsman.</p>';
      window.print();
      return;
    }
    const payButton = event.target.closest('[data-pay]');
    if (!payButton || payButton.disabled || paymentSaving) return;
    const current = state.orders.find((order) => order.id === selectedId && order.status === 'ready');
    if (!current) { notify('Choose an order that is ready to bill.', 'error'); return; }
    const amountReceived = readAmount(document.getElementById('amountReceived').value);
    if (amountReceived < current.total) {
      document.getElementById('paymentError').textContent = 'Insufficient amount. Enter at least ' + peso(current.total) + '.';
      return;
    }
    paymentSaving = true;
    payButton.disabled = true;
    payButton.textContent = 'Saving…';
    try {
      const result = await api('/orders/' + current.id + '/pay', { method: 'POST', body: JSON.stringify({ amountReceived }) });
      paidOrder = result.order;
      notify('Payment complete. ' + tableName(current.tableId) + ' is ready for cleaning.');
      render();
    } catch (error) {
      document.getElementById('paymentError').textContent = error.message;
      payButton.disabled = false;
      payButton.textContent = 'COMPLETE PAYMENT';
    } finally { paymentSaving = false; }
  });

  render();
}
