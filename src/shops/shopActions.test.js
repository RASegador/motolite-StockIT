import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore';

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

// shopActions.js takes a Firestore instance as its first argument so it
// can be pointed at the emulator-backed db under test, or at the real
// `db` export from src/firebase.js at runtime.
import { createShop, renameShop, deleteShop } from './shopActions';

describe('shopActions', () => {
  it('creates a shop with a generated id and the given name', async () => {
    const shopId = await createShop(ownerDb, 'Branch A');
    const snap = await getDoc(doc(ownerDb, 'shops', shopId));
    expect(snap.data()).toMatchObject({ id: shopId, name: 'Branch A' });
  });

  it('renames an existing shop', async () => {
    const shopId = await createShop(ownerDb, 'Branch A');
    await renameShop(ownerDb, shopId, 'Branch A - Renamed');
    const snap = await getDoc(doc(ownerDb, 'shops', shopId));
    expect(snap.data().name).toBe('Branch A - Renamed');
  });

  it('deletes a shop', async () => {
    const shopId = await createShop(ownerDb, 'Branch A');
    await deleteShop(ownerDb, shopId);
    const snap = await getDoc(doc(ownerDb, 'shops', shopId));
    expect(snap.exists()).toBe(false);
  });

  it('trims whitespace and rejects an empty name', async () => {
    await expect(createShop(ownerDb, '   ')).rejects.toThrow('Shop name is required');
  });
});
