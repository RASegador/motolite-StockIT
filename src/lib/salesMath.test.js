import { describe, it, expect } from 'vitest';
import { netRevenue, netProfit } from './salesMath';

describe('netRevenue', () => {
  it('returns total unchanged when nothing has been refunded', () => {
    expect(netRevenue({ total: 1000, refundedAmount: 0 })).toBe(1000);
    expect(netRevenue({ total: 1000 })).toBe(1000);
  });
  it('subtracts refundedAmount', () => {
    expect(netRevenue({ total: 1000, refundedAmount: 300 })).toBe(700);
  });
  it('handles a missing/null sale gracefully', () => {
    expect(netRevenue(null)).toBe(0);
    expect(netRevenue(undefined)).toBe(0);
  });
});

describe('netProfit', () => {
  it('returns totalProfit unchanged when nothing has been refunded', () => {
    expect(netProfit({ totalProfit: 200 })).toBe(200);
  });
  it('subtracts refundedProfit', () => {
    expect(netProfit({ totalProfit: 200, refundedProfit: 50 })).toBe(150);
  });
  it('handles a missing/null sale gracefully', () => {
    expect(netProfit(null)).toBe(0);
  });
});
