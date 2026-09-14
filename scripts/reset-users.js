// DESTRUCTIVE — permanently deletes every user account except the Admin
// (role 'admin' or the legacy 'owner'), both the Firebase Auth account and
// its Firestore `users` doc, then creates two fresh placeholder accounts
// (one Manager, one Warehouse) to sign in and test with. Not reversible.
// Only ever meant to be run deliberately, once, to reset accounts back to
// a clean slate — never as part of a normal deploy.
//
// Uses the same service-account.json as scripts/create-owner.js (Firebase
// Console -> Project Settings -> Service Accounts -> Generate new private
// key), saved locally as service-account.json (already gitignored).
//
// Run scripts/seed-demo-data.js FIRST if you haven't already — it creates
// the Central Warehouse + Branch A/B shops this script assigns the new
// placeholder accounts to. If no warehouse/store shop exists yet, the new
// accounts are still created, just unassigned (assign a shop for them
// afterward from Users in the app).
//
// Usage: node scripts/reset-users.js

import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';
import { usernameToEmail, generateOtp } from '../src/lib/credentials.js';

const serviceAccount = JSON.parse(readFileSync('./service-account.json', 'utf8'));
initializeApp({ credential: cert(serviceAccount) });
const auth = getAuth();
const db = getFirestore();

function isAdminRole(role) {
  return role === 'owner' || role === 'admin';
}

async function deleteNonAdminAccounts() {
  const usersSnap = await db.collection('users').get();
  const keep = usersSnap.docs.filter((d) => isAdminRole(d.data().role));
  const toDelete = usersSnap.docs.filter((d) => !isAdminRole(d.data().role));

  if (keep.length === 0) {
    throw new Error('No account with role "admin"/"owner" found in Firestore — refusing to continue, so you never end up locked out. Check the users collection.');
  }
  console.log(`Keeping ${keep.length} Admin account(s): ${keep.map((d) => d.data().username || d.data().email || d.id).join(', ')}`);
  console.log(`Deleting ${toDelete.length} other account(s)...`);

  for (const d of toDelete) {
    const { uid, username, role, fullName } = d.data();
    try {
      // eslint-disable-next-line no-await-in-loop
      await auth.deleteUser(uid);
    } catch (err) {
      if (err.code !== 'auth/user-not-found') throw err;
    }
    // eslint-disable-next-line no-await-in-loop
    await d.ref.delete();
    console.log(`  Deleted ${role} account: ${username || fullName || uid}`);
  }

  // Also sweep any Firebase Auth account with no matching Firestore `users`
  // doc at all (e.g. left over from a past partial/failed creation) —
  // applies the same "keep only Admin" rule directly to Auth.
  const keepUids = new Set(keep.map((d) => d.id));
  let pageToken;
  do {
    // eslint-disable-next-line no-await-in-loop
    const page = await auth.listUsers(1000, pageToken);
    for (const u of page.users) {
      if (!keepUids.has(u.uid)) {
        // eslint-disable-next-line no-await-in-loop
        await auth.deleteUser(u.uid);
        console.log(`  Deleted orphaned Auth account (no Firestore doc): ${u.email || u.uid}`);
      }
    }
    pageToken = page.pageToken;
  } while (pageToken);
}

async function findShopId(type) {
  const snap = await db.collection('shops').where('type', '==', type).limit(1).get();
  return snap.empty ? null : snap.docs[0].id;
}

async function createPlaceholderAccount({ username, fullName, role, shopId }) {
  const email = usernameToEmail(username);
  const otp = generateOtp();
  let userRecord;
  try {
    userRecord = await auth.createUser({ email, password: otp, displayName: fullName });
  } catch (err) {
    if (err.code === 'auth/email-already-exists') {
      console.log(`  Skipped ${role} placeholder — username "${username}" is already taken.`);
      return;
    }
    throw err;
  }
  await db.collection('users').doc(userRecord.uid).set({
    uid: userRecord.uid, username, fullName, role, shopId: shopId || null,
    active: true, mustChangePassword: true, createdAt: Date.now(),
  });
  console.log(`  Created ${role} placeholder — username: "${username}"  password: "${otp}"  (must be changed on first login)`);
}

async function main() {
  await deleteNonAdminAccounts();

  const warehouseShopId = await findShopId('warehouse');
  const storeShopId = await findShopId('store');
  if (!warehouseShopId) console.log('  Note: no warehouse shop found yet — the Warehouse placeholder will be unassigned.');
  if (!storeShopId) console.log('  Note: no store shop found yet — the Manager placeholder will be unassigned.');

  console.log('\nCreating placeholder accounts...');
  await createPlaceholderAccount({ username: 'manager1', fullName: 'Manager Placeholder', role: 'manager', shopId: storeShopId });
  await createPlaceholderAccount({ username: 'warehouse1', fullName: 'Warehouse Placeholder', role: 'warehouse', shopId: warehouseShopId });

  console.log('\nDone. Sign in with the printed username + password (the login screen also accepts the Username field) — you\'ll be asked to set your own password immediately.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
