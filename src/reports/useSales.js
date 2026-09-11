import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where, orderBy } from 'firebase/firestore';
import { db } from '../firebase';

export function useSales({ role, shopId }) {
  const [sales, setSales] = useState([]);
  useEffect(() => {
    const salesQuery = role === 'owner'
      ? query(collection(db, 'sales'), orderBy('timestamp', 'desc'))
      : query(collection(db, 'sales'), where('shopId', '==', shopId), orderBy('timestamp', 'desc'));
    return onSnapshot(salesQuery, (snap) => setSales(snap.docs.map((d) => d.data())));
  }, [role, shopId]);
  return sales;
}
