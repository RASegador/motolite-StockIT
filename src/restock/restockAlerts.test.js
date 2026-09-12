import { describe, it, expect } from 'vitest';
import { computeRestockAlerts, suggestedRestockQty } from './restockAlerts';

const shops = [
  { id: 'shopA', name: 'Store A', type: 'store' },
  { id: 'wh1', name: 'Warehouse 1', type: 'warehouse' },
];

function makeItem(overrides) {
  return {
    id: 'item1', sku: 'N50', name: 'N50 Battery', shopId: 'shopA',
    quantity: 5, baseUnitName: 'Piece', unitStock: { Piece: 5 }, units: [],
    reorderPoint: 10, reorderUnit: 'Piece',
    ...overrides,
  };
}

describe('computeRestockAlerts', () => {
  it('flags an item at or below its own reorder threshold', () => {
    const alerts = computeRestockAlerts([makeItem()], shops);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ itemId: 'item1', sku: 'N50', shopName: 'Store A', shopType: 'store', currentStock: 5, minStock: 10 });
    expect(alerts[0].suggestedQty).toBeGreaterThan(0);
  });

  it('does not flag an item comfortably above its threshold', () => {
    const alerts = computeRestockAlerts([makeItem({ quantity: 50 })], shops);
    expect(alerts).toHaveLength(0);
  });

  it('flags exactly-at-threshold too (reaches OR falls below)', () => {
    const alerts = computeRestockAlerts([makeItem({ quantity: 10 })], shops);
    expect(alerts).toHaveLength(1);
  });

  it('labels the shop by its type, including warehouses', () => {
    const alerts = computeRestockAlerts([makeItem({ shopId: 'wh1' })], shops);
    expect(alerts[0]).toMatchObject({ shopName: 'Warehouse 1', shopType: 'warehouse' });
  });

  it('sorts lowest-stock-first', () => {
    const alerts = computeRestockAlerts([
      makeItem({ id: 'a', quantity: 8 }),
      makeItem({ id: 'b', quantity: 1 }),
    ], shops);
    expect(alerts.map((a) => a.itemId)).toEqual(['b', 'a']);
  });
});

describe('suggestedRestockQty', () => {
  it('suggests enough to reach double the reorder point', () => {
    // threshold 10 -> target 20, current 5 -> suggest 15
    expect(suggestedRestockQty(makeItem({ quantity: 5 }))).toBe(15);
  });

  it('never suggests less than 1', () => {
    expect(suggestedRestockQty(makeItem({ quantity: 10, reorderPoint: 1 }))).toBeGreaterThanOrEqual(1);
  });
});
