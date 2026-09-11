import { doc, runTransaction } from 'firebase/firestore';
import { cascadeDeductUnit, getItemUnits, getUnitCounts, totalBaseUnits } from '../lib/units';
import { newId } from '../lib/format';

// Damage reports always operate in the item's base unit (Piece-equivalent) —
// this is fundamentally "this many units are broken/returned", not a sale,
// so no unit-selection complexity is added here.
//
// `reservedForReview` on the item tracks quantity that's reported-but-not-
// yet-resolved: it's subtracted from sellable availability (`quantity -
// reservedForReview` is the true sellable count) without touching
// `quantity`/`unitStock` until an approval actually deducts it. Rejection
// simply releases the reservation with no stock change.

export async function reportDamage(db, { itemId, shopId, quantity, reason, reportedBy }) {
  const qty = Math.max(0, Number(quantity) || 0);
  if (qty <= 0) throw new Error('Quantity must be greater than zero');
  const reportId = newId('dr');
  const now = Date.now();

  await runTransaction(db, async (transaction) => {
    const itemRef = doc(db, 'items', itemId);
    const snap = await transaction.get(itemRef);
    if (!snap.exists()) throw new Error('Item no longer exists');
    const item = snap.data();

    const sellable = item.quantity - (item.reservedForReview || 0);
    if (qty > sellable) throw new Error(`Not enough sellable stock to reserve (only ${sellable} available)`);

    transaction.set(itemRef, { ...item, reservedForReview: (item.reservedForReview || 0) + qty });
    transaction.set(doc(db, 'damageReports', reportId), {
      id: reportId, itemId, shopId, quantity: qty, reason,
      reportedBy, reportedAt: now, status: 'pending', resolvedBy: null, resolvedAt: null,
    });
  });
  return reportId;
}

async function resolveDamage(db, reportId, resolvedBy, { approve }) {
  const now = Date.now();
  await runTransaction(db, async (transaction) => {
    // Fresh-read the damage report itself inside the transaction, and check
    // its status from that fresh read — never from a caller-supplied object.
    // approveDamage/rejectDamage are only ever called with a reportId string,
    // so there's no stale snapshot to accidentally trust here, but the
    // discipline is deliberate: two concurrent/duplicate approve (or
    // approve+reject) calls for the same reportId must not both pass the
    // "still pending" guard and both mutate stock/reservation (double-apply).
    const reportRef = doc(db, 'damageReports', reportId);
    const reportSnap = await transaction.get(reportRef);
    if (!reportSnap.exists()) throw new Error('Damage report no longer exists');
    const report = reportSnap.data();
    if (report.status !== 'pending') throw new Error('This report has already been resolved');

    const itemRef = doc(db, 'items', report.itemId);
    const itemSnap = await transaction.get(itemRef);
    if (!itemSnap.exists()) throw new Error('Item no longer exists');
    const item = itemSnap.data();

    const releasedReserved = Math.max(0, (item.reservedForReview || 0) - report.quantity);

    if (approve) {
      const baseUnitName = item.baseUnitName || 'Piece';
      const units = getItemUnits(item);
      const { newStock, shortfall } = cascadeDeductUnit(getUnitCounts(item), units, baseUnitName, report.quantity);
      if (shortfall > 0) throw new Error('Stock has changed since this report and can no longer cover it');
      const newQuantity = totalBaseUnits(newStock, units);
      transaction.set(itemRef, { ...item, quantity: newQuantity, unitStock: newStock, reservedForReview: releasedReserved });
      const mvId = newId('m');
      transaction.set(doc(db, 'movements', mvId), {
        id: mvId, itemId: report.itemId, type: 'out', qty: report.quantity, shopId: report.shopId,
        reason: `${report.reason} (damage report approved)`, timestamp: now,
      });
    } else {
      transaction.set(itemRef, { ...item, reservedForReview: releasedReserved });
    }

    transaction.set(reportRef, {
      ...report, status: approve ? 'approved' : 'rejected', resolvedBy, resolvedAt: now,
    });
  });
}

export function approveDamage(db, reportId, resolvedBy) {
  return resolveDamage(db, reportId, resolvedBy, { approve: true });
}

export function rejectDamage(db, reportId, resolvedBy) {
  return resolveDamage(db, reportId, resolvedBy, { approve: false });
}
