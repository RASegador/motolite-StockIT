import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase';

export function useUsers() {
  const [users, setUsers] = useState([]);
  useEffect(() => onSnapshot(
    query(collection(db, 'users'), orderBy('fullName')),
    (snap) => setUsers(snap.docs.map((d) => d.data())),
    () => setUsers([]) // a non-Owner/Admin will get a permission-denied error here; fail closed to an empty list
  ), []);
  return users;
}
