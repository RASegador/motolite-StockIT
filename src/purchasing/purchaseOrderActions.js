import { doc, getDoc, setDoc, runTransaction } from 'firebase/firestore';
import { newId } from '../lib/format';
import { getItemUnits, getUnitCounts, totalBaseUnits } from '../lib/units';

function computeStatus(lines) {
  const allReceived = lines.every((l) => l.receivedQty >= l.orderedQty);
  const anyReceived = lines.some((l) => l.receivedQty > 0);
  if (allReceived) return 'received';
  if (anyReceived) return 'partial';
  return 'open';
}

// A PO always targets items that already exist at the destination shop
// (unlike a Transfer, which can create a brand-new item doc there) —
// ordering more of something new starts with adding the item first, same
// as any other stock.
export async function createPurchaseOrder(db, { shopId, supplierId, supplierName, lines, createdBy, notes }) {
  const cleanLines = (lines || [])
    .map((l) => ({
      itemId: l.itemId, sku: l.sku || '', name: l.name || '',
      orderedQty: Math.max(0, Number(l.orderedQty) || 0),
      receivedQty: 0, unitCost: Number(l.unitCost) || 0,
    }))
    .filter((l) => l.orderedQty > 0);
  if (cleanLines.length === 0) throw new Error('Add at least one line with a quantity greater than zero');

  const id = newId('po');
  await setDoc(doc(db, 'purchaseOrders', id), {
    id, shopId, supplierId: supplierId || null, supplierName: supplierName || '',
    lines: cleanLines, status: 'open', notes: notes || '',
    createdBy: createdBy || '', createdAt: Date.now(),
    receivedBy: null, receivedAt: null,
  });
  return id;
}

// Books a partial or full receipt against one line — `receivedQtyNow` is
// the quantity arriving in THIS delivery, added on top of whatever line
//.receivedQty already was (a PO commonly arrives in more than one
// shipment). Credits the item's base-unit stock and updates its cost to
// what was actually paid this time, same "trust the latest invoice" logic
// a manual cost edit would apply.
export async function receivePurchaseOrderLine(db, po, itemId, receivedQtyNow, { receivedBy } = {}) {
  const qty = Number(receivedQtyNow) || 0;
  if (qty <= 0) throw new Error('Enter a quantity greater than zero to receive');
  const now = Date.now();

  await runTransaction(db, async (transaction) => {
    const poRef = doc(db, 'purchaseOrders', po.id);
    const poSnap = await transaction.get(poRef);
    if (!poSnap.exists()) throw new Error('Purchase order no longer exists');
    const poData = poSnap.data();
    if (poData.status === 'cancelled') throw new Error('This purchase order was cancelled');

    const line = poData.lines.find((l) => l.itemId === itemId);
    if (!line) throw new Error('That item is not on this purchase order');
    const remaining = line.orderedQty - line.receivedQty;
    if (qty > remaining) throw new Error(`Cannot receive more than the remaining ${remaining} on order`);

    const itemRef = doc(db, 'items', itemId);
    const itemSnap = await transaction.get(itemRef);
    if (!itemSnap.exists()) throw new Error('This item no longer exists');
    const item = itemSnap.data();
    const units = getItemUnits(item);
    const baseUnitName = item.baseUnitName || 'Piece';
    const currentStock = getUnitCounts(item);
    const newStock = { ...currentStock, [baseUnitName]: (currentStock[baseUnitName] || 0) + qty };
    const newQuantity = totalBaseUnits(newStock, units);
    transaction.set(itemRef, { ...item, quantity: newQuantity, unitStock: newStock, unitCost: line.unitCost || item.unitCost });

    const mvId = newId('m');
    transaction.set(doc(db, 'movements', mvId), {
      id: mvId, itemId, type: 'in', qty, shopId: poData.shopId,
      reason: `PO receipt (${poData.supplierName || 'supplier'})`, timestamp: now,
      activityType: 'po_received', actorId: receivedBy || null,
      previousQuantity: item.quantity, newQuantity,
    });

    const lines = poData.lines.map((l) => (l.itemId === itemId ? { ...l, receivedQty: l.receivedQty + qty } : l));
    transaction.set(poRef, {
      lines, status: computeStatus(lines), receivedBy: receivedBy || poData.receivedBy || '', receivedAt: now,
    }, { merge: true });
  });
}

export async function cancelPurchaseOrder(db, poId) {
  const snap = await getDoc(doc(db, 'purchaseOrders', poId));
  if (!snap.exists()) throw new Error('Purchase order no longer exists');
  if (snap.data().status === 'received') throw new Error('A fully received purchase order cannot be cancelled');
  await setDoc(doc(db, 'purchaseOrders', poId), { status: 'cancelled' }, { merge: true });
}
