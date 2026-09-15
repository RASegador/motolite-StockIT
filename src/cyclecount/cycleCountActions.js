import { doc, getDoc, setDoc, runTransaction } from 'firebase/firestore';
import { newId } from '../lib/format';
import { getItemUnits, getUnitCounts, totalBaseUnits } from '../lib/units';

// A cycle count captures each included item's SYSTEM quantity at the
// moment it's started (never re-reads it later) — that snapshot is exactly
// what "physical count vs what the system thought" needs to compare
// against, and freezing it means the count stays meaningful even if stock
// moves (a sale, a transfer) while someone is still walking the shelves.
export async function startCycleCount(db, { shopId, items, startedBy, label }) {
  const id = newId('cc');
  const lines = items.map((item) => ({
    itemId: item.id, sku: item.sku || '', name: item.name || '',
    unitName: item.baseUnitName || 'Piece',
    systemQty: item.quantity || 0, countedQty: null,
  }));
  await setDoc(doc(db, 'cycleCounts', id), {
    id, shopId, label: label || '', status: 'open',
    startedBy: startedBy || '', startedAt: Date.now(),
    items: lines, appliedBy: null, appliedAt: null,
  });
  return id;
}

// Counted quantities are entered one item at a time as staff walk the
// shelves — rewriting the whole `items` array on each entry (Firestore has
// no partial-array-element update) is fine at the size a single count
// session realistically reaches (one shop's worth of items, not
// thousands).
export async function recordCountedQty(db, count, itemId, countedQty) {
  const items = count.items.map((line) =>
    line.itemId === itemId ? { ...line, countedQty: countedQty === '' ? null : Number(countedQty) } : line
  );
  await setDoc(doc(db, 'cycleCounts', count.id), { items }, { merge: true });
  return items;
}

export async function cancelCycleCount(db, countId) {
  const snap = await getDoc(doc(db, 'cycleCounts', countId));
  if (!snap.exists()) throw new Error('Cycle count no longer exists');
  if (snap.data().status !== 'open') throw new Error('Only an open count can be cancelled');
  await setDoc(doc(db, 'cycleCounts', countId), { status: 'cancelled' }, { merge: true });
}

// Applies every line with a counted quantity that differs from what was
// last read as the system quantity — freshly re-read inside the
// transaction, same fresh-read discipline salesActions.js uses, so a sale
// that happened mid-count doesn't get silently clobbered by an adjustment
// based on stale data. This only ever adjusts the BASE unit's stock count
// (an item's Pack/Box stock is untouched) — a limitation worth knowing
// about for an item counted in a different unit than it's usually sold in.
export async function applyCycleCount(db, count, { appliedBy } = {}) {
  const linesToApply = count.items.filter((l) => l.countedQty != null && l.countedQty !== l.systemQty);
  const now = Date.now();

  await runTransaction(db, async (transaction) => {
    const countSnap = await transaction.get(doc(db, 'cycleCounts', count.id));
    if (!countSnap.exists()) throw new Error('Cycle count no longer exists');
    if (countSnap.data().status !== 'open') throw new Error('This count has already been closed');

    for (const line of linesToApply) {
      const itemRef = doc(db, 'items', line.itemId);
      const itemSnap = await transaction.get(itemRef);
      if (!itemSnap.exists()) continue; // item deleted since the count started — nothing to adjust
      const item = itemSnap.data();
      const units = getItemUnits(item);
      const baseUnitName = item.baseUnitName || 'Piece';
      const currentStock = getUnitCounts(item);
      const delta = line.countedQty - line.systemQty;
      const newStock = { ...currentStock, [baseUnitName]: (currentStock[baseUnitName] || 0) + delta };
      const newQuantity = totalBaseUnits(newStock, units);
      transaction.set(itemRef, { ...item, quantity: newQuantity, unitStock: newStock });

      const mvId = newId('m');
      transaction.set(doc(db, 'movements', mvId), {
        id: mvId, itemId: line.itemId, type: delta >= 0 ? 'in' : 'out', qty: Math.abs(delta),
        shopId: count.shopId, reason: `Cycle count ${count.label || count.id}`, timestamp: now,
        activityType: 'cycle_count_adjustment', actorId: appliedBy || null,
        previousQuantity: item.quantity, newQuantity,
      });
    }

    transaction.set(doc(db, 'cycleCounts', count.id), {
      status: 'applied', appliedBy: appliedBy || '', appliedAt: now,
    }, { merge: true });
  });
}
