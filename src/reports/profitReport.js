// Per-item profit and "is this worth stocking" stats, computed from the
// same `items`/`sales` data every other report already streams — no new
// collection, same pattern as restockAlerts.js.
//
// A "slow mover" is an item that hasn't sold in `slowMoverDays` (default
// 30) — or has never sold at all — while still carrying stock on hand.
// An item with zero stock is never flagged: there's nothing sitting idle
// to react to.
const DEFAULT_SLOW_MOVER_DAYS = 30;

export function computeItemProfitStats(items, sales, { slowMoverDays = DEFAULT_SLOW_MOVER_DAYS } = {}) {
  const now = Date.now();
  const byItem = new Map();

  (items || []).forEach((item) => {
    byItem.set(item.id, {
      itemId: item.id, sku: item.sku || '', name: item.name || '',
      shopId: item.shopId || null, currentStock: item.quantity || 0,
      unitsSold: 0, revenue: 0, cost: 0, profit: 0,
      lastSaleAt: null,
    });
  });

  (sales || []).forEach((sale) => {
    if (sale.cancelled) return;
    (sale.items || []).forEach((line) => {
      const stat = byItem.get(line.itemId);
      if (!stat) return; // item was deleted since — no current row to attribute this to
      stat.unitsSold += line.qty;
      stat.revenue += line.lineTotal ?? line.unitPrice * line.qty;
      stat.cost += (line.unitCost || 0) * line.qty;
      stat.profit += line.lineProfit ?? (line.unitPrice - (line.unitCost || 0)) * line.qty;
      if (!stat.lastSaleAt || sale.timestamp > stat.lastSaleAt) stat.lastSaleAt = sale.timestamp;
    });
  });

  // Net out refunds the same way src/lib/salesMath.js does for totals —
  // a heavily-refunded item shouldn't look like a top performer.
  (sales || []).forEach((sale) => {
    if (sale.cancelled) return;
    (sale.refunds || []).forEach((refund) => {
      (refund.items || []).forEach((ri) => {
        const stat = byItem.get(ri.itemId);
        if (!stat) return;
        stat.unitsSold -= ri.qty;
        stat.revenue -= ri.amount;
        const line = (sale.items || []).find((l) => l.lineId === ri.lineId);
        const unitCost = line?.unitCost || 0;
        stat.cost -= unitCost * ri.qty;
        stat.profit -= (ri.amount - unitCost * ri.qty);
      });
    });
  });

  return Array.from(byItem.values()).map((stat) => {
    const marginPct = stat.revenue > 0 ? (stat.profit / stat.revenue) * 100 : null;
    const daysSinceLastSale = stat.lastSaleAt != null ? Math.floor((now - stat.lastSaleAt) / 86400000) : null;
    const isSlowMover = stat.currentStock > 0 && (daysSinceLastSale == null || daysSinceLastSale >= slowMoverDays);
    return { ...stat, marginPct, daysSinceLastSale, isSlowMover };
  });
}

export function topByProfit(stats, n = 10) {
  return [...stats].sort((a, b) => b.profit - a.profit).slice(0, n);
}

export function slowMovers(stats) {
  return stats.filter((s) => s.isSlowMover)
    .sort((a, b) => (b.daysSinceLastSale ?? Infinity) - (a.daysSinceLastSale ?? Infinity));
}
