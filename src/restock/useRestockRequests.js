import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where, orderBy } from 'firebase/firestore';
import { db } from '../firebase';

// Owner and Warehouse both review requests system-wide (see
// firestore.rules — `isWarehouse()` can read every request, same as
// `isOwner()`); a Manager only ever sees their own store's.
export function useRestockRequests({ role, shopId }) {
  const [requests, setRequests] = useState([]);
  useEffect(() => {
    const q = (role === 'admin' || role === 'warehouse')
      ? query(collection(db, 'restockRequests'), orderBy('createdAt', 'desc'))
      : query(collection(db, 'restockRequests'), where('requestingShopId', '==', shopId), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snap) => setRequests(snap.docs.map((d) => d.data())), () => setRequests([]));
  }, [role, shopId]);
  return requests;
}
