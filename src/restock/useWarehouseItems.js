import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';

// Every item currently sitting in ANY warehouse-type shop — this is what
// populates the "browse warehouse stock" table in WarehouseRestockModal, so
// a store Manager can see what's actually available before requesting a
// restock, instead of guessing from their own store's item list. Readable
// under firestore.rules' isWarehouseShop() carve-out (Manager/Warehouse
// only, read-only) — a Manager still can never write to these docs, so
// "can request but never directly touch warehouse stock" holds regardless
// of this hook's existence.
//
// A newly-added warehouse item shows up here automatically the moment
// Owner saves it — this is a live onSnapshot listener, not a one-time
// fetch, and `items` was never filtered by "already requested before" —
// so there's no separate step to "publish" an item to the restock list.
export function useWarehouseItems(warehouseShopIds) {
  const [items, setItems] = useState([]);
  const key = (warehouseShopIds || []).slice().sort().join(',');
  useEffect(() => {
    const ids = key ? key.split(',') : [];
    if (ids.length === 0) { setItems([]); return undefined; }
    // Firestore 'in' caps at 30 values, comfortably above any realistic
    // warehouse count.
    const q = query(collection(db, 'items'), where('shopId', 'in', ids.slice(0, 30)));
    return onSnapshot(q, (snap) => setItems(snap.docs.map((d) => d.data())), () => setItems([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return items;
}
