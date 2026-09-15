import { doc, setDoc } from 'firebase/firestore';

// One doc per shop+date — a second close on the same day overwrites the
// first (setDoc, not create-once), so correcting a same-day mistake is a
// normal re-save rather than a support request. `closedBy` becomes the
// most recent name to save it; earlier close history isn't kept — good
// enough for a first version of this, not an audit trail.
export function reconciliationId(shopId, date) {
  return `${shopId}_${date}`;
}

export async function saveCashReconciliation(db, { shopId, date, expected, actualCounts, variance, closedBy, notes }) {
  const id = reconciliationId(shopId, date);
  await setDoc(doc(db, 'cashReconciliations', id), {
    id, shopId, date, expected, actualCounts, variance,
    closedBy: closedBy || '', notes: notes || '', closedAt: Date.now(),
  });
  return id;
}
