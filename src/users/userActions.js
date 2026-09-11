import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { db as defaultDb, firebaseConfig } from '../firebase';
import { newId } from '../lib/format';

export async function updateUserRole(dbOrUid, uidOrRole, maybeRole) {
  const [db, uid, role] = maybeRole === undefined
    ? [defaultDb, dbOrUid, uidOrRole]
    : [dbOrUid, uidOrRole, maybeRole];
  await updateDoc(doc(db, 'users', uid), { role });
}

export async function updateUserShop(dbOrUid, uidOrShopId, maybeShopId) {
  const [db, uid, shopId] = maybeShopId === undefined
    ? [defaultDb, dbOrUid, uidOrShopId]
    : [dbOrUid, uidOrShopId, maybeShopId];
  await updateDoc(doc(db, 'users', uid), { shopId });
}

export async function setUserActive(dbOrUid, uidOrActive, maybeActive) {
  const [db, uid, active] = maybeActive === undefined
    ? [defaultDb, dbOrUid, uidOrActive]
    : [dbOrUid, uidOrActive, maybeActive];
  await updateDoc(doc(db, 'users', uid), { active });
}

// Creates a brand-new Firebase Auth account + matching Firestore user doc,
// without signing the calling Owner/Admin out of their own session. Spins
// up a second, uniquely-named Firebase App instance sharing the same
// project config purely to perform the account creation, then tears that
// instance down immediately — the primary `auth` export in src/firebase.js
// (and whoever is signed into it) is never touched.
export async function createUser({ email, fullName, role, shopId }) {
  const tempPassword = Math.random().toString(36).slice(2, 10) + 'A1!';
  const secondaryApp = initializeApp(firebaseConfig, 'user-creation-' + newId(''));
  try {
    const secondaryAuth = getAuth(secondaryApp);
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, tempPassword);
    await setDoc(doc(defaultDb, 'users', cred.user.uid), {
      uid: cred.user.uid, email, fullName, role, shopId: shopId || null,
      active: true, createdAt: Date.now(),
    });
    await signOut(secondaryAuth);
    return { uid: cred.user.uid, tempPassword };
  } finally {
    await deleteApp(secondaryApp);
  }
}
