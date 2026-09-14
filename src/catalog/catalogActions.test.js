import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { doc, setDoc, getDocs, collection } from 'firebase/firestore';
import { addCategory, deleteCategory, renameCategory, addSupplier, deleteSupplier, renameSupplier } from './catalogActions';

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

  it('renames a category and re-points every item that referenced the old name', async () => {
    await addCategory(adminDb, 'Motorcycle Batteries');
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'items', 'item1'), {
        id: 'item1', shopId: 'shopA', category: 'Motorcycle Batteries',
      });
    });
    await renameCategory(adminDb, 'Motorcycle Batteries', 'Motorbike Batteries');

    const catSnap = await getDocs(collection(adminDb, 'categories'));
    expect(catSnap.docs.map((d) => d.data().name)).toContain('Motorbike Batteries');
    expect(catSnap.docs.map((d) => d.data().name)).not.toContain('Motorcycle Batteries');

    const itemSnap = await getDocs(collection(adminDb, 'items'));
    expect(itemSnap.docs[0].data().category).toBe('Motorbike Batteries');
  });

  it('refuses to rename a category to a name that already exists', async () => {
    await addCategory(adminDb, 'Motorcycle Batteries');
    await addCategory(adminDb, 'Car Batteries');
    await expect(renameCategory(adminDb, 'Motorcycle Batteries', 'Car Batteries')).rejects.toThrow('already exists');
  });
});

describe('addSupplier / deleteSupplier', () => {
  // Items reference a supplier by id inside `supplierIds` (an array), not
  // by name the way categories/locations do — this in-use check needs its
  // own coverage since it can't share deleteCategory's assertions.
  it('refuses to delete a supplier still referenced by an item', async () => {
    const supplierId = await addSupplier(adminDb, { name: 'PowerCell Supply Co.' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'items', 'item1'), {
        id: 'item1', shopId: 'shopA', supplierIds: [supplierId],
      });
    });
    await expect(deleteSupplier(adminDb, supplierId)).rejects.toThrow('still in use');
  });

  it('deletes a supplier with no items referencing it', async () => {
    const supplierId = await addSupplier(adminDb, { name: 'PowerCell Supply Co.' });
    await deleteSupplier(adminDb, supplierId);
    const snap = await getDocs(collection(adminDb, 'suppliers'));
    expect(snap.docs.map((d) => d.id)).not.toContain(supplierId);
  });

  it('renames a supplier in place (items reference it by id, so nothing else needs to change)', async () => {
    const supplierId = await addSupplier(adminDb, { name: 'PowerCell Supply Co.' });
    await renameSupplier(adminDb, supplierId, 'PowerCell Supply Corp.');
    const snap = await getDocs(collection(adminDb, 'suppliers'));
    const row = snap.docs.find((d) => d.id === supplierId);
    expect(row.data().name).toBe('PowerCell Supply Corp.');
  });
});
