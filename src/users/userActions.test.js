import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { doc, getDoc, setDoc } from 'firebase/firestore';

// userActions.js imports { auth, db, firebaseConfig } from '../firebase' at
// module scope for its non-test callers (createUser/completeFirstLogin/
// setOwnUsername use those directly, not a passed-in `db`). That file calls
// `getAuth(app)` eagerly on import using import.meta.env.VITE_FIREBASE_*,
// which are never set in the test process (no .env here) — so importing
// userActions.js unmocked throws `auth/invalid-api-key` before a single
// test in this file even registers. The tests below only ever exercise
// updateUserRole/updateUserShop/setUserActive, which all take an explicit
// `db` argument (ownerDb, from the rules-unit-testing emulator) and never
// touch the real firebase.js exports — so a bare stand-in is enough.
vi.mock('../firebase', () => ({ auth: {}, db: {}, firebaseConfig: {} }));

let testEnv, ownerDb;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'motolite-ims-test',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});
afterAll(async () => testEnv.cleanup());
beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'users', 'owner1'), { role: 'owner', shopId: null });
  });
  ownerDb = testEnv.authenticatedContext('owner1').firestore();
});

// userActions.js's Firestore-doc-writing functions take a Firestore
// instance as their first argument, same pattern as shopActions.js —
// makes them testable against the emulator here without touching the
// real Firebase Auth REST API (that part of createUser is exercised
// separately, manually, since the rules-unit-testing emulator project
// doesn't have a live Auth emulator wired to it in this test file).
import { updateUserRole, updateUserShop, setUserActive } from './userActions';

describe('userActions (Firestore doc updates)', () => {
  it('updates a user\'s role', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', 'staffA'), { role: 'manager', shopId: 'shopA' });
    });
    await updateUserRole(ownerDb, 'staffA', 'warehouse');
    const snap = await getDoc(doc(ownerDb, 'users', 'staffA'));
    expect(snap.data().role).toBe('warehouse');
  });

  it('reassigns a user\'s shop', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', 'staffA'), { role: 'manager', shopId: 'shopA' });
    });
    await updateUserShop(ownerDb, 'staffA', 'shopB');
    const snap = await getDoc(doc(ownerDb, 'users', 'staffA'));
    expect(snap.data().shopId).toBe('shopB');
  });

  it('deactivates and reactivates a user', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', 'staffA'), { role: 'manager', shopId: 'shopA', active: true });
    });
    await setUserActive(ownerDb, 'staffA', false);
    expect((await getDoc(doc(ownerDb, 'users', 'staffA'))).data().active).toBe(false);
    await setUserActive(ownerDb, 'staffA', true);
    expect((await getDoc(doc(ownerDb, 'users', 'staffA'))).data().active).toBe(true);
  });
});
