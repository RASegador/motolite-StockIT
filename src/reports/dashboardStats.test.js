import { describe, it, expect } from 'vitest';
import { computeShopComparisonStats, filterSalesForChart, groupSalesByDate } from './dashboardStats';

const shops = [{ id: 'shopA', name: 'Branch A' }, { id: 'shopB', name: 'Branch B' }];
const items = [
  { id: 'i1', shopId: 'shopA', quantity: 2, reorderPoint: 5, reorderUnit: 'Piece', baseUnitName: 'Piece', unitCost: 800, unitStock: { Piece: 2 } },
  { id: 'i2', shopId: 'shopA', quantity: 0, reorderPoint: 3, reorderUnit: 'Piece', baseUnitName: 'Piece', unitCost: 500, unitStock: { Piece: 0 } },
  { id: 'i3', shopId: 'shopB', quantity: 20, reorderPoint: 3, reorderUnit: 'Piece', baseUnitName: 'Piece', unitCost: 900, unitStock: { Piece: 20 } },
];
const sales = [
  { shopId: 'shopA', total: 1000, totalProfit: 200, cancelled: false, items: [{ qty: 3 }] },
  { shopId: 'shopA', total: 500, totalProfit: 100, cancelled: true, items: [{ qty: 1 }] }, // cancelled, excluded
  { shopId: 'shopB', total: 3000, totalProfit: 900, cancelled: false, items: [{ qty: 2 }, { qty: 1 }] },
];

describe('computeShopComparisonStats', () => {
  it('buckets inventory value, low/out-of-stock counts per shop', () => {
    const { perShop } = computeShopComparisonStats(items, sales, shops);
    const shopA = perShop.find((s) => s.shopId === 'shopA');
    expect(shopA.inventoryValue).toBe(1600); // 2*800 + 0*500
    expect(shopA.lowStockCount).toBe(1); // i1: 2 <= reorderPoint 5
    expect(shopA.outOfStockCount).toBe(1); // i2: quantity 0
  });

  it('excludes cancelled sales from revenue/profit/units sold', () => {
    const { perShop } = computeShopComparisonStats(items, sales, shops);
    const shopA = perShop.find((s) => s.shopId === 'shopA');
    expect(shopA.revenue).toBe(1000);
    expect(shopA.profit).toBe(200);
    expect(shopA.unitsSold).toBe(3);
  });

  it('sums per-shop stats into overall totals', () => {
    const { totals } = computeShopComparisonStats(items, sales, shops);
    expect(totals.revenue).toBe(4000); // 1000 (shopA, non-cancelled) + 3000 (shopB)
    expect(totals.unitsSold).toBe(6); // 3 + 2 + 1
    expect(totals.outOfStockCount).toBe(1);
  });

  it('nets out a partial refund from revenue and profit', () => {
    const withRefund = [
      { shopId: 'shopA', total: 1000, totalProfit: 200, refundedAmount: 300, refundedProfit: 60, cancelled: false, items: [{ qty: 3 }] },
    ];
    const { perShop } = computeShopComparisonStats(items, withRefund, shops);
    const shopA = perShop.find((s) => s.shopId === 'shopA');
    expect(shopA.revenue).toBe(700);
    expect(shopA.profit).toBe(140);
  });
});

describe('filterSalesForChart', () => {
  const dated = [
    { shopId: 'shopA', total: 100, cancelled: false, timestamp: new Date('2026-07-01T10:00:00').getTime(), items: [{ qty: 1 }] },
    { shopId: 'shopA', total: 200, cancelled: false, timestamp: new Date('2026-07-02T10:00:00').getTime(), items: [{ qty: 2 }] },
    { shopId: 'shopB', total: 300, cancelled: false, timestamp: new Date('2026-07-02T10:00:00').getTime(), items: [{ qty: 3 }] },
    { shopId: 'shopA', total: 400, cancelled: true, timestamp: new Date('2026-07-02T10:00:00').getTime(), items: [{ qty: 4 }] },
  ];

  it('defaults to every shop, all dates, excluding cancelled sales', () => {
    const result = filterSalesForChart(dated, {});
    expect(result).toHaveLength(3);
  });

  it('filters to a single shop when shopId is given', () => {
    const result = filterSalesForChart(dated, { shopId: 'shopA' });
    expect(result.map((s) => s.total)).toEqual([100, 200]);
  });

  it('"all" behaves the same as no shopId filter', () => {
    expect(filterSalesForChart(dated, { shopId: 'all' })).toHaveLength(3);
  });

  it('filters to a date range (inclusive of both endpoints)', () => {
    const result = filterSalesForChart(dated, { startDate: '2026-07-02', endDate: '2026-07-02' });
    expect(result.map((s) => s.total)).toEqual([200, 300]);
  });

  it('combines shop and date filters', () => {
    const result = filterSalesForChart(dated, { shopId: 'shopA', startDate: '2026-07-02', endDate: '2026-07-02' });
    expect(result.map((s) => s.total)).toEqual([200]);
  });
});

describe('groupSalesByDate', () => {
  it('sums revenue and units per calendar day, sorted ascending', () => {
    const sales = [
      { total: 200, timestamp: new Date('2026-07-02T09:00:00').getTime(), items: [{ qty: 2 }] },
      { total: 100, timestamp: new Date('2026-07-01T09:00:00').getTime(), items: [{ qty: 1 }] },
      { total: 300, timestamp: new Date('2026-07-02T18:00:00').getTime(), items: [{ qty: 3 }] },
    ];
    const result = groupSalesByDate(sales);
    expect(result).toEqual([
      { date: '2026-07-01', revenue: 100, unitsSold: 1 },
      { date: '2026-07-02', revenue: 500, unitsSold: 5 },
    ]);
  });

  it('returns an empty array for no sales', () => {
    expect(groupSalesByDate([])).toEqual([]);
  });

  it('nets out refunded amounts per day', () => {
    const result = groupSalesByDate([
      { total: 1000, refundedAmount: 400, timestamp: new Date('2026-07-01T09:00:00').getTime(), items: [{ qty: 2 }] },
    ]);
    expect(result).toEqual([{ date: '2026-07-01', revenue: 600, unitsSold: 2 }]);
  });
});
