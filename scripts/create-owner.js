// One-time script to bootstrap the first (and only) Admin account.
// Run this once after setting up your Firebase project, using a service
// account key (Firebase Console -> Project Settings -> Service Accounts ->
// Generate new private key), saved locally as service-account.json
// (already gitignored).
//
// Usage: node scripts/create-owner.js admin@example.com "Admin Name" [username]
// It will print a temporary password — change it on first login.
//
// The Admin account still signs in with a real email/password (Manager and
// Warehouse accounts created afterward in-app use a Username instead — see
// src/lib/credentials.js for why that's Username-only). Username here is
// optional and only used to show the Admin consistently alongside
// Manager/Warehouse rows in User Management — it does not change how the
// Admin signs in. It can also be set later, once, from inside the app
// (User Management -> "Set username…" on the Admin's own row).
//
// Writes role: 'admin' — the current internal role key (renamed from
// 'owner'). The one pre-existing account created by an earlier run of this
// script still has role: 'owner' in Firestore; that's fine as-is and needs
// no migration — resolveRole() in src/lib/permissions.js and isAdmin() in
// firestore.rules both transparently treat a stored 'owner' as 'admin'.

import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';

const [, , email, fullName, username] = process.argv;
if (!email || !fullName) {
  console.error('Usage: node scripts/create-owner.js <email> "<full name>" [username]');
  process.exit(1);
}

const serviceAccount = JSON.parse(readFileSync('./service-account.json', 'utf8'));
initializeApp({ credential: cert(serviceAccount) });

const tempPassword = Math.random().toString(36).slice(2, 10) + 'A1!';
const auth = getAuth();
const db = getFirestore();

const userRecord = await auth.createUser({ email, password: tempPassword, displayName: fullName });
await db.collection('users').doc(userRecord.uid).set({
  uid: userRecord.uid, email, fullName, role: 'admin', shopId: null, active: true,
  username: username ? username.trim().toLowerCase() : null,
  createdAt: Date.now(),
});

console.log(`Admin account created: ${email}`);
console.log(`Temporary password: ${tempPassword}`);
console.log('Sign in and change this password immediately.');
