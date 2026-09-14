import { describe, it, expect } from 'vitest';
import { validateUnits } from './itemFormValidation';

describe('validateUnits', () => {
  it('accepts no extra units', () => {
    expect(validateUnits('Piece', [])).toBeNull();
  });

  it('accepts a well-formed extra unit', () => {
    expect(validateUnits('Piece', [{ name: 'Pack', factor: 6, cost: 100, price: 150, stock: 3 }])).toBeNull();
  });

  it('rejects a blank unit name', () => {
    expect(validateUnits('Piece', [{ name: '  ', factor: 6, cost: 0, price: 0, stock: 0 }]))
      .toMatch(/unit name is required/);
  });

  it('rejects a unit name that duplicates another extra unit (case-insensitive)', () => {
    const units = [
      { name: 'Pack', factor: 6, cost: 0, price: 0, stock: 0 },
      { name: 'pack', factor: 12, cost: 0, price: 0, stock: 0 },
    ];
    expect(validateUnits('Piece', units)).toMatch(/duplicate/);
  });

  it('rejects a unit name that duplicates the base unit name', () => {
    expect(validateUnits('Piece', [{ name: 'piece', factor: 1, cost: 0, price: 0, stock: 0 }]))
      .toMatch(/duplicate/);
  });

  it('rejects a zero factor', () => {
    expect(validateUnits('Piece', [{ name: 'Pack', factor: 0, cost: 0, price: 0, stock: 0 }]))
      .toMatch(/factor must be/);
  });

  it('rejects a negative factor', () => {
    expect(validateUnits('Piece', [{ name: 'Pack', factor: -6, cost: 0, price: 0, stock: 0 }]))
      .toMatch(/factor must be/);
  });

  it('rejects a non-numeric factor', () => {
    expect(validateUnits('Piece', [{ name: 'Pack', factor: 'abc', cost: 0, price: 0, stock: 0 }]))
      .toMatch(/factor must be/);
  });

  it('rejects negative cost, price, or stock', () => {
    expect(validateUnits('Piece', [{ name: 'Pack', factor: 6, cost: -1, price: 0, stock: 0 }]))
      .toMatch(/cost must be/);
    expect(validateUnits('Piece', [{ name: 'Pack', factor: 6, cost: 0, price: -1, stock: 0 }]))
      .toMatch(/price must be/);
    expect(validateUnits('Piece', [{ name: 'Pack', factor: 6, cost: 0, price: 0, stock: -1 }]))
      .toMatch(/stock must be/);
  });

  it('flags the first offending row when there are several', () => {
    const units = [
      { name: 'Pack', factor: 6, cost: 0, price: 0, stock: 0 },
      { name: '', factor: 6, cost: 0, price: 0, stock: 0 },
    ];
    expect(validateUnits('Piece', units)).toMatch(/Extra unit #2/);
  });
});
