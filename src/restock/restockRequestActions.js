import { doc, getDoc, setDoc } from 'firebase/firestore';
import { newId } from '../lib/format';
import { initiateTransfer } from '../transfers/transferActions';

// A store (or another warehouse) asks the warehouse to send more stock of
// a specific item. `itemId` is the REQUESTING location's own item doc —
// its `sku`/`name` are denormalized here (same pattern transfers already
// use for itemSku/itemName) purely so the request is self-describing in
// lists/the Activity Log without a join. Approving the request is a
// separate step (approveRestockRequest) — creating a request never moves
// any stock by itself.
export async function createRestockRequest(db, { item, quantity, requestingShopId, requestedBy, notes }) {
  const qty = Math.max(0, Number(quantity) || 0);
  if (qty <= 0) throw new Error('Quantity must be greater than zero');
  const id = newId('rr');
  await setDoc(doc(db, 'restockRequests', id), {
    id, itemId: item.id, itemSku: item.sku || '', itemName: item.name || '',
    requestedQty: qty, requestingShopId, requestedBy: requestedBy || '',
    status: 'pending', createdAt: Date.now(),
    reviewedBy: null, reviewedAt: null, transferId: null, fulfilledAt: null,
    notes: notes || '',
  });
  return id;
}

// Approving immediately kicks off the Transfer Out leg from the chosen
// source location's matching item (found by the reviewer — see
// RestockView.jsx — since the source item is a DIFFERENT Firestore doc
// than the requesting location's item, linked only by sharing the same
// SKU, same as every other cross-location item relationship in this app).
// The transfer is tagged `linkedRequestId` so confirmReceipt() can flip
// this request to 'fulfilled' automatically once the destination confirms.
export async function approveRestockRequest(db, requestId, { sourceItemId, sourceShopId, quantity, approvedBy }) {
  const snap = await getDoc(doc(db, 'restockRequests', requestId));
  if (!snap.exists()) throw new Error('Restock request no longer exists');
  const request = snap.data();
  if (request.status !== 'pending') throw new Error('This request has already been reviewed');

  const transferId = await initiateTransfer(db, {
    itemId: sourceItemId, fromShopId: sourceShopId, toShopId: request.requestingShopId,
    quantity: quantity ?? request.requestedQty, initiatedBy: approvedBy, linkedRequestId: requestId,
  });

  await setDoc(doc(db, 'restockRequests', requestId), {
    status: 'approved', reviewedBy: approvedBy || '', reviewedAt: Date.now(), transferId,
  }, { merge: true });
  return transferId;
}

export async function rejectRestockRequest(db, requestId, { reviewedBy, notes } = {}) {
  const snap = await getDoc(doc(db, 'restockRequests', requestId));
  if (!snap.exists()) throw new Error('Restock request no longer exists');
  if (snap.data().status !== 'pending') throw new Error('This request has already been reviewed');
  await setDoc(doc(db, 'restockRequests', requestId), {
    status: 'rejected', reviewedBy: reviewedBy || '', reviewedAt: Date.now(),
    notes: notes || snap.data().notes || '',
  }, { merge: true });
}

// The requesting location can withdraw its own request while it's still
// pending (Owner can cancel anytime) — see the firestore.rules branch that
// only allows this transition (`pending` -> `cancelled`) for a Manager.
export async function cancelRestockRequest(db, requestId) {
  const snap = await getDoc(doc(db, 'restockRequests', requestId));
  if (!snap.exists()) throw new Error('Restock request no longer exists');
  if (snap.data().status !== 'pending') throw new Error('Only a pending request can be cancelled');
  await setDoc(doc(db, 'restockRequests', requestId), { status: 'cancelled' }, { merge: true });
}
