import { doc, setDoc, deleteDoc, getDocs, collection, query, where } from 'firebase/firestore';
import { newId } from '../lib/format';

function makeCrud(collectionName, itemFieldName) {
  return {
    async add(db, name) {
      const trimmed = (name || '').trim();
      if (!trimmed) throw new Error(`Name is required`);
      const existing = await getDocs(collection(db, collectionName));
      if (existing.docs.some((d) => d.data().name.toLowerCase() === trimmed.toLowerCase())) {
        throw new Error(`"${trimmed}" already exists`);
      }
      const id = newId(collectionName[0]);
      await setDoc(doc(db, collectionName, id), { id, name: trimmed });
      return id;
    },
    async remove(db, name) {
      const inUse = await getDocs(query(collection(db, 'items'), where(itemFieldName, '==', name)));
      if (!inUse.empty) {
        throw new Error(`"${name}" is still in use — ${inUse.size} item${inUse.size === 1 ? '' : 's'} still use it`);
      }
      const existing = await getDocs(query(collection(db, collectionName), where('name', '==', name)));
      await Promise.all(existing.docs.map((d) => deleteDoc(d.ref)));
    },
  };
}

const categories = makeCrud('categories', 'category');
const locations = makeCrud('locations', 'location');

export const addCategory = categories.add;
export const deleteCategory = categories.remove;
export const addLocation = locations.add;
export const deleteLocation = locations.remove;

export async function addSupplier(db, { name, contact }) {
  const trimmed = (name || '').trim();
  if (!trimmed) throw new Error('Supplier name is required');
  const id = newId('sup');
  await setDoc(doc(db, 'suppliers', id), { id, name: trimmed, contact: contact || '' });
  return id;
}

export async function deleteSupplier(db, supplierId) {
  await deleteDoc(doc(db, 'suppliers', supplierId));
}
