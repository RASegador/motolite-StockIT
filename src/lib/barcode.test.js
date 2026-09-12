import { describe, it, expect } from 'vitest';
import { generateBarcode } from './barcode';

describe('generateBarcode', () => {
  it('is deterministic for the same id', () => {
    expect(generateBarcode('item-abc123')).toBe(generateBarcode('item-abc123'));
  });

  it('differs across different ids (no collisions for typical inputs)', () => {
    const ids = Array.from({ length: 500 }, (_, i) => `i${i}${Math.random().toString(36).slice(2)}`);
    const codes = new Set(ids.map((id) => generateBarcode(id)));
    expect(codes.size).toBe(ids.length);
  });

  it('returns digits only, at the requested length', () => {
    const code = generateBarcode('i123456');
    expect(code).toMatch(/^\d{12}$/);
    expect(generateBarcode('i123456', { length: 8 })).toMatch(/^\d{8}$/);
  });

  it('handles an empty/undefined id without throwing', () => {
    expect(() => generateBarcode()).not.toThrow();
    expect(generateBarcode('')).toMatch(/^\d{12}$/);
  });
});
