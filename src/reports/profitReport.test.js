import { describe, it, expect } from 'vitest';
import { computeItemProfitStats, topByProfit, slowMovers } from './profitReport';

function item(overrides) {
  return { id: 'i1', sku: 'SKU1', name: 'Item 1', shopId: 's1', quantity: 5, ...overrides };
}

function sale(overrides) {
  return {
    id: 's1', timestamp: Date.now(), cancelled: false,
    items: [{ lineId: 'l1', itemId: 'i1', qty: 2, unitPrice: 100, unitCost: 60, lineTotal: 200, lineProfit: 80 }],
    refunds: [],
    ...overrides,
  };
}

describe('computeItemProfitStats', () => {
  it('sums revenue, cost, and profit across sales for an item', () => {
    const items = [item()];
    const sales = [sale(), sale({ id: 's2' })];
    const [stat] = computeItemProfitStats(items, sales);
    expect(stat.unitsSold).toBe(4);
    expect(stat.revenue).toBe(400);
    expect(stat.profit).toBe(160);
    expect(stat.marginPct).toBeCloseTo(40);
  });

  it('ignores a cancelled sale entirely', () => {
    const items = [item()];
    const sales = [sale({ cancelled: true })];
    const [stat] = computeItemProfitStats(items, sales);
    expect(stat.unitsSold).toBe(0);
    expect(stat.revenue).toBe(0);
  });

  it('nets out a refund against the item it refunded', () => {
    const items = [item()];
    const sales = [sale({
      refunds: [{ items: [{ lineId: 'l1', itemId: 'i1', qty: 1, amount: 100 }] }],
    })];
    const [stat] = computeItemProfitStats(items, sales);
    expect(stat.unitsSold).toBe(1);
    expect(stat.revenue).toBe(100);
    expect(stat.profit).toBe(40); // 80 gross profit - (100 refund - 60 cost) = 40
  });

  it('flags an item with stock and no recent sale as a slow mover', () => {
    const items = [item({ quantity: 3 })];
    const stats = computeItemProfitStats(items, [], { slowMoverDays: 30 });
    expect(stats[0].isSlowMover).toBe(true);
  });

  it('never flags an out-of-stock item as a slow mover', () => {
    const items = [item({ quantity: 0 })];
    const stats = computeItemProfitStats(items, []);
    expect(stats[0].isSlowMover).toBe(false);
  });

  it('does not flag an item that sold recently', () => {
    const items = [item({ quantity: 3 })];
    const stats = computeItemProfitStats(items, [sale({ timestamp: Date.now() })], { slowMoverDays: 30 });
    expect(stats[0].isSlowMover).toBe(false);
  });
});

describe('topByProfit / slowMovers', () => {
  it('sorts by profit descending and limits to n', () => {
    const stats = [{ profit: 10 }, { profit: 50 }, { profit: 30 }];
    expect(topByProfit(stats, 2).map((s) => s.profit)).toEqual([50, 30]);
  });

  it('sorts slow movers by longest idle first', () => {
    const stats = [
      { isSlowMover: true, daysSinceLastSale: 5 },
      { isSlowMover: true, daysSinceLastSale: 40 },
      { isSlowMover: false, daysSinceLastSale: 1 },
    ];
    expect(slowMovers(stats).map((s) => s.daysSinceLastSale)).toEqual([40, 5]);
  });
});
