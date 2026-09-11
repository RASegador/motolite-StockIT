import { doc, setDoc, deleteDoc, runTransaction } from 'firebase/firestore';
import { getItemUnits, totalBaseUnits, cascadeDeductUnit, getUnitCounts } from '../lib/units';
import { computeSellingPrice } from '../lib/pricing';
import { newId } from '../lib/format';

export async function saveItem(db, draft, { shopId: activeShopId }) {
  const id = draft.id || newId('i');
  const baseUnitName = draft.baseUnitName || 'Piece';
  // Preserve an existing item's own shopId on edit (the loaded item is
  // spread into the form's draft, so draft.shopId is already correct for
  // an edit); fall back to the caller-supplied active shop only when
  // creating a brand-new item (draft.shopId is unset).
  const shopId = draft.shopId || activeShopId;

  const unitStock = { [baseUnitName]: Math.max(0, Number(draft.baseUnitStock) || 0) };
  (draft.units || []).forEach((u) => {
    unitStock[u.name] = Math.max(0, Number(u.stock) || 0);
  });

  const units = getItemUnits({ ...draft, baseUnitName, unitStock });
  const quantity = totalBaseUnits(unitStock, units);

  // Always recompute from the current markup inputs rather than preferring
  // a stored sellingPrice — the form (draft.unitCost/markupType/markupValue)
  // is the source of truth. A saved item always already has sellingPrice
  // set, so `draft.sellingPrice ?? computeSellingPrice(...)` used to always
  // short-circuit to the OLD price and silently ignore markup/cost edits.
  const sellingPrice = computeSellingPrice(draft.unitCost, draft.markupType || 'percent', draft.markupValue || 0);

  await setDoc(doc(db, 'items', id), {
    ...draft, id, shopId, quantity, unitStock, baseUnitName, sellingPrice,
    reservedForReview: draft.reservedForReview ?? 0,
    units: (draft.units || []).map(({ stock, ...u }) => u),
  });
  return id;
}

export async function deleteItem(db, itemId) {
  await deleteDoc(doc(db, 'items', itemId));
}

export async function recordMovement(db, itemId, type, qty, reason) {
  const mvId = newId('m');
  await runTransaction(db, async (transaction) => {
    const itemRef = doc(db, 'items', itemId);
    const snap = await transaction.get(itemRef);
    if (!snap.exists()) throw new Error('Item no longer exists');
    const item = snap.data();

    const delta = type === 'in' ? qty : -qty;
    const newQty = Math.max(0, item.quantity + delta);
    const baseUnitName = item.baseUnitName || 'Piece';
    const units = getItemUnits(item);
    const counts = getUnitCounts(item);

    let unitStock;
    if (type === 'in') {
      unitStock = { ...counts, [baseUnitName]: (counts[baseUnitName] || 0) + qty };
    } else {
      const result = cascadeDeductUnit(counts, units, baseUnitName, qty);
      unitStock = result.newStock;
    }

    transaction.set(itemRef, { ...item, quantity: newQty, unitStock });
    transaction.set(doc(db, 'movements', mvId), {
      id: mvId, itemId, type, qty, shopId: item.shopId,
      reason: reason || (type === 'in' ? 'Stock received' : 'Stock issued'),
      timestamp: Date.now(),
    });
  });
}

export async function createRestock(db, { itemId, quantity, unitName, unitCost, supplierId, notes }) {
  const qty = Math.max(0, Number(quantity) || 0);
  if (qty <= 0) throw new Error('Quantity must be greater than zero');
  const restockId = newId('rs');
  const now = Date.now();

  await runTransaction(db, async (transaction) => {
    const itemRef = doc(db, 'items', itemId);
    const snap = await transaction.get(itemRef);
    if (!snap.exists()) throw new Error('Item no longer exists');
    const item = snap.data();

    const units = getItemUnits(item);
    const unit = units.find((u) => u.name === unitName) || units[0];
    const counts = getUnitCounts(item);
    const newStock = { ...counts, [unit.name]: (counts[unit.name] || 0) + qty };
    const newQuantity = units.reduce((sum, u) => sum + (newStock[u.name] || 0) * u.factor, 0);
    const cost = Math.max(0, Number(unitCost) || 0) || (item.unitCost ?? 0);

    transaction.set(itemRef, { ...item, quantity: newQuantity, unitStock: newStock });
    transaction.set(doc(db, 'restocks', restockId), {
      id: restockId, itemId, itemSku: item.sku, shopId: item.shopId,
      quantity: qty, unitName: unit.name, unitCost: cost,
      supplierId: supplierId || null, notes: notes || '', receivedAt: now,
    });
  });
}
