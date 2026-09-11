import { doc, runTransaction } from 'firebase/firestore';
import { cascadeDeductUnit, getItemUnits, getUnitCounts, totalBaseUnits } from '../lib/units';
import { newId } from '../lib/format';

// Branch-to-branch stock transfers are a two-step flow:
//   1. initiateTransfer  — source shop deducts stock immediately and the
//      transfer is recorded `in_transit`.
//   2. confirmReceipt    — destination shop confirms what actually arrived.
//      A matching quantity credits the destination shop's stock and marks
//      the transfer `received`; a mismatch marks it `disputed` instead of
//      silently trusting either side's number.
//
// The Firestore Web SDK's `transaction.get()` only accepts document
// references, not queries, so "does the destination shop already stock
// this item" can't be resolved with a query *inside* the transaction. This
// is avoided entirely with a deterministic destination item ID —
// `xfer_<toShopId>_<sourceItemId>` — so the same fixed doc ref is always
// read/written for a given (item, destination shop) pair, with no
// pre-query and no race window. Both legs operate in the item's base
// unit, same simplification as damage reports (Task 13).

function destItemId(toShopId, sourceItemId) {
  return `xfer_${toShopId}_${sourceItemId}`;
}

export async function initiateTransfer(db, { itemId, fromShopId, toShopId, quantity, initiatedBy }) {
  const qty = Math.max(0, Number(quantity) || 0);
  if (qty <= 0) throw new Error('Quantity must be greater than zero');
  const transferId = newId('xf');
  const now = Date.now();

  await runTransaction(db, async (transaction) => {
    const itemRef = doc(db, 'items', itemId);
    const snap = await transaction.get(itemRef);
    if (!snap.exists()) throw new Error('Item no longer exists');
    const item = snap.data();

    const baseUnitName = item.baseUnitName || 'Piece';
    const units = getItemUnits(item);
    const { newStock, shortfall } = cascadeDeductUnit(getUnitCounts(item), units, baseUnitName, qty);
    if (shortfall > 0) throw new Error(`Not enough stock to transfer (short ${shortfall})`);
    const newQuantity = totalBaseUnits(newStock, units);

    transaction.set(itemRef, { ...item, quantity: newQuantity, unitStock: newStock });
    transaction.set(doc(db, 'transfers', transferId), {
      id: transferId, itemId, itemSku: item.sku, itemName: item.name,
      fromShopId, toShopId, quantity: qty, status: 'in_transit',
      initiatedBy, initiatedAt: now, confirmedBy: null, confirmedAt: null, confirmedQuantity: null,
    });
    const outMvId = newId('m');
    transaction.set(doc(db, 'movements', outMvId), {
      id: outMvId, itemId, type: 'out', qty, shopId: fromShopId,
      reason: `Transfer to shop ${toShopId}`, timestamp: now,
    });
  });
  return transferId;
}

export async function confirmReceipt(db, transferId, confirmedQuantity, confirmedBy) {
  const qty = Math.max(0, Number(confirmedQuantity) || 0);
  const now = Date.now();

  await runTransaction(db, async (transaction) => {
    // Public API takes only a transferId (never a caller-supplied transfer
    // object), and the transfer doc is fresh-read here, inside the
    // transaction, with its `status` checked from that fresh read before
    // anything is written. This is the same double-apply race class fixed
    // in cancelSale (Task 11): without it, two concurrent confirmReceipt
    // calls for the same transfer could both pass the "still in_transit"
    // guard and both credit the destination shop, double-crediting stock
    // that was only deducted once at the source.
    const transferRef = doc(db, 'transfers', transferId);
    const transferSnap = await transaction.get(transferRef);
    if (!transferSnap.exists()) throw new Error('Transfer no longer exists');
    const transfer = transferSnap.data();
    if (transfer.status !== 'in_transit') throw new Error('This transfer has already been resolved');

    if (qty !== transfer.quantity) {
      transaction.set(transferRef, {
        ...transfer, status: 'disputed', confirmedBy, confirmedAt: now, confirmedQuantity: qty,
      });
      return;
    }

    const destRef = doc(db, 'items', destItemId(transfer.toShopId, transfer.itemId));
    const destSnap = await transaction.get(destRef);

    if (destSnap.exists()) {
      const dest = destSnap.data();
      const units = getItemUnits(dest);
      const baseUnitName = dest.baseUnitName || 'Piece';
      const counts = getUnitCounts(dest);
      const newStock = { ...counts, [baseUnitName]: (counts[baseUnitName] || 0) + qty };
      const newQuantity = totalBaseUnits(newStock, units);
      transaction.set(destRef, { ...dest, quantity: newQuantity, unitStock: newStock });
    } else {
      transaction.set(destRef, {
        id: destItemId(transfer.toShopId, transfer.itemId), sku: transfer.itemSku, name: transfer.itemName,
        shopId: transfer.toShopId, sourceItemId: transfer.itemId, baseUnitName: 'Piece',
        quantity: qty, unitStock: { Piece: qty }, units: [], reservedForReview: 0,
      });
    }

    const inMvId = newId('m');
    transaction.set(doc(db, 'movements', inMvId), {
      id: inMvId, itemId: destItemId(transfer.toShopId, transfer.itemId), type: 'in', qty, shopId: transfer.toShopId,
      reason: `Transfer received from shop ${transfer.fromShopId}`, timestamp: now,
    });
    transaction.set(transferRef, {
      ...transfer, status: 'received', confirmedBy, confirmedAt: now, confirmedQuantity: qty,
    });
  });
}
