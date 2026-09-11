import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where, orderBy } from 'firebase/firestore';
import { db } from '../firebase';

// A transfer is relevant to a shop as either sender or receiver, and
// Firestore doesn't support an OR across two different fields in one
// query — so a Manager subscribes to both queries and merges the results
// client-side. An Owner/Admin just gets everything.
export function useTransfers({ role, shopId }) {
  const [outgoing, setOutgoing] = useState([]);
  const [incoming, setIncoming] = useState([]);

  useEffect(() => {
    if (role === 'owner') {
      return onSnapshot(query(collection(db, 'transfers'), orderBy('initiatedAt', 'desc')), (snap) => {
        setOutgoing(snap.docs.map((d) => d.data()));
        setIncoming([]);
      });
    }
    const unsubOut = onSnapshot(
      query(collection(db, 'transfers'), where('fromShopId', '==', shopId), orderBy('initiatedAt', 'desc')),
      (snap) => setOutgoing(snap.docs.map((d) => d.data()))
    );
    const unsubIn = onSnapshot(
      query(collection(db, 'transfers'), where('toShopId', '==', shopId), orderBy('initiatedAt', 'desc')),
      (snap) => setIncoming(snap.docs.map((d) => d.data()))
    );
    return () => { unsubOut(); unsubIn(); };
  }, [role, shopId]);

  if (role === 'owner') return outgoing;
  const byId = new Map();
  [...outgoing, ...incoming].forEach((t) => byId.set(t.id, t));
  return [...byId.values()].sort((a, b) => b.initiatedAt - a.initiatedAt);
}
