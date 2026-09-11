import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { doc, getDoc, setDoc } from 'firebase/firestore';

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
      await setDoc(doc(ctx.firestore(), 'users', 'cash1'), { role: 'cashier', shopId: 'shopA' });
    });
    await updateUserRole(ownerDb, 'cash1', 'manager');
    const snap = await getDoc(doc(ownerDb, 'users', 'cash1'));
    expect(snap.data().role).toBe('manager');
  });

  it('reassigns a user\'s shop', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', 'cash1'), { role: 'cashier', shopId: 'shopA' });
    });
    await updateUserShop(ownerDb, 'cash1', 'shopB');
    const snap = await getDoc(doc(ownerDb, 'users', 'cash1'));
    expect(snap.data().shopId).toBe('shopB');
  });

  it('deactivates and reactivates a user', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', 'cash1'), { role: 'cashier', shopId: 'shopA', active: true });
    });
    await setUserActive(ownerDb, 'cash1', false);
    expect((await getDoc(doc(ownerDb, 'users', 'cash1'))).data().active).toBe(false);
    await setUserActive(ownerDb, 'cash1', true);
    expect((await getDoc(doc(ownerDb, 'users', 'cash1'))).data().active).toBe(true);
  });
});
