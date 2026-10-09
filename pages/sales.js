async function renderSales() {
  const report = await api('/reports');
  const actions = '<button class="btn btn-secondary" data-export>♧ Export PDF</button><button class="btn btn-secondary" data-print>▣ Print</button>';
  const header = pageHeading('SALES REPORTS', 'Period: Today', actions);
  const stats = '<div class="sales-stats"><section class="card stat-card"><div class="eyebrow">TODAY’S SALES</div><div class="stat-value">' + peso(report.todaySales) + '</div></section><section class="card stat-card"><div class="eyebrow">THIS WEEK’S SALES</div><div class="stat-value">' + peso(report.weekSales) + '</div></section></div>';
  const sellers = report.topSellers.length ? '<ol class="seller-list">' + report.topSellers.map((item, index) =>
    '<li><span class="rank">' + (index + 1) + '</span><strong>' + escapeHtml(item.name) + '</strong><span class="seller-count">' + item.quantity + ' orders</span></li>'
  ).join('') + '</ol>' : '<div class="empty-state"><p>No paid orders today.</p></div>';
  const peaks = report.peakHours.length ? '<div class="peak-list">' + report.peakHours.map((item, index) =>
    '<div class="peak-row"><span class="peak-icon" aria-hidden="true">' + (index === 0 ? '☼' : '◷') + '</span><div><strong>' + escapeHtml(item.range) + '</strong><span>' + escapeHtml(item.label) + ' · ' + item.orders + (item.orders === 1 ? ' order' : ' orders') + '</span></div></div>'
  ).join('') + '</div>' : '<p class="muted">No order activity yet today.</p>';
  mount('sales', header + stats + '<div class="sales-panels"><section class="card sales-panel"><h2>TOP SELLERS</h2><p>Most ordered items today · ranked by quantity sold</p>' + sellers + '</section><section class="card sales-panel"><h2>PEAK HOURS</h2><p>High demand periods · this week’s order timestamps</p>' + peaks + '</section></div>');
  document.getElementById('pageContent').addEventListener('click', (event) => {
    if (event.target.closest('[data-print]')) window.print();
    if (event.target.closest('[data-export]')) window.print();
  });
}
