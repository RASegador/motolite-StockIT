import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';

export async function lookupWarrantyBySerial(db, serial) {
  const snap = await getDoc(doc(db, 'warrantyLookup', serial.trim()));
  return snap.exists() ? snap.data() : null;
}

// A looser secondary search for when someone doesn't have the serial on
// hand — by customer phone number, most-recent first. Sorted client-side
// rather than via a Firestore `orderBy` on a different field than the
// `where` filter, which would need a composite index this project doesn't
// pre-provision — fine at the scale this query realistically returns (one
// phone number's own purchases).
export async function lookupWarrantyByPhone(db, phone) {
  const q = query(collection(db, 'warrantyLookup'), where('customerPhone', '==', phone.trim()));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data()).sort((a, b) => b.soldAt - a.soldAt).slice(0, 20);
}

export function warrantyStatus(record) {
  if (!record) return null;
  if (!record.warrantyExpiresAt) return { active: false, label: 'No warranty period on file' };
  const active = Date.now() < record.warrantyExpiresAt;
  return { active, label: active ? 'Under warranty' : 'Warranty expired', expiresAt: record.warrantyExpiresAt };
}
