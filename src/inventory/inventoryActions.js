import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { getItemUnits, totalBaseUnits } from '../lib/units';
import { computeSellingPrice } from '../lib/pricing';
import { newId } from '../lib/format';

export async function saveItem(db, draft, { shopId }) {
  const id = draft.id || newId('i');
  const baseUnitName = draft.baseUnitName || 'Piece';

  const unitStock = { [baseUnitName]: Math.max(0, Number(draft.baseUnitStock) || 0) };
  (draft.units || []).forEach((u) => {
    unitStock[u.name] = Math.max(0, Number(u.stock) || 0);
  });

  const units = getItemUnits({ ...draft, baseUnitName, unitStock });
  const quantity = totalBaseUnits(unitStock, units);

  const sellingPrice = draft.sellingPrice ??
    computeSellingPrice(draft.unitCost, draft.markupType || 'percent', draft.markupValue || 0);

  await setDoc(doc(db, 'items', id), {
    ...draft, id, shopId, quantity, unitStock, baseUnitName, sellingPrice,
    reservedForReview: draft.reservedForReview ?? 0,
    units: draft.units || [],
  });
  return id;
}

export async function deleteItem(db, itemId) {
  await deleteDoc(doc(db, 'items', itemId));
}
