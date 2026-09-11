import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { newId } from '../lib/format';

export async function createShop(db, name) {
  const trimmed = (name || '').trim();
  if (!trimmed) throw new Error('Shop name is required');
  const shopId = newId('shop');
  await setDoc(doc(db, 'shops', shopId), { id: shopId, name: trimmed, createdAt: Date.now() });
  return shopId;
}

export async function renameShop(db, shopId, name) {
  const trimmed = (name || '').trim();
  if (!trimmed) throw new Error('Shop name is required');
  await setDoc(doc(db, 'shops', shopId), { name: trimmed }, { merge: true });
}

export async function deleteShop(db, shopId) {
  await deleteDoc(doc(db, 'shops', shopId));
}
