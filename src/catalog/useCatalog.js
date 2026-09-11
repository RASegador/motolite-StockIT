import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase';

function useCollection(name) {
  const [rows, setRows] = useState([]);
  useEffect(() => onSnapshot(
    query(collection(db, name), orderBy('name')),
    (snap) => setRows(snap.docs.map((d) => d.data()))
  ), [name]);
  return rows;
}

export function useCategories() { return useCollection('categories'); }
export function useLocations() { return useCollection('locations'); }
export function useSuppliers() { return useCollection('suppliers'); }
