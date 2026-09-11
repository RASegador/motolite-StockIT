import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';

export function useItems({ role, shopId }) {
  const [items, setItems] = useState([]);
  useEffect(() => {
    const itemsQuery = role === 'owner'
      ? collection(db, 'items')
      : query(collection(db, 'items'), where('shopId', '==', shopId));
    return onSnapshot(itemsQuery, (snap) => setItems(snap.docs.map((d) => d.data())));
  }, [role, shopId]);
  return items;
}
