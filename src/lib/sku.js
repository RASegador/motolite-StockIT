// Automatic SKU generation — every new product/item gets one the moment
// it's created, and it never changes again for the life of that item
// (specifically: transferring an item between a warehouse and a store, or
// between any two locations, NEVER regenerates its SKU — see
// src/transfers/transferActions.js, which always denormalizes the
// ORIGINAL item's `sku` onto the transfer record and the destination
// item it creates/updates, rather than deriving a new one).
//
// Deterministic from the item's own (already-unique) Firestore document
// ID, exactly like generateBarcode() in src/lib/barcode.js — a duplicate
// SKU is structurally impossible without a cross-shop uniqueness query
// (which today's Firestore rules don't grant non-Owner roles), and the
// item's ID is already guaranteed unique.
export function generateSku(itemId, { prefix = 'SKU' } = {}) {
  const source = String(itemId || '');
  let hash = 5381;
  for (let i = 0; i < source.length; i++) {
    hash = ((hash * 33) ^ source.charCodeAt(i)) >>> 0;
  }
  const code = hash.toString(36).toUpperCase().padStart(7, '0').slice(-7);
  return `${prefix}-${code}`;
}
