import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';

export function useMovementsLog({ role, shopId }, rowLimit = 100) {
  const [movements, setMovements] = useState([]);
  useEffect(() => {
    const movementsQuery = role === 'admin'
      ? query(collection(db, 'movements'), orderBy('timestamp', 'desc'), limit(rowLimit))
      : query(collection(db, 'movements'), where('shopId', '==', shopId), orderBy('timestamp', 'desc'), limit(rowLimit));
    return onSnapshot(movementsQuery, (snap) => setMovements(snap.docs.map((d) => d.data())));
  }, [role, shopId, rowLimit]);
  return movements;
}
