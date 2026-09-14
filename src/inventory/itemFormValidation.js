// Extracted out of ItemForm.jsx so it's a plain, testable function rather
// than logic buried inside a component's event handler — see ItemForm.jsx's
// call site for why this validation exists (extra units feed straight into
// units.js's conversion math with no prior validation otherwise).
//
// `baseUnitName` and each row of `units` come straight from ItemForm's
// `draft` state — string inputs, so numeric fields may arrive as strings,
// `''`, or `undefined` for a brand-new blank row.
export function validateUnits(baseUnitName, units) {
  const base = (baseUnitName || 'Piece').trim().toLowerCase();
  const seen = new Set([base]);
  for (const [idx, u] of (units || []).entries()) {
    const label = `Extra unit #${idx + 1}`;
    const name = (u.name || '').trim();
    if (!name) return `${label}: a unit name is required.`;
    const key = name.toLowerCase();
    if (seen.has(key)) return `${label}: "${name}" is a duplicate of another unit on this item (including the base unit).`;
    seen.add(key);
    const factor = Number(u.factor);
    if (!(factor > 0)) return `${label} ("${name}"): factor must be a number greater than 0.`;
    for (const field of ['cost', 'price', 'stock']) {
      const n = Number(u[field]);
      if (!Number.isFinite(n) || n < 0) return `${label} ("${name}"): ${field} must be 0 or greater.`;
    }
  }
  return null;
}
