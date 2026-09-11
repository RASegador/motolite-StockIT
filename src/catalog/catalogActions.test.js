import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { doc, setDoc, getDocs, collection } from 'firebase/firestore';
import { addCategory, deleteCategory } from './catalogActions';

let testEnv, mgrDb;

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
    await setDoc(doc(ctx.firestore(), 'users', 'mgrA'), { role: 'manager', shopId: 'shopA' });
  });
  mgrDb = testEnv.authenticatedContext('mgrA').firestore();
});

describe('addCategory / deleteCategory', () => {
  it('adds a category', async () => {
    await addCategory(mgrDb, 'Motorcycle Batteries');
    const snap = await getDocs(collection(mgrDb, 'categories'));
    expect(snap.docs.map((d) => d.data().name)).toContain('Motorcycle Batteries');
  });

  it('rejects a duplicate (case-insensitive) category name', async () => {
    await addCategory(mgrDb, 'Motorcycle Batteries');
    await expect(addCategory(mgrDb, 'motorcycle batteries')).rejects.toThrow('already exists');
  });

  it('refuses to delete a category still referenced by an item', async () => {
    await addCategory(mgrDb, 'Motorcycle Batteries');
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'items', 'item1'), {
        id: 'item1', shopId: 'shopA', category: 'Motorcycle Batteries',
      });
    });
    await expect(deleteCategory(mgrDb, 'Motorcycle Batteries')).rejects.toThrow('still use it');
  });

  it('deletes a category with no items referencing it', async () => {
    await addCategory(mgrDb, 'Motorcycle Batteries');
    await deleteCategory(mgrDb, 'Motorcycle Batteries');
    const snap = await getDocs(collection(mgrDb, 'categories'));
    expect(snap.docs.map((d) => d.data().name)).not.toContain('Motorcycle Batteries');
  });
});
