import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where, orderBy } from 'firebase/firestore';
import { db } from '../firebase';

export function useDamageReports({ role, shopId }) {
  const [reports, setReports] = useState([]);
  useEffect(() => {
    const reportsQuery = role === 'admin'
      ? query(collection(db, 'damageReports'), orderBy('reportedAt', 'desc'))
      : query(collection(db, 'damageReports'), where('shopId', '==', shopId), orderBy('reportedAt', 'desc'));
    return onSnapshot(reportsQuery, (snap) => setReports(snap.docs.map((d) => d.data())));
  }, [role, shopId]);
  return reports;
}
