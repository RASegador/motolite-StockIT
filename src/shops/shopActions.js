import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { newId } from '../lib/format';

// `type` distinguishes a customer-facing Store from a Warehouse — the two
// location kinds the Multi-Location Inventory spec calls out. Everything
// else (items, movements, transfers, damage reports, restock requests) is
// keyed by plain `shopId` regardless of type, so a warehouse is just
// another `shops` document; `type` only drives which locations a
// Warehouse-role user can be assigned to and how the UI labels a location.
export async function createShop(db, name, type = 'store') {
  const trimmed = (name || '').trim();
  if (!trimmed) throw new Error('Shop name is required');
  const shopId = newId('shop');
  await setDoc(doc(db, 'shops', shopId), {
    id: shopId, name: trimmed, type: type === 'warehouse' ? 'warehouse' : 'store', createdAt: Date.now(),
  });
  return shopId;
}

export async function setShopType(db, shopId, type) {
  await setDoc(doc(db, 'shops', shopId), { type: type === 'warehouse' ? 'warehouse' : 'store' }, { merge: true });
}

export async function renameShop(db, shopId, name) {
  const trimmed = (name || '').trim();
  if (!trimmed) throw new Error('Shop name is required');
  await setDoc(doc(db, 'shops', shopId), { name: trimmed }, { merge: true });
}

export async function deleteShop(db, shopId) {
  await deleteDoc(doc(db, 'shops', shopId));
}
