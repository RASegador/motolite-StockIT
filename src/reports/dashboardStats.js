import { itemInventoryValue, reorderThresholdInBase } from '../lib/units';

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
