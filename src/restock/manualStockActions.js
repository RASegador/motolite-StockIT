import { doc, runTransaction } from 'firebase/firestore';
import { getItemUnits, getUnitCounts, totalBaseUnits } from '../lib/units';
import { newId } from '../lib/format';
import { destItemId } from '../transfers/transferActions';

// Admin's direct override of the Restock/Transfer request-and-approve
// workflow — "as an Admin, I want to add stock records manually to
// individual shops" — for cases like an initial stock load for a new
// store, or a manual correction, where going through Create Request ->
// Approve & Ship -> Confirm Receipt for every line is unnecessary
// friction. This immediately credits the target shop's stock; there is no
// pending/approval step, which is why it's gated on `editInventory` (Admin
// only — see src/lib/permissions.js) rather than `createRestockRequest`.
//
// `sourceItem` is always a WAREHOUSE item (picked from the same master
// list WarehouseRestockModal browses) — this reuses transferActions.js's
// destItemId() so the shop's item doc for this SKU is the exact same
// document a Transfer would create/credit, never a second, duplicate item
// for the same SKU at the same shop (see destItemId's own comment).
export async function addStockDirectly(db, { shopId, sourceItem, quantity, notes, actorId }) {
  const qty = Math.max(0, Number(quantity) || 0);
  if (qty <= 0) throw new Error('Quantity must be greater than zero');
  if (!shopId) throw new Error('Select a shop');
  if (!sourceItem) throw new Error('Select an item');

  const now = Date.now();
  // Adding stock to the warehouse item's OWN shop just adds to that same
  // doc directly — destItemId() is only for crediting a DIFFERENT
  // (destination) shop's copy of this SKU.
  const targetId = shopId === sourceItem.shopId ? sourceItem.id : destItemId(shopId, sourceItem.id);
  const reason = notes ? `Manual stock entry (Admin): ${notes}` : 'Manual stock entry (Admin)';

  await runTransaction(db, async (transaction) => {
    const targetRef = doc(db, 'items', targetId);
    const snap = await transaction.get(targetRef);
    let previousQuantity = 0;
    let newQuantity;

    if (snap.exists()) {
      const item = snap.data();
      previousQuantity = item.quantity || 0;
      const units = getItemUnits(item);
      const baseUnitName = item.baseUnitName || 'Piece';
      const counts = getUnitCounts(item);
      const newStock = { ...counts, [baseUnitName]: (counts[baseUnitName] || 0) + qty };
      newQuantity = totalBaseUnits(newStock, units);
      transaction.set(targetRef, { ...item, quantity: newQuantity, unitStock: newStock });
    } else {
      newQuantity = qty;
      transaction.set(targetRef, {
        id: targetId, sku: sourceItem.sku, name: sourceItem.name, category: sourceItem.category || '',
        shopId, sourceItemId: sourceItem.id, baseUnitName: 'Piece',
        quantity: qty, unitStock: { Piece: qty }, units: [], reservedForReview: 0,
        unitCost: sourceItem.unitCost ?? 0, sellingPrice: sourceItem.sellingPrice ?? 0,
        supplierIds: sourceItem.supplierIds || [],
      });
    }

    const mvId = newId('m');
    transaction.set(doc(db, 'movements', mvId), {
      id: mvId, itemId: targetId, type: 'in', qty, shopId,
      reason, timestamp: now,
      activityType: 'inventory_adjusted', actorId: actorId || null,
      previousQuantity, newQuantity,
    });
  });
}
