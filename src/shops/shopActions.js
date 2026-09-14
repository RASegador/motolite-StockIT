import {
  doc, setDoc, deleteDoc, getDocs, collection, query, where,
} from 'firebase/firestore';
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

// Refuses to delete a shop that still has anything real pointing at it —
// stock, an assigned user, an in-flight transfer, or an open restock
// request — since a plain deleteDoc would silently orphan every one of
// those (an item/user left with a shopId that resolves to nothing, a
// transfer/request stuck referencing a shop that no longer exists). Only
// LIVE references block the delete: a finished/historical transfer or
// restock request that happens to mention this shop is left alone (same
// "keep old data, just stop pointing new things at it" precedent already
// used for a deleted user's past sales — see App.jsx's Cashier-removal
// comment).
//
// Every query below filters on a single field only (`shopId`,
// `fromShopId`, `toShopId`, `requestingShopId`) — deliberately, so this
// never needs a new Firestore composite index: single-field filters use
// Firestore's automatic per-field indexes, and the small remaining
// filtering (by `status`) happens client-side once the (necessarily few,
// shop-scoped) docs are already in hand.
export async function deleteShop(db, shopId) {
  const [itemsSnap, usersSnap, transfersFromSnap, transfersToSnap, requestsSnap] = await Promise.all([
    getDocs(query(collection(db, 'items'), where('shopId', '==', shopId))),
    getDocs(query(collection(db, 'users'), where('shopId', '==', shopId))),
    getDocs(query(collection(db, 'transfers'), where('fromShopId', '==', shopId))),
    getDocs(query(collection(db, 'transfers'), where('toShopId', '==', shopId))),
    getDocs(query(collection(db, 'restockRequests'), where('requestingShopId', '==', shopId))),
  ]);

  const problems = [];
  if (!itemsSnap.empty) {
    problems.push(`${itemsSnap.size} item${itemsSnap.size === 1 ? '' : 's'} still stocked here`);
  }
  if (!usersSnap.empty) {
    problems.push(`${usersSnap.size} user${usersSnap.size === 1 ? '' : 's'} assigned here`);
  }
  const inTransitCount = [...transfersFromSnap.docs, ...transfersToSnap.docs]
    .filter((d) => d.data().status === 'in_transit').length;
  if (inTransitCount > 0) {
    problems.push(`${inTransitCount} transfer${inTransitCount === 1 ? '' : 's'} still in transit to/from here`);
  }
  const openRequestCount = requestsSnap.docs.filter((d) => ['pending', 'approved'].includes(d.data().status)).length;
  if (openRequestCount > 0) {
    problems.push(`${openRequestCount} restock request${openRequestCount === 1 ? '' : 's'} still open for here`);
  }

  if (problems.length > 0) {
    throw new Error(`Can't delete this shop — ${problems.join('; ')}. Reassign or resolve these first, then try again.`);
  }

  await deleteDoc(doc(db, 'shops', shopId));
}
