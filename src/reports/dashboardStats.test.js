import { describe, it, expect } from 'vitest';
import { computeShopComparisonStats } from './dashboardStats';

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
});
