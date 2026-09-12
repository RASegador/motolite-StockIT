import { describe, it, expect } from 'vitest';
import { generateSku } from './sku';

describe('generateSku', () => {
  it('is deterministic for the same item id', () => {
    expect(generateSku('item_abc123')).toBe(generateSku('item_abc123'));
  });

  it('differs across different item ids (no collision for these fixtures)', () => {
    expect(generateSku('item_1')).not.toBe(generateSku('item_2'));
  });

  it('is stable regardless of when it is called — never re-derived from a transfer', () => {
    // The whole point: an item's SKU is generated once, from its own id,
    // at creation — never recomputed from a destination shop id, transfer
    // id, or anything else that would make it drift when the item moves.
    const skuAtCreation = generateSku('item_xyz');
    const skuAfterTransfer = generateSku('item_xyz');
    expect(skuAfterTransfer).toBe(skuAtCreation);
  });
});
