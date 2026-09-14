import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { doc, setDoc, getDocs, collection } from 'firebase/firestore';
import { addCategory, deleteCategory } from './catalogActions';

let testEnv, adminDb;

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
    // "Manager Portal & Account Structure" spec: Categories are Admin-only
    // to write (a Manager can only read them, e.g. for the Inventory
    // Category filter) — this suite exercises addCategory/deleteCategory
    // as the Admin who is actually allowed to call them.
    await setDoc(doc(ctx.firestore(), 'users', 'admin1'), { role: 'admin' });
  });
  adminDb = testEnv.authenticatedContext('admin1').firestore();
});

describe('addCategory / deleteCategory', () => {
  it('adds a category', async () => {
    await addCategory(adminDb, 'Motorcycle Batteries');
    const snap = await getDocs(collection(adminDb, 'categories'));
    expect(snap.docs.map((d) => d.data().name)).toContain('Motorcycle Batteries');
  });

  it('rejects a duplicate (case-insensitive) category name', async () => {
    await addCategory(adminDb, 'Motorcycle Batteries');
    await expect(addCategory(adminDb, 'motorcycle batteries')).rejects.toThrow('already exists');
  });

  it('refuses to delete a category still referenced by an item', async () => {
    await addCategory(adminDb, 'Motorcycle Batteries');
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'items', 'item1'), {
        id: 'item1', shopId: 'shopA', category: 'Motorcycle Batteries',
      });
    });
    await expect(deleteCategory(adminDb, 'Motorcycle Batteries')).rejects.toThrow('still use it');
  });

  it('deletes a category with no items referencing it', async () => {
    await addCategory(adminDb, 'Motorcycle Batteries');
    await deleteCategory(adminDb, 'Motorcycle Batteries');
    const snap = await getDocs(collection(adminDb, 'categories'));
    expect(snap.docs.map((d) => d.data().name)).not.toContain('Motorcycle Batteries');
  });
});
