import { doc, setDoc, deleteDoc, getDocs, collection, query, where, writeBatch } from 'firebase/firestore';
import { newId } from '../lib/format';

// Firestore's writeBatch caps a single batch at 500 writes. A rename here
// is 1 (the catalog doc) + however many items reference the old name, so
// this is the practical ceiling on how many items a single Category or
// Location can be attached to before a rename needs to be split into
// multiple batches. Comfortably enough for a shop-inventory catalog; flagged
// here rather than silently truncating if that ever changes.
const BATCH_LIMIT = 500;

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
    // Renames in place instead of the old "remove and re-add" workaround —
    // which never actually worked for an in-use category/location anyway,
    // since remove() refuses to delete one that's still referenced. Updates
    // the catalog doc's own name AND every item currently pointing at the
    // old name (items store this as a plain string, not a foreign key — see
    // the module comment on makeCrud/deleteSupplier for how suppliers
    // differ), all in one atomic batch so an item can never end up
    // referencing a name that no longer exists in the catalog.
    async rename(db, oldName, newName) {
      const trimmed = (newName || '').trim();
      if (!trimmed) throw new Error('Name is required');
      if (trimmed === oldName) return;

      const existing = await getDocs(collection(db, collectionName));
      const match = existing.docs.find((d) => d.data().name === oldName);
      if (!match) throw new Error(`"${oldName}" not found`);
      const dupe = existing.docs.find((d) => d.id !== match.id && d.data().name.toLowerCase() === trimmed.toLowerCase());
      if (dupe) throw new Error(`"${trimmed}" already exists`);

      const itemsSnap = await getDocs(query(collection(db, 'items'), where(itemFieldName, '==', oldName)));
      if (itemsSnap.size + 1 > BATCH_LIMIT) {
        throw new Error(`Too many items (${itemsSnap.size}) reference "${oldName}" to rename in one step. Ask a developer for help.`);
      }

      const batch = writeBatch(db);
      batch.set(match.ref, { name: trimmed }, { merge: true });
      itemsSnap.docs.forEach((d) => batch.set(d.ref, { [itemFieldName]: trimmed }, { merge: true }));
      await batch.commit();
    },
  };
}

const categories = makeCrud('categories', 'category');
const locations = makeCrud('locations', 'location');

export const addCategory = categories.add;
export const deleteCategory = categories.remove;
export const renameCategory = categories.rename;
export const addLocation = locations.add;
export const deleteLocation = locations.remove;
export const renameLocation = locations.rename;

export async function addSupplier(db, { name, contact }) {
  const trimmed = (name || '').trim();
  if (!trimmed) throw new Error('Supplier name is required');
  const id = newId('sup');
  await setDoc(doc(db, 'suppliers', id), { id, name: trimmed, contact: contact || '' });
  return id;
}

// Simpler than categories/locations' rename() above: items reference a
// supplier by id (see deleteSupplier's comment below), so renaming only
// ever touches the supplier's own doc — no batch of item updates needed.
export async function renameSupplier(db, supplierId, name) {
  const trimmed = (name || '').trim();
  if (!trimmed) throw new Error('Supplier name is required');
  await setDoc(doc(db, 'suppliers', supplierId), { name: trimmed }, { merge: true });
}

export async function deleteSupplier(db, supplierId) {
  // Unlike categories/locations (which items reference by plain name — see
  // makeCrud('remove') above), items reference suppliers by id inside the
  // `supplierIds` array, so the in-use check here needs `array-contains`
  // instead of `==`. Before this fix, deleting a supplier skipped this
  // check entirely and would silently leave existing items pointing at a
  // supplier id that no longer resolves to anything (e.g. ItemDetailView's
  // supplier-name lookup would just show nothing for that item).
  const inUse = await getDocs(query(collection(db, 'items'), where('supplierIds', 'array-contains', supplierId)));
  if (!inUse.empty) {
    throw new Error(`This supplier is still in use — ${inUse.size} item${inUse.size === 1 ? '' : 's'} still use it`);
  }
  await deleteDoc(doc(db, 'suppliers', supplierId));
}
