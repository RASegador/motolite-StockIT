import { doc, getDoc, setDoc, runTransaction } from 'firebase/firestore';
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

// `shopId` here is the SOURCE store — the location that actually reported
// the item — and it is never touched again by anything below, including
// sendReportToWarehouse (which only ever sets `destinationShopId`). That's
// deliberate: the spec requires the source store to stay traceable no
// matter where the item physically ends up later. `itemSku`/`itemName` are
// denormalized onto the report (same pattern as transfers/restockRequests)
// so the report is still self-describing even if the source item is later
// edited, moved, or deleted. `relatedReceipt` is an optional free-text
// link to a sale/receipt (e.g. for a customer return), left blank when
// there's no related transaction.
export async function reportDamage(db, { itemId, shopId, quantity, reason, reportedBy, relatedReceipt }) {
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
      id: reportId, itemId, itemSku: item.sku || '', itemName: item.name || '',
      shopId, quantity: qty, reason,
      reportedBy, reportedAt: now, status: 'pending', resolvedBy: null, resolvedAt: null,
      relatedReceipt: relatedReceipt || '',
      // The subsequent-movement chain — unset until an Owner sends the
      // (already approved) item onward. See sendReportToWarehouse /
      // markReportReceived / resolveReportOutcome below.
      destinationShopId: null, sentBy: null, sentAt: null,
      receivedBy: null, receivedAt: null,
      outcome: null, outcomeBy: null, outcomeAt: null, outcomeNotes: '',
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

// Everything below is the Admin Dashboard's "subsequent movement" chain for
// an already-approved report — Owner-only (see firestore.rules: none of
// these fields are in the non-Owner onlyChanged() allowlist). This never
// mutates `items` stock: approveDamage already pulled the reported quantity
// out of the source store's sellable stock, so this is purely a physical/
// paper trail of where that already-removed unit went next, kept on the
// report itself so it stays traceable regardless of where it currently is.

// Ships an approved report onward (typically to a warehouse) for
// inspection/repair. `destinationShopId` is deliberately a separate field
// from the immutable source `shopId` — the source is never overwritten.
export async function sendReportToWarehouse(db, reportId, { destinationShopId, sentBy }) {
  if (!destinationShopId) throw new Error('Select a destination location');
  const snap = await getDoc(doc(db, 'damageReports', reportId));
  if (!snap.exists()) throw new Error('Report no longer exists');
  if (snap.data().status !== 'approved') throw new Error('Only an approved report can be sent onward');
  await setDoc(doc(db, 'damageReports', reportId), {
    status: 'sent_to_warehouse', destinationShopId, sentBy: sentBy || '', sentAt: Date.now(),
  }, { merge: true });
}

// The destination confirms the item actually arrived, before a final
// repaired/replaced/disposed outcome can be recorded.
export async function markReportReceived(db, reportId, { receivedBy }) {
  const snap = await getDoc(doc(db, 'damageReports', reportId));
  if (!snap.exists()) throw new Error('Report no longer exists');
  if (snap.data().status !== 'sent_to_warehouse') throw new Error('This report has not been sent onward yet');
  await setDoc(doc(db, 'damageReports', reportId), {
    status: 'received_at_destination', receivedBy: receivedBy || '', receivedAt: Date.now(),
  }, { merge: true });
}

const OUTCOMES = ['repaired', 'replaced', 'disposed'];

// The final disposition. Allowed straight from 'approved' too (skip the
// warehouse leg entirely) for a case resolved locally at the source store —
// not every damaged item needs to physically travel anywhere to be, say,
// disposed of.
export async function resolveReportOutcome(db, reportId, { outcome, resolvedBy, notes }) {
  if (!OUTCOMES.includes(outcome)) throw new Error('Invalid outcome');
  const snap = await getDoc(doc(db, 'damageReports', reportId));
  if (!snap.exists()) throw new Error('Report no longer exists');
  const status = snap.data().status;
  if (status !== 'approved' && status !== 'received_at_destination') {
    throw new Error('This report is not ready for a final outcome yet');
  }
  await setDoc(doc(db, 'damageReports', reportId), {
    status: outcome, outcome, outcomeBy: resolvedBy || '', outcomeAt: Date.now(), outcomeNotes: notes || '',
  }, { merge: true });
}
