import { describe, it, expect } from 'vitest';
import { localDateKey, salesForShopAndDate, computeExpectedCashByMethod, computeVariance } from './cashReconciliation';

function ts(y, m, d, h = 12) {
  return new Date(y, m - 1, d, h).getTime();
}

describe('localDateKey', () => {
  it('formats as YYYY-MM-DD', () => {
    expect(localDateKey(ts(2026, 9, 5))).toBe('2026-09-05');
  });
});

describe('salesForShopAndDate', () => {
  const sales = [
    { shopId: 'a', timestamp: ts(2026, 9, 5), cancelled: false },
    { shopId: 'a', timestamp: ts(2026, 9, 6), cancelled: false },
    { shopId: 'b', timestamp: ts(2026, 9, 5), cancelled: false },
    { shopId: 'a', timestamp: ts(2026, 9, 5), cancelled: true },
  ];

  it('filters to the given shop, date, and excludes cancelled sales', () => {
    const result = salesForShopAndDate(sales, 'a', '2026-09-05');
    expect(result).toHaveLength(1);
  });
});

describe('computeExpectedCashByMethod', () => {
  it('sums net revenue per payment method for one shop/day', () => {
    const sales = [
      { shopId: 'a', timestamp: ts(2026, 9, 5), cancelled: false, paymentMethod: 'Cash', total: 100, refundedAmount: 0 },
      { shopId: 'a', timestamp: ts(2026, 9, 5), cancelled: false, paymentMethod: 'Cash', total: 50, refundedAmount: 10 },
      { shopId: 'a', timestamp: ts(2026, 9, 5), cancelled: false, paymentMethod: 'GCash', total: 200, refundedAmount: 0 },
    ];
    const result = computeExpectedCashByMethod(sales, 'a', '2026-09-05');
    expect(result.breakdown.Cash).toBe(140);
    expect(result.breakdown.GCash).toBe(200);
    expect(result.total).toBe(340);
    expect(result.saleCount).toBe(3);
  });

  it('buckets an unrecognized payment method under Other', () => {
    const sales = [{ shopId: 'a', timestamp: ts(2026, 9, 5), cancelled: false, paymentMethod: 'Crypto', total: 50, refundedAmount: 0 }];
    const result = computeExpectedCashByMethod(sales, 'a', '2026-09-05');
    expect(result.breakdown.Other).toBe(50);
  });
});

describe('computeVariance', () => {
  it('computes per-method and total variance', () => {
    const expected = { Cash: 100, GCash: 50 };
    const actual = { Cash: 95, GCash: 55 };
    const { perMethod, totalVariance } = computeVariance(expected, actual);
    expect(perMethod.Cash.variance).toBe(-5);
    expect(perMethod.GCash.variance).toBe(5);
    expect(totalVariance).toBe(0);
  });

  it('treats a missing actual count as zero', () => {
    const { perMethod } = computeVariance({ Cash: 100 }, {});
    expect(perMethod.Cash.actual).toBe(0);
    expect(perMethod.Cash.variance).toBe(-100);
  });
});
