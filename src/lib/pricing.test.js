import { describe, it, expect } from 'vitest';
import { computeSellingPrice, computeMarkupFromPrices } from './pricing';

describe('computeSellingPrice', () => {
  it('applies a percent markup on top of cost', () => {
    expect(computeSellingPrice(100, 'percent', 20)).toBe(120);
  });

  it('applies a fixed markup on top of cost', () => {
    expect(computeSellingPrice(100, 'fixed', 20)).toBe(120);
  });

  it('rounds to two decimals', () => {
    expect(computeSellingPrice(99.995, 'percent', 10)).toBeCloseTo(109.99, 2);
  });

  it('never returns a negative price for a negative cost input', () => {
    expect(computeSellingPrice(-50, 'percent', 20)).toBe(0);
  });
});

describe('computeMarkupFromPrices', () => {
  it('derives the peso amount and percent from cost and selling price', () => {
    expect(computeMarkupFromPrices(100, 120)).toEqual({ amount: 20, percent: 20 });
  });

  it('guards against divide-by-zero when cost is 0', () => {
    expect(computeMarkupFromPrices(0, 50)).toEqual({ amount: 50, percent: 0 });
  });
});
