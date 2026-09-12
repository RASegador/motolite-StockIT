import { doc, getDoc, setDoc, deleteDoc, runTransaction } from 'firebase/firestore';
import { getItemUnits, totalBaseUnits, cascadeDeductUnit, getUnitCounts } from '../lib/units';
import { computeSellingPrice } from '../lib/pricing';
import { newId } from '../lib/format';
import { buildPublicProduct } from '../lib/receipts';
import { generateSku } from '../lib/sku';

export async function saveItem(db, draft, { shopId: activeShopId, actorId } = {}) {
  const id = draft.id || newId('i');
  const baseUnitName = draft.baseUnitName || 'Piece';
  // Auto-generate a SKU on create if the caller/form didn't already supply
  // one (ItemForm auto-fills this itself, but this is a safety net for any
  // other creation path — e.g. a script or future bulk-import — so a SKU
  // is never left blank). Once set, this is never touched again on edit,
  // and NEVER regenerated just because the item's shopId changes (a
  // transfer never calls saveItem at all — see transferActions.js) — the
  // one thing the spec explicitly requires.
  const sku = draft.sku || generateSku(id);
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

  const savedItem = {
    ...draft, id, shopId, quantity, unitStock, baseUnitName, sellingPrice, sku,
    reservedForReview: draft.reservedForReview ?? 0,
    units: (draft.units || []).map(({ stock, ...u }) => u),
  };
  const isNewItem = !(await getDoc(doc(db, 'items', id))).exists();
  await setDoc(doc(db, 'items', id), savedItem);
  // Keep the public, customer-safe mirror (read by the unauthenticated
  // product QR page) in sync with every create/edit — see buildPublicProduct
  // for exactly which fields are considered safe to expose.
  await setDoc(doc(db, 'productPublic', id), buildPublicProduct(savedItem));

  // Feed the Owner Activity Log (src/reports/activityFeed.js) — only "Item
  // Added" is logged here (not every edit), matching the exact action list
  // the Owner Activity Log spec calls out.
  if (isNewItem) {
    const mvId = newId('m');
    await setDoc(doc(db, 'movements', mvId), {
      id: mvId, itemId: id, type: 'in', qty: quantity, shopId,
      reason: 'Item added', timestamp: Date.now(),
      activityType: 'item_added', actorId: actorId || null,
      previousQuantity: 0, newQuantity: quantity,
    });
  }
  return id;
}

export async function deleteItem(db, itemId, { actorId } = {}) {
  const snap = await getDoc(doc(db, 'items', itemId));
  const item = snap.exists() ? snap.data() : null;
  await deleteDoc(doc(db, 'items', itemId));
  await deleteDoc(doc(db, 'productPublic', itemId));

  if (item) {
    const mvId = newId('m');
    await setDoc(doc(db, 'movements', mvId), {
      id: mvId, itemId, type: 'out', qty: item.quantity || 0, shopId: item.shopId,
      reason: 'Item removed', timestamp: Date.now(),
      activityType: 'item_removed', actorId: actorId || null,
      previousQuantity: item.quantity || 0, newQuantity: 0,
    });
  }
}

export async function recordMovement(db, itemId, type, qty, reason, { actorId } = {}) {
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
      activityType: 'inventory_adjusted', actorId: actorId || null,
      previousQuantity: item.quantity, newQuantity: newQty,
    });
  });
}

export async function createRestock(db, { itemId, quantity, unitName, unitCost, supplierId, notes, actorId }) {
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
    // Mirrored into `movements` too (not just `restocks`) so the Owner
    // Activity Log has one consistent "Inventory Adjusted" source instead
    // of needing to merge a fifth collection.
    const mvId = newId('m');
    transaction.set(doc(db, 'movements', mvId), {
      id: mvId, itemId, type: 'in', qty, shopId: item.shopId,
      reason: notes ? `Restock: ${notes}` : 'Restock', timestamp: now,
      activityType: 'inventory_adjusted', actorId: actorId || null,
      previousQuantity: item.quantity, newQuantity: newQuantity,
    });
  });
}
