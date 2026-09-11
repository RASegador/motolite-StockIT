import { describe, it, expect } from 'vitest';
import { newId, currency } from './format';

describe('newId', () => {
  it('prefixes the id with the given prefix', () => {
    expect(newId('i')).toMatch(/^i[a-z0-9]+$/);
  });

  it('generates different ids on each call', () => {
    expect(newId('i')).not.toBe(newId('i'));
  });
});

describe('currency', () => {
  it('formats a whole number with two decimals and a peso sign', () => {
    expect(currency(1500)).toBe('₱1,500.00');
  });

  it('rounds to two decimals', () => {
    expect(currency(19.999)).toBe('₱20.00');
  });

  it('formats zero', () => {
    expect(currency(0)).toBe('₱0.00');
  });
});
