import { describe, it, expect } from 'vitest';
import {
  getItemUnits, getUnitCounts, totalBaseUnits, cascadeDeductUnit,
  itemInventoryValue, reorderThresholdInBase,
} from './units';

const packItem = {
  baseUnitName: 'Piece', unitCost: 100, sellingPrice: 150,
  units: [{ name: 'Pack', factor: 10, cost: 900, price: 1400 }],
  unitStock: { Piece: 5, Pack: 2 },
  reorderPoint: 3, reorderUnit: 'Pack',
};

describe('getItemUnits', () => {
  it('returns the base unit first, then extra units', () => {
    const units = getItemUnits(packItem);
    expect(units[0]).toMatchObject({ name: 'Piece', factor: 1, isBase: true });
    expect(units[1]).toMatchObject({ name: 'Pack', factor: 10, isBase: false });
  });
});

describe('getUnitCounts', () => {
  it('reads the discrete per-unit stock when unitStock is set', () => {
    expect(getUnitCounts(packItem)).toEqual({ Piece: 5, Pack: 2 });
  });

  it('falls back to putting all quantity on the base unit when unitStock is missing', () => {
    expect(getUnitCounts({ baseUnitName: 'Piece', quantity: 7 })).toEqual({ Piece: 7 });
  });
});

describe('totalBaseUnits', () => {
  it('sums each unit count times its factor', () => {
    const units = getItemUnits(packItem);
    expect(totalBaseUnits({ Piece: 5, Pack: 2 }, units)).toBe(25); // 5 + 2*10
  });
});

describe('cascadeDeductUnit', () => {
  it('deducts directly when enough of the sold unit is on hand', () => {
    const units = getItemUnits(packItem);
    const { newStock, shortfall } = cascadeDeductUnit({ Piece: 5, Pack: 2 }, units, 'Piece', 3);
    expect(newStock).toEqual({ Piece: 2, Pack: 2 });
    expect(shortfall).toBe(0);
  });

  it('breaks open a larger unit when the sold unit runs short', () => {
    const units = getItemUnits(packItem);
    const { newStock, shortfall } = cascadeDeductUnit({ Piece: 1, Pack: 2 }, units, 'Piece', 5);
    // 1 Piece on hand, need 5: break open 1 Pack -> +10 Pieces, take 5, leaving 6 Pieces, 1 Pack
    expect(newStock).toEqual({ Piece: 6, Pack: 1 });
    expect(shortfall).toBe(0);
  });

  it('reports a shortfall instead of going negative when truly out of stock', () => {
    const units = getItemUnits(packItem);
    const { newStock, shortfall } = cascadeDeductUnit({ Piece: 0, Pack: 0 }, units, 'Piece', 3);
    expect(newStock).toEqual({ Piece: 0, Pack: 0 });
    expect(shortfall).toBe(3);
  });
});

describe('itemInventoryValue', () => {
  it('values each unit count at that unit\'s own cost, not just base cost', () => {
    // 5 loose Pieces @ 100 + 2 Packs @ 900 = 500 + 1800 = 2300
    expect(itemInventoryValue(packItem)).toBe(2300);
  });
});

describe('reorderThresholdInBase', () => {
  it('converts the reorder point into base-unit terms using its unit\'s factor', () => {
    // reorderPoint 3, reorderUnit 'Pack' (factor 10) -> 30 base units
    expect(reorderThresholdInBase(packItem)).toBe(30);
  });
});
