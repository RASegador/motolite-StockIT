import { itemInventoryValue, reorderThresholdInBase } from '../lib/units';

// Local (not UTC) calendar-day key, so a sale made late at night doesn't get
// bucketed onto the "wrong" day for a user west of UTC — toISOString() would
// shift by the timezone offset first.
function dateKey(timestamp) {
  const d = new Date(timestamp);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// `startDate`/`endDate` are 'YYYY-MM-DD' strings straight out of an
// <input type="date">, or null/undefined for an open-ended bound.
// `shopId` of 'all'/null/undefined means every shop.
export function filterSalesForChart(sales, { shopId, startDate, endDate } = {}) {
  const start = startDate ? new Date(`${startDate}T00:00:00`).getTime() : null;
  const end = endDate ? new Date(`${endDate}T23:59:59.999`).getTime() : null;
  return (sales || []).filter((sale) => {
    if (sale.cancelled) return false;
    if (shopId && shopId !== 'all' && sale.shopId !== shopId) return false;
    if (start != null && sale.timestamp < start) return false;
    if (end != null && sale.timestamp > end) return false;
    return true;
  });
}

// Groups already-filtered sales into one revenue total per calendar day,
// sorted oldest to newest — the shape recharts wants for a bar/line chart.
export function groupSalesByDate(sales) {
  const byDate = {};
  (sales || []).forEach((sale) => {
    const key = dateKey(sale.timestamp);
    if (!byDate[key]) byDate[key] = { date: key, revenue: 0, unitsSold: 0 };
    byDate[key].revenue += sale.total;
    byDate[key].unitsSold += (sale.items || []).reduce((sum, line) => sum + line.qty, 0);
  });
  return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
}

const EMPTY_BUCKET = { inventoryValue: 0, lowStockCount: 0, outOfStockCount: 0, revenue: 0, unitsSold: 0, profit: 0 };

export function computeShopComparisonStats(items, sales, shops) {
  const byShop = {};
  shops.forEach((s) => { byShop[s.id] = { shopId: s.id, shopName: s.name, ...EMPTY_BUCKET }; });

  items.forEach((item) => {
    const bucket = byShop[item.shopId];
    if (!bucket) return;
    bucket.inventoryValue += itemInventoryValue(item);
    const threshold = reorderThresholdInBase(item);
    if (item.quantity <= 0) bucket.outOfStockCount += 1;
    else if (item.quantity <= threshold) bucket.lowStockCount += 1;
  });

  sales.filter((sale) => !sale.cancelled).forEach((sale) => {
    const bucket = byShop[sale.shopId];
    if (!bucket) return;
    bucket.revenue += sale.total;
    bucket.profit += sale.totalProfit || 0;
    bucket.unitsSold += sale.items.reduce((sum, line) => sum + line.qty, 0);
  });

  const perShop = Object.values(byShop);
  const totals = perShop.reduce((acc, b) => ({
    inventoryValue: acc.inventoryValue + b.inventoryValue,
    lowStockCount: acc.lowStockCount + b.lowStockCount,
    outOfStockCount: acc.outOfStockCount + b.outOfStockCount,
    revenue: acc.revenue + b.revenue,
    unitsSold: acc.unitsSold + b.unitsSold,
    profit: acc.profit + b.profit,
  }), { ...EMPTY_BUCKET });

  return { perShop, totals };
}
