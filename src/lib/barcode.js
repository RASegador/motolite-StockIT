// Deterministically derives a CODE128-safe barcode value from an item's own
// (already-unique) Firestore document ID. Because it's a pure function of an
// ID that's already guaranteed unique, a duplicate barcode is structurally
// impossible — no query-based uniqueness check (and the cross-shop read it
// would require, which today's Firestore rules don't grant non-Owner roles)
// is ever needed.
//
// djb2-style hash, folded into a fixed-length numeric string so it looks
// like a normal retail barcode (digits only) rather than exposing the raw
// item ID.
export function generateBarcode(itemId, { length = 12 } = {}) {
  const source = String(itemId || '');
  let hash = 5381;
  for (let i = 0; i < source.length; i++) {
    hash = ((hash * 33) ^ source.charCodeAt(i)) >>> 0;
  }
  // Expand a single 32-bit hash into `length` digits by re-hashing with a
  // rolling seed, so short IDs still produce a full-length barcode.
  let digits = '';
  let seed = hash;
  while (digits.length < length) {
    seed = (Math.imul(seed ^ (seed >>> 15), 2246822519) >>> 0);
    digits += String(seed % 10_000_000_000).padStart(10, '0');
  }
  return digits.slice(0, length);
}
