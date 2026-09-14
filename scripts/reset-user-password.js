// Resets a single Manager/Warehouse user's password and prints a new
// one-time password for them to sign in with.
//
// WHY THIS IS A SCRIPT, NOT AN IN-APP BUTTON: Firebase Auth's client SDK
// (what the whole rest of this app runs on — see src/lib/credentials.js's
// "no Cloud Functions" note) only ever lets a signed-in user change THEIR
// OWN password. There is no client-side call an Admin can make to change
// someone else's password — that requires the Admin SDK, i.e. a service
// account, i.e. this script (or a Cloud Function, which this project
// deliberately doesn't have). This is the same reason account CREATION
// bootstraps the very first Admin via scripts/create-owner.js instead of
// an in-app form.
//
// Uses the same service-account.json as scripts/create-owner.js (Firebase
// Console -> Project Settings -> Service Accounts -> Generate new private
// key), saved locally as service-account.json (already gitignored).
//
// Usage: node scripts/reset-user-password.js <username>
// The user's Firestore doc is flagged mustChangePassword: true, exactly
// like a freshly-created account — they'll be asked to set their own
// password the moment they sign in with the OTP this prints.

import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';
import { generateOtp } from '../src/lib/credentials.js';

const [, , usernameArg] = process.argv;
if (!usernameArg) {
  console.error('Usage: node scripts/reset-user-password.js <username>');
  process.exit(1);
}
const username = usernameArg.trim().toLowerCase();

const serviceAccount = JSON.parse(readFileSync('./service-account.json', 'utf8'));
initializeApp({ credential: cert(serviceAccount) });
const auth = getAuth();
const db = getFirestore();

async function main() {
  const snap = await db.collection('users').where('username', '==', username).limit(1).get();
  if (snap.empty) {
    console.error(`No user found with username "${username}".`);
    process.exit(1);
  }
  const userDoc = snap.docs[0];
  const { uid, role, fullName } = userDoc.data();
  if (role === 'owner' || role === 'admin') {
    console.error('Refusing to reset the Admin account\'s password here — Admin still signs in with a real email, so use Firebase Console / the normal "forgot password" flow for that account instead.');
    process.exit(1);
  }

  const otp = generateOtp();
  await auth.updateUser(uid, { password: otp });
  await userDoc.ref.set({ mustChangePassword: true }, { merge: true });

  console.log(`Password reset for ${fullName || username} (${role}).`);
  console.log(`Username: ${username}`);
  console.log(`New one-time password: ${otp}`);
  console.log('Share this with them now — it will not be shown again. They\'ll be asked to set their own password on next sign-in.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
