// One-time script to bootstrap the first Owner/Admin account. Run this
// once after setting up your Firebase project, using a service account
// key (Firebase Console -> Project Settings -> Service Accounts ->
// Generate new private key), saved locally as service-account.json
// (already gitignored).
//
// Usage: node scripts/create-owner.js owner@example.com "Owner Name"
// It will print a temporary password — change it on first login.

import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';

const [, , email, fullName] = process.argv;
if (!email || !fullName) {
  console.error('Usage: node scripts/create-owner.js <email> "<full name>"');
  process.exit(1);
}

const serviceAccount = JSON.parse(readFileSync('./service-account.json', 'utf8'));
initializeApp({ credential: cert(serviceAccount) });

const tempPassword = Math.random().toString(36).slice(2, 10) + 'A1!';
const auth = getAuth();
const db = getFirestore();

const userRecord = await auth.createUser({ email, password: tempPassword, displayName: fullName });
await db.collection('users').doc(userRecord.uid).set({
  uid: userRecord.uid, email, fullName, role: 'owner', shopId: null, active: true,
  createdAt: Date.now(),
});

console.log(`Owner account created: ${email}`);
console.log(`Temporary password: ${tempPassword}`);
console.log('Sign in and change this password immediately.');
