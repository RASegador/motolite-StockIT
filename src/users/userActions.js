import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, updatePassword, signOut } from 'firebase/auth';
import { auth as defaultAuth, db as defaultDb, firebaseConfig } from '../firebase';
import { newId } from '../lib/format';
import { usernameToEmail, generateOtp, isValidUsername } from '../lib/credentials';

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
// without signing the calling Owner out of their own session. Spins up a
// second, uniquely-named Firebase App instance sharing the same project
// config purely to perform the account creation, then tears that instance
// down immediately — the primary `auth` export in src/firebase.js (and
// whoever is signed into it) is never touched.
//
// Only Manager/Cashier accounts are created here — there is exactly one
// Owner account in this system, created once via scripts/create-owner.js,
// and this function refuses to create another (Firestore rules enforce the
// same restriction server-side; this is the UI-facing half of that).
//
// No email is collected. A Username is the account's identity; it's turned
// into a deterministic synthetic email (see src/lib/credentials.js) purely
// because Firebase Auth requires an "email" string internally — nothing
// about that synthetic address is shown to the Owner or the new user, and
// it's never used to actually deliver anything. A random one-time password
// (the OTP) is generated here, returned to the caller to display once, and
// never written to Firestore — Firebase Auth stores only its own password
// hash. The new account's Firestore doc is flagged `mustChangePassword:
// true`; App.jsx blocks access to the rest of the system until that OTP is
// replaced with a personal password (see completeFirstLogin below).
export async function createUser({ username, fullName, role, shopId }) {
  if (role === 'owner') {
    throw new Error('A new Owner account cannot be created here — there can only be one Owner.');
  }
  const cleanUsername = (username || '').trim().toLowerCase();
  if (!isValidUsername(cleanUsername)) {
    throw new Error('Username must be 3-24 characters: letters, numbers, dots, underscores, or hyphens.');
  }
  const email = usernameToEmail(cleanUsername);
  const otp = generateOtp();
  const secondaryApp = initializeApp(firebaseConfig, 'user-creation-' + newId(''));
  try {
    const secondaryAuth = getAuth(secondaryApp);
    let cred;
    try {
      cred = await createUserWithEmailAndPassword(secondaryAuth, email, otp);
    } catch (err) {
      if (err.code === 'auth/email-already-in-use') {
        throw new Error('That username is already taken.');
      }
      throw err;
    }
    await setDoc(doc(defaultDb, 'users', cred.user.uid), {
      uid: cred.user.uid, username: cleanUsername, fullName, role, shopId: shopId || null,
      active: true, mustChangePassword: true, createdAt: Date.now(),
    });
    await signOut(secondaryAuth);
    return { uid: cred.user.uid, username: cleanUsername, otp };
  } finally {
    await deleteApp(secondaryApp);
  }
}

// Called by the signed-in user themselves, right after logging in with
// their one-time password. `updatePassword` replaces the account's
// password in Firebase Auth outright — the OTP simply stops working the
// moment this succeeds, with nothing extra to revoke. Clearing
// `mustChangePassword` is a self-serve Firestore write Security Rules only
// allow as a one-way true -> false transition, so a user can't re-open
// their own gate (or anyone else's).
export async function completeFirstLogin(newPassword) {
  const current = defaultAuth.currentUser;
  if (!current) throw new Error('Not signed in.');
  await updatePassword(current, newPassword);
  await updateDoc(doc(defaultDb, 'users', current.uid), { mustChangePassword: false });
}

// One-time self-serve Username set for an account that predates this
// feature (the original Owner account, created by scripts/create-owner.js
// with only a real email). Firestore rules only allow this write while the
// document has no Username yet, so it can't be used to rename an account
// or take over someone else's.
export async function setOwnUsername(uid, username) {
  const cleanUsername = (username || '').trim().toLowerCase();
  if (!isValidUsername(cleanUsername)) {
    throw new Error('Username must be 3-24 characters: letters, numbers, dots, underscores, or hyphens.');
  }
  await updateDoc(doc(defaultDb, 'users', uid), { username: cleanUsername });
}
