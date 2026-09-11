import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase';

export function useShops() {
  const [shops, setShops] = useState([]);
  useEffect(() => onSnapshot(
    query(collection(db, 'shops'), orderBy('name')),
    (snap) => setShops(snap.docs.map((d) => d.data()))
  ), []);
  return shops;
}
